import { execSync } from 'child_process'
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const REPORTS_DIR = 'reports'
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

mkdirSync(REPORTS_DIR, { recursive: true })

if (existsSync(REPORTS_DIR)) {
  for (const f of readdirSync(REPORTS_DIR)) {
    if (f.endsWith('.html') || f.endsWith('.json')) {
      rmSync(join(REPORTS_DIR, f))
    }
  }
}

const results = []

function run(label, cmd, reportFile) {
  console.log(`\n🏃 Running ${label}...`)
  try {
    execSync(cmd, { stdio: 'inherit' })
    results.push({ label, status: '✅ PASSED', report: reportFile })
  } catch {
    results.push({ label, status: '❌ FAILED', report: reportFile })
  }
}

const vitestReport = `unit_vitest_${timestamp}.html`
run(
  'Unit (Vitest)',
  `npx vitest run --reporter=html --outputFile=${REPORTS_DIR}/${vitestReport}`,
  vitestReport
)

const playwrightReport = `e2e_playwright_${timestamp}.html`
run(
  'E2E (Playwright)',
  `npx playwright test --reporter=html --output=${REPORTS_DIR}/playwright-results`,
  playwrightReport
)

const passed = results.filter(r => r.status.includes('PASSED')).length
const failed = results.length - passed

const dashboard = `
<!DOCTYPE html>
<html>
<head>
  <title>Frontend Test Dashboard</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; margin: 40px; }
    h1 { color: #7c6af7; border-bottom: 1px solid #333; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; background: #1a1a1a; margin-top: 20px; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 20px; text-align: left; border-bottom: 1px solid #2a2a2a; }
    th { background: #222; color: #7c6af7; }
    .passed { color: #4ade80; font-weight: bold; }
    .failed { color: #f87171; font-weight: bold; }
    a { color: #7c6af7; text-decoration: none; }
    .summary { margin: 16px 0; font-size: 14px; }
  </style>
</head>
<body>
  <h1>TaskFlow Frontend — Test Dashboard</h1>
  <p>Run at: <strong>${new Date().toLocaleString()}</strong></p>
  <div class="summary">
    Total: ${results.length} &nbsp;|&nbsp;
    <span class="passed">Passed: ${passed}</span> &nbsp;|&nbsp;
    <span class="failed">Failed: ${failed}</span>
  </div>
  <table>
    <thead><tr><th>Suite</th><th>Status</th><th>Report</th></tr></thead>
    <tbody>
      ${results.map(r => `
      <tr>
        <td>${r.label}</td>
        <td class="${r.status.includes('PASSED') ? 'passed' : 'failed'}">${r.status}</td>
        <td><a href="${r.report}" target="_blank">View ↗</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
</body>
</html>
`

const dashboardFile = join(REPORTS_DIR, `dashboard_${timestamp}.html`)
writeFileSync(dashboardFile, dashboard)
console.log(`\n🎉 Done. Dashboard: ${dashboardFile}`)
if (failed > 0) process.exit(1)
