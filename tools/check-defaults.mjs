#!/usr/bin/env node
// Checks that hooks/defaults.ts lists exactly the defaults plugin.json declares. readConfig's own fallbacks are checked
// against hooks/defaults.ts by the test suite, so together the code and the manifest cannot drift apart.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8'))
const declared = Object.fromEntries(
  Object.entries(manifest.userConfig ?? {})
    .filter(([, v]) => v.default !== undefined)
    .map(([k, v]) => [k, String(v.default)]),
)
const source = readFileSync(join(root, 'hooks/defaults.ts'), 'utf8')
const body = source.match(/CONFIG_DEFAULTS[^=]*=\s*(\{[\s\S]*?\n\})/)
if (!body) {
  console.error('check-defaults: CONFIG_DEFAULTS not found in hooks/defaults.ts')
  process.exit(1)
}
const code = JSON.parse(body[1])
const keys = [...new Set([...Object.keys(declared), ...Object.keys(code)])].sort()
const diff = keys.filter(k => declared[k] !== code[k])
if (diff.length) {
  for (const k of diff) console.error(`check-defaults: ${k}: plugin.json ${JSON.stringify(declared[k])}, hooks/defaults.ts ${JSON.stringify(code[k])}`)
  process.exit(1)
}
console.log(`check-defaults: ${keys.length} defaults match plugin.json`)
