import { campaignChecks } from './campaign.mjs'
import { round } from '../game/round.mjs'
import { contains, evaluate } from '../game/policy.mjs'
import { createSession } from '../game/session.mjs'

function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function rejects(fn, pattern) {
  try {
    fn()
  } catch (error) {
    if (pattern.test(error.message)) return
    throw error
  }
  throw new Error('Expected invalid evidence to be rejected')
}

export const checks = [
  ['Recorded baseline and post-change verdicts', () => {
    equal(evaluate(round).map(({ id, before, after }) => [id, before, after]),
      [['tucson', 'TUC-TEST', null], ['phoenix', 'PHX-PROD', 'PHX-PROD']])
  }],
  ['Exact Tucson-only prediction', () => {
    const game = createSession(evaluate(round))
    equal(game.commit(['tucson']).correct, true)
    equal(game.advance(), { completed: 1, attempts: 1, intentMet: true, help: [], independent: true })
  }],
  ['Both branches is incorrect and Phoenix still matches', () => {
    const replay = createSession(evaluate(round)).commit(['phoenix', 'tucson'])
    equal(replay.correct, false)
    equal(replay.intentMet, true)
    equal(replay.rows.filter(row => row.mismatch).map(row => [row.id, row.after]),
      [['phoenix', 'PHX-PROD']])
  }],
  ['Adjacent CIDR boundary and unsigned high-bit CIDR', () => {
    equal(contains('10.42.8.0/24', '10.42.8.255'), true)
    equal(contains('10.42.8.0/24', '10.42.9.0'), false)
    equal(contains('10.42.9.0/24', '10.42.9.0'), true)
    equal(contains('203.0.113.4/32', '203.0.113.4'), true)
    equal(contains('0.0.0.0/0', '255.255.255.255'), true)
  }],
  ['A correct zero-impact prediction can still miss change intent', () => {
    const fixture = { ...round, rules: round.rules.map(rule => ({ ...rule, remove: false })) }
    const game = createSession(evaluate(fixture))
    equal(game.commit(null), null)
    const replay = game.commit([])
    equal(replay.correct, true)
    equal(replay.intentMet, false)
    equal(replay.rows.map(row => [row.id, row.meetsIntent]), [['tucson', false], ['phoenix', true]])
    equal(game.advance().attempts, 1)
  }],
  ['An overlapping kept rule preserves access', () => {
    const fixture = { ...round, rules: [...round.rules, { id: 'BACKUP', source: '10.42.0.0/16', remove: false }] }
    equal(evaluate(fixture)[0].after, 'BACKUP')
  }],
  ['Invalid input consumes no attempt', () => {
    const game = createSession(evaluate(round))
    equal(game.commit(null), null)
    equal(game.commit(['bad-id']), null)
    equal(game.commit(['tucson', 'tucson']), null)
    equal(game.commit([]).correct, false)
    equal(game.attempts, 1)
  }],
  ['Retry, help and duplicate commit guards', () => {
    const game = createSession(evaluate(round))
    equal(game.commit(['phoenix']).correct, false)
    equal(game.commit(['tucson']), null)
    equal(game.advance(), null)
    equal(game.retry(), true)
    game.useHelp('hint')
    game.useHelp('hint')
    game.useHelp('solution')
    equal(game.commit(['tucson']).correct, true)
    equal(game.retry(), false)
    equal(game.commit(['tucson']), null)
    equal(game.advance(), { completed: 1, attempts: 2, intentMet: true, help: ['hint', 'solution'], independent: false })
    equal(game.advance(), null)
  }],
  ['Viewed help affects first-try mastery', () => {
    const game = createSession(evaluate(round))
    game.useHelp('hint')
    game.commit(['tucson'])
    equal(game.advance().independent, false)
  }],
  ['Invalid fixture fails validation', () => {
    rejects(() => evaluate({ ...round, branches: [{ ...round.branches[0], ip: '10.42.300.1' }] }), /IPv4/)
    rejects(() => evaluate({ ...round, rules: [{ ...round.rules[0], source: '10.42.8.75/24' }] }), /network address/)
    rejects(() => evaluate({ ...round, rules: [round.rules[0]] }), /baseline/)
    rejects(() => evaluate({ ...round, branches: [round.branches[0], round.branches[0]] }), /unique/)
    rejects(() => evaluate({ ...round, rules: [round.rules[0], round.rules[0]] }), /unique/)
    rejects(() => evaluate({ ...round, hint: '' }), /text/)
    rejects(() => evaluate({ ...round, branches: [{ ...round.branches[0], intendedAccess: undefined }] }), /intent/)
  }],
]

export function runChecks() {
  return [...checks, ...campaignChecks].map(([name, check]) => {
    try {
      check()
      return { name, passed: true }
    } catch (error) {
      return { name, passed: false, message: error.message }
    }
  })
}
