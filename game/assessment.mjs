export const riskBands = ['Low', 'Moderate', 'High']
export const rehearsals = ['Full rehearsal', 'Partial rehearsal', 'No rehearsal']
// Rows are rehearsal evidence. Columns are recovery within, up to twice, or over twice tolerance.
export const riskMatrix = [
  ['Low', 'Low', 'Moderate'],
  ['Low', 'Moderate', 'High'],
  ['Moderate', 'High', 'High'],
]

export function assessRisk({ rehearsal, recovery, tolerance }) {
  if (!Number.isInteger(rehearsal) || !riskMatrix[rehearsal] || !Number.isFinite(recovery) || recovery <= 0 ||
      !Number.isFinite(tolerance) || tolerance <= 0) throw new Error('Invalid rollout evidence')
  let exposure = 0
  if (recovery > tolerance * 2) exposure = 2
  else if (recovery > tolerance) exposure = 1
  return { band: riskMatrix[rehearsal][exposure], exposure: ['within tolerance', 'over tolerance, up to 2×', 'over 2× tolerance'][exposure] }
}

export function recordFirst(ledger, ticket, result, selected, risk, help) {
  if (ledger.has(ticket.id)) return 0
  const assisted = help.size > 0
  const points = assisted ? 0 : Number(result.impactCorrect) * 60 + Number(result.riskCorrect) * 40
  ledger.set(ticket.id, {
    id: ticket.id, title: ticket.title, points, assisted, help: [...help],
    predicted: [...selected], actual: result.rows.filter(row => row.after === null).map(row => row.id),
    predictedRisk: risk, actualRisk: assessRisk(ticket.readiness).band,
    impactCorrect: result.impactCorrect, riskCorrect: result.riskCorrect, intentMet: result.intentMet,
  })
  return points
}

export function scorecard(ledger) {
  const entries = [...ledger.values()]
  const solo = entries.filter(entry => !entry.assisted)
  let streak = 0
  let best = 0
  for (const entry of entries) {
    streak = entry.points === 100 ? streak + 1 : 0
    best = Math.max(streak, best)
  }
  return {
    total: entries.length, solo: solo.length, helped: entries.length - solo.length,
    points: entries.reduce((sum, entry) => sum + entry.points, 0),
    impact: solo.filter(entry => entry.impactCorrect).length, risk: solo.filter(entry => entry.riskCorrect).length,
    under: solo.filter(entry => riskBands.indexOf(entry.predictedRisk) < riskBands.indexOf(entry.actualRisk)).length,
    missed: solo.reduce((n, entry) => n + entry.actual.filter(id => !entry.predicted.includes(id)).length, 0),
    excess: solo.reduce((n, entry) => n + entry.predicted.filter(id => !entry.actual.includes(id)).length, 0),
    streak, best,
  }
}
