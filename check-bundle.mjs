/*
The faces reach a visitor through a remote @import, which CSS requires at the
top of the bundled sheet. Vite hoists it today; nothing in the source says it
has to, so a tooling upgrade could reorder or drop it and every site would
quietly render its fallback stack.

The scaffold ships no faces — the first turn writes them — so this builds
against a probe rather than the default, restores it, and asserts what the
browser would actually receive.
*/
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const FONTS = 'src/fonts.css'
const PROBE =
  '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap");\n'

const original = await readFile(FONTS, 'utf8')
try {
  await writeFile(FONTS, PROBE)
  execFileSync('node_modules/.bin/vite', ['build'], { stdio: 'pipe' })

  const dir = 'dist/assets'
  const sheets = (await readdir(dir)).filter((f) => f.endsWith('.css'))
  if (sheets.length !== 1) {
    throw new Error(`expected one bundled stylesheet in ${dir}, found ${sheets.length}: ${sheets}`)
  }
  const css = await readFile(join(dir, sheets[0]), 'utf8')

  const at = css.indexOf('@import')
  if (at < 0) {
    throw new Error('no @import survived the bundle: every site would render its fallback fonts')
  }
  // Anything ahead of it makes the at-rule invalid, and the browser drops it.
  const before = css.slice(0, at).trim()
  if (before !== '') {
    throw new Error(`something precedes the font @import, which invalidates it:\n${before.slice(0, 200)}`)
  }
  const url = /@import\s+(?:url\(\s*)?["']?([^"')\s]+)/i.exec(css.slice(at))?.[1]
  if (!url || new URL(url).host !== 'fonts.googleapis.com') {
    throw new Error(`the bundle's first import is ${url}, which is not the face host`)
  }
  console.log(`the bundled stylesheet keeps its font import first: ${url}`)
} finally {
  await writeFile(FONTS, original)
}
