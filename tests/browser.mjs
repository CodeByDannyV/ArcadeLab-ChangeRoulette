import { runChecks } from './checks.mjs'

const results = runChecks()
const passed = results.filter(result => result.passed).length
const ok = results.length > 0 && passed === results.length
const status = document.getElementById('test-status')
status.textContent = results.length
  ? `${passed}/${results.length} checks passed · ${ok ? 'PASS' : 'FAIL'}`
  : 'FAIL · No checks discovered'
status.dataset.result = ok ? 'pass' : 'fail'
const list = document.getElementById('test-results')
for (const result of results) {
  const item = document.createElement('li')
  item.textContent = result.passed ? `PASS · ${result.name}` : `FAIL · ${result.name} · ${result.message}`
  list.append(item)
}
