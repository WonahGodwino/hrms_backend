// One-off maintenance script for SEC-003 and SEC-019. Run on each server from backend/.
//
//   node scripts/move-candidate-docs-private.js                    # copy only (safe, repeatable)
//   node scripts/move-candidate-docs-private.js --delete-originals # copy, verify, then delete from public/
//
// Copies candidate onboarding documents, executed contracts, company
// handbooks and certification documents from public/
// (served to anyone by Next.js) to uploads/ (private). Stored database paths
// do not change: the API reads uploads/ first and falls back to public/, so
// the copy can be done before or after deploying the code change.
//
// Delete the originals once the copy has succeeded. Any file left under
// public/ at build time is served publicly by the next `next build`.
// No database access.
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const FOLDERS = [path.join('candidate-docs'), path.join('offers', 'executed'), path.join('company'), path.join('uploads', 'certifications')]
// Under public/company only the handbook folders are documents; anything else is left alone.
const include = (rel) => !rel.startsWith('company' + path.sep) || rel.split(path.sep).includes('handbook')
const deleteOriginals = process.argv.includes('--delete-originals')

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

let copied = 0
let skipped = 0
let deleted = 0
let failed = 0

for (const folder of FOLDERS) {
  const from = path.join(ROOT, 'public', folder)
  for (const src of walk(from)) {
    const rel = path.relative(path.join(ROOT, 'public'), src)
    if (!include(rel)) continue
    // public/uploads/... keeps its /uploads/... URL, so it moves to uploads/... (not uploads/uploads/...).
    const dest = rel.startsWith('uploads' + path.sep) ? path.join(ROOT, rel) : path.join(ROOT, 'uploads', rel)
    try {
      if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) {
        skipped++
      } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
        copied++
      }
      if (deleteOriginals) {
        if (fs.statSync(dest).size !== fs.statSync(src).size) throw new Error('size mismatch after copy')
        fs.unlinkSync(src)
        deleted++
      }
    } catch (err) {
      failed++
      console.error(`Failed: ${rel}: ${err.message}`)
    }
  }
}

console.log(`Copied ${copied}, already present ${skipped}, deleted from public/ ${deleted}, failed ${failed}.`)
if (!deleteOriginals && copied + skipped > 0) {
  console.log('Originals are still under public/. Re-run with --delete-originals once the copy is confirmed.')
}
process.exitCode = failed ? 1 : 0
