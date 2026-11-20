import { boardChoices, packetHops, decisionBrief, evidenceQuestion, forecastSkill, arcadeVerdict, ticketRef, fromTicketRef } from './arcade.mjs'
import { ticketTypes } from './network-cases.mjs'
import { policyEvidence, configPreview, pacFile } from './configuration.mjs'
import { catalog, firewallCatalog } from './catalog.mjs'
import { mountGlobe } from './globe.mjs'
import { sites, serviceRegions } from './sites.mjs'
import { assessRisk, rehearsals, riskBands, riskMatrix, recordFirst, scorecard } from './assessment.mjs'
import { evaluate } from './policy.mjs'
import { createSession } from './session.mjs'

const byId = id => document.getElementById(id)

function element(tag, text, className) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  return node
}

function row(heading, ...cells) {
  const headingCell = element('th')
  headingCell.scope = 'row'
  headingCell.append(heading)
  const tableRow = element('tr')
  tableRow.append(headingCell, ...cells.map(content => {
    const cell = element('td')
    cell.append(content)
    return cell
  }))
  return tableRow
}

function explanation(outcome, round) {
  if (outcome.afterReason) return `${outcome.name} ${outcome.after ? 'retains' : 'loses'} access. ${outcome.afterReason}`
  if (outcome.after === null) {
    return `${outcome.name} loses access to the ${round.destination}. ${outcome.before} previously allowed ${outcome.ip}. After the change no allow rule matches ${outcome.afterIp || outcome.ip}, so default deny blocks the connection.`
  }
  const rule = round.rules.find(rule => rule.id === outcome.after)
  return `${outcome.name} retains access. Its post-change IP ${outcome.afterIp || outcome.ip} matches the kept ${rule.id} rule (${rule.source}).`
}

const challengeTemplate = byId('challenge').cloneNode(true)
const ledger = new Map()
const helpSeen = new Map()
let current
let globe
let stopRide = () => {}
const [tutorial, ...questions] = catalog
const kindOf = ticket => ticket.network?.kind || 'firewall'
const questionById = id => questions.find(ticket => ticket.id === id)
const openingQuestion = questions.find(ticket => kindOf(ticket) === 'route')
const roundSize = 5
const roundCount = Math.ceil(questions.length / roundSize)
let roundStart = 0
let sideRun = null
let campaignTicketId = ''
const drillHistory = new Map()
const campaignEntries = () => [...ledger.values()].slice(roundStart, roundStart + roundSize)

function restoreArcade(ticket, entry, picks) {
  if (entry && picks) entry.arcade = arcadeVerdict(ticket, evaluate(ticket), entry,
    { evidence: picks.evidence || '', board: picks.board || '', wager: Boolean(picks.wager) })
}

function forecastInputs(entry) {
  const a = entry.arcade
  return [entry.id, entry.predicted, entry.predictedRisk, entry.help, entry.type,
    a ? { evidence: a.evidence, board: a.board, wager: a.wager } : null]
}

function restoreSide(saved) {
  if (saved?.mode !== 'drill') return null
  // Older solo drills stored their ticket references as one CR1-prefixed string.
  const refs = saved.tickets ?? saved.code?.match(/^CR1-((?:F?\d{3}-){4}F?\d{3})$/)?.[1].split('-')
  if (!Array.isArray(refs) || refs.length !== roundSize) return null
  const tickets = refs.map(fromTicketRef)
  if (tickets.some(ticket => !ticket) || new Set(tickets.map(t => t.id)).size !== roundSize) return null
  const restored = { family: saved.family, tickets, calls: [], used: saved.used || {} }
  const records = new Map()
  for (const [i, inputs] of saved.calls.entries()) {
    const [id, selected, risk, help, , picks] = inputs
    const ticket = tickets[i]
    if (ticket?.id !== id) return null
    const result = createSession(evaluate(ticket), assessRisk(ticket.readiness).band).commit(selected, risk)
    if (!result) return null
    recordFirst(records, ticket, result, selected, risk, new Set(help))
    const entry = records.get(id)
    restoreArcade(ticket, entry, picks)
    restored.calls.push(entry)
  }
  return restored
}
const storageKey = 'change-roulette-campaign-v3'
const practiceStorageKey = 'change-roulette-practice-v1'

function roundComplete() {
  return ledger.size >= roundStart + roundSize
}

function readCampaign() {
  try {
    const data = localStorage.getItem(storageKey)
    if (data) return data
  } catch { /* Browser privacy controls may restrict persistent storage. */ }
  try {
    return sessionStorage.getItem(storageKey) || sessionStorage.getItem('change-roulette-run-v2')
  } catch { return null }
}

function mergePracticeExposure(saved) {
  for (const [id, used, kind] of saved?.help || []) {
    const ticket = questionById(id)
    if (!ticket || !used.includes('practice replay') || kindOf(ticket) !== kind) continue
    const history = helpSeen.get(id) || new Set()
    history.add('practice replay')
    helpSeen.set(id, history)
  }
}

window.addEventListener('storage', event => {
  if (event.key !== storageKey || !event.newValue || sideRun) return
  try {
    mergePracticeExposure(JSON.parse(event.newValue))
    if (current && !ledger.has(current.id) && helpSeen.get(current.id)?.has('practice replay')) {
      byId('point-terms').textContent = 'This ticket was seen in practice. Its campaign forecast earns 0 points.'
      byId('wager-label').hidden = true
      byId('wager').checked = false
    }
  } catch { /* Ignore incomplete or unrelated browser data. */ }
})

function saveRun() {
  try {
    if (sideRun) {
      const practice = { mode: 'drill', family: sideRun.family, tickets: sideRun.tickets.map(ticketRef),
        calls: sideRun.calls.map(forecastInputs), used: sideRun.used }
      sessionStorage.setItem(practiceStorageKey, JSON.stringify(practice))
    } else sessionStorage.removeItem(practiceStorageKey)
  } catch { /* A restricted browser can still play a round in memory. */ }
  try {
    const progress = {
      current: campaignTicketId, roundStart,
      forecasts: [...ledger.values()].map(entry => {
        const data = forecastInputs(entry)
        data[4] = kindOf(questionById(entry.id))
        return data
      }),
      help: [...helpSeen].filter(([, values]) => values.size).map(([id, values]) => [id, [...values], kindOf(questionById(id) || tutorial)]),
      drills: [...drillHistory],
    }
    // A practice tab can add exposure and drill results without overwriting another tab’s campaign calls.
    const latest = sideRun ? JSON.parse(readCampaign()) : null
    if (latest) {
      const help = new Map((latest.help || []).map(row => [row[0], row]))
      for (const [id, used, kind] of progress.help) {
        if (!used.includes('practice replay')) continue
        const prior = help.get(id)
        help.set(id, [id, [...new Set([...(prior?.[1] || []), 'practice replay'])], kind])
      }
      latest.help = [...help.values()]
      if (sideRun.calls.length === roundSize) {
        latest.drills = [...new Map([...(latest.drills || []), [sideRun.family, drillHistory.get(sideRun.family)]])]
      }
    }
    const data = JSON.stringify(latest || progress)
    try { localStorage.setItem(storageKey, data) }
    catch { sessionStorage.setItem(storageKey, data) }
  } catch { /* In-memory play also works when browser storage is unavailable. */ }
}

function restoreRun() {
  try {
    const saved = JSON.parse(readCampaign())
    if (!saved) return
    ledger.clear()
    helpSeen.clear()
    drillHistory.clear()
    questions.splice(0, questions.length, ...catalog.slice(1))
    for (const [family, value] of saved.drills || []) drillHistory.set(family, value)
    for (const [id, selected, risk, used, kind = 'firewall', picks] of saved.forecasts) {
      const index = questions.findIndex(t => t.id === id)
      if (index < 0) continue
      // Completed questions retain the policy evidence the player actually saw.
      const ticket = kind === 'firewall' ? firewallCatalog[index + 1] : questions[index]
      if (kind !== kindOf(ticket)) continue
      questions[index] = ticket
      const result = createSession(evaluate(ticket), assessRisk(ticket.readiness).band).commit(selected, risk)
      if (result) {
        recordFirst(ledger, ticket, result, selected, risk, new Set(used))
        restoreArcade(ticket, ledger.get(id), picks)
      }
    }
    for (const [id, used, kind = 'firewall'] of saved.help || []) {
      const ticket = questionById(id) || tutorial
      if (kind === kindOf(ticket)) helpSeen.set(id, new Set(used))
    }
    roundStart = ledger.size - ledger.size % roundSize
    if (ledger.size > 0 && ledger.size % roundSize === 0 &&
        (saved.roundStart !== roundStart || ledger.size === questions.length)) roundStart -= roundSize
    campaignTicketId = saved.current || ''
    try {
      const practice = JSON.parse(sessionStorage.getItem(practiceStorageKey))
      sideRun = restoreSide(practice)
      if (practice && !sideRun) sessionStorage.removeItem(practiceStorageKey)
    } catch { sideRun = null }
    return questions.find(t => t.id === saved.current && !ledger.has(t.id))
  } catch { ledger.clear(); helpSeen.clear(); questions.splice(0, questions.length, ...catalog.slice(1)) }
}

function updateHud() {
  const score = scorecard(ledger)
  if (sideRun) {
    byId('hud-progress').textContent = sideRun.calls.length + ' / 5 practice calls'
    byId('case-progress').value = sideRun.calls.length
    return
  }
  byId('hud-points').textContent = `${score.points} pts`
  byId('hud-progress').textContent = `${score.total} / ${questions.length} completed`
  byId('case-progress').value = score.total - roundStart
}

function mount(round, focus = false) {
  if (!sideRun && roundComplete() && round !== tutorial && !ledger.has(round.id)) return showRoundResults()
  stopRide()
  globe?.dispose()
  byId('round-results').hidden = true
  current = round
  if (!sideRun) campaignTicketId = round.id
  updateNavigation()
  const outcomes = evaluate(round)
  const risk = assessRisk(round.readiness)
  const fresh = challengeTemplate.cloneNode(true)
  fresh.dataset.ticket = round.id
  byId('challenge').replaceWith(fresh)
  byId('summary').hidden = true
  const previousHelp = sideRun ? new Set(sideRun.used[round.id] || []) : helpSeen.get(round.id) || new Set()
  if (!sideRun) helpSeen.set(round.id, previousHelp)
  const practice = !sideRun && (round === tutorial || ledger.has(round.id))
  const entries = sideRun ? sideRun.calls : campaignEntries()
  const finale = !practice && entries.length === 4
  const brief = decisionBrief(round, outcomes)
  const citation = evidenceQuestion(round, outcomes)
  byId('case-id').textContent = sideRun ? 'Skill practice · Question ' + (entries.length + 1) + ' of 5' : practice ? 'Optional practice' :
    `Round ${1 + roundStart / roundSize} of ${roundCount} · Question ${1 + ledger.size - roundStart} of ${roundSize}`
  byId('point-terms').textContent = practice ? 'This practice question earns no campaign points.' :
    'Your first forecast can earn 100 points. Using a hint or solution counts this question toward completion and earns 0 points.'
  byId('business-facts').textContent = brief.context
  byId('board-field').hidden = !finale
  byId('board-context').textContent = brief.context
  for (const action of boardChoices) {
    const label = element('label', undefined, 'choice risk-option')
    const radio = element('input')
    radio.type = 'radio'; radio.name = 'board'; radio.value = action
    label.append(radio, action)
    byId('board-picks').append(label)
  }
  byId('evidence-prompt').textContent = 'What determines the post-change path from ' + citation.site + '?'
  byId('citation').add(new Option('Select evidence' + (finale ? ' (required)' : ' (optional)'), ''))
  for (const option of citation.options) byId('citation').add(new Option(option.label, option.id))
  byId('evidence-pick').open = finale
  byId('wager-label').hidden = practice || entries.some(e => e.arcade?.wager) || Boolean(previousHelp.size)
  if (sideRun) byId('point-terms').textContent = 'This five-ticket practice round has its own score. Hints mark your call as assisted.'
  const readiness = round.readiness
  byId('risk-clue').textContent = `${rehearsals[readiness.rehearsal]} · ${readiness.recovery} min recovery · ${readiness.tolerance} min tolerance`
  byId('workflow').textContent = readiness.workflow + '.'
  for (const [label, value] of [['Rehearsal', rehearsals[readiness.rehearsal]], ['Recovery estimate', readiness.recovery + ' min'], ['Service tolerance', readiness.tolerance + ' min']]) {
    const fact = element('div')
    fact.append(element('dt',label),element('dd',value))
    byId('risk-facts').append(fact)
  }
  riskMatrix.forEach((bands, index) => byId('risk-matrix').append(row(rehearsals[index], ...bands)))
  for (const band of riskBands) {
    const label = element('label', undefined, 'choice risk-option')
    const input = element('input')
    input.type = 'radio'
    input.name = 'risk'
    input.value = band
    label.append(input, band)
    byId('risk-picks').append(label)
  }
  byId('risk-guide').onclick = () => {
    byId('ticket-evidence').open = true
    byId('ticket-evidence').querySelector('summary').focus()
  }
  byId('back-to-risk').onclick = () => byId('risk-picks').querySelector('input').focus()
  const riskExplanation = `${rehearsals[readiness.rehearsal]}. Recovery of ${readiness.recovery} min is ${risk.exposure} (${readiness.tolerance} min). The matrix rates this rollout ${risk.band}.`
  let showingAfter = false
  let selectedSite = round.branches[0].name
  let inspectorView = 'network'
  const siteSelect = byId('site-select')
  const [hubName, hubLat, hubLon] = serviceRegions[round.destination]
  for (const name of [...Object.keys(sites), hubName].sort()) siteSelect.add(new Option(name, name))
  let autoplay = 0
  let hopIndex = 0
  let riding = false
  let rideSite = round.branches[0].name
  function renderHop() {
    const branch = outcomes.find(b => b.name === rideSite)
    const hops = packetHops(round, branch)
    const [label, detail] = hops[hopIndex]
    byId('packet-hop').textContent = 'Hop ' + (hopIndex + 1) + ' of ' + hops.length + ' · ' + label + ' — ' + detail
    byId('hop-list').replaceChildren(...hops.map(([name], index) => {
      const item = element('li', name)
      if (index === hopIndex) item.setAttribute('aria-current', 'step')
      if (index < hopIndex) item.className = 'passed'
      return item
    }))
    byId('hop-back').disabled = hopIndex === 0
    byId('hop-next').textContent = hopIndex === hops.length - 1 ? 'Ride again' : 'Next hop'
    for (const button of byId('packet-sites').children) button.setAttribute('aria-pressed', String(button.textContent === rideSite))
    globe.ride(rideSite, hopIndex / (hops.length - 1))
  }
  function pauseRide() {
    window.clearTimeout(autoplay)
    autoplay = 0
    if (fresh.isConnected) byId('play-ride').textContent = 'Play journey'
  }
  stopRide = pauseRide
  function inspectSite(name) {
    selectedSite = name
    siteSelect.value = name
    const branch = outcomes.find(b => b.name === name)
    const [lat, lon] = sites[name] || [hubLat, hubLon]
    byId('site-name').textContent = name
    byId('site-coords').textContent = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}  ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`
    const related = catalog.filter(ticket => ticket.branches.some(b => b.name === name) || serviceRegions[ticket.destination][0] === name)
    const seen = related.filter(t => ledger.has(t.id)).length
    let detail = `${related.length} local ticket${related.length === 1 ? '' : 's'} · ${seen} assessed. `
    if (inspectorView === 'change') {
      const local = branch || name === hubName ? round : related[0]
      detail += `${local.readiness.workflow}. Service tolerance: ${local.readiness.tolerance} min. `
      if (branch) detail += `Requested access: ${branch.intendedAccess ? 'keep' : 'remove'}. `
      if (branch && showingAfter) detail += branch.meetsIntent ? 'The proposal matches this site’s intent.' : 'The proposal misses this site’s intent.'
    }
    else if (branch && showingAfter) detail += explanation(branch, round)
    else if (branch) {
      detail += `Source ${branch.ip} reaches the ${round.destination} via ${branch.before}.`
      if (branch.afterIp) detail += ` Proposed source: ${branch.afterIp}.`
    }
    else if (name === hubName) detail += `Simulated service region for the ${round.destination}, TCP ${round.port}. ${round.readiness.workflow}.`
    else detail += `Explore ${related[0].destination} changes at this site.`
    byId('site-detail').textContent = detail
    globe.center(name)
    if (riding && branch) { pauseRide(); rideSite = name; hopIndex = 0; renderHop() }
    byId('zoom').textContent = 'Zoom in'
  }
  function pickSite(name) {
    if (showingAfter && outcomes.some(b => b.name === name)) {
      riding = true
      byId('packet-player').hidden = false
    }
    inspectSite(name)
  }
  globe = mountGlobe(byId('globe'), { ...round, branches: outcomes }, pickSite)
  for (const view of ['network', 'change']) {
    byId('view-' + view).onclick = () => {
      inspectorView = view
      for (const name of ['network', 'change']) byId('view-' + name).setAttribute('aria-pressed', String(name === view))
      inspectSite(selectedSite)
    }
  }
  siteSelect.onchange = () => pickSite(siteSelect.value)
  byId('site-tickets').hidden = Boolean(sideRun)
  byId('site-tickets').onclick = () => openLibrary(selectedSite)
  byId('zoom').onclick = () => { byId('zoom').textContent = globe.toggleZoom() > 1 ? 'Zoom out' : 'Zoom in' }
  byId('recenter').onclick = () => inspectSite(round.branches[0].name)
  inspectSite(selectedSite)
  for (const b of outcomes) {
    const button = element('button', b.name, 'outline')
    button.onclick = () => inspectSite(b.name)
    byId('packet-sites').append(button)
  }
  byId('play-ride').onclick = () => {
    if (autoplay) return pauseRide()
    const last = packetHops(round, outcomes.find(b => b.name === rideSite)).length - 1
    if (hopIndex === last) { hopIndex = 0; renderHop() }
    byId('play-ride').textContent = 'Pause journey'
    function nextHop() {
      if (!fresh.isConnected || fresh.hidden || !byId('atlas-detail').open) return pauseRide()
      hopIndex++
      renderHop()
      if (hopIndex === last) pauseRide()
      else autoplay = window.setTimeout(nextHop, 1000)
    }
    autoplay = window.setTimeout(nextHop, 1000)
  }
  byId('hop-back').onclick = () => { pauseRide(); hopIndex = Math.max(0, hopIndex - 1); renderHop() }
  byId('hop-next').onclick = () => {
    pauseRide()
    hopIndex = (hopIndex + 1) % packetHops(round, outcomes.find(b => b.name === rideSite)).length
    renderHop()
  }
  byId('ride-packet').onclick = () => {
    riding = true
    byId('atlas-detail').open = true
    byId('packet-player').hidden = false
    inspectSite(rideSite)
    byId('packet-title').focus()
  }

  let session
  const choices = byId('choices')
  const neither = byId('neither')
  const form = byId('prediction-form')
  const commit = byId('commit')
  const retry = byId('retry')
  const advance = byId('advance')
  const replayBody = byId('replay-body')
  const replayRows = byId('replay-rows')
  const intentVerdict = byId('intent-verdict')
  const status = byId('replay-status')
  const inputError = byId('input-error')
  const helpButtons = [byId('hint'), byId('solution')]

  byId('round-title').textContent = round.title
  const facts = policyEvidence(round)
  byId('question-type').textContent = ticketTypes[kindOf(round)]
  byId('question-stem').textContent = round.ticket
  byId('policy-heading').textContent = facts.component + ' & rollout evidence'
  byId('path-component').textContent = facts.component
  byId('path-method').textContent = facts.detail
  byId('config-note').textContent = facts.configNote
  const changeLines = (facts.changes || []).concat(facts.permits || [])
  byId('change-lines').hidden = !changeLines.length
  byId('change-lines').replaceChildren(...changeLines.map(text => element('li', text)))
  byId('config-format-control').hidden = kindOf(round) !== 'pac'
  function renderConfig() {
    const source = phase => byId('config-format').value === 'pac'
      ? pacFile(round.network, phase) : configPreview(round, phase)
    const before = source('before').split('\n'), after = source('after').split('\n')
    for (const [key, lines, other] of [['before', before, after], ['after', after, before]]) {
      const change = key === 'before' ? 'removed' : 'added'
      byId('config-' + key).replaceChildren(...lines.map(line =>
        element('span', line, other.includes(line) ? 'code-line' : 'code-line ' + change)))
    }
  }
  const configDetail = byId('config-detail')
  configDetail.ontoggle = () => { if (configDetail.isConnected && configDetail.open) renderConfig() }
  byId('config-format').onchange = renderConfig
  byId('compare-config').onclick = () => {
    byId('config-detail').open = true
    byId('config-detail').querySelector('summary').focus()
  }
  byId('ticket').textContent = `Destination: ${round.destination} · TCP ${round.port}`
  byId('intent-targets').textContent = outcomes.map(branch => branch.intendedAccess
    ? `Keep ${branch.name} connected.`
    : `Remove ${branch.name}’s HTTPS access.`).join(' ')
  byId('firewall-model').textContent = facts.model
  byId('path-destination').textContent = round.destination
  byId('path-port').textContent = `TCP ${round.port}`
  for (const branch of outcomes) {
    const chip = element('span')
    chip.append(element('strong',branch.name), element('code',branch.afterIp ? `${branch.ip} → ${branch.afterIp}` : branch.ip))
    byId('source-chips').append(chip)
  }
  byId('policy-columns').replaceChildren(...facts.headings.map(name => {
    const cell = element('th', name)
    cell.scope = 'col'
    return cell
  }))
  byId('rule-rows').append(...facts.rows.map(([name, value, action]) =>
    row(name, value, action === 'Keep' || action === 'Remove' ? element('span', action, 'action ' + action.toLowerCase()) : action)))
  const pathNodes = new Map(outcomes.map(branch => {
    const node = element('li', undefined, 'path-node source-node')
    const indicator = element('span', undefined, 'node-mark')
    indicator.setAttribute('aria-hidden', 'true')
    const access = element('span', undefined, 'node-access')
    node.append(indicator, element('strong', branch.name), element('code', branch.ip), access)
    if (branch.afterIp) node.append(element('small', `New IP ${branch.afterIp}`))
    byId('path-branches').append(node)
    return [branch.id, { node, access }]
  }))

  function showPath(afterChange) {
    showingAfter = afterChange
    globe.setAfter(afterChange)
    inspectSite(selectedSite)
    byId('atlas-phase').textContent = byId('path-phase').textContent = afterChange ? 'After change' : 'Before change'
    for (const branch of outcomes) {
      const { node, access } = pathNodes.get(branch.id)
      const blocked = afterChange && branch.after === null
      node.classList.toggle('blocked', blocked)
      access.textContent = blocked ? 'Access lost' : 'Access allowed'
    }
  }
  byId('hint-text').textContent = round.hint
  const affected = outcomes.filter(branch => branch.after === null).map(branch => branch.name)
  const steps = element('ul')
  steps.append(...outcomes.map(branch => element('li', explanation(branch, round))))
  byId('solution-text').append(element('strong', `Affected branches: ${affected.join(', ') || 'Neither branch'}.`), steps, element('p', riskExplanation))

  const branchControls = outcomes.map(branch => {
    const input = element('input')
    input.type = 'checkbox'
    input.value = branch.id
    const label = element('label', undefined, 'choice')
    label.append(input, branch.name)
    byId('branch-choices').append(label)
    const sector = element('span', undefined, 'sector')
    sector.append(element('span', branch.name, 'sector-label'))
    byId('sectors').append(sector)
    return { input, sector }
  })

  function showSelections() {
    for (const { input, sector } of branchControls) sector.classList.toggle('selected', input.checked)
  }

  function setHelp(button, expanded) {
    button.setAttribute('aria-expanded', String(expanded))
    byId(button.getAttribute('aria-controls')).hidden = !expanded
  }

  function setWaiting() {
    status.textContent = ''
    status.removeAttribute('aria-describedby')
    showPath(false)
    intentVerdict.hidden = true
    replayBody.hidden = true
    replayRows.replaceChildren()
    replayRows.hidden = true
    retry.hidden = true
    advance.hidden = true
  }

  function initialize(focus = false) {
    session = createSession(outcomes, risk.band)
    form.reset()
    showSelections()
    inputError.textContent = ''
    setWaiting()
    choices.disabled = false
    commit.disabled = false
    for (const button of helpButtons) {
      button.disabled = false
      setHelp(button, false)
    }
    byId('summary').hidden = true
    byId('challenge').hidden = false
    updateHud()
    if (focus) {
      byId('round-title').tabIndex = -1
      byId('round-title').focus()
    }
  }

  function replayEntry(outcome) {
    const denied = outcome.after === null
    const card = element('li')
    const heading = element('div', undefined, 'result-heading')
    heading.append(element('h3', outcome.name), element('span', denied ? 'Access lost' : 'Access retained', denied ? 'verdict denied' : 'verdict'))
    card.append(heading, element('p', explanation(outcome, round)))
    const path = round.network ? `Before: ${outcome.before}. After: ${outcome.after || 'Service unreachable'}.`
      : `Before: allowed by ${outcome.before} · After: ${denied ? 'default deny' : `allowed by ${outcome.after}`}`
    card.append(element('p', path, 'replay-path'))
    const target = outcome.intendedAccess ? 'Keep access' : 'Remove access'
    const verification = outcome.meetsIntent ? 'matched' : 'missed'
    card.append(element('p', `Intent: ${target} · ${verification}`, outcome.meetsIntent ? 'replay-path' : 'mismatch'))
    if (outcome.mismatch) {
      card.append(element('p', denied ? 'Your prediction missed this loss.' : 'You predicted a loss here.', 'mismatch'))
    }
    return card
  }

  form.addEventListener('change', event => {
    if (event.target === neither && neither.checked) {
      for (const { input } of branchControls) input.checked = false
    } else if (event.target.type === 'checkbox' && branchControls.some(c => c.input === event.target) && event.target.checked) {
      neither.checked = false
    }
    inputError.textContent = ''
    showSelections()
  })

  form.addEventListener('submit', event => {
    event.preventDefault()
    if (commit.disabled) return
    const picked = branchControls.filter(({ input }) => input.checked).map(({ input }) => input.value)
    if (!picked.length && !neither.checked) {
      inputError.textContent = 'Choose at least one branch or select Neither branch.'
      branchControls[0].input.focus()
      return
    }

    const chosenRisk = new FormData(form).get('risk')
    if (!chosenRisk) {
      inputError.textContent = 'Choose a rollout risk using the rehearsal and recovery evidence.'
      byId('risk-picks').querySelector('input').focus()
      return
    }
    const board = byId('board-picks').querySelector('input:checked')?.value || ''
    const evidence = byId('citation').value
    if (finale && (!board || !evidence)) {
      inputError.textContent = !board ? 'Choose Approve, Stage, or Hold for the change board.' : 'Cite the evidence for your board decision.'
      if (!board) byId('board-picks').querySelector('input').focus()
      else { byId('evidence-pick').open = true; byId('citation').focus() }
      return
    }
    const first = sideRun ? !sideRun.calls.some(e => e.id === round.id) : !practice && !ledger.has(round.id)
    if (first && !sideRun) {
      try { mergePracticeExposure(JSON.parse(readCampaign())) } catch { /* In-memory mode. */ }
    }
    const result = session.commit(picked, chosenRisk)
    if (!result) return
    const records = sideRun ? new Map() : ledger
    const earned = first ? recordFirst(records, round, result, picked, chosenRisk, previousHelp) : 0
    const entry = first ? records.get(round.id) : { predicted: picked, predictedRisk: chosenRisk,
      actual: outcomes.filter(b => !b.after).map(b => b.id), impactCorrect: result.impactCorrect, riskCorrect: result.riskCorrect }
    const picks = { board, evidence, wager: first && !previousHelp.size && !byId('wager-label').hidden && byId('wager').checked }
    const verdict = arcadeVerdict(round, outcomes, entry, picks)
    if (first) {
      entry.arcade = verdict
      if (sideRun) {
        sideRun.calls.push(entry)
        if (sideRun.calls.length === roundSize) {
          const solo = sideRun.calls.filter(e => !e.assisted)
          drillHistory.set(sideRun.family, { total: solo.length, impact: solo.filter(e => e.impactCorrect).length,
            risk: solo.filter(e => e.riskCorrect).length })
        }
        rememberExposure(round)
      }
    }
    showBot(round, verdict, first && !previousHelp.size)
    const feedback = [brief.exposed + ' active users lose expected service.']
    if (evidence) feedback.push((verdict.evidenceCorrect ? 'Evidence confirmed. ' : 'Decisive evidence: ') + citation.decisive)
    if (board) feedback.push('Your call: ' + board + '. Board ruling: ' + brief.action + '. ' + brief.reason)
    if (picks.wager) feedback.push(verdict.chips ? 'Called it! +25 arcade points.' : 'Chip spent. +0 arcade points.')
    if (first && verdict.stamps.length) feedback.push('Stamps earned: ' + verdict.stamps.join(' · ') + '.')
    byId('arcade-feedback').textContent = feedback.join(' ')
    byId('citation').disabled = byId('wager').disabled = byId('board-field').disabled = true
    updateHud()
    saveRun()
    byId('award').textContent = first
      ? `+${earned} pts · ${previousHelp.size ? 'Assisted practice' : 'First forecast'} · Impact ${result.impactCorrect ? 'correct' : 'missed'} · Risk ${result.riskCorrect ? 'correct' : 'missed'}`
      : 'Practice only · No additional points.'
    if (!sideRun && first && scorecard(ledger).streak >= 3) byId('award').textContent += ` · ${scorecard(ledger).streak} perfect calls in a row!`
    byId('risk-review').textContent = `Your risk rating: ${chosenRisk}. ${riskExplanation}`
    choices.disabled = true
    byId('risk-choices').disabled = true
    byId('back-to-risk').hidden = true
    commit.disabled = true
    if (result.correct) {
      for (const button of helpButtons) button.disabled = true
    }
    const reveal = [...result.rows]
    if (Math.random() < .5) reveal.reverse()
    const wheel = byId('wheel')
    wheel.style.setProperty('--spin-end', reveal[0].id === outcomes[0].id ? '810deg' : '990deg')
    wheel.classList.add('rolling')
    wheel.classList.toggle('chip-win', Boolean(verdict.chips))
    commit.classList.add('spun')
    byId('bot-ready').hidden = true
    status.textContent = result.correct ? 'Perfect call. Both forecasts match.' : 'Review your forecast.'
    intentVerdict.textContent = result.intentMet ? 'Change meets intent' : 'Change misses intent'
    intentVerdict.classList.toggle('missed', !result.intentMet)
    intentVerdict.hidden = false
    status.setAttribute('aria-describedby', 'intent-verdict')
    showPath(true)
    replayBody.hidden = false
    replayRows.replaceChildren(...reveal.map(replayEntry))
    replayRows.hidden = false
    retry.hidden = result.correct
    advance.hidden = false
    byId('replay-detail').hidden = false
    commit.hidden = true
    const end = sideRun ? sideRun.calls.length === roundSize : roundComplete()
    advance.textContent = end ? 'See round results' : practice ? 'Return to campaign' : 'Next question'
    if (!sideRun && !practice && !end) offerCards()
    status.focus({ preventScroll: true })

  })

  retry.addEventListener('click', () => {
    if (!session.retry()) return
    choices.disabled = false
    commit.disabled = false
    commit.hidden = false
    retry.hidden = true
    byId('risk-choices').disabled = false
    byId('back-to-risk').hidden = false
    byId('wheel').classList.remove('rolling')
    commit.classList.remove('spun')
    branchControls[0].input.focus()
  })

  let offered = []
  function offerCards() {
    offered = dealTickets(questions, 2)
    byId('next-deal').hidden = !offered.length
    byId('deal-cards').replaceChildren(...offered.map(t => {
      const card = element('button', undefined, 'deal-card')
      card.append(element('small', ticketTypes[kindOf(t)] + ' · ' + t.id), element('strong', t.title))
      card.onclick = () => mount(t, true)
      return card
    }))
    advance.textContent = 'Pick for me'
  }
  advance.addEventListener('click', () => {
    if (sideRun) return resumeSide()
    if (offered.length) return mount(offered[Math.floor(Math.random() * offered.length)], true)
    drawTicket()
  })
  for (const button of helpButtons) {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'false'
      if (expanded) {
        session.useHelp(button.id)
        previousHelp.add(button.id)
        if (sideRun) {
          sideRun.used[round.id] = [...previousHelp]
          rememberExposure(round)
        }
        byId('wager-label').hidden = true
        byId('wager').checked = false
        if (!ledger.has(round.id)) byId('point-terms').textContent = 'Assisted practice. This ticket will earn 0 points.'
        saveRun()
      }
      setHelp(button, expanded)
    })
  }

  initialize(focus)
  if (previousHelp.size && !ledger.has(round.id)) byId('point-terms').textContent = 'Assisted practice. This ticket will earn 0 points.'
  saveRun()
}

function dealTickets(pool, count) {
  const unanswered = pool.filter(ticket => !ledger.has(ticket.id))
  const alternatives = unanswered.filter(ticket => ticket !== current)
  const options = alternatives.length ? alternatives : unanswered
  if (!options.length) return []
  // Spread the 20 route and 20 proxy/PAC questions across the full campaign.
  const target = ['firewall', 'firewall', 'firewall', 'route', (roundStart / roundSize) % 2 === 0 ? 'pzen' : 'pac']
  const played = [...ledger.keys()].slice(roundStart).map(id => kindOf(questionById(id)))
  for (const kind of played) {
    const index = target.indexOf(kind)
    if (index >= 0) target.splice(index, 1)
  }
  const needed = options.filter(ticket => target.includes(kindOf(ticket)))
  const unseenTypes = needed.filter(ticket => !played.includes(kindOf(ticket)))
  let candidates = unseenTypes.length ? unseenTypes : needed.length ? needed : options
  if (ledger.size - roundStart === roundSize - 1) {
    // Give less frequent board rulings a turn when the eligible deck permits it.
    const frequency = new Map(boardChoices.map(action => [action, 0]))
    for (const entry of ledger.values()) if (entry.arcade?.board) {
      const t = questionById(entry.id)
      const ruling = decisionBrief(t, evaluate(t)).action
      frequency.set(ruling, frequency.get(ruling) + 1)
    }
    const weights = candidates.map(t => frequency.get(decisionBrief(t, evaluate(t)).action))
    const lowest = Math.min(...weights)
    candidates = candidates.filter((_, i) => weights[i] === lowest)
  }
  const first = candidates[Math.floor(Math.random() * candidates.length)]
  if (count === 1) return [first]
  const rest = candidates.filter(t => t !== first)
  const different = rest.filter(t => kindOf(t) !== kindOf(first))
  const next = different.length ? different : rest
  const reserve = next.length ? next : options.filter(t => t !== first)
  return reserve.length ? [first, reserve[Math.floor(Math.random() * reserve.length)]] : [first]
}

function drawTicket(pool = questions) {
  byId('library').close()
  if (roundComplete()) return showRoundResults()
  const [ticket] = dealTickets(pool, 1)
  if (ticket) mount(ticket, true)
}

function matchingTickets() {
  const query = byId('search').value.toLowerCase().trim()
  const category = byId('type-filter').value
  return questions.filter(t => (!category || kindOf(t) === category) &&
    [t.id, t.title, t.family, ticketTypes[kindOf(t)], t.network?.target || '', serviceRegions[t.destination][0], ...t.branches.map(b => b.name)].join(' ').toLowerCase().includes(query))
}

function fillLibrary() {
  const found = matchingTickets()
  byId('draw').disabled = roundComplete() || !found.some(ticket => !ledger.has(ticket.id))
  byId('library-count').textContent = `${found.length} of ${questions.length} questions`
  const list = byId('library-list')
  list.replaceChildren()
  for (const ticket of found) {
    const button = element('button', undefined, 'ticket-option')
    const state = ledger.get(ticket.id)
    button.append(element('small',ticket.id), element('strong',ticket.title), element('span',ticketTypes[kindOf(ticket)] + ' · ' + (state ? `${state.points} pts · Practice` : ticket.branches.map(b => b.name).join(' / '))))
    button.disabled = roundComplete() && !state
    button.onclick = () => { byId('library').close(); mount(ticket, true) }
    const item = element('li')
    item.append(button)
    list.append(item)
  }
  if (!found.length) list.append(element('li','No matching tickets. Try a city or ticket ID.'))
}

function openLibrary(query = '') {
  if (sideRun) return
  byId('type-filter').value = ''
  byId('search').value = query
  fillLibrary()
  byId('library').showModal()
  byId('search').focus()
}

function showBot(ticket, verdict, independent) {
  const names = ticket.branches.filter(b => verdict.bot.lost.includes(b.id)).map(b => b.name)
  const title = verdict.playerPoints === verdict.botPoints ? 'Tie with the bot'
    : verdict.playerPoints > verdict.botPoints ? 'You outread the bot' : 'Bot takes this ticket'
  byId('bot-result').replaceChildren(element('strong', independent ? title : 'Bot forecast'),
    element('span', 'Bot called ' + (names.join(' and ') || 'no branch losses') + ' · ' + verdict.bot.risk + ' risk.'),
    element('small', '“' + verdict.bot.reasoning + '” · You ' + verdict.playerPoints + ' / Bot ' + verdict.botPoints))
}

function rememberExposure(ticket) {
  if (ledger.has(ticket.id) || kindOf(questionById(ticket.id)) !== kindOf(ticket)) return
  const used = helpSeen.get(ticket.id) || new Set()
  used.add('practice replay')
  helpSeen.set(ticket.id, used)
}

function updateNavigation() {
  for (const name of ['open-library','open-score']) byId(name).hidden = Boolean(sideRun)
  byId('exit-side').hidden = !sideRun
}

function resumeSide() {
  if (sideRun.calls.length === roundSize) { updateNavigation(); return showRoundResults() }
  mount(sideRun.tickets[sideRun.calls.length], true)
}

function beginDrill(tickets, family) {
  if (!sideRun) campaignTicketId = current?.id || campaignTicketId
  sideRun = { tickets, family, calls: [], used: {} }
  resumeSide()
}

function leaveSide(toScore = false) {
  sideRun = null
  try { sessionStorage.removeItem(practiceStorageKey) } catch { /* In-memory mode. */ }
  restoreRun()
  updateNavigation()
  saveRun()
  if (roundComplete()) showRoundResults()
  else mount(questionById(campaignTicketId) || openingQuestion, true)
  if (toScore) showScore()
}

function shuffleTickets(tickets) {
  const shuffled = [...tickets]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const other = shuffled[j]
    shuffled[j] = shuffled[i]
    shuffled[i] = other
  }
  return shuffled
}

byId('exit-side').onclick = () => leaveSide()

function showSkillsAndStamps() {
  const groups = new Map(), stamps = new Map()
  let chips = 0
  for (const e of ledger.values()) {
    if (e.assisted) continue
    const ticket = questionById(e.id)
    const key = forecastSkill(ticket)
    const group = groups.get(key) || []
    group.push(e)
    groups.set(key, group)
    chips += e.arcade?.chips || 0
    for (const stamp of e.arcade?.stamps || []) if (!stamps.has(stamp)) stamps.set(stamp, ticket)
  }
  const list = byId('skills-list')
  list.replaceChildren()
  for (const [family, group] of groups) {
    const item = element('li')
    const hits = group.filter(e => e.impactCorrect).length
    const risks = group.filter(e => e.riskCorrect).length
    const cited = group.filter(e => e.arcade?.evidence)
    item.append(element('strong', family), element('p', 'Impact ' + hits + '/' + group.length +
      ' · Risk ' + risks + '/' + group.length + (cited.length ? ' · Evidence ' + cited.filter(e => e.arcade.evidenceCorrect).length + '/' + cited.length : '')))
    const drill = element('button', 'Practice five · ' + family, 'review-ticket')
    drill.onclick = () => {
      const pool = questions.filter(t => forecastSkill(t) === family)
      const studied = shuffleTickets(pool.filter(t => ledger.has(t.id)))
      const fresh = shuffleTickets(pool.filter(t => !ledger.has(t.id)))
      // Migrated campaigns can retain a single old variant of a family.
      const order = [...studied, ...fresh]
      const fallback = questions.filter(t => !order.includes(t) && kindOf(t) === kindOf(pool[0]))
      beginDrill([...order, ...shuffleTickets(fallback)].slice(0, roundSize), family)
    }
    const last = drillHistory.get(family)
    if (last) item.append(element('p', 'Last practice: impact ' + last.impact + '/' + last.total + ' · risk ' + last.risk + '/' + last.total + ' independent calls.'))
    item.append(drill)
    list.append(item)
  }
  if (!groups.size) list.append(element('li', 'Complete an independent forecast to unlock a focused practice round.'))
  byId('arcade-total').textContent = chips + ' arcade points · ' + stamps.size + ' stamps. Choose a stamp to revisit the ticket that earned it.'
  const album = byId('stamp-list')
  album.replaceChildren()
  for (const [name,ticket] of stamps) {
    const badge = element('button', name + ' · ' + ticket.id, 'outline')
    badge.onclick = () => mount(ticket, true)
    album.append(badge)
  }
}

function showRoundResults() {
  stopRide()
  byId('challenge').hidden = true
  byId('summary').hidden = true
  byId('round-results').hidden = false
  const entries = sideRun?.calls || campaignEntries()
  const points = entries.reduce((sum, entry) => sum + entry.points, 0)
  const final = !sideRun && ledger.size === questions.length
  byId('round-result-heading').textContent = sideRun ? 'Skill practice complete' : final ? 'Campaign complete' : `Round ${1 + roundStart / roundSize} complete`
  byId('round-result-count').textContent = sideRun ? '5 of 5 practice forecasts completed.' : `${ledger.size} of ${questions.length} questions completed. ${final ? 'Your scorecard has the full campaign record.' : 'Your next round has five new questions.'}`
  const independent = entries.filter(entry => !entry.assisted)
  const accuracy = field => independent.length ? `${independent.filter(entry => entry[field]).length} / ${independent.length}` : 'No solo forecasts'
  const measures = [
    ['Round points', `${points} / ${roundSize * 100}`],
    ['Independent impact calls correct', accuracy('impactCorrect')],
    ['Independent risk calls correct', accuracy('riskCorrect')],
  ]
  byId('round-stats').replaceChildren(...measures.map(([label, value]) => {
    const cell = element('div')
    cell.append(element('strong', value), element('span', label))
    return cell
  }))
  byId('round-history').replaceChildren(...entries.map((entry,i) => {
    const item = element('li')
    const ticket = sideRun?.tickets[i] || questionById(entry.id)
    const names = ids => ticket.branches.filter(branch => ids.includes(branch.id)).map(branch => branch.name).join(', ') || 'Neither branch'
    const details = element('details')
    details.append(element('summary', `${ticket.title} · ${entry.points} pts${entry.assisted ? ' · Assisted' : ''}`),
      element('p', `Your forecast: ${names(entry.predicted)} · ${entry.predictedRisk}. Actual: ${names(entry.actual)} · ${entry.actualRisk}.`))
    for (const branch of evaluate(ticket)) details.append(element('p', explanation(branch, ticket)))
    const { rehearsal, recovery, tolerance } = ticket.readiness
    details.append(element('p', `${rehearsals[rehearsal]} · ${recovery} min recovery · ${tolerance} min tolerance. The matrix rates this rollout ${entry.actualRisk}.`))
    if (entry.arcade?.board) {
      const brief = decisionBrief(ticket, evaluate(ticket))
      details.append(element('p', 'Your board call: ' + entry.arcade.board + '. Board ruling: ' + brief.action + '. ' + brief.reason))
    }
    item.append(details)
    return item
  }))
  byId('round-history').closest('details').open = false
  const tickets = sideRun?.tickets || entries.map(e => questionById(e.id))
  const arcade = byId('round-arcade')
  const duels = entries.filter(e => e.arcade && !e.assisted)
  const wins = duels.filter(e => e.arcade.playerPoints > e.arcade.botPoints).length
  const ties = duels.filter(e => e.arcade.playerPoints === e.arcade.botPoints).length
  arcade.replaceChildren(element('p', 'Beat the Bot · ' + wins + ' wins · ' + ties + ' ties · ' +
    (duels.length - wins - ties) + ' losses · ' + entries.reduce((n,e) => n + (e.arcade?.chips || 0), 0) + ' arcade points'))
  const chair = entries.at(-1)?.arcade
  if (chair?.board) arcade.append(element('p', 'Board decision: ' + chair.board + ' · ' + (chair.boardCorrect ? 'Matches the workshop ruling.' : decisionBrief(tickets[4], evaluate(tickets[4])).reason)))
  if (sideRun) {
    const prior = [...ledger.values()].filter(e => !e.assisted && forecastSkill(questionById(e.id)) === sideRun.family)
    arcade.append(element('p', sideRun.family + ' campaign baseline: impact ' + prior.filter(e => e.impactCorrect).length + '/' + prior.length +
      ' · risk ' + prior.filter(e => e.riskCorrect).length + '/' + prior.length + '. The round figures above show this practice attempt.'))
  }
  byId('results-score').textContent = sideRun ? 'Return to campaign scorecard' : 'Campaign scorecard'
  byId('continue-round').hidden = final || Boolean(sideRun)
  byId('round-result-heading').focus()
}

byId('continue-round').onclick = () => {
  if (!roundComplete() || ledger.size >= questions.length) return
  roundStart = ledger.size
  drawTicket()
}
byId('results-score').onclick = () => sideRun ? leaveSide(true) : showScore()
byId('tutorial').onclick = () => { byId('library').close(); mount(tutorial, true) }

function showScore() {
  stopRide()
  const score = scorecard(ledger)
  showSkillsAndStamps()
  byId('round-results').hidden = true
  byId('resume').textContent = roundComplete() ? 'Round results' : 'Back to question'
  byId('challenge').hidden = true
  byId('summary').hidden = false
  byId('score-lede').textContent = `${score.points} points across ${score.total} of ${questions.length} questions. ${score.solo} independent forecast${score.solo === 1 ? '' : 's'} · ${score.helped} assisted.`
  const stats = [
    ['Impact accuracy', score.solo ? `${score.impact} / ${score.solo}` : 'Pending'], ['Risk accuracy', score.solo ? `${score.risk} / ${score.solo}` : 'Pending'],
    ['Missed branch losses', score.missed], ['False outage calls', score.excess], ['Underestimated risks',score.under], ['Best perfect streak',score.best],
  ]
  byId('summary-stats').replaceChildren(...stats.map(([label,value]) => {
    const stat = element('div')
    stat.append(element('strong', String(value)),element('span',label))
    return stat
  }))
  const independent = [...ledger.values()].filter(r => !r.assisted)
  byId('calibration').replaceChildren(...riskBands.map(actual => row(actual, ...riskBands.map(guess =>
    String(independent.filter(r => r.actualRisk === actual && r.predictedRisk === guess).length)))))
  const list = byId('score-history')
  list.replaceChildren()
  for (const r of [...ledger.values()].reverse()) {
    const item = element('li')
    const names = ids => ids.length ? ids.join(', ') : 'neither'
    item.append(element('strong', `${r.id} · ${r.title} · ${r.points} pts`),
      element('p', `Impact: you chose ${names(r.predicted)}. Actual loss: ${names(r.actual)}. Risk: you chose ${r.predictedRisk}. Matrix: ${r.actualRisk}.`),
      element('small', r.assisted ? `Assisted · ${r.help.join(', ')}` : 'Independent first forecast'))
    if (r.arcade?.evidence || r.arcade?.board) {
      const ticket = questionById(r.id), rows = evaluate(ticket)
      const details = element('details')
      details.append(element('summary', 'Review decision evidence'))
      const probe = evidenceQuestion(ticket, rows)
      if (r.arcade.evidence) {
        const cited = probe.options.find(o => o.id === r.arcade.evidence)
        details.append(element('p', 'You cited: ' + (cited?.label || r.arcade.evidence)),
          element('p', 'Decisive evidence: ' + probe.decisive))
      }
      if (r.arcade.board) {
        const brief = decisionBrief(ticket, rows)
        details.append(element('p', 'You chose ' + r.arcade.board + '. Board ruling: ' + brief.action + '. ' + brief.reason))
      }
      item.append(details)
    }
    const review = element('button','Practice this ticket','review-ticket')
    review.onclick = () => mount(questionById(r.id), true)
    item.append(review)
    list.append(item)
  }
  if (!score.total) list.append(element('li','Commit your first ticket to start the evidence log.'))
  byId('export').disabled = !score.total
  byId('summary-heading').focus()
}

byId('export').onclick = () => {
  const report = { questionsPerRound: roundSize, campaignSize: questions.length, completedRounds: Math.floor(ledger.size / roundSize), skillPractice: Object.fromEntries(drillHistory), assessment: 'Network Automation Arcade - Network Change Roulette (CR) · simulated access and rollout risk', scoring: 'First unassisted forecast per ticket: exact impact 60, correct risk 40.', summary: scorecard(ledger), evidence: [...ledger.values()].map(record => {
    const ticket = questionById(record.id)
    const rows = evaluate(ticket)
    const probe = evidenceQuestion(ticket, rows)
    return { ...record, type: ticketTypes[kindOf(ticket)], skill: forecastSkill(ticket), readiness: ticket.readiness,
      rules: ticket.rules, network: ticket.network, branchEvidence: rows, businessImpact: decisionBrief(ticket, rows),
      citedEvidence: probe.options.find(option => option.id === record.arcade?.evidence)?.label, decisiveEvidence: probe.decisive }
  }) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = element('a')
  link.download = 'network-change-roulette-cr-scorecard.json'
  link.href = url
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
byId('open-library').onclick = () => openLibrary()
byId('open-score').onclick = showScore
byId('draw').onclick = () => drawTicket(matchingTickets())
for (const [id, label] of Object.entries(ticketTypes)) byId('type-filter').add(new Option(label, id))
byId('type-filter').onchange = fillLibrary
byId('search').oninput = fillLibrary
byId('resume').onclick = () => {
  if (roundComplete()) return showRoundResults()
  byId('summary').hidden = true
  byId('challenge').hidden = false
  byId('round-title').focus()
}
byId('restart').onclick = () => { byId('restart-dialog').returnValue = ''; byId('restart-dialog').showModal() }
byId('restart-dialog').onclose = () => {
  if (byId('restart-dialog').returnValue === 'restart') {
    ledger.clear()
    questions.splice(0, questions.length, ...catalog.slice(1))
    helpSeen.clear()
    drillHistory.clear()
    roundStart = 0
    mount(openingQuestion, true)
  }
}
try {
  const resume = restoreRun()
  if (sideRun) {
    resumeSide()
  } else if (roundComplete()) {
    current = questions.find(t => t.id === [...ledger.keys()].at(-1))
    updateHud()
    showRoundResults()
  } else {
    mount(resume || (ledger.size === 0 ? openingQuestion : questions.find(t => !ledger.has(t.id))))
  }
} catch (error) {
  byId('unavailable').hidden = false
  byId('load-error').textContent = error.message
}
