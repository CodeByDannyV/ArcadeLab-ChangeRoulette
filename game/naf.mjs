export function rehearsalTrace(ticket, rows, phase = 'proposed') {
  if (phase !== 'proposed' && phase !== 'rollback') {
    throw new Error('Unknown rehearsal phase: ' + phase)
  }
  const rollback = phase === 'rollback'
  const probes = rows.map(branch => {
    const path = rollback ? branch.before : branch.after
    const observedAccess = path !== null
    return {
      id: branch.id,
      site: branch.name,
      expectedAccess: branch.intendedAccess,
      observedAccess,
      path,
      matchesIntent: observedAccess === branch.intendedAccess,
    }
  })
  const mismatches = probes.filter(probe => !probe.matchesIntent)
  let nextAction
  if (mismatches.length) {
    const sites = mismatches.map(probe => probe.site).join(' and ')
    nextAction = rollback
      ? `The baseline restores the earlier access at ${sites}. Revise the change and repeat the HTTPS checks there to meet the new intent.`
      : `Inspect the proposed configuration for ${sites} and repeat the HTTPS checks to the ${ticket.destination} before expanding the rollout.`
  } else {
    nextAction = rollback
      ? 'Record the verified recovery path for each site in the rollback plan.'
      : 'Check the estimated recovery time against the service tolerance before deciding whether to proceed.'
  }
  return {
    phase,
    probes,
    matchingCount: probes.length - mismatches.length,
    event: mismatches.length ? 'Intent discrepancy' : 'Intent matched',
    nextAction,
  }
}
