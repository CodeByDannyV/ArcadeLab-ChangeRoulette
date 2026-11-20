const octet = /^(0|[1-9][0-9]{0,2})$/

function ipv4(address) {
  const parts = typeof address === 'string' ? address.split('.') : []
  if (parts.length !== 4 || parts.some(part => !octet.test(part) || Number(part) > 255)) {
    throw new Error(`Invalid IPv4 address: ${address}`)
  }
  return parts.reduce((value, part) => value * 256 + Number(part), 0)
}

function network(cidr) {
  const match = typeof cidr === 'string' && /^([^/]+)\/(0|[1-9][0-9]?)$/.exec(cidr)
  if (!match || Number(match[2]) > 32) throw new Error(`Invalid IPv4 CIDR: ${cidr}`)
  const start = ipv4(match[1])
  const size = 2 ** (32 - Number(match[2]))
  if (start % size) throw new Error(`CIDR must start at its network address: ${cidr}`)
  return { start, end: start + size }
}

function matches({ start, end }, address) {
  return start <= address && address < end
}

export function contains(cidr, address) {
  return matches(network(cidr), ipv4(address))
}

function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function checkUniqueIds(entries, label) {
  if (!Array.isArray(entries) || !entries.length || entries.some(entry => !nonblank(entry?.id))) {
    throw new Error(`Missing ${label} or identifier`)
  }
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new Error(`${label} identifiers must be unique`)
  }
}

function traceNetwork(model, branch, phase) {
  const state = model[phase]
  if (model.kind === 'route') {
    const matches = state.filter(r => r.branch === branch.id && contains(r.cidr, model.target))
    matches.sort((a, b) => Number(b.cidr.split('/')[1]) - Number(a.cidr.split('/')[1]))
    const route = matches[0]
    if (!route) return { path: null, reason: `No route matches ${model.target}.` }
    const reachable = route.path === 'primary' || model.standby[branch.id]
    const path = `${route.cidr} via ${route.path}`
    return { path: reachable ? path : null, route, reason: `${path} is the longest match for ${model.target}. This path ${reachable ? 'reaches' : 'cannot reach'} the service from ${branch.name}.` }
  }
  if (model.kind === 'pzen') {
    const source = state.sources[branch.id]
    const candidates = state.rules.filter(rule => contains(rule.source, source))
    const match = candidates.find(rule => rule.host === model.target)
    if (match) return { path: match.id, reason: `The PZEN sees ${source}. Rule ${match.id} permits ${match.source} to request ${match.host}.` }
    const why = candidates.length ? `The matching source rule permits ${candidates.map(r => r.host).join(', ')}.` : 'No permitted source CIDR matches.'
    return { path: null, reason: `The PZEN sees ${source} requesting ${model.target}. ${why} The proxy denies this request.` }
  }
  if (model.kind !== 'pac') throw new Error('Unknown network change type')
  const assigned = model.assigned.includes(branch.id)
  const file = phase === 'after' && assigned ? state : model.before
  const match = file.find(rule => model.target === rule.value ||
    (rule.match === 'domain' && model.target.endsWith('.' + rule.value)))
  if (!match) return { path: 'PROXY ' + model.proxy, reason: `The ${phase === 'after' && assigned ? 'updated' : 'current'} PAC file has no bypass for ${model.target}. The request reaches the site via PROXY ${model.proxy}.` }
  const direct = model.direct[branch.id]
  return { path: direct ? 'DIRECT' : null, reason: `The ${match.match} bypass for ${match.value} selects DIRECT. The private route from ${branch.name} ${direct ? 'reaches' : 'cannot reach'} ${model.target}.` }
}

export function evaluate(round) {
  if (![round?.title, round?.ticket, round?.destination, round?.hint].every(nonblank) || round.port !== 443) {
    throw new Error('Missing round text or unsupported destination port')
  }
  checkUniqueIds(round.branches, 'Branch')
  if (round.network) {
    return round.branches.map(branch => {
      const before = traceNetwork(round.network, branch, 'before')
      const after = traceNetwork(round.network, branch, 'after')
      if (!before.path) throw new Error('Missing baseline path for ' + branch.name)
      return { ...branch, before: before.path, after: after.path, beforeReason: before.reason,
        afterReason: after.reason, selectedRoute: after.route, meetsIntent: Boolean(after.path) === branch.intendedAccess }
    })
  }
  checkUniqueIds(round.rules, 'Rule')

  const rules = round.rules.map(rule => {
    if (typeof rule.remove !== 'boolean') throw new Error(`Missing change action: ${rule.id}`)
    return { ...rule, ...network(rule.source) }
  })

  return round.branches.map(branch => {
    if (!nonblank(branch.name)) throw new Error('Missing branch name')
    if (typeof branch.intendedAccess !== 'boolean') throw new Error(`Missing access intent for ${branch.name}`)
    const address = ipv4(branch.ip)
    const matching = rules.filter(rule => matches(rule, address))
    if (!matching.length) throw new Error(`No baseline allow rule for ${branch.name}`)
    const postAddress = branch.afterIp === undefined ? address : ipv4(branch.afterIp)
    const after = rules.find(rule => !rule.remove && matches(rule, postAddress))?.id ?? null
    return { ...branch, before: matching[0].id, after, meetsIntent: (after !== null) === branch.intendedAccess }
  })
}
