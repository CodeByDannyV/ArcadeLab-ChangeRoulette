import { contains } from './policy.mjs'
import { assessRisk, riskBands } from './assessment.mjs'
import { catalog, firewallCatalog } from './catalog.mjs'

const ticketNumber = ticket => Number(ticket.id.slice(3))
export const boardChoices = ['Approve', 'Stage', 'Hold']

export function packetHops(ticket, branch) {
  const m = ticket.network
  const source = branch.afterIp || branch.ip
  const hops = [['Workstation', branch.name + ' opens HTTPS to ' + (m?.target || ticket.destination) + ' from ' + source + '.']]
  if (!m) {
    hops.push(['Firewall', branch.after ? 'Source ' + source + ' matches ' + branch.after + '.' : 'No surviving permit covers ' + source + '. Default deny stops the connection.'])
  } else if (m.kind === 'route') {
    hops.push(['Route lookup', branch.afterReason.split('. This path')[0] + '.'])
    hops.push(['Gateway', branch.after ? 'The selected gateway has a working service path.' : 'The selected gateway has no service path. Forwarding stops here.'])
  } else if (m.kind === 'pzen') {
    hops.push(['Forward proxy', 'The on-premises PZEN observes source ' + m.after.sources[branch.id] + '.'])
    hops.push(['URL policy', branch.afterReason])
  } else {
    const proxied = branch.after?.startsWith('PROXY')
    hops.push(['Local PAC', (m.assigned.includes(branch.id) ? 'Updated' : 'Existing') + ' proxy.pac selects ' + (proxied ? 'PROXY ' + m.proxy : 'DIRECT') + '.'])
    hops.push([proxied ? 'Forward proxy' : 'Private route', branch.afterReason])
  }
  if (branch.after) hops.push(['Service reached', ticket.destination + ' accepts the HTTPS connection.'])
  return hops
}

export function decisionBrief(ticket, rows) {
  const n = ticketNumber(ticket)
  const { workflow, recovery, tolerance } = ticket.readiness
  const split = ['route', 'pac'].includes(ticket.network?.kind)
  const users = rows.map((b, i) => ({ site: b.name, count: b.intendedAccess ? 10 + (n * 13 + i * 47) % 160 : 0 }))
  const exposed = rows.reduce((total, b, i) => total + (b.after === null ? users[i].count : 0), 0)
  const good = rows.filter(b => b.meetsIntent)
  const model = ticket.network
  const scoped = rows.filter(b => {
    if (model?.kind === 'pac') return model.assigned.includes(b.id)
    if (model?.kind !== 'route') return true
    const routes = phase => model[phase].filter(r => r.branch === b.id).map(r => r.cidr + r.path).sort().join('|')
    return routes('before') !== routes('after')
  })
  const pilot = scoped.find(b => b.meetsIntent)
  const late = recovery > tolerance
  let action = 'Hold'
  let reason = 'Correct the access mismatch before changing this shared policy.'
  if (good.length === rows.length && !late) {
    action = 'Approve'
    reason = 'Both site outcomes meet intent and estimated recovery fits the service deadline.'
  } else if (split && pilot) {
    action = 'Stage'
    reason = 'Pilot at ' + pilot.name + ' first. Verify service and rollback before extending the change.'
  } else if (split && !pilot) {
    reason = 'No in-scope pilot site meets intent. Repair the proposed path first.'
  } else if (!good.length) {
    reason = 'Neither site meets its intended access. Revise the proposal before rollout.'
  } else if (late && good.length === rows.length) {
    reason = 'Recovery exceeds the service deadline and this policy must roll out together.'
  }
  return { users, exposed, action, reason, split,
    context: workflow + '. Active users: ' + users.map(u => u.site + ' ' + u.count).join(' · ') +
      '. Recovery deadline ' + tolerance + ' min. Estimated recovery ' + recovery + ' min. ' +
      (split ? 'Pilot scope: ' + scoped.map(b => b.name).join(', ') + '.' : 'Both sites share one rollout.') }
}

export function evidenceQuestion(ticket, rows) {
  const n = ticketNumber(ticket)
  const b = rows.find(r => !r.meetsIntent) || rows[n % rows.length]
  const m = ticket.network
  let choices, answer
  if (!m) {
    const src = b.afterIp || b.ip
    const rule = ticket.rules.find(r => r.id === b.after) || ticket.rules.find(r => r.id === b.before)
    choices = [
      `The proposed allowlist permits ${src} under ${rule.id} (${rule.source}).`,
      `The proposed allowlist has no surviving prefix that covers ${src}.`,
      `The established pre-change connection grants this fresh request access from ${src}.`,
    ]
    answer = b.after ? 0 : 1
  } else if (m.kind === 'route') {
    const r = b.selectedRoute
    choices = [
      `${r.cidr} is the longest match. Its ${r.path} gateway reaches ${m.target}.`,
      `${r.cidr} is the longest match. Its ${r.path} gateway has no path to ${m.target}.`,
      `The proposed table has no destination prefix matching ${m.target}.`,
    ]
    answer = b.after ? 0 : 1
  } else if (m.kind === 'pzen') {
    const ip = m.after.sources[b.id]
    choices = [
      `A permit matches both ${ip} and ${m.target}.`,
      `A permit covers ${ip}, but its allowed site differs from ${m.target}.`,
      `The source ${ip} falls outside every permitted group for this proxy.`,
    ]
    answer = b.after ? 0 : m.after.rules.some(r => contains(r.source, ip)) ? 1 : 2
  } else {
    choices = [
      `The effective PAC sends ${m.target} through the working forward proxy.`,
      `The effective PAC returns DIRECT and the site's private path reaches ${m.target}.`,
      `The effective PAC returns DIRECT and the site lacks a private path to ${m.target}.`,
    ]
    answer = !b.after ? 2 : b.after === 'DIRECT' ? 1 : 0
  }
  const decisive = choices[answer]
  const options = choices.map((label,i) => ({ id: i === answer ? 'path' : 'alternate-' + i, label }))
  const offset = n % options.length
  return { site: b.name, options: options.slice(offset).concat(options.slice(0, offset)), correct: 'path', decisive }
}

export function forecastSkill(ticket) {
  const model = ticket.network
  if (model?.kind === 'pac') return model.after.some(r => r.match === 'domain') ? 'PAC domain bypass' : 'PAC hostname bypass'
  if (model?.kind === 'pzen') {
    if (Object.keys(model.after.sources).some(b => model.after.sources[b] !== model.before.sources[b])) return 'Proxy source changes'
    return model.after.rules.length === model.before.rules.length ? 'Proxy hostname restrictions' : 'Proxy permit withdrawal'
  }
  return ticket.family
}

export function botForecast(ticket, rows) {
  const n = ticketNumber(ticket), m = ticket.network
  const risk = assessRisk(ticket.readiness).band
  const actual = rows.filter(b => !b.after).map(b => b.id)
  if (n % 4 === 1) return { lost: actual, risk, reasoning: 'I traced each proposed path and checked recovery against the service deadline.' }
  let lost, reasoning
  if (!m) {
    lost = rows.filter(b => ticket.rules.some(r => r.remove && contains(r.source,b.ip))).map(b => b.id)
    reasoning = 'I counted endpoints covered by a withdrawn permit.'
  } else if (m.kind === 'route') {
    lost = []
    reasoning = 'Both sites reached the service before the edit. I expect the remaining routes to carry them.'
  } else if (m.kind === 'pzen') {
    lost = rows.filter(b => !m.after.rules.some(r => contains(r.source, m.after.sources[b.id]))).map(b => b.id)
    reasoning = 'I checked whether each observed source IP has a matching permit.'
  } else {
    lost = []
    reasoning = 'The proxy is healthy. I expect both browsers to reach the service.'
  }
  return { lost, risk: n % 3 === 0 ? riskBands[ticket.readiness.rehearsal] : risk, reasoning }
}

export function arcadeVerdict(ticket, rows, entry, picks) {
  const bot = botForecast(ticket, rows)
  const same = bot.lost.length === entry.actual.length && bot.lost.every(id => entry.actual.includes(id))
  const botPoints = (same ? 60 : 0) + (bot.risk === entry.actualRisk ? 40 : 0)
  const playerPoints = (entry.impactCorrect ? 60 : 0) + (entry.riskCorrect ? 40 : 0)
  const board = decisionBrief(ticket, rows)
  const stamps = []
  if (!entry.assisted) {
    if (playerPoints > botPoints) stamps.push('Outread the Bot')
    if (entry.impactCorrect && !entry.actual.length) stamps.push('Both Sites Survived')
    if (entry.impactCorrect && ticket.network?.kind === 'route' && rows.some(b => b.afterReason.includes('/32 via'))) stamps.push('Longest Prefix Wins')
    if (entry.impactCorrect && ticket.network?.kind === 'pac' && rows.some(b => !b.after?.startsWith('PROXY'))) stamps.push('The Proxy Never Saw It')
    if (picks.board === board.action && picks.evidence === 'path') stamps.push('Change Chair')
  }
  return { ...picks, bot, botPoints, playerPoints, stamps,
    chips: picks.wager && entry.impactCorrect && !entry.assisted ? 25 : 0,
    evidenceCorrect: picks.evidence ? picks.evidence === 'path' : null,
    boardCorrect: picks.board ? picks.board === board.action : null }
}

export function ticketRef(ticket) {
  const n = ticketNumber(ticket)
  return (!ticket.network && catalog[n - 1]?.network ? 'F' : '') + String(n).padStart(3, '0')
}

export function fromTicketRef(ref) {
  if (typeof ref !== 'string' || !/^F?\d{3}$/.test(ref)) return
  const legacy = ref.startsWith('F')
  const n = Number(legacy ? ref.slice(1) : ref)
  if (n < 2 || n > catalog.length || (legacy && !catalog[n-1].network)) return
  return (legacy ? firewallCatalog : catalog)[n - 1]
}
