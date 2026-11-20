// Fixed lab facts describe connectivity outside the component under change.
export const ticketTypes = {
  firewall: 'Firewall allowlist',
  route: 'Routing',
  pzen: 'Zscaler PZEN',
  pac: 'Endpoint PAC',
}

function routeChange(branches, site, withdraw) {
  const target = `198.51.100.${20 + site}`
  const before = [], after = [], standby = {}, updated = []
  for (const [i, branch] of branches.entries()) {
    standby[branch.id] = (site + i) % 3 === 1
    const fallback = { branch: branch.id, cidr: '0.0.0.0/0', path: 'standby' }
    const primary = { branch: branch.id, cidr: '198.51.100.0/24', path: 'primary' }
    before.push(fallback, primary)
    const changed = site % 3 === 2 || i === site % 2
    if (changed) updated.push(branch.name)
    after.push(fallback)
    if (!withdraw || !changed) after.push(primary)
    if (!withdraw && changed) after.push({ branch: branch.id, cidr: target + '/32', path: 'standby' })
  }
  return {
    kind: 'route', target, before, after, standby,
    family: withdraw ? 'Withdraw a service route' : 'Add a host route',
    ticket: withdraw
      ? `Withdraw the 198.51.100.0/24 route at ${updated.join(' and ')}. Both branches still need HTTPS access to ${target}.`
      : `Add a host route at ${updated.join(' and ')} to send ${target} through standby. Both branches must stay connected.`,
    hint: 'Find the longest matching destination prefix in each branch table. Then check whether that branch’s selected path reaches the service.',
  }
}

function proxyChange(branches, site, target) {
  const sources = Object.fromEntries(branches.map(b => [b.id, b.ip]))
  const rules = branches.map(b => ({ id: b.id + '-web', source: b.ip.replace(/\.\d+$/, '.0/24'), host: target }))
  const before = { sources, rules }
  const after = { sources: { ...sources }, rules: rules.map(rule => ({ ...rule })) }
  const index = site % 2
  const branch = branches[index]
  const rule = after.rules[index]
  const variant = site % 4
  let change
  if (variant === 0) {
    after.rules.splice(index, 1)
    change = `Retire the ${branch.name} source rule from the on-premises forward proxy.`
  } else if (variant === 2) {
    rule.host = 'status.svc.example'
    change = `Scope the ${branch.name} source rule to the status site during a URL-policy cleanup.`
  } else {
    const address = `192.0.2.${20 + site}`
    after.sources[branch.id] = address
    if (variant === 3) rule.source = address + '/32'
    change = `${branch.name} will use a new NAT source when it reaches the on-premises proxy. Review the proposed source policy.`
  }
  return {
    kind: 'pzen', target, before, after, family: 'Private Service Edge access',
    ticket: `${change} Forecast access to ${target} through the Zscaler Private Service Edge (PZEN).`,
    hint: 'For each site, use the source address the PZEN sees. A permit must match that source CIDR and the requested hostname together.',
  }
}

function pacChange(branches, site, target) {
  const before = [{ match: 'exact', value: 'intranet.svc.example' }]
  const addition = site % 3 === 1 ? { match: 'domain', value: 'svc.example' }
    : { match: 'exact', value: site % 3 === 2 ? 'status.svc.example' : target }
  const assigned = branches.filter((_, i) => site % 2 === 0 || i === 1).map(b => b.id)
  const direct = Object.fromEntries(branches.map((b, i) => [b.id, (site + i) % 3 === 1]))
  return {
    kind: 'pac', target, before, after: [...before, addition], assigned, direct, proxy: 'pzen.lab.example:8080',
    family: 'Local PAC bypass',
    ticket: `Roll out a new ${addition.match === 'domain' ? 'domain' : 'host'} bypass in the local proxy.pac on ${branches.filter(b => assigned.includes(b.id)).map(b => b.name).join(' and ')} workstations. Forecast access to ${target}.`,
    hint: 'Check which machines receive the file and whether the hostname matches its bypass rule. DIRECT then depends on that branch’s private route. Other requests use the working proxy.',
  }
}

export function makeNetworkCase(base, pattern, site) {
  if (pattern < 6) return base
  const group = base.title.split(' · ')[0]
  const hostname = group.toLowerCase() + '.svc.example'
  const branches = base.branches.map(({ id, name, ip }) => ({ id, name, ip, intendedAccess: true }))
  const network = pattern < 8 ? routeChange(branches, site, pattern === 7)
    : pattern === 8 ? proxyChange(branches, site, hostname) : pacChange(branches, site, hostname)
  const { family, ticket, hint, ...model } = network
  return { id: base.id, title: group + ' · ' + family, family, ticket, hint, branches,
    destination: base.destination, port: base.port, readiness: base.readiness, network: model }
}
