import { runChecks } from './checks.mjs'

const results = runChecks()
for (const result of results) {
  console.log(result.passed ? `PASS ${result.name}` : `FAIL ${result.name}: ${result.message}`)
}
const passed = results.filter(result => result.passed).length
console.log(`${passed}/${results.length} checks passed`)
process.exitCode = Number(!results.length || passed !== results.length)
