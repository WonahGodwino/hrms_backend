// Writes docs/api/openapi.json and docs/api/endpoints.md from the route files (DOC-003).
//   npm run docs:api            regenerate
//   npm run docs:api -- --check exit 1 if the committed files are out of date
import fs from 'node:fs'
import path from 'node:path'
import { buildApiReference } from '../src/app/lib/docs/api-reference'

const backendDir = path.resolve(__dirname, '..')
const repoDir = path.resolve(backendDir, '..')
const check = process.argv.includes('--check')
let stale = 0
for (const [rel, content] of Object.entries(buildApiReference(backendDir))) {
  const target = path.join(repoDir, rel)
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (current === content) continue
  if (check) {
    console.error(`${rel} is out of date. Run: cd backend && npm run docs:api`)
    stale++
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
    console.log(`wrote ${rel}`)
  }
}
if (stale) process.exit(1)
