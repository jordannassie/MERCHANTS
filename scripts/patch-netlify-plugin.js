/**
 * Patches a missing `mkdir` call in @netlify/plugin-nextjs v5.
 * The `replaceFunctionsConfigManifest` function in the plugin calls
 * `writeFile(destPath)` without first ensuring the parent directory exists,
 * causing "Could not patch functions config manifest file" during local deploys.
 *
 * This patch mirrors the pattern already used in `replaceMiddlewareManifest`
 * in the same file.  Run once after `npm install`.
 */

const fs = require('fs')
const path = require('path')

const FILE = path.join(
  __dirname,
  '../node_modules/@netlify/plugin-nextjs/dist/build/content/server.js',
)

if (!fs.existsSync(FILE)) {
  console.log('[patch-netlify-plugin] plugin not installed, skipping.')
  process.exit(0)
}

const src = fs.readFileSync(FILE, 'utf8')

const OLD = 'const newData = JSON.stringify(newManifest);\n    await writeFile(destPath, newData);'
const NEW = [
  'const newData = JSON.stringify(newManifest);',
  '    await (await import("node:fs/promises")).mkdir((await import("node:path")).dirname(destPath), { recursive: true });',
  '    await writeFile(destPath, newData);',
].join('\n')

if (src.includes(NEW)) {
  console.log('[patch-netlify-plugin] already patched, nothing to do.')
  process.exit(0)
}

if (!src.includes(OLD)) {
  console.warn('[patch-netlify-plugin] expected pattern not found — plugin may have been updated. Skipping patch.')
  process.exit(0)
}

fs.writeFileSync(FILE, src.replace(OLD, NEW))
console.log('[patch-netlify-plugin] patched successfully.')
