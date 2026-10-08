// Renders scripts/pwa-icons/icon.svg into the PNG icons the PWA manifest and
// iOS need, plus public/favicon.svg. Run after changing the art:
//
//   node scripts/pwa-icons/generate.mjs
//
// Needs Google Chrome (headless screenshot; override with CHROME_PATH). The
// outputs are committed, so builds do not need Chrome.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PUBLIC = resolve(HERE, '../../public')

const CHROME = process.env.CHROME_PATH ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync)
if (!CHROME) {
  console.error('Google Chrome not found. Set CHROME_PATH to a Chrome or Chromium binary.')
  process.exit(1)
}

const icon = readFileSync(join(HERE, 'icon.svg'), 'utf8')
const badge = readFileSync(join(HERE, 'badge.svg'), 'utf8')
// [file, size, art, transparent background]
const SIZES = [
  ['pwa-192.png', 192, icon, false],
  ['pwa-512.png', 512, icon, false],
  ['apple-touch-icon.png', 180, icon, false],
  // Android's notification badge: a monochrome shape on transparency.
  ['pwa-badge.png', 96, badge, true],
]

const tmp = mkdtempSync(join(tmpdir(), 'pwa-icons-'))
try {
  for (const [name, size, svg, clear] of SIZES) {
    const html = join(tmp, `${name}.html`)
    writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div>
    </body></html>`)
    const out = join(PUBLIC, name)
    execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      ...(clear ? ['--default-background-color=00000000'] : []),
      `--window-size=${size},${size}`, `--screenshot=${out}`, `file://${html}`], { stdio: 'ignore' })
    if (!existsSync(out)) throw new Error(`Chrome did not write ${out}`)
    console.log(`public/${name}`)
  }
  copyFileSync(join(HERE, 'icon.svg'), join(PUBLIC, 'favicon.svg'))
  console.log('public/favicon.svg')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
