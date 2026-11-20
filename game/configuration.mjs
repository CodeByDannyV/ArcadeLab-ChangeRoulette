// The configuration previews and packet traces use the same scenario snapshots.
const quoted = value => JSON.stringify(value)
const pair = (key, value) => quoted(key) + ' = ' + quoted(value)
const asBlock = lines => lines.join('\n')
const phaseSources = (ticket, phase) => Object.fromEntries(ticket.branches.map(b => [
  b.id, phase === 'after' && b.afterIp ? b.afterIp : b.ip,
]))

function firewallHcl(ticket, phase) {
  const rules = ticket.rules.filter(rule => phase === 'before' || !rule.remove)
  return asBlock([
    'variable "security_group_id" { type = string }', '',
    'locals {', '  # Sources observed at the service',
    '  observed_sources = {',
    ...Object.entries(phaseSources(ticket, phase)).map(([site, ip]) => '    ' + pair(site, ip)),
    '  }', '  allows = {', ...rules.map(r => '    ' + pair(r.id, r.source)), '  }', '}', '',
    'resource "aws_vpc_security_group_ingress_rule" "https" {',
    '  for_each          = local.allows', '  security_group_id = var.security_group_id',
    '  ip_protocol       = "tcp"', '  from_port         = 443', '  to_port           = 443',
    '  cidr_ipv4         = each.value', '}',
  ])
}

function routeHcl(state) {
  return asBlock([
    'variable "route_table_ids" { type = map(string) }',
    'variable "transit_gateway_ids" { type = map(string) }', '',
    'locals {', '  routes = {', ...state.map(r =>
      '    ' + quoted(r.branch + '/' + r.cidr) + ' = { site = ' + quoted(r.branch) + ', cidr = ' + quoted(r.cidr) + ', path = ' + quoted(r.path) + ' }'),
    '  }', '}', '', 'resource "aws_route" "service" {', '  for_each = local.routes',
    '  route_table_id         = var.route_table_ids[each.value.site]',
    '  destination_cidr_block = each.value.cidr',
    '  transit_gateway_id     = var.transit_gateway_ids[each.value.path]', '}',
  ])
}

function pzenHcl(state) {
  return asBlock([
    'terraform {', '  required_providers {', '    zia = { source = "zscaler/zia" }', '  }', '}', '',
    'variable "source_group_ids" { type = map(number) }',
    'variable "url_category_ids" { type = map(string) }',
    'variable "lab_location_id" { type = number }', '',
    'locals {', '  # Source IPs observed at the PZEN',
    ...Object.entries(state.sources).map(([site, ip]) => '  # ' + site + ' = ' + ip),
    '  permits = {', ...state.rules.map((r, i) =>
      '    ' + quoted(r.id) + ' = { cidr = ' + quoted(r.source) + ', host = ' + quoted(r.host) + ', order = ' + (i + 1) + ' }'),
    '  }', '}', '', 'resource "zia_url_filtering_rules" "site_access" {',
    '  for_each = local.permits', '  name     = each.key', '  order    = each.value.order',
    '  state    = "ENABLED"', '  action   = "ALLOW"', '  protocols = ["HTTPS_RULE"]',
    '  url_categories = [var.url_category_ids[each.value.host]]',
    '  source_ip_groups { id = [var.source_group_ids[each.value.cidr]] }',
    '  locations { id = [var.lab_location_id] }', '}',
  ])
}

export function pacFile(model, phase) {
  const tests = model[phase].map(rule => {
    let condition = 'host === ' + quoted(rule.value)
    if (rule.match === 'domain') condition += ' || dnsDomainIs(host, ' + quoted('.' + rule.value) + ')'
    return '  if (' + condition + ') return "DIRECT";'
  })
  return asBlock(['function FindProxyForURL(url, host) {', '  host = host.toLowerCase();',
    ...tests, '  return ' + quoted('PROXY ' + model.proxy) + ';', '}'])
}

export function configPreview(ticket, phase) {
  const m = ticket.network
  if (!m) return firewallHcl(ticket, phase)
  if (m.kind === 'route') return routeHcl(m[phase])
  if (m.kind === 'pzen') return pzenHcl(m[phase])
  return asBlock(['resource "local_file" "workstation_pac" {', '  filename = "${path.module}/proxy.pac"',
    '  content  = <<-PAC', ...pacFile(m, phase).split('\n').map(line => '    ' + line), '  PAC', '}'])
}

function changedRows(before, after, describe) {
  const left = before.map(describe), right = after.map(describe)
  return [...left.filter(text => !right.includes(text)).map(text => 'Remove ' + text),
    ...right.filter(text => !left.includes(text)).map(text => 'Add ' + text)]
}

export function policyEvidence(ticket) {
  const m = ticket.network
  if (!m) return {
    component: 'Firewall', detail: 'IPv4 allowlist',
    model: 'Each fresh HTTPS connection uses the source shown below. Unmatched traffic is denied.',
    headings: ['Source allowlist', 'Subnet (CIDR)', 'Action'],
    rows: ticket.rules.map(r => [r.id, r.source, r.remove ? 'Remove' : 'Keep']),
    configNote: 'Terraform example for an AWS security group. The rule map controls HTTPS ingress. Observed source addresses are lab inputs.',
  }
  if (m.kind === 'route') return {
    component: 'Route table', detail: 'Longest prefix match',
    model: 'Each branch uses its own table to reach ' + m.target + '. Each current table sends 198.51.100.0/24 to primary and uses standby for its default route. The longest matching prefix wins. Both primary gateways reach the service.',
    changes: changedRows(m.before, m.after, route => {
      const site = ticket.branches.find(branch => branch.id === route.branch)
      return `${site.name} route ${route.cidr} via ${route.path}.`
    }),
    headings: ['Branch', 'Primary gateway', 'Standby gateway'],
    rows: ticket.branches.map(b => [b.name, 'Service reachable', m.standby[b.id] ? 'Service reachable' : 'No service path']),
    configNote: 'Terraform example for AWS route tables. The site and path variables resolve to existing route table and transit gateway IDs. Compare destination prefixes per branch.',
  }
  if (m.kind === 'pzen') return {
    component: 'On-prem PZEN', detail: 'Explicit forward proxy',
    model: 'Both branches use the on-premises Zscaler Private Service Edge for HTTPS. In this lab the proxy permits a request when a rule matches both the observed source IP and the exact destination hostname. All other requests are denied.',
    changes: changedRows(m.before.rules, m.after.rules, r => `permit ${r.id} for ${r.source} → ${r.host}.`),
    headings: ['Branch', 'Current source at PZEN', 'Proposed source at PZEN'],
    rows: ticket.branches.map(b => [b.name, m.before.sources[b.id], m.after.sources[b.id]]),
    permits: m.after.rules.map(r => `${r.id} permits ${r.source} → ${r.host}.`),
    configNote: 'ZIA provider example for an isolated lab location. Each source-group ID maps to the stated CIDR and each custom URL category contains the named host. The existing lower-priority lab policy blocks other requests. The observed IPs are traffic evidence.',
  }
  return {
    component: 'Workstation PAC', detail: 'DIRECT or PROXY',
    model: 'A managed browser evaluates its local PAC file for ' + m.target + '. DIRECT needs a working private route from the site. The PZEN proxy can reach the application from both branches. DNS and TLS work on the available paths.',
    changes: changedRows(m.before, m.after, r => `${r.match === 'domain' ? 'domain and subdomain' : 'exact hostname'} bypass for ${r.value}.`),
    headings: ['Branch', 'PAC rollout', 'Private direct path'],
    rows: ticket.branches.map(b => [b.name, m.assigned.includes(b.id) ? 'Receives new file' : 'Keeps current file', m.direct[b.id] ? 'Reachable' : 'No service path']),
    configNote: 'Terraform’s local_file resource renders proxy.pac on the machine running Terraform. The ticket identifies the workstations that receive the rendered file through endpoint management.',
  }
}
