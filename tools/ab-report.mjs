#!/usr/bin/env node
// Lab, Measurement: compares what prompts cost with Auto (the judge's effort) against the A/B control (the app's own
// effort, as without Smart Token Saver), from the log in ~/.claude/smarttokensaver/usage/.
//
//   node tools/ab-report.mjs [--since 2026-11-18] [--haiku-ratio 0.2] [--dir ~/.claude/smarttokensaver/usage]
//
// Cost is in input-token equivalents of the chat model (input 1, cache write 1.25, cache read 0.1, output 5), the
// same weights the plugin uses. A prompt's cost is every request until the next judged prompt, follow-ups included.
// The Auto arm also pays for the judge: its tokens times --haiku-ratio (Haiku price / chat-model price per token).
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
)
const dir = (args.dir ?? join(homedir(), '.claude', 'smarttokensaver', 'usage')).replace(/^~/, homedir())
const since = args.since ? new Date(args.since).getTime() : 0
const haikuRatio = Number(args['haiku-ratio'] ?? 0.2)

const files = []
if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith('.jsonl')) files.push(join(dir, f))

const prompts = new Map()
const requests = new Map() // key: prompt id + ts, so a file written again does not count twice
for (const file of files) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let r
    try {
      r = JSON.parse(line)
    } catch {
      continue
    }
    if (new Date(r.ts).getTime() < since) continue
    if (r.type === 'prompt') prompts.set(r.id, { ...r, cost: 0, requests: 0, redoneNext: false })
    if (r.type === 'request' && r.prompt) requests.set(`${r.prompt}|${r.ts}|${r.out}|${r.read}`, r)
  }
}
for (const r of requests.values()) {
  const p = prompts.get(r.prompt)
  if (!p) continue
  p.cost += r.cost
  p.requests += 1
}
// A prompt that reads like "that's wrong, redo it" marks the prompt before it in the same chat as a miss.
const byChat = new Map()
for (const p of [...prompts.values()].sort((a, b) => a.ts.localeCompare(b.ts))) {
  const prev = byChat.get(p.chat)
  if (prev && p.redo) prev.redoneNext = true
  byChat.set(p.chat, p)
}

// Only the experiment: prompts logged while a control share was on (share > 0). Auto prompts from a time without a
// control group would compare different weeks, not different arms.
const arms = { auto: [], control: [] }
const dropped = { noRequests: { auto: 0, control: 0 }, outside: 0 }
for (const p of prompts.values()) {
  if (!(p.arm in arms)) continue
  if (!(Number(p.share) > 0)) {
    dropped.outside += 1
    continue
  }
  if (p.requests === 0) {
    dropped.noRequests[p.arm] += 1
    continue
  }
  const judge = p.arm === 'auto' ? (p.judgeTokens ?? 0) * haikuRatio : 0
  arms[p.arm].push({ ...p, total: p.cost + judge })
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const median = xs => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const fmt = n => (Number.isFinite(n) ? (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0)) : '-')
const pct = n => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)} %` : '-')

// Bootstrap of the relative difference of the means (auto / control - 1), 95 % interval. Whole chats are resampled:
// prompts of one chat share its context and cache, so they are not independent.
function bootstrap(prompts, rounds = 4000) {
  const chats = new Map()
  for (const p of prompts) chats.set(p.chat, [...(chats.get(p.chat) ?? []), p])
  const list = [...chats.values()]
  if (list.length < 2) return [NaN, NaN]
  const out = []
  for (let i = 0; i < rounds; i++) {
    let sa = 0, na = 0, sc = 0, nc = 0
    for (let j = 0; j < list.length; j++) {
      for (const p of list[Math.floor(Math.random() * list.length)]) {
        if (p.arm === 'auto') (sa += p.total), na++
        else (sc += p.total), nc++
      }
    }
    if (na && nc) out.push(sa / na / (sc / nc) - 1)
  }
  if (out.length < rounds / 2) return [NaN, NaN]
  out.sort((x, y) => x - y)
  return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]]
}

const A = arms.auto.map(p => p.total)
const C = arms.control.map(p => p.total)
const chatsIn = new Set([...arms.auto, ...arms.control].map(p => p.chat)).size
const counts = xs => xs.reduce((m, p) => ({ ...m, [p.applied]: (m[p.applied] ?? 0) + 1 }), {})
const redoRate = xs => (xs.length ? xs.filter(p => p.redoneNext).length / xs.length : NaN)

console.log(`Smart Token Saver A/B, ${files.length} log files in ${dir}${since ? `, since ${args.since}` : ''}`)
console.log(`Judge tokens counted at ${haikuRatio} of a chat-model token (--haiku-ratio).\n`)
console.log('| Arm | Prompts | Mean cost | Median cost | Efforts run | Redo rate |')
console.log('| --- | --- | --- | --- | --- | --- |')
for (const [name, xs] of Object.entries(arms)) {
  const costs = xs.map(p => p.total)
  console.log(`| ${name} | ${xs.length} | ${fmt(mean(costs))} | ${fmt(median(costs))} | ${JSON.stringify(counts(xs))} | ${pct(redoRate(xs)).replace('+', '')} |`)
}
const diff = mean(A) / mean(C) - 1
const [lo, hi] = bootstrap([...arms.auto, ...arms.control])
console.log(`\nAuto vs control, mean cost per prompt: ${pct(diff)} (95 % interval ${pct(lo)} to ${pct(hi)}, ${chatsIn} chats resampled)`)
console.log(`Left out: ${dropped.outside} prompts logged with the control off; prompts with no logged request: auto ${dropped.noRequests.auto}, control ${dropped.noRequests.control}.`)
console.log('The judge also runs for control prompts (to log what it would pick); only Auto is charged for it, as without Smart Token Saver there is no judge.')
if (C.length < 30 || A.length < 30) console.log('Too few prompts for a firm answer yet: aim for at least 30 control prompts.')
else if (hi < 0) console.log('Auto is cheaper, and the interval stays below zero.')
else if (lo > 0) console.log('Auto is dearer, and the interval stays above zero.')
else console.log('No clear difference yet: the interval spans zero.')
const agree = arms.control.filter(p => p.judged === p.app).length
if (arms.control.length) console.log(`In the control arm the judge would have picked the app's effort ${agree} of ${arms.control.length} times.`)
console.log('\nRedo rate: share of prompts whose next message in the chat read like "that is wrong, again" (a rough quality signal).')
