import { catalog } from '../game/catalog.mjs'
import { assessRisk, recordFirst, scorecard } from '../game/assessment.mjs'
import { sites, serviceRegions } from '../game/sites.mjs'
import { configPreview, pacFile } from '../game/configuration.mjs'
import { evaluate } from '../game/policy.mjs'
import { createSession } from '../game/session.mjs'
import { rehearsalTrace } from '../game/naf.mjs'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export const campaignChecks = [
  ['101 unique, playable tickets and mapped endpoints', () => {
    assert(catalog.length === 101 && new Set(catalog.map(t => t.id)).size === 101, 'ticket IDs')
    assert(new Set(catalog.map(t => t.title)).size === 101, 'ticket titles')
    for (const t of catalog) {
      assert(t.branches.every(b => sites[b.name]) && serviceRegions[t.destination], t.id)
      const rows = evaluate(t)
      const band = assessRisk(t.readiness).band
      const result = createSession(rows, band).commit(rows.filter(b => !b.after).map(b => b.id), band)
      assert(result.correct, t.id)
      const proposal = rehearsalTrace(t, rows)
      const rollback = rehearsalTrace(t, rows, 'rollback')
      assert(proposal.matchingCount === rows.filter(b => b.meetsIntent).length, t.id + ' proposal intent')
      assert(rollback.probes.every((probe, i) => probe.path === rows[i].before &&
        probe.matchesIntent === (Boolean(rows[i].before) === rows[i].intendedAccess)), t.id + ' rollback baseline')
    }
  }],
  ['Backup egress and staged migration use the planned source', () => {
    const backup = evaluate(catalog[41])
    const staged = evaluate(catalog[51])
    assert(backup[0].before && !backup[0].after && backup[1].after, 'Backup should lose the moving site')
    assert(staged.every(b => b.after), 'Staged migration should retain both sites')
  }],
  ['Per-site longest prefix, fallback and standby reachability', () => {
    const narrowed = evaluate(catalog[61]), withdrawn = evaluate(catalog[71])
    assert(!narrowed[0].after && narrowed[0].afterReason.includes('/32 via standby'), 'host route wins')
    assert(!withdrawn[0].after && withdrawn[0].afterReason.includes('0.0.0.0/0 via standby'), 'fallback selected')
    assert(narrowed[1].after.includes('/24 via primary'), 'unmodified peer')
    assert(evaluate(catalog[64])[1].after, 'working standby')
  }],
  ['PZEN requires a matching observed source CIDR and destination site', () => {
    const source = evaluate(catalog[82]), host = evaluate(catalog[83]), aligned = evaluate(catalog[84])
    assert(!source[1].after && source[1].afterReason.includes('192.0.2.21'), 'NAT source omitted')
    assert(!host[0].after && host[0].afterReason.includes('status.svc.example'), 'wrong allowed site')
    assert(aligned.every(b => b.after), 'updated source permit')
    assert(configPreview(catalog[83], 'after').includes('source_ip_groups'), 'source group missing from Terraform')
  }],
  ['Local PAC scopes, suffix boundaries and direct reachability', () => {
    const exact = evaluate(catalog[91]), domain = evaluate(catalog[92]), unrelated = evaluate(catalog[93])
    assert(!exact[0].after && exact[1].after === 'DIRECT', 'same file, different direct routes')
    assert(domain[0].after.startsWith('PROXY') && !domain[1].after, 'scoped workstation rollout')
    assert(unrelated.every(b => b.after.startsWith('PROXY')), 'unrelated host added')
    const model = catalog[92].network
    // Exercise the actual local-machine file with the PAC host helper supplied by a browser.
    const decide = new Function('dnsDomainIs', pacFile(model, 'after') + '\nreturn FindProxyForURL;')((host, suffix) => host.endsWith(suffix))
    for (const [host, direct] of [['SVC.EXAMPLE',true],['a.svc.example',true],['notsvc.example',false],['svc.example.invalid',false]]) {
      assert((decide('https://' + host, host) === 'DIRECT') === direct, host)
    }
  }],
  ['Risk matrix boundaries include the exact recovery deadline', () => {
    const band = (recovery, rehearsal) => assessRisk({ recovery, rehearsal, tolerance: 10 }).band
    assert(band(10, 1) === 'Low' && band(11, 1) === 'Moderate', 'tolerance boundary')
    assert(band(20, 1) === 'Moderate' && band(21, 1) === 'High', 'twice tolerance')
    assert(band(5, 2) === 'Moderate' && band(30, 0) === 'Moderate', 'mixed evidence')
  }],
  ['Risk and impact earn points independently, once per ticket', () => {
    const t = catalog[0], rows = evaluate(t)
    for (const [pick, risk, expected] of [[['tucson'],'Low',100],[[],'Low',40],[['tucson'],'High',60],[[],'High',0]]) {
      const ledger = new Map()
      const game = createSession(rows, 'Low')
      assert(game.commit(pick, '') === null && game.attempts === 0, 'incomplete forecast')
      const result = game.commit(pick, risk)
      assert(recordFirst(ledger,t,result,pick,risk,new Set()) === expected, 'point allocation')
      assert(recordFirst(ledger,t,result,pick,risk,new Set()) === 0 && ledger.size === 1, 'repeat credit')
      assert(scorecard(ledger).points === expected, 'ledger total')
    }
  }],
  ['Assistance stays visible and outside independent accuracy', () => {
    const t = catalog[0]
    const ledger = new Map()
    const result = createSession(evaluate(t), 'Low').commit(['tucson'], 'Low')
    recordFirst(ledger,t,result,['tucson'],'Low',new Set(['solution']))
    const s = scorecard(ledger)
    assert(s.total === 1 && s.helped === 1 && s.points === 0 && s.solo === 0 && !s.impact && !s.risk, 'assisted case')
  }],
  ['Missed outages, false alarms and underestimated risk are visible', () => {
    const t = catalog[1]
    const ledger = new Map()
    const riskier = { ...t, readiness: { rehearsal: 2, recovery: 50, tolerance: 10, workflow: 'Test service' } }
    const result = createSession(evaluate(t), 'High').commit(['boise'], 'Low')
    recordFirst(ledger,riskier,result,['boise'],'Low',new Set())
    const s = scorecard(ledger)
    assert(s.missed === 1 && s.excess === 1 && s.under === 1, 'diagnostics')
  }],
]
