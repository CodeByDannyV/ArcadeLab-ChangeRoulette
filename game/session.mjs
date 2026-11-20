export function createSession(outcomes, expectedRisk) {
  const validIds = new Set(outcomes.map(row => row.id))
  const intentMet = outcomes.every(row => row.meetsIntent)
  const help = new Set()
  let phase = 'prediction'
  let attempts = 0

  return {
    get attempts() {
      return attempts
    },
    useHelp(kind) {
      if (phase === 'prediction' || phase === 'retry') help.add(kind)
    },
    commit(selection, risk) {
      if (phase !== 'prediction' || !Array.isArray(selection)) return null
      if (expectedRisk && !['Low', 'Moderate', 'High'].includes(risk)) return null
      const predicted = new Set(selection)
      if (predicted.size !== selection.length || selection.some(id => !validIds.has(id))) return null

      const rows = outcomes.map(row => ({
        ...row,
        mismatch: predicted.has(row.id) !== (row.after === null),
      }))
      const impactCorrect = rows.every(row => !row.mismatch)
      const riskCorrect = !expectedRisk || expectedRisk === risk
      const correct = impactCorrect && riskCorrect
      attempts += 1
      phase = correct ? 'solved' : 'retry'
      return { correct, impactCorrect, riskCorrect, intentMet, rows }
    },
    retry() {
      if (phase !== 'retry') return false
      phase = 'prediction'
      return true
    },
    advance() {
      if (phase !== 'solved') return null
      phase = 'finished'
      return { completed: 1, attempts, intentMet, help: [...help], independent: attempts === 1 && help.size === 0 }
    },
  }
}
