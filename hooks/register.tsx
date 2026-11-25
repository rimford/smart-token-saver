import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelForkResult, Register, RenderInput } from 'claude-code'

import type { AgentRec, Effort, HandoffAfter, HandoffChoice, ModelKey, Pick, SettingsDraft, Spent } from '../types'
import { agentsPane, demoAgents, demoFiles, demoSteps, importsOf, relPath, toolLine, touchOf, withTouch, withWaits } from './agents'
import { ART_COLUMNS, ART_FRAME_MS, ART_MIN_WIDTH, ART_ROWS, type ArtKind, artFrame, MOVING } from './art'
import { MARK_SVG } from './brand-mark'
import { markLogoSvg, MARK_PULSE_MS } from './brand-head'
import { accent, switchOn, BRAND_ORANGE, highlight, isAdaptive, isLight, palette, parts, pinned, setAdaptive, setLight, setPinned, setTheme, themedEls, type ThemeName, THEMES, tintHex } from './theme'
import { BUTTON_BOX, type Choice, fieldBacking, paintedLink, paintedOptions, paintedTrigger, type Parts, slotArt, slotHead, slotShell, slotTint, slotWash } from './pinned'
import { PILL_H, stepsFromTodos, thinkingSvg, THINK_W, withTaskCreated, withTaskUpdated } from './progress'

import { CREDIT, DATA_DIR, DEFAULT_THEME, GUIDE_URL, ISSUES_URL, OWN_VERSION, PLUGIN, PRODUCT_NAME, SUPPORT_HINT, UPSTREAM_BASE, UPSTREAM_NAME, UPSTREAM_URL } from './names'
export { CREDIT, DATA_DIR, GUIDE_URL, OWN_VERSION, PLUGIN, PRODUCT_NAME, SUPPORT_HINT, UPSTREAM_BASE, UPSTREAM_NAME, UPSTREAM_URL }

/**
 * A model as every visible text names it: family and version from its id, "claude-opus-5-5[1m]" -> "Opus 5.5",
 * "claude-haiku-4-5-20251001" -> "Haiku 4.5". Undefined for an id it cannot read. One place, so a new model version
 * shows with its number without touching any text.
 */
export function modelDisplayName(id: string): string | undefined {
  const m = String(id).toLowerCase().match(/(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?=$|\D)/)
  if (!m || !m[1]) return undefined
  return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}
// The ladders the two sliders walk, cheapest first. The ids are the one place a model's version is written; the labels
// come from them (modelDisplayName).
const MODEL_IDS: { key: ModelKey; id: string }[] = [
  { key: 'haiku', id: 'claude-haiku-5-5' },
  { key: 'sonnet', id: 'claude-sonnet-5-5' },
  { key: 'opus', id: 'claude-opus-5-5' },
  { key: 'fable', id: 'claude-fable-5-2' },
]
export const MODELS: { key: ModelKey; label: string; long: string; id: string }[] = MODEL_IDS.map(m => {
  const name = modelDisplayName(m.id) ?? m.key
  return { ...m, label: name, long: name }
})
/** Haiku as the texts name it, with its version: it judges every prompt and writes cold summaries. */
export const HAIKU = MODELS[0]!.label
const SONNET = MODELS[1]!.label
export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
// What one token costs relative to an uncached input token, at the ratios of Opus 5.5 and Sonnet 5.5 (cache reads at
// 5 % of input, output at five times). A rough weighting, not a bill: Fable 5.2 reads its cache cheaper (2.5 %), models
// before 5.5 dearer (10 %). Measured over
// 80k requests of real Claude Code use, cache reads are about 76% of a session's cost, cache writes 16% and output 8%: effort
// mostly changes how many tool calls a prompt makes, not what one answer writes, so all four are counted.
const WEIGHT = { input: 1, write: 1.25, write1h: 2, read: 0.05, out: 5 }
type PricedUsage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } | null }
/** What a request's cache writes cost, in input-token terms: 5-minute writes at 1.25, 1-hour writes at 2. Writes the
 *  usage does not split count as 1-hour ones, which is what Claude Code writes. */
export function writeCost(usage: PricedUsage): number {
  const h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const m = usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
  const rest = Math.max(0, (usage.cache_creation_input_tokens ?? 0) - h - m)
  return m * WEIGHT.write + (h + rest) * WEIGHT.write1h
}
// Changing effort between two requests keeps the prompt cache on these models only: Claude Code states the level in a
// message of its own there, after the cached chat. Measured on each of the four (21.11.2026, Claude Code 2.1.330,
// tools/effort-cache-probe): after every switch 99-100% of the chat was still read from the cache. On Fable 5.1 and
// older Opus the next request rewrote 56-100% of the cache (measured), which costs more than any effort can save.
// A new model joins the list once the probe has run on it.
export const cacheSafe = (modelId: string) => /(opus|sonnet|haiku)-5-5|fable-5-2/.test(modelId)
/** A Haiku before 5.5 takes no effort at all. */
export const noEffort = (modelId: string) => modelId.includes('haiku') && !cacheSafe(modelId)
// The accent the effort in the footer is written in: the brand violet, or Claude orange when the theme says so.
let ACCENT = accent()
// The drawing that has the turn (see drawTurn), and a change of look that came while it drew. The theme and the
// appearance are module-wide (theme.ts, the colours below): changed under a drawing that waits on the store, its shell
// would be in the old look and its text and buttons in the new one. So a change waits for the drawing to end.
let drawOwner: object | null = null
let lookDue: 'theme' | 'appearance' | null = null
/** Applies a look change that waited for a drawing. */
function applyDueLook() {
  const due = lookDue
  lookDue = null
  if (due === 'theme') applyThemeNow()
  else if (due === 'appearance') applyAppearanceNow()
}
/** Takes the theme the settings name; the accent and every drawing follow it. Between drawings only. */
function applyTheme() {
  if (drawOwner !== null) lookDue = 'theme'
  else applyThemeNow()
}
function applyThemeNow() {
  setTheme(config.theme)
  ACCENT = accent()
  BRAND_BG = tintHex('#15121f')
  BRAND_EDGE = tintHex('#4a3f80')
  BRAND_HEAD = tintHex('#221c3a')
  // The panel greys lean blue beside the violet; the other themes use the app's own neutral greys; navy & orange draws
  // its panels in dark navy.
  const data = config.theme === 'navy'
  const neutral = config.theme !== 'violet'
  // Navy & orange painted dark (Always dark) takes the app's own dark greys, not navy.
  DASH_BG = data ? '#262624' : neutral ? '#151515' : '#141416'
  DASH_EDGE = data ? '#3d3d3a' : neutral ? '#2a2a2a' : '#2a2a2f'
  DASH_HEAD = data ? '#30302e' : neutral ? '#191919' : '#18181b'
  CARD_HOVER = data ? '#2f2f2c' : neutral ? '#1c1c1c' : '#1c1c20'
  CARD_HOVER_EDGE = data ? '#4a4a46' : neutral ? '#3b3b3b' : '#3b3b42'
  HOVER_BOX = data ? '#3a3a37' : neutral ? '#2b2b2b' : '#2b2b2f'
  applyAppearanceNow()
}

// Always dark / Always light colour this plugin's panels only, never the app. A build that was
// never released switched the whole app through $.theme.set({ overrideColorScheme }); only a maintainer's clone ever
// ran it. There, a person's change of the Panels setting clears that override once, so a session that still carries
// it gets its own look back. Never at a start or on a reload, and never in any other install: $.theme.clear() clears
// whatever theme stands, another plugin's too, and no released build has set one.
let oldSchemeCleared = false
async function clearOldScheme($: EngineInterface) {
  if (oldSchemeCleared) return
  oldSchemeCleared = true
  if (!(await maintainerClone($).catch(() => false))) return
  await $.theme.clear().catch(() => undefined)
}

// Claude Code's own theme, read from its /config row: a light one turns everything light when appearance is auto.
let claudeIsLight = false
let appearanceCheckedAt = -Infinity
function applyAppearance() {
  if (drawOwner !== null) lookDue = lookDue ?? 'appearance'
  else applyAppearanceNow()
}
function applyAppearanceNow() {
  setLight(config.appearance === 'light' || (config.appearance === 'auto' && claudeIsLight))
  // Automatic: on the desktop the panels take the app's own light or dark (theme.ts, adaptHex). Always dark and Always
  // light pin the panels to that mode: the same tree as Automatic, with the ground, the text and the controls painted
  // in that mode's colours (theme.ts, pinned.ts), and the app left as it is. The terminal keeps
  // the painted panels (themedEls turns adaptive and the pin off there).
  setPinned(config.appearance === 'auto' ? null : config.appearance)
  setAdaptive(config.appearance === 'auto')
  FLASH_COLOR = highlight()
  const data = config.theme === 'navy'
  // The swamp band takes the logo's orange (on light, lightHex keeps an orange surface orange, see theme.ts).
  BOG = data ? (isLight() ? '#A2462A' : '#F0A486') : '#a7c98f'
  BOG_BG = data ? '#2B140B' : '#111710'
  BOG_EDGE = data ? '#6B3A26' : '#3e5a33'
  BOG_WASH = data ? BRAND_ORANGE : '#6f9a4f'
  BOG_SHINE = data ? (isLight() ? '#C8603D' : '#F2B79F') : '#d6ecc2'
}
/** Reads Claude Code's theme row (at most every few seconds) and redraws when light or dark changed. */
async function refreshAppearance($: EngineInterface) {
  const now = await $.clock.now().catch(() => Date.now())
  if (now - appearanceCheckedAt < 4000) return
  appearanceCheckedAt = now
  const rows = await $.config.list().catch(() => [])
  const value = rows.find(row => row.key === 'theme')?.value
  const lightNow = typeof value === 'string' && value.startsWith('light')
  if (lightNow === claudeIsLight) return
  claudeIsLight = lightNow
  applyAppearance()
  $.ui.invalidate('ui.render')
}
let BRAND_BG = '#15121f'
let BRAND_EDGE = '#4a3f80'
// The settings panel's header bar: a shade lighter than the panel, so it reads as a title bar.
let BRAND_HEAD = '#221c3a'
// The box behind the level while it is hovered: the grey of the app's own pills.
let HOVER_BOX = '#2b2b2f'
const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'XHigh', max: 'Max' }

// Auto is two switches. `isAuto` is effort (the name stays: it is what the store and state hold);
// `isAutoModel` lets the judge suggest another model and starts off.
const isAuto = atom({ plugin: 'smarttokensaver', key: 'isAuto' } as const, true)
const EMPTY_SPENT: Spent = { prompts: 0, requests: 0, input: 0, write: 0, writeCost: 0, read: 0, out: 0, byEffort: {}, judge: { haiku: 0, ms: 0, tokens: 0 }, moved: 0, redone: 0, helpers: { runs: {}, requests: 0, cost: 0 } }
const SWITCHED_MS = 2500
// The prompt cache lives this long after the last request read or wrote it. A response may say which lifetime its
// cache writes got (usage.cache_creation: ephemeral_1h / ephemeral_5m); until one does, 1 hour is assumed: 99% of
// the cache writes in 80k requests of real Claude Code use (289k of 292k) were 1 hour.
const CACHE_TTL = { '5m': 5 * 60_000, '1h': 60 * 60_000 } as const
const CACHE_TICK_MS = 15_000
// Under this much time left the countdown turns amber: send now, or pay to write the whole context again.
// Shown minutes at or under these turn the countdown yellow, then red: grey while there is time, yellow at 20, red at 5.
const CACHE_YELLOW_MIN = 20
const CACHE_RED_MIN = 5
const ICE = '#7cc4ff'
const ICE_BG = '#0e1820'
const ICE_EDGE = '#2f5c80'
// The swamp band's colours: murky green, or in navy & orange its navy with the orange (navy on light). Set by
// applyAppearance.
let BOG = '#a7c98f'
let BOG_BG = '#111710'
let BOG_EDGE = '#3e5a33'
let BOG_WASH = '#6f9a4f'
let BOG_SHINE = '#d6ecc2'
const EMBER = '#f08a3c'
const EMBER_BG = '#1a110c'
const EMBER_EDGE = '#6a3418'
const YELLOW = '#e0a33a'
const RED = '#e5534b'
const isAutoModel = atom({ plugin: 'smarttokensaver', key: 'isAutoModel' } as const, false)
const pick = atom({ plugin: 'smarttokensaver', key: 'pick' } as const, null)
const isJudging = atom({ plugin: 'smarttokensaver', key: 'isJudging' } as const, false)
const suggestion = atom({ plugin: 'smarttokensaver', key: 'suggestion' } as const, null)
const appEffort = atom({ plugin: 'smarttokensaver', key: 'appEffort' } as const, null)
const model = atom({ plugin: 'smarttokensaver', key: 'model' } as const, null)
// The last change Auto made to the effort, shown for a moment as "Low → High" and then cleared.
const switched = atom({ plugin: 'smarttokensaver', key: 'switched' } as const, null)
// What the prompts Auto steered cost this session, measured, and what judging them took.
const saved = atom({ plugin: 'smarttokensaver', key: 'saved' } as const, EMPTY_SPENT)
// True while the session runs a model where Auto must not change effort (see cacheSafe).
const paused = atom({ plugin: 'smarttokensaver', key: 'paused' } as const, false)
// How long the main conversation's prompt cache stays warm, in whole minutes left: null before the first response,
// 0 once it has gone cold. Updated only when the minute changes, so the footer redraws once a minute at most.
const cacheLeft = atom({ plugin: 'smarttokensaver', key: 'cacheLeft' } as const, null)
const cacheMemo = atom({ plugin: 'smarttokensaver', key: 'cacheMemo' } as const, null)
const isCompacting = atom({ plugin: 'smarttokensaver', key: 'isCompacting' } as const, false)
// The compact bar: open after Compact is pressed, with a field for what the summary should keep.
const compactAsk = atom({ plugin: 'smarttokensaver', key: 'compactAsk' } as const, false)
// What is typed in that field. Kept here, not in state: a write per key would redraw the bar under the cursor.
let compactNote = ''
// When the compact bar opened: its first half second fades the swamped band's colours out (see compactFadeSvg).
let compactOpenedAt = 0
const COMPACT_FADE_MS = 450
/** The swamped band's colours over the compact bar, fading to nothing: the band seems to turn from green to violet. */
function compactFadeSvg(elapsedMs: number): string {
  return inPhase(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="240" viewBox="0 0 1600 240" preserveAspectRatio="none"><style>.f{animation:f ${COMPACT_FADE_MS / 1000}s ease-out forwards}@keyframes f{from{opacity:1}to{opacity:0}}</style><rect class="f" width="1600" height="240" fill="${BOG_BG}"/></svg>`, elapsedMs)
}
// The person closed the cold band; it comes back the next time the cache goes cold.
// The test pane of /smarttokensaver try pane.
// Where a handoff is: null idle, writing (the handoff turn runs), clearing (clear and resend).
const handoffStage = atom({ plugin: 'smarttokensaver', key: 'handoffStage' } as const, null)
// The handoff bar above the prompt, open with the choice shown in it, or null.
const handoffPick = atom({ plugin: 'smarttokensaver', key: 'handoffPick' } as const, null)
// The context is swamped: tokens read per request, or null below the line. Drives the swamp band.
const swamped = atom({ plugin: 'smarttokensaver', key: 'swamped' } as const, null)
// Why Haiku thinks a handoff would suit now, or null. It lights Handoff and says why; there is no percent threshold.
const handoffAdvice = atom({ plugin: 'smarttokensaver', key: 'handoffAdvice' } as const, null)
// The swamp band was closed at this many tokens; it comes back once the context has grown well past it.
// The handoff card above the prompt: shown from the start of a handoff, and once it lands ('done' in the
// cleared chat, 'copied'). It goes with the next message, its ✕, or HANDOFF_CARD_MS after it was set.
type HandoffCard = { kind: 'writing' | 'done' | 'copied' | 'compacting' | 'compacted'; full: boolean; at: number; seen: boolean }
// Kinds still under way: they stay until they land, with moving art. Compacting shares the card with the handoff.
const cardRunning = (kind: HandoffCard['kind']) => kind === 'writing' || kind === 'compacting'
// Kinds that landed well: the card turns green with a checkmark.
const cardLanded = (kind: HandoffCard['kind']) => kind === 'done' || kind === 'compacted'
const handoffCard = atom({ plugin: 'smarttokensaver', key: 'handoffCard' } as const, null)
const updateCard = atom({ plugin: 'smarttokensaver', key: 'updateCard' } as const, null)
const HANDOFF_CARD_MS = 2 * 60_000
// The handoff card's art while it is written: sparkles carried from left to right.
const HANDOFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.d{fill:#d9d1ff;opacity:0;animation-name:go;animation-timing-function:ease-in-out;animation-iteration-count:infinite}@keyframes go{0%{opacity:0;transform:translate(0,0)}15%{opacity:.9}85%{opacity:.7}100%{opacity:0;transform:translate(190px,0)}}.br{animation:br 2.4s ease-in-out infinite}@keyframes br{0%,100%{opacity:.75}50%{opacity:1}}</style><defs><linearGradient id="bg" x1="0" x2="1"><stop offset=".43" stop-color="#7c6cf0" stop-opacity="0"/><stop offset=".7" stop-color="#7c6cf0" stop-opacity=".2"/><stop offset="1" stop-color="#b3a6ff" stop-opacity=".46"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#bg)"/><circle class="d" cx="170" cy="9.2" r="0.83" style="animation-duration:2.7s;animation-delay:-2.2s"/><circle class="d" cx="170" cy="17.8" r="0.54" style="animation-duration:2.2s;animation-delay:-3.0s"/><circle class="d" cx="170" cy="9.7" r="0.64" style="animation-duration:3.6s;animation-delay:-1.7s"/><circle class="d" cx="170" cy="22.4" r="0.79" style="animation-duration:3.1s;animation-delay:-0.5s"/><circle class="d" cx="170" cy="18.0" r="1.02" style="animation-duration:2.9s;animation-delay:-2.7s"/><circle class="d" cx="170" cy="18.8" r="0.54" style="animation-duration:3.3s;animation-delay:-2.1s"/><circle class="d" cx="170" cy="10.6" r="0.52" style="animation-duration:3.4s;animation-delay:-1.7s"/><circle class="d" cx="170" cy="19.8" r="1.03" style="animation-duration:3.2s;animation-delay:-3.3s"/><circle class="d" cx="170" cy="12.7" r="0.98" style="animation-duration:2.8s;animation-delay:-3.4s"/><circle class="d" cx="170" cy="23.3" r="0.56" style="animation-duration:2.4s;animation-delay:-0.8s"/><circle class="d" cx="170" cy="25.2" r="0.76" style="animation-duration:3.1s;animation-delay:-1.1s"/><circle class="d" cx="170" cy="15.2" r="0.73" style="animation-duration:2.7s;animation-delay:-2.1s"/><circle class="d" cx="170" cy="16.9" r="1.04" style="animation-duration:3.2s;animation-delay:-3.3s"/><circle class="d" cx="170" cy="22.8" r="1.09" style="animation-duration:3.1s;animation-delay:-0.6s"/><rect width="360" height="30" fill="url(#grain)"/></g></svg>`

async function setHandoffCard($: EngineInterface, kind: HandoffCard['kind'], full: boolean, seen = false) {
  const at = await $.clock.now()
  await update($, handoffAdvice, () => null)
  await update($, handoffCard, () => ({ kind, full, at, seen }))
  // Gone after a while even with no reply; a timer that dies with its request leaves the next reply to clear it.
  if (!cardRunning(kind)) {
    try {
      $.clock.after(HANDOFF_CARD_MS, () => void update($, handoffCard, card => (card && card.at === at ? null : card)).catch(() => undefined))
    } catch {}
  }
}

const swampHiddenAt = atom({ plugin: 'smarttokensaver', key: 'swampHiddenAt' } as const, null)
// The first-run setup is not done: the footer offers "Setup".
const setupPending = atom({ plugin: 'smarttokensaver', key: 'setupPending' } as const, false)
// The Smart Token Saver settings panel is open above the prompt.
const settingsOpen = atom({ plugin: 'smarttokensaver', key: 'settingsOpen' } as const, false)
// What was changed in the panel and not saved yet, by field; Save applies it all, the cross drops it.
// The user and plugin skills, read when the settings panel opens.
const installedSkills = atom({ plugin: 'smarttokensaver', key: 'installedSkills' } as const, [])
const settingsDraft = atom({ plugin: 'smarttokensaver', key: 'settingsDraft' } as const, {})
// Which part of the settings panel is open: null for the cards.
type SettingsCard = 'effort' | 'model' | 'context' | 'handoff' | 'show' | 'about' | 'lab'
const settingsCard = atom({ plugin: 'smarttokensaver', key: 'settingsCard' } as const, null)
/** The settings panel's parts: a card each on the overview, and what the part is for, said once it is open. Support
 *  (internal id 'lab') is last, folded, and never part of the setup. */
const CARDS: readonly { id: SettingsCard; title: string; about: string }[] = [
  { id: 'effort', title: 'Effort', about: 'How hard Claude thinks on each prompt. Smart picks it; you set the lean and the limits.' },
  { id: 'model', title: 'Model', about: 'Which model answers simple prompts, and which one writes the summary when a chat compacts.' },
  { id: 'show', title: 'Customize', about: `What ${PRODUCT_NAME} shows, and how it looks.` },
  { id: 'handoff', title: 'Handoff & alerts', about: 'How a handoff is written, and which alerts show above the prompt.' },
  { id: 'context', title: 'Context size', about: 'How full a chat gets before Claude Code compacts it. Smaller means every message rereads less.' },
  { id: 'about', title: 'About', about: 'Which version this is and where it comes from.' },
  { id: 'lab', title: 'Support', about: 'Updates for this plugin, and where to report a bug.' },
]
// The Model card: the two ways to run. Effort follows the judge in both.
const MODEL_CHOICES = [
  { value: 'on', label: 'Cheaper when it can', tag: 'experimental', about: `${HAIKU} or ${SONNET} may answer. Rarely pays: it rereads the whole chat.` },
  { value: 'off', label: "Always the chat's", tag: '', about: 'Every prompt keeps your model. Only the effort changes.' },
] as const
// The Model card's second picker: who writes a compaction's summary.
const COMPACT_CHOICES = [
  { value: 'auto', label: 'Auto', about: `${HAIKU} on a cold cache, the chat's model on a warm one: the cheaper.` },
  { value: 'session', label: "Chat's model", about: "Always the chat's model. On a cold cache that costs full price." },
] as const
/** Said with the Compact with choice where the compaction hook was seen skipped: Haiku never gets it here. */
export const COMPACT_BLOCKED_NOTE = `Here Claude Code keeps ${HAIKU} out: the chat's model writes every summary (your admins can change that).`
const BIAS_WORDS = ['Cheapest', 'Cheaper', 'Balanced', 'Smarter', 'Smartest'] as const
// What Smart Token Saver last read of the compaction window (see readWindow), for the Context card and the setup step.
const windowInfo = atom({ plugin: 'smarttokensaver', key: 'windowInfo' } as const, null)
// A usage limit is close: which window, how much is used, when it resets. Null below the line.
const hot = atom({ plugin: 'smarttokensaver', key: 'hot' } as const, null)
// The running-hot band was closed at this many percent; it returns ten points later or in a new window.
// The running-hot band closed with its cross: in which window and how full. Kept in the store too, so a new chat keeps it closed.
const hotHidden = atom({ plugin: 'smarttokensaver', key: 'hotHidden' } as const, null as HotClosed | null)
// The agent panel: this chat's subagents, and the card opened in it (hooks/agents.tsx).
const agentsState = atom({ plugin: 'smarttokensaver', key: 'agents' } as const, [])
const agentsOpen = atom({ plugin: 'smarttokensaver', key: 'agentsOpen' } as const, null)
// The panel's map: the files touched, the main chat's own steps, the module opened in its list.
const agentFiles = atom({ plugin: 'smarttokensaver', key: 'agentFiles' } as const, [])
const agentSteps = atom({ plugin: 'smarttokensaver', key: 'agentSteps' } as const, null)
const agentsModule = atom({ plugin: 'smarttokensaver', key: 'agentsModule' } as const, null)
// Save mode: Auto picks at most medium until this time (ms), when the limit resets.
const saveUntil = atom({ plugin: 'smarttokensaver', key: 'saveUntil' } as const, null)
const isColdHidden = atom({ plugin: 'smarttokensaver', key: 'isColdHidden' } as const, false)
// The setup guide above the prompt: which step it shows, or null when it is closed.
const setupStep = atom({ plugin: 'smarttokensaver', key: 'setupStep' } as const, null)
// What was picked in the setup guide and not saved yet: it is saved in one go at Done or ✕. Each saved setting reloads
// the plugin, and the app says so in the chat, so a save per click filled the chat with notices.
const setupDraft = atom({ plugin: 'smarttokensaver', key: 'setupDraft' } as const, {})

// The band above the prompt when the cache has gone cold: an icy gradient with snowflakes drifting down.
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.f path{stroke:#eaf6ff;stroke-width:.5;stroke-linecap:round;fill:none}.f{transform-box:fill-box;transform-origin:center;animation:spin linear infinite;opacity:.75}@keyframes spin{to{transform:rotate(360deg)}}.fr{stroke:#dff1ff;stroke-width:.4;fill:none;stroke-linecap:round;opacity:.5}.gl{fill:#fff;opacity:0;animation:tw 3.6s ease-in-out infinite}@keyframes tw{0%,70%,100%{opacity:0}80%{opacity:.9}}.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="ice" x1="0" x2="1"><stop offset=".43" stop-color="#5aa9e6" stop-opacity="0"/><stop offset=".62" stop-color="#5aa9e6" stop-opacity=".12"/><stop offset=".85" stop-color="#8fd0ff" stop-opacity=".28"/><stop offset="1" stop-color="#cdeaff" stop-opacity=".42"/></linearGradient><radialGradient id="cold" cx="330" cy="15" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9f6ff" stop-opacity=".22"/><stop offset="1" stop-color="#e9f6ff" stop-opacity="0"/></radialGradient><linearGradient id="rime" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".15"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#ice)"/><rect width="360" height="30" fill="url(#cold)"/><rect width="360" height="30" fill="url(#rime)"/><rect width="360" height="30" fill="url(#grain)"/><path class="fr" d="M360.0 3.0L354.1 2.1M354.1 2.1L349.8 1.8M349.8 1.8L346.7 2.1M346.7 2.1L344.4 2.2M348.2 1.9L347.5 3.2M351.9 1.9L350.3 3.1M350.3 3.1L349.2 3.8M357.0 2.5L355.1 0.6M355.1 0.6L353.5 -0.5M353.5 -0.5L352.4 -1.4M356.1 1.6L354.9 1.4M360.0 27.0L354.1 27.9M354.1 27.9L349.8 28.5M349.8 28.5L346.9 29.6M346.9 29.6L345.0 30.8M348.3 29.0L347.1 28.4M351.9 28.2L350.9 29.9M350.9 29.9L350.3 31.1M357.0 27.5L355.2 29.4M355.2 29.4L353.9 30.9M353.9 30.9L352.8 31.8M356.1 28.4L354.9 28.5M350.0 30.0L348.8 26.2M348.8 26.2L347.9 23.4M347.9 23.4L347.6 21.4M347.6 21.4L347.7 19.9M348.4 24.8L348.9 23.6M349.4 28.1L350.2 26.5M350.2 26.5L350.8 25.3M352.0 0.0L351.0 3.9M351.0 3.9L350.4 6.7M350.4 6.7L349.6 8.6M349.6 8.6L349.0 10.0M350.7 5.3L349.6 5.9M351.5 1.9L352.2 3.6M352.2 3.6L352.9 4.7"/><circle class="gl" cx="228" cy="26" r="0.5" style="animation-delay:0s"/><circle class="gl" cx="205" cy="4" r="0.45" style="animation-delay:1.3s"/><circle class="gl" cx="186" cy="26" r="0.4" style="animation-delay:2.4s"/><circle class="gl" cx="262" cy="6" r="0.5" style="animation-delay:0.7s"/><circle class="gl" cx="300" cy="25" r="0.45" style="animation-delay:3.1s"/><circle class="gl" cx="330" cy="6" r="0.5" style="animation-delay:1.9s"/><g class="f" style="animation-duration:10s;animation-delay:0s"><path d="M236.0 9.0L236.0 13.2M236.0 10.9L237.0 11.8M236.0 10.9L235.0 11.8M236.0 11.9L236.7 12.6M236.0 11.9L235.3 12.6M236.0 9.0L232.4 11.1M234.4 9.9L234.0 11.2M234.4 9.9L233.1 9.6M233.5 10.5L233.2 11.4M233.5 10.5L232.6 10.2M236.0 9.0L232.4 6.9M234.4 8.1L233.1 8.4M234.4 8.1L234.0 6.8M233.5 7.5L232.6 7.8M233.5 7.5L233.2 6.6M236.0 9.0L236.0 4.8M236.0 7.1L235.0 6.2M236.0 7.1L237.0 6.2M236.0 6.1L235.3 5.4M236.0 6.1L236.7 5.4M236.0 9.0L239.6 6.9M237.6 8.1L238.0 6.8M237.6 8.1L238.9 8.4M238.5 7.5L238.8 6.6M238.5 7.5L239.4 7.8M236.0 9.0L239.6 11.1M237.6 9.9L238.9 9.6M237.6 9.9L238.0 11.2M238.5 10.5L239.4 10.2M238.5 10.5L238.8 11.4"/></g><g class="f" style="animation-duration:12s;animation-delay:-4s"><path d="M214.0 21.0L214.0 24.2M214.0 22.4L214.7 23.2M214.0 22.4L213.3 23.2M214.0 23.2L214.5 23.7M214.0 23.2L213.5 23.7M214.0 21.0L211.2 22.6M212.8 21.7L212.5 22.7M212.8 21.7L211.8 21.5M212.1 22.1L211.9 22.8M212.1 22.1L211.4 21.9M214.0 21.0L211.2 19.4M212.8 20.3L211.8 20.5M212.8 20.3L212.5 19.3M212.1 19.9L211.4 20.1M212.1 19.9L211.9 19.2M214.0 21.0L214.0 17.8M214.0 19.6L213.3 18.8M214.0 19.6L214.7 18.8M214.0 18.8L213.5 18.3M214.0 18.8L214.5 18.3M214.0 21.0L216.8 19.4M215.2 20.3L215.5 19.3M215.2 20.3L216.2 20.5M215.9 19.9L216.1 19.2M215.9 19.9L216.6 20.1M214.0 21.0L216.8 22.6M215.2 21.7L216.2 21.5M215.2 21.7L215.5 22.7M215.9 22.1L216.6 21.9M215.9 22.1L216.1 22.8"/></g><g class="f" style="animation-duration:11s;animation-delay:-7s"><path d="M194.0 8.0L194.0 10.6M194.0 9.2L194.6 9.8M194.0 9.2L193.4 9.8M194.0 9.8L194.4 10.2M194.0 9.8L193.6 10.2M194.0 8.0L191.7 9.3M193.0 8.6L192.8 9.4M193.0 8.6L192.2 8.4M192.4 8.9L192.3 9.5M192.4 8.9L191.9 8.8M194.0 8.0L191.7 6.7M193.0 7.4L192.2 7.6M193.0 7.4L192.8 6.6M192.4 7.1L191.9 7.2M192.4 7.1L192.3 6.5M194.0 8.0L194.0 5.4M194.0 6.8L193.4 6.2M194.0 6.8L194.6 6.2M194.0 6.2L193.6 5.8M194.0 6.2L194.4 5.8M194.0 8.0L196.3 6.7M195.0 7.4L195.2 6.6M195.0 7.4L195.8 7.6M195.6 7.1L195.7 6.5M195.6 7.1L196.1 7.2M194.0 8.0L196.3 9.3M195.0 8.6L195.8 8.4M195.0 8.6L195.2 9.4M195.6 8.9L196.1 8.8M195.6 8.9L195.7 9.5"/></g><g class="f" style="animation-duration:13s;animation-delay:-2s"><path d="M176.0 19.0L176.0 21.2M176.0 20.0L176.5 20.5M176.0 20.0L175.5 20.5M176.0 20.5L176.3 20.9M176.0 20.5L175.7 20.9M176.0 19.0L174.1 20.1M175.1 19.5L175.0 20.2M175.1 19.5L174.5 19.3M174.7 19.8L174.5 20.2M174.7 19.8L174.2 19.6M176.0 19.0L174.1 17.9M175.1 18.5L174.5 18.7M175.1 18.5L175.0 17.8M174.7 18.2L174.2 18.4M174.7 18.2L174.5 17.8M176.0 19.0L176.0 16.8M176.0 18.0L175.5 17.5M176.0 18.0L176.5 17.5M176.0 17.5L175.7 17.1M176.0 17.5L176.3 17.1M176.0 19.0L177.9 17.9M176.9 18.5L177.0 17.8M176.9 18.5L177.5 18.7M177.3 18.2L177.5 17.8M177.3 18.2L177.8 18.4M176.0 19.0L177.9 20.1M176.9 19.5L177.5 19.3M176.9 19.5L177.0 20.2M177.3 19.8L177.8 19.6M177.3 19.8L177.5 20.2"/></g><g class="f" style="animation-duration:14s;animation-delay:-9s"><path d="M252.0 22.0L252.0 24.4M252.0 23.1L252.5 23.6M252.0 23.1L251.5 23.6M252.0 23.7L252.4 24.1M252.0 23.7L251.6 24.1M252.0 22.0L249.9 23.2M251.1 22.5L250.9 23.3M251.1 22.5L250.3 22.3M250.5 22.8L250.4 23.4M250.5 22.8L250.0 22.7M252.0 22.0L249.9 20.8M251.1 21.5L250.3 21.7M251.1 21.5L250.9 20.7M250.5 21.2L250.0 21.3M250.5 21.2L250.4 20.6M252.0 22.0L252.0 19.6M252.0 20.9L251.5 20.4M252.0 20.9L252.5 20.4M252.0 20.3L251.6 19.9M252.0 20.3L252.4 19.9M252.0 22.0L254.1 20.8M252.9 21.5L253.1 20.7M252.9 21.5L253.7 21.7M253.5 21.2L253.6 20.6M253.5 21.2L254.0 21.3M252.0 22.0L254.1 23.2M252.9 22.5L253.7 22.3M252.9 22.5L253.1 23.3M253.5 22.8L254.0 22.7M253.5 22.8L253.6 23.4"/></g></g></svg>`
// The frost is drawn larger than the band and cut by it: wide enough for the right side, tall enough for any band.
const FROST_WIDTH = 440
const FROST_HEIGHT = 64
// The setup band's art: tall enough for its rows, the art's own shape kept (it is cut from the left).
const SETUP_ART_W = 2200
const SETUP_ART_H = 400
/** Under this many cells across the band the setup takes its narrow layout (the window step's sizes need about 88: at 80 Individual was cut). */
const SETUP_NARROW_COLUMNS = 92
/** The width the settings panel is laid out for; a narrower band scrolls it sideways (at 82 cells its cards were cut). */
const SETTINGS_DESIGN_COLUMNS = 100
// The band when the context is swamped: murky green, bubbles rising, slow ripples.
const SWAMP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.b{fill:none;stroke:#cfe8b8;stroke-width:.5;opacity:0;animation-name:rise;animation-timing-function:ease-in;animation-iteration-count:infinite}@keyframes rise{0%{opacity:0;transform:translate(0,0)}15%{opacity:.7}80%{opacity:.5}100%{opacity:0;transform:translate(3px,-30px)}}.rp{fill:none;stroke:#a7c98f;stroke-width:.4;stroke-linecap:round;opacity:.25;animation:drift 7s ease-in-out infinite}@keyframes drift{0%,100%{transform:translate(0,0);opacity:.15}50%{transform:translate(4px,0);opacity:.4}}.mk{animation:mk 8s ease-in-out infinite}@keyframes mk{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="bog" x1="0" x2="1"><stop offset=".43" stop-color="#4f7a3a" stop-opacity="0"/><stop offset=".62" stop-color="#4f7a3a" stop-opacity=".16"/><stop offset=".85" stop-color="#6f9a4f" stop-opacity=".32"/><stop offset="1" stop-color="#9cc27a" stop-opacity=".42"/></linearGradient><linearGradient id="silt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#2b3a1f" stop-opacity=".18"/><stop offset="1" stop-color="#1c2614" stop-opacity=".45"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".06"/></pattern></defs><g mask="url(#m)"><rect class="mk" width="360" height="30" fill="url(#bog)"/><rect width="360" height="30" fill="url(#silt)"/><rect width="360" height="30" fill="url(#grain)"/><path class="rp" style="animation-delay:-0s" d="M190 22 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-2.5s" d="M226 9 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-5s" d="M250 18 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-1.5s" d="M300 24 q6 -2 12 0 t12 0"/><path class="rp" style="animation-delay:-3.8s" d="M322 7 q6 -2 12 0 t12 0"/><circle class="b" cx="168" cy="32" r="1.6" style="animation-duration:6.5s;animation-delay:-0s"/><circle class="b" cx="182" cy="32" r="1.1" style="animation-duration:8s;animation-delay:-2.1s"/><circle class="b" cx="197" cy="32" r="2.0" style="animation-duration:7s;animation-delay:-4.2s"/><circle class="b" cx="210" cy="32" r="1.3" style="animation-duration:9s;animation-delay:-1.0s"/><circle class="b" cx="224" cy="32" r="1.7" style="animation-duration:7.5s;animation-delay:-3.3s"/><circle class="b" cx="238" cy="32" r="1.0" style="animation-duration:8.5s;animation-delay:-5.1s"/><circle class="b" cx="252" cy="32" r="1.4" style="animation-duration:6.8s;animation-delay:-2.6s"/><circle class="b" cx="176" cy="32" r="0.9" style="animation-duration:9.5s;animation-delay:-6.0s"/><circle class="b" cx="232" cy="32" r="0.8" style="animation-duration:10s;animation-delay:-0.5s"/></g></svg>`
// The band when a usage limit is close: embers, sparks rising.
const EMBER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.s{fill:#ffb06a;opacity:0;animation-name:up;animation-timing-function:ease-out;animation-iteration-count:infinite}@keyframes up{0%{opacity:0;transform:translate(0,0)}12%{opacity:.95}70%{opacity:.6}100%{opacity:0;transform:translate(4px,-30px)}}.br{animation:br 3.4s ease-in-out infinite}@keyframes br{0%,100%{opacity:.8}50%{opacity:1}}.br2{animation:br2 2.2s ease-in-out infinite}@keyframes br2{0%,100%{opacity:.7}40%{opacity:1}70%{opacity:.8}}</style><defs><linearGradient id="heat" x1="0" x2="1"><stop offset=".43" stop-color="#b8461b" stop-opacity="0"/><stop offset=".62" stop-color="#b8461b" stop-opacity=".16"/><stop offset=".85" stop-color="#d9622a" stop-opacity=".32"/><stop offset="1" stop-color="#f08a3c" stop-opacity=".42"/></linearGradient><linearGradient id="glow" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".55" stop-color="#e2581f" stop-opacity=".08"/><stop offset="1" stop-color="#ff7a2e" stop-opacity=".32"/></linearGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".06"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#heat)"/><rect class="br2" width="360" height="30" fill="url(#glow)"/><circle class="s" cx="166" cy="31" r="0.7" style="animation-duration:3.2s;animation-delay:-0s"/><circle class="s" cx="178" cy="31" r="0.5" style="animation-duration:4.1s;animation-delay:-1.2s"/><circle class="s" cx="191" cy="31" r="0.8" style="animation-duration:3.6s;animation-delay:-2.4s"/><circle class="s" cx="203" cy="31" r="0.5" style="animation-duration:4.6s;animation-delay:-0.7s"/><circle class="s" cx="216" cy="31" r="0.7" style="animation-duration:3.9s;animation-delay:-3.0s"/><circle class="s" cx="228" cy="31" r="0.6" style="animation-duration:4.3s;animation-delay:-1.8s"/><circle class="s" cx="241" cy="31" r="0.8" style="animation-duration:3.4s;animation-delay:-0.4s"/><circle class="s" cx="254" cy="31" r="0.5" style="animation-duration:4.8s;animation-delay:-2.9s"/><circle class="s" cx="184" cy="31" r="0.4" style="animation-duration:5.0s;animation-delay:-3.6s"/><circle class="s" cx="236" cy="31" r="0.4" style="animation-duration:4.4s;animation-delay:-2.1s"/><rect width="360" height="30" fill="url(#grain)"/></g></svg>`
// The right of the setup guide, pure decoration (the name is on the left): a purple gradient with a soft glow,
// faint light streaks and grain, a still star, and small sparkles that twinkle in and out here and there. One constant source, so the app never rebuilds its frame (a changing source flickers); the
// motion is CSS inside it.
const BRAND_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="64" viewBox="0 0 360 30" preserveAspectRatio="xMaxYMid slice"><style>:root{color-scheme:light dark}html,body{margin:0}svg{background:transparent;display:block}.sp{fill:#fff;opacity:0;transform:scale(0);animation-name:gl;animation-timing-function:ease-in-out;animation-iteration-count:infinite}@keyframes gl{0%,72%,100%{opacity:0;transform:scale(0) rotate(0deg)}82%{opacity:.9;transform:scale(1) rotate(30deg)}92%{opacity:0;transform:scale(.2) rotate(60deg)}}.br{animation:br 6s ease-in-out infinite}@keyframes br{0%,100%{opacity:.85}50%{opacity:1}}</style><defs><linearGradient id="bg" x1="0" x2="1"><stop offset=".43" stop-color="#7c6cf0" stop-opacity="0"/><stop offset=".62" stop-color="#7c6cf0" stop-opacity=".16"/><stop offset=".85" stop-color="#8f7ff0" stop-opacity=".34"/><stop offset="1" stop-color="#b3a6ff" stop-opacity=".48"/></linearGradient><radialGradient id="glow" cx="320" cy="15" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c9bdff" stop-opacity=".28"/><stop offset="1" stop-color="#9a86ff" stop-opacity="0"/></radialGradient><linearGradient id="fade" x1="0" x2="1"><stop offset=".43" stop-color="#fff" stop-opacity="0"/><stop offset=".7" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m"><rect width="360" height="30" fill="url(#fade)"/></mask><pattern id="grain" width="2" height="2" patternUnits="userSpaceOnUse"><rect width=".6" height=".6" fill="#fff" fill-opacity=".07"/></pattern></defs><g mask="url(#m)"><rect class="br" width="360" height="30" fill="url(#bg)"/><rect width="360" height="30" fill="url(#glow)"/><rect width="360" height="30" fill="url(#grain)"/><line x1="186" y1="32" x2="198" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="3"/><line x1="204" y1="32" x2="216" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="1.2"/><line x1="226" y1="32" x2="238" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="4"/><line x1="262" y1="32" x2="274" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="1.5"/><line x1="290" y1="32" x2="302" y2="-2" stroke="#fff" stroke-opacity="0.05" stroke-width="3"/><line x1="320" y1="32" x2="332" y2="-2" stroke="#fff" stroke-opacity="0.04" stroke-width="1.2"/><path class="sp" style="transform-origin:168px 8px;animation-duration:4.2s;animation-delay:0.3s" d="M168 6.4 L168.34 7.66 L169.6 8 L168.34 8.34 L168 9.6 L167.66 8.34 L166.4 8 L167.66 7.66 Z"/><path class="sp" style="transform-origin:182px 22px;animation-duration:5.1s;animation-delay:2.1s" d="M182 20.7 L182.27 21.73 L183.3 22 L182.27 22.27 L182 23.3 L181.73 22.27 L180.7 22 L181.73 21.73 Z"/><path class="sp" style="transform-origin:196px 6px;animation-duration:3.8s;animation-delay:1.2s" d="M196 4.2 L196.38 5.62 L197.8 6 L196.38 6.38 L196 7.8 L195.62 6.38 L194.2 6 L195.62 5.62 Z"/><path class="sp" style="transform-origin:208px 19px;animation-duration:4.6s;animation-delay:3.4s" d="M208 17.8 L208.25 18.75 L209.2 19 L208.25 19.25 L208 20.2 L207.75 19.25 L206.8 19 L207.75 18.75 Z"/><path class="sp" style="transform-origin:221px 9px;animation-duration:5.4s;animation-delay:0.9s" d="M221 7.5 L221.31 8.69 L222.5 9 L221.31 9.31 L221 10.5 L220.69 9.31 L219.5 9 L220.69 8.69 Z"/><path class="sp" style="transform-origin:232px 23px;animation-duration:4.0s;animation-delay:2.7s" d="M232 21.9 L232.23 22.77 L233.1 23 L232.23 23.23 L232 24.1 L231.77 23.23 L230.9 23 L231.77 22.77 Z"/><path class="sp" style="transform-origin:244px 7px;animation-duration:4.8s;animation-delay:1.8s" d="M244 5.7 L244.27 6.73 L245.3 7 L244.27 7.27 L244 8.3 L243.73 7.27 L242.7 7 L243.73 6.73 Z"/><path class="sp" style="transform-origin:176px 15px;animation-duration:5.8s;animation-delay:4.0s" d="M176 14.0 L176.21 14.79 L177.0 15 L176.21 15.21 L176 16.0 L175.79 15.21 L175.0 15 L175.79 14.79 Z"/><path class="sp" style="transform-origin:214px 26px;animation-duration:4.4s;animation-delay:3.0s" d="M214 25.0 L214.21 25.79 L215.0 26 L214.21 26.21 L214 27.0 L213.79 26.21 L213.0 26 L213.79 25.79 Z"/><path class="sp" style="transform-origin:238px 15px;animation-duration:3.6s;animation-delay:0.1s" d="M238 14.0 L238.21 14.79 L239.0 15 L238.21 15.21 L238 16.0 L237.79 15.21 L237.0 15 L237.79 14.79 Z"/></g></svg>`

// The handoff card once it has landed: the brand's art in green, with a big dark checkmark on the right.
// The dashboard sits there all the time, so it is grey: purple is kept for the moments that ask for attention. Its
// art is the brand's, in grey and at 40% of its strength; only the ✦ keeps the accent.
const DASH_SVG = BRAND_SVG.replace(/stop-opacity="([0-9.]+)"/g, (_m, v: string) => `stop-opacity="${(Number(v) * 0.4).toFixed(3)}"`)
  .replace(/#(7c6cf0|8f7ff0|b3a6ff|c9bdff|9a86ff)/g, '#9a9aa2')
let DASH_BG = '#141416'
let DASH_EDGE = '#2a2a2f'
/** The mark as the settings bar shows it: big, tilted and faint, cut off by the bar. */
// The dashboard's mark (see dash-mark): its size (the logo small, markLogoSvg).
const DASH_MARK_SIZE = 18
/** How long a band's entrance runs: it is drawn only this long after the band appears, since every redraw of the band
 * (a choice, the minute tick) would replay it. */
const INTRO_MS = 1300
// The band last drawn above the prompt, and when it appeared (see introShows).
let introKind = ''
let introAt = 0
/** Whether the band of `kind` is still in its entrance: true for INTRO_MS after it replaced another band. */
/** An animated Svg drawn `elapsedMs` into its animations. Every redraw rebuilds the band and starts its images' CSS
 * animations over; with this, a redraw mid-animation picks it up where it was instead of jumping back. */
export function inPhase(svg: string, elapsedMs: number): string {
  return svg.replace('</svg>', `<style>svg *{animation-delay:${(-Math.max(0, elapsedMs) / 1000).toFixed(3)}s !important}</style></svg>`)
}
// How far the entrance on screen is, for introLayer.
let introElapsed = 0
// Set when a band replaces another, taken by the first draw of the new one.
let introFresh = false
async function introShows($: EngineInterface, kind: string): Promise<boolean> {
  const now = await $.clock.now()
  if (kind !== introKind) {
    introKind = kind
    introAt = now
    introFresh = true
    $.clock.after(INTRO_MS + 100, () => $.ui.invalidate('ui.render'))
  }
  introElapsed = now - introAt
  return introElapsed < INTRO_MS
}
/** The entrance layer (INTRO_SVG) in a band's own colours, or nothing once the entrance is over. */
// The mark beside a card's title, sized to one line of text.
const TITLE_MARK_SIZE = 16

/** A card's title with the Smart Token Saver mark where the ✦ stood; the ✦ stays where the surface draws no images. */
function markTitle(els: { Box: unknown; Text: unknown; Svg?: unknown }, key: string, color: string, title: string, mark = MARK_SVG) {
  const { Box: B, Text: T, Svg: S } = els as unknown as { Box: (p: Record<string, unknown>) => unknown; Text: (p: Record<string, unknown>) => unknown; Svg?: (p: Record<string, unknown>) => unknown }
  if (!S) return <T key={key} color={color} bold wrap="truncate">{title}</T>
  return (
    <B key={key} flexDirection="row" alignItems="center" flexShrink={1} minWidth={0}>
      <B flexShrink={0} marginRight={1} alignItems="center">
        <S source={mark} alt={PRODUCT_NAME} width={TITLE_MARK_SIZE} height={TITLE_MARK_SIZE} />
      </B>
      <T color={color} bold wrap="truncate">{title.replace(/^✦ /, '')}</T>
    </B>
  )
}

function introLayer(els: { Box: unknown; Svg?: unknown }, key: string, show: boolean, wash = '#8b6cff', light = '#b9a7ff') {
  if (!els.Svg || !show) return null
  const { Box: B, Svg: S } = els as unknown as { Box: (p: Record<string, unknown>) => unknown; Svg: (p: Record<string, unknown>) => unknown }
  const shine = () => S({ source: inPhase(INTRO_SVG.replace('#8b6cff', wash).replace('#b9a7ff', light), introElapsed), alt: 'shine', width: 1600, height: 280 })
  return (
    // In the slot the shell draws it, in the slot's round shape; anywhere else it lies in the panel as before.
    underSlot(slotArt({ Box: B } as unknown as Parts, `${key}-intro`, shine(), 'left'),
      B({ key: `${key}-intro`, position: 'absolute', top: -1, left: 0, right: 0, bottom: -1, children: [shine()] }))
  )
}
/** The settings panel's top bar: a shade above the band. */
let DASH_HEAD = '#18181b'
const DASH_TEXT = '#d4d4d8'
/** The dashboard's quieter figures: the cache countdown while it has time left. */
const DASH_DIM = '#8b8b93'
// A settings card under the pointer: a shade up from the band, its edge a shade up from that.
let CARD_HOVER = '#1c1c20'
let CARD_HOVER_EDGE = '#3b3b42'
const DONE_SVG = BRAND_SVG
  .replace(/#7c6cf0/g, '#2fae62').replace(/#8f7ff0/g, '#3cc472').replace(/#b3a6ff/g, '#7fe0a4')
  .replace(/#c9bdff/g, '#b4f0c8').replace(/#9a86ff/g, '#4fd486')
  .replace('</g></svg>', '<path d="M323 15.5 L330 22 L345 7.5" fill="none" stroke="#0c3a20" stroke-opacity=".8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></svg>')
const DONE_ACCENT = '#7fe0a4'

// Navy & orange draws its own art instead of the turned violet: navy, white and a little orange on dark; on light
// a faint navy on white, as its documents are. Marked data-raw so the theme leaves it as drawn. One source per
// appearance, so the frame is not rebuilt while it shows.
const scaleStops = (svg: string, f: number) => svg.replace(/stop-opacity="([0-9.]+)"/g, (_m, v: string) => `stop-opacity="${(Number(v) * f).toFixed(3)}"`)
const rawSvg = (svg: string) => svg.replace('<svg ', '<svg data-raw="1" ')
const NAVY_BRAND_DARK = rawSvg(BRAND_SVG.replace(/#(7c6cf0|8f7ff0|b3a6ff|c9bdff|9a86ff)/g, '#3CA9DC').replace('.sp{fill:#fff', `.sp{fill:${BRAND_ORANGE}`))
const NAVY_BRAND_LIGHT = rawSvg(scaleStops(BRAND_SVG, 0.3).replace(/#(7c6cf0|8f7ff0|b3a6ff|c9bdff|9a86ff)/g, '#00243B').replace('.sp{fill:#fff', '.sp{fill:#00243B').replace(/stroke="#fff"/g, 'stroke="#00243B"'))
// The swamp in the logo's orange: dark orange bubbles rising through an orange wash. On light, a pale orange band with
// darker bubbles; on dark, a deep brown band with the brand orange.
const swampNavy = (light: boolean) => {
  const bubble = light ? '#B5532F' : BRAND_ORANGE
  return rawSvg((light ? scaleStops(SWAMP_SVG, 0.75) : SWAMP_SVG)
    .replace('.b{fill:none;stroke:#cfe8b8;stroke-width:.5', `.b{fill:${bubble}2e;stroke:${bubble};stroke-width:.75`)
    .replace(/#(a7c98f)/g, light ? '#C8603D' : '#E89A7C')
    .replace(/#(4f7a3a|6f9a4f|9cc27a)/g, light ? '#E3906F' : BRAND_ORANGE)
    .replace(/#(2b3a1f|1c2614)/g, light ? '#D97757' : '#1E0D06'))
}
const NAVY_SWAMP_DARK = swampNavy(false)
const NAVY_SWAMP_LIGHT = swampNavy(true)
/** The swamp band's art in the current theme and appearance. */
const swampArt = () => (config.theme === 'navy' ? (isLight() ? NAVY_SWAMP_LIGHT : NAVY_SWAMP_DARK) : SWAMP_SVG)
/** The brand's art in the current theme and appearance. */
/** Band art in the Automatic appearance: a faint hint behind the words (30 %), so a band sits in the app instead of
 *  shouting; the painted appearances keep it whole. */
const quietArt = (svg: string) => (isAdaptive() ? svg.replace('<svg ', '<svg opacity=".3" ') : svg)
const brandArt = () => (config.theme === 'navy' ? (isLight() ? NAVY_BRAND_LIGHT : NAVY_BRAND_DARK) : BRAND_SVG)
/**
 * The setup band's art, as the guide's cover draws it: a grid of token dots over the whole band, faint diagonal light
 * streaks, a glow in the theme's colour top right and a softer one low on the left, and a few dots lit in that colour
 * that twinkle. Drawn for the ground under it (light or dark, also in Automatic, where the app's own colours show), in
 * full strength: at the 30 % of the other bands' art the dots were gone and the band read as one flat colour.
 * Marked raw and for its scheme, so the theme leaves it as drawn (also in Automatic); the done step glows green.
 */
const setupArtCache = new Map<string, string>()
export function setupArtSvg(look: 'brand' | 'done', light: boolean, theme: ThemeName): string {
  const key = `${look}:${light}:${theme}`
  const hit = setupArtCache.get(key)
  if (hit) return hit
  const W = SETUP_ART_W, H = SETUP_ART_H
  const glow = look === 'done' ? '#3cc472' : theme === 'violet' ? '#8f7ff0' : theme === 'rose' ? '#E0789A' : theme === 'neutral' ? '#9a9a9a' : BRAND_ORANGE
  const ink = light ? '#2B1A12' : '#ffffff'
  const [dotA, streakA, glowA, glowB] = light ? [0.13, 0.035, 0.24, 0.14] : [0.22, 0.04, 0.3, 0.18]
  // Lit dots on the grid (22 px), right of the middle where every band width shows them.
  const lit = [[1980, 66], [1914, 154], [2090, 220], [1782, 110], [1650, 286], [1848, 330], [2156, 132], [1584, 66], [1716, 198], [2024, 308]]
    .map(([x, y], i) => `<circle class="tw" cx="${x! + 11}" cy="${y! + 11}" r="1.9" style="animation-duration:${(3.4 + (i % 4) * 0.7).toFixed(1)}s;animation-delay:-${((i * 1.3) % 4).toFixed(1)}s"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-raw="1" data-scheme="1" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMaxYMid slice">`
    + `<style>svg{background:transparent;display:block}.tw{fill:${glow};opacity:0;animation-name:tw;animation-timing-function:ease-in-out;animation-iteration-count:infinite}@keyframes tw{0%,60%,100%{opacity:0}75%{opacity:.85}88%{opacity:.25}}</style>`
    + `<defs>`
    + `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.3" fill="${ink}" fill-opacity="${dotA}"/></pattern>`
    + `<pattern id="streaks" width="260" height="${H}" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect x="120" width="30" height="${H}" fill="${ink}" fill-opacity="${streakA}"/></pattern>`
    + `<radialGradient id="g1" cx="${W - 140}" cy="40" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity="${glowA}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="g2" cx="${W - 1050}" cy="${H + 60}" r="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity="${glowB}"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>`
    + `</defs>`
    + `<rect width="${W}" height="${H}" fill="url(#streaks)"/><rect width="${W}" height="${H}" fill="url(#g1)"/><rect width="${W}" height="${H}" fill="url(#g2)"/><rect width="${W}" height="${H}" fill="url(#dots)"/>${lit}</svg>`
  setupArtCache.set(key, svg)
  return svg
}
const DONE_BG = '#0f1c15'
// The mark in the done green, for the titles of cards that have landed.
const DONE_MARK_SVG = MARK_SVG.replace(/#7566d8/g, '#2f9a5e').replace(/#a79cf7/g, '#7fe0a4').replace(/#cfc7ff/g, '#c8f4d8')

const JUDGE_SYSTEM = `You choose which Claude model and reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the cheapest pair that will still do the job well.

Models, cheapest first:
- haiku: quick questions, lookups, renames, small edits in one or two files, summaries, chit-chat. It can read files and run tools; pick it for any small, well-defined job.
- sonnet: normal coding, edits across a few files, explanations, writing.
- opus: hard debugging, architecture, large refactors, careful reviews.
- fable: the hardest long-horizon or research-level work.

Effort: low for quick answers, medium for normal work, high for hard problems, xhigh or max only for very hard ones.

Effort is relative to the model in use ("Current" names it): a stronger model needs less effort for the same job. Opus at medium does about what Sonnet does at high, and Fable is stronger again. So for one and the same task pick one step lower on Opus than on Sonnet, and lower still on Fable; on Sonnet, go one step higher for hard work than you would on Opus.

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "go through my whole drive and clean it up", "review the entire repo", "migrate everything" are big, multi-step, tool-heavy jobs where mistakes are costly: never low, usually high. Low is only for answers that need no tools and no planning.

If the message answers a question in the assistant's last reply (picks an option, says which one, confirms a plan), judge only the work that answer starts, as the reply describes it, not the length of the answer and not the work done before the question: "B" can mean "build the complicated section B" (high), while "yes" or "no" to one small action ("should I archive this?", "delete the old ones too?") is low, and picking a value for one setting (a log level, a colour, a font) is low. But picking which way to build something ("option 1", "the same shapes", "B") starts that build: judge the build. Approving a whole plan or several steps takes the effort of that plan. A plain "yes", "ok" or "do it" after "Is that OK? Then I'll build X" or "Should I build X?" approves building X: judge X, not the word.

A message that pushes back on, corrects or adds to a plan or claim under discussion continues that work: keep at least the effort that work had, never drop to low for it. Thanks, praise or a closing remark with no new request is low. A question about how to do something, or about effort itself, that needs no tools is low.

If the person asks for deep thought ("think hard", "ultrathink", "be thorough"), pick at least high; if they ask for a quick answer, pick low.

If the message is a short follow-up to ongoing work ("yes", "go", "ok", "continue", or the same in any language), keep the current pair.

Reply with JSON only: {"model":"haiku|sonnet|opus|fable","effort":"low|medium|high|xhigh|max","sure":0.0-1.0 how sure you are of the effort,"why":"at most 6 words, in the user's language"}`

/** Reads `{ model, effort, why }` out of a reply, or nothing when it doesn't hold one. */
export function parseVerdict(text: string): { model: ModelKey; effort: Effort; why: string; sure?: number; handoff?: string } | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(match[0])
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const { model, effort, why, sure, handoff } = raw as Record<string, unknown>
  const key = typeof model === 'string' ? model.toLowerCase() : ''
  const found = MODELS.find(m => key === m.key || key === m.id || key.includes(m.key))
  if (!found || !EFFORTS.includes(effort as Effort)) return undefined
  const how = typeof sure === 'number' && sure >= 0 && sure <= 1 ? { sure } : {}
  // Only a reason counts: "handoff":"" or false is no advice.
  const advice = typeof handoff === 'string' && handoff.trim() ? { handoff: handoff.trim().slice(0, 70) } : {}
  return { model: found.key, effort: effort as Effort, why: typeof why === 'string' ? why.slice(0, 60) : '', ...how, ...advice }
}

/**
 * What the judge reads besides the new message: the person's previous message and the assistant's last reply. The
 * reply is kept long and from its end, where a question with options ("A, B or C?") sits: "B" alone looks like a
 * small job, the reply says what B sets off.
 */
async function recentContext($: EngineInterface): Promise<string> {
  return contextFrom(await $.session.messages())
}

/** The context text from the conversation so far: the last user message, short, and the assistant's last reply's end. */
export function contextFrom(messages: readonly { role: string; text: string }[]): string {
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const lastAssistant = lastAssistantText(messages)
  return [lastUser ? `user: ${lastUser.text.slice(0, 400)}` : '', lastAssistant ? `assistant: ${lastAssistant.slice(-2000)}` : '']
    .filter(Boolean)
    .join('\n')
}

/** The assistant's last reply, or nothing. */
function lastAssistantText(messages: readonly { role: string; text: string }[]): string {
  return [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())?.text ?? ''
}


/** The skill or custom command a typed "/name args" runs, or nothing for the app's own commands and Smart Token Saver's. */
async function typedSkill($: EngineInterface, text: string): Promise<{ name: string; description: string } | undefined> {
  const name = text.trim().slice(1).split(/\s+/)[0]
  if (!name) return undefined
  const found = (await $.command.list().catch(() => [])).find(c => c.name === name)
  if (!found || !['user', 'plugin', 'mcp'].includes(found.source) || found.plugin === PLUGIN) return undefined
  return { name, description: found.description ?? '' }
}

const LEVEL_WORD = '(low|medium|high|xhigh|x-high|extra[- ]high|max|maximum)'
const NAMED_LEVEL = new RegExp(`\\b${LEVEL_WORD}\\s+effort\\b|\\beffort(?:\\s+level)?(?:\\s*:\\s*|\\s+(?:to|at)\\s+|\\s+)${LEVEL_WORD}\\b|\\bxhigh\\b`, 'gi')
const LEVEL_OF: Record<string, Effort> = { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', 'x-high': 'xhigh', 'extra high': 'xhigh', 'extra-high': 'xhigh', max: 'max', maximum: 'max' }
const BACKTICKED_LEVEL = new RegExp('`\\s*' + LEVEL_WORD + '\\s*`', 'gi')
const blank = (m: string) => ' '.repeat(m.length)

/**
 * Code, quoted words and quoted lines (> ...), blanked out at the same length: what a prompt quotes or pastes is not
 * what it asks for. A lone level in backticks ("use `high` effort") stays, as the word it is.
 */
const unquoted = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/^[ \t]*>.*$/gm, blank)
    .replace(BACKTICKED_LEVEL, m => m.replace(/`/g, ' '))
    .replace(/`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|„[^“”\n]*[“”]|«[^»\n]*»|(?<![\w])['‘][^'’\n]*['’](?!\w)/g, blank)
/** Said anywhere in the sentence, a level named in it is not asked for ("do not, under any circumstances, use max effort"). */
const NAMED_NOT = /\b(not|no|don'?t|doesn'?t|didn'?t|never|without|instead of|isn'?t|wasn'?t|won'?t|shouldn'?t|needn'?t|avoid|stop|skip)\b/
/** A clause that talks about a level instead of asking for it. */
const NAMED_ABOUT = /\b(what|why|how|when|where|which|who|does|did|means?|meaning|says?|said|called|named|mention\w*|phrase|words?|about|label|button|setting|between|difference|compare\w*|versus|vs)\b/
/** What stands right before a level that is asked for: "use", "with", "at", "set it to", "switch to"... */
const NAMED_ASK = /\b(use|using|with|at|on|to|set|run|go|do|try|apply|give|switch|want|need|needs|take|spend|think|work|put)(\s+(it|this|that|a|an|the|your|full|some|in|on|with|at|to))*\s*$/
/** Words that only open a clause: a level right after them still starts it ("ok, max effort"). */
const NAMED_OPENER = /^((please|ok|okay|and|then|now|also|so|just|yes|hey|claude|note)\s*)*$/
/** After the level: it describes something ("a low effort answer") or is compared ("high effort and max effort"). */
const NAMED_DESCRIBES = /^\s*(answers?|repl(?:y|ies)|jobs?|attempts?|tasks?|posts?|comments?|and|or|vs|versus|is|was|were|are|means?|does|did)\b/
/**
 * The level a prompt asks for by name ("max effort", "effort: high", "xhigh"), or nothing. The word effort must sit
 * beside the level, so "a medium sized image" names nothing. Only a plain ask counts: the level opens its clause
 * ("max effort, review the repo") or follows a word that asks for it ("do this with max effort", "set effort to
 * low"). A level inside quotes or code, in a sentence that says no ("don't use max effort"), in a clause that talks
 * about it ("what does max effort do", "the button says max effort") or one that describes something ("that was a
 * low effort answer") names nothing and goes to the judge. A named level runs without the judge: effort-auto found
 * Haiku also calls prompts that only describe hard work "named".
 */
export function namedEffort(text: string): Effort | undefined {
  const plain = unquoted(text)
  for (const m of plain.matchAll(NAMED_LEVEL)) {
    const before = plain.slice(Math.max(0, m.index - 200), m.index).toLowerCase()
    const sentence = before.split(/[.!?;\n]/).pop() ?? ''
    const clause = (sentence.split(/[,:]/).pop() ?? '').trim()
    if (NAMED_NOT.test(sentence) || NAMED_ABOUT.test(clause)) continue
    if (NAMED_DESCRIBES.test(plain.slice(m.index + m[0].length).toLowerCase())) continue
    // "effort to max": only with a word that sets it ("set effort to max"), not "make an effort to max out".
    const sets = /\beffort(\s+level)?\s+to\b/i.test(m[0])
    if (sets ? !/\b(set|change|switch|raise|lower|put|turn|bump|move)\b/.test(clause) : !NAMED_OPENER.test(clause) && !NAMED_ASK.test(clause)) continue
    return LEVEL_OF[(m[1] ?? m[2] ?? 'xhigh').toLowerCase().replace(/\s+/, ' ')]
  }
  return undefined
}

/** A short follow-up such as "go", "ok", "yes", "continue": two words and a dozen characters at most. */
export function isFollowUp(text: string): boolean {
  const t = text.trim()
  return t.length > 0 && t.length <= 12 && t.split(/\s+/).length <= 2
}

/**
 * Whether the assistant's last reply ended on a question ("Should I archive it?", "A, B or C?"). A short message
 * after one answers it, and the answer can start a small or a big job, so it goes to the judge instead of keeping
 * the effort.
 */
export function endsOnQuestion(context: string): boolean {
  const reply = context.split('\nassistant: ').pop() ?? ''
  return context.includes('assistant: ') && reply.slice(-400).includes('?')
}

/** The message as the judge reads it: images and files it carries are named, since the judge sees only text. */
export function withAttachments(text: string, attachments?: readonly { type: string }[]): string {
  if (!attachments?.length) return text
  const counts = new Map<string, number>()
  for (const a of attachments) counts.set(a.type, (counts.get(a.type) ?? 0) + 1)
  const said = [...counts].map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ')
  return `${text}

[The message comes with ${said} to look at.]`
}

/** The message as the judge reads it when it was typed while a task was still running. */
export function withMidTurn(text: string, effort: Effort): string {
  return `${text}

[Sent while the assistant was still working on the last task at ${effort} effort. If it adds to, corrects or steers that task, keep ${effort}; judge it on its own only if it is a separate new request.]`
}
// A lower verdict for a message typed mid-turn, applied when that turn ends (see prompt.submit).
let heldPick: Pick | null = null

/** A short follow-up that keeps the current effort: "go" between two steps, not an answer to a question. */
export function keepsEffort(message: string, context: string): boolean {
  return isFollowUp(message) && !endsOnQuestion(context)
}

type Judged = { verdict?: Pick; tokens: number }

/** The plugin's settings, as the judge, the bands and the panel read them. */
export type JudgeConfig = {
  /** A skill or slash command that writes the handoff instead of the built-in prompt, e.g. "session-handoff". */
  handoffSkill: string
  /** What follows the handoff: clear and carry on, clear and wait, or keep the chat and copy the handoff. The handoff
   *  bar opens on the choice made last; this is the first one. */
  handoffAfter: HandoffAfter
  /** The effort slider, -2 (cheaper) to 2 (smarter): tips the judge's close calls that way. */
  bias: number
  /** Auto never goes below this effort. */
  floor: Effort
  /** Auto never goes above this effort. */
  ceiling: Effort
  /** What the person switched off: the footer's handoff button and any of the alert bands. */
  hide: Hideable[]
  /** The swamp band shows once the context reaches this share of the compaction point, in percent. */
  swampAt: number
  /** default: the dashboard band above the prompt; minimal: the footer's small buttons and no band. */
  layout: 'default' | 'minimal'
  /** Acts in the terminal only, set from either surface. top: the bar above the prompt; bottom: a status line under the prompt and no bar at rest. */
  terminalPlace: 'top' | 'bottom'
  /** Who writes a compaction's summary. auto: Haiku 5.5 when the cache is cold, the chat's model when it is warm.
   *  session: always the chat's own model. */
  compactWith: 'auto' | 'session'
  /** advised: the footer slot is Compact until Haiku advises a handoff. always: it is always the Handoff button. */
  handoffButton: 'advised' | 'always'
  /** A prompt the judge calls simple runs on a cheaper model than the chat's (never a dearer one). */
  modelAuto: 'on' | 'off'
  /** on: every subagent the chat sends off gets an effort picked by the judge before it starts. */
  helpers: 'on' | 'off'
  /** The accent colour of everything Smart Token Saver draws: the brand violet, Claude orange or cherry-blossom rose. */
  theme: ThemeName
  /** auto: light when Claude Code's own theme is light. dark and light fix it. */
  appearance: 'auto' | 'dark' | 'light'
  /** Maintainer, Measurement: share of judged prompts, in percent, that run at the app's own effort as an A/B control. */
  abControl: number
  /** Maintainer, Measurement: the A/B log is written (~/.claude/smarttokensaver/usage). Off unless switched on. */
  measureLog: 'on' | 'off'
  /** The compaction window Smart Token Saver puts into the merged settings, in tokens; null leaves Claude Code's own. */
  compactWindow: number | null
}

/** The swamp thresholds the settings offer, in percent of the compaction point. */
export const SWAMP_STEPS = [10, 20, 30, 40, 50, 60, 70, 80] as const

/** The parts of Smart Token Saver a person can switch off: the footer's (setup) and the progress bar's (setup, settings).
 * The context (swamp), running-low (hot) and cold-cache alerts can be switched off for good in Customize. Each alert
 * also has its own ✕. */
export const HIDEABLE = ['handoff', 'timer', 'reason', 'progress', 'sounds', 'swamp', 'hot', 'cold'] as const
export type Hideable = (typeof HIDEABLE)[number]

// ---- Compaction window ------------------------------------------------------------------------------------------------
// The window Claude Code compacts against (autoCompactWindow). Smart Token Saver owns a setting for it and adds it to the merged
// settings through a settings.read hook, which uninstalling takes away. Where the hook does not take (a policy plugin
// above it skips it), Setup, the Context card and /smarttokensaver window write it into ~/.claude/settings.json (after
// a backup); where the file is closed to plugins too, the Context card offers Claude Code's own /autocompact.
/** The recommended window: replaying real transcripts, 300k cost 7-9 % less than 400k and much less than no cap. */
export const DEFAULT_WINDOW = 300_000
export const WINDOW_MIN = 100_000
export const WINDOW_MAX = 1_000_000
/** The picker's values; null is "Claude Code default" (no value added). */
export const WINDOW_CHOICES: readonly (number | null)[] = [250_000, 300_000, 350_000, 400_000, 500_000, null]
/** Claude Code keeps this much below the window free for the summary: it compacts at window minus this. */
export const COMPACT_BUFFER = 33_000

/**
 * A window as typed or stored: "300k", "300000", "0.3M"; "default" for Claude Code's own (null). Undefined when it is
 * not a number between WINDOW_MIN and WINDOW_MAX.
 */
export function parseWindow(raw: unknown): number | null | undefined {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim().toLowerCase().replace(/[_,\s]/g, '') : ''
  if (['default', 'auto', 'off', 'none'].includes(text)) return null
  // "300.000" with dots between thousands (as German writes it): the dots go.
  if (/^\d{1,3}(\.\d{3})+$/.test(text)) return parseWindow(text.replace(/\./g, ''))
  const m = text.match(/^(\d+(?:\.\d+)?)(k|m)?$/)
  if (!m) return undefined
  const n = Math.round(Number(m[1]) * (m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1000 : 1))
  return n >= WINDOW_MIN && n <= WINDOW_MAX ? n : undefined
}

/** "300k", "1M", or Claude Code's default. */
export function windowLabel(w: number | null): string {
  if (w === null) return 'Claude Code default'
  return w >= 1_000_000 ? `${+(w / 1_000_000).toFixed(1)}M` : `${Math.round(w / 1000)}k`
}

/**
 * The merged settings with Smart Token Saver's window in: never over a managed (policy) value, nothing when the setting is
 * Claude Code's default. A per-model value (modelSettings, which /autocompact writes) still wins in Claude Code.
 */
export function withWindow(merged: Record<string, unknown>, layers: readonly { source: string; settings: Record<string, unknown> }[], window: number | null): Record<string, unknown> {
  if (window === null) return merged
  if (layers.some(l => l.source === 'policy' && l.settings.autoCompactWindow !== undefined)) return merged
  return { ...merged, autoCompactWindow: window }
}

/** withWindow that never throws: the merge as it was when anything goes wrong. */
export function withWindowSafe(merged: Record<string, unknown>, layers: readonly { source: string; settings: Record<string, unknown> }[], window: number | null): Record<string, unknown> {
  try {
    return withWindow(merged, layers, window)
  } catch {
    return merged
  }
}

/** The thresholds every band and prompt reads, from the window Claude Code compacts against. Pure, so it is tested. */
export type Thresholds = {
  /** Tokens at which auto-compaction runs; null when it is off. */
  trigger: number | null
  /** The cold band shows from this many tokens. */
  coldFrom: number
  /** The handoff check runs from this many tokens. */
  handoffFrom: number
  /** The context share drawn on the ring, 0-100+, or null when auto-compaction is off. */
  percent: (tokens: number) => number | null
  /** The swamp band shows from this many tokens, for the swampAt percent. */
  swampFrom: (swampAt: number) => number
}
export const COLD_FLOOR = 110_000
export const COLD_CAP = 150_000
export const HANDOFF_FLOOR = 150_000
/** swampAt's Auto: the alert follows the window (autoSwampFrom). The other values are a fixed percent of the trigger. */
export const SWAMP_AUTO = 0
/** swampAt as the settings store it: "auto" or the percent. */
export const swampValue = (n: number) => (n === SWAMP_AUTO ? 'auto' : String(n))
/** Below this trigger (a 200k window) compaction comes so soon that Auto shows no alert at all. */
export const SWAMP_AUTO_MIN = 167_000
/** The room each alert needs before compaction to be any use: a handoff or summary turn (swamp), a /compact before the
 *  next cold call (cold), the judge running every second prompt (handoff check). With less, the alert stays away. */
const SWAMP_ROOM = 20_000
const COLD_ROOM = 30_000
const HANDOFF_ROOM = 40_000
/**
 * Auto's alert point for a trigger T: 20k below it at a 200k window, and further below the bigger the window, since
 * every message rereads the whole chat and the tokens a handoff saves grow with what is left until compaction. Above a
 * 300k window each further 100k adds 60k of lead: 227k (85 %) at 300k, 267k (73 %) at 400k, 507k (52 %) at 1M.
 * Rises with T while its share of T falls. Infinity (no alert) below SWAMP_AUTO_MIN.
 */
export function autoSwampFrom(trigger: number): number {
  if (!(trigger >= SWAMP_AUTO_MIN)) return Infinity
  const lead = SWAMP_ROOM + 0.2 * (trigger - SWAMP_AUTO_MIN) + 0.4 * Math.max(0, trigger - 267_000)
  return Math.round(trigger - lead)
}
export function thresholds(w: { window: number; trigger?: number | null; modelWindow?: number; autoCompact?: boolean }): Thresholds {
  const window = w.window > 0 ? w.window : w.modelWindow && w.modelWindow > 0 ? w.modelWindow : 200_000
  const trigger = w.autoCompact === false ? null : w.trigger && w.trigger > 0 ? w.trigger : Math.max(1, window - COMPACT_BUFFER)
  // Compacting a chat close to what remains after a compaction saves nothing, so the cold band starts at 110k at the
  // earliest. An alert that would leave less than its room before compaction stays away: compaction is next anyway.
  const roomy = (from: number, room: number) => (trigger !== null && trigger - from < room ? Infinity : from)
  const coldFrom = trigger === null ? COLD_CAP : roomy(Math.max(COLD_FLOOR, Math.min(trigger - 30_000, COLD_CAP)), COLD_ROOM)
  const handoffFrom = trigger === null ? HANDOFF_FLOOR : roomy(Math.max(HANDOFF_FLOOR, Math.round(trigger * 0.5)), HANDOFF_ROOM)
  const base = trigger ?? (w.modelWindow && w.modelWindow > 0 ? w.modelWindow : window)
  return {
    trigger,
    coldFrom,
    handoffFrom,
    percent: tokens => (trigger === null ? null : (tokens / trigger) * 100),
    swampFrom: swampAt => {
      if (swampAt === SWAMP_AUTO) return trigger === null ? Infinity : autoSwampFrom(trigger)
      return roomy(Math.round((base * swampAt) / 100), SWAMP_ROOM)
    },
  }
}

/**
 * Claude Code can compact later than the window it reports: resuming a long chat raises that chat's window (to about
 * twice what was loaded, capped by the model), and the breakdown does not always show
 * it. A chat that grows past the read trigger without compacting proves it. The trigger is then taken as the bigger of
 * that estimate (`loadTokens`, the first count this copy saw) and the next 50k step above the count plus the buffer,
 * within the model's window. Kept until a read shows another window or model. Pure, so it is tested.
 */
export function learnTrigger(prev: number | null, s: { trigger: number | null; modelWindow: number } | null, tokens: number, loadTokens: number | null): number | null {
  if (!s || s.trigger === null || !(tokens > s.trigger) || (prev !== null && tokens <= prev)) return prev
  const cap = s.modelWindow > 0 ? s.modelWindow - COMPACT_BUFFER : Infinity
  const step = Math.ceil((tokens + COMPACT_BUFFER) / 50_000) * 50_000 - COMPACT_BUFFER
  const fromLoad = loadTokens && loadTokens > 0 ? 2 * loadTokens + 20_000 - COMPACT_BUFFER : 0
  const est = Math.max(step, fromLoad > tokens ? fromLoad : 0)
  return Math.max(tokens, Math.min(est, cap))
}
/** The read window with a learned trigger in (see learnTrigger): what Claude Code really compacts at. */
export function withLearned<T extends { raw: number; trigger: number | null }>(s: T | null, learned: number | null): T | null {
  if (!s || learned === null || s.trigger === null || learned <= s.trigger) return s
  return { ...s, trigger: learned, raw: learned + COMPACT_BUFFER }
}

/** What Smart Token Saver knows of the window: read from the session's breakdown, and whether its own value is in force. */
export type WindowState = {
  /** The window this chat compacts against (rawMaxTokens). */
  raw: number
  source: string
  trigger: number | null
  autoCompact: boolean
  /** The model's own window. */
  modelWindow: number
  model: string
  /** A per-model value (modelSettings.<model>.autoCompactWindow), which wins over Smart Token Saver's. */
  modelValue?: number
  /** A managed (policy) value, which Smart Token Saver never overrides. */
  policyValue?: number
  at: number
}
export type WindowStatus = 'ok' | 'command' | 'default' | 'env' | 'policy' | 'model' | 'other' | 'blocked'
/**
 * Whether Smart Token Saver's window is what this chat runs on: 'ok' (or the model is smaller anyway), 'command' (the
 * right value, but set per model by /autocompact, not by the plugin), 'default' (none set), or why not: 'env'
 * (CLAUDE_CODE_AUTO_COMPACT_WINDOW), 'policy', 'model' (another per-model value), 'other' (an account or experiment
 * value), 'blocked' (the hook did not take: Claude Code's own /autocompact can set it).
 * The settings that win are named even when their value happens to match: a later change would not take.
 */
export function windowStatus(wanted: number | null, s: Pick2<WindowState, 'raw' | 'source' | 'modelWindow' | 'modelValue' | 'policyValue'>): WindowStatus {
  if (wanted === null) return 'default'
  const expected = Math.min(wanted, s.modelWindow || wanted)
  if (s.source === 'env') return 'env'
  if (s.policyValue !== undefined) return 'policy'
  if (s.modelValue !== undefined) return s.raw === expected ? 'command' : 'model'
  if (s.raw === expected) return 'ok'
  if (s.source === 'clientdata' || s.source === 'experiment') return 'other'
  return 'blocked'
}
/** Whether a change of window has to go through Claude Code's /autocompact: the hook was seen not to take, or a
 *  per-model value (which /autocompact writes) wins over anything the hook hands over. */
export function windowNeedsCommand(status: WindowStatus | null, hookBlocked: boolean): boolean {
  return hookBlocked || status === 'blocked' || status === 'model' || status === 'command'
}
type Pick2<T, K extends keyof T> = { [P in K]: T[P] }

// ---- Maintainer, Measurement: the A/B log ------------------------------------------------------------------------------------
// With Measurement on, every judged prompt, every request Auto steered and every compaction is written as one JSON
// line to ~/.claude/smarttokensaver/usage/<chat>-<load>.jsonl, so the saving can be measured across chats (tools/ab-report.mjs).
// Each line carries the plugin version and the settings that shape a verdict. A share of the judged prompts (abControl)
// runs at the app's own effort, not the verdict: the control arm, what the prompt would have cost without Smart Token Saver.
// The judge is still asked there, so the log also says what Auto would have picked. Off, nothing is written.
export const AB_STEPS = [0, 10, 20, 30, 50] as const
export type AbArm = 'auto' | 'control' | 'named' | 'nojudge'
/** The arm for a judged prompt: control with probability share/100, else auto. */
export function abArmFor(share: number, rnd: number): 'auto' | 'control' {
  return rnd < Math.max(0, Math.min(100, share)) / 100 ? 'control' : 'auto'
}
// The coin for the arm: random, unless SMARTTOKENSAVER_AB_COIN (0 to 1) fixes it, which the tests do.
async function abCoin($: EngineInterface): Promise<number> {
  const fixed = Number(await $.env.get('SMARTTOKENSAVER_AB_COIN').catch(() => undefined))
  return Number.isFinite(fixed) && fixed >= 0 && fixed <= 1 ? fixed : Math.random()
}
/** Usage log files older than this are removed at session start. */
export const AB_KEEP_DAYS = 30
// The fs API has no append: each load writes its lines in parts of AB_PART_LINES, a part rewritten whole while it
// fills, one write at a time (a chain), so a slow write is never overtaken by an older buffer.
export const AB_PART_LINES = 400
type AbTag = { id: string; arm: AbArm; chat: string }
const abParts: string[][] = [[]]
const abWritten: number[] = [0]
let abSeq = 0
let abCurrent: AbTag | null = null
let abChain: Promise<unknown> = Promise.resolve()
const abLoad = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '')}-${Math.random().toString(36).slice(2, 6)}`
const abOn = () => config.measureLog === 'on'
/** The settings that shape what a line measures, short. */
export function abConfigTag(c: JudgeConfig): Record<string, unknown> {
  return { bias: c.bias, floor: c.floor, ceiling: c.ceiling, share: c.abControl, compactWith: c.compactWith, window: c.compactWindow, modelAuto: c.modelAuto, helpers: c.helpers }
}
async function abWritePart($: EngineInterface, chat: string, i: number) {
  const lines = abParts[i]
  if (!lines || lines.length === abWritten[i]) return
  const count = lines.length
  const home = (await envUserProfile($)) ?? (await envHome($))
  if (!home) return
  const body = lines.slice(0, count).join('\n') + '\n'
  const name = `${chat}-${abLoad}-${String(i).padStart(3, '0')}.jsonl`
  const ok = await $.fs
    .write(`${home}/${DATA_DIR}/usage/${name}`, body)
    .then(() => true)
    .catch(() => false)
  // Counted only once written: a failed write is tried again with the next line.
  if (ok) abWritten[i] = Math.max(abWritten[i] ?? 0, count)
}
async function abChatId($: EngineInterface): Promise<string> {
  if (loadedSession !== '-') return loadedSession
  const sid = await $.session.id().catch(() => '')
  return sid ? String(sid).slice(0, 8) : '-'
}
function abLog($: EngineInterface, chat: string, rec: Record<string, unknown>) {
  if (!abOn()) return
  let i = abParts.length - 1
  if (abParts[i].length >= AB_PART_LINES) {
    abParts.push([])
    abWritten.push(0)
    i += 1
  }
  abParts[i].push(JSON.stringify({ ts: new Date().toISOString(), chat, v: ownVersion || OWN_VERSION, cfg: abConfigTag(config), ...rec }))
  // Earlier parts that failed are retried too.
  abChain = abChain
    .then(async () => {
      for (let k = 0; k <= i; k++) await abWritePart($, chat, k)
    })
    .catch(() => undefined)
}
/** Starts a prompt in the log; the requests sent after it count to it until the next prompt starts. Kept in the store
 *  too, with its chat, so a reload in the middle of a turn still counts the rest of the turn to it. */
async function abPrompt($: EngineInterface, arm: AbArm, rec: Record<string, unknown>) {
  await syncMeasure($)
  if (!abOn()) return
  const chat = await abChatId($)
  abSeq += 1
  abCurrent = { id: `${chat}-${abLoad}-${abSeq}`, arm, chat }
  await $.store.set('abCurrent', abCurrent).catch(() => undefined)
  abLog($, chat, { type: 'prompt', id: abCurrent.id, arm, ...rec })
}
/** The prompt a request counts to, read before the request goes out (not after its answer, when a newer prompt may
 *  have started). After a reload the module's own copy is gone: the store's, if it is this chat's. */
async function abTag($: EngineInterface): Promise<AbTag | null> {
  if (!abOn()) return null
  const chat = await abChatId($)
  if (abCurrent && abCurrent.chat === chat) return abCurrent
  const kept = (await $.store.get('abCurrent').catch(() => null)) as AbTag | null
  abCurrent = kept && typeof kept === 'object' && kept.chat === chat ? kept : null
  return abCurrent
}
/** One compaction in the log: what started it, cold or warm, who wrote it, and the context before. */
async function abCompaction($: EngineInterface, rec: { trigger: string; cold: boolean; by: string; tokens: number | undefined }) {
  await syncMeasure($)
  if (!abOn()) return
  abLog($, await abChatId($), { type: 'compact', ...rec })
}
/** The name every log part gets (abWritePart): chat, load stamp, part number. Only such files are ever removed. */
export const AB_LOG_NAME = /^[A-Za-z0-9?_-]{1,8}-\d{8}T\d{6}-[a-z0-9]{1,8}-\d{3}\.jsonl$/
/**
 * Measurement as the shared store says it, read for each prompt: switched off in one chat, it is off in every open
 * chat at once (each chat's module keeps its own config, and a refused config write reaches no other chat). Only the
 * way to off is taken from there: a chat never starts logging because of another one.
 */
async function syncMeasure($: EngineInterface) {
  if (config.measureLog !== 'on') return
  // Measurement is a maintainer tool: anywhere else a saved "on" (e.g. from Configure) logs nothing and runs no control.
  if (!(await maintainerClone($))) {
    config = { ...config, measureLog: 'off', abControl: 0 }
    return
  }
  const m = (await $.store.get('maintainerMeasure').catch(() => null)) as { measureLog?: unknown } | null
  if (m && typeof m === 'object' && m.measureLog === 'off') config = { ...config, measureLog: 'off', abControl: 0 }
}
/** The log files to remove: this plugin's own log parts by name, regular files, older than AB_KEEP_DAYS at `now`. */
export function staleLogs(files: readonly { name: string; mtimeMs: number; kind?: string; isLink?: boolean }[], now: number): string[] {
  return files
    .filter(f => AB_LOG_NAME.test(f.name) && (f.kind === undefined || f.kind === 'file') && f.isLink !== true && now - f.mtimeMs > AB_KEEP_DAYS * 86_400_000)
    .map(f => f.name)
}
/** Log files the last cleanup could not remove, or left alone for being outside the folder (for /smarttokensaver maintainer). */
let abCleanFailed = 0
/** Removes usage log files older than AB_KEEP_DAYS. $.fs has no remove, so the files go with one `rm` (macOS, Linux);
 *  elsewhere, or where the folder is missing, nothing happens. */
async function cleanAbLogs($: EngineInterface) {
  const home = (await envUserProfile($)) ?? (await envHome($))
  if (!home || !home.startsWith('/')) return
  const base = `${home}/${DATA_DIR}`
  const dir = `${base}/usage`
  if (!(await $.fs.exists(dir).catch(() => false))) return
  // The folder must be a real folder inside the plugin's own, not a link to somewhere else (a shared archive).
  const [baseStat, dirStat] = await Promise.all([$.fs.stat(base, { resolve: true }).catch(() => null), $.fs.stat(dir, { resolve: true }).catch(() => null)])
  if (!baseStat?.realPath || !dirStat?.realPath || dirStat.isLink || dirStat.kind !== 'dir' || dirStat.realPath !== `${baseStat.realPath}/usage`) {
    abCleanFailed++
    return
  }
  const entries = (await $.fs.list(dir).catch(() => [])) as unknown[]
  const now = await $.clock.now().catch(() => Date.now())
  const files: { name: string; mtimeMs: number; kind?: string; isLink?: boolean }[] = []
  for (const entry of entries) {
    const o = (typeof entry === 'string' ? { name: entry } : entry) as { name?: unknown; kind?: unknown; isLink?: unknown; mtimeMs?: unknown }
    const name = String(o.name ?? '')
    if (!AB_LOG_NAME.test(name)) continue
    const stat = await $.fs.stat(`${dir}/${name}`, { resolve: true }).catch(() => null)
    // A link, or anything that lands outside the folder, is left alone.
    if (!stat || stat.isLink || stat.kind !== 'file' || stat.realPath !== `${dirStat.realPath}/${name}`) continue
    files.push({ name, mtimeMs: Number(stat.mtimeMs), kind: 'file', isLink: false })
  }
  const stale = staleLogs(files, now)
  if (!stale.length) return
  const r = await $.process.run(['rm', '-f', '--', ...stale.map(n => `${dirStat.realPath}/${n}`)], { timeoutMs: 30_000 }).catch(() => null)
  if (!r || r.exitCode !== 0) {
    abCleanFailed += stale.length
    void proof($, `log cleanup failed: ${r ? (r.stderr || r.stdout).trim().slice(0, 120) : 'rm did not run'}`)
  }
}

// What the app passed to register, so settings kept in the store can be laid over it at session start.
let pluginOptions: Record<string, unknown> = {}
// The code's defaults are plugin.json's: Haiku judges, effort up to high, compaction by Auto, a handoff that waits.
let config: JudgeConfig = {
  handoffSkill: '',
  handoffAfter: 'confirm',
  bias: 0,
  floor: 'low',
  ceiling: 'high',
  hide: ['reason'],
  swampAt: SWAMP_AUTO,
  layout: 'default',
  terminalPlace: 'top',
  compactWith: 'auto',
  handoffButton: 'advised',
  modelAuto: 'off',
  helpers: 'off',
  theme: DEFAULT_THEME,
  appearance: 'auto',
  abControl: 0,
  measureLog: 'off',
  compactWindow: DEFAULT_WINDOW,
}

/** The settings as the engine hands them over (defaults filled in), cleaned to the shape the mod reads. */
export function readConfig(options: unknown): JudgeConfig {
  const o = (options ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const window = parseWindow(o.compactWindow)
  return {
    handoffSkill: str(o.handoffSkill).replace(/^\//, ''),
    handoffAfter: (['continue', 'copy'] as const).find(a => a === str(o.handoffAfter)) ?? 'confirm',
    bias: Math.max(-2, Math.min(2, Math.round(Number(str(o.effortBias)) || 0))),
    floor: EFFORTS.includes(str(o.effortFloor) as Effort) ? (str(o.effortFloor) as Effort) : 'low',
    ceiling: EFFORTS.includes(str(o.effortCeiling) as Effort) ? (str(o.effortCeiling) as Effort) : 'high',
    swampAt: SWAMP_STEPS.includes(Number(str(o.swampAt)) as (typeof SWAMP_STEPS)[number]) ? Number(str(o.swampAt)) : SWAMP_AUTO,
    layout: str(o.layout) === 'minimal' ? 'minimal' : 'default',
    terminalPlace: str(o.terminalPlace) === 'bottom' ? 'bottom' : 'top',
    // "haiku" (Haiku always) is gone: it reads as Auto, which uses Haiku whenever the cache is cold.
    compactWith: str(o.compactWith) === 'session' ? 'session' : 'auto',
    handoffButton: str(o.handoffButton) === 'always' ? 'always' : 'advised',
    // Off unless switched on: one prompt on another model rewrites the whole chat into that model's cache, which costs
    // more than it saves in a chat that is in use (measured 2026-10-10).
    modelAuto: str(o.modelAuto) === 'on' ? 'on' : 'off',
    helpers: str(o.helpers) === 'on' ? 'on' : 'off',
    theme: THEMES.find(t => t === str(o.theme)) ?? DEFAULT_THEME,
    appearance: (['dark', 'light'] as const).find(a => a === str(o.appearance)) ?? 'auto',
    abControl: str(o.abControl) !== '' && AB_STEPS.includes(Number(str(o.abControl)) as (typeof AB_STEPS)[number]) ? Number(str(o.abControl)) : 0,
    measureLog: str(o.measureLog) === 'on' ? 'on' : 'off',
    compactWindow: window === undefined ? DEFAULT_WINDOW : window,
    // The judge's line is off until switched on; an empty string saved from the panel means everything shows.
    hide: (o.hide === undefined ? 'reason' : str(o.hide))
      .split(',')
      .map(part => part.trim())
      .filter((part): part is Hideable => (HIDEABLE as readonly string[]).includes(part)),
  }
}

/** The text the judge reads: the current pair, the last turns and the next message. */
function judgeQuestion(prompt: string, current: Pick | null, context: string): string {
  return [
    current ? `Current: ${current.model} / ${current.effort}` : 'Current: none',
    context ? `Recent conversation:\n${context}` : '',
    `Next message:\n${prompt.slice(0, 2000)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Haiku judges every prompt, through the person's own Claude login: no key, no other service. Never throws. */
async function judge($: EngineInterface, prompt: string, current: Pick | null): Promise<Judged> {
  const context = await recentContext($).catch(() => '')
  return askHaiku($, prompt, current, context).catch(() => ({ tokens: 0 }))
}

/** The context as the judge and the handoff check read it: tokens, and where compaction runs. Not a percent, so a
 *  change of window does not change what they are told about the same chat. */
export function contextLine(tokens: number, trigger: number | null): string {
  return `Context: ${Math.round(tokens / 1000)}k tokens; ${trigger === null ? 'auto-compaction is off' : `compaction at ${Math.round(trigger / 1000)}k tokens`}`
}

/** Haiku 5.5 through the session's own login: no key, no other service. */
async function askHaiku($: EngineInterface, prompt: string, current: Pick | null, context: string): Promise<Judged> {
  const used = lastContext ? contextLine(lastContext.tokens, limits().trigger) : ''
  const asked = [judgeQuestion(prompt, current, context), used].filter(Boolean).join('\n\n')
  const ask = (model: string) => $.model.complete({ model, system: JUDGE_SYSTEM, prompt: asked, maxTokens: 160, effort: 'low', timeoutMs: 6000 })
  // Haiku 5.5 by name: Claude Code builds that predate it map the plain alias to Haiku 4.5, at ten times the price.
  // Where the API refuses 5.5, the alias stands in; a timeout or an empty reply is not asked twice.
  let r = await ask(COMPACT_MODEL)
  if (!r.isAnswered && r.reason === 'api-error') r = await ask('haiku')
  const verdict = r.isAnswered ? parseVerdict(r.text) : undefined
  const tokens = r.isAnswered && r.usage ? r.usage.input_tokens + r.usage.output_tokens : 0
  return { verdict: verdict && { ...verdict, by: 'haiku' }, tokens }
}

// Whether a fresh chat would now serve better than carrying on: Haiku's call. It runs from limits().handoffFrom tokens
// (150k, or half the compaction point when that is higher), every HANDOFF_CHECK_EVERY messages, so it costs a cent now
// and then. It reads more than the effort judge: what the chat was for, the trail of topics, the last turns, the context
// and the cache.
const HANDOFF_CHECK_EVERY = 2
const HANDOFF_SYSTEM = `You decide whether the person should hand off now: start a fresh chat that carries over a short summary, instead of carrying on in this one. You are shown what the chat was for, the trail of what the person asked, the last turns, the next message, how full the context is and whether the cache is cold.

Say yes only for a clear reason: the task just finished and the next message is something else, the topic has changed so the old context is dead weight, the chat keeps going in circles on the same problem, or a long chat now holds so much unrelated history that a clean start would be sharper. A normal next step of the same work is never a reason, a long chat by itself is not one, and neither is a high context share when the work is going well. When unsure, say no: a wrong yes costs the person more than a missed one.

Reply with JSON only: {"handoff":"reason of at most 8 words, in the person's language"} for yes, or {"handoff":null} for no.`

/** What the handoff check reads: the chat's purpose, a trail of the person's messages, the last reply's end. */
export function handoffEvidence(messages: readonly { role: string; text: string }[], next: string, tokens: number, trigger: number | null, cold: boolean): string {
  const asked = messages.filter(m => m.role === 'user' && m.text.trim())
  const first = asked[0]?.text.slice(0, 500) ?? ''
  const trail = asked.slice(-8, -1).map(m => `- ${m.text.slice(0, 160).replace(/\s+/g, ' ')}`)
  const reply = lastAssistantText(messages).slice(-700)
  return [
    first ? `What the chat was for (first message):\n${first}` : '',
    trail.length ? `Trail of earlier messages:\n${trail.join('\n')}` : '',
    reply ? `The assistant's last reply (its end):\n${reply}` : '',
    `Next message:\n${next.slice(0, 600)}`,
    `${contextLine(tokens, trigger)}; ${asked.length} messages so far; the cache is ${cold ? 'cold' : 'warm'}.`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Reads Haiku's answer: a reason, or null for no (anything unreadable is no). */
export function parseHandoffAnswer(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const { handoff } = JSON.parse(match[0]) as { handoff?: unknown }
    return typeof handoff === 'string' && handoff.trim() ? handoff.trim().slice(0, 70) : null
  } catch {
    return null
  }
}

let promptsSinceHandoffCheck = 0
/** Called with each message the person sends. Sets or clears the advice; never throws, never holds the message. */
async function checkHandoff($: EngineInterface, next: string) {
  const tokens = lastContext?.tokens ?? 0
  const limit = limits()
  if (tokens < limit.handoffFrom) {
    promptsSinceHandoffCheck = 0
    if ((await read($, handoffAdvice)) !== null) {
      await update($, handoffAdvice, () => null)
      $.ui.invalidate('ui.render')
    }
    return
  }
  promptsSinceHandoffCheck++
  if (promptsSinceHandoffCheck < HANDOFF_CHECK_EVERY) return
  promptsSinceHandoffCheck = 0
  try {
    const cold = await chatIsCold($)
    const evidence = handoffEvidence(await $.session.messages(), next, tokens, limit.trigger, cold)
    const ask = (model: string) => $.model.complete({ model, system: HANDOFF_SYSTEM, prompt: evidence, maxTokens: 60, effort: 'low', timeoutMs: 8000 })
    let r = await ask(COMPACT_MODEL)
    if (!r.isAnswered && r.reason === 'api-error') r = await ask('haiku')
    if (!r.isAnswered) return
    const reason = parseHandoffAnswer(r.text)
    void proof($, `handoff check at ${Math.round(tokens / 1000)}k: ${reason ?? 'no'}`)
    if (reason !== (await read($, handoffAdvice))) {
      await update($, handoffAdvice, () => reason)
      $.ui.invalidate('ui.render')
    }
  } catch {
    // A failed check changes nothing.
  }
}

// The judge benchmark (/smarttokensaver bench): labelled prompts in bench/judge-cases.json, each run through the same
// pipeline a real prompt takes (a short follow-up keeps the current effort, anything else goes to a judge).
export type BenchCase = { id: string; kind: string; holdout?: boolean; current: Pick; context?: string; message: string; ok: Effort[] }
export type BenchAnswer = { id: string; judge: string; effort?: Effort; by?: string; why?: string; sure?: number; model?: ModelKey; ms: number; tokens: number }

/** Where an answer lands against the labels: right, too low (risks quality), too high (wastes), or no answer. */
export function benchGrade(c: BenchCase, effort: Effort | undefined): 'hit' | 'under' | 'over' | 'none' {
  if (!effort) return 'none'
  if (c.ok.includes(effort)) return 'hit'
  const rank = EFFORTS.indexOf(effort)
  return rank < Math.min(...c.ok.map(e => EFFORTS.indexOf(e))) ? 'under' : 'over'
}

/** The benchmark's table: per judge the share it got right, how it missed, and how fast it was; then per kind. */
export function benchReport(cases: BenchCase[], answers: BenchAnswer[]): string {
  const byId = new Map(cases.map(c => [c.id, c]))
  const judges = [...new Set(answers.map(a => a.judge))]
  const kinds = [...new Set(cases.map(c => c.kind))]
  const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '-')
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const lines = ['| Judge | Right | Too low | Too high | No answer | Median ms |', '| --- | --- | --- | --- | --- | --- |']
  for (const j of judges) {
    const mine = answers.filter(a => a.judge === j)
    const g = mine.map(a => benchGrade(byId.get(a.id)!, a.effort))
    const n = (k: string) => g.filter(x => x === k).length
    const asked = mine.filter(a => a.ms > 0).map(a => a.ms)
    lines.push(`| ${j} | ${pct(n('hit'), g.length)} | ${n('under')} | ${n('over')} | ${n('none')} | ${asked.length ? median(asked) : '-'} |`)
  }
  // The held-out cases were never tuned against: the honest score. The rest shaped the judge prompts.
  const sets = [
    ['tuned on', cases.filter(c => !c.holdout)],
    ['held out', cases.filter(c => c.holdout)],
  ] as const
  lines.push('', `| Set (cases) | ${judges.join(' | ')} |`, `| --- | ${judges.map(() => '---').join(' | ')} |`)
  for (const [name, set] of sets) {
    if (!set.length) continue
    const ids = set.map(c => c.id)
    const cells = judges.map(j => {
      const mine = answers.filter(a => a.judge === j && ids.includes(a.id))
      return pct(mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) === 'hit').length, mine.length)
    })
    lines.push(`| ${name} (${set.length}) | ${cells.join(' | ')} |`)
  }
  lines.push('', `| Kind (cases) | ${judges.join(' | ')} |`, `| --- | ${judges.map(() => '---').join(' | ')} |`)
  for (const k of kinds) {
    const ids = cases.filter(c => c.kind === k).map(c => c.id)
    const cells = judges.map(j => {
      const mine = answers.filter(a => a.judge === j && ids.includes(a.id))
      return pct(mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) === 'hit').length, mine.length)
    })
    lines.push(`| ${k} (${ids.length}) | ${cells.join(' | ')} |`)
  }
  // Does "unsure" predict a miss? The Smarter lean and the cheaper-model guard both act on it, so it is measured here.
  const judged = judges.filter(j => !j.startsWith('always'))
  const sureLines = ['', '| Judge | Sure when right | Sure when wrong | Misses under 65% sure | Misses under 85% sure | Answers under 65% | Answers under 85% |', '| --- | --- | --- | --- | --- | --- | --- |']
  for (const j of judged) {
    const mine = answers.filter(a => a.judge === j && a.effort && typeof a.sure === 'number')
    if (!mine.length) continue
    const wrong = mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) !== 'hit')
    const right = mine.filter(a => benchGrade(byId.get(a.id)!, a.effort) === 'hit')
    const avg = (xs: BenchAnswer[]) => (xs.length ? `${Math.round((xs.reduce((t, a) => t + a.sure!, 0) / xs.length) * 100)}%` : '-')
    const under = (xs: BenchAnswer[], t: number) => xs.filter(a => a.sure! < t).length
    sureLines.push(`| ${j} (${mine.length} with a score) | ${avg(right)} | ${avg(wrong)} | ${under(wrong, 0.65)} of ${wrong.length} | ${under(wrong, 0.85)} of ${wrong.length} | ${under(mine, 0.65)} | ${under(mine, 0.85)} |`)
  }
  const pickLines = ['', '| Judge | Haiku | Sonnet | Opus | Other |', '| --- | --- | --- | --- | --- |']
  for (const j of judged) {
    const mine = answers.filter(a => a.judge === j && a.model)
    if (!mine.length) continue
    const n = (k: string) => mine.filter(a => a.model === k).length
    pickLines.push(`| ${j} | ${n('haiku')} | ${n('sonnet')} | ${n('opus')} | ${mine.length - n('haiku') - n('sonnet') - n('opus')} |`)
  }
  lines.push(...(sureLines.length > 3 ? sureLines : []), ...(pickLines.length > 3 ? pickLines : []))
  const misses = answers
    .filter(a => !a.judge.startsWith('always') && benchGrade(byId.get(a.id)!, a.effort) !== 'hit')
    .map(a => `- ${a.judge}${a.by && a.by !== a.judge ? ` (via ${a.by})` : ''} ${a.id}: said ${a.effort ?? 'nothing'}${a.why ? ` (${a.why})` : ''}, wanted ${byId.get(a.id)!.ok.join('/')}: "${byId.get(a.id)!.message.slice(0, 60)}"`)
  return [...lines, '', 'Misses:', ...(misses.length ? misses : ['- none'])].join('\n')
}

/** Runs every case through the judge, a few at a time, and returns the answers. */
async function runBench($: EngineInterface, cases: BenchCase[]): Promise<BenchAnswer[]> {
  const judges: [string, (c: BenchCase) => Promise<Judged | undefined>][] = [
    ['haiku', c => askHaiku($, c.message, c.current, c.context ?? '')],
  ]
  const answers: BenchAnswer[] = []
  // Baselines: what a fixed effort would score on the same labels.
  for (const fixed of ['medium', 'high'] as Effort[])
    for (const c of cases) answers.push({ id: c.id, judge: `always ${fixed}`, effort: fixed, ms: 0, tokens: 0 })
  const jobs = judges.flatMap(([name, ask]) => cases.map(c => ({ name, ask, c })))
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const { name, ask, c } = jobs[next++]
      // The mod never asks a judge about a short follow-up: it keeps the current effort.
      if (keepsEffort(c.message, c.context ?? '')) {
        answers.push({ id: c.id, judge: name, effort: c.current.effort, ms: 0, tokens: 0 })
        continue
      }
      const started = await $.clock.now()
      const got = await ask(c).catch(() => undefined)
      answers.push({ id: c.id, judge: name, effort: got?.verdict?.effort, by: got?.verdict?.by, why: got?.verdict?.why, sure: got?.verdict?.sure, model: got?.verdict?.model, ms: (await $.clock.now()) - started, tokens: got?.tokens ?? 0 })
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return answers
}

function keyOf(id: string): ModelKey | undefined {
  return MODELS.find(m => id.includes(m.key))?.key
}

/** Records the model the session now runs; the pick follows it, so the band never shows a stale one. */
/** The id of the model the chat runs on, as last seen: its name with its version shows in the bar. */
let sessionModelId = ''
/** Nothing to show or count as an effort: the chat runs on a Haiku before 5.5. A prompt routed to Haiku goes to 5.5. */
const withoutEffort = (key: ModelKey | undefined) => key === 'haiku' && noEffort(sessionModelId)
async function modelIs($: EngineInterface, id: string) {
  if (id) sessionModelId = id
  const pause = !cacheSafe(id) && keyOf(id) !== 'haiku'
  if (pause !== (await read($, paused))) await update($, paused, () => pause)
  const key = keyOf(id)
  if (!key || key === (await read($, model))) return
  await update($, model, () => key)
  // The engine's effort can differ per model, so a change across a switch is not the person's doing;
  // and a model turned down earlier may be suggested again.
  engineEffort = undefined
  declined = null
  const current = await read($, pick)
  if (current && current.model !== key) await choose($, { ...current, model: key })
  if ((await read($, suggestion)) === key) await update($, suggestion, () => null)
}

async function sessionModel($: EngineInterface): Promise<ModelKey> {
  const id = await $.session.model()
  return MODELS.find(m => id.includes(m.key))?.key ?? 'sonnet'
}


// Proof log: every verdict, /effort and request effort, written to SMARTTOKENSAVER_LOG, or to
// %TEMP%/smarttokensaver-proof.log while the mod is loaded from a dev-mods folder. Off otherwise.
const proofLines: string[] = []
// An environment variable does not change while the session runs, so each one is asked for once. The
// engine wants the name spelled out in every $.env.get call, hence one small getter per variable.
type EnvAsk = Promise<string | undefined> | undefined
let askLog: EnvAsk
let askTemp: EnvAsk
let askTmpdir: EnvAsk
let askModelUi: EnvAsk
let askUserProfile: EnvAsk
let askHome: EnvAsk
const envLog = ($: EngineInterface) => (askLog = askLog ?? $.env.get('SMARTTOKENSAVER_LOG'))
const envTemp = ($: EngineInterface) => (askTemp = askTemp ?? $.env.get('TEMP'))
const envTmpdir = ($: EngineInterface) => (askTmpdir = askTmpdir ?? $.env.get('TMPDIR'))
const envModelUi = ($: EngineInterface) => (askModelUi = askModelUi ?? $.env.get('SMARTTOKENSAVER_MODEL_UI'))
const envUserProfile = ($: EngineInterface) => (askUserProfile = askUserProfile ?? $.env.get('USERPROFILE'))
const envHome = ($: EngineInterface) => (askHome = askHome ?? $.env.get('HOME'))

async function proofPath($: EngineInterface): Promise<string | undefined> {
  const named = await envLog($)
  if (named) return named
  if (!$.plugin.root.replace(/\\/g, '/').includes('/dev-mods/')) return undefined
  const tmp = (await envTemp($)) ?? (await envTmpdir($)) ?? '/tmp'
  return `${tmp}/${PLUGIN}-proof.log`
}
async function proof($: EngineInterface, line: string) {
  const path = await proofPath($).catch(() => undefined)
  if (!path) return
  proofLines.push(`${new Date().toISOString()} ${line}`)
  await $.fs.write(path, proofLines.slice(-200).join('\n') + '\n').catch(() => undefined)
}

// The effort the engine itself last asked for on the main loop (the app's setting; this mod only
// rewrites the request, never the setting). It changing means the person set it (the app's Effort
// control, their own /effort): that wins and Auto goes off.
let engineEffort: string | undefined
// The pick was carried over from the last chat (the store), not made in this one: the app's effort may overrule it.
let pickCarried = false
// The last main-chat request, for /smarttokensaver debug: what the app asked for and what the mod sent instead, if anything.
let lastRequest: { index: number; appModel: string; appEffort: unknown; model: string; effort: unknown; at: number } | null = null
// The slash command this mod last typed into the prompt box.
let lastTyped = ''
// The toast about pressing Enter is shown once; on every click it is only noise.
let toldAboutEnter = false
let lastFooter = ''
// A model the person turned down; not suggested again until they pick something else.
let declined: ModelKey | null = null

/**
 * Types a slash command into the prompt box for the person to send with Enter. A command the person
 * sends is read by the app itself, so its own Model and Effort controls follow; one the mod runs
 * inside the engine is not. Never overwrites a draft: returns false when the box is not empty.
 */
async function typeCommand($: EngineInterface, text: string): Promise<boolean> {
  try {
    const draft = (await $.prompt.read()).text.trim()
    // A draft of your own is never overwritten; the mod's own earlier command is replaced.
    if (draft !== '' && draft !== lastTyped) return false
    const filled = await $.prompt.fill({ text })
    if (filled.isFilled) lastTyped = text
    if (filled.isFilled && !toldAboutEnter) {
      toldAboutEnter = true
      $.ui.toast(`Press Enter to send ${text} so the app's own control follows`)
    }
    return filled.isFilled
  } catch {
    return false
  }
}

/** A model change reloads the context, so it only happens when the person says yes. */
async function switchModel($: EngineInterface, model: ModelKey) {
  try {
    await $.command.run({ command: 'model', args: model })
    declined = null
    await update($, suggestion, () => null)
    const current = await read($, pick)
    if (current) await choose($, { ...current, model })
  } catch {
    $.ui.toast('Could not switch the model right now')
  }
}

/**
 * The tally in its current shape. A hot reload keeps the state an older version wrote ({ requests, actual,
 * baseline } before 0.2.0), so every read goes through this.
 */
export function asSpent(t: unknown): Spent {
  const v = (t ?? {}) as Partial<Spent>
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
  const judged = (v.judge ?? {}) as Partial<Spent['judge']>
  return {
    prompts: num(v.prompts),
    requests: num(v.requests),
    input: num(v.input),
    write: num(v.write),
    // Kept since 1.0.0; a tally from before it prices its writes as 5-minute ones.
    writeCost: typeof v.writeCost === 'number' && Number.isFinite(v.writeCost) ? v.writeCost : num(v.write) * WEIGHT.write,
    read: num(v.read),
    out: num(v.out),
    byEffort: v.byEffort && typeof v.byEffort === 'object' ? v.byEffort : {},
    judge: { haiku: num(judged.haiku), ms: num(judged.ms), tokens: num(judged.tokens) },
    moved: num(v.moved),
    redone: num(v.redone),
    helpers: {
      runs: v.helpers?.runs && typeof v.helpers.runs === 'object' ? v.helpers.runs : {},
      requests: num(v.helpers?.requests),
      cost: num(v.helpers?.cost),
    },
  }
}

/** A request's tokens weighted by price, in input-token terms (see WEIGHT). */
export function weighted(usage: PricedUsage): number {
  return (
    (usage.input_tokens ?? 0) * WEIGHT.input +
    writeCost(usage) +
    (usage.cache_read_input_tokens ?? 0) * WEIGHT.read +
    (usage.output_tokens ?? 0) * WEIGHT.out
  )
}

/** Adds one request Auto steered: every kind of token it used, under the effort it ran at. */
async function tally(
  $: EngineInterface,
  effort: Effort,
  usage: PricedUsage & { input_tokens: number; output_tokens: number },
  tag: AbTag | null = null,
) {
  const cached = usage.cache_read_input_tokens ?? 0
  const write = usage.cache_creation_input_tokens ?? 0
  const written = writeCost(usage)
  const cost = usage.input_tokens * WEIGHT.input + written + cached * WEIGHT.read + usage.output_tokens * WEIGHT.out
  if (tag) {
    abLog($, tag.chat, { type: 'request', prompt: tag.id, arm: tag.arm, effort, input: usage.input_tokens, write, read: cached, out: usage.output_tokens, cost })
  }
  await update($, saved, old => {
    const t = asSpent(old)
    const bucket = t.byEffort[effort] ?? { prompts: 0, cost: 0 }
    return {
      ...t,
      requests: t.requests + 1,
      input: t.input + usage.input_tokens,
      write: t.write + write,
      writeCost: t.writeCost + written,
      read: t.read + cached,
      out: t.out + usage.output_tokens,
      byEffort: { ...t.byEffort, [effort]: { ...bucket, cost: bucket.cost + cost } },
    }
  })
}

/** Counts one prompt Auto judged: under its effort, and what the judge took. */
async function countPrompt($: EngineInterface, effort: Effort | undefined, by: Pick['by'] | undefined, ms: number, judgeTokens: number) {
  await update($, saved, old => {
    const t = asSpent(old)
    const judged = {
      haiku: t.judge.haiku + (by === 'haiku' ? 1 : 0),
      ms: t.judge.ms + ms,
      tokens: t.judge.tokens + judgeTokens,
    }
    if (!effort) return { ...t, judge: judged }
    const bucket = t.byEffort[effort] ?? { prompts: 0, cost: 0 }
    return { ...t, judge: judged, prompts: t.prompts + 1, byEffort: { ...t.byEffort, [effort]: { ...bucket, prompts: bucket.prompts + 1 } } }
  })
}

/** The cache lifetime a response's writes got, when it says; nothing when it wrote nothing or does not say. */
export function cacheTtlOf(usage: unknown): keyof typeof CACHE_TTL | undefined {
  const c = (usage as { cache_creation?: { ephemeral_1h_input_tokens?: number; ephemeral_5m_input_tokens?: number } } | null)
    ?.cache_creation
  if ((c?.ephemeral_1h_input_tokens ?? 0) > 0) return '1h'
  if ((c?.ephemeral_5m_input_tokens ?? 0) > 0) return '5m'
  return undefined
}

/** Most of the prompt came from the cache: it was still warm. */
export function mostlyCached(usage: unknown): boolean {
  const u = (usage ?? {}) as { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
  const read_ = u.cache_read_input_tokens ?? 0
  const all = read_ + (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return all > 0 && read_ / all > 0.5
}

/** Save mode on or off: Auto stays at medium or below until the limit resets. The hot band's button and
 *  /smarttokensaver save. Says what it did. */
async function toggleSave($: EngineInterface): Promise<string> {
  const saving = (await read($, saveUntil)) !== null
  const heat = await read($, hot)
  const until = heat?.resetsAt ? new Date(heat.resetsAt).getTime() : (await $.clock.now()) + 5 * 3600_000
  await update($, saveUntil, () => (saving ? null : until))
  return saving ? 'save mode off' : 'save mode on, Smart stays at medium or below until the limit resets'
}

/**
 * Whether the chat's prompt cache is cold: the countdown ran out (left 0), its end has passed, or it is not known
 * (expires 0: no reply seen since this copy loaded and nothing to restore). Unknown counts as cold, so a compaction then
 * goes to Haiku, which costs the same either way, instead of the chat's model rereading everything at full price.
 */
export function isCold(left: number | null | undefined, expires: number, now: number): boolean {
  if (left === 0) return true
  if (!(expires > 0)) return true
  return now >= expires
}

/**
 * The one answer to "is this chat's cache cold now", for compaction, the handoff check, a quick handoff and routing.
 * The countdown is read back first (a reload or a compaction before the first draw lost it), and a model the chat has
 * not run on since this copy loaded is cold even when another model's cache is warm (a switch before /compact).
 */
async function chatIsCold($: EngineInterface): Promise<boolean> {
  await restoreCache($).catch(() => undefined)
  const now = await $.clock.now().catch(() => Date.now())
  const key = keyOf(await $.session.model().catch(() => ''))
  if (key && Object.keys(warmUntil).length && !isWarm(key, now)) return true
  return isCold(await read($, cacheLeft), cacheExpires, now)
}

/** What Smart Token Saver last read of the window (see readWindow); null until the first read. */
let windowState: WindowState | null = null
/** autoCompactWindow in the user settings file as last read (undefined: not set there). */
let userFileWindow: number | undefined
/** New chats already get w: the user settings file holds it, and no per-model /autocompact value is in the way. */
function newChatsGet(w: number | null): boolean {
  return (userFileWindow ?? null) === w && (windowState?.modelValue === undefined || windowState.modelValue === w)
}
/** At a chat's start, where only the settings file sets the window (the hook is skipped, or plugins may not write the
 *  file): New chats takes the size the file holds, so the card shows what new chats really get. */
async function adoptFileDefault($: EngineInterface) {
  const s = windowState
  if (!s || !(settingsHookBlocked || settingsFileRefused) || s.source === 'env' || s.policyValue !== undefined) return
  const f = userFileWindow ?? null
  if (f === config.compactWindow || (f !== null && s.modelWindow > 0 && f > s.modelWindow)) return
  await saveSetting($, 'compactWindow', f === null ? 'default' : String(f))
}
/** This chat only: Your default was picked in this load. Until then the list shows the size this chat runs on. */
let chatDefaultPicked = false
/** The window this chat runs on, as a choice: null where it is the model's full window (Claude Code's default). */
function chatWindowChoice(): number | null | undefined {
  if (!windowState) return undefined
  return windowState.modelWindow > 0 && windowState.raw >= windowState.modelWindow ? null : windowState.raw
}
/** The trigger Claude Code was seen to run past without compacting (see learnTrigger), and the read it belongs to. */
let learnedTrigger: number | null = null
let learnedFor = ''
/** The first context count this copy saw in this chat: what a resumed chat loaded with. */
let loadTokens: number | null = null
/**
 * The settings.read hook was seen not to take (a read showed 'blocked'): kept in the store, since it holds for the
 * whole organization, so a new chat changes the window through /autocompact from the start.
 */
let settingsHookBlocked = false
/** The thresholds for this chat now, from the last window read; before the first read, the window asked for. */
function limits(): Thresholds {
  return effectiveThresholds(chatOverride, withLearned(windowState, learnedTrigger), lastContext?.window, config.compactWindow, settingsHookBlocked)
}

// ---- More room for this chat only (R10) -----------------------------------------------------------------------------
// The default window (compactWindow) stays as it is. One chat can take a bigger one: kept in the session's state, not
// the store or the plugin settings, so a new chat starts on the default again. The settings.read hook hands Claude Code
// this chat's value instead of the default. Where the hook does not take, the value goes through Claude Code's own
// /autocompact instead, typed into the prompt box for the person to send: that one holds for every chat on the model,
// and the plugin says so.
/** The sizes offered, where they are above the default and within the model's window. */
export const CHAT_WINDOW_STEPS = [400_000, 500_000, 700_000, 1_000_000] as const
/** The sizes This chat only offers in its list: every size from the New chats list and the bigger steps, within the
 *  model's window. The default itself is the list's first entry, "Your default". */
export function chatWindowChoices(standard: number | null, max: number | undefined): number[] {
  const all = [...new Set([150_000, 200_000, ...WINDOW_CHOICES.filter((w): w is number => w !== null), ...CHAT_WINDOW_STEPS])].sort((a, b) => a - b)
  return all.filter(w => w !== standard && (!max || !(max > 0) || w <= max))
}
/** This chat's own window, and the chat it belongs to (a value from another chat is ignored). */
const chatWindow = atom({ plugin: 'smarttokensaver', key: 'chatWindow' } as const, null)
/** The sizes whose /autocompact line the plugin handed over in this chat (Paste into chat, Copy). Only a per-model
 *  value that matches one of them is the plugin's to take out of the settings file again: the same size set by the
 *  person on their own, in this chat or another, stays theirs. Kept with the chat, so a reload does not lose it. */
const autocompactHanded = atom({ plugin: 'smarttokensaver', key: 'autocompactHanded' } as const, null)
async function noteAutocompactHanded($: EngineInterface, w: number | null) {
  if (w === null) return
  // The file already holds this size for the model: the person set it before any line of the plugin's, so it is theirs.
  if (windowState?.modelValue === w && !(await autocompactHandedHere($, w))) return
  const sid = await $.session.id().catch(() => '')
  await update($, autocompactHanded, v => {
    const sizes = v && v.session === sid ? v.sizes : []
    return { session: sid, sizes: sizes.includes(w) ? sizes : [...sizes, w].slice(-8) }
  }).catch(() => undefined)
}
async function autocompactHandedHere($: EngineInterface, w: number): Promise<boolean> {
  const v = await read($, autocompactHanded).catch(() => null)
  if (!v || !Array.isArray(v.sizes)) return false
  return v.session === (await $.session.id().catch(() => '')) && v.sizes.includes(w)
}
/** The override as last read for this chat; null for the default. */
let chatOverride: number | null = null
/** A turn ended (and the window was read again) since this chat's window was last asked for: a mismatch now means
 *  Claude Code did not take it, not that it has not got round to it yet. */
let chatWindowChecked = false
/** The steps above the default and no bigger than the model's window. None when the default is Claude Code's own. */
export function chatWindowSteps(standard: number | null, max: number | undefined): number[] {
  if (standard === null || !max || !(max > 0)) return []
  return CHAT_WINDOW_STEPS.filter(w => w > standard && w <= max)
}
/** The window this chat should run on: its own when set (bigger or smaller than the default), else the default. */
export const effectiveWindow = (standard: number | null, override: number | null) => override ?? standard
/**
 * The thresholds for this chat. With an override, they follow it until a window read shows Claude Code runs on
 * something else (the hook did not take): then they follow what Claude Code really does. Before the first read they
 * follow the window asked for (`wanted`, the default), when there is one, not the model's whole window.
 */
export function effectiveThresholds(override: number | null, s: Pick2<WindowState, 'raw' | 'trigger' | 'modelWindow' | 'autoCompact'> | null, contextWindow?: number, wanted?: number | null, blocked = false): Thresholds {
  const modelWindow = s?.modelWindow ?? contextWindow
  // Once read, what Claude Code really runs on wins: the measured window and trigger, whatever was asked for.
  if (s) return thresholds({ window: s.raw, trigger: s.trigger, modelWindow, autoCompact: s.autoCompact })
  // Before the first read: this chat's own window when it fits the model, else the default asked for. Where the hook is
  // known not to take (`blocked`), neither is assumed: the model's window until a read says more.
  const fits = override !== null && !(modelWindow && override > modelWindow) ? override : null
  if (!blocked && fits !== null) return thresholds({ window: fits, modelWindow })
  if (!blocked && typeof wanted === 'number' && wanted > 0) return thresholds({ window: modelWindow ? Math.min(wanted, modelWindow) : wanted, modelWindow })
  return thresholds({ window: contextWindow ?? 0, modelWindow })
}
/** Where this chat's own window stands: none, in use (a read confirms it), asked (no read since), or not applied
 *  (a read after a turn shows another window). */
export type ChatWindowState = 'none' | 'active' | 'asked' | 'not-applied'
export function chatWindowState(override: number | null, s: Pick2<WindowState, 'raw' | 'modelWindow'> | null, checked: boolean): ChatWindowState {
  if (override === null) return 'none'
  // In use only when Claude Code runs on exactly this size: on a smaller model the model's own window is not it.
  if (s && s.raw === override) return 'active'
  return checked && s ? 'not-applied' : 'asked'
}
/** This chat's override from the session state, checked against the session id, the sizes and the default. */
async function chatWindowFor($: EngineInterface): Promise<number | null> {
  const v = await read($, chatWindow).catch(() => null)
  if (!v || typeof v.window !== 'number' || !(v.window >= WINDOW_MIN && v.window <= WINDOW_MAX)) return null
  const sid = await $.session.id().catch(() => '')
  if (v.session !== sid) return null
  return effectiveWindow(config.compactWindow, v.window) === v.window ? v.window : null
}
async function loadChatWindow($: EngineInterface) {
  chatOverride = await chatWindowFor($)
}
/** What a change through /autocompact means, said each time it is offered. */
export const AUTOCOMPACT_NOTE = "Claude Code won't let plugins change this directly here. Press Enter to set it with /autocompact. It applies to every chat on this model until you set it back."
/** The /autocompact line for a window: Claude Code takes a plain token count, or `auto` for the model's own. */
export const autocompactLine = (w: number | null) => `/autocompact ${w === null ? 'auto' : Math.round(w)}`
/**
 * Puts `/autocompact <tokens>` into the prompt box for the person to send with Enter, and says what it does. A draft of
 * the person's own is never overwritten: then, or where no box takes it, the line goes to the clipboard instead.
 */
async function offerAutocompact($: EngineInterface, w: number | null, surface?: string): Promise<string> {
  const text = autocompactLine(w)
  let filled = false
  try {
    // Only into an empty box, or over the line this plugin typed itself. Anything else the person wrote stays, even
    // another /autocompact. An empty box is filled by appending: a key typed meanwhile is kept, not replaced.
    const draft = (await $.prompt.read()).text
    const ours = lastTyped !== '' && draft.trim() === lastTyped
    if (draft.trim() === '' || ours) {
      const r = await $.prompt.fill(ours ? { text } : { text, mode: 'append' })
      // The box after the fill: only our line, or unreadable (''). Text of the person's beside it: say so, and copy.
      const after = typeof r.text === 'string' ? r.text.trim() : ''
      filled = r.isFilled && (after === '' || after === text)
      if (r.isFilled) { lastTyped = text; await noteAutocompactHanded($, w) }
    }
  } catch {
    filled = false
  }
  if (filled) return AUTOCOMPACT_NOTE
  return copyAutocompact($, w, surface)
}
/** What a pick that must go through /autocompact says: nothing is typed for the person, they send it themselves. */
export const sendHint = (w: number | null) => `To apply it, send ${autocompactLine(w)} under This chat only: Paste into chat or Copy, then press Enter. It holds for every chat on this model.`
/** Copies `/autocompact <tokens>` and says so: the second way next to Paste into chat. */
async function copyAutocompact($: EngineInterface, w: number | null, surface?: string): Promise<string> {
  const text = autocompactLine(w)
  const copied = await $.ui.copy({ text, ...(surface ? { surface: surface as never } : {}) }).then(r => r.isCopied, () => false)
  // Copied or not, the person was told to send this line: the value it leaves is the plugin's doing.
  await noteAutocompactHanded($, w)
  return `${copied ? `${text} is copied. Paste it into the prompt and press Enter.` : `Type ${text} into the prompt and press Enter.`} It applies to every chat on this model until you set it back.`
}
// ---- The default window in the person's own settings file ------------------------------------------------------------
// Where the hook does not take, New chats writes autoCompactWindow into the user settings file (~/.claude/settings.json)
// itself: Claude Code's own way to set a default, for every model and every new chat. The file's other keys stay as they
// are, and the text before the change is kept beside it (settings.json.smarttokensaver.bak). A per-model value
// (modelSettings.<model>.autoCompactWindow, which /autocompact writes) would win over it, so those go. /autocompact then
// only serves this chat: Claude Code pins the size in the chat it is sent from, and the plugin takes the per-model value
// it leaves out of the file again, so new chats stay on the default.
/** The settings with the default window set (null: the key goes, Claude Code's own) and the per-model values dropped:
 *  all of them (`models` true) or one model's. Pure: what goes to the file. */
/** A model id without a bracketed suffix ("[1m]"): the one spelling difference under which two ids are the same model. */
const bareModelId = (id: string) => id.replace(/\[[^\]]*\]$/, '')
export function withUserWindow(json: Record<string, unknown>, w: number | null | undefined, models: true | string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...json }
  if (w === null) delete out.autoCompactWindow
  else if (typeof w === 'number') out.autoCompactWindow = Math.round(w)
  const ms = out.modelSettings
  if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
    const kept: Record<string, unknown> = {}
    for (const [id, v] of Object.entries(ms as Record<string, unknown>)) {
      const hit = models === true || models.some(m => m === id || bareModelId(m) === bareModelId(id))
      if (hit && v && typeof v === 'object' && !Array.isArray(v) && 'autoCompactWindow' in v) {
        const { autoCompactWindow: _drop, ...rest } = v as Record<string, unknown>
        if (Object.keys(rest).length) kept[id] = rest
      } else kept[id] = v
    }
    if (Object.keys(kept).length) out.modelSettings = kept
    else delete out.modelSettings
  }
  return out
}
let askConfigDir: EnvAsk
const envConfigDir = ($: EngineInterface) => (askConfigDir = askConfigDir ?? $.env.get('CLAUDE_CONFIG_DIR'))
/** Where Claude Code keeps the user settings: CLAUDE_CONFIG_DIR, else ~/.claude. */
async function userSettingsPath($: EngineInterface): Promise<string | undefined> {
  const dir = await envConfigDir($).catch(() => undefined)
  if (dir) return `${dir.replace(/\/$/, '')}/settings.json`
  const home = (await envHome($).catch(() => undefined)) || (await envUserProfile($).catch(() => undefined))
  return home ? `${home}/.claude/settings.json` : undefined
}
/** The user settings file in words, for the toasts. */
export const USER_SETTINGS_SHOWN = '~/.claude/settings.json'
/** How many earlier copies of the settings file are kept beside it (.bak, .bak.1, .bak.2). */
const SETTINGS_BACKUPS = 3
/** Keeps the settings file's text from before a change beside it: `.smarttokensaver.bak` is the newest copy, `.bak.1`
 *  and `.bak.2` the ones before it, so a second change does not wipe the only copy of the file as the person had it.
 *  A copy equal to the newest one is not written again. The writes of `.bak` and `.bak.1` must succeed; `.bak.2` may fail. */
async function backUpSettings($: EngineInterface, path: string, text: string) {
  const bak = `${path}.smarttokensaver.bak`
  const newest = await $.fs.read(bak).catch(() => '')
  if (newest === text) return
  if (newest) {
    for (let i = SETTINGS_BACKUPS - 1; i >= 1; i--) {
      const from = i === 1 ? newest : await $.fs.read(`${bak}.${i - 1}`).catch(() => '')
      // The newest copy must reach .bak.1 before .bak is written over, or that state of the file would be gone.
      if (from && i === 1) await $.fs.write(`${bak}.${i}`, from)
      else if (from) await $.fs.write(`${bak}.${i}`, from).catch(() => undefined)
    }
  }
  await $.fs.write(bak, text)
}
/** Changes the user settings file through `change`; the text before goes beside it first. A file that is not JSON is
 *  left alone. Resolves with null on success, else why not. */
async function changeUserSettings($: EngineInterface, change: (json: Record<string, unknown>) => Record<string, unknown>): Promise<string | null> {
  if (settingsFileRefused) return 'refused'
  const path = await userSettingsPath($)
  if (!path) return 'no home folder found'
  let text = ''
  try {
    text = await $.fs.read(path)
  } catch {
    // Missing is fine (a new file); a file that is there but unreadable is not touched.
    // Only a file that is known to be missing counts as missing: any other failure leaves it alone.
    const there = await $.fs.stat(path).then(() => true, (e: unknown) => !/ENOENT|no such file|not found|does not exist/i.test(String((e as Error)?.message ?? e)))
    if (there) return `${USER_SETTINGS_SHOWN} could not be read`
  }
  let json: Record<string, unknown> = {}
  if (text.trim()) {
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return `${USER_SETTINGS_SHOWN} is not a JSON object`
      json = parsed as Record<string, unknown>
    } catch {
      return `${USER_SETTINGS_SHOWN} is not valid JSON`
    }
  }
  const next = change(json)
  if (JSON.stringify(next) === JSON.stringify(json)) return null
  // Another chat, or Claude Code itself, may have saved the file since it was read: writing this copy would undo
  // that change, so nothing is written and the person tries again.
  const nowText = await $.fs.read(path).catch(() => '')
  if (nowText !== text) return `${USER_SETTINGS_SHOWN} changed while saving, try again`
  let backedUp = false
  try {
    if (text) {
      try {
        await backUpSettings($, path, text)
      } catch (e) {
        if (isSettingsRefusal(e)) throw e
        return `${USER_SETTINGS_SHOWN} could not be backed up`
      }
      backedUp = true
      // Once more, right before the write: the backup took a moment, and the file may have been saved in it.
      if ((await $.fs.read(path).catch(() => '')) !== text) return `${USER_SETTINGS_SHOWN} changed while saving, try again`
    }
    await $.fs.write(path, `${JSON.stringify(next, null, 2)}\n`)
  } catch (e) {
    // The file beside it took the backup, the settings file itself did not: Claude Code keeps it from plugins (the
    // security default of Team and Enterprise organizations), whatever words the refusal comes in.
    // Kept with its time, not for good: a full disk or a locked file fails the same way, and a policy can change, so
    // the file is tried again after SETTINGS_REFUSED_MS.
    if (backedUp || isSettingsRefusal(e)) {
      settingsFileRefused = true
      await $.store.set('settingsFileRefused', Date.now()).catch(() => undefined)
      void proof($, `user settings: write refused (${String((e as Error)?.message ?? e)})`)
      return 'refused'
    }
    return `${USER_SETTINGS_SHOWN} could not be written`
  }
  void proof($, `user settings: autoCompactWindow ${String(next.autoCompactWindow ?? 'unset')}`)
  return null
}
/** Whether New chats goes through the settings file: the hook is not known to take, or a per-model value wins. */
function windowViaFile(): boolean {
  if (settingsFileRefused) return false
  const s = windowState
  if (s && (s.source === 'env' || s.policyValue !== undefined)) return false
  return settingsHookBlocked || s?.modelValue !== undefined || windowViaCommand()
}
/** Sets the default for new chats in the settings file and says what changed; the toast's words. */
async function saveDefaultToFile($: EngineInterface, w: number | null): Promise<{ ok: boolean; text: string }> {
  const why = await changeUserSettings($, json => withUserWindow(json, w, true))
  if (why === 'refused') return { ok: false, text: REFUSED_HINT(w) }
  if (why) return { ok: false, text: `Couldn't save it: ${why}. ${sendHint(w)}` }
  await readWindow($).catch(() => undefined)
  const words = w === null ? "New chats use Claude Code's own window" : `New chats use ${windowLabel(w)}`
  const here = commandPending(w, windowState) ? ` This chat still runs on ${windowState ? windowLabel(windowState.raw) : 'its old size'}: send the /autocompact under This chat only to switch it too.` : ''
  return { ok: true, text: `${words}, saved in ${USER_SETTINGS_SHOWN}.${here}` }
}
/**
 * A new default window, applied the way this install takes it: through the hook; into the settings file where the hook
 * does not take; as a line the person sends where the file is closed to plugins too. `save` stores the plugin's own
 * setting. Resolves with what to say, or undefined where the hook takes it and there is nothing to add. Settings → New
 * chats and /smarttokensaver window both go through here.
 */
async function applyDefaultWindow($: EngineInterface, w: number | null, save: () => Promise<void>): Promise<string | undefined> {
  // Before the save: a read already showing the hook not taking (the save restarts that count).
  const blockedBefore = windowViaCommand()
  // Where both rows go through the same per-model /autocompact, a new default replaces this chat's own size: one
  // command, not two that undo each other.
  const dropped = chatOverride !== null && !windowViaFile() && (blockedBefore || settingsHookBlocked || windowState?.modelValue !== undefined)
  if (dropped) {
    await update($, chatWindow, () => null)
    chatOverride = null
    const model = windowState?.model ?? ''
    if (model) await rememberRaised($, model, null)
  }
  const viaFile = !settingsFileRefused && (blockedBefore || windowViaFile())
  await save()
  // Where the hook does not take: the default goes into the settings file, for every new chat. This chat follows at
  // once unless Claude Code pinned another size here; then This chat only offers the /autocompact for it.
  if (viaFile) {
    const saved = await saveDefaultToFile($, w)
    defaultFileFailed = !saved.ok
    $.ui.invalidate('ui.render')
    return saved.text
  }
  if (!commandPending(w, windowState)) {
    await clearOurLine($)
    return undefined
  }
  if (settingsFileRefused || blockedBefore || needsAutocompact(w, windowState, settingsHookBlocked)) {
    await noteAutocompactHanded($, w)
    return `${dropped ? "This chat's own size is dropped: here both go through the same /autocompact. " : ''}${settingsFileRefused ? REFUSED_HINT(w) : `Saved as your default. ${sendHint(w)}`}`
  }
  return undefined
}
/** After /autocompact took in this chat: its per-model value goes from the file again, so it stays this chat's (Claude
 *  Code pinned it here) and new chats keep the default. Once per value; where the chat then falls back (no pin), it
 *  is not tried again in this load. */
/** The last New chats change could not go into the settings file: the card falls back to /autocompact. */
let defaultFileFailed = false
/** Claude Code refused the plugin a write to its settings file (the security default of Team and Enterprise
 *  organizations): kept in the store, the settings file is not tried again, /autocompact is the way. */
let settingsFileRefused = false
const SETTINGS_REFUSED_MS = 7 * 86_400_000
/** The size the setup's window step applied (Apply), where the plugin cannot set it itself; undefined before. */
let setupApplied: number | null | undefined
/** The size whose request the setup sent to a new chat (Paste into new chat) or copied; undefined before. */
let setupNewChatSent: number | null | undefined
/** The size whose /autocompact the setup put into this chat's prompt box or copied (step 2b); undefined before. */
let setupChatSent: number | null | undefined
/** What the refusal looks like: sec-default's own words. */
export const isSettingsRefusal = (e: unknown) => /not for plugins|outside policy|refused/i.test(String((e as Error)?.message ?? e))
let modelCleanup: { value: number; outcome: 'tried' | 'no-pin' } | null = null
async function cleanModelValue($: EngineInterface, s: WindowState) {
  const v = s.modelValue
  if (v === undefined || s.raw !== Math.min(v, s.modelWindow || v)) return
  if (v !== chatOverride && v !== config.compactWindow) return
  // Only a value this chat got through a line the plugin handed over. A per-model size the person set on their own
  // stays in their file, also where it happens to be the plugin's default.
  if (!(await autocompactHandedHere($, v))) return
  if (modelCleanup && modelCleanup.value === v) return
  modelCleanup = { value: v, outcome: 'tried' }
  const why = await changeUserSettings($, json => withUserWindow(json, undefined, [s.model]))
  if (why) {
    // Not done: the next read tries again.
    modelCleanup = null
    void proof($, `per-model window kept: ${why}`)
    return
  }
  const after = await readWindow($).catch(() => null)
  if (after && after.raw !== s.raw) {
    // No pin in this Claude Code: the per-model value goes back, so this chat keeps its size, and the next chat offers
    // to set it back as before.
    modelCleanup = { value: v, outcome: 'no-pin' }
    void proof($, `per-model window removed, but the chat fell back to ${after.raw}: no pin, put back`)
    await changeUserSettings($, json => {
      const ms = (json.modelSettings && typeof json.modelSettings === 'object' ? json.modelSettings : {}) as Record<string, Record<string, unknown>>
      // Not over a value somebody set in the meantime.
      if (ms[s.model]?.autoCompactWindow !== undefined) return json
      return { ...json, modelSettings: { ...ms, [s.model]: { ...(ms[s.model] ?? {}), autoCompactWindow: v } } }
    })
    const sid = await $.session.id().catch(() => '')
    if (s.model && v !== config.compactWindow) await rememberRaised($, s.model, { window: v, standard: config.compactWindow, session: sid, model: s.model })
    await readWindow($).catch(() => undefined)
  } else if (s.model) await rememberRaised($, s.model, null)
}
/** The Context card's one-line note at its top, by how the window gets set here. Settings file written by the plugin: */
export const FILE_MODE_NOTE = `New chats is saved in ${'~/.claude/settings.json'}. This chat only goes through /autocompact, which you send.`
/** Only /autocompact (the file not tried yet): */
export const COMMAND_MODE_NOTE = 'Plugins can set the window here only through /autocompact: pick a size, then send the command yourself.'
/** Claude Code refused the plugin the settings file (sec-default): both sizes are applied by the person. */
export const REFUSED_HINT = (w: number | null) => `Saved as your default. Claude Code doesn't let plugins write ${'~/.claude/settings.json'} here: Paste into new chat applies ${windowLabel(w)} to new chats, the /autocompact under This chat only to this chat.`
export const REFUSED_NOTE = `Claude Code doesn't let plugins write ${'~/.claude/settings.json'} here, so you apply the size yourself.`

/** What a new chat is asked to do where plugins may not write the settings file: the person sends it and allows the
 *  edit there, in a chat of its own, so this one stays as it is. */
export const settingsChatPrompt = (w: number | null, file = '~/.claude/settings.json') => w === null
  ? `Please remove "autoCompactWindow" from ${file}, at the top level and under every "modelSettings" entry, and keep everything else as it is. Smart Token Saver asked for this: Claude Code doesn't let plugins write that file here.`
  : `Please set "autoCompactWindow": ${w} at the top level of ${file}, remove "autoCompactWindow" under every "modelSettings" entry, and keep everything else as it is. Smart Token Saver asked for this: Claude Code doesn't let plugins write that file here. New chats then compact at ${windowLabel(w)}.`
/** The desktop app's link for a new Code chat with its prompt filled in (in a folder, if one is given). */
export const settingsChatLink = (prompt: string, folder?: string) => `claude://code/new?q=${encodeURIComponent(prompt)}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`
/** The settings file as the request for a new chat names it: its full path where CLAUDE_CONFIG_DIR moves it. */
async function settingsFileNamed($: EngineInterface): Promise<string | undefined> {
  const moved = await envConfigDir($).catch(() => undefined)
  return moved ? await userSettingsPath($) : undefined
}
/** Copies the request for a new chat (the same words Paste into new chat sends there). */
export async function copySettingsPrompt($: EngineInterface, w: number | null): Promise<string> {
  const prompt = settingsChatPrompt(w, await settingsFileNamed($))
  const copied = await $.ui.copy({ text: prompt }).then(r => r.isCopied, () => false)
  return copied
    ? `The request is copied. Open a new chat, paste it, send it and allow the edit: new chats then use ${windowLabel(w)}.`
    : `Ask a new chat: ${prompt}`
}
/** Opens that new chat (the desktop app on macOS), else copies the prompt. Says what happened, for a toast. */
export async function openSettingsChat($: EngineInterface, w: number | null, surface: string): Promise<string> {
  const prompt = settingsChatPrompt(w, await settingsFileNamed($))
  const platform = await $.session.info().then(s => s.platform).catch(() => 'unknown')
  if (surface === 'desktop' && platform === 'macos') {
    // No folder in the link: a link with one counts as external, so the app asks to trust that folder each time. The
    // request names the file by its full path, so the folder the new chat opens in does not matter.
    const opened = await $.process.run(['open', settingsChatLink(prompt)], { timeoutMs: 10_000 }).then(r => r.exitCode === 0, () => false)
    if (opened) return `A new chat opens with the request. Send it there and allow the edit: new chats then use ${windowLabel(w)}.`
  }
  const copied = await $.ui.copy({ text: prompt }).then(r => r.isCopied, () => false)
  return copied
    ? `The request is copied. Paste it into a new chat, send it and allow the edit: new chats then use ${windowLabel(w)}.`
    : `Ask a new chat: ${prompt}`
}
/**
 * Whether a window `w` has to go through /autocompact here: the hook was seen not to take, or a per-model value (which
 * /autocompact wrote) wins over anything the hook hands over. False where `w` is in force already, or before any read.
 */
export function needsAutocompact(w: number | null, s: Pick2<WindowState, 'raw' | 'modelWindow' | 'modelValue' | 'source' | 'policyValue'> | null, hookBlocked: boolean): boolean {
  if (!s || s.source === 'env' || s.policyValue !== undefined) return false
  if (w === null) return s.modelValue !== undefined
  const expected = Math.min(w, s.modelWindow || w)
  if (s.raw === expected) return false
  return hookBlocked || s.modelValue !== undefined
}
/**
 * Whether a window `w` is still not what Claude Code runs on here, so the card keeps its command row (Paste into chat,
 * Copy): the size differs from the read, or for Claude Code's own (`w` null) a per-model value is still set. False
 * before any read, and where an environment variable or a policy wins (no command could change it).
 */
export function commandPending(w: number | null, s: Pick2<WindowState, 'raw' | 'modelWindow' | 'modelValue' | 'source' | 'policyValue'> | null): boolean {
  if (!s || s.source === 'env' || s.policyValue !== undefined) return false
  if (w === null) return s.modelValue !== undefined
  return s.raw !== Math.min(w, s.modelWindow || w)
}
/** Takes the plugin's own /autocompact line out of the prompt box again (a choice went back to the size in force):
 *  sent by mistake it would change every chat on the model. Text of the person's own stays. */
async function clearOurLine($: EngineInterface) {
  try {
    const draft = (await $.prompt.read()).text.trim()
    if (!lastTyped || draft !== lastTyped || !draft.startsWith('/autocompact')) return
    await $.prompt.fill({ text: '' })
    lastTyped = ''
  } catch {
    // Nothing to do: the box stays as it is.
  }
}
/** What the command row says where the plugin does not know yet whether Claude Code takes its value. */
export const COMMAND_MAYBE_NOTE = "If the size doesn't show as in use after your next message, send the /autocompact below yourself."
/** A bigger window set for one chat through /autocompact, which holds for the whole model: kept in the store, so another
 *  chat (a new one, or the one after a handoff's clear) can offer to set it back. */
export type RaisedWindow = { window: number; standard: number | null; session: string; model: string; confirmed?: boolean }
/** Raised windows by model: /autocompact is per model, so one model's record never overwrites another's. */
export type RaisedWindows = Record<string, RaisedWindow>
/** Keeps (or with null drops) the record for one model; the store holds them all. */
async function rememberRaised($: EngineInterface, model: string, raised: RaisedWindow | null) {
  const all = { ...asRaised(await $.store.get('raisedWindows').catch(() => raisedKept)) }
  if (raised) all[model] = raised
  else delete all[model]
  raisedKept = all
  const ok = await $.store.set('raisedWindows', Object.keys(all).length ? all : null).then(() => true, () => false)
  if (!ok) void proof($, 'raised window: store write failed')
}
/**
 * The raised windows after the default (New chats) changed: each record's way back is the new default, and a record
 * the new default already covers is no raise any more and goes. Without this a new chat offered to set the window
 * "back" to the old default, and New chats seemed to fall back to it.
 */
export function retargetRaised(raised: unknown, standard: number | null): RaisedWindows {
  const out: RaisedWindows = {}
  for (const [model, r] of Object.entries(asRaised(raised))) {
    if (!r || typeof r.window !== 'number') continue
    if (r.window === standard) continue
    out[model] = { ...r, standard }
  }
  return out
}
const asRaised = (v: unknown): RaisedWindows => (v && typeof v === 'object' && !Array.isArray(v) ? (v as RaisedWindows) : {})
/** The raised windows as the store keeps them, read per load and kept current here; and this chat's session id. */
let raisedKept: unknown = null
let loadedSid = ''
/** The raised window to offer setting back in this chat: from another chat, for the model in use, and still the one
 *  Claude Code uses for it. */
export function raisedToOffer(raised: unknown, sid: string, s: Pick2<WindowState, 'modelValue'> & { model?: string } | null): RaisedWindow | null {
  if (!s) return null
  const all = asRaised(raised)
  const r = (s.model !== undefined ? all[s.model] : undefined) ?? (raised && typeof (raised as RaisedWindow).window === 'number' ? (raised as RaisedWindow) : undefined)
  if (!r || typeof r.window !== 'number' || r.session === sid) return null
  if (s.model !== undefined && r.model && r.model !== s.model) return null
  return s.modelValue === r.window ? r : null
}
/**
 * After a window read: a record whose value a read showed in force is confirmed; a confirmed record whose value is no
 * longer in force (set back, or changed) is dropped. One never confirmed stays (Enter not pressed yet) and is never
 * offered, since the offer needs the value in force. Returns the records to keep, or null when nothing changed.
 */
export function settleRaised(raised: unknown, s: Pick2<WindowState, 'modelValue' | 'model'>): RaisedWindows | null {
  const all = asRaised(raised)
  const r = all[s.model]
  if (!r) return null
  if (s.modelValue === r.window) return r.confirmed ? null : { ...all, [s.model]: { ...r, confirmed: true } }
  if (!r.confirmed) return null
  const { [s.model]: _gone, ...rest } = all
  return rest
}
/** /clear (a handoff's too) starts a new session id in the same process, without session.start: seen here, it is a new
 *  chat for everything kept per chat. Called on every draw of the band and every prompt. */
async function syncSession($: EngineInterface) {
  const sid = String(await $.session.id().catch(() => ''))
  if (!sid) return
  if (!loadedSid) {
    loadedSid = sid
    return
  }
  if (sid === loadedSid) return
  loadedSid = sid
  raisedHandled = false
  chatWindowChecked = false
  // What was measured on the chat before is not this chat's: its cache countdown, the models it had warm, its size
  // and what was learned from it. A fresh chat would else start on a warm countdown it has no cache for, or pay for a
  // handoff check by the old chat's size.
  cacheExpires = 0
  lastResponseAt = undefined
  coldForced = false
  for (const key of Object.keys(warmUntil) as ModelKey[]) delete warmUntil[key]
  lastContext = null
  learnedTrigger = null
  learnedFor = ''
  loadTokens = null
  staleTokens = null
  promptsSinceHandoffCheck = 0
  precomputedAt = null
  chatDefaultPicked = false
  // The chat before had its own routed model, held pick and clean-up of a per-model window.
  routed = null
  stayUp = 0
  heldPick = null
  modelCleanup = null
  await rememberCache($).catch(() => undefined)
  if ((await read($, handoffAdvice).catch(() => null)) !== null) await update($, handoffAdvice, () => null).catch(() => undefined)
  await showCache($).catch(() => undefined)
  await checkSwamp($).catch(() => undefined)
  const had = chatOverride
  chatOverride = await chatWindowFor($).catch(() => null)
  if (had !== chatOverride) wantedChanged()
  raisedKept = await $.store.get('raisedWindows').catch(() => raisedKept)
  void readWindow($).catch(() => undefined)
  $.ui.invalidate('ui.render')
}
/** Turns completed since the window asked for last changed (or since this load). A read that shows the hook not taking
 *  counts as proof only after one: a working hook may need the next request to apply a new value. */
let turnsSinceWanted = 0
let wantedChangedInLoad = false
/** The window Claude Code ran on when the value asked for last changed: a read that still shows it proves no hook. */
let rawAtWantedChange: number | undefined
function wantedChanged() {
  turnsSinceWanted = 0
  wantedChangedInLoad = true
  rawAtWantedChange = windowState?.raw
}
/** This chat's question about a raised window was answered or closed. */
let raisedHandled = false
/** Whether a change of window must go through /autocompact here (see windowNeedsCommand). */
function windowViaCommand(): boolean {
  const s = windowState
  // An environment variable or a policy wins over /autocompact too: no command to offer.
  if (s && (s.source === 'env' || s.policyValue !== undefined)) return false
  const status = s ? windowStatus(effectiveWindow(config.compactWindow, chatOverride), s) : null
  // Right after this chat asked for another size, a read that still shows the old one proves nothing yet: the hook may
  // need the next request. It counts once a turn has passed, or for a value not changed in this load.
  if (status === 'blocked' && wantedChangedInLoad && turnsSinceWanted === 0 && !settingsHookBlocked && !blockedSeenInLoad) return false
  const via = windowNeedsCommand(status, settingsHookBlocked)
  if (via && status === 'blocked') blockedSeenInLoad = true
  return via
}
/** The hook was already seen not to take in this load (on a value it had time to apply): later asks go the same way. */
let blockedSeenInLoad = false
/** Sets or clears this chat's window and says what happened, in one line. Never says it is in use before a window read
 *  shows it. Where the hook cannot act, the value goes through /autocompact (for the whole model, as it says). */
async function setChatWindow($: EngineInterface, w: number | null, surface?: string): Promise<string> {
  const sid = await $.session.id().catch(() => '')
  // Where even the default for new chats is not in force through the hook (the card says "Not applied"), this chat's
  // size cannot go that way either: /autocompact at once, not a wait for a confirmation that never comes.
  const defaultStatus = windowState ? windowStatus(config.compactWindow, windowState) : null
  const viaCommand = windowViaCommand() || needsAutocompact(w ?? config.compactWindow, windowState, settingsHookBlocked) || (w !== null && (chatOverride === null || chatWindowState(chatOverride, windowState, false) !== 'active') && config.compactWindow !== null && windowNeedsCommand(defaultStatus, settingsHookBlocked))
  await update($, chatWindow, () => (w === null ? null : { session: sid, window: w }))
  chatOverride = w
  chatWindowChecked = false
  wantedChanged()
  $.ui.invalidate('ui.render')
  if (viaCommand) {
    // The record goes only once a read shows the default back in force (settleRaised), not at the click: Enter may
    // never be pressed.
    const model = windowState?.model ?? ''
    if (w !== null) await rememberRaised($, model, { window: w, standard: config.compactWindow, session: sid, model })
    void surface
    await noteAutocompactHanded($, w ?? config.compactWindow)
    return sendHint(w ?? config.compactWindow)
  }
  const s = await readWindow($).catch(() => windowState)
  const state = chatWindowState(w, s, false)
  if (w === null) return `This chat is back on your default: ${windowLabel(config.compactWindow)}.`
  return state === 'active'
    ? `This chat's window is ${windowLabel(w)} (it compacts at about ${windowLabel(w - COMPACT_BUFFER)}). New chats use your default, ${windowLabel(config.compactWindow)}.`
    : `Asked for ${windowLabel(w)} for this chat. It shows as in use once Claude Code confirms it.`
}
/** After a turn: read the window again while this chat's own is not confirmed, so "asked" turns into in use or not. */
async function checkChatWindow($: EngineInterface) {
  if (chatOverride === null || chatWindowState(chatOverride, windowState, false) === 'active') return
  await readWindow($).catch(() => undefined)
  if (!chatWindowChecked) {
    chatWindowChecked = true
    $.ui.invalidate('ui.render')
  }
}
/** The bar's and the card's words for this chat's window. */
export function chatWindowWords(override: number, state: ChatWindowState, s: Pick2<WindowState, 'raw' | 'modelValue'> | null): { bar: string; card: string } {
  const label = windowLabel(override)
  if (state === 'active')
    return { bar: `This chat: ${label}`, card: s?.modelValue === override ? `${label} in use, set with /autocompact for every chat on this model.` : `${label} in use for this chat.` }
  if (state === 'not-applied') return { bar: `${label} not applied`, card: `${label} not applied: Claude Code still uses ${s ? windowLabel(s.raw) : 'another window'}.` }
  return { bar: `${label} asked`, card: `${label} asked. It shows as in use once Claude Code confirms it.` }
}
/** Whether the bar offers More room: near compaction with a size to offer, or while this chat has its own window. */
function moreRoomShown(): boolean {
  if (chatOverride !== null) return true
  const tokens = lastContext?.tokens ?? 0
  const limit = limits()
  return tokens >= Math.min(limit.handoffFrom, limit.swampFrom(config.swampAt)) && chatWindowSteps(config.compactWindow, windowState?.modelWindow ?? lastContext?.window).length > 0
}
/** The bar's Context size button (it opens the card of that name). */
function moreRoomLabel(): string {
  // The window in force is beside the ring, read from Claude Code; the button only says where it leads. A label such as
  // "This chat: 400k" read as done where /autocompact was only put in the box, or where another value held already.
  return 'Context size'
}
/** Opens the settings on the Context size card, where This chat only lists the sizes. */
async function openContextCard($: EngineInterface) {
  await openPluginSettings($)
  await update($, settingsCard, () => 'context')
  $.ui.invalidate('ui.render')
}
/** The hover line of More room, and the guide's words for it. */
export const MORE_ROOM_TIP = 'A bigger window costs more per message. New chats start on your default again.'

/** How often the window is read again while a chat is open. */
const WINDOW_READ_MS = 60_000
/**
 * Reads the window this chat compacts against from the session's breakdown (rawMaxTokens, autocompactSource,
 * autoCompactThreshold), and the values that win over Smart Token Saver's own: a managed (policy) one and a per-model one
 * (modelSettings.<model>.autoCompactWindow, which /autocompact writes). Through $.settings.read only, never a file.
 * Called at session start, after /model, after a compaction, after the setting changed, and every WINDOW_READ_MS.
 */
let readGeneration = 0
async function readWindow($: EngineInterface): Promise<WindowState | null> {
  // A later read (after /autocompact, say) may finish first: an older one then never overwrites it.
  const generation = ++readGeneration
  const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const b = usage?.context.breakdown
  if (!usage || !b || !(b.rawMaxTokens > 0)) {
    // No breakdown: what was read for another model is not this one's window.
    const now = windowState ? await $.session.model().catch(() => windowState?.model ?? '') : ''
    if (windowState && now && now !== windowState.model) {
      windowState = null
      await update($, windowInfo, () => null)
      $.ui.invalidate('ui.render')
    }
    return windowState
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined)
  const policy = (await $.settings.read({ source: 'policy' }).catch(() => ({}))) as Record<string, unknown>
  const merged = (await $.settings.read().catch(() => ({}))) as Record<string, unknown>
  const userLayer = (await $.settings.read({ source: 'user' }).catch(() => ({}))) as Record<string, unknown>
  userFileWindow = num(userLayer.autoCompactWindow)
  const modelId = await $.session.model().catch(() => b.model ?? '')
  const perModel = (merged.modelSettings ?? {}) as Record<string, { autoCompactWindow?: unknown } | undefined>
  const modelValue = num(perModel[modelId]?.autoCompactWindow) ?? num(perModel[keyOf(modelId) ?? '']?.autoCompactWindow)
  const next: WindowState = {
    raw: b.rawMaxTokens,
    source: String(b.autocompactSource ?? 'unknown'),
    trigger: b.isAutoCompactEnabled ? (num(b.autoCompactThreshold) ?? Math.max(1, b.rawMaxTokens - COMPACT_BUFFER)) : null,
    autoCompact: b.isAutoCompactEnabled !== false,
    modelWindow: usage.context.window || b.rawMaxTokens,
    model: modelId,
    ...(modelValue !== undefined ? { modelValue } : {}),
    ...(num(policy.autoCompactWindow) !== undefined ? { policyValue: num(policy.autoCompactWindow) } : {}),
    at: await $.clock.now().catch(() => Date.now()),
  }
  if (generation !== readGeneration) return windowState
  const changed = JSON.stringify({ ...windowState, at: 0 }) !== JSON.stringify({ ...next, at: 0 })
  windowState = next
  // Another window or model read: what was learned of the old one no longer holds.
  if (learnedTrigger !== null && learnedFor !== `${next.model} ${next.raw}`) learnedTrigger = null
  await update($, windowInfo, () => next)
  // A read that shows the hook not taking holds for the organization: kept, so the next chat knows from the start. It
  // counts only after a turn since the value asked for last changed (a working hook may need the next request). One
  // that shows the plugin's own value in force clears it, but only where no settings file holds that same value (then
  // the file, not the hook, may be what took), and only once the value asked for changed in this load and the window
  // moved with it: a chat pinned by /autocompact runs on its size whatever the hook says, and at a chat's start the
  // plugin's default may still be the old one (the file's is taken over after this read).
  const wanted = effectiveWindow(config.compactWindow, chatOverride)
  const status = windowStatus(wanted, next)
  let blocked = settingsHookBlocked
  if (status === 'blocked' && turnsSinceWanted > 0) blocked = true
  else if (settingsHookBlocked && status === 'ok' && next.source === 'settings' && next.raw === wanted && wantedChangedInLoad && next.raw !== rawAtWantedChange) {
    const layers = await Promise.all((['user', 'project', 'local', 'policy'] as const).map(source => $.settings.read({ source }).then(v => v as Record<string, unknown>, () => null)))
    if (layers.every(l => l !== null && l.autoCompactWindow !== next.raw)) blocked = false
  }
  if (blocked !== settingsHookBlocked) {
    settingsHookBlocked = blocked
    await $.store.set('settingsHookBlocked', blocked).catch(() => undefined)
  }
  // A raised window (/autocompact) confirmed in force, or set back: the store's records follow.
  raisedKept = await $.store.get('raisedWindows').catch(() => raisedKept)
  const settled = settleRaised(raisedKept, next)
  if (settled) {
    raisedKept = settled
    await $.store.set('raisedWindows', Object.keys(settled).length ? settled : null).catch(() => undefined)
  }
  if (next.modelValue !== undefined && windowViaFile()) void cleanModelValue($, next).catch(() => undefined)
  if (changed) {
    void proof($, `window ${next.raw} (${next.source}), compaction at ${next.trigger ?? 'off'}, status ${status}`)
    // The ring and the swamp band follow the new trigger now, not at the next tick.
    void checkSwamp($).catch(() => undefined)
    $.ui.invalidate('ui.render')
  }
  return next
}

/** The enabled installs of effortless (this plugin or upstream's) in the settings' enabledPlugins, by id. Two of them
 *  both judge every prompt and both draw a band. `names` are the plugin names that count, this one's first. */
export function duplicateInstalls(enabled: unknown, names: readonly string[] = [PLUGIN, UPSTREAM_NAME]): string[] {
  if (!enabled || typeof enabled !== 'object') return []
  return Object.entries(enabled as Record<string, unknown>)
    .filter(([id, on]) => on === true && names.includes(id.split('@')[0] ?? ''))
    .map(([id]) => id)
    .sort()
}
/** Warns once per set of installs when more than one is on. */
async function warnDuplicate($: EngineInterface) {
  const own = (await ownInstallNow($))?.id.split('@')[0] ?? ($.plugin.name || PLUGIN)
  const ids = duplicateInstalls(await $.settings.read({ key: 'enabledPlugins' }).catch(() => undefined), [own, UPSTREAM_NAME])
  if (ids.length < 2) return
  const seen = ids.join(',')
  if ((await $.store.get('duplicateWarned').catch(() => null)) === seen) return
  await $.store.set('duplicateWarned', seen).catch(() => undefined)
  const names = new Set(ids.map(id => id.split('@')[0]))
  $.ui.toast(names.size < ids.length
    ? `Two builds of one plugin are turned on (${ids.join(', ')}). Claude Code runs only one of them. Turn one off in /plugin.`
    : `Two builds are turned on (${ids.join(', ')}). Both run on every prompt. Turn one off in /plugin.`)
}

/** A plugin id as Claude Code writes it, name@marketplace: the only shape that goes into a command or a toast. */
export const PLUGIN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}@[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
/** The scopes `claude plugin uninstall --scope` takes. */
export const INSTALL_SCOPES = ['user', 'project', 'local'] as const
/** One install as installed_plugins.json lists it. */
export type InstallRec = { id: string; scope: string; installPath: string; projectPath?: string }
const normPath = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
/** Every install in installed_plugins.json ({plugins: {id: [records]}}, or the older flat map {id: record}). */
export function installRecords(installed: unknown): InstallRec[] {
  if (!installed || typeof installed !== 'object') return []
  const o = installed as Record<string, unknown>
  const map = o.plugins && typeof o.plugins === 'object' ? (o.plugins as Record<string, unknown>) : o
  const out: InstallRec[] = []
  for (const [id, value] of Object.entries(map)) {
    if (!id.includes('@')) continue
    const recs = Array.isArray(value) ? value : [value]
    for (const r of recs) {
      const rec = (r && typeof r === 'object' ? r : {}) as { scope?: unknown; installPath?: unknown; projectPath?: unknown }
      out.push({
        id,
        scope: typeof rec.scope === 'string' ? rec.scope : 'user',
        installPath: typeof rec.installPath === 'string' ? rec.installPath : '',
        ...(typeof rec.projectPath === 'string' ? { projectPath: rec.projectPath } : {}),
      })
    }
  }
  return out
}
/** Whether `cwd` is `project` or a folder inside it. */
const within = (cwd: string, project: string) => {
  const c = normPath(cwd), p = normPath(project)
  return c === p || c.startsWith(`${p}/`)
}
/**
 * The installs that may be the running one: records whose installPath is the plugin's root and that apply here (a
 * project or local install only in its own project). Claude Code caches one copy per marketplace, plugin and version,
 * so installs for two projects, or a user and a project install, can share one path. Unknown `cwd`: every project
 * install at the path stays a candidate.
 */
export function ownInstalls(installed: unknown, root: string, cwd?: string, folders?: Readonly<Record<string, string>>): InstallRec[] {
  const at = normPath(root)
  return installRecords(installed).filter(r => {
    // From a directory marketplace Claude Code reads the plugin from that folder (after /reload-plugins, say), not from
    // the copy the record names: the folder counts as this install too.
    const folder = folders?.[r.id.split('@')[1] ?? '']
    const here = (r.installPath && normPath(r.installPath) === at) || (folder !== undefined && normPath(folder) === at)
    if (!here) return false
    if ((r.scope === 'project' || r.scope === 'local') && r.projectPath && cwd) return within(cwd, r.projectPath)
    return true
  })
}
/** The install that is running, when exactly one record can be it; null when loaded from a folder (--plugin-dir), not
 *  listed, or ambiguous (then nothing is uninstalled on a guess). */
export function ownInstall(installed: unknown, root: string, cwd?: string): InstallRec | null {
  const found = ownInstalls(installed, root, cwd)
  return found.length === 1 ? (found[0] ?? null) : null
}
/** A path as one shell word, for a command shown to the person to copy. */
export const shellWord = (s: string) => (/^[A-Za-z0-9_./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)
/** The terminal line that removes one install: in its project for a project or local install. */
export function uninstallLine(b: Pick2<OtherBuild, 'id' | 'scope' | 'projectPath'>): string | null {
  const args = uninstallArgs(b)
  if (!args) return null
  const cmd = `claude ${args.join(' ')}`
  return (b.scope === 'project' || b.scope === 'local') && b.projectPath ? `cd ${shellWord(b.projectPath)} && ${cmd}` : cmd
}
/** Another build installed beside this one: upstream's public one, an older upstream build, or this plugin from another
 * marketplace (a 'twin', e.g. after a move from a local marketplace to a public one). With its scope, so
 * the uninstall removes that one and no other, and whether it is turned on. */
export type OtherBuild = { id: string; kind: 'public' | 'older' | 'twin'; scope?: string; projectPath?: string; enabled?: boolean }
/** The upstream marketplace's name: an install from it is the public build. */
const PUBLIC_MARKETPLACE = UPSTREAM_NAME
/**
 * Every installed Smart Token Saver or effortless that is not this build, from installed_plugins.json. The running one is
 * known by its path, never by a guess from the folder name: its id, and any record at its path, are never listed. An
 * install for another project does not run here and is left out. `enabled` is the merged enabledPlugins.
 */
export function otherBuilds(installed: unknown, own: { id?: string; root?: string; name?: string; folders?: Readonly<Record<string, string>> } | string, cwd?: string, enabled?: unknown): OtherBuild[] {
  const me = typeof own === 'string' ? { id: own } : own
  const selves = me.root ? ownInstalls(installed, me.root, cwd, me.folders) : []
  const ownId = selves[0]?.id ?? me.id ?? ''
  const ownName = (ownId.split('@')[0] || me.name) ?? ''
  const on = enabled && typeof enabled === 'object' ? (enabled as Record<string, unknown>) : null
  const seen = new Set<string>()
  const out: OtherBuild[] = []
  for (const r of installRecords(installed)) {
    const name = r.id.split('@')[0] ?? ''
    if (r.id === ownId || selves.some(x => x.id === r.id) || ![UPSTREAM_NAME, ownName].includes(name)) continue
    if (me.root && r.installPath && normPath(r.installPath) === normPath(me.root)) continue
    if ((r.scope === 'project' || r.scope === 'local') && r.projectPath && cwd && normPath(r.projectPath) !== normPath(cwd)) continue
    const key = `${r.id} ${r.scope}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: r.id,
      kind: name !== UPSTREAM_NAME ? 'twin' : r.id.split('@')[1] === PUBLIC_MARKETPLACE ? 'public' : 'older',
      scope: r.scope,
      ...(r.projectPath ? { projectPath: r.projectPath } : {}),
      ...(on ? { enabled: on[r.id] === true } : {}),
    })
  }
  return out.sort((a, b) => (a.id === b.id ? String(a.scope).localeCompare(String(b.scope)) : a.id.localeCompare(b.id)))
}
/** The setup's (and the card's) line for a found build. */
export function otherBuildText(b: OtherBuild): string {
  const what = b.kind === 'public' ? `The public ${UPSTREAM_NAME} (HeyCubit)` : b.kind === 'older' ? `An older ${UPSTREAM_NAME} build` : `${PRODUCT_NAME} from ${b.id.split('@')[1]}`
  const where = b.scope === 'project' || b.scope === 'local' ? ` for this project` : ''
  if (b.enabled === false) return `${what} is also installed${where}, turned off. Remove it?`
  // Two plugins of one name: Claude Code loads the hooks of only one of them, and which one is not up to us.
  return b.kind === 'twin'
    ? `${what} is also installed${where}. Claude Code runs only one of the two, maybe that one. Remove it?`
    : `${what} is also installed${where}. Both would run on every prompt. Remove it?`
}
/** The command that removes one found build, or null when its id or scope is not one that may go into a command. */
export function uninstallArgs(b: Pick2<OtherBuild, 'id' | 'scope'>): string[] | null {
  if (!PLUGIN_ID_RE.test(b.id)) return null
  const scope = b.scope ?? 'user'
  if (!(INSTALL_SCOPES as readonly string[]).includes(scope)) return null
  return ['plugin', 'uninstall', b.id, '--scope', scope]
}
/** The first other build found this session that the person has not chosen to keep; null when there is none. */
let otherFound: OtherBuild | null = null
/** Where Claude Code keeps its plugin list: CLAUDE_CONFIG_DIR when set, else ~/.claude. */
async function installedPluginsPath($: EngineInterface): Promise<string | null> {
  const dir = (await Promise.resolve($.env.get('CLAUDE_CONFIG_DIR')).catch(() => null))?.trim()
  if (dir) return `${dir.replace(/[\\/]+$/, '')}/plugins/installed_plugins.json`
  const home = await homeDir($)
  return home ? `${home.replace(/[\\/]+$/, '')}/.claude/plugins/installed_plugins.json` : null
}
/** The plugin list as Claude Code keeps it (a local file, no network); null when it cannot be read. */
async function readInstalled($: EngineInterface): Promise<unknown> {
  const path = await installedPluginsPath($)
  if (!path) return null
  const text = await $.fs.read(path).catch(() => '')
  try {
    return text ? JSON.parse(String(text)) : null
  } catch {
    return null
  }
}
/** The folders of directory marketplaces (known_marketplaces.json, beside the plugin list), by marketplace name. */
async function marketFolders($: EngineInterface): Promise<Record<string, string>> {
  const path = await installedPluginsPath($)
  if (!path) return {}
  const text = await $.fs.read(path.replace(/installed_plugins\.json$/, 'known_marketplaces.json')).catch(() => '')
  try {
    const known = text ? (JSON.parse(String(text)) as Record<string, { source?: { source?: string; path?: string } }>) : {}
    const out: Record<string, string> = {}
    for (const [name, m] of Object.entries(known)) if (m?.source?.source === 'directory' && typeof m.source.path === 'string') out[name] = m.source.path
    return out
  } catch {
    return {}
  }
}
/** The records that may be this running install, for the chat's project. */
async function ownInstallsNow($: EngineInterface): Promise<InstallRec[]> {
  const cwd = await $.session.root().catch(() => undefined)
  return ownInstalls(await readInstalled($), $.plugin.root, cwd ? String(cwd) : undefined, await marketFolders($))
}
/** This running install's record (id and scope), or null when loaded from a folder, not listed, or not one for sure. */
async function ownInstallNow($: EngineInterface): Promise<InstallRec | null> {
  const found = await ownInstallsNow($)
  return found.length === 1 ? (found[0] ?? null) : null
}
/** Reads the plugin list and sets otherFound. */
async function findOtherBuild($: EngineInterface): Promise<OtherBuild | null> {
  otherFound = null
  const parsed = await readInstalled($)
  if (!parsed) return null
  const kept = await $.store.get('otherBuildsKept').catch(() => null)
  const skip = Array.isArray(kept) ? kept.map(String) : []
  const cwd = await $.session.root().catch(() => undefined)
  const enabled = await $.settings.read({ key: 'enabledPlugins' }).catch(() => undefined)
  otherFound = otherBuilds(parsed, { root: $.plugin.root, name: $.plugin.name || PLUGIN, folders: await marketFolders($) }, cwd ? String(cwd) : undefined, enabled).find(b => !skip.includes(b.id)) ?? null
  return otherFound
}
/** The setup's first step: the other build when there is one, else the lean. */
const firstSetupStep = (): SetupStep => 'intro'
/** Keep both: never asked about this one again. */
async function keepOtherBuild($: EngineInterface, b: OtherBuild) {
  const kept = await $.store.get('otherBuildsKept').catch(() => null)
  await $.store.set('otherBuildsKept', [...new Set([...(Array.isArray(kept) ? kept.map(String) : []), b.id])]).catch(() => undefined)
  otherFound = null
  $.ui.invalidate('ui.render')
}
/** Remove it: `claude plugin uninstall <id> --scope <scope>` (in its project for a project install), nothing else. The
 *  running install is never the target. On failure the toast gives the command to run by hand; true when it went. */
async function removeOtherBuild($: EngineInterface, b: OtherBuild): Promise<boolean> {
  const args = uninstallArgs(b)
  const selves = await ownInstallsNow($)
  if (!args || selves.some(r => r.id === b.id && r.scope === (b.scope ?? 'user'))) {
    $.ui.toast(`Could not remove it here. Remove it in /plugin.`)
    return false
  }
  const cwd = (b.scope === 'project' || b.scope === 'local') && b.projectPath ? { cwd: b.projectPath } : {}
  const r = await runClaude($, args, { timeoutMs: 120_000, ...cwd }).catch(error => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  const ok = r.exitCode === 0
  if (ok) {
    otherFound = null
    // Other open chats still hold it as found: the kept list tells them it is answered (see syncSharedSetup).
    const kept = await $.store.get('otherBuildsKept').catch(() => null)
    await $.store.set('otherBuildsKept', [...new Set([...(Array.isArray(kept) ? kept.map(String) : []), b.id])]).catch(() => undefined)
    $.ui.toast('Removed. Open a new chat to finish.')
  } else {
    $.ui.toast(`Could not remove it. Run this in a terminal: ${uninstallLine(b)}`)
  }
  $.ui.invalidate('ui.render')
  return ok
}

/** What the Context card and the setup step say about the window in force, in one short line. */
export function windowNote(wanted: number | null, s: WindowState | null, chatOwn = false): string {
  if (!s) return 'Not read yet. It shows after the first reply.'
  const at = s.trigger === null ? 'Auto-compact is off in Claude Code.' : `Compacts at ${windowLabel(s.trigger)}.`
  // This chat runs on its own size (This chat only): the line says what this chat uses, the row below says why.
  if (chatOwn) return `This chat uses ${windowLabel(s.raw)} (see This chat only). ${at}`
  switch (windowStatus(wanted, s)) {
    case 'ok':
      return `In use: ${windowLabel(s.raw)}. ${at}`
    case 'command':
      return `In use: ${windowLabel(s.raw)}, set with /autocompact for ${s.model}. ${at}`
    case 'default':
      return `Claude Code's own: ${windowLabel(s.raw)}. ${at}`
    case 'env':
      return `CLAUDE_CODE_AUTO_COMPACT_WINDOW sets ${windowLabel(s.raw)} and wins. ${at}`
    case 'policy':
      return `Your organization sets ${windowLabel(s.policyValue ?? s.raw)}. That wins. ${at}`
    case 'model':
      return `/autocompact set ${windowLabel(s.modelValue ?? s.raw)} for ${s.model}. That wins. ${at}`
    case 'other':
      return `Claude Code uses ${windowLabel(s.raw)} here. ${at}`
    default:
      return `Not in force yet: Claude Code uses ${windowLabel(s.raw)}. ${at}`
  }
}

/** The context's tokens when the cold band is worth showing: the cache is cold, the band not closed, and the chat big
 * enough that rereading it matters (limits().coldFrom). Null otherwise, and while the size is not known yet. */
async function coldWorth($: EngineInterface): Promise<number | null> {
  if ((await read($, cacheLeft)) !== 0 || config.hide.includes('cold') || (await read($, isColdHidden))) return null
  const tokens = lastContext?.tokens
  if (coldForced) return tokens ?? 0
  return tokens !== undefined && tokens >= limits().coldFrom ? tokens : null
}

/** The countdown's colour for whole minutes left (rounded up, as cacheMinutes gives): none (grey), yellow or red. */
export function cacheColor(minutesLeft: number): string | undefined {
  const shown = minutesLeft - 1
  if (minutesLeft <= 0) return ICE
  if (shown > CACHE_YELLOW_MIN) return undefined
  return shown <= CACHE_RED_MIN ? RED : YELLOW
}

/** The footer's words for the time left: "58m", "<1m", or "Cold". */
export function cacheLabel(minutesLeft: number): string {
  if (minutesLeft <= 0) return '❄ Cold'
  if (minutesLeft === 1) return '<1m'
  return `${minutesLeft - 1}m`
}

/** The dashboard's countdown to the second: "58:41", or "Cold" once it ran out. */
export function cacheClock(msLeft: number): string {
  if (msLeft <= 0) return '❄ Cold'
  const s = Math.ceil(msLeft / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** How many seconds the countdown image carries: the band is redrawn once a minute, with some slack. */
const CLOCK_FRAMES = 75
/** The dashboard's countdown as an image that ticks by itself: one frame per second, each shown for its second by a
 * CSS animation. The band is redrawn only once a minute: every redraw rebuilds the band, which restarts every image's
 * animation (the Handoff glow restarted each second while the band was redrawn for the seconds). The app sets the
 * image's font and colour to the band's, so the digits match the text around them. */
export function cacheClockSvg(msLeft: number, color: string): string {
  const start = Math.max(0, Math.ceil(msLeft / 1000))
  const frames: string[] = []
  for (let j = 0; j < CLOCK_FRAMES && start - j > 0; j++) {
    const left = start - j
    const label = `cache ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
    frames.push(`<text x="0" y="12.5" style="animation-delay:${j}s">${label}</text>`)
  }
  frames.push(`<text x="0" y="12.5" style="animation-delay:${frames.length}s;animation-duration:100000s">❄ Cold</text>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="17" viewBox="0 0 84 17"><style>text{font-size:13px;fill:${color};opacity:0;animation:f 1s step-end 1}@keyframes f{0%{opacity:1}100%{opacity:0}}</style>${frames.join('')}</svg>`
}

let cacheTtl: keyof typeof CACHE_TTL = '1h'
let cacheExpires = 0
/** The countdown's variables live in the module, and a reload (an update, a plugin switch) starts the module over: the
 * chat's cache did not go cold for that, so the countdown is read back from the session's state before the band draws
 * (it showed "Cold" after every reload). */
let cacheRestored = false
async function restoreCache($: EngineInterface) {
  if (cacheRestored) return
  cacheRestored = true
  const memo = await read($, cacheMemo)
  if (!memo || cacheExpires !== 0 || memo.expires <= 0) {
    // Nothing to go on: a "Cold" left in the shared state by the copy before is not this chat's cache.
    if (cacheExpires === 0 && !coldForced && (await read($, cacheLeft)) === 0) await update($, cacheLeft, () => null)
    return
  }
  cacheExpires = memo.expires
  cacheTtl = memo.ttl
  lastResponseAt = memo.last
}
const rememberCache = ($: EngineInterface) => update($, cacheMemo, () => ({ expires: cacheExpires, ttl: cacheTtl, last: lastResponseAt }))
/** Writes the minutes left when they changed; the session's one timer (started in session.start) calls it. */
// What /smarttokensaver swamp shows as a test: a swamped chat's context.
const SWAMP_TOKENS = 150_000
// Closed, the band stays away until the context has grown this much more.
const SWAMP_REGROW = 50_000

/** Whether the context is swamped, from the status line's figures. Cheap: no counting, no model call. */
// A usage window this full shows the running-hot band.
const HOT_PERCENT = 80
// Skip for now: the running-hot band comes back once the limit is this many points fuller.
export const HOT_SNOOZE = 5

/** The running-hot band skipped: the window (kind and reset time), how full it was then, and whether it was skipped
 *  until that window resets (Skip this week / Skip until reset) or only for now. */
export type HotClosed = { window: string; percent: number; untilReset?: boolean }
const hotWindow = (heat: { kind: string; resetsAt: string | null }) =>
  // To the quarter hour: the reset time the app reports can shift by seconds between checks.
  `${heat.kind} ${heat.resetsAt ? Math.round(new Date(heat.resetsAt).getTime() / 900_000) : ''}`

/** Whether the running-hot band shows: always until skipped. Skipped for now, it comes back HOT_SNOOZE points later
 *  (80, 85, 90, 95); skipped until the reset, not again in that window. A new window shows it again. */
export function hotVisible(heat: { kind: string; percent: number; resetsAt: string | null }, closed: HotClosed | null): boolean {
  if (!closed || closed.window !== hotWindow(heat)) return true
  if (closed.untilReset) return false
  return Math.floor(heat.percent) >= Math.floor(closed.percent) + HOT_SNOOZE
}

let hotClosedLoaded = false
/** The closed band as the store keeps it, read once per session (a new chat starts with the atom empty). */
async function hotClosedNow($: EngineInterface): Promise<HotClosed | null> {
  if (!hotClosedLoaded) {
    hotClosedLoaded = true
    const kept = (await $.store.get('hotClosed').catch(() => null)) as HotClosed | null
    if (kept && typeof kept.window === 'string') await update($, hotHidden, () => kept)
  }
  return read($, hotHidden)
}

async function closeHot($: EngineInterface, heat: { kind: string; percent: number; resetsAt: string | null }, untilReset = false) {
  const closed: HotClosed = { window: hotWindow(heat), percent: heat.percent, ...(untilReset ? { untilReset: true } : {}) }
  await update($, hotHidden, () => closed)
  await $.store.set('hotClosed', closed).catch(() => undefined)
}

/** The fullest of the 5-hour and weekly windows, once one passes HOT_PERCENT. Save mode ends with its window. */
async function checkHot($: EngineInterface, limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]) {
  const windows = limits.filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
  const top = windows.sort((a, b) => b.percentUsed - a.percentUsed)[0]
  const next = top && top.percentUsed >= HOT_PERCENT ? { kind: top.kind, percent: top.percentUsed, resetsAt: top.resetsAt ?? null } : null
  const was = await read($, hot)
  if (JSON.stringify(next) !== JSON.stringify(was)) {
    await update($, hot, () => next)
    $.ui.invalidate('ui.render')
  }
  const until = await read($, saveUntil)
  if (until !== null && (await $.clock.now()) >= until) await update($, saveUntil, () => null)
}

/** "14:20" for a reset time today, "Mon 14:20" further out. */
export function resetLabel(iso: string | null, now: number): string {
  if (!iso) return ''
  const at = new Date(iso)
  const hm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return at.getTime() - now < 20 * 3600_000 ? hm : `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()]} ${hm}`
}

/**
 * A message that says the last answer was wrong or did not work. After a prompt ran on a cheaper model, this is the
 * signal the cheaper model missed: the retry and the next few prompts stay on the chat's own model.
 */
const REDO_RE = /^(no|nope|nah)(?![a-z'])(?! +(problem|worries|thanks|thank|need|rush|hurry))|^(that'?s |this is |it'?s )?(wrong|incorrect|not (right|correct|what i))|^(it |that |this )?(still )?(doesn'?t|didn'?t|isn'?t|does not|did not|is not) (work|fix|help|change|run|compile|pass)|^still (not|broken|wrong|failing|fails|the same|happening|doesn'?t)|^(not working|try again|do it again|redo|you missed|you forgot|you broke)|^(fel|inte rätt|funkar inte|fungerar inte|försök igen|gör om|det är fel)(?![a-zåäö])|(still (broken|wrong|failing)|try again|funkar fortfarande inte)/i
export const REDO_STAY_PROMPTS = 4
export function looksLikeRedo(text: string): boolean {
  return REDO_RE.test(text.trim().replace(/^["'“ ]+/, ''))
}

/**
 * The effort slider tips close calls only: a verdict the judge was unsure of moves one step toward cheaper or smarter.
 * The outer stops count more calls as close. A sure verdict, or one without a confidence, stays as it is.
 */
export function tipped(effort: Effort, sure: number | undefined, bias: number): Effort {
  if (!bias || sure === undefined || sure >= (Math.abs(bias) === 1 ? 0.65 : 0.85)) return effort
  const i = Math.max(0, Math.min(EFFORTS.length - 1, EFFORTS.indexOf(effort) + Math.sign(bias)))
  return EFFORTS[i]
}

/** Floor and ceiling from the settings: what Auto picks stays between them. */
export function bounded(effort: Effort, floor: Effort, ceiling: Effort): Effort {
  const lo = EFFORTS.indexOf(floor)
  const hi = Math.max(lo, EFFORTS.indexOf(ceiling))
  return EFFORTS[Math.max(lo, Math.min(hi, EFFORTS.indexOf(effort)))]
}

/** Save mode caps what Auto picks at medium; a higher pick comes down to it. */
export function capped(effort: Effort, saving: boolean): Effort {
  return saving && EFFORTS.indexOf(effort) > EFFORTS.indexOf('medium') ? 'medium' : effort
}

// A main-conversation turn is running: set when a prompt is sent and at each request, cleared when the turn ends (an
// aborted one too). The swamp band and card wait for it: Compact or Handoff mid-turn would cut the reply off. A turn
// with no request for TURN_STALE_MS counts as over, so a missed end never hides the band for good.
let turnBusyAt: number | undefined
const TURN_STALE_MS = 10 * 60_000
function turnBusy(): boolean {
  return turnBusyAt !== undefined && Date.now() - turnBusyAt < TURN_STALE_MS
}
async function setTurnBusy($: EngineInterface, busy: boolean) {
  const was = turnBusyAt !== undefined
  turnBusyAt = busy ? Date.now() : undefined
  if (was !== busy) $.ui.invalidate('ui.render')
}

/** A context share to draw the bars with instead of the real one, from ~/.claude/smarttokensaver/preview.json
 * ({"contextPercent": 45}), so how a level looks can be checked on screen without filling a chat. No file, no change. */
async function previewPercent($: EngineInterface): Promise<number | undefined> {
  const home = (await envUserProfile($)) ?? (await envHome($))
  if (!home) return undefined
  const text = await $.fs.read(`${home}/${DATA_DIR}/preview.json`).catch(() => '')
  if (!text) return undefined
  try {
    const n = Number((JSON.parse(text) as { contextPercent?: unknown }).contextPercent)
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
  } catch {
    return undefined
  }
}

// The token figure the engine reported when the main chat was compacted. Until the next reply it may keep reporting
// that figure: it is the chat before, and the swamp and cold bands would ask to compact a chat that just was. It counts
// as nothing known until the figure is gone or another one.
let staleTokens: number | null = null
/** The main chat was compacted at `before` tokens: the bands and the ring let go of that size at once. */
async function chatCompacted($: EngineInterface, before: number | undefined) {
  staleTokens = before !== undefined && before > 0 ? before : null
  await update($, swampHiddenAt, () => null).catch(() => undefined)
  await checkSwamp($).catch(() => undefined)
  $.ui.invalidate('ui.render')
}
const tokensReported = ($: EngineInterface) => $.session.usage().then(u => u.context.tokens, () => undefined)

async function checkSwamp($: EngineInterface) {
  const { context, rateLimits } = await $.session.usage()
  const preview = await previewPercent($)
  if (preview !== undefined && !context.window) context.window = 200_000
  if (staleTokens !== null && context.tokens !== staleTokens) staleTokens = null
  const reported = staleTokens !== null ? 0 : (context.tokens ?? 0)
  // The ring, the swamp band and the handoff check all measure against limits(): where compaction runs for this chat,
  // its own window included, not the model's whole window.
  if (preview === undefined && loadTokens === null && reported > 0) loadTokens = reported
  // Past the read trigger without a compaction: Claude Code runs on a bigger window than it reports (a resumed chat).
  if (preview === undefined && windowState) {
    const learned = learnTrigger(learnedTrigger, withLearned(windowState, learnedTrigger), reported, loadTokens)
    if (learned !== learnedTrigger) {
      learnedTrigger = learned
      learnedFor = `${windowState.model} ${windowState.raw}`
      void proof($, `compacts later than read: trigger ${windowState.trigger} read, ${learned} taken (tokens ${reported}, loaded ${loadTokens})`)
      $.ui.invalidate('ui.render')
    }
  }
  const limit = effectiveThresholds(chatOverride, withLearned(windowState, learnedTrigger), context.window, settingsHookBlocked ? undefined : config.compactWindow)
  const base = limit.trigger ?? context.window ?? 200_000
  const tokens = preview === undefined ? reported : Math.round((base * preview) / 100)
  const percent = limit.percent(tokens) ?? 0
  const wasStep = handoffGlowStep(lastContext?.percent ?? 0)
  lastContext = { tokens, window: context.window ?? 0, percent }
  // The Handoff button turns white and glows harder with the context: redraw the band when it crosses a step.
  if (handoffGlowStep(percent) !== wasStep) $.ui.invalidate('ui.render')
  await checkHot($, rateLimits ?? [])
  const over = tokens > 0 && tokens >= limit.swampFrom(config.swampAt)
  const next = over ? tokens : null
  if (next !== (await read($, swamped))) {
    await update($, swamped, () => next)
    $.ui.invalidate('ui.render')
  }
}

// Redraws still owed after a chat was opened again: the app may draw the band before it is ready for one, so the
// session's 1 s timer asks again a few times (see redrawSoon).
let redrawsOwed = 0
// The countdown's minute the band was last redrawn for (see cacheClockSvg).
let clockMinute = -1
// When the redraws were asked for: once the band has been drawn after that, none are owed any more. Each redraw
// rebuilds the band and restarts its animations, so asking blindly 4 more times reset the cold band's spin 4 times.
let redrawAskedAt = 0
// A draw this soon after the ask may come before the app has the band up, so it does not count.
const REDRAW_SETTLE_MS = 500
function redrawSoon(times = 5) {
  redrawsOwed = Math.max(redrawsOwed, times)
  redrawAskedAt = Date.now()
}

async function showCache($: EngineInterface) {
  // No response seen by this copy yet (it loaded mid-chat, after a plugin switch or reload): a 0 left in the shared
  // state by an earlier copy is not this chat's cache, so the countdown goes blank until the next response.
  if (cacheExpires === 0) {
    if (!coldForced && (await read($, cacheLeft)) !== null) {
      await update($, cacheLeft, () => null)
      $.ui.invalidate('ui.render')
    }
    return
  }
  const minutes = await cacheMinutes($)
  const was = await read($, cacheLeft)
  if (minutes === was) return
  await update($, cacheLeft, () => minutes)
  // Going cold or warm adds or removes the band above the prompt; the desktop app redraws that site only when asked.
  if ((minutes === 0) !== (was === 0)) $.ui.invalidate('ui.render')
}

/** Minutes left, rounded up, so "1" means under a minute and 0 means cold. */
async function cacheMinutes($: EngineInterface): Promise<number> {
  const left = cacheExpires - (await $.clock.now())
  return left <= 0 ? 0 : Math.ceil(left / 60_000)
}

/** A response came back: the cache is warm again for its whole lifetime, and the countdown restarts. */
let usageLogged = false
let lastResponseAt: number | undefined
// Main-conversation replies this copy has seen, for /smarttokensaver debug.
let repliesSeen = 0
async function cacheTouched($: EngineInterface, usage: unknown) {
  const now = await $.clock.now()
  repliesSeen++
  if (!usageLogged) {
    usageLogged = true
    void proof($, `first response usage: ${JSON.stringify(usage)}`)
  }
  // When the response does not say, the cache tells by itself: read back after more than 5 minutes means 1 hour.
  const ttl = cacheTtlOf(usage) ?? (lastResponseAt !== undefined && now - lastResponseAt > CACHE_TTL['5m'] && mostlyCached(usage) ? '1h' : undefined)
  lastResponseAt = now
  coldForced = false
  // A reply that wrote only a short 5-minute tail still reads the rest from the 1-hour cache: once 1h is seen, a
  // 5m reading never pulls the countdown back down (that showed "Cold" while the cache was warm).
  if (ttl && ttl !== cacheTtl && !(ttl === '5m' && cacheTtl === '1h' && mostlyCached(usage))) {
    cacheTtl = ttl
    void proof($, `cache lifetime ${ttl}`)
  }
  cacheExpires = now + CACHE_TTL[cacheTtl]
  await rememberCache($)
  if (await read($, isColdHidden)) await update($, isColdHidden, () => false)
  await showCache($)
}

/**
 * Compacts the conversation from the footer once the cache has gone cold: the next message would write the whole
 * context to the cache again, so a summary makes it small first. The countdown hides until the next response.
 */
async function compactCold($: EngineInterface, note = '') {
  if (await read($, isCompacting)) return
  await update($, compactAsk, () => false)
  await update($, isCompacting, () => true)
  await setHandoffCard($, 'compacting', false)
  let compacted = false
  try {
    // The app's own /compact, run as if typed: nothing lands in the prompt box, nothing to send. It waits for the
    // session to be idle, where a direct $.session.compact() is refused whenever the app counts a turn as running.
    // A note goes after /compact as the app's own instructions for the summary.
    const hookRunsBefore = compactHookRuns
    const hookDoneBefore = compactHookDone
    const before = await $.session.messages().catch(() => [] as readonly unknown[])
    const reported = await tokensReported($)
    const said = await $.command.run({ command: 'compact', args: note.trim() })
    const hookRan = compactHookRuns > hookRunsBefore
    // Did it compact? The hook handed back a summary for the main chat, or the transcript is another one now. The
    // hook merely running says nothing: a veto beneath it, or a subagent's own compaction in the same moment, runs it
    // too. A command that answered without compacting (a refusal, nothing to compact) is said as such: no
    // "Compacted", the cache stays, and nothing is concluded about the hook. With no transcript to compare (none read
    // before, or none after) nothing is known: a veto looks the same from here, so it is not called compacted.
    const hookDone = compactHookDone > hookDoneBefore
    const after = hookDone || !before.length ? null : await $.session.messages().catch(() => null)
    if (!hookDone && (!before.length || after === null)) throw new Error('the chat could not be read, so it is not known whether it compacted')
    const changed = hookDone || (after !== null && transcriptPrint(after) !== transcriptPrint(before))
    if (!changed) {
      const why = (said as { text?: string } | undefined)?.text?.trim()
      throw new Error(why ? `nothing was compacted (${why.slice(0, 100)})` : 'nothing was compacted')
    }
    // Compacted, and the plugin's session.compact hook did not run for it: a policy plugin above it skipped it,
    // so the chat's model wrote the summary. Kept, so the settings say so.
    if (hookRan || before.length) await noteCompactHook($, hookRan)
    // Also where the hook was skipped: the size before is not this chat's any more.
    await chatCompacted($, reported)
    cacheExpires = 0
    await rememberCache($)
    await update($, cacheLeft, () => null)
    compacted = true
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    void proof($, `compact failed: ${why}`)
    $.ui.toast(`${PRODUCT_NAME}: compact failed: ${why.slice(0, 140)}`)
  } finally {
    await update($, isCompacting, () => false)
    // Complete, or gone when it failed (the toast says why).
    if (compacted) {
      await setHandoffCard($, 'compacted', false)
      $.clock.after(COMPACT_CARD_MS + 100, () => $.ui.invalidate('ui.render'))
    } else await update($, handoffCard, card => (card?.kind === 'compacting' ? null : card))
  }
}

// The handoff: one click writes a handoff, clears the chat and sends the handoff into it as the first message.
// The quick handoff is written by a fork, which has no tools: it says what the chat last saw and marks what it cannot
// check. The full handoff (the person's own skill) is the one that inspects git and saves files.
export const HANDOFF_PROMPT = [
  'Write a handoff so this work can continue in a fresh chat that has no other context.',
  '',
  'Start with the project, its folder and the branch. Then:',
  '- Goal: one or two lines.',
  '- Done: what changed, with file paths, and how each change was checked. Never present something planned, skipped or untested as done.',
  '- Not done: what is half done, and the concrete blocker (a failed check, a missing approval, an open question).',
  '- Git: local changes, local commits, pushed commits and open PRs, as last seen in this chat. You cannot check now, so say "as of last check".',
  '- Next steps in priority order. Make the first one runnable: a file path, a command or a specific decision. Mark every step that needs the user with "needs user".',
  '- To resume: the start command, the preview URL, and the limits on what is allowed (what needs the user\'s approval, test vs production).',
  '- Do not redo: decisions made and why, approaches that failed.',
  '',
  'Give only the final state of anything that changed during the chat. Point to specs, plans and files instead of ' +
    'copying them. Leave out what is finished and no longer matters. Never include secrets, environment values or raw ' +
    'logs. Write in the language the user writes in. Short bullets, at most about 40 lines. Do not use tools. Reply ' +
    'with the handoff only, no preamble or farewell.',
].join('\n')

/** The full handoff when no skill of the person's is picked: a turn that may check git and save the handoff, then
 * replies with it. Slower than the quick fork, and it leaves HANDOFF.md in the project for the next chat to read. */
export const HANDOFF_FULL_PROMPT = [
  'Write a handoff so this work can continue in a fresh chat that has no other context. You may use tools for this.',
  '',
  '1. Check the real state: git status, the last few commits, whether the branch is pushed, open PRs if gh is set up.',
  '2. Rewrite HANDOFF.md in the project root from scratch (keep it under 80 lines): branch and open PRs, what is half done,',
  '   next steps with the first one runnable, what only the user can do, and pointers to specs, plans and files.',
  '   Never put secrets or environment values in it.',
  '3. Reply with the handoff itself, in the same shape:',
  '',
  HANDOFF_PROMPT.split('\n').slice(2).join('\n').replace('Do not use tools. ', ''),
].join('\n')

/** The first message of the fresh chat: the handoff, then what to do with it. */
export function handoffMessage(handoff: string, after: HandoffAfter, skill?: string): string {
  const ask =
    after === 'confirm'
      ? 'Read this, say in two lines where things stand and what is next, then wait for me.'
      : 'Continue with the next step. If it is marked "needs user", say what you need and wait.'
  // A full handoff is the person's own skill: it saves the handoff (a file, memories), and its last words in the chat
  // are often only a note that it did. The new chat is told to read what the skill saved before anything else.
  if (skill)
    return (
      `Handoff from the previous chat: it ran /${skill}, which saved the handoff. Its last words there:\n\n${handoff.trim()}\n\n` +
      `First read the handoff /${skill} saved: the files named above, or HANDOFF.md in the project if none is named. ${ask}`
    )
  return `Handoff from the previous chat:\n\n${handoff.trim()}\n\n${ask}`
}

// The handoff's text once its turn has ended, waiting for the chat to go idle so it can be cleared and resent.
let handoffText: string | undefined
let handoffDriving = false
// The handoff was sent into the chat as a turn (Full, or Quick where the fork wrote nothing): only then is the next
// reply the handoff. A reply that ends while a fork writes, or a turn that was running at Go, is the chat's own.
let handoffTurnSent = false
// When that turn was sent, and the chat the handoff was asked in: a turn that never starts is given up, and a handoff
// never clears another chat than its own.
let handoffSentAt = 0
let handoffSid = ''
const HANDOFF_START_MS = 45_000
/** Sends the handoff's own turn; a prompt a plugin beneath holds back ({ drop }) was not sent. */
async function sendHandoffTurn($: EngineInterface, text: string) {
  handoffTurnSent = true
  handoffSentAt = Date.now()
  const sent = await $.prompt.submit({ text })
  if ((sent as { drop?: unknown } | undefined)?.drop !== undefined) throw new Error('another plugin held the handoff prompt back')
}

/** Starts a handoff: asks for it (built-in prompt or the person's own skill); the rest follows when it is written. */
// A handoff asked for and not begun: begun from the session's timer, where a prompt may be sent (a command or a press
// may hold the turn, and the app refuses a prompt sent from there).
let handoffQueued = false
// Quick: a fork with the built-in prompt, seconds. Full: the person's own skill as a turn, which may check and save.
let handoffFull = false
// What follows this handoff once it is written (HandoffAfter).
let handoffThen: HandoffAfter = 'continue'

async function startHandoff($: EngineInterface, full = false, after: HandoffAfter = config.handoffAfter) {
  if ((await read($, handoffStage)) !== null) return
  await update($, handoffStage, () => 'writing')
  handoffTurnSent = false
  handoffSid = String(await $.session.id().catch(() => ''))
  handoffFull = full
  handoffThen = after
  handoffQueued = true
  await setHandoffCard($, 'writing', handoffFull)
}

/** The choice the handoff bar opens on: the one made last, else quick and the configured after. */
async function lastHandoffChoice($: EngineInterface): Promise<HandoffChoice> {
  const kept = (await $.store.get('handoffChoice').catch(() => null)) as Partial<HandoffChoice> | null
  const kind = kept?.kind === 'full' ? 'full' : 'quick'
  const after = (['continue', 'confirm', 'copy'] as const).find(a => a === kept?.after) ?? config.handoffAfter
  return { kind, after }
}

/** Opens the handoff bar above the prompt: the footer's ⇥ and the swamp band's Handoff. */
async function openHandoffBar($: EngineInterface) {
  if ((await read($, handoffStage)) !== null) return
  const choice = await lastHandoffChoice($)
  await update($, handoffPick, () => choice)
  $.ui.invalidate('ui.render')
}

// The narrowest bar (in cells) that still has room for a Compact button beside Auto and Handoff.
const COMPACT_BUTTON_MIN_COLUMNS = 80
/** Compact pressed: on desktop a bar asks for an optional note first; the terminal compacts at once. */
async function openCompact($: EngineInterface, e: { surface: string }) {
  if (e.surface === 'terminal') return compactCold($)
  compactNote = ''
  compactOpenedAt = await $.clock.now()
  await update($, compactAsk, () => true)
}
async function closeHandoffBar($: EngineInterface) {
  await update($, handoffPick, () => null)
  $.ui.invalidate('ui.render')
}

/** Go in the handoff bar: keeps the choice for next time and starts the handoff. */
async function goHandoff($: EngineInterface, choice: HandoffChoice) {
  await $.store.set('handoffChoice', choice).catch(() => undefined)
  await closeHandoffBar($)
  await startHandoff($, choice.kind === 'full', choice.after)
}

/** What the handoff does, by the choice: who writes it, then what follows. */
export function handoffWhat(choice: HandoffChoice, skill: string): { by: string; then: string } {
  const by = choice.kind === 'full' ? (skill ? `/${skill} writes it, slower` : 'A full turn checks git and saves HANDOFF.md, slower') : 'Written from this chat in seconds'
  const then =
    choice.after === 'copy'
      ? 'Copied, the chat stays.'
      : choice.after === 'confirm'
          ? 'Clears the chat, then waits for you.'
          : 'Clears the chat and carries on.'
  return { by, then }
}

/** What the picked way on does once the note is written, as a line under the handoff bar's controls. */
export function handoffAfterNote(after: HandoffAfter): string {
  return after === 'copy'
    ? 'Copies the note. This chat stays as it is.'
    : after === 'confirm'
      ? 'Clears this chat. The new one sums up and waits for you.'
      : 'Clears this chat. The new one starts on the next step right away.'
}

/** What a handoff fork came to, in a few words for /smarttokensaver debug: its reason when it wrote nothing. */
export function forkOutcome(result: unknown, ms: number): string {
  const took = `${(ms / 1000).toFixed(1)}s`
  if (result instanceof Error) return `threw: ${result.message.slice(0, 120)} (${took})`
  const r = result as ModelForkResult | undefined
  if (!r || typeof r !== 'object' || !('isAnswered' in r)) return `threw: ${String(result).slice(0, 120)} (${took})`
  if (r.isAnswered) {
    const u = r.usage
    const input = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    const cached = input ? Math.round((u.cache_read_input_tokens / input) * 100) : 0
    return r.text.trim() ? `answered, ${u.output_tokens} out, ${cached}% cached (${took})` : `answered with blank text (${took})`
  }
  if (r.reason === 'api-error') return `api-error ${r.status ?? 'no response'} ${r.error} (${took})`
  return `${r.reason} (${took})`
}

/** Writes the handoff: quick by a fork with the built-in prompt, full by the person's own skill as a turn. Runs from the timer. */
async function writeHandoff($: EngineInterface) {
  if (!handoffQueued) return
  // Go pressed while a reply is being written: the handoff waits for that turn's end (the timer comes back here), or
  // the reply would be taken for the handoff and the chat cleared under it.
  if (turnBusy()) return
  handoffQueued = false
  try {
    if (handoffFull) {
      // The person's skill, or the built-in full prompt as a turn: either way its reply is the handoff.
      if (config.handoffSkill) {
        handoffTurnSent = true
        handoffSentAt = Date.now()
        await $.command.run({ command: config.handoffSkill, args: '' })
      } else await sendHandoffTurn($, HANDOFF_FULL_PROMPT)
      return
    }
    // A cold cache: a fork would reread the whole chat at full price and write it to the cache again (one handoff took
    // 8% of a person's 5-hour limit). Haiku writes it from the transcript instead, at a fraction of the price.
    if (await chatIsCold($)) {
      const messages = await $.session.messages().catch(() => [])
      const got = messages.length ? await haikuHandoff($, messages).catch(() => null) : null
      await $.store.set('lastFork', { at: Date.now(), outcome: got ? `cold cache: written by ${HAIKU}` : `cold cache: ${HAIKU} failed, forked` }).catch(() => undefined)
      if (got) {
        handoffText = got
        return
      }
    }
    // The built-in handoff is written by a fork: the same model over this chat as it stands, its start read from the
    // prompt cache, no tools and no turn in the chat. Much quicker than a turn that may go exploring first.
    const startedAt = Date.now()
    const forked = await $.model.fork({ prompt: HANDOFF_PROMPT }).catch((error: unknown) => error)
    const outcome = forkOutcome(forked, Date.now() - startedAt)
    // Kept in the store: before a chat's first message the mod's session may start afresh, and its variables with it.
    await $.store.set('lastFork', { at: Date.now(), outcome }).catch(() => undefined)
    const answered = forked as ModelForkResult
    if (answered?.isAnswered && answered.text.trim()) {
      handoffText = answered.text
      return
    }
    // Nothing to fork (no reply yet) or the fork failed: write it as a turn, as before, and say why.
    if (!outcome.startsWith('nothing-to-fork')) $.ui.toast(`${PRODUCT_NAME}: the fork wrote no handoff (${outcome}); writing it as a turn`)
    await sendHandoffTurn($, HANDOFF_PROMPT)
  } catch (error) {
    handoffTurnSent = false
    await update($, handoffStage, () => null)
    $.ui.toast(`${PRODUCT_NAME}: handoff failed: ${(error instanceof Error ? error.message : String(error)).slice(0, 140)}`)
  }
}

/** The last handoff note as it was to be delivered, kept for this load: where neither the chat, the prompt box nor the
 *  clipboard took it, `/smarttokensaver handoff note` shows it. */
let keptHandoff: string | undefined
const KEPT_HANDOFF_HINT = '/smarttokensaver handoff note shows it.'
/** Puts text into the prompt box only where the box is empty and takes it: a draft of the person's is never replaced. */
async function putInEmptyBox($: EngineInterface, text: string): Promise<boolean> {
  const draft = await $.prompt.read().then(r => r.text, () => undefined)
  if (draft === undefined || draft.trim() !== '') return false
  // Appended, not put in its place: a key typed since the read stays.
  return $.prompt.fill({ text, mode: 'append' }).then(r => r.isFilled, () => false)
}
/** Clears the chat and sends the written handoff into it. Runs from the session's timer, when nothing waits on it. */
export async function finishHandoff($: EngineInterface) {
  await writeHandoff($)
  // The handoff's turn was sent and none is running after a good while: it never started (a skill that sends nothing,
  // a prompt held back). Given up, so the next ordinary reply is not taken for the handoff.
  if (handoffTurnSent && handoffText === undefined && !turnBusy() && Date.now() - handoffSentAt > HANDOFF_START_MS && (await read($, handoffStage)) === 'writing') {
    handoffTurnSent = false
    await update($, handoffStage, () => null)
    await update($, handoffCard, () => null).catch(() => undefined)
    $.ui.toast(`${PRODUCT_NAME}: the handoff did not start, nothing was cleared`)
    return
  }
  if (handoffText === undefined || handoffDriving) return
  handoffDriving = true
  const text = handoffText
  handoffText = undefined
  let cleared = false
  try {
    // Written for another chat than the one in front now (a /clear or a new chat while it was being written): that
    // chat is not this handoff's to clear. The note is kept.
    const sidNow = String(await $.session.id().catch(() => ''))
    if (handoffThen !== 'copy' && handoffSid && sidNow && sidNow !== handoffSid) {
      keptHandoff = handoffMessage(text, handoffThen, handoffFull ? config.handoffSkill : undefined)
      await update($, handoffCard, () => null).catch(() => undefined)
      $.ui.toast(`${PRODUCT_NAME}: the chat changed while the handoff was written, so nothing was cleared. ${KEPT_HANDOFF_HINT}`)
      return
    }
    if (handoffThen === 'copy') {
      // The chat stays: the handoff goes to the clipboard, ready to paste into another chat. Should the clipboard
      // refuse, it goes in the prompt box instead, to cut from there.
      const message = handoffMessage(text, 'continue', handoffFull ? config.handoffSkill : undefined)
      keptHandoff = message
      const copied = await $.ui.copy({ text: message }).catch(() => ({ isCopied: false as const }))
      const boxed = copied.isCopied ? false : await putInEmptyBox($, message)
      // Under the reply already there, so the next reply takes it away. Only where the note went somewhere.
      if (copied.isCopied || boxed) keptHandoff = undefined
      if (copied.isCopied || boxed) await setHandoffCard($, 'copied', handoffFull, true)
      else await update($, handoffCard, () => null).catch(() => undefined)
      if (copied.isCopied) $.ui.toast(`${PRODUCT_NAME}: handoff copied. Paste it into a new chat.`)
      else if (boxed) $.ui.toast(`${PRODUCT_NAME}: the clipboard refused, so the handoff is in the prompt box`)
      else $.ui.toast(`${PRODUCT_NAME}: the clipboard refused and the prompt box holds your draft, so the handoff is kept. ${KEPT_HANDOFF_HINT}`)
      return
    }
    await update($, handoffStage, () => 'clearing')
    // Kept before the chat is touched: whatever fails from here on, the note is not lost.
    keptHandoff = handoffMessage(text, handoffThen, handoffFull ? config.handoffSkill : undefined)
    await $.command.run({ command: 'clear', args: '' })
    cleared = true
    // Under the first reply of the cleared chat, gone with the one after it.
    await setHandoffCard($, 'done', handoffFull)
    const sent = await $.prompt.submit({ text: keptHandoff })
    // A plugin above may hold the message back ({ drop }): then the note has not gone in, as with a throw.
    if ((sent as { drop?: unknown } | undefined)?.drop !== undefined) throw new Error('another plugin held the message back')
    keptHandoff = undefined
  } catch (error) {
    await update($, handoffCard, () => null).catch(() => undefined)
    const why = (error instanceof Error ? error.message : String(error)).slice(0, 140)
    if (!cleared) $.ui.toast(`${PRODUCT_NAME}: handoff failed (${why}), nothing was cleared. ${KEPT_HANDOFF_HINT}`)
    else {
      // The chat is cleared and the note did not go in: it is all that is left of the chat, so it goes into the
      // prompt box, else to the clipboard.
      const message = handoffMessage(text, handoffThen, handoffFull ? config.handoffSkill : undefined)
      keptHandoff = message
      const filled = await putInEmptyBox($, message)
      const copied = filled ? false : (await $.ui.copy({ text: message }).catch(() => ({ isCopied: false as const }))).isCopied
      $.ui.toast(`${PRODUCT_NAME}: the handoff could not be sent (${why}). ${filled ? 'It is in the prompt box: send it.' : copied ? 'It is on the clipboard: paste and send it.' : KEPT_HANDOFF_HINT}`)
    }
  } finally {
    handoffDriving = false
    await update($, handoffStage, () => null)
  }
}

/** The user and plugin skills, for the handoff picker in the settings and the setup guide. */
async function loadInstalledSkills($: EngineInterface) {
  // Read here, once, not while drawing: a slow or refused lookup must not cost the panel.
  const installed = await $.command.list().catch(() => [])
  // At most 25, handoff-like ones first: a picker with hundreds of options is more than the slot takes.
  const names = [...new Set(installed.filter(c => c.source === 'user' || c.source === 'plugin').map(c => c.name))]
    .filter(name => !name.startsWith(PLUGIN))
    .sort((a, b) => Number(!/handoff/i.test(a)) - Number(!/handoff/i.test(b)) || a.localeCompare(b))
    .slice(0, 25)
  await update($, installedSkills, () => names)
}

/** A request to open the panel is being taken into the state (see takeOpenRequest): one at a time. */
let openRequestTaking = false
/** Takes a request the store held (asked at `at`) into this chat's state, then clears it from the store. */
async function takeOpenRequest($: EngineInterface, at: number) {
  try {
    if (Date.now() - at < 60_000 && !(await read($, settingsOpen))) await update($, settingsOpen, () => true)
    await $.store.set('openSettingsAt', null)
    $.ui.invalidate('ui.render')
  } finally {
    openRequestTaking = false
  }
}
/** Opens the Smart Token Saver settings panel above the prompt: the app does not let a plugin open its /plugin dialog. */
async function openPluginSettings($: EngineInterface) {
  await loadInstalledSkills($)
  await update($, settingsOpen, () => true)
  // Before a chat's first message the app may start the mod's session afresh for each command, and the state with
  // it: the request also goes to the store, which outlives that, and the next drawing picks it up.
  // The store is shared by every chat, so the request names this one: another chat must not open its panel too.
  await $.store.set('openSettingsAt', { at: Date.now(), session: await $.session.id().catch(() => '') })
  $.ui.invalidate('ui.render')
}

/** The settings rows the panel changes, by field: saved as the plugin's own setting and used at once. */
const SETTING_FIELDS = {
  bias: 'effortBias',
  floor: 'effortFloor',
  ceiling: 'effortCeiling',
  handoffAfter: 'handoffAfter',
  handoffSkill: 'handoffSkill',
  hide: 'hide',
  swampAt: 'swampAt',
  layout: 'layout',
  terminalPlace: 'terminalPlace',
  compactWith: 'compactWith',
  handoffButton: 'handoffButton',
  modelAuto: 'modelAuto',
  helpers: 'helpers',
  theme: 'theme',
  appearance: 'appearance',
  compactWindow: 'compactWindow',
  measureLog: 'measureLog',
  abControl: 'abControl',
} as const

async function saveSetting($: EngineInterface, field: keyof typeof SETTING_FIELDS, value: string) {
  // A new default moves the way back of every raised window with it (retargetRaised).
  if (field === 'compactWindow') {
    // A new size asked for: a read that still shows the old one proves nothing about the hook until a turn has passed.
    wantedChanged()
    const standard = parseWindow(value)
    if (standard !== undefined) {
      const all = retargetRaised(await $.store.get('raisedWindows').catch(() => raisedKept), standard)
      raisedKept = all
      await $.store.set('raisedWindows', Object.keys(all).length ? all : null).catch(() => undefined)
    }
  }
  // The choice is kept in the mod's own store, laid over the plugin options Claude Code passes in. Not through
  // $.config.set: each such write reloads the plugin and leaves an "options changed — reloaded" line in the chat.
  // Every open chat picks the change up from the store within a few seconds (syncKeptSettings).
  const kept = ((await $.store.get('savedSettings').catch(() => null)) ?? {}) as Record<string, string>
  const next = { ...kept, [SETTING_FIELDS[field]]: value }
  const stored = await $.store
    .set('savedSettings', next)
    .then(() => true)
    .catch(() => false)
  if (stored) keptSeen = JSON.stringify(next)
  else $.ui.toast(`${PRODUCT_NAME}: could not save ${field}. It holds for this chat only; change it again to retry.`)
  // Measurement is also kept in one shared place every open chat reads per prompt (syncMeasure).
  if (field === 'measureLog' || field === 'abControl') {
    const measure = { measureLog: field === 'measureLog' ? value : config.measureLog, abControl: field === 'abControl' ? value : String(config.abControl) }
    const shared = await $.store.set('maintainerMeasure', measure).then(() => true, () => false)
    if (!shared) $.ui.toast(`${PRODUCT_NAME}: could not save Measurement for the other open chats. Switch it again, or restart them.`)
  }
  const raw: Record<string, unknown> = {
    effortBias: String(config.bias),
    effortFloor: config.floor,
    effortCeiling: config.ceiling,
    handoffAfter: config.handoffAfter,
    handoffSkill: config.handoffSkill,
    hide: config.hide.join(','),
    swampAt: swampValue(config.swampAt),
    layout: config.layout,
    terminalPlace: config.terminalPlace,
    compactWith: config.compactWith,
    handoffButton: config.handoffButton,
    modelAuto: config.modelAuto,
    helpers: config.helpers,
    theme: config.theme,
    appearance: config.appearance,
    abControl: String(config.abControl),
    measureLog: config.measureLog,
    compactWindow: config.compactWindow === null ? 'default' : String(config.compactWindow),
    [SETTING_FIELDS[field]]: value,
  }
  const appearanceBefore = config.appearance
  config = readConfig(raw)
  applyTheme()
  if (config.appearance !== appearanceBefore) void clearOldScheme($)
  $.ui.invalidate('ui.render')
  return stored
}

/** How long "✓ Saved" shows in the settings' top bar after a change. */
const SAVED_FLASH_MS = 2000
/** Says "✓ Saved" in this chat's settings for a moment. Kept in the store, so it outlives a plugin reload. */
async function flashSaved($: EngineInterface) {
  const at = await $.clock.now().catch(() => Date.now())
  await $.store.set('settingsFlash', { at, session: await $.session.id().catch(() => '') })
  $.ui.invalidate('ui.render')
  $.clock.after(SAVED_FLASH_MS + 50, () => $.ui.invalidate('ui.render'))
}
/** One setting from the panel, saved at once, through the store queue (setupSave). */
async function saveField($: EngineInterface, field: string, value: string) {
  if (!(field in SETTING_FIELDS)) return
  await enqueueSettings($, { [field]: value })
  // "Saved" only for what the store took: a failed write has said so in a toast and stays queued.
  if (await drainSetupSave($)) await flashSaved($)
}
/** One change to the queue in the store at a time: two controls pressed close together each read the queue and wrote
 *  it back whole, and the later write could drop what the other had just added. */
let setupQueueTail: Promise<unknown> = Promise.resolve()
function setupQueueTurn<T>(work: () => Promise<T>): Promise<T> {
  const run = setupQueueTail.then(work, work)
  setupQueueTail = run.then(() => undefined, () => undefined)
  return run
}
/** Adds settings to the queue the drain saves from, beside what waits there. */
async function enqueueSettings($: EngineInterface, changes: Record<string, string>) {
  if (!Object.keys(changes).length) return
  await setupQueueTurn(async () => {
    const queue = ((await $.store.get('setupSave').catch(() => null)) ?? {}) as Record<string, string>
    await $.store.set('setupSave', { ...queue, ...changes })
  })
}

export type SetupStep = 'intro' | 'other' | 'lean' | 'window' | 'windowchat' | 'handoff' | 'look' | 'done'

/** The lean's five stops, cheaper to smarter: a name, and what it does to the judge's pick (see tipped). */
export const LEAN_STOPS = [
  ['Cheapest', 'more prompts get a lower effort'],
  ['Cheaper', 'close calls get a lower effort'],
  ['Balanced', `${HAIKU} decides alone`],
  ['Smarter', 'close calls get a higher effort'],
  ['Smartest', 'more prompts get a higher effort'],
] as const
/** What each stop means, in full, for the setup's line under the question. */
export const LEAN_HELP = [
  `Cheapest: lower than ${HAIKU} would pick. Saves the most; hard tasks get less thought.`,
  `Cheaper: when ${HAIKU} is torn between two efforts, it takes the lower one.`,
  `Balanced (recommended): ${HAIKU} picks per prompt, low for quick ones, high for hard ones.`,
  `Smarter: when ${HAIKU} is torn between two efforts, it takes the higher one.`,
  `Smartest: higher than ${HAIKU} would pick. Costs the most.`,
] as const
/** The setup's first line: what effort is, since the stops only make sense with it. */
export const EFFORT_LINE = 'Effort is how long Claude thinks: low, medium, high, extra high or max. Smart sets it per prompt.'

/** The guide's steps in order: the lean, the compaction window (only where the model's window is bigger than the
 *  recommended one, see windowStepNeeded), the look, then done. Who writes a Full handoff is not asked: the built-in
 *  one is right for nearly everyone, and Settings → Handoff & alerts has it. */
export function setupSteps(withWindow: boolean, withOther = false): SetupStep[] {
  const steps: SetupStep[] = withWindow ? ['lean', 'window', 'look', 'done'] : ['lean', 'look', 'done']
  // A page first that says what the setup is for; then another effortless or Smart Token Saver install beside this one,
  // asked about before the rest (see otherBuilds).
  return ['intro', ...(withOther ? ['other' as const] : []), ...steps]
}

/** The guide's step after this one, or null after the last. */
export function setupNext(step: SetupStep, withWindow = true, withOther = false): SetupStep | null {
  const steps = setupSteps(withWindow, withOther)
  const i = steps.indexOf(step)
  return i < 0 ? 'lean' : (steps[i + 1] ?? null)
}

/** The step Back goes to, or null on the first. */
export function setupBack(step: SetupStep, withWindow = true, withOther = false): SetupStep | null {
  const steps = setupSteps(withWindow, withOther)
  const i = steps.indexOf(step)
  return i <= 0 ? null : (steps[i - 1] ?? null)
}

/** "2/4" for the step shown; the closing step has no number. */
export function setupCounter(step: SetupStep, withWindow = true, withOther = false): string {
  const steps: SetupStep[] = setupSteps(withWindow, withOther).filter(s => s !== 'done' && s !== 'intro')
  const n = steps.indexOf(step) + 1
  return n ? `${n}/${steps.length}` : ''
}

/** The window step shows only where it changes something: the model's own window is bigger than the recommended one. */
export function windowStepNeeded(modelWindow: number | undefined): boolean {
  return (modelWindow ?? 0) > DEFAULT_WINDOW
}
/** Whether this chat's guide has the window step, from the last window read. While the model's window is not known
 *  yet the step stays in (Next before the first read must not skip it); once the guide moves past its first step the
 *  answer is kept, so the counter does not jump when a read lands later. */
let guideWindowFixed: boolean | null = null
const guideHasWindow = () => {
  if (guideWindowFixed !== null) return guideWindowFixed
  const known = windowState?.modelWindow ?? lastContext?.window
  return known ? windowStepNeeded(known) : true
}

/** Where the guide explains each part: the Guide button inside a part opens there. */
const GUIDE_ANCHORS: Record<SettingsCard, string> = { effort: 'settings-effort', model: 'settings-model', context: 'settings-context', handoff: 'settings-handoff', show: 'settings-customize', about: 'settings-about', lab: 'support' }
/** Opens the guide in the browser where the plugin can (macOS); true when it did. */
async function guideInBrowser($: EngineInterface, url = GUIDE_URL): Promise<boolean> {
  const platform = await $.session.info().then(s => s.platform).catch(() => 'unknown')
  return platform === 'macos' ? await $.process.run(['open', url]).then(r => r.exitCode === 0, () => false) : false
}
/** The settings' Guide button: the browser at that part's section, or else the link copied and said in a toast. */
async function openGuide($: EngineInterface, surface: string, url = GUIDE_URL) {
  if (await guideInBrowser($, url)) return
  const r = await $.ui.copy({ text: url, surface: surface as never }).catch(() => ({ isCopied: false as const }))
  $.ui.toast(r.isCopied ? `Guide link copied: ${url}` : `Guide: ${url}`)
}
/** Shows a step of the guide; the handoff step needs the installed skills to pick from. */
async function goSetup($: EngineInterface, step: SetupStep | null) {
  if (step === 'handoff') await loadInstalledSkills($)
  // Past the first step the guide counts as seen (upstream's judge pick did this): it does not open by itself again.
  const from = await read($, setupStep)
  if (step === null) guideWindowFixed = null
  else if (from !== null && from !== step && guideWindowFixed === null) guideWindowFixed = guideHasWindow()
  const order = setupSteps(true, true)
  if (step !== null && from !== null && from !== 'other' && from !== 'intro' && order.indexOf(step) > order.indexOf(from)) await markSetupDone($)
  // The chat that moves through the guide owns it: every other open chat closes its own copy (see syncSharedSetup).
  if (step !== null && from !== null && from !== step) await $.store.set('setupSession', await $.session.id().catch(() => '')).catch(() => undefined)
  await update($, setupStep, () => step)
}

/**
 * The guide and the "other build" question open in every chat that was open when the plugin loaded. Once one chat
 * answers them, the others follow: the guide closes where another chat owns it and it counts as done, and a build kept
 * or removed elsewhere is not asked about again. Read from the store at most every few seconds.
 */
let sharedSetupAt = 0
async function syncSharedSetup($: EngineInterface) {
  const now = await $.clock.now().catch(() => Date.now())
  if (now - sharedSetupAt < 3000) return
  sharedSetupAt = now
  const step = await read($, setupStep)
  if (!step && !otherFound) return
  const [done, owner, kept, me] = await Promise.all([
    $.store.get('setupDone').catch(() => null),
    $.store.get('setupSession').catch(() => null),
    $.store.get('otherBuildsKept').catch(() => null),
    $.session.id().catch(() => ''),
  ])
  // A drawing may not write state: the change goes through the clock, as an event of its own, and the redraw after it.
  const later = (fn: () => Promise<unknown>) => $.clock.after(0, async () => { await fn().catch(() => undefined); $.ui.invalidate('ui.render') })
  if (otherFound && Array.isArray(kept) && kept.map(String).includes(otherFound.id)) {
    otherFound = null
    if (step === 'other') later(() => update($, setupStep, () => 'lean'))
    else $.ui.invalidate('ui.render')
  }
  if (step && done === true && typeof owner === 'string' && owner && owner !== me) {
    // Nothing of this chat's draft is saved: the other chat's answers are the ones that count.
    later(async () => {
      await update($, setupDraft, () => ({}))
      await update($, setupStep, () => null)
      await update($, setupPending, () => false)
    })
  }
}

/** The guide's choices over the saved settings: what each step shows. */
export function setupShown(draft: SettingsDraft, saved: JudgeConfig) {
  const window = draft.compactWindow !== undefined ? parseWindow(draft.compactWindow) : saved.compactWindow
  return {
    compactWindow: window === undefined ? saved.compactWindow : window,
    bias: draft.bias !== undefined ? Number(draft.bias) : saved.bias,
    handoffSkill: draft.handoffSkill ?? saved.handoffSkill,
    hide: (draft.hide ?? saved.hide.join(',')).split(',').filter(Boolean) as Hideable[],
    appearance: (draft.appearance ?? saved.appearance) as JudgeConfig['appearance'],
  }
}

/** Saves what the guide changed, only the fields that differ, then empties its draft. */
async function flushSetup($: EngineInterface) {
  const draft = await read($, setupDraft)
  await update($, setupDraft, () => ({}))
  const saved: Record<string, string> = {
    bias: String(config.bias),
    handoffSkill: config.handoffSkill,
    hide: config.hide.join(','),
    appearance: config.appearance,
    compactWindow: config.compactWindow === null ? 'default' : String(config.compactWindow),
  }
  const changes: Record<string, string> = {}
  for (const field of ['hide', 'bias', 'handoffSkill', 'appearance', 'compactWindow'] as const) {
    const value = draft[field]
    if (value !== undefined && value.trim() !== saved[field]) changes[field] = value.trim()
  }
  await enqueueSettings($, changes)
  await drainSetupSave($)
}

let drainingSetup = false
/** A save was asked for while the drain ran: it looks at the queue once more before it ends. */
let drainAgain = false

/**
 * Saves the queued settings one at a time from the store. A field leaves the store once it is saved, and only if the
 * queue still holds the value that was saved: a plugin reload in between (an update, /reload-plugins) cuts nothing
 * off, the reloaded plugin carries on with what is left, and a newer value for the same field is saved in its turn.
 */
async function drainSetupSave($: EngineInterface): Promise<boolean> {
  if (drainingSetup) {
    drainAgain = true
    return true
  }
  drainingSetup = true
  try {
    for (;;) {
      const queue = ((await $.store.get('setupSave').catch(() => null)) ?? {}) as Record<string, string>
      const [field] = Object.keys(queue)
      if (!field) {
        if (!drainAgain) return true
        drainAgain = false
        continue
      }
      const value = queue[field]
      // Not stored: the field stays in the queue, and the next save (or the next chat's start) tries it again.
      if (field in SETTING_FIELDS && !(await saveSetting($, field as keyof typeof SETTING_FIELDS, value))) return false
      await setupQueueTurn(async () => {
        const now = ((await $.store.get('setupSave').catch(() => null)) ?? {}) as Record<string, string>
        if (now[field] !== value) return
        const { [field]: _saved, ...rest } = now
        await $.store.set('setupSave', Object.keys(rest).length ? rest : null)
      })
    }
  } finally {
    drainingSetup = false
    drainAgain = false
  }
}

/** The guide was gone through or closed: it does not open by itself again, and the footer shows ⚙. */
async function markSetupDone($: EngineInterface) {
  await Promise.all([update($, setupPending, () => false), $.store.set('setupDone', true)])
  void applyMaintainerDefaults($).catch(() => undefined)
}

/** Own… on the window step: the field shows (kept out of state: a redraw per key would move the cursor). */
let setupOwnOpen = false

/** Finish on the last choice: saves what was picked and shows the done step, which says what is now in force. */
async function completeSetup($: EngineInterface) {
  await markSetupDone($)
  setupOwnOpen = false
  const offer = await setupWindowOffer($)
  await goSetup($, 'done')
  if (offer !== undefined && offer !== setupApplied) {
    if (windowViaFile()) {
      const saved = await saveDefaultToFile($, offer)
      defaultFileFailed = !saved.ok
      $.ui.toast(saved.text)
    } else {
      await noteAutocompactHanded($, offer)
      $.ui.toast(sendHint(offer))
    }
  }
  await flushSetup($)
}

/** The window to offer through /autocompact at the setup's end: the one picked, where it must go that way and is not
 *  already in use; undefined when there is nothing to offer. */
async function setupWindowOffer($: EngineInterface): Promise<number | null | undefined> {
  const s = windowState
  if (!s || !windowViaCommand()) return undefined
  const draft = (await read($, setupDraft)) as Record<string, string | undefined>
  const picked = draft.compactWindow !== undefined ? parseWindow(draft.compactWindow) : config.compactWindow
  if (picked === undefined) return undefined
  if (picked === null) return s.modelValue !== undefined ? null : undefined
  return s.raw === picked ? undefined : picked
}

/** The ✕: closes the guide; what was picked so far is kept. It does not open by itself in a new chat again; this chat's
 *  footer still offers Setup until the guide is gone through (and /smarttokensaver setup always brings it back). */
async function closeSetup($: EngineInterface) {
  await $.store.set('setupDone', true).catch(() => undefined)
  void applyMaintainerDefaults($).catch(() => undefined)
  await goSetup($, null)
  await flushSetup($)
}

/** 1234 -> "1.2k", 87 -> "87". */
function tokens(n: number): string {
  const v = Math.abs(n)
  const text = v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
  return n < 0 ? `-${text}` : text
}

const share = (part: number, whole: number) => `${Math.round((part / whole) * 100)} %`

/**
 * What /smarttokensaver stats answers: what the prompts Auto steered cost, measured, split by kind and by effort,
 * and what the judge took. No "saved" figure: what a prompt would have cost at another effort is not known,
 * since effort mostly changes how many tool calls it makes. Cost is in tokens weighted as priced (WEIGHT).
 */
export function savedText(raw: Spent): string {
  const t = asSpent(raw)
  const judged = t.judge.haiku
  const helperRuns = EFFORTS.reduce((n, e) => n + (t.helpers.runs[e] ?? 0), 0)
  if (t.prompts === 0 && judged === 0 && t.moved === 0 && helperRuns === 0) return 'nothing measured yet'
  const input = t.input * WEIGHT.input
  const write = t.writeCost
  const cached = t.read * WEIGHT.read
  const out = t.out * WEIGHT.out
  const total = input + write + cached + out
  const lines = [
    `${t.prompts} prompts, ${t.requests} requests, cost about ${tokens(Math.round(total))} tokens weighted by price` +
      (total > 0 ? ` (cache reads ${share(cached, total)}, cache writes ${share(write, total)}, output ${share(out, total)})` : ''),
  ]
  const per = EFFORTS.filter(e => t.byEffort[e]?.prompts).map(e => {
    const b = t.byEffort[e]!
    return `${EFFORT_LABELS[e]} ${b.prompts}, average ${tokens(Math.round(b.cost / b.prompts))}`
  })
  if (per.length) lines.push(`Per prompt: ${per.join('; ')}`)
  if (t.moved) {
    lines.push(`Cheaper model: ${t.moved} prompt${t.moved === 1 ? '' : 's'} moved down, ${t.redone} redone (${share(t.redone, t.moved)})`)
  }
  if (helperRuns) {
    const per = EFFORTS.filter(e => t.helpers.runs[e]).map(e => `${EFFORT_LABELS[e]} ${t.helpers.runs[e]}`)
    lines.push(`Helpers: ${helperRuns} subagent${helperRuns === 1 ? '' : 's'} (${per.join(', ')}), ${t.helpers.requests} requests, cost about ${tokens(Math.round(t.helpers.cost))} tokens`)
  }
  if (judged) {
    lines.push(`Judge: ${HAIKU} ${t.judge.haiku}, average ${Math.round(t.judge.ms / judged)} ms, ${tokens(t.judge.tokens)} tokens in all`)
  }
  return lines.join('\n')
}

/** You picked an effort (terminal rows): Auto for effort goes off and the requests follow; Enter on /effort moves the app. */
async function pickEffort($: EngineInterface, level: Effort) {
  const t0 = Date.now()
  const inUse = (await read($, model)) ?? (await sessionModel($))
  const t1 = Date.now()
  // Together, so the app redraws once for the click and not once per write.
  await Promise.all([
    update($, isAuto, () => false),
    $.store.set('isAuto', false),
    choose($, { model: inUse, effort: level, why: 'your pick', by: 'manual' }),
  ])
  const t2 = Date.now()
  await typeCommand($, `/effort ${level}`)
  const t3 = Date.now()
  void proof($, `click ${level}: ${t3 - t0} ms (read ${t1 - t0}, state ${t2 - t1}, typed command ${t3 - t2})`)
}

async function toggleAutoEffort($: EngineInterface) {
  const turnOn = !(await read($, isAuto))
  await update($, isAuto, () => turnOn)
  await $.store.set('isAuto', turnOn)
}

async function choose($: EngineInterface, next: Pick | null) {
  pickCarried = false
  const before = await read($, pick)
  await Promise.all([update($, pick, () => next), $.store.set('pick', next)])
  // A change Auto made is shown as "Low → High" for a moment, so the switch is seen.
  if (next && next.by !== 'manual' && before && !withoutEffort(before.model) && before.effort !== next.effort) {
    const change = { from: before.effort, to: next.effort }
    await update($, switched, () => change)
    $.clock.after(SWITCHED_MS, () => void update($, switched, () => null).catch(() => undefined))
  }
}

/** Everything a redraw needs, read together: the reads go out at once instead of one after the other. */
// The context figures from the last usage check, for the cache tooltip.
let lastContext: { tokens: number; window: number; percent: number } | null = null

/** "347k / 400k": the chat's tokens over the window Claude Code reports for this chat ("default" when it is its own). */
function windowFill(tokensNow: number): string {
  const s = withLearned(windowState, learnedTrigger)
  const win = s?.raw || lastContext?.window || 0
  const k = (n: number) => `${Math.round(n / 1000)}k`
  return win ? `${k(tokensNow)} / ${windowLabel(win)}${s?.source === 'default' ? ' default' : ''}` : k(tokensNow)
}
/** Why a swamped chat matters, in the swamp band: the whole sentence where it fits, the short form in less room. */
const SWAMP_WHY = 'every message rereads the whole chat'
const SWAMP_WHY_SHORT = 'every message rereads it all'
/** "auto-compacts at 267k": the point where Claude Code compacts by itself, 33k under the window. Named as a point,
 * beside the fill it is read against: what is left alone ("68k to compaction" beside "299k / 400k") read as a
 * mistake, since the figure before it counts against the window. With room (`full`), what is left to that point
 * follows it. */
function untilCompaction(tokensNow: number, full = false): string {
  const trigger = limits().trigger
  if (trigger === null) return ''
  if (tokensNow >= trigger) return full ? 'auto-compacts with the next message' : 'compacts next'
  const at = `auto-compacts at ${windowLabel(trigger)}`
  return full ? `${at}, ${Math.max(1, Math.round((trigger - tokensNow) / 1000))}k left until then` : at
}

/**
 * How full the chat is, the way Claude Code's /context counts it: tokens over the window in force, as Claude Code itself
 * reports it (rawMaxTokens), never a size only asked for. "366k / 400k (92%)"; "1M default" when nothing sets the window.
 */
function windowShare(): { percent: number; text: string } {
  const tokensNow = lastContext?.tokens ?? 0
  const s = withLearned(windowState, learnedTrigger)
  const win = s?.raw || lastContext?.window || 0
  if (!win) return { percent: lastContext?.percent ?? 0, text: `${Math.round(lastContext?.percent ?? 0)}%` }
  const percent = Math.min(100, (tokensNow / win) * 100)
  const isDefault = s ? s.source === 'default' : false
  return { percent, text: `${Math.round(tokensNow / 1000)}k / ${windowLabel(win)}${isDefault ? ' default' : ''} (${Math.round(percent)}%)` }
}

/** The lab's (Measurement's) colour when on. */
const LAB_ON_COLOR = BRAND_ORANGE
/** A small ring filled to `percent`, for the context in the swamp band. */
export function ringSvg(percent: number, color: string): string {
  const p = Math.max(0, Math.min(100, percent))
  const c = 2 * Math.PI * 6
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-opacity=".25" stroke-width="2.2"/><circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></svg>`
}

/** The dashboard's settings icon: an outlined cog of eight teeth, drawn rather than a glyph, since the gear character
 * is a different shape in every font. */
export function settingsSvg(color: string): string {
  const step = (2 * Math.PI) / 8
  const pts: string[] = []
  for (let i = 0; i < 8; i++) {
    const a = i * step
    const at = (f: number, r: number) => `${(7 + r * Math.cos(a + f * step)).toFixed(2)},${(7 + r * Math.sin(a + f * step)).toFixed(2)}`
    pts.push(at(-0.42, 4.6), at(-0.27, 4.6), at(-0.2, 6.1), at(0.2, 6.1), at(0.27, 4.6), at(0.42, 4.6))
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><g fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round" shape-rendering="geometricPrecision"><path d="M${pts.join('L')}Z"/><circle cx="7" cy="7" r="2"/></g></svg>`
}

/** The settings rows' icons, drawn in the cog's outline style (14 px, 1.3 stroke) rather than font glyphs, which
 * differ per font. */
export function rowIconSvg(kind: 'effort' | 'model' | 'context' | 'handoff' | 'reduce' | 'show' | 'about' | 'lab' | 'guide' | 'quick' | 'full', color: string): string {
  const shapes = {
    // A gauge: an open arc with a needle.
    effort: '<path d="M2.6 10.4A5 5 0 1 1 11.4 10.4"/><path d="M7 8.2L9.6 5.2"/><circle cx="7" cy="8.6" r=".9"/>',
    // Layers: the models, stacked.
    model: '<path d="M7 2 12.2 4.7 7 7.4 1.8 4.7Z"/><path d="M1.8 7.3 7 10 12.2 7.3"/><path d="M1.8 9.9 7 12.6 12.2 9.9"/>',
    // A box with a line across near its top: the window, and where it compacts.
    context: '<rect x="2" y="2" width="10" height="10" rx="1.5"/><path d="M2 5.2H12"/><path d="M4.4 8H9.6"/>',
    // An i in a circle: about.
    about: '<circle cx="7" cy="7" r="5.2"/><path d="M7 6.2V9.8"/><path d="M7 4.3V4.4"/>',
    // A flask: the lab.
    lab: '<path d="M5.4 1.8H8.6M5.9 1.8V5.6L2.4 11.2A.9.9 0 0 0 3.2 12.4H10.8A.9.9 0 0 0 11.6 11.2L8.1 5.6V1.8"/><path d="M3.9 9H10.1"/>',
    // Two arrows meeting at a line: reduce the context (compact, or hand off from there).
    reduce: '<path d="M7 2.2V11.8"/><path d="M1.4 7H5.2M3.4 5.2 5.2 7 3.4 8.8"/><path d="M12.6 7H8.8M10.6 5.2 8.8 7 10.6 8.8"/>',
    // An arrow into a bar: hand off.
    handoff: '<path d="M1.8 7H9.4M6.6 4.2L9.4 7L6.6 9.8"/><path d="M11.8 2.6V11.4"/>',
    // A pencil: customize. The tip down left, a line across the ferrule.
    show: '<path d="M9.6 2.1 11.9 4.4 4.9 11.4 2.1 11.9 2.6 9.1Z"/><path d="M8.1 3.6 10.4 5.9"/>',
    // An open book: the guide.
    guide: '<path d="M7 3.6C5.8 2.8 4 2.4 2 2.6V10.8C4 10.6 5.8 11 7 11.8 8.2 11 10 10.6 12 10.8V2.6C10 2.4 8.2 2.8 7 3.6Z"/><path d="M7 3.6V11.8"/>',
    // Quick and Full are drawn solid below: an outline at 14 px was too thin to read.
    quick: '',
    full: '',
  }[kind]
  if (kind === 'quick' || kind === 'full') {
    const solid = kind === 'quick'
      // A bolt: the quick handoff, done in seconds.
      ? 'M8.6 1 2.8 8.2H6.6L5.4 13 11.2 5.8H7.4Z'
      // A pen: the full handoff, written out by your skill.
      : 'M10.2 1.5 12.5 3.8 5.3 11 2.3 11.7 3 8.7ZM9 2.7 11.3 5'
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path d="${solid}" fill="${color}" stroke="${color}" stroke-width="0.6" stroke-linejoin="round"/></svg>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><g fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">${shapes}</g></svg>`
}

/** A band's entrance: a soft violet wash that fades and a light sweep passing left to right, once, as the band
 * appears. The app has no transitions for a band (its tree is swapped at once), but a plain Svg's CSS animation starts
 * when the image is first drawn and is not restarted by a redraw with the same source. Stretched to the band
 * (preserveAspectRatio none: the app scales a Svg down to its box's width but keeps its height), behind the content. */
export const INTRO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="240" viewBox="0 0 1600 240" preserveAspectRatio="none"><style>.w{opacity:0;animation:w .7s ease-out}.s{opacity:0;animation:s 1.1s cubic-bezier(.2,.7,.2,1)}@keyframes w{from{opacity:.16}to{opacity:0}}@keyframes s{from{transform:translateX(-520px);opacity:1}80%{opacity:1}to{transform:translateX(1700px);opacity:0}}</style><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#b9a7ff" stop-opacity=".16"/><stop offset=".7" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect class="w" width="1600" height="240" fill="#8b6cff"/><rect class="s" width="480" height="240" fill="url(#g)"/></svg>`

/** k/M for token counts: 420000 -> "420k", 1000000 -> "1.0M". */
function kTokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

async function snap($: EngineInterface) {
  const [auto, autoModel, current, judging, wanted, shownByApp, modelNow, switchedNow, pausedNow, cacheNow, compacting] = await Promise.all([
    read($, isAuto),
    read($, isAutoModel),
    read($, pick),
    read($, isJudging),
    read($, suggestion),
    read($, appEffort),
    read($, model),
    read($, switched),
    read($, paused),
    read($, cacheLeft),
    read($, isCompacting),
  ])
  return { auto, autoModel, current, judging, wanted, shownByApp, modelNow, switchedNow, pausedNow, cacheNow, compacting }
}
type Snap = Awaited<ReturnType<typeof snap>>

/** The hover cards' text: what Auto did and why, and what the cache countdown means for the next message. Short plain
 *  words: the tip is one line over the dashboard's detail row. */
export function hoverTips(v: Snap): { effort: string; cache: string } {
  const effortTip = !v.auto
    ? 'Default: the effort stays where you set it in the app. ⏻ turns Smart on.'
    : v.pausedNow
      ? 'Smart waits on this model. Changing effort here would make it reread the whole chat.'
      : !effortOf(v, v.modelNow ?? 'sonnet')
        ? 'This model has no effort setting, so Smart leaves it alone.'
      : [
          v.current ? `${v.current.by === 'manual' || v.current.by === 'named' ? 'You picked' : `${HAIKU} picked`} ${EFFORT_LABELS[v.current.effort]}` : 'Haiku picks the effort for each message',
          v.current?.why ? `because: ${v.current.why}` : '',
          `Lean ${BIAS_WORDS[config.bias + 2]}, ${config.floor} to ${config.ceiling}`,
        ]
          .filter(Boolean)
          .join('. ')
  const limit = limits()
  const ctx = lastContext && lastContext.window
    ? limit.trigger === null
      ? ` Chat: ${kTokens(lastContext.tokens)}. Auto-compact is off.`
      : ` Chat: ${kTokens(lastContext.tokens)} of ${kTokens(limit.trigger)} before it compacts.${chatOverride !== null ? ` ${chatWindowWords(chatOverride, chatWindowState(chatOverride, windowState, chatWindowChecked), windowState).bar}.` : ''}`
    : ''
  const cacheTip =
    v.cacheNow === 0
      ? `Cache is cold. The next message rereads the whole chat at full price, so compact or hand off first.${ctx}`
      : `Cache is warm for ${cacheLabel(v.cacheNow ?? 0)}. The next message reads the chat cheaply from cache.${ctx}`
  return { effort: effortTip, cache: cacheTip }
}

/** The effort to show: the pick where it is what goes out (yours, or the judge's while Smart is on), else what the
 *  app itself runs with: with Smart off a pick the judge made earlier steers nothing. None on a Haiku before 5.5. */
function effortOf(v: Snap, inUse: ModelKey): Effort | undefined {
  if (withoutEffort(inUse)) return undefined
  if (v.current && (v.auto || v.current.by === 'manual')) return v.current.effort
  return EFFORTS.includes(v.shownByApp as Effort) ? (v.shownByApp as Effort) : undefined
}

// For /smarttokensaver debug: how often the app asked for the band, when, and the last error drawing it.
// /smarttokensaver probe N: 1 a bare box, 2 the panel's frame and header only, 3 the panel without pickers or fields.
let probeLevel = 0
let renderCalls = 0
let lastRenderProps = ''
let lastRenderBranch = ''
// Whether the last panel above the prompt got its shell (ground, wash, top bar, lift), and from what.
let lastShell = ''
// Every time the app asked for the band, with what it sent, written to ~/.claude/smarttokensaver/render-<chat>.log each second
// (the last 300): how often the band is really redrawn in the app, which the render rig cannot see (hover flicker).
// Debug only: written where the proof log is (SMARTTOKENSAVER_LOG set, or loaded from a dev-mods folder), never otherwise.
const renderLog: string[] = []
let renderLogWritten = 0
async function writeRenderLog($: EngineInterface) {
  if (renderLog.length > 600) renderLog.splice(0, renderLog.length - 300)
  if (renderLog.length === renderLogWritten) return
  renderLogWritten = renderLog.length
  if (!(await proofPath($).catch(() => undefined))) return
  const home = (await envUserProfile($)) ?? (await envHome($))
  // One file per chat: a shared file was overwritten whole by whichever chat drew last.
  if (home) await $.fs.write(`${home}/${DATA_DIR}/render-${loadedSession}.log`, renderLog.slice(-300).join('\n') + '\n').catch(() => undefined)
}
let lastRenderAt = 0
let loadedSession = '-'
// When this module loaded, for the render log's "first draw" line.
let loadedAt = Date.now()
let firstDrawLogged = false
let drawsTimed = 0
let lastRenderError = ''
let sessionStarted = 0
// When the app's SessionStart came and what it said, for /smarttokensaver debug: a cold band that shows late is either a
// late signal or a redraw the app did not take.
let classicStart: { at: number; said: string } | null = null
// /smarttokensaver cold shows the band whatever the chat's size, until the next response (a test of the band itself).
let coldForced = false
let handoffTimer: { cancel: () => void } | undefined
const HANDOFF_POLL_MS = 1000
// The model this prompt's requests run on when the judge picked a cheaper one than the chat's, else null. The chat's
// own model stays as it is: each request is sent to the cheaper model in turn.step, so the chat model's cache stays warm
// for the next prompt that needs it.
let routed: ModelKey | null = null
// Prompts left that stay on the chat's model, after a cheaper answer was redone.
let stayUp = 0
const MODEL_RANK: ModelKey[] = ['haiku', 'sonnet', 'opus', 'fable']
/** The model a verdict sends this prompt to: a cheaper one than the chat's, or null for the chat's own. Never Fable. */
export function routeTo(verdict: ModelKey, inUse: ModelKey): ModelKey | null {
  if (verdict === 'fable') return null
  return MODEL_RANK.indexOf(verdict) < MODEL_RANK.indexOf(inUse) ? verdict : null
}

// What one input token costs on each model, in Sonnet's price: Opus about 2x (measured: the same prompt cost 1.97x on Opus), Haiku about a third. These are the ratios
// the savings estimate uses; they only have to be right enough to tell which side of a switch is cheaper.
export const MODEL_PRICE: Record<ModelKey, number> = { haiku: 1 / 3, sonnet: 1, opus: 2, fable: 5 }
/**
 * Whether sending this one prompt to a cheaper model pays. The chat's context is read from the cache (a tenth of the input
 * price) where that model's cache is warm, and written to it (1.25 times) where it is cold. A switch to a cold model
 * writes the whole context first, which can cost more than staying on the chat's own warm one at a low effort.
 */
export function routeWorth(to: ModelKey, inUse: ModelKey, contextTokens: number, warm: { to: boolean; inUse: boolean }): boolean {
  if (!(contextTokens > 0)) return true
  // Claude Code writes the 1-hour cache, which costs twice the input price (measured), not the 5-minute 1.25.
  const write = 2
  const stay = contextTokens * MODEL_PRICE[inUse] * (warm.inUse ? WEIGHT.read : write)
  const move = contextTokens * MODEL_PRICE[to] * (warm.to ? WEIGHT.read : write)
  return move < stay
}
// Until when each model's prompt cache is warm for this chat: set by every main response on it.
const warmUntil: Partial<Record<ModelKey, number>> = {}
// On the mod's clock, the same one the cache countdown runs on.
// The cache lifetime last seen per model: a reply that writes a short 5-minute tail still reads the rest from the
// 1-hour cache, and that read keeps the hour going, so a 5m reading never pulls a 1h model down (as cacheTouched does).
const warmTtl: Partial<Record<ModelKey, keyof typeof CACHE_TTL>> = {}
export function nextWarmTtl(prior: keyof typeof CACHE_TTL | undefined, usage: unknown): keyof typeof CACHE_TTL {
  const seen = cacheTtlOf(usage)
  if (prior === '1h' && mostlyCached(usage) && seen !== '1h') return '1h'
  return seen ?? prior ?? '5m'
}
function markWarm(modelId: string, usage: unknown, now: number) {
  const key = keyOf(modelId)
  if (!key) return
  const ttl = nextWarmTtl(warmTtl[key], usage)
  warmTtl[key] = ttl
  warmUntil[key] = Math.max(warmUntil[key] ?? 0, now + CACHE_TTL[ttl])
}
const isWarm = (key: ModelKey, now: number) => (warmUntil[key] ?? 0) > now

// When Haiku last wrote a compaction (for /smarttokensaver debug).
let lastHaikuCompact = 0

// The moving art's timer: one at a time, blitting the next frame to the band that drew it. A blit the surface refuses
// (the band went away, another drew instead) ends it, so nothing has to stop it from outside.
let artTimer: { cancel(): void } | null = null
let artShown: { requestId: string; kind: ArtKind } | null = null
let artFrameCount = 0

/** A band's art on the terminal: a Raster on the right, moving for alert kinds; null where it has no room. */
function bandArt($: EngineInterface, e: RenderInput<'AbovePrompt'>, kind: ArtKind) {
  const els = themedEls($.ui.resolve(e), e.surface)
  const columns = typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : 0
  if (e.surface !== 'terminal' || !('Raster' in els) || columns < ART_MIN_WIDTH) return null
  // The still sparkles (the resting dashboard, the guide) are 16 by 4 pixels: in a terminal they read as noise, not
  // art. Only the art that says something stays: the alerts, compacting and the done tick.
  if (kind === 'calm' || kind === 'brand') return null
  const { Box, Raster } = els
  artShown = { requestId: e.requestId, kind }
  if (MOVING.has(kind) && !artTimer) {
    artTimer = $.clock.every(ART_FRAME_MS, () => {
      const shown = artShown
      if (!shown || !MOVING.has(shown.kind)) {
        artTimer?.cancel()
        artTimer = null
        return
      }
      artFrameCount++
      void $.ui
        .blit({ requestId: shown.requestId, key: 'art', cells: artFrame(shown.kind, artFrameCount) })
        .then(r => {
          if ('deny' in r && r.deny) {
            artTimer?.cancel()
            artTimer = null
          }
        })
        .catch(() => undefined)
    })
  }
  return (
    <Box key="art-box" flexShrink={0}>
      <Raster key="art" columns={ART_COLUMNS} rows={ART_ROWS} cells={artFrame(kind, artFrameCount)} />
    </Box>
  )
}

/** A bar on the terminal (setup, handoff): the title and words on the left with the brand's still art beside them,
 * the controls on a row of their own that wraps, so nothing is cut at 80 columns. */
function terminalPanel($: EngineInterface, e: RenderInput<'AbovePrompt'>, key: string, title: string, words: unknown, controls: unknown[]) {
  const { Box, Text } = themedEls($.ui.resolve(e), e.surface)
  return (
    <Box key={key} flexDirection="column" paddingX={1} backgroundColor={BRAND_BG} borderStyle="round" borderColor={BRAND_EDGE}>
      <Box flexDirection="row" gap={1} alignItems="center">
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color={ACCENT} bold wrap="truncate">{title}</Text>
          {typeof words === 'string' ? <Text key={`${key}-what`} dimColor wrap="truncate">{words}</Text> : words}
        </Box>
        {bandArt($, e, 'brand')}
      </Box>
      <Box key={`${key}-actions`} flexDirection="row" flexWrap="wrap" justifyContent="flex-end" columnGap={1} alignItems="center">
        {controls}
      </Box>
    </Box>
  )
}

type TerminalBand = { key: string; kind: ArtKind; color: string; bg: string; edge: string; title: string; detail: string; buttons: unknown[]; autoInBar?: boolean; word?: { text: string; color: string; rest: string } }

/** An alert band on the terminal: title and buttons, the detail on a line of its own, art on the right, and the effort
 * row under it, so effort stays in sight while a band shows. */
async function terminalBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, b: TerminalBand) {
  const { Box, Text } = themedEls($.ui.resolve(e), e.surface)
  const { rows } = await effortRows($, e, { auto: !b.autoInBar })
  return (
    <Box key={`${b.key}-col`} flexDirection="column">
      <Box key={b.key} flexDirection="row" gap={1} alignItems="center" paddingX={1} backgroundColor={b.bg} borderStyle="round" borderColor={b.edge}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Box flexShrink={0}>
              {b.word ? (
                <Box flexDirection="row">
                  <Text color={b.color} bold>{'✦ '}</Text>
                  <Text key={`${b.key}-word`} color={b.word.color} bold>{b.word.text}</Text>
                  <Text color={b.color} bold>{b.word.rest}</Text>
                </Box>
              ) : (
                <Text color={b.color} bold>{`✦ ${b.title}`}</Text>
              )}
            </Box>
            <Box flexGrow={1} />
            {b.buttons}
          </Box>
          <Text dimColor wrap="truncate">{b.detail}</Text>
        </Box>
        {bandArt($, e, b.kind)}
      </Box>
      {rows}
    </Box>
  )
}

/** The dashboard's two lines: the effort with the cache and the context, then the judge's reason and the last reply. */
export function dashboardLines(d: {
  /** The chat's model as the texts name it ("Opus 5.5"); said while Smart is off. */
  modelName?: string
  auto: boolean
  paused: boolean
  judging: boolean
  effort: Effort | undefined
  cacheNow: number | null
  contextPercent: number | null
  reason: string
  last: { cost: number; ms: number } | null
}): { head: string; what: string; rest: string; detail: string } {
  const level = d.effort ? EFFORT_LABELS[d.effort] : 'Smart'
  // Auto on or off is the button's to say (and the terminal's effort row's), not the text's. Off, the bar says what the
  // chat runs on, as the app's footer does: "Opus 5.5 · Medium" (the switch beside it already says Default).
  const resting = d.modelName ? (d.effort ? `${d.modelName} · ${EFFORT_LABELS[d.effort]}` : d.modelName) : d.effort ? EFFORT_LABELS[d.effort] : 'Default'
  const what = d.judging ? 'Deciding…' : !d.auto ? resting : d.paused ? `${level} · Smart paused` : level
  const head = [
    `✦ ${what}`,
    d.cacheNow === null ? null : `cache ${cacheLabel(d.cacheNow)}`,
    d.contextPercent === null ? null : `${Math.round(d.contextPercent)}% context`,
  ]
  const last = d.last ? `last reply ≈${tokens(Math.round(d.last.cost))} tokens · ${Math.max(1, Math.round(d.last.ms / 1000))}s` : null
  const shown = head.filter(Boolean) as string[]
  return {
    head: shown.join(' · '),
    what,
    rest: shown.slice(1).map(part => ` · ${part}`).join(''),
    detail: [d.reason, last].filter(Boolean).join(' · '),
  }
}

/** How long the effort word glows after it changes: held at full colour, then faded out; and the step of the fade. */
const FLASH_HOLD_MS = 1000
const FLASH_MS = 1800
/** The fade's steps, [ms, share of the way to white]: five, so it reads as a fade without a tick. Each step is a redraw,
 * and every redraw rebuilds the band (images restart, buttons under a pointer are swapped), so keep them few. */
const FLASH_STEPS: readonly (readonly [number, number])[] = [[1000, 0.15], [1160, 0.35], [1320, 0.55], [1480, 0.75], [1640, 0.9]]
/** The glow: a stronger violet than the accent, so a switch is seen at a glance. */
let FLASH_COLOR = '#9b7bff'
/** The effort word's colour `ms` after it changed: the glow, held, then easing out to the band's white. */
export function flashColor(ms: number | null): string {
  if (ms === null || ms >= FLASH_MS) return DASH_TEXT
  if (ms < FLASH_HOLD_MS) return FLASH_COLOR
  const k = [...FLASH_STEPS].reverse().find(([at]) => ms >= at)?.[1] ?? 0
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map(i => Math.round(ch(FLASH_COLOR, i) + (ch(DASH_TEXT, i) - ch(FLASH_COLOR, i)) * k).toString(16).padStart(2, '0')).join('')}`
}
// The word the dashboard last showed and when it last changed, so a new effort glows and fades. Not while the judge
// decides: the word it lands on is compared with the one before.
let flashWord: string | null = null
let flashAt: number | null = null
/** Whether Smart was on when the word was last seen: only a change of Smart's own verdict glows. */
let flashAuto = true

async function effortFlash($: EngineInterface, what: string, judging: boolean, entering = false, auto = true): Promise<string> {
  const now = await $.clock.now()
  // The dashboard coming back (after Handoff, settings or an alert) takes the word as it is: a change made while it was
  // away is not a switch to point at.
  if (entering && !judging) {
    flashWord = what
    flashAt = null
  }
  if (!judging) {
    // Auto switched off or on is not a new verdict: the switch says it, so the word changes without the flash.
    // Off, the word is the chat's model and effort ("Opus 5.5 · Low"): a change there is the person's own, no glow either.
    if (flashWord !== null && flashWord !== what) flashAt = !auto || !flashAuto || what === 'Default' || flashWord === 'Default' ? null : now
    flashWord = what
    flashAuto = auto
  }
  const since = flashAt === null ? null : now - flashAt
  if (since === 0) {
    // One redraw at each step of the fade and one at its end, not a tick: see FLASH_STEPS.
    for (const at of [...FLASH_STEPS.map(([t]) => t), FLASH_MS]) $.clock.after(at + 20, () => $.ui.invalidate('ui.render'))
  }
  return flashColor(since)
}


// Uninstall's first press arms it; a second within UNINSTALL_ARM_MS uninstalls. Then the plugins reload and the mod is
// gone from this chat; its settings stay in settings.json, so a reinstall picks them up.
const UNINSTALL_ARM_MS = 4000
let uninstallArmedAt = 0
let uninstalling = false
const UNINSTALL_RED = '#ff6b6b'
/** A bin: the lid and its handle, the can with two ribs. */
function binSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><g fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 3.8H11.8M5.4 3.8V2.4H8.6V3.8M3.4 3.8L4 12H10L10.6 3.8M5.9 6V9.8M8.1 6V9.8"/></g></svg>`
}
function uninstallButton($: EngineInterface, els: ReturnType<EngineInterface['ui']['resolve']>) {
  const { Box, Text, Button, Svg } = els
  const armed = Date.now() - uninstallArmedAt < UNINSTALL_ARM_MS
  const press = async () => {
    if (uninstalling) return
    if (!armed) {
      uninstallArmedAt = Date.now()
      $.ui.invalidate('ui.render')
      $.clock.after(UNINSTALL_ARM_MS + 50, () => $.ui.invalidate('ui.render'))
      return
    }
    // This install as Claude Code lists it, with its scope (and its project for a project install). Loaded from a folder
    // (--plugin-dir) it is not listed: there is nothing to uninstall.
    const selves = await ownInstallsNow($)
    const self = selves.length === 1 ? (selves[0] ?? null) : null
    const args = self ? uninstallArgs(self) : null
    if (selves.length > 1) {
      // Installed more than once at this path (user and project, or for this project twice): which one runs is not
      // known for sure, so nothing is removed on a guess. The lines to run are shown instead.
      const lines = selves.map(r => uninstallLine(r)).filter((l): l is string => !!l)
      $.ui.toast(`${PRODUCT_NAME} is installed more than once here, so it is not removed on a guess. Remove it in /plugin, or run the one you mean in a terminal: ${lines.join('  |  ')}`)
      return
    }
    if (!self || !args) {
      $.ui.toast(`${PRODUCT_NAME} was loaded from a folder, not installed: nothing to uninstall. Remove it in /plugin if it is listed there.`)
      return
    }
    uninstalling = true
    $.ui.invalidate('ui.render')
    const cwd = (self.scope === 'project' || self.scope === 'local') && self.projectPath ? { cwd: self.projectPath } : {}
    const r = await runClaude($, args, { timeoutMs: 120_000, ...cwd }).catch(error => ({ exitCode: 1, stdout: '', stderr: String(error) }))
    uninstalling = false
    if (r.exitCode !== 0) {
      const why = (r.stderr || r.stdout).trim().split('\n').pop() ?? ''
      $.ui.toast(`${PRODUCT_NAME}: uninstall failed: ${noClaudeHint(why, await homeDir($)) ?? why}`)
      $.ui.invalidate('ui.render')
      return
    }
    $.ui.toast(`${PRODUCT_NAME} is uninstalled. Thanks for trying it.`)
    const reloaded = await $.command.run({ command: 'reload-plugins', args: RELOAD_ARGS } as never).then(() => true, () => false)
    if (!reloaded) await typeCommand($, `/reload-plugins ${RELOAD_ARGS}`)
  }
  const label = uninstalling ? 'Uninstalling…' : armed ? 'Press again to uninstall' : 'Uninstall'
  if (!Svg) return <Button key="settings-uninstall" plain dimColor={!armed} label={label} onPress={press} />
  // A bin and the word, grey; red under the pointer, and red while armed (the red bin is laid over the grey one, since
  // a hover can only reveal). A blank button over both takes the press.
  const red = armed || uninstalling
  return (
    <Box key="settings-uninstall-box" position="relative" flexDirection="row" alignItems="center" flexShrink={0}>
      <Box position="relative" width={2} height={1} alignItems="center">
        <Box position="absolute" top={0} left={0}>
          <Svg source={binSvg(DASH_DIM)} alt="bin" width={14} height={14} />
        </Box>
        <Box position="absolute" top={0} left={0} display={red ? 'flex' : 'none'} hover={red ? undefined : { scope: 'uninstall', display: 'flex' }}>
          <Svg source={binSvg(UNINSTALL_RED)} alt="bin" width={14} height={14} />
        </Box>
      </Box>
      <Text color={red ? UNINSTALL_RED : DASH_DIM} hover={{ scope: 'uninstall', color: UNINSTALL_RED }}>{label}</Text>
      <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
        <Button key="settings-uninstall" plain hover={{ scope: 'uninstall', backgroundColor: '#00000000' }} label={' '.repeat(label.length + 3)} onPress={press} />
      </Box>
    </Box>
  )
}


/** One dropdown in Settings: the app's own Select draws it, in the app's own colours. */
type OwnPick = { key: string; label?: string; value: string; options: { value: string; label: string }[]; onSelect: (value: string) => unknown }

// A dropdown in a pinned panel (Always dark, Always light). The app's own Select is drawn in the app's colours and its
// list floats in the app's own layer, which a plugin cannot paint; so a pinned panel paints the closed field itself
// (pinned.ts) and opens its list inside the panel, under the field. One list is open at a time; `openChoice` is its key.
let openChoice: string | null = null
let openChoiceDrawn = false
function ownChoice($: EngineInterface, c: Choice, tall?: number): { field: unknown; list: unknown } | null {
  const P = palette()
  const raw = parts()
  if (!P || !raw) return null
  const open = openChoice === c.key
  if (open) openChoiceDrawn = true
  const redraw = () => $.ui.invalidate('ui.render')
  return {
    field: paintedTrigger(raw, P, c, open, () => { openChoice = open ? null : c.key; redraw() }),
    list: open ? paintedOptions(raw, P, c, async value => { openChoice = null; await c.onSelect(value); redraw() }, tall) : null,
  }
}

// What the panel being drawn above the prompt hands to its shell, to lie under it in the slot's own shape: its art, its
// top bar. A panel's own box cuts its children to the band, a rectangle inside the round slot; the shell's layers
// reach the slot's edges and corners. null wherever no shell is drawn (the terminal, any other place than the slot).
let slotLayers: unknown[] | null = null
// This module's drawings, one after the other (see the AbovePrompt hook): a drawing waits on the store and the engine
// many times, and all of them share the layer list, the open dropdown and the surface's appearance. One drawing owns
// the turn; the others wait for it to give the turn back. A drawing that waited DRAW_WAIT_MS is not let in beside the
// owner (it would write into the owner's layers): it gets no turn, draws what lies beneath and asks for a redraw.
// Only an owner older than DRAW_DEAD_MS is passed over: the engine gives a render hook 10 s of its own time and up to
// 30 s with its waits on the engine, and has dropped its result by then, so one that never returns cannot hold the
// slot for good.
let drawOwnerSince = 0
let drawFreed: (() => void)[] = []
const DRAW_WAIT_MS = 4000
const DRAW_DEAD_MS = 30_000
async function drawTurn($: EngineInterface): Promise<(() => void) | null> {
  const deadline = Date.now() + DRAW_WAIT_MS
  while (drawOwner !== null && Date.now() - drawOwnerSince <= DRAW_DEAD_MS) {
    const left = deadline - Date.now()
    if (left <= 0) return null
    const stop = typeof AbortController === 'undefined' ? null : new AbortController()
    let wake: () => void = () => undefined
    const freed = new Promise<'freed'>(resolve => { wake = () => resolve('freed') })
    drawFreed.push(wake)
    // A sleep the engine refuses is no wake-up: the drawing steps back instead of asking again and again.
    const how = await Promise.race([freed, $.clock.sleep(left, stop ? { signal: stop.signal } : undefined).then(() => 'slept' as const, () => 'refused' as const)])
    stop?.abort()
    // Woken or not, this waiter is done with the list.
    drawFreed = drawFreed.filter(w => w !== wake)
    if (how === 'refused') return null
  }
  const me = {}
  // A change left over from an owner that never gave its turn back is applied before this drawing starts.
  drawOwner = null
  applyDueLook()
  drawOwner = me
  drawOwnerSince = Date.now()
  return () => {
    // An owner that was passed over gives back nothing: the turn is another drawing's by now.
    if (drawOwner !== me) return
    drawOwner = null
    applyDueLook()
    const waiting = drawFreed
    drawFreed = []
    for (const wake of waiting) wake()
  }
}
/** For a drawing that got no turn: drawn again shortly, when the owner is likely done. */
let redrawDue = false
function redrawAfterTurn($: EngineInterface) {
  // One redraw for all the drawings that stepped back, not one each.
  if (redrawDue) return
  redrawDue = true
  try {
    $.clock.after(300, () => { redrawDue = false; $.ui.invalidate('ui.render') })
  } catch {
    redrawDue = false
  }
}
// The drawings that bring a look of their own (an alert's colour, the setup guide's art, a running handoff's moving
// art): every other panel gets the shared wash from its shell (slotWash).
const ownLook = new WeakSet<unknown[]>()
/** underSlot for art that stands in for the shared wash. */
function ownArt(layer: unknown, otherwise: unknown = null): null {
  if (slotLayers) ownLook.add(slotLayers)
  return underSlot(layer, otherwise)
}
/** Hands a layer to the shell and draws nothing in the panel; without a shell, `otherwise` in the panel as before. */
function underSlot(layer: unknown, otherwise: unknown = null): null {
  // Typed as nothing: what comes back is a child of a panel either way, and the engine's own node type is not ours to name.
  if (!slotLayers) return otherwise as null
  slotLayers.push(layer)
  return null
}

/** A panel's ground above the prompt, without a border. On the desktop the app's own slot frames the panel, and a
 * plain panel has no ground of its own, so it fills the slot. Alert bands keep their colour
 * (`keepGround`); with `tint` it goes to the shell in the slot's round shape. Where the panel is drawn outside the
 * adaptive tree (a terminal) it paints its ground itself. Read after themedEls, which says the surface. */
function panelFrame(ground: string, keepGround = false, tint?: { Box: unknown }): Record<string, unknown> {
  // No frame on the desktop: the app's slot frames the band. A frame was a cell above and below the row; without it
  // the band was one row tall and the app cut the buttons off at the top and bottom, so they looked square. The
  // vertical padding gives that room back.
  if (!isAdaptive()) return { backgroundColor: ground, paddingY: 'xs' }
  if (!keepGround) return { paddingY: 'xs' }
  // An alert's colour goes to the shell, in the slot's round shape: as the band's own ground it was a square patch
  // inside the round slot. Outside the slot (a card under a reply) the band paints it itself.
  if (tint && slotLayers) {
    ownLook.add(slotLayers)
    slotLayers.push(slotTint(tint as unknown as Parts, 'slot-tint', ground))
    return { paddingY: 'xs' }
  }
  return { backgroundColor: ground, paddingY: 'xs' }
}

/** The handoff or compact card in the band above the prompt: words, the moving art while it runs, green with a check
 *  once it has landed. */
function handoffCardTree($: EngineInterface, e: RenderInput<'AbovePrompt'>, fresh: HandoffCard, onDismiss?: () => unknown) {
  const { Box, Text, Svg, Button } = themedEls($.ui.resolve(e), e.surface)
  const by = fresh.full ? 'Full' : 'Quick'
  const words = {
    writing: ['✦ Handing off…', `Writing the ${by.toLowerCase()} handoff. ${fresh.full ? 'A full turn takes a while.' : 'A few seconds.'}`],
    done: ['✦ Handoff done', 'This chat starts from the handoff. The old one is cleared.'],
    copied: ['✦ Handoff copied', 'Paste it into a new chat. This one stays as it is.'],
    compacting: ['✦ Compacting…', 'Summing up the chat. About a minute.'],
    compacted: ['✦ Compacted', 'The chat is summed up. Each message now rereads far less.'],
  }[fresh.kind]
  // Compacting is a wait in the background, not a result: one quiet line over the band's calm art, not the loud glow.
  const quiet = fresh.kind === 'compacting'
  const cardArt = quiet ? (
    <Svg source={quietArt(DASH_SVG)} alt="compacting" width={FROST_WIDTH * 2} height={FROST_HEIGHT * 2} />
  ) : cardRunning(fresh.kind) ? (
    <Svg source={quietArt(HANDOFF_SVG)} alt="handing off" width={FROST_WIDTH * 2} height={FROST_HEIGHT * 2} />
  ) : (
    <Svg source={quietArt(cardLanded(fresh.kind) ? DONE_SVG : brandArt())} alt={PRODUCT_NAME} width={FROST_WIDTH * 2} height={FROST_HEIGHT * 2} />
  )
  const card = (
    <Box key="reply-handoff" position="relative" flexDirection="row" alignItems="center" paddingX={1} overflow="hidden"
      {...panelFrame(cardLanded(fresh.kind) ? DONE_BG : BRAND_BG, cardLanded(fresh.kind), { Box })}>
      {/* Above the prompt the art lies in the slot's shape (the shell draws it); under a reply, in the card as before. */}
      {e.component === 'AbovePrompt'
        ? ownArt(slotArt({ Box, Text, Button } as unknown as Parts, 'reply-handoff-art', cardArt), <Box key="reply-handoff-art" position="absolute" top={-1} right={0} bottom={-1}>{cardArt}</Box>)
        : <Box key="reply-handoff-art" position="absolute" top={-1} right={0} bottom={-1}>{cardArt}</Box>}
      <Box key="reply-handoff-words" position="relative" flexDirection={quiet ? 'row' : 'column'} gap={quiet ? 1 : 0} flexShrink={1} minWidth={0}>
        {markTitle({ Box, Text, Svg }, 'reply-handoff-title', cardLanded(fresh.kind) ? DONE_ACCENT : ACCENT, words[0], cardLanded(fresh.kind) ? DONE_MARK_SVG : MARK_SVG)}
        <Text wrap="truncate">{words[1]}</Text>
      </Box>
      {onDismiss ? (
        <Box key="reply-handoff-close" position="relative" flexGrow={1} flexDirection="row" justifyContent="flex-end">
          <Box position="absolute" top={0} left={0} />
          {/* A box just the ✕'s size: in the wide one its hover lit up anywhere on the card's right half. */}
          <Box key="card-close-box" position="relative" flexShrink={0}>
            <Box position="absolute" top={0} left={0} />
            <Button key="card-close" plain role="dismiss" label="✕" hover={{ backgroundColor: CARD_CLOSE_HOVER }} onPress={onDismiss} />
          </Box>
        </Box>
      ) : null}
    </Box>
  )
  return card
}

// ---- Maintainer: Upstream updates -------------------------------------------------------------------------------------
// Only where the plugin runs from a git clone (maintainerClone), shown in the Support card's maintainer section. Off, it
// runs no git and no web fetch of its own. With it on, a session looks
// for a newer upstream release every UPDATE_CHECK_MS with git, and the card offers a review in a new session in the
// maintainer's clone (MAINTAINER-UPDATE.md). Nothing is ever installed in place.
/** Where upstream publishes its releases (public.json on the stable branch). */
const UPSTREAM_GIT = `${UPSTREAM_URL}.git`
/** This install's version, read from its plugin.json at session start; the usage log writes it on every line. */
let ownVersion = ''
/** How often a session looks for a new upstream release, and how long Later keeps the offer away. */
const UPDATE_CHECK_MS = 6 * 3600_000
const UPDATE_SNOOZE_MS = 24 * 3600_000
type UpdateCard = { stage: 'offer'; version: string; note: string; at: number; detail?: string }
/** Maintainer, Upstream updates: on, and the local clone the review runs in. Kept in the mod's store. */
type LabUpdates = { on: boolean; folder: string }
const maintainerUpdates = atom({ plugin: 'smarttokensaver', key: 'maintainerUpdates' } as const, null)
/** Whether Upstream updates is on: every network call of the plugin's own asks this first. Read from the store each
 *  time, not this chat's copy: the switch is shared, and turned off in one chat it is off in every open chat at once. */
async function updatesOn($: EngineInterface): Promise<LabUpdates | null> {
  // Only a maintainer's install (a clone of the repo) looks upstream; any other install never does.
  if (!(await maintainerClone($))) return null
  const kept = (await $.store.get('maintainerUpdates').catch(() => null)) as LabUpdates | null
  const lab = kept && typeof kept === 'object' && typeof kept.folder === 'string' ? kept : null
  if (JSON.stringify(lab) !== JSON.stringify(await read($, maintainerUpdates))) await update($, maintainerUpdates, () => lab)
  return lab && lab.on && lab.folder ? lab : null
}
/** A version as upstream writes it: major.minor.patch, nothing else (it goes into a command line and a link). */
export const VERSION_RE = /^\d+\.\d+\.\d+$/

/** Whether version `a` is newer than `b`, both `major.minor.patch`. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}
/** Skip keeps a version away for good (a newer one is offered again): its time lies past any clock. */
export const SKIP_FOREVER_AT = 8.64e15
/** The prompt the review session starts with. */
export function reviewPrompt(version: string): string {
  return (
    `${PRODUCT_NAME}: upstream ${UPSTREAM_NAME} ${version} is out (HeyCubit). Follow MAINTAINER-UPDATE.md in this folder for ${version}: ` +
    'review the upstream changes for security, test them, keep this plugin\'s own changes, and show me the findings before you merge anything.'
  )
}
/** The deep link that opens a new Claude Code session in the clone with the review prompt typed in. */
export function reviewLink(folder: string, version: string): string {
  return `claude://code/new?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(reviewPrompt(version))}`
}
/** Review: on macOS a new Claude Code session opens in the clone with the review prompt; elsewhere a toast says where
 *  to start one and what to ask. The card goes away for a day either way. */
async function openReview($: EngineInterface, card: UpdateCard) {
  const lab = await updatesOn($)
  if (!lab || !VERSION_RE.test(card.version)) return
  const platform = await $.session.info().then(i => i.platform).catch(() => 'unknown')
  const opened = platform === 'macos' ? await $.process.run(['open', reviewLink(lab.folder, card.version)]).then(r => r.exitCode === 0, () => false) : false
  if (opened) $.ui.toast(`${PRODUCT_NAME}: a new Claude Code session opens to review ${card.version}. Press Enter there to start.`)
  else $.ui.toast(`${PRODUCT_NAME}: start a Claude Code session in ${lab.folder} and ask: ${reviewPrompt(card.version)}`)
  await $.store.set('updateHidden', { version: card.version, at: await $.clock.now() })
  await update($, updateCard, () => null)
}
/** Skip: this version is never offered again; the next upstream release is. */
async function skipVersion($: EngineInterface, card: UpdateCard) {
  // Kept apart from Later's updateHidden, which "Check now" clears: a skipped version stays skipped.
  await $.store.set('updateSkipped', { version: card.version, at: SKIP_FOREVER_AT })
  await update($, updateCard, () => null)
  $.ui.toast(`${PRODUCT_NAME}: upstream ${card.version} skipped. The next release is offered again.`)
}
/** The newest release in upstream's public.json text (newest first), or nothing when it does not parse. */
export function latestRelease(text: string): { version: string; note: string } | undefined {
  try {
    const list = JSON.parse(text) as { version?: unknown; note?: unknown }[]
    const top = Array.isArray(list) ? list[0] : undefined
    if (!top || typeof top.version !== 'string' || !VERSION_RE.test(top.version)) return undefined
    return { version: top.version, note: typeof top.note === 'string' ? top.note : '' }
  } catch {
    return undefined
  }
}
/** Whether Later still keeps `version` away at `now`: the same version, put away less than UPDATE_SNOOZE_MS ago. */
export function updateSnoozed(hidden: { version: string; at: number } | null, version: string, now: number): boolean {
  return !!hidden && hidden.version === version && now - hidden.at < UPDATE_SNOOZE_MS
}
async function installedVersion($: EngineInterface): Promise<string | undefined> {
  const text = await $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).catch(() => '')
  try {
    const v = (JSON.parse(typeof text === 'string' ? text : '') as { version?: unknown }).version
    return typeof v === 'string' ? v : undefined
  } catch {
    return undefined
  }
}
// What the last check found, for /smarttokensaver maintainer to say.
let lastUpdateCheck = 'not checked yet'
/** The git arguments of the upstream check, all on the plugin's own bare repo (`--git-dir` named every time, so git
 *  never looks for a repo around the folder) and fetching from upstream's URL itself, not from whatever a remote says. */
export function upstreamGitArgs(gitDir: string): { init: string[]; isBare: string[]; fetch: string[]; show: string[] } {
  // HTTPS only, and no URL rewriting from a config git would read (UPSTREAM_GIT_ENV keeps the user's and system's
  // config out): the fetch goes to upstream's own address. The whole commit comes in (no --filter), so `show` reads
  // a local object and never fetches on its own.
  const g = ['git', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', `--git-dir=${gitDir}`]
  return {
    init: ['git', 'init', '-q', '--bare', gitDir],
    isBare: [...g, 'rev-parse', '--is-bare-repository'],
    fetch: [...g, 'fetch', '-q', '--no-tags', '--depth', '1', UPSTREAM_GIT, 'stable'],
    show: [...g, 'show', 'FETCH_HEAD:public.json'],
  }
}
/** The environment of every upstream git call: no prompt, no system or global config (no insteadOf, no credential
 *  helper), no lazy fetch of a missing object. */
export const UPSTREAM_GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1' }
/** public.json as it is on upstream's stable branch, read with git: a depth-1 fetch without file contents into a bare
 *  repo of the plugin's own under ~/.claude/smarttokensaver/upstream-check, then the one file. A failure says so: it is
 *  not "up to date". */
async function latestFromGit($: EngineInterface): Promise<{ version: string; note: string } | { fail: string }> {
  const home = await homeDir($)
  if (!home) return { fail: 'no home folder' }
  const gitDir = `${home}/${DATA_DIR}/upstream-check/repo.git`
  const cmd = upstreamGitArgs(gitDir)
  // Asked again before every git call: switched off in any chat meanwhile, nothing more runs.
  const run = async (argv: string[]) => {
    if (!(await updatesOn($))) throw new Error('Upstream updates was turned off')
    return $.process.run(argv, { timeoutMs: 60_000, env: UPSTREAM_GIT_ENV })
  }
  // The repo must be a folder of its own here, not a link to another repo.
  const at = await $.fs.stat(gitDir).catch(() => null)
  if (at && (at.isLink || at.kind !== 'dir')) return { fail: 'upstream-check/repo.git is not the plugin\'s own folder' }
  const bare = at ? await run(cmd.isBare).catch(() => null) : null
  if (!bare || bare.exitCode !== 0) {
    // Nothing there yet: a fresh bare repo of its own.
    if ((await run(cmd.init).catch(() => null))?.exitCode !== 0) return { fail: 'git init failed' }
  } else if (bare.stdout.trim() !== 'true') return { fail: 'upstream-check is not the plugin\'s own repo' }
  const fetched = await run(cmd.fetch).catch(() => null)
  if (!fetched || fetched.exitCode !== 0) return { fail: 'git fetch failed (offline?)' }
  const shown = await run(cmd.show).catch(() => null)
  const latest = shown && shown.exitCode === 0 ? latestRelease(shown.stdout) : undefined
  return latest ?? { fail: 'public.json not readable' }
}
/** The session's timers. A reload starts the module over, maybe with no session start (the countdown froze on "Cold"),
 * so the band's first draw starts them too. A session start always starts them: a timer started inside a request may
 * end with it. */
let timersFrom: 'start' | 'draw' | null = null
function startTimers($: EngineInterface, from: 'start' | 'draw') {
  if (timersFrom === 'start' || (timersFrom === 'draw' && from === 'draw')) return
  timersFrom = from
  // The upstream check asks the maintainer switch first each time: off, it does nothing at all.
  $.clock.every(UPDATE_CHECK_MS, () => void checkUpdate($).catch(() => undefined))
  // This plugin's own updates (an install from GitHub): one check per period across all open chats.
  $.clock.every(UPDATE_CHECK_MS, () => void checkOwnUpdate($).catch(() => undefined))
  $.clock.every(CACHE_TICK_MS, () => void syncOwnCard($).catch(() => undefined))
  // The compaction window is read again every few minutes: a setting changed elsewhere, a /model, a new policy.
  $.clock.every(WINDOW_READ_MS, () => void readWindow($).catch(() => undefined))
  // The cache countdown's clock. A timer started inside a request ends with that request, so it lives here.
  $.clock.every(CACHE_TICK_MS, () => void showCache($).catch(() => undefined))
  $.clock.every(CACHE_TICK_MS, () => void checkSwamp($).catch(() => undefined))
  // Read the usage at once too, so the context ring is there from the start rather than a tick later.
  void checkSwamp($).then(() => $.ui.invalidate('ui.render')).catch(() => undefined)
  // A written handoff is cleared and resent from here: a hook the turn waits on may not run commands.
  handoffTimer?.cancel()
  handoffTimer = $.clock.every(HANDOFF_POLL_MS, () => {
    void agentWaits($).catch(() => undefined)
    // Every third tick is soon enough for a change made in another chat, and keeps the timer light.
    if (++syncTicks % 3 === 0) void syncKeptSettings($).catch(() => undefined)
    if (redrawsOwed > 0) {
      // Drawn since the ask: the band is up to date, so a redraw would only restart its animations.
      if (lastRenderAt > redrawAskedAt + REDRAW_SETTLE_MS) redrawsOwed = 0
      else {
        redrawsOwed--
        $.ui.invalidate('ui.render')
      }
    }
    // Right after a start the app may not have the usage yet: ask each second until it has, so the ring shows.
    if (!lastContext || !lastContext.window) void checkSwamp($).then(() => lastContext?.window && $.ui.invalidate('ui.render')).catch(() => undefined)
    // The dashboard's countdown ticks inside its own image; the band is redrawn once a minute to start the next one.
    if (cacheExpires > 0 && !config.hide.includes('timer'))
      void $.clock.now().then(now => {
        const minute = Math.floor((cacheExpires - now) / 60_000)
        if (now < cacheExpires + HANDOFF_POLL_MS && minute !== clockMinute) {
          clockMinute = minute
          $.ui.invalidate('ui.render')
        }
      }).catch(() => undefined)
    void writeRenderLog($).catch(() => undefined)
    void finishHandoff($).catch(() => undefined)
  })
}

// /reload-plugins loads the module again without a session start, so the band's first draw runs afterLoad too.
let loadChecked = false
/** Once per load: the own version, the timers, the window, and (maintainer, switched on) a look for a newer upstream release. */
async function afterLoad($: EngineInterface) {
  if (loadChecked) return
  loadChecked = true
  // A reload has no session start, so this load reads its own version here too, the settings kept in the store, this
  // chat's own window and what was seen of the hooks.
  ownVersion = (await installedVersion($)) ?? ownVersion
  await applyKeptSettings($)
  await loadHookFlags($)
  await loadChatWindow($).catch(() => undefined)
  startTimers($, 'draw')
  await loadLab($)
  await applyMaintainerDefaults($).catch(() => undefined)
  void readWindow($).catch(() => undefined)
  void checkOwnUpdate($).catch(() => undefined)
  await checkUpdate($)
}
/** Settings the app had no /config row for (see saveSetting), laid over the ones it passed in. Once per load. */
let keptApplied = false
async function applyKeptSettings($: EngineInterface, kept?: unknown) {
  if (keptApplied) return
  keptApplied = true
  const k = kept === undefined ? await $.store.get('savedSettings').catch(() => null) : kept
  keptSeen = JSON.stringify(k ?? {})
  if (k && typeof k === 'object' && Object.keys(k).length) {
    config = readConfig({ ...pluginOptions, ...(k as Record<string, unknown>) })
    applyTheme()
  }
}
/** The saved settings as last applied in this chat, to tell a change made in another open chat. */
let keptSeen = ''
let syncTicks = 0
/** Settings saved in another open chat, taken over here: read every few seconds from the store (no reload carries them). */
async function syncKeptSettings($: EngineInterface) {
  if (!keptApplied) return
  const k = await $.store.get('savedSettings').catch(() => undefined)
  if (k === undefined) return
  const seen = JSON.stringify(k ?? {})
  if (seen === keptSeen) return
  keptSeen = seen
  const windowBefore = config.compactWindow
  config = readConfig({ ...pluginOptions, ...((k ?? {}) as Record<string, unknown>) })
  applyTheme()
  if (config.compactWindow !== windowBefore) void readWindow($).catch(() => undefined)
  $.ui.invalidate('ui.render')
}
/** Whether the settings.read and session.compact hooks were seen not to take, as the store keeps it. */
async function loadHookFlags($: EngineInterface) {
  const [settingsFlag, compactFlag] = await Promise.all([$.store.get('settingsHookBlocked').catch(() => null), $.store.get('compactHookBlocked').catch(() => null)])
  settingsHookBlocked = settingsFlag === true
  compactHookBlocked = compactFlag === true
  // A time (a week's hold) or, from before, true.
  const refusedAt = await $.store.get('settingsFileRefused').catch(() => null)
  settingsFileRefused = refusedAt === true || (typeof refusedAt === 'number' && Date.now() - refusedAt < SETTINGS_REFUSED_MS)
  raisedKept = await $.store.get('raisedWindows').catch(() => null)
  // Records from before the default changed (or from an older version) take the default in force as their way back.
  const retargeted = retargetRaised(raisedKept, config.compactWindow)
  if (JSON.stringify(retargeted) !== JSON.stringify(asRaised(raisedKept))) {
    raisedKept = retargeted
    await $.store.set('raisedWindows', Object.keys(retargeted).length ? retargeted : null).catch(() => undefined)
  }
  loadedSid = String(await $.session.id().catch(() => ''))
}
/** Reads the maintainer switches from the store into state, once per load. */
let labLoaded = false
async function loadLab($: EngineInterface) {
  if (labLoaded) return
  labLoaded = true
  const kept = (await $.store.get('maintainerUpdates').catch(() => null)) as LabUpdates | null
  if (kept && typeof kept.folder === 'string') await update($, maintainerUpdates, () => kept)
}
async function checkUpdate($: EngineInterface) {
  if (!(await updatesOn($))) {
    lastUpdateCheck = 'Upstream updates is off'
    return
  }
  const shown = await read($, updateCard)
  const got = await latestFromGit($).catch((error: unknown) => ({ fail: String(error).slice(0, 80) }))
  // Turned off (in any chat) while the fetch ran: nothing is shown.
  if (!(await updatesOn($))) {
    lastUpdateCheck = 'Upstream updates is off'
    return
  }
  if ('fail' in got) {
    lastUpdateCheck = `based on ${UPSTREAM_BASE}; check failed: ${got.fail}`
    lastCheckFailed = true
    // An offer from an earlier check is not shown as current: the failure says so instead.
    if (shown) await update($, updateCard, () => null)
    return
  }
  lastCheckFailed = false
  const latest = got
  lastUpdateCheck = `based on ${UPSTREAM_BASE}; upstream ${latest.version}`
  if (!isNewer(latest.version, UPSTREAM_BASE)) {
    if (shown) await update($, updateCard, () => null)
    await update($, updateCheck, cur => (cur && cur.startsWith('found ') ? 'idle' : (cur ?? 'idle')))
    return
  }
  const now = await $.clock.now()
  const hidden = (await $.store.get('updateHidden').catch(() => null)) as { version: string; at: number } | null
  if (updateSnoozed(hidden, latest.version, now)) return
  const skipped = (await $.store.get('updateSkipped').catch(() => null)) as { version: string; at: number } | null
  if (updateSnoozed(skipped, latest.version, now)) return
  if (shown?.version !== latest.version) await update($, updateCard, () => ({ stage: 'offer', version: latest.version, note: latest.note, at: now }))
}
// The last check could not reach upstream or read its answer: Check now says so, never "up to date".
let lastCheckFailed = false
// Upstream "Check now": idle, checking, up to date, failed, or the version found.
const updateCheck = atom({ plugin: 'smarttokensaver', key: 'updateCheck' } as const, 'idle')
/** Looks now, ignoring a Later pressed earlier (asking is a decision to look), and says what it found. */
async function checkUpdateNow($: EngineInterface) {
  if (!(await updatesOn($))) return
  await update($, updateCheck, () => 'checking')
  await $.store.set('updateHidden', null).catch(() => undefined)
  await checkUpdate($).catch((error: unknown) => {
    lastUpdateCheck = `check failed: ${String(error).slice(0, 120)}`
  })
  const card = await read($, updateCard)
  const result = card ? `found ${card.version}` : lastCheckFailed ? 'failed' : 'newest'
  await update($, updateCheck, () => result)
  if (!card) $.clock.after(5000, () => void update($, updateCheck, cur => (cur === 'newest' || cur === 'failed' ? 'idle' : (cur ?? 'idle'))).catch(() => undefined))
}
/** Maintainer, Upstream updates on (with the clone's folder) or off. Says what it did. */
async function setLabUpdates($: EngineInterface, folder: string | null): Promise<string> {
  // Off is kept as off (not as nothing), so a maintainer's next load does not turn it on again.
  const next: LabUpdates = folder ? { on: true, folder } : { on: false, folder: '' }
  // The store is what every chat reads (updatesOn): a write that fails changes nothing, and says so.
  const stored = await $.store.set('maintainerUpdates', next).then(() => true, () => false)
  if (!stored) return `Could not save Upstream updates. It stays ${(await updatesOn($)) ? 'on' : 'off'}; try again.`
  await update($, maintainerUpdates, () => next)
  if (!next.on) {
    await update($, updateCard, () => null)
    return 'Upstream updates off. No upstream checks.'
  }
  void checkUpdate($).catch(() => undefined)
  return `Upstream updates on: checks every 6 hours, reviews in ${folder}.`
}
/** Why a folder can't take Upstream updates, or null when it can. The review opens a session there and follows
 *  MAINTAINER-UPDATE.md: it has to be the top folder of a git clone of this plugin's repo, not any folder, a file, or a
 *  folder inside another project. */
async function labFolderProblem($: EngineInterface, value: string): Promise<string | null> {
  if (!(await $.fs.exists(value).catch(() => false))) return `No folder at ${value}.`
  const inRepo = await $.process.run(['git', '-C', value, 'rev-parse', '--is-inside-work-tree', '--show-prefix'], { timeoutMs: 15_000 }).catch(() => null)
  const lines = inRepo && inRepo.exitCode === 0 ? inRepo.stdout.split('\n').map(l => l.trim()) : []
  if (lines[0] !== 'true') return `${value} is not a git clone. Give the folder of your local clone of the ${PRODUCT_NAME} repo.`
  if ((lines[1] ?? '') !== '') return `${value} is inside a git clone, not its top folder. Give the top folder of your local clone of the ${PRODUCT_NAME} repo.`
  if (!(await $.fs.exists(`${value.replace(/[\\/]+$/, '')}/MAINTAINER-UPDATE.md`).catch(() => false))) return `${value} has no MAINTAINER-UPDATE.md. Give the folder of your local clone of the ${PRODUCT_NAME} repo.`
  return null
}
/** Maintainer, Measurement: on with a control share in percent, or off. Says what it did. */
async function setLabMeasure($: EngineInterface, share: number | null): Promise<string> {
  if (share === null) {
    await enqueueSettings($, { measureLog: 'off', abControl: '0' })
    await drainSetupSave($)
    return `Measurement off. Nothing more is logged and no control arm runs. The files already in ~/${DATA_DIR}/usage are removed once they are ${AB_KEEP_DAYS} days old; delete that folder to remove them now.`
  }
  await enqueueSettings($, { measureLog: 'on', abControl: String(share) })
  await drainSetupSave($)
  return `Measurement on: ${share} % of judged prompts run as the control arm, the log goes to ~/${DATA_DIR}/usage.`
}
/** The control share Measurement starts with in a maintainer's clone. */
export const MAINTAINER_MEASURE_DEFAULT = 10
/** A maintainer's clone (the opt-in file is there) gets both tools on once the setup is done: Upstream updates in this
 *  clone and Measurement at MAINTAINER_MEASURE_DEFAULT %. The opt-in file is the consent. Once only: switched off later,
 *  a tool stays off. */
async function applyMaintainerDefaults($: EngineInterface) {
  // A store that cannot be read counts as done: nothing turns on by mistake.
  if ((await $.store.get('maintainerDefaults').catch(() => true)) === true) return
  if ((await $.store.get('setupDone').catch(() => null)) !== true) return
  const root = await maintainerClone($)
  if (!root) return
  if (!(await $.store.set('maintainerDefaults', true).then(() => true, () => false))) return
  const updates = await $.store.get('maintainerUpdates').catch(() => null) as LabUpdates | null
  if (!updates?.on) await setLabUpdates($, root)
  if (config.measureLog !== 'on') await setLabMeasure($, MAINTAINER_MEASURE_DEFAULT)
  $.ui.invalidate('ui.render')
}
// ---- Support: maintainer and this plugin's own updates ---------------------------------------------------------------
/** The file a maintainer creates in the top folder of a clone to see the maintainer tools. It is in .gitignore, so no
 *  install from GitHub ever has it. */
export const MAINTAINER_FILE = '.smarttokensaver-maintainer'
/** The top folder of the git clone this plugin runs from, where its maintainer opted in (MAINTAINER_FILE there), or null.
 *  Only then does Support show Upstream updates and Measurement; both go on once the setup is done (applyMaintainerDefaults).
 *  Looked up once per load. */
let maintainerAt: Promise<string | null> | null = null
function maintainerClone($: EngineInterface): Promise<string | null> {
  maintainerAt ??= (async () => {
    const root = String($.plugin.root ?? '').replace(/[\\/]+$/, '')
    // SMARTTOKENSAVER_MAINTAINER=0 hides the tools in an opted-in clone; =1 skips the checks (the plugin's own tests).
    const forced = await Promise.resolve($.env.get('SMARTTOKENSAVER_MAINTAINER')).catch(() => undefined)
    if (forced === '0') return null
    if (forced === '1') return root || null
    if (!root) return null
    // The opt-in first: without it no git runs at all. Then the folder must be the top of a clone of this repo.
    if (!(await $.fs.exists(`${root}/${MAINTAINER_FILE}`).catch(() => false))) return null
    return (await labFolderProblem($, root)) ? null : root
  })().catch(() => null)
  return maintainerAt
}
/** This plugin's own updates: Claude Code fetches the marketplace it was installed from (`claude plugin marketplace
 *  update`, with the person's own git), and the card offers the newer version there. On by default, off in Support. A
 *  maintainer's clone is its own source and is never checked. */
type OwnCard = { version: string; at: number }
const ownCard = atom({ plugin: 'smarttokensaver', key: 'ownCard' } as const, null)
const ownCheck = atom({ plugin: 'smarttokensaver', key: 'ownCheck' } as const, 'idle')
/** Whether this plugin's update check is on: shared by every chat, read from the store each time. */
async function ownUpdatesOn($: EngineInterface): Promise<boolean> {
  if (await maintainerClone($)) return false
  // A store that can't be read counts as off: no check runs that the person may have turned off.
  const kept = (await $.store.get('ownUpdates').catch(() => ({ off: true }))) as { off?: boolean } | null
  return !(kept && kept.off === true)
}
/** The marketplace this install came from and its local copy, or null where that is not known for sure. */
async function ownMarketplace($: EngineInterface): Promise<{ id: string; name: string; folder: string; local: boolean; rec: InstallRec } | null> {
  const rec = await ownInstallNow($)
  const listed = await installedPluginsPath($)
  const name = rec?.id.split('@')[1]
  if (!rec || !listed || !name) return null
  // A folder marketplace has nothing to fetch: its folder is the source.
  const local = name in (await marketFolders($))
  // Where Claude Code keeps the marketplace: its own record (installLocation) first, the usual place otherwise.
  const known = await $.fs.read(listed.replace(/installed_plugins\.json$/, 'known_marketplaces.json')).catch(() => '')
  let folder = listed.replace(/installed_plugins\.json$/, `marketplaces/${name}`)
  try {
    const at = (JSON.parse(String(known || '{}')) as Record<string, { installLocation?: unknown }>)[name]?.installLocation
    if (typeof at === 'string' && at) folder = at
  } catch {
    // The usual place stays.
  }
  return { id: rec.id, name, folder, local, rec }
}
/** The version Claude Code lists for this install (same id, scope and project), or '' when it can't tell. */
export function listedVersion(installed: unknown, rec: Pick2<InstallRec, 'id' | 'scope' | 'projectPath'>): string {
  const all = (installed as { plugins?: Record<string, unknown> } | null)?.plugins ?? (installed as Record<string, unknown> | null) ?? {}
  const list = all[rec.id]
  for (const r of Array.isArray(list) ? list : list ? [list] : []) {
    const o = r as { scope?: unknown; projectPath?: unknown; version?: unknown }
    if ((o.scope ?? 'user') !== rec.scope) continue
    if (rec.projectPath && o.projectPath !== rec.projectPath) continue
    return typeof o.version === 'string' ? o.version : ''
  }
  return ''
}
/** Looks for a newer version of this plugin. `now` (Check now) ignores Later and the last check's time. */
async function checkOwnUpdate($: EngineInterface, now = false): Promise<'newest' | 'failed' | 'found' | 'off' | 'local' | 'skipped'> {
  if (!(await ownUpdatesOn($))) return 'off'
  const at = await $.clock.now()
  const last = (await $.store.get('ownChecked').catch(() => null)) as number | null
  // Every open chat has the timer; one check per period is enough for all of them.
  if (!now && typeof last === 'number' && at - last < UPDATE_CHECK_MS - 60_000) return 'newest'
  const mp = await ownMarketplace($)
  if (!mp) return 'failed'
  if (mp.local) return 'local'
  // Asked again right before the fetch: Turn off in another chat during the lookups above stops it here.
  if (!(await ownUpdatesOn($))) return 'off'
  await $.store.set('ownChecked', at).catch(() => undefined)
  const r = await runClaude($, ['plugin', 'marketplace', 'update', mp.name], { timeoutMs: 120_000 }).catch(() => null)
  if (!r || r.exitCode !== 0) return 'failed'
  const text = await $.fs.read(`${mp.folder}/.claude-plugin/plugin.json`).catch(() => '')
  let latest = ''
  try {
    const v = (JSON.parse(String(text)) as { version?: unknown }).version
    latest = typeof v === 'string' && VERSION_RE.test(v) ? v : ''
  } catch {
    latest = ''
  }
  if (!latest) return 'failed'
  // Switched off in another chat while the fetch ran: nothing is shown.
  if (!(await ownUpdatesOn($))) return 'off'
  if (!isNewer(latest, ownVersion || OWN_VERSION)) {
    await update($, ownCard, () => null)
    return 'newest'
  }
  const hidden = (await $.store.get('ownHidden').catch(() => null)) as { version: string; at: number } | null
  const skipped = (await $.store.get('ownSkipped').catch(() => null)) as { version: string; at: number } | null
  // Skip holds in every chat, Check now too; Later is only until the next look, and Check now is one.
  if (updateSnoozed(skipped, latest, at)) {
    await update($, ownCard, () => null)
    return 'skipped'
  }
  if (!now && updateSnoozed(hidden, latest, at)) return 'found'
  await update($, ownCard, () => ({ version: latest, at }))
  return 'found'
}
/** Later, Skip or Turn off in another open chat: the card shown here goes too (every CACHE_TICK_MS). */
async function syncOwnCard($: EngineInterface) {
  const card = (await read($, ownCard)) as OwnCard | null
  if (!card) return
  const at = await $.clock.now()
  const hidden = (await $.store.get('ownHidden').catch(() => null)) as { version: string; at: number } | null
  const skipped = (await $.store.get('ownSkipped').catch(() => null)) as { version: string; at: number } | null
  if (!(await ownUpdatesOn($)) || updateSnoozed(hidden, card.version, at) || updateSnoozed(skipped, card.version, at)) {
    await update($, ownCard, () => null)
    if ((await read($, ownCheck)) === 'found') await update($, ownCheck, () => 'idle')
  }
}
/** Support's "Check now": says what it found, then goes back to the button. */
async function checkOwnNow($: EngineInterface) {
  await update($, ownCheck, () => 'checking')
  const found = await checkOwnUpdate($, true).catch(() => 'failed' as const)
  await update($, ownCheck, () => found)
  if (found !== 'found' && found !== 'local') $.clock.after(5000, () => void update($, ownCheck, () => 'idle').catch(() => undefined))
  return found
}
/** Support, Updates on or off. Off, the plugin makes no update check of its own. */
async function setOwnUpdates($: EngineInterface, on: boolean): Promise<string> {
  const stored = await $.store.set('ownUpdates', on ? null : { off: true }).then(() => true, () => false)
  if (!stored) return 'Could not save. Try again.'
  if (!on) {
    await update($, ownCard, () => null)
    return 'Updates off. No update checks of its own.'
  }
  void checkOwnUpdate($, true).catch(() => undefined)
  return 'Updates on: checks every 6 hours.'
}
/** Update pressed: `claude plugin update` for this install, then a reload; a new chat loads it where the reload cannot. */
async function runOwnUpdate($: EngineInterface, card: OwnCard) {
  const mp = await ownMarketplace($)
  await update($, ownCard, () => null)
  // A failed update brings the card back, so Update can be pressed again.
  const again = () => update($, ownCard, now => now ?? card)
  if (!mp) {
    $.ui.toast(`${PRODUCT_NAME}: update it with claude plugin update ${PLUGIN}@<marketplace>.`)
    return
  }
  // The install's own scope, and for a project install its project folder, so the update lands where this one runs.
  const scope = (INSTALL_SCOPES as readonly string[]).includes(mp.rec.scope) ? mp.rec.scope : 'user'
  const args = ['plugin', 'update', mp.id, '--scope', scope]
  const cwd = (scope === 'project' || scope === 'local') && mp.rec.projectPath ? { cwd: mp.rec.projectPath } : {}
  const line = `claude ${args.join(' ')}`
  const r = await runClaude($, args, { timeoutMs: 180_000, ...cwd }).catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  if (r.exitCode !== 0) {
    const home = await homeDir($)
    $.ui.toast(`${PRODUCT_NAME}: the update failed. ${noClaudeHint(r.stderr, home) ?? `Run ${line}.`}`)
    await again()
    return
  }
  // Said only once Claude Code lists the new version for this install.
  const now = listedVersion(await readInstalled($), mp.rec)
  if (now && now !== card.version) {
    $.ui.toast(`${PRODUCT_NAME}: the update ran, but ${now} is still installed. Run ${line} in a terminal.`)
    await again()
    return
  }
  if (!now) {
    $.ui.toast(`${PRODUCT_NAME}: the update ran, but the installed version could not be read. /plugin shows it; if it is not ${card.version}, run ${line}.`)
    return
  }
  // No reload here: a forced one can make this chat's next message reread the whole chat without the cache (new
  // commands change the prompt's start). The person decides whether this chat is worth that.
  $.ui.toast(`${PRODUCT_NAME} ${now} is installed. It runs in every new chat. For this chat too: /reload-plugins ${RELOAD_ARGS} (the next message then rereads the chat at full price).`)
}
/** The link of Report a bug: a new issue on this plugin's repo, prefilled with the version and nothing else. */
export function bugReportUrl(version: string): string {
  const body = [`Version: ${PRODUCT_NAME} ${version} (based on ${UPSTREAM_NAME} ${UPSTREAM_BASE})`, '', 'What happened:', '', 'What you expected:', ''].join('\n')
  return `${ISSUES_URL}/new?body=${encodeURIComponent(body)}`
}

/**
 * Where `claude` may be: on PATH, then where the official installers put it. The desktop app starts with the PATH it
 * had at login, so a CLI installed since is not on it until the next sign-in.
 */
export function claudeCandidates(home: string | undefined): string[] {
  if (!home) return ['claude']
  const win = /^[A-Za-z]:/.test(home)
  const sep = home.includes('\\') ? '\\' : '/'
  return ['claude', [home.replace(/[\\/]+$/, ''), '.local', 'bin', win ? 'claude.exe' : 'claude'].join(sep)]
}
// What the engine says when a command cannot be started at all, as opposed to one that ran and failed.
const NOT_STARTED = /ENOENT|not found or is in an unsafe location|failed to start/i
/** For a `claude` that would not start: what to install, in the person's own shell; undefined for any other error. */
export function noClaudeHint(error: string, home: string | undefined): string | undefined {
  if (!NOT_STARTED.test(error)) return undefined
  const install = home && /^[A-Za-z]:/.test(home) ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'
  return `This needs the Claude Code CLI. Install it with ${install}, then reopen the app.`
}
const homeDir = async ($: EngineInterface) => ((await envUserProfile($)) ?? (await envHome($))) || undefined
/** `claude <args>`, from the next place it may be when one will not start (Uninstall, the update check, Update). */
async function runClaude($: EngineInterface, args: string[], opts: Parameters<EngineInterface['process']['run']>[1]) {
  let last: unknown
  for (const bin of claudeCandidates(await homeDir($))) {
    try {
      return await $.process.run([bin, ...args], opts)
    } catch (error) {
      last = error
      if (!NOT_STARTED.test(String(error))) throw error
    }
  }
  throw last
}
/** A plain /reload-plugins holds back a change that would make the next message re-read the chat without the cache
 * (new commands do), says "installed but not applied" and keeps the old code running. After Uninstall: apply it. */
export const RELOAD_ARGS = '--force'
/** An offer above the prompt: a newer version of this plugin (Update, Later, Skip), or for a maintainer a newer upstream
 *  release (Review, Later, Skip). */
function updateCardTree($: EngineInterface, e: RenderInput<'AbovePrompt'>, card: UpdateCard | OwnCard) {
  const { Box, Text, Svg, Button } = themedEls($.ui.resolve(e), e.surface)
  const upstream = 'stage' in card
  const words = upstream
    ? [`✦ Upstream ${UPSTREAM_NAME} ${card.version} is out`, `You run ${OWN_VERSION}, based on ${UPSTREAM_BASE}. Review checks it in a new session.`]
    : [`✦ ${PRODUCT_NAME} ${card.version} is out`, `You run ${ownVersion || OWN_VERSION}. Update installs it from GitHub.`]
  const hide = async () => {
    await $.store.set(upstream ? 'updateHidden' : 'ownHidden', { version: card.version, at: await $.clock.now() })
    if (upstream) await update($, updateCard, () => null)
    else {
      await update($, ownCard, () => null)
      await update($, ownCheck, () => 'idle')
    }
  }
  const skip = async () => {
    if (upstream) return skipVersion($, card)
    await $.store.set('ownSkipped', { version: card.version, at: SKIP_FOREVER_AT })
    await update($, ownCard, () => null)
    await update($, ownCheck, () => 'idle')
    $.ui.toast(`${PRODUCT_NAME}: ${card.version} skipped. The next version is offered again.`)
  }
  // Each control in a box of its own: under one shared box, hovering one lit the other too.
  const own = (key: string, el: unknown) => (
    <Box key={key} position="relative" flexShrink={0}>
      <Box position="absolute" top={0} left={0} />
      {el as never}
    </Box>
  )
  return (
    <Box key="update-card" position="relative" flexDirection="row" alignItems="center" paddingX={1} overflow="hidden"
      {...panelFrame(BRAND_BG)}>
      {/* Above the prompt the shell lays the shared wash under the card; anywhere else it brings its own art. */}
      {slotLayers ? null : (
        <Box key="update-art" position="absolute" top={-1} right={0} bottom={-1}>
          <Svg source={quietArt(brandArt())} alt={PRODUCT_NAME} width={FROST_WIDTH * 2} height={FROST_HEIGHT * 2} />
        </Box>
      )}
      <Box key="update-words" position="relative" flexDirection="column" flexShrink={1} minWidth={0}>
        {markTitle({ Box, Text, Svg }, 'update-title', ACCENT, words[0]!)}
        <Text wrap="truncate">{words[1]}</Text>
      </Box>
      <Box key="update-controls" position="relative" flexGrow={1} flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1}>
        {/* Positioned by an empty absolute child, so it paints over the art and takes the clicks. */}
        <Box position="absolute" top={0} left={0} />
        {own('update-go-box', <Button key="update-go" variant="primary" label={upstream ? 'Review' : 'Update'} onPress={() => (upstream ? openReview($, card) : runOwnUpdate($, card))} />)}
        {own('update-later-box', <Button key="update-later" variant="secondary" label="Later" onPress={hide} />)}
        {own('update-skip-box', <Button key="update-skip" variant="secondary" label="Skip" onPress={skip} />)}
      </Box>
    </Box>
  )
}

/** How long "Compact complete" stays above the prompt when nothing else clears it. */
const COMPACT_CARD_MS = 20_000
/** A settings part's body on desktop is as tall as the overview's row of cards, so the panel keeps its height going in
 * and out of a part. In lines (a Box height is a number of lines or a percentage) at the app's 19 px line: 56 px makes
 * the band 121.5 px tall in every part, as with the cards, measured on tools/render-band. */
const SETTINGS_BODY_H = 56 / 19
/** The space between the rows of an open settings card, in lines: a little over half a row (half a row read cramped). */
const CARD_ROW_GAP = 0.6
/** What a new group of a card (the limits after the lean and its line) has above it on top of CARD_ROW_GAP, in lines. */
const CARD_GROUP_GAP = 0.15
/** The card ✕'s hover: the app's ghost fill is lost on the green and violet cards, so a darker wash of the card itself. */
const CARD_CLOSE_HOVER = '#00000040'
/** A handoff's or compact's card for the band above the prompt: while it runs, and once landed until the next message
 * is sent, the ✕ is pressed or its time has passed (COMPACT_CARD_MS, HANDOFF_CARD_MS). */
async function compactCard($: EngineInterface, working = false) {
  const card = await read($, handoffCard)
  if (!card || cardRunning(card.kind)) return card
  const keep = card.kind === 'compacted' ? COMPACT_CARD_MS : HANDOFF_CARD_MS
  if (working || (card.kind === 'compacted' && card.seen) || (await $.clock.now()) - card.at >= keep) return null
  return card
}

/** The glow behind the white Handoff button. Check a change on tools/render-band before shipping: an earlier glow looked
 * tight in a preview but far bigger and blurrier in the app. */
const HANDOFF_GLOW = true
/** Context share from which the dashboard's Handoff button turns white: below it a handoff saves little. */
const HANDOFF_LOUD_AT = 30
// Handoff is calm until Haiku says a fresh chat would suit now (handoffAdvice); then it is the white box with a glow.
// What the band last read from handoffAdvice, so the drawing helpers need no await.
let adviceNow: string | null = null
const HANDOFF_ADVICE_LEVEL = 50
// "Always" (the Handoff button setting) keeps the slot as Handoff, calm in a grey box, and loud only once advised.
const handoffLevel = () => (adviceNow ? HANDOFF_ADVICE_LEVEL : config.handoffButton === 'always' ? HANDOFF_BOX_AT : 0)
const handoffLoud = () => adviceNow !== null
const handoffSlot = () => handoffLoud() || config.handoffButton === 'always'
/** Handoff's box: it fades in, grey, up to HANDOFF_BOX_AT, then lightens to white by HANDOFF_LOUD_AT, where the glow
 * takes over (it grows to 80%). A glow only ever sits around the white box. */
const HANDOFF_BOX_AT = 15
const HANDOFF_PILL_W = 66
const HANDOFF_PILL_H = 19
/** Handoff's look at `percent` of context, a step each percent: no box at 0, the grey box by HANDOFF_BOX_AT, white by
 * HANDOFF_LOUD_AT. The label goes from dim to white, and dark once the box is light enough to need it. */
export function handoffLook(percent: number, hovered = false): { fill: string; opacity: number; edge: string; label: string } {
  // Hovered, the box is there even on a fresh chat and a few steps lighter.
  const p = Math.max(hovered ? HANDOFF_BOX_AT : 0, Math.min(HANDOFF_LOUD_AT, Math.round(percent) + (hovered ? 5 : 0)))
  const mix = (a: string, b: string, k: number) => {
    const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    return `#${[0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k).toString(16).padStart(2, '0')).join('')}`
  }
  if (p <= HANDOFF_BOX_AT) {
    const k = p / HANDOFF_BOX_AT
    return { fill: HOVER_BOX, opacity: k, edge: mix(DASH_BG, '#3a3a40', k), label: mix(DASH_DIM, '#ececf0', k) }
  }
  const k = (p - HANDOFF_BOX_AT) / (HANDOFF_LOUD_AT - HANDOFF_BOX_AT)
  return { fill: mix(HOVER_BOX, '#ececf0', k), opacity: 1, edge: mix('#3a3a40', '#ffffff', k), label: k > 0.45 ? '#141416' : '#ececf0' }
}
/** Handoff's box as drawn (see handoffLook). */
export function handoffPillSvg(percent: number, hovered = false): string {
  const l = handoffLook(percent, hovered)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${HANDOFF_PILL_W}" height="${HANDOFF_PILL_H}" viewBox="0 0 ${HANDOFF_PILL_W} ${HANDOFF_PILL_H}"><rect x=".5" y=".5" width="${HANDOFF_PILL_W - 1}" height="${HANDOFF_PILL_H - 1}" rx="6" fill="${l.fill}" fill-opacity="${l.opacity.toFixed(3)}" stroke="${l.edge}" stroke-opacity="${l.opacity.toFixed(3)}"/></svg>`
}
/** How hard the glow behind Handoff pulls: 0 below HANDOFF_LOUD_AT, then 1 to 5, one step per 10% of context. */
export function handoffGlowStep(percent: number): number {
  return percent < HANDOFF_LOUD_AT ? 0 : Math.min(5, 1 + Math.floor((percent - HANDOFF_LOUD_AT) / 10))
}
/** The glow behind the Handoff button, one design per step, drawn on a screenshot of the real bar: a tight violet rim
 * just past the button (about 121 by 32 px there), wider, softer and brighter each step, pulsing between a low and a
 * peak. Centred on the button by the layer the dashboard puts it in. */
const GLOW_LEVELS: ReadonlyArray<{ spread: number; blur: number; peak: number; low: number; period: number }> = [
  { spread: 0, blur: 0, peak: 0, low: 0, period: 0 },
  { spread: 1.5, blur: 1.2, peak: 0.55, low: 0.2, period: 3.4 },
  { spread: 2, blur: 1.5, peak: 0.65, low: 0.25, period: 2.8 },
  { spread: 2.5, blur: 1.8, peak: 0.75, low: 0.3, period: 2.3 },
  { spread: 3, blur: 2.1, peak: 0.85, low: 0.35, period: 1.9 },
  { spread: 3.5, blur: 2.4, peak: 0.95, low: 0.4, period: 1.5 },
]
/** The glow's drawing in CSS px, measured on a faithful render of the desktop band (tools/render-band): the primary
 * Handoff button is 77 by 20 with a 6 px radius, and the band leaves 8 px above and below it. The drawing is no wider
 * than the layer it sits in, so the app never scales it (a Svg is at most as wide as its box). */
const GLOW_W = HANDOFF_PILL_W + 16
const GLOW_H = HANDOFF_PILL_H + 16
const GLOW_BUTTON = { w: HANDOFF_PILL_W, h: HANDOFF_PILL_H, r: 6 }
export function handoffGlowSvg(step: number, nowMs = 0): string {
  const { spread: e, blur, peak, low, period } = GLOW_LEVELS[step]
  // The pulse's place from the clock, so a redraw does not restart it from the low point.
  const lock = (svg: string) => inPhase(svg, nowMs % (period * 1000))
  const x = (GLOW_W - GLOW_BUTTON.w) / 2 - e
  const y = (GLOW_H - GLOW_BUTTON.h) / 2 - e
  return lock(`<svg xmlns="http://www.w3.org/2000/svg" width="${GLOW_W}" height="${GLOW_H}" viewBox="0 0 ${GLOW_W} ${GLOW_H}"><style>.g{animation:p ${period}s ease-in-out infinite}@keyframes p{0%,100%{opacity:${low}}50%{opacity:${peak}}}</style><defs><filter id="b" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><g class="g" filter="url(#b)"><rect x="${x}" y="${y}" width="${GLOW_BUTTON.w + 2 * e}" height="${GLOW_BUTTON.h + 2 * e}" rx="${GLOW_BUTTON.r + e}" fill="${ACCENT}"/></g></svg>`)
}

/** How long the switch's knob takes to slide after a click. */
const AUTO_SLIDE_MS = 260
/** Auto as a switch: a pill with its knob right and violet when on, left and grey when off. `slide` draws the move from
 * the other side, for the redraw right after a click only (every redraw replays an image's animation). */
export function autoSwitchSvg(on: boolean, slideMs: number | null = null): string {
  const slide = slideMs !== null && slideMs < AUTO_SLIDE_MS
  const t = `${AUTO_SLIDE_MS / 1000}s cubic-bezier(.3,.7,.2,1)`
  // On: the same orange on dark and light in navy & orange (data-keep: the light turn leaves it), as the lab's switch.
  const lit = switchOn()
  const keep = on && config.theme === 'navy' ? ' data-keep="1"' : ''
  const css = slide
    ? `<style>.k{animation:k ${t}}.p{animation:p ${t}}@keyframes k{from{transform:translateX(${on ? -11 : 11}px);fill:${on ? '#8b8b93' : '#ffffff'}}}@keyframes p{from{fill:${on ? '#2c2c31' : lit};stroke:${on ? '#4a4a52' : lit}}}</style>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="15" viewBox="0 0 26 15">${css}<rect class="p"${keep} x=".5" y=".5" width="25" height="14" rx="7" fill="${on ? lit : '#2c2c31'}" stroke="${on ? lit : '#4a4a52'}"/><circle class="k" data-keep="1" cx="${on ? 18.5 : 7.5}" cy="7.5" r="5" fill="${on ? '#ffffff' : '#8b8b93'}"/></svg>`
  return slide ? inPhase(svg, slideMs) : svg
}
/** The handoff bar's Quick | Full switch: a dark track with both words in it and a light knob under the picked one,
 * as tall as Go (20 px, 5 px radius, measured on tools/render-band) so the row's controls line up,
 * KIND_CELLS wide each half (the words are app Text laid over it; an image would draw them in another font). */
const KIND_CELLS = 9
/** One cell of the desktop band in CSS px (`1ch` of its font, measured on tools/render-band). */
const CELL_PX = 7.9
const KIND_W = Math.round(KIND_CELLS * 2 * CELL_PX)
const KIND_H = 20
/** The track and the knob under `kind`; `slideMs` slides the knob over from the other half, for the redraw right
 * after a click only (every redraw replays an image's animation). */
export function kindSwitchSvg(kind: 'quick' | 'full', slideMs: number | null = null): string {
  const half = KIND_W / 2
  const at = (k: 'quick' | 'full') => (k === 'full' ? half + 0.5 : 2)
  const slide = slideMs !== null && slideMs < KIND_SLIDE_DELAY_MS + KIND_SLIDE_MS
  // It starts a beat after the click: the click redraws the whole bar, its large art included, and a slide in those
  // same frames stuttered. SMIL, not CSS: it moves the knob's own x, held at the old side until it begins.
  const from = at(kind === 'full' ? 'quick' : 'full')
  const begin = slideMs === null ? 0 : KIND_SLIDE_DELAY_MS - slideMs
  const move = slide
    ? `<animate attributeName="x" from="${from}" to="${at(kind)}" begin="${(begin / 1000).toFixed(3)}s" dur="${KIND_SLIDE_MS / 1000}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".3 .7 .2 1"/>`
    : ''
  // The track is the app's Select (white at 5%, a 1 px inset edge of white at 10%, 6 px corners), so the row reads as
  // one set; the knob sits 2 px inside it.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${KIND_W}" height="${KIND_H}" viewBox="0 0 ${KIND_W} ${KIND_H}"><rect x=".5" y=".5" width="${KIND_W - 1}" height="${KIND_H - 1}" rx="5.5" fill="#ffffff" fill-opacity=".05" stroke="#ffffff" stroke-opacity=".1"/><rect x="${slide ? from : at(kind)}" y="2" width="${half - 2.5}" height="${KIND_H - 4}" rx="4" fill="#ffffff" fill-opacity=".14">${move}</rect>${slide ? `<!--${kindFlipAt}-->` : ''}</svg>`
}
/** The bar's calm button: it opens the compact bar, which offers Handoff too. */
export const SLIM_LABEL = 'Reduce context'
const KIND_SLIDE_MS = 300
const KIND_SLIDE_DELAY_MS = 70
// When the handoff bar's Quick | Full last changed, for the knob's slide. Stamped into the slide's image too: going
// back and forth drew the same image twice, and the app reused it without playing the slide again.
let kindFlipAt = 0
/** This install's id, smarttokensaver@<marketplace>, read off the cache path (…/plugins/cache/<marketplace>/smarttokensaver/<version>). */

// When the judge started, and when it gave its verdict (null while it decides).
let judgeStartedAt = 0
let judgeEndedAt: number | null = 0
/**
 * Whether the bar's mark pulses at `nowMs`: while the judge runs, and after it until the pulse in progress has played
 * to its end. At least one whole pulse, so a quick verdict still shows that it was judged; never cut off halfway.
 */
export function pulseShows(nowMs: number, startedAt: number, endedAt: number | null): boolean {
  if (endedAt === null) return true
  const pulses = Math.max(1, Math.ceil((endedAt - startedAt) / MARK_PULSE_MS))
  return nowMs < startedAt + pulses * MARK_PULSE_MS
}
async function endJudging($: EngineInterface, why: string) {
  if (judgeEndedAt !== null) return
  judgeEndedAt = await $.clock.now().catch(() => Date.now())
  // The mark's last pulse ends after the judge: the bar is drawn again then, so it stops on its resting frame.
  const pulseLeft = judgeStartedAt + Math.max(1, Math.ceil((judgeEndedAt - judgeStartedAt) / MARK_PULSE_MS)) * MARK_PULSE_MS - judgeEndedAt
  if (pulseLeft > 0) $.clock.after(pulseLeft + 40, () => $.ui.invalidate('ui.render'))
  renderLog.push(`${new Date().toISOString()} ${loadedSession} judge: ${why} ${judgeEndedAt - judgeStartedAt} ms after start`)
  $.ui.invalidate('ui.render')
}

// When the bar last saw Auto off or on, and when it last changed (for the slide).
let autoSeen: boolean | undefined
let autoFlipAt = 0
let helpersSeen: string | undefined
let helpersFlipAt = 0

/** The terminal's status line under the prompt (Settings → Customize → Terminal → Below prompt): the bar's first line,
 *  in words. Handoff advice comes first; the bar itself still shows above while there is some (see the AbovePrompt hook). */
async function bottomStatus($: EngineInterface): Promise<string> {
  const v = await snap($)
  const advice = (await read($, handoffAdvice)) ?? null
  const cacheShown = config.hide.includes('timer') || (v.cacheNow !== null && v.cacheNow <= 0) ? null : v.cacheNow
  const { what } = dashboardLines({
    modelName: modelDisplayName(sessionModelId) ?? MODELS.find(m => m.key === v.modelNow)?.label,
    auto: v.auto,
    paused: Boolean(v.pausedNow),
    judging: Boolean(v.judging),
    effort: effortOf(v, v.modelNow ?? (await sessionModel($))),
    cacheNow: null,
    contextPercent: null,
    reason: '',
    last: null,
  })
  // The engine cuts the tail where the row ends, so what matters most comes first: Handoff advice, the effort, the
  // context, and the cache last.
  const context = lastContext && lastContext.window && limits().trigger !== null ? `${Math.round(lastContext.percent)}% context` : null
  const cache = cacheShown === null ? null : `cache ${cacheLabel(cacheShown)}`
  return [advice ? 'Handoff would suit' : null, `✦ ${what}`, context, cache].filter(Boolean).join(' · ')
}

/** The dashboard: what Smart Token Saver is doing, and Auto, Handoff and settings. The slot above the prompt at rest. */
async function dashboardBand($: EngineInterface, e: RenderInput<'AbovePrompt'>) {
  const els = themedEls($.ui.resolve(e), e.surface)
  const { Box, Text, Button } = els
  const v = await snap($)
  adviceNow = (await read($, handoffAdvice)) ?? null
  await introShows($, 'dash')
  // The first draw since another band stood here.
  const entering = introFresh
  introFresh = false
  const nowMs = await $.clock.now()
  if (autoSeen !== undefined && autoSeen !== v.auto) {
    autoFlipAt = nowMs
    // No redraw to end the slide: it finishes inside its image, and every redraw rebuilds the buttons under a
    // resting pointer, which flickers their hover.
  }
  autoSeen = v.auto
  const effortNow = effortOf(v, v.modelNow ?? (await sessionModel($)))
  const by = v.current?.by
  const reason = v.current
    ? `${by === 'manual' || by === 'named' ? 'You' : HAIKU}: ${v.current.why}`
    : v.auto
      ? 'Smart picks the effort at the next prompt'
      : 'You pick the effort'
  // Desktop draws the cache after the context ring, grey, with a hover that explains both; the terminal says it inline.
  const drawn = e.surface !== 'terminal' && 'Svg' in els
  // A cold cache is the cold band's to say; the resting bar shows the countdown only while there is one.
  const cacheShown = config.hide.includes('timer') || (v.cacheNow !== null && v.cacheNow <= 0) ? null : v.cacheNow
  const { head, what, rest, detail } = dashboardLines({
    modelName: modelDisplayName(sessionModelId) ?? MODELS.find(m => m.key === v.modelNow)?.label,
    auto: v.auto,
    paused: Boolean(v.pausedNow),
    judging: Boolean(v.judging),
    effort: effortNow,
    cacheNow: drawn ? null : cacheShown,
    // Desktop draws the context as a ring and a figure (as the swamp band does); the terminal says it in words.
    contextPercent: e.surface === 'terminal' && lastContext && lastContext.window && limits().trigger !== null ? lastContext.percent : null,
    // A prompt on a cheaper model names it in the judge's line ("On Sonnet · Haiku: a small fix"), not beside the effort word.
    // The desktop names who picked beside Smart, "(Haiku 5.5)", and says why on hover (the line was cut off in the bar).
    reason: adviceNow ? `Handoff would suit: ${adviceNow}` : config.hide.includes('reason') || drawn ? '' : reason,
    // The last reply's cost is left out of the bar: it was noise there.
    last: null,
  })
  const toggleSettings = async () => {
    if (await read($, settingsOpen)) {
      await update($, settingsDraft, () => ({}))
      await update($, settingsOpen, () => false)
      $.ui.invalidate('ui.render')
    } else await openPluginSettings($)
  }
  const buttons = [
    // Auto sits in the bar on both: in the terminal the effort row under the band drops its own (autoInBar), since
    // there it was cut off at the window's foot. The hotkey only in the terminal; the app draws it faint on grey.
    e.surface === 'terminal' ? (
      <Button key="dash-auto" hotkey="a" variant={v.auto ? 'primary' : undefined} label={v.auto ? 'Smart' : 'Default'} onPress={() => toggleAutoEffort($)} />
    ) : (
      <Button key="dash-auto" variant="secondary" dimColor={!v.auto} label={v.auto ? 'Smart' : 'Default'} onPress={() => toggleAutoEffort($)} />
    ),
    // Once the slot is Handoff (advised, or the setting says always), Compact stays beside it as quiet text, so both are
    // a press away. Desktop only, where there is room for it; the terminal compacts in one press from its own rows.
    ...(e.surface !== 'terminal' && 'Svg' in els && !config.hide.includes('handoff') && handoffSlot() && (typeof e.props.bodyColumns !== 'number' || e.props.bodyColumns >= COMPACT_BUTTON_MIN_COLUMNS)
      ? [<Button key="dash-compact" plain dimColor hover={{ scope: 'dash-compact', backgroundColor: HOVER_BOX }} label="Compact" onPress={() => openCompact($, e)} />]
      : []),
    // More room for this chat (R10) is not in the bar: it crowded it, and Settings → Context size and the swamp band
    // offer it.
    ...(config.hide.includes('handoff')
      ? []
      : [
          // One button in one place: Compact until Haiku says a fresh chat would suit, then Handoff, loud. Pressing it opens
          // the matching card, which can switch to the other. Desktop draws it: no box on a fresh chat, then a
          // step a percent of context to a white box (handoffLook), the label as Text over the box and
          // a blank button over both to take the click. The terminal keeps the plain buttons: grey, white from
          // HANDOFF_LOUD_AT.
          // Calm (no advice, no Always): plain Reduce context, the same button as Context size, its hover the bar's own box. It
          // is the way into both (Compact, and Handoff from there), so it is not called Compact.
          'Svg' in els && e.surface !== 'terminal' && handoffLevel() === 0 ? (
            // The icon and the words in the flow, one blank button over both (as the cog): the footer's Reduce button
            // has the same icon, so the two read as one thing.
            // The box is the button's shape (the app's own size and corners) and lights itself under the pointer; the
            // blank button over it lights nothing, since the window that cuts it to the box would cut its fill square.
            <Box key="dash-reduce" position="relative" flexShrink={0} flexDirection="row" alignItems="center" gap={1} {...BUTTON_BOX}
              hover={{ backgroundColor: HOVER_BOX }}>
              <els.Svg source={rowIconSvg('reduce', DASH_DIM)} alt="Reduce" width={14} height={14} />
              <Text dimColor>{SLIM_LABEL}</Text>
              <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                <Box flexShrink={0}>
                  <Button key="dash-handoff" plain hover={{ backgroundColor: '#00000000' }} label={'\u00a0'.repeat(24)} onPress={() => openCompact($, e)} />
                </Box>
              </Box>
            </Box>
          ) : 'Svg' in els && e.surface !== 'terminal' && !handoffLoud() ? (
            // Always, not advised: Handoff sits beside Compact as the same quiet button, each opening its own bar.
            <Button key="dash-handoff" plain dimColor hover={{ scope: 'dash-handoff', backgroundColor: HOVER_BOX }} label="Handoff" onPress={() => openHandoffBar($)} />
          ) : 'Svg' in els && e.surface !== 'terminal' ? (
            <Box key="dash-handoff-wrap" flexShrink={0} flexDirection="row">
              {/* No glow while a reply runs: the band redraws then, and each redraw restarted the glow, so it flickered. */}
              {HANDOFF_GLOW && handoffLoud() && !e.props.isWorking ? (
                <Box key="dash-glow" position="absolute" top={0} bottom={0} left={-2} right={-2} alignItems="center" justifyContent="center">
                  <els.Svg source={handoffGlowSvg(handoffGlowStep(handoffLevel()), nowMs)} alt="handoff glow" width={GLOW_W} height={GLOW_H} />
                </Box>
              ) : null}
              {/* The H key, once Handoff is loud: on a button of its own, clipped away, since a blank button with a
                  hotkey draws its letter over the label. */}
              {handoffLoud() ? (
                <Box key="dash-handoff-key" width={0} height={1} overflow="hidden">
                  <Button key="dash-handoff-h" plain hotkey="h" label="Handoff" onPress={() => openHandoffBar($)} />
                </Box>
              ) : null}
              {/* Its width is a spacer in the flow, not the image: the app can lay an image out at no width, and the
                  label (centred over it) then ran into Auto. */}
              <Box key="dash-handoff-box" flexShrink={0} flexDirection="row" alignItems="center">
                <Box width={9} height={1} flexShrink={0} />
                <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
                  <els.Svg source={handoffPillSvg(handoffLevel())} alt="Handoff box" width={HANDOFF_PILL_W} height={HANDOFF_PILL_H} />
                </Box>
                {/* Its hover: a lighter pill shown over the box, not the app's ghost fill, which is sized to the blank
                    label and sat off the drawn box. */}
                <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center"
                  display="none" hover={{ scope: 'handoff', display: 'flex' }}>
                  <els.Svg source={handoffPillSvg(handoffLevel(), true)} alt="Handoff box" width={HANDOFF_PILL_W} height={HANDOFF_PILL_H} />
                </Box>
                <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
                  <Text color={handoffLook(handoffLevel()).label} hover={{ scope: 'handoff', color: handoffLook(handoffLevel(), true).label }}>{handoffSlot() ? 'Handoff' : 'Compact'}</Text>
                </Box>
                <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
                  <Button key="dash-handoff" plain label={' '.repeat(14)} hover={{ scope: 'handoff', backgroundColor: '#00000000' }} onPress={() => (handoffSlot() ? openHandoffBar($) : openCompact($, e))} />
                </Box>
              </Box>
            </Box>
          ) : handoffLoud() ? (
            <Button key="dash-handoff" variant="primary" hotkey="h" label="Handoff" onPress={() => openHandoffBar($)} />
          ) : (
            <Button key="dash-handoff" variant="secondary" label="Handoff" onPress={() => openHandoffBar($)} />
          ),
        ]),
    // The terminal says it in a word; the desktop draws an icon, with this button laid blank over it to take the click.
    // No-break spaces, not braille blanks: some fonts draw U+2800 as a dot.
    // The desktop's blank one lights nothing: the cog's box around it does, in the button's round shape.
    'Svg' in els && e.surface !== 'terminal'
      ? <Button key="dash-settings" plain hover={{ backgroundColor: '#00000000' }} label={'\u00a0'.repeat(8)} onPress={toggleSettings} />
      : <Button key="dash-settings" plain hover={{ scope: 'dash-settings', backgroundColor: HOVER_BOX }} label="Settings" onPress={toggleSettings} />,
  ].filter(Boolean)
  // The terminal flashes the effort word as the desktop does: violet on a change, fading back to white.
  if (e.surface === 'terminal')
    return terminalBand($, e, { key: 'dash', kind: 'calm', color: DASH_TEXT, bg: DASH_BG, edge: DASH_EDGE, title: head.replace(/^✦ /, ''), detail, buttons, autoInBar: true,
      word: { text: what, color: await effortFlash($, what, Boolean(v.judging), entering, v.auto), rest } })
  const Svg = 'Svg' in els ? els.Svg : undefined
  const wordColor = await effortFlash($, what, Boolean(v.judging), entering, v.auto)
  return (
    <Box key="dash" position="relative" flexDirection="row" alignItems="center" paddingX={1} overflow="hidden"
      {...panelFrame(DASH_BG)}>
      {/* No art behind the bar: off the terminal it is the app's own ground, plain. Switching Auto on draws no rim
          around it either (it read as a stray frame); the switch shows it. */}
      {/* While the judge decides, the word says Deciding with its dots; the bar draws no rim of its own (it read as a
          stray frame around the bar). */}
      {/* One row: the effort word, the context ring, the cache, then the reason and the last reply, dim. The word never shrinks;
          when room runs out the reason goes first (it shrinks a hundred times faster), then the cache, and the row clips
          rather than run under the buttons. Siblings, not nested: a shrunk parent let the word spill under the ring. */}
      <Box key="dash-words" position="relative" flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        <Box flexShrink={0} flexDirection="row">
          {Svg ? (
            // The mark, as it is, where the ✦ stood; faded while Auto is off.
            <Box key="dash-mark" flexShrink={0} marginRight={1} alignItems="center">
              <Svg source={v.judging || pulseShows(nowMs, judgeStartedAt, judgeEndedAt) ? inPhase(markLogoSvg(BRAND_ORANGE, 'thinking'), nowMs - judgeStartedAt) : markLogoSvg(BRAND_ORANGE, v.auto ? 'on' : 'off')} alt={v.judging ? `${PRODUCT_NAME} deciding` : PRODUCT_NAME} width={DASH_MARK_SIZE} height={DASH_MARK_SIZE} />
            </Box>
          ) : <Text color={v.auto ? ACCENT : DASH_DIM} bold>✦ </Text>}
          {/* A new effort shows in violet, then white (effortFlash): plain text in the app's font. An animated image of the
              word looked cheap: another font, a late start and a jump back to the text. */}
          <Text key="dash-level" color={wordColor} bold hover={{ scope: 'dash-effort' }}>{v.judging && Svg ? 'Deciding' : what}</Text>
          {/* The model this prompt runs on, dim, after the effort: the judge's routing to a cheaper model shows as it happens. */}
          {!v.judging && v.auto && MODELS.find(m => m.key === (routed ?? v.modelNow)) ? (
            <Text key="dash-model" color={DASH_DIM}>{` · ${MODELS.find(m => m.key === (routed ?? v.modelNow))!.label}`}</Text>
          ) : null}
          {/* While the judge decides: the progress bar's thinking dots, as a plain image (its CSS still runs, and a
              redraw does not restart it the way an interactive frame does). */}
          {v.judging && Svg ? (
            <Box key="dash-thinking" flexShrink={0} marginLeft={1} alignItems="center">
              <Svg source={thinkingSvg('planning')} alt="deciding" width={THINK_W} height={PILL_H} />
            </Box>
          ) : null}
        </Box>
        {rest ? (
          <Box flexShrink={detail ? 0 : 1} minWidth={0}>
            <Text color={DASH_TEXT} bold wrap="truncate">{rest}</Text>
          </Box>
        ) : null}
        {/* What shows when room runs out, most needed first: the effort and the context never shrink; the cache shrinks
            next and goes; the reason (dim, after it) goes first of all. Hovering the ring or the cache swaps the reason
            for what they mean. */}
        {Svg && lastContext && lastContext.window && limits().trigger !== null ? (
          <Box key="dash-ring" flexShrink={0} marginLeft={2} flexDirection="row" gap={1} alignItems="center"
            hover={{ scope: 'dash-cache' }}>
            <Svg source={ringSvg(windowShare().percent, DASH_TEXT)} alt={`${windowShare().text} used`} width={16} height={16} />
            <Text color={DASH_TEXT}>{windowShare().text}</Text>
          </Box>
        ) : null}
        {/* The tail: the cache, then the judge's reason, on one wrapping row one line high. The reason has no width of
            its own (it only takes what is left, truncated), so it always fits the first row and goes first; the cache
            keeps its fixed width (the ticking seconds never shift the row) and, once it no longer fits, wraps to the
            hidden second row whole, taking the reason with it. */}
        {Svg ? (
          <Box key="dash-tail" flexGrow={1} flexShrink={1} minWidth={0} height={1} overflow="hidden" flexDirection="row" flexWrap="wrap" marginLeft={2}>
            <Box width={0} height={1} />
            {cacheShown !== null ? (
              <Box key="dash-cache-time" width={11} flexShrink={0} hover={{ scope: 'dash-cache' }}>
                <Svg source={cacheClockSvg(cacheExpires - (await $.clock.now()), cacheShown === 0 ? ICE : (cacheColor(cacheShown) ?? DASH_DIM))}
                  alt={`cache ${cacheClock(cacheExpires - (await $.clock.now()))}`} width={84} height={17} />
              </Box>
            ) : null}
            {/* Over the reason (or the empty row when the reason is switched off), shown only while the effort, the ring or
                the cache is hovered, what they mean: a hover can only reveal, so each tip is a layer on the band's colour. */}
            <Box key="dash-detail" position="relative" width={0} flexGrow={1} flexShrink={1} minWidth={10} marginLeft={cacheShown !== null ? 2 : 0}>
              <Text dimColor wrap="truncate">{detail || ' '}</Text>
              <Box key="dash-cache-tip" position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor={DASH_BG}
                display="none" hover={{ scope: 'dash-cache', display: 'flex' }}>
                <Text dimColor wrap="truncate">{hoverTips(v).cache}</Text>
              </Box>
              <Box key="dash-why-tip" position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor={DASH_BG}
                display="none" hover={{ scope: 'dash-why', display: 'flex' }}>
                <Text dimColor wrap="truncate">{reason}</Text>
              </Box>
              <Box key="dash-effort-tip" position="absolute" top={0} left={0} right={0} bottom={0} backgroundColor={DASH_BG}
                display="none" hover={{ scope: 'dash-effort', display: 'flex' }}>
                <Text dimColor wrap="truncate">{hoverTips(v).effort}</Text>
              </Box>
            </Box>
          </Box>
        ) : detail ? (
          <Box key="dash-detail" flexShrink={1000} minWidth={0} marginLeft={2}>
            <Text dimColor wrap="truncate">{detail}</Text>
          </Box>
        ) : null}
      </Box>
      {/* The buttons in the flow, their real width and no more, so the words get all the rest. An empty absolute child
          makes the box positioned, which paints it over the art (a plain flow box sits under it and loses clicks). */}
      <Box minWidth={1} />
      <Box key="dash-actions" flexShrink={0} flexDirection="row" gap={1} alignItems="center" marginLeft={1}>
        <Box position="absolute" top={0} left={0} />
        {(() => {
          if (!Svg) return buttons
          // Why this effort, on the desktop: who picked beside Smart, the reason under the pointer.
          const whyShown = v.auto && !adviceNow && !config.hide.includes('reason')
          const whoPicked = by === 'manual' || by === 'named' ? 'You' : HAIKU
          // Auto as the settings' Subagents switch: the switch, then its word, grey like the other buttons (Smart: the
          // effort is picked per prompt; Default: the chat's effort from the app's picker stays),
          // with one blank button over both that takes the click and lights nothing (a see-through hover): the switch
          // itself shows the state. The button sits in a clipping box so the app never cuts its label to "…".
          const autoChip = (
            <Box key="dash-auto-switch" position="relative" flexDirection="row" alignItems="center" gap={1} hover={whyShown ? { scope: 'dash-why' } : undefined}>
              <Svg source={autoSwitchSvg(v.auto, nowMs - autoFlipAt)} alt={v.auto ? 'Smart effort on' : 'Default effort'} width={26} height={15} />
              <Box flexShrink={0}><Text dimColor>{v.auto ? 'Smart' : 'Default'}</Text></Box>
              {whyShown ? <Box key="dash-why" flexShrink={0}><Text color={DASH_DIM}>{`(${whoPicked})`}</Text></Box> : null}
              <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                <Box flexShrink={0}>
                  <Button key="dash-auto" plain hover={{ backgroundColor: '#00000000' }} label={'\u00a0'.repeat(40)} onPress={() => toggleAutoEffort($)} />
                </Box>
              </Box>
            </Box>
          )
          // The cog sits in the flow and the button in an absolute layer after it: an absolute layer paints over plain
          // ones, and the desktop ignores position="relative" on a Box without absolute children. A Button is at most as
          // wide as its box and writes "…" when cut by it, so it sits wider in a window that cuts it; the cog's box
          // (the app's button shape, square) lights under the pointer.
          const cog = (
            <Box key="dash-settings-icon" position="relative" flexShrink={0} flexDirection="row" alignItems="center" justifyContent="center"
              {...BUTTON_BOX} paddingX={0.715} hover={{ backgroundColor: HOVER_BOX }}>
              <Svg source={settingsSvg(DASH_TEXT)} alt="Settings" width={14} height={14} />
              <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                <Box flexShrink={0}>{buttons[buttons.length - 1]}</Box>
              </Box>
            </Box>
          )
          // A dim dot between the parts, so each reads on its own.
          const parts = [autoChip, ...buttons.slice(1, -1), cog]
          return parts.flatMap((part, n) => n === 0 ? [part] : [<Text key={`dash-sep-${n}`} color={DASH_DIM}>·</Text>, part])
        })()}
      </Box>
    </Box>
  )
}

/** The terminal's rows above the prompt (Effort steps, Auto, the model row when switched on) and, on any surface, the
 * judge's question when it suggests another model. The rows also sit under an alert band, so effort never goes away. */
async function effortRows($: EngineInterface, e: RenderInput<'AbovePrompt'>, opts: { auto?: boolean } = {}) {
  const { Box, Text, Button } = themedEls($.ui.resolve(e), e.surface)
  const v = await snap($)
  const { auto, autoModel, current, judging, wanted, shownByApp } = v
  const inUse = v.modelNow ?? (await sessionModel($))
  const effortNow = effortOf(v, inUse)
  // The model row is paused: effort first. SMARTTOKENSAVER_MODEL_UI=1 brings it back.
  const showModel = (await envModelUi($)) === '1'

  const setEffort = (level: Effort) => () => pickEffort($, level)
  // Picking a model yourself turns off Auto for model alone; accepting a suggestion leaves it on.
  const setModel = (model: ModelKey) => async () => {
    await update($, isAutoModel, () => false)
    await $.store.set('isAutoModel', false)
    await changeModel(model)
  }
  // The person sends /model, so the app's own control moves too; with a draft in the box the mod runs it.
  const changeModel = async (model: ModelKey) => {
    if (await typeCommand($, `/model ${model}`)) return
    await switchModel($, model)
  }
  const acceptSuggestion = (model: ModelKey) => () => changeModel(model)
  const toggleAutoModel = async () => {
    const turnOn = !(await read($, isAutoModel))
    await update($, isAutoModel, () => turnOn)
    await $.store.set('isAutoModel', turnOn)
    if (!turnOn) await update($, suggestion, () => null)
  }
  const dismiss = async () => {
    declined = wanted
    await update($, suggestion, () => null)
  }

  const question = wanted ? (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text>Switch to {MODELS.find(m => m.key === wanted)?.label}? The context reloads.</Text>
        <Button key="accept" variant="primary" label="Switch" onPress={acceptSuggestion(wanted)} />
        <Button key="decline" label="Keep" onPress={dismiss} />
      </Box>
    </Box>
  ) : null
  if (e.surface !== 'terminal') return { question, rows: null }

  const notAligned = current && !withoutEffort(inUse) && shownByApp && shownByApp !== current.effort
  const note = judging
    ? 'Deciding…'
    : notAligned
      ? `/effort shows ${EFFORT_LABELS[shownByApp as Effort] ?? shownByApp}`
      : current
        ? `${current.by === 'manual' ? 'You' : HAIKU}: ${current.why}`
        : auto
          ? 'Picks the effort at the next prompt'
          : 'Pick an effort'
  const modelRow = (
    <Box flexDirection="row" alignItems="center" gap={1}>
      {MODELS.map(m =>
        m.key === inUse ? (
          <Button key={`m-${m.key}`} variant="primary" label={m.label} onPress={setModel(m.key)} />
        ) : (
          <Button key={`m-${m.key}`} plain dimColor label={m.label} onPress={setModel(m.key)} />
        ),
      )}
      <Box flexGrow={1} />
      <Button
        key="auto-model"
        hotkey="m"
        variant={autoModel ? 'primary' : undefined}
        label={autoModel ? 'Auto on' : 'Auto off'}
        onPress={toggleAutoModel}
      />
    </Box>
  )
  const rows = (
    <Box flexDirection="column">
      {question}
      {showModel ? modelRow : null}
      <Box flexDirection="row" gap={1} alignItems="center">
        {/* The word never breaks: the note at the end gives way first. */}
        <Box flexShrink={0}>
          <Text dimColor>Effort</Text>
        </Box>
        {EFFORTS.map(level =>
          level === effortNow ? (
            <Button key={`e-${level}`} variant="primary" label={level} onPress={setEffort(level)} />
          ) : (
            <Button key={`e-${level}`} plain dimColor label={level} onPress={setEffort(level)} />
          ),
        )}
        <Box flexGrow={1} />
        {opts.auto === false ? null : (
          <Button
            key="auto"
            hotkey="a"
            variant={auto ? 'primary' : undefined}
            label={auto ? 'Smart' : 'Default'}
            onPress={() => toggleAutoEffort($)}
          />
        )}
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor wrap="truncate-end">
            {note}
          </Text>
        </Box>
      </Box>
    </Box>
  )
  return { question, rows }
}

// --- The agent panel (hooks/agents.tsx): the $ side, kept short ------------------------------------------------------

/** Changes one agent's record, if the panel knows it. */
async function agentSet($: EngineInterface, id: string, fn: (a: AgentRec) => AgentRec) {
  await update($, agentsState, list => (list.some(a => a.id === id) ? list.map(a => (a.id === id ? fn(a) : a)) : list))
}

/** An agent's loop ended: done when it answered, failed otherwise. */
async function agentEnded($: EngineInterface, id: string, reason: string) {
  const now = await $.clock.now()
  await agentSet($, id, a => ({ ...a, state: reason === 'answer' ? 'done' : 'failed', endedAt: now, toolSince: undefined, now: undefined }))
}

/** Adds a request's weighted tokens to its agent. */
async function agentCost($: EngineInterface, id: string, cost: number) {
  await agentSet($, id, a => ({ ...a, cost: (a.cost ?? 0) + cost }))
}

// Effort for helpers: the effort the judge picked for each subagent, by its id. A subagent's first request can come
// before its spawn resolves with the id (seen 2026-10-10), so a pick waits under the spawn's description and type
// until a request from an unknown subagent claims it through $.agent.list().
const helperPicks = new Map<string, Effort>()
let helperWaiting: { description: string; type: string; parentId?: string; effort: Effort }[] = []

/** What the judge reads for a subagent: its task, said to be one, so it judges the subagent's work. */
export function helperQuestion(prompt: string, type: string): string {
  return `${prompt.slice(0, 4000)}

[This is the task Claude gave a ${type} subagent, not a message from the person. Judge the effort that subagent needs to do it well.]`
}

/** The lowest effort a helper gets: medium, or the person's Min when higher, never above their Max. A helper's answer
 * goes back to the chat unchecked, and at low it miscounted where medium did not (bench/results/helpers-2026-10-10.md). */
export function helperFloor(floor: Effort, ceiling: Effort): Effort {
  const i = Math.min(Math.max(EFFORTS.indexOf(floor), EFFORTS.indexOf('medium')), EFFORTS.indexOf(ceiling))
  return EFFORTS[i]
}

/** The judge's effort for a subagent's task, within the person's slider, Min and Max and save mode; null without a verdict. */
async function helperEffort($: EngineInterface, prompt: string, type: string): Promise<Pick | null> {
  const { verdict } = await judge($, helperQuestion(prompt, type), null)
  if (!verdict) return null
  const saving = (await read($, saveUntil)) !== null
  const leaned = tipped(verdict.effort, verdict.sure, config.bias)
  const effort = capped(bounded(leaned, helperFloor(config.floor, config.ceiling), config.ceiling), saving)
  return { ...verdict, effort, why: effort !== leaned && EFFORTS.indexOf(leaned) < EFFORTS.indexOf(effort) ? `${verdict.why} (helpers start at medium)` : verdict.why }
}

/** The effort picked for this subagent, claiming a waiting pick the first time its id is seen. */
async function helperEffortOf($: EngineInterface, id: string): Promise<Effort | undefined> {
  const known = helperPicks.get(id)
  if (known || helperWaiting.length === 0) return known
  const info = (await $.agent.list().catch(() => [])).find(a => a.id === id)
  if (!info) return undefined
  const match = helperWaiting.find(w => w.description === info.description && w.type === info.type && w.parentId === info.parentId)
  if (!match) return undefined
  helperWaiting = helperWaiting.filter(w => w !== match)
  helperPicks.set(id, match.effort)
  return match.effort
}

/** Counts one request of a helper the judge steered, for /smarttokensaver stats. */
async function helperTally($: EngineInterface, usage: Parameters<typeof weighted>[0]) {
  await update($, saved, old => {
    const t = asSpent(old)
    return { ...t, helpers: { ...t.helpers, requests: t.helpers.requests + 1, cost: t.helpers.cost + weighted(usage) } }
  })
}

/** A file read or changed by the main chat or an agent: added to the map, its imports read the first time. */
async function fileTouched($: EngineInterface, path: string, edited: boolean, by: string) {
  const rel = relPath(path, await $.session.root())
  if (!rel) return
  const now = await $.clock.now()
  const known = (await read($, agentFiles)).find(f => f.path === rel)
  let imports: string[] | undefined
  if (!known || edited) imports = importsOf(rel, await $.fs.read(path).then(t => t.slice(0, 512_000), () => ''))
  await update($, agentFiles, list => withTouch(list, rel, edited, by, now, imports))
}

/** From the 1 s timer: an agent long in one tool call turns to waiting. Writes only when one changes. */
async function agentWaits($: EngineInterface) {
  if (!(await read($, agentsState)).length) return
  const now = await $.clock.now()
  // Against the list as it is at the write: an agent that ended or started meanwhile is not put back or dropped.
  await update($, agentsState, list => withWaits(list, now) ?? list)
}

// A compaction written by Haiku 5.5: Anthropic names compaction among the jobs it is built for, at a fraction of the
// chat model's price. Claude Code compacts with the chat's own model and has no setting for another, and the
// summarizer's request does not pass through turn.step, so the mod answers session.compact itself: the transcript as
// text, Haiku's summary back as the conversation. Anything that fails falls through to Claude Code's own compaction.
const COMPACT_MODEL = 'claude-haiku-5-5'
/** How often this load's session.compact hook ran, and whether it was seen not to run for a compaction (kept in the
 *  store: it holds for the organization). Blocked, Compact with: Auto cannot send anything to Haiku. */
let compactHookRuns = 0
/** How often the main chat's compaction came out of the hook as one (a summary, not a skip), in this load. */
let compactHookDone = 0
let compactHookBlocked = false
async function noteCompactHook($: EngineInterface, ran: boolean) {
  if (ran === !compactHookBlocked) return
  compactHookBlocked = !ran
  await $.store.set('compactHookBlocked', compactHookBlocked).catch(() => undefined)
  void proof($, `session.compact hook ${ran ? 'ran' : 'did not run: skipped by a plugin above it'}`)
  $.ui.invalidate('ui.render')
}
/** The most text sent to Haiku, prompt and instructions included: about 400k tokens even for dense code and tool output
 *  (about 3 characters a token), well inside its window. */
export const COMPACT_MAX_CHARS = 1_200_000
const COMPACT_SYSTEM = `You compact a conversation between a user and Claude Code, an AI coding agent, so the work can continue
in a fresh context that holds only your summary. Whoever reads it next knows nothing else about the conversation.

Write a detailed summary with these sections:
1. Primary request and intent: everything the user asked for, in detail, including changes of mind.
2. Key technical concepts: technologies, frameworks, constraints and decisions.
3. Files and code: every file read, created or edited, why it matters, and the important snippets or signatures.
4. Errors and fixes: what went wrong, how it was fixed, and any feedback the user gave about it.
5. Problem solving: what was solved and what is still being worked out.
6. All user messages: every message the user wrote that is not a tool result, briefly and in order.
7. Pending tasks: what the user asked for that is not done.
8. Current work: exactly what was being done right before this summary, with file names and code. The last few
messages come nearly uncut: carry the code and errors from them over in full, since the next step builds on them.
9. Next step: the next step, only if it follows directly from the user's latest request, quoting that request.

Be precise: keep names, paths, numbers, commands and error messages exact. Leave out pleasantries.
Reply with the summary only.`

/** The transcript as plain text for the summarizer: each message, its tool calls and their results, the long ones cut. */
// The last messages go to Haiku whole: the work in progress (the code just written, the error just seen) lives in their
// tool calls and results, and a 400-character cut lost it mid-task. Older tool results keep their first 4k characters.
export const COMPACT_TAIL = 12
export const COMPACT_TOOL_CHARS = 4000
const COMPACT_TAIL_CHARS = 200_000
export function compactTranscript(messages: readonly { role: string; text: string; toolUses?: readonly { tool: string; input: unknown; text?: string }[]; toolResults?: readonly { text?: string }[] }[], toolChars = COMPACT_TOOL_CHARS, tailChars = COMPACT_TAIL_CHARS): string {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)} …[${s.length - n} more characters]` : s)
  const tailFrom = messages.length - COMPACT_TAIL
  return messages
    .map((m, i) => {
      const inTail = i >= tailFrom
      const inputChars = inTail ? tailChars : 400
      const resultChars = inTail ? tailChars : toolChars
      const lines = [`${m.role === 'user' ? 'USER' : 'CLAUDE'}: ${m.text}`.trimEnd()]
      for (const t of m.toolUses ?? []) {
        lines.push(`  [${t.tool} ${cut(JSON.stringify(t.input ?? {}), inputChars)}]`)
        if (t.text) lines.push(`  → ${cut(t.text, resultChars)}`)
      }
      if (!m.toolUses?.length) for (const r of m.toolResults ?? []) if (r.text) lines.push(`  → ${cut(r.text, resultChars)}`)
      return lines.join('\n')
    })
    .join('\n\n')
}

/** The fullest transcript that fits COMPACT_MAX_CHARS less `reserve` (the system prompt and the instructions sent with
 *  it): cut tighter step by step, or nothing when even the tightest is too long. */
export function fitTranscript(messages: Parameters<typeof compactTranscript>[0], reserve = 0): string | null {
  for (const [tool, tail] of [[COMPACT_TOOL_CHARS, COMPACT_TAIL_CHARS], [1000, 20_000], [300, 4000]] as const) {
    const text = compactTranscript(messages, tool, tail)
    if (text.length + reserve <= COMPACT_MAX_CHARS) return text
  }
  return null
}

/** Who writes a compaction's summary: Haiku when Auto and the cache is cold, else the chat's own model. A precompute (a
 *  summary written ahead of time) is skipped when Haiku would write the real one, since it would go unused. */
export function compactPlan(compactWith: JudgeConfig['compactWith'], trigger: string, cold: boolean): 'haiku' | 'session' | 'skip' {
  if (compactWith === 'session' || !cold) return 'session'
  return trigger === 'precompute' ? 'skip' : 'haiku'
}

/** The transcript a precompute by the chat's model was taken over in this load (Claude Code answered it with a summary,
 *  not a skip), by fingerprint; null when there is none. */
let precomputedAt: string | null = null
/** A transcript's fingerprint: its length and the handles (or text) of its last messages. Null when it has none. */
export function transcriptPrint(messages: unknown): string | null {
  if (!Array.isArray(messages) || !messages.length) return null
  const tail = messages.slice(-3).map(m => {
    const o = (m ?? {}) as { handle?: unknown; role?: unknown; text?: unknown }
    return typeof o.handle === 'string' || typeof o.handle === 'number' ? `h:${String(o.handle)}` : `${String(o.role)}:${String(o.text ?? '').slice(0, 200)}`
  })
  return `${messages.length}|${tail.join('|')}`
}
/** Whether the settings carry a classic PreCompact hook, which can veto a compaction (it runs beneath this plugin). */
export function hasPreCompactHooks(settings: unknown): boolean {
  const hooks = (settings as { hooks?: { PreCompact?: unknown } } | null)?.hooks
  return Array.isArray(hooks?.PreCompact) && hooks.PreCompact.length > 0
}
/** Whether a plugin's hooks file (hooks/hooks.json, or the `hooks` object in its plugin.json) names a PreCompact hook.
 *  Text that does not parse counts as one: it cannot be ruled out. */
export function hooksFileHasPreCompact(text: string): boolean {
  if (!text.trim()) return false
  try {
    const o = JSON.parse(text) as { hooks?: unknown; PreCompact?: unknown }
    const inner = o && typeof o === 'object' && o.hooks && typeof o.hooks === 'object' && !Array.isArray(o.hooks) ? (o.hooks as Record<string, unknown>) : (o as Record<string, unknown>)
    return Array.isArray(inner.PreCompact) && inner.PreCompact.length > 0
  } catch {
    return /PreCompact/.test(text)
  }
}
/**
 * Whether anything that runs beneath this plugin may veto a compaction, as far as can be seen: a classic PreCompact hook
 * in the settings, or in an enabled plugin's hooks (hooks/hooks.json, plugin.json, or a hooks file plugin.json names).
 * Settings that cannot be read, a plugin list that cannot be read or does not parse while plugins are switched on, and a
 * plugin folder that cannot be judged (no manifest, an unreadable hooks module) count as yes: in doubt Claude Code
 * compacts, so whatever would veto gets its say. An enabled plugin with no install record is left out: Claude Code has
 * no folder to load it from, so it runs no hook (a stale entry for a plugin that is gone).
 * Folders named in CLAUDE_CODE_PLUGIN_DIRS are read too. A plugin loaded with the --plugin-dir flag alone is in no list
 * the plugin can read.
 */
async function compactVetoBelow($: EngineInterface): Promise<boolean> {
  const settings = await $.settings.read().then(v => v, () => null)
  if (!settings || typeof settings !== 'object') return true
  if (hasPreCompactHooks(settings)) return true
  const me = normPath($.plugin.root)
  // Plugins loaded from folders, as the environment names them (several split like PATH).
  const dirs = String((await Promise.resolve($.env.get('CLAUDE_CODE_PLUGIN_DIRS')).catch(() => '')) ?? '').trim()
  for (const dir of pluginDirList(dirs)) {
    if (normPath(dir) !== me && (await pluginVetoes($, normPath(dir)))) return true
  }
  const enabled = (settings as { enabledPlugins?: unknown }).enabledPlugins
  const on = enabled && typeof enabled === 'object' ? Object.entries(enabled as Record<string, unknown>).filter(([, v]) => v === true).map(([id]) => id) : []
  if (!on.length) return false
  const path = await installedPluginsPath($)
  const text = path ? String(await $.fs.read(path).catch(() => '')) : ''
  // Plugins are on, but where they sit cannot be read: none of them can be ruled out.
  if (!text.trim()) return true
  let installed: unknown
  try {
    installed = JSON.parse(text)
  } catch {
    return true
  }
  const records = installRecords(installed)
  const roots = new Set(records.filter(r => on.includes(r.id) && r.installPath && normPath(r.installPath) !== me).map(r => normPath(r.installPath)))
  for (const root of roots) {
    if (await pluginVetoes($, root)) return true
  }
  return false
}
/** The folders in CLAUDE_CODE_PLUGIN_DIRS: split at ";" where one is there or a drive letter leads, else at ":". */
export function pluginDirList(value: string): string[] {
  const v = value.trim()
  if (!v) return []
  return (/;/.test(v) || /^[A-Za-z]:[\\/]/.test(v) ? v.split(';') : v.split(':')).map(d => d.trim()).filter(Boolean)
}
/** Whether the plugin in `root` names a PreCompact hook (hooks/hooks.json, plugin.json, or a hooks file plugin.json
 *  names). A manifest that does not parse counts as one. */
async function pluginVetoes($: EngineInterface, root: string): Promise<boolean> {
  const hooksJson = String(await $.fs.read(`${root}/hooks/hooks.json`).catch(() => ''))
  if (hooksFileHasPreCompact(hooksJson)) return true
  // A hooks module registers its hooks in code: one that names PreCompact (classic.PreCompact) may veto, and one that
  // cannot be read cannot be ruled out.
  let modules: unknown = []
  try {
    modules = hooksJson.trim() ? (JSON.parse(hooksJson) as { modules?: unknown }).modules ?? [] : []
  } catch {
    return true
  }
  for (const file of Array.isArray(modules) ? modules : [modules]) {
    if (typeof file !== 'string') return true
    const code = await $.fs.read(`${root}/hooks/${file.replace(/^\.\//, '')}`).then(String, () => null)
    if (code === null || /PreCompact/.test(code)) return true
  }
  const manifest = String(await $.fs.read(`${root}/.claude-plugin/plugin.json`).catch(() => ''))
  // No manifest to read: what this plugin hooks cannot be told.
  if (!manifest.trim()) return true
  let hooks: unknown
  try {
    hooks = (JSON.parse(manifest) as { hooks?: unknown }).hooks
  } catch {
    return true
  }
  if (hooks && typeof hooks === 'object' && !Array.isArray(hooks) && hooksFileHasPreCompact(JSON.stringify(hooks))) return true
  for (const file of typeof hooks === 'string' ? [hooks] : Array.isArray(hooks) ? hooks : []) {
    if (typeof file !== 'string') return true
    if (hooksFileHasPreCompact(String(await $.fs.read(`${root}/${file.replace(/^\.\//, '')}`).catch(() => '')))) return true
  }
  return false
}
/** Haiku's summary of the transcript, or why there is none. */
async function haikuCompaction($: EngineInterface, messages: Parameters<typeof compactTranscript>[0], instructions?: string): Promise<{ text: string } | { fail: string }> {
  const asked = instructions?.trim() ? `\nThe user asked the summary to keep or stress: ${instructions.trim()}` : ''
  const transcript = fitTranscript(messages, COMPACT_SYSTEM.length + asked.length + 64)
  if (transcript === null) return { fail: `the chat is too long for ${HAIKU}` }
  const r = await $.model.complete({
    model: COMPACT_MODEL,
    system: COMPACT_SYSTEM,
    prompt: `${transcript}\n\n---\nWrite the summary now.${asked}`,
    maxTokens: 16000,
    effort: 'medium',
    timeoutMs: 240_000,
  })
  if (!r.isAnswered) return { fail: 'reason' in r ? String(r.reason) : 'no answer' }
  return r.text.trim().length > 200 ? { text: r.text.trim() } : { fail: 'the summary came back empty' }
}

/** The quick handoff written by Haiku from the transcript, for a chat whose cache went cold; null when it fails. */
async function haikuHandoff($: EngineInterface, messages: Parameters<typeof compactTranscript>[0]): Promise<string | null> {
  const transcript = fitTranscript(messages, HANDOFF_PROMPT.length + 200)
  if (!transcript) return null
  const r = await $.model.complete({
    model: COMPACT_MODEL,
    system: 'You read a conversation between a user and Claude Code, an AI coding agent, and write the handoff the user asks for.',
    prompt: `${transcript}\n\n---\n${HANDOFF_PROMPT}`,
    maxTokens: 4000,
    effort: 'medium',
    timeoutMs: 120_000,
  })
  return r.isAnswered && r.text.trim().length > 100 ? r.text.trim() : null
}

/** What /smarttokensaver answers to an argument it does not know, and to none. */
const COMMAND_LIST = `/${PLUGIN} takes: settings, setup, auto, save, handoff, handoff full, handoff note, window <size>|default, window this <size>|reset, guide, stats, support, switch, keep.`

export const register: Register = (on, options) => {
  loadedAt = Date.now()
  maintainerAt = null
  firstDrawLogged = false
  drawsTimed = 0
  config = readConfig(options)
  applyTheme()
  pluginOptions = options
  // The compaction window: added to the merged settings Claude Code runs under, never over a managed value, and only for
  // the merge itself (a read of one source answers as loaded).
  on('settings.read', async ($, e, next) => {
    const merged = await next(e)
    if (e.source !== undefined) return merged
    // A failure here must never break the settings Claude Code runs under: the merge stands as it was.
    // This chat's own window (More room) wins over the default, for this session only.
    const own = await chatWindowFor($).catch(() => null)
    return withWindowSafe(merged as Record<string, unknown>, e.layers as readonly { source: string; settings: Record<string, unknown> }[], effectiveWindow(config.compactWindow, own)) as typeof merged
  })
  on('session.compact', async ($, e, next) => {
    compactHookRuns++
    void noteCompactHook($, true).catch(() => undefined)
    // A subagent's own compaction: Claude Code's own.
    if (e.agentId !== undefined) return next(e)
    const cold = await chatIsCold($)
    const printNow = transcriptPrint(e.messages)
    // A summary the chat's model already wrote ahead of time over this same transcript (same fingerprint, Claude Code
    // took the precompute, and no note of the person's own after /compact) is reused by Claude Code at no cost: Haiku
    // would only pay again. A classic PreCompact hook beneath may veto the compaction: Haiku's answer would skip it,
    // so Claude Code compacts then.
    const precomputed = e.trigger !== 'precompute' && !e.instructions?.trim() && printNow !== null && precomputedAt === printNow
    const vetoBelow = await compactVetoBelow($).catch(() => true)
    const plan = precomputed || vetoBelow ? 'session' : compactPlan(config.compactWith, String(e.trigger), cold)
    const tokens = lastContext?.tokens
    // Ahead-of-time summaries would be written by the chat's model and then not used: none.
    if (plan === 'skip') return { skip: `${PRODUCT_NAME}: ${HAIKU} writes the summary when it is time` }
    const reported = e.trigger === 'precompute' ? undefined : await tokensReported($)
    const bySession = async (by: string) => {
      if (e.trigger !== 'precompute') void abCompaction($, { trigger: String(e.trigger), cold, by, tokens })
      const done = await next(e)
      const summed = Boolean(done && Array.isArray((done as { messages?: unknown }).messages))
      // A precompute counts only once Claude Code answered it with a summary (a veto keeps nothing).
      if (e.trigger === 'precompute') precomputedAt = summed ? printNow : null
      else {
        precomputedAt = null
        if (summed) {
          compactHookDone++
          await chatCompacted($, reported)
        }
      }
      void readWindow($).catch(() => undefined)
      return done
    }
    if (plan === 'session') return bySession('session')
    // The transcript comes with the event; read it if not (a test's engine hands none).
    const messages = Array.isArray(e.messages) && e.messages.length ? e.messages : await $.session.messages().catch(() => [])
    precomputedAt = null
    const got = await haikuCompaction($, messages, e.instructions).catch((error: unknown) => ({ fail: String(error).slice(0, 80) }))
    if ('fail' in got) {
      $.ui.toast(`${PRODUCT_NAME}: ${HAIKU} could not write the summary (${got.fail}). The chat's model writes it.`)
      return bySession('session after haiku failed')
    }
    lastHaikuCompact = Date.now()
    compactHookDone++
    if (e.trigger !== 'precompute') await chatCompacted($, reported)
    void abCompaction($, { trigger: String(e.trigger), cold, by: 'haiku', tokens })
    void readWindow($).catch(() => undefined)
    return {
      messages: [
        {
          role: 'user' as const,
          text: `This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation, written by Haiku 5.5 for ${PRODUCT_NAME}.\n\n${got.text}\n\nContinue the conversation from where it left off without asking the user any further questions.`,
          toolUses: [],
        },
      ],
    }
  })
  on('session.start', async ($, e, next) => {
    sessionStarted = Date.now()
    // A handoff this load knows nothing of (the plugin was reloaded while one was being written): its stage would
    // keep every later handoff from starting.
    if (!handoffQueued && !handoffDriving && !handoffTurnSent && handoffText === undefined && (await read($, handoffStage).catch(() => null)) !== null) {
      await update($, handoffStage, () => null).catch(() => undefined)
    }
    raisedHandled = false
    chatWindowChecked = false
    // Everything the first draw needs, asked for at once: one after the other they held the start (and with it the
    // band) for a second or more. What the draw does not need runs after, unawaited.
    const [sid, kept, storedAuto, storedAutoModel, storedPick, setupDone] = await Promise.all([
      $.session.id().catch(() => '?'),
      $.store.get('savedSettings').catch(() => null),
      $.store.get('isAuto').catch(() => null),
      $.store.get('isAutoModel').catch(() => null),
      $.store.get('pick').catch(() => null) as Promise<Pick | null>,
      $.store.get('setupDone').catch(() => null),
    ])
    // Which chat this load serves, and when it started: each chat has its own render log.
    loadedSession = String(sid).slice(0, 8)
    // Settings the app had no /config row for (see saveSetting), over the ones it passed in.
    keptApplied = false
    await applyKeptSettings($, kept ?? null)
    await loadHookFlags($)
    await Promise.all([
      typeof storedAuto === 'boolean' ? update($, isAuto, () => storedAuto) : null,
      typeof storedAutoModel === 'boolean' ? update($, isAutoModel, () => storedAutoModel) : null,
      // Auto off means the effort you chose should still be the one in force.
      storedAuto === false && storedPick && EFFORTS.includes(storedPick.effort) ? update($, pick, () => storedPick).then(() => { pickCarried = true }) : null,
      // The first time the mod runs, the setup guide opens above the prompt.
      setupDone !== true ? findOtherBuild($).then(() => update($, setupStep, () => firstSetupStep())).then(() => update($, setupPending, () => true)) : null,
    ])
    // The command file lists /smarttokensaver before the session starts; registering it here makes plain /smarttokensaver the
    // mod's own command afterwards, instead of the file run as a skill.
    void $.command.register({ name: PLUGIN, description: `${PRODUCT_NAME}: settings, setup, handoff, window, guide, stats.` }).catch(() => undefined)
    void $.fs.read(`${$.plugin.root}/.claude-plugin/plugin.json`).then(t => { ownVersion = String(JSON.parse(String(t)).version ?? '') }).catch(() => undefined)
    void afterLoad($).catch(() => undefined)
    void drainSetupSave($).catch(() => undefined)
    chatDefaultPicked = false
    void loadChatWindow($).then(() => readWindow($)).then(() => (setupDone === true ? adoptFileDefault($) : undefined)).catch(() => undefined)
    // Another effortless or Smart Token Saver install: asked in the setup, or once on a card of its own once the setup is done.
    void (setupDone === true ? findOtherBuild($).then(f => { if (f) $.ui.invalidate('ui.render') }) : Promise.resolve())
      .then(() => (otherFound ? undefined : warnDuplicate($)))
      .catch(() => undefined)
    // Old log files go after 30 days whether Measurement is still on or not: a log left from an earlier run is cleaned too.
    void cleanAbLogs($).catch(() => undefined)
    startTimers($, 'start')
    // Clear the status entry older versions set.
    $.ui.status(undefined)
    void $.session.model().then(m => modelIs($, m)).catch(() => undefined)
    renderLog.push(`${new Date().toISOString()} ${loadedSession} session.start (${e.surface ?? '?'}), ready in ${Date.now() - sessionStarted} ms`)
    void writeRenderLog($).catch(() => undefined)
    return next(e)
  })

  // A chat opened again later (resume, fork): the mod starts afresh and has seen no response, so the countdown would
  // stay blank on a cache long cold. The app says how long ago the last response was, and whether the cache has
  // likely lapsed: the countdown starts from there.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const r = e as { source?: string; seconds_since_last_response?: number; prompt_cache_likely_expired?: boolean }
    classicStart = { at: Date.now(), said: `${r.source ?? '?'}, ${r.seconds_since_last_response ?? '?'}s since reply, expired ${r.prompt_cache_likely_expired ?? '?'}` }
    if ((r.source === 'resume' || r.source === 'fork') && typeof r.seconds_since_last_response === 'number' && cacheExpires === 0) {
      const now = await $.clock.now()
      lastResponseAt = now - r.seconds_since_last_response * 1000
      const left = lastResponseAt + CACHE_TTL[cacheTtl]
      cacheExpires = r.prompt_cache_likely_expired || left <= now ? now - 1 : left
      await rememberCache($)
      await checkSwamp($).catch(() => undefined)
      await showCache($).catch(() => undefined)
      // The app opens the chat and draws its band while this runs; a redraw asked now can land before the band is
      // there, and the next came only with the 15 s cache tick. Ask again over the next seconds.
      $.ui.invalidate('ui.render')
      redrawSoon()
    }
    return result
  })

  // The handoff turn ended: keep its text; the session's timer clears the chat and sends it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) await agentEnded($, e.agentId, e.reason)
    if (!e.agentId) await setTurnBusy($, false)
    // This chat's own window, asked for and not confirmed yet: a read now says whether Claude Code took it.
    if (!e.agentId) {
      turnsSinceWanted++
      // The window can change between turns (/autocompact, another model): the bar shows the one in force, so read it
      // after every turn, not only every few minutes.
      void checkChatWindow($).then(() => readWindow($)).then(() => $.ui.invalidate('ui.render')).catch(() => undefined)
    }
    // A lower verdict for a message typed during the turn takes over now, if Auto is still on.
    if (!e.agentId && heldPick) {
      const held = heldPick
      heldPick = null
      if (await read($, isAuto)) await choose($, held)
    }
    // A landed handoff card stays under the first reply after it, and goes with the next.
    if (!e.agentId) {
      await update($, handoffCard, card => (!card || cardRunning(card.kind) ? card : card.seen ? null : { ...card, seen: true }))
    }
    if (!e.agentId && handoffTurnSent && (await read($, handoffStage)) === 'writing') {
      handoffTurnSent = false
      if (e.reason === 'answer' && e.answer.trim()) handoffText = e.answer
      else {
        await update($, handoffStage, () => null)
        $.ui.toast(`${PRODUCT_NAME}: the handoff was not written, nothing was cleared`)
      }
    }
    return result
  })

  // /smarttokensaver is a command file in the plugin (commands/smarttokensaver.md), so the app lists it before the session has
  // started; this hook answers it, and the file's text never reaches the model. Both spellings the app may use.
  on('command.run', async ($, e, next) => {
    // Claude Code's own /autocompact (typed, or put in the box by the plugin): read the window it leaves.
    if (e.command === 'autocompact') {
      const done = await next(e)
      void readWindow($).catch(() => undefined)
      return done
    }
    // Claude Code's own /compact, typed: where the session.compact hook is skipped (a policy plugin can do that), the
    // chat is compared before and after, so the size before stops counting at once.
    if (e.command === 'compact') {
      const before = await $.session.messages().catch(() => null)
      const reported = await tokensReported($)
      const doneBefore = compactHookDone
      const done = await next(e)
      if (compactHookDone === doneBefore && before && before.length) {
        const after = await $.session.messages().catch(() => null)
        if (after !== null && transcriptPrint(after) !== transcriptPrint(before)) await chatCompacted($, reported)
      }
      return done
    }
    if (e.command !== PLUGIN && e.command !== `${PLUGIN}:${PLUGIN}`) return next(e)
    const wanted = await read($, suggestion)
    const arg = e.args.trim().toLowerCase()
    const raw = e.args.trim()
    if (arg === 'guide') {
      const opened = await guideInBrowser($)
      return { text: opened ? `The guide is open in your browser: ${GUIDE_URL}` : `The guide: ${GUIDE_URL}` }
    }
    if (arg === 'window this' || arg.startsWith('window this ')) {
      const asked = raw.slice('window this'.length).trim()
      const max = windowState?.modelWindow ?? lastContext?.window ?? (await $.session.usage().then(u => u.context.window, () => undefined))
      const steps = chatWindowChoices(config.compactWindow, max)
      if (!asked) {
        if (chatOverride === null) return { text: `This chat uses your default, ${windowLabel(config.compactWindow)}.${steps.length ? ` Other sizes for this chat: ${steps.map(windowLabel).join(', ')}.` : ''}` }
        const words = chatWindowWords(chatOverride, chatWindowState(chatOverride, windowState, chatWindowChecked), windowState).card
        return { text: `This chat: ${words} /${PLUGIN} window this reset goes back to ${windowLabel(config.compactWindow)}.` }
      }
      if (['reset', 'default', 'off'].includes(asked.toLowerCase())) return { text: await setChatWindow($, null) }
      const w = parseWindow(asked)
      if (typeof w === 'number' && w === config.compactWindow) return { text: await setChatWindow($, null) }
      if (typeof w === 'number' && (!max || w <= max)) return { text: await setChatWindow($, w) }
      if (!max) return { text: "This model's window is not known yet. Try again after the first reply." }
      return { text: `Pick a size from 100k to ${windowLabel(Math.min(max, WINDOW_MAX))}, e.g. ${steps.slice(0, 3).map(windowLabel).join(', ')}. Or /${PLUGIN} window this reset.` }
    }
    if (arg === 'window' || arg.startsWith('window ')) {
      const asked = raw.slice('window'.length).trim()
      if (!asked) {
        const s = (await readWindow($)) ?? windowState
        return { text: `Compaction window: ${windowLabel(config.compactWindow)} set. ${windowNote(config.compactWindow, s)}` }
      }
      const w = parseWindow(asked)
      if (w === undefined) return { text: `Give a window between 100k and 1M tokens, like /${PLUGIN} window 300k, or /${PLUGIN} window default.` }
      // The same way Settings → New chats takes: where the hook does not set the window here, the size goes into the
      // settings file, or the answer says which line to send. It never says "applies" where nothing applied it.
      await readWindow($).catch(() => undefined)
      const said = await applyDefaultWindow($, w, async () => {
        await enqueueSettings($, { compactWindow: w === null ? 'default' : String(w) })
        await drainSetupSave($)
      })
      const now = await readWindow($).catch(() => windowState)
      if (said) return { text: said }
      if (w === null) return { text: "Compaction window: Claude Code's own from now on." }
      // Saved, but not said to apply where something else decides: a policy value, or a model that holds less.
      if (now?.policyValue !== undefined) return { text: `Saved ${windowLabel(w)} as your default. Your organisation sets the window (${windowLabel(now.policyValue)}), so it changes nothing here.` }
      if (now?.modelWindow && w > now.modelWindow) return { text: `Saved ${windowLabel(w)} as your default. This chat's model holds ${windowLabel(now.modelWindow)}, so here it changes nothing; it counts on a bigger model.` }
      return { text: `Compaction window set to ${windowLabel(w)}. It applies from the next message.` }
    }
    if (arg === 'support') {
      const maint = await maintainerClone($)
      const ownIsOn = await ownUpdatesOn($)
      // Looks now, so the line says what is true, not what a card may show elsewhere.
      const found = maint || !ownIsOn ? null : await checkOwnNow($).catch(() => 'failed' as const)
      const card = (await read($, ownCard)) as OwnCard | null
      const mp = found === 'found' ? await ownMarketplace($) : null
      const scope = mp && (INSTALL_SCOPES as readonly string[]).includes(mp.rec.scope) ? mp.rec.scope : 'user'
      const result = found === 'found' && card ? `${card.version} is out. Update with: claude plugin update ${mp?.id ?? `${PLUGIN}@<marketplace>`} --scope ${scope}${scope !== 'user' && mp?.rec.projectPath ? ` (in ${mp.rec.projectPath})` : ''}. It runs in every new chat; for this chat too: /reload-plugins ${RELOAD_ARGS}`
        : found === 'newest' ? 'up to date'
        : found === 'skipped' ? 'the newest version is skipped'
        : found === 'local' ? 'installed from a local folder, which is its own source'
        : found === 'failed' ? 'the check failed; try again later'
        : ''
      return {
        text: [
          `${PRODUCT_NAME} ${ownVersion || OWN_VERSION}`,
          `Updates: ${maint ? `from your clone at ${maint}` : ownIsOn ? `on, checks GitHub every 6 hours${result ? `; ${result}` : ''}` : 'off'}`,
          `Report a bug: ${bugReportUrl(ownVersion || OWN_VERSION)}`,
          ...(maint ? [`Maintainer tools: /${PLUGIN} maintainer`] : []),
        ].join('\n'),
      }
    }
    if (arg === 'maintainer' || arg.startsWith('maintainer ')) {
      const [, what = '', ...rest] = raw.split(/\s+/)
      const value = raw.split(/\s+/).slice(2).join(' ').trim()
      // Upstream updates and Measurement are a maintainer's: shown where the plugin runs from a clone of its repo.
      if (!(await maintainerClone($))) return { text: `Upstream updates and Measurement are for maintainers: they show where ${PRODUCT_NAME} runs from a git clone of its repo with an empty ${MAINTAINER_FILE} file in its top folder (see the README). Updates and Report a bug are under /${PLUGIN} support.` }
      if (what.toLowerCase() === 'updates') {
        if (!value) return { text: `Use /${PLUGIN} maintainer updates <folder of your local clone>, or /${PLUGIN} maintainer updates off.` }
        if (value.toLowerCase() === 'off') return { text: await setLabUpdates($, null) }
        const problem = await labFolderProblem($, value)
        if (problem) return { text: problem }
        return { text: await setLabUpdates($, value) }
      }
      if (what.toLowerCase() === 'measure') {
        if (!value) return { text: `Measurement: ${config.measureLog === 'on' ? `on, ${config.abControl} % control` : 'off'}. Use /${PLUGIN} maintainer measure <percent> with one of ${AB_STEPS.join(', ')}, or /${PLUGIN} maintainer measure off.` }
        if (value.toLowerCase() === 'off') return { text: await setLabMeasure($, null) }
        const share = Number(value.replace(/%$/, ''))
        if (!AB_STEPS.includes(share as (typeof AB_STEPS)[number])) return { text: `Use /${PLUGIN} maintainer measure <percent> with one of ${AB_STEPS.join(', ')}, or /${PLUGIN} maintainer measure off.` }
        return { text: await setLabMeasure($, share) }
      }
      void rest
      await loadLab($)
      const lab = await read($, maintainerUpdates)
      return {
        text: [
          `Maintainer tools (${lab?.on || config.measureLog === 'on' ? 'on' : 'off'})`,
          `Upstream updates: ${lab?.on ? `on, clone at ${lab.folder}; ${lastUpdateCheck}` : 'off'}`,
          `Measurement: ${config.measureLog === 'on' ? `on, control share ${config.abControl} %` : 'off'}${abCleanFailed ? `; cleanup left ${abCleanFailed} old log file${abCleanFailed === 1 ? '' : 's'} (or a folder that is a link) alone` : ''}`,
          `Change with /${PLUGIN} maintainer updates <folder>|off and /${PLUGIN} maintainer measure <percent>|off.`,
        ].join('\n'),
      }
    }
    if (arg === 'agents' || arg === 'agents demo') {
      if (arg === 'agents demo') {
        const now = await $.clock.now()
        await update($, agentsState, () => demoAgents(now))
        await update($, agentFiles, () => demoFiles(now))
        await update($, agentSteps, () => demoSteps())
      }
      await $.ui.open({ id: `${PLUGIN}-agents`, title: 'Agents' })
      return { text: arg === 'agents demo' ? 'The agent panel shows sample agents (a preview).' : 'The agent panel is open.' }
    }
    if (arg === 'auto') {
      await toggleAutoEffort($)
      return { text: (await read($, isAuto)) ? 'Smart: the effort is picked for every prompt.' : 'Default: the effort is the one you set in the app.' }
    }
    // A test aid: marks the cache cold now, so the Compact button can be tried without waiting out the hour.
    if (arg === 'hot') {
      // Shows the running-hot band now, to try it: the next check puts back the real figures.
      await update($, hotHidden, () => null)
      await $.store.set('hotClosed', null).catch(() => undefined)
      await update($, hot, () => ({ kind: 'five_hour', percent: 82, resetsAt: new Date(Date.now() + 2 * 3600_000).toISOString() }))
      $.ui.invalidate('ui.render')
      return { text: 'The running-hot band is showing now (a test). It goes away at the next check unless a limit really is close.' }
    }
    if (arg === 'swamp') {
      // Shows the swamp band now, to try it: the next check puts back the real figure.
      await update($, swampHiddenAt, () => null)
      await update($, swamped, () => SWAMP_TOKENS)
      $.ui.invalidate('ui.render')
      return { text: 'The swamp band is showing now (a test). It goes away at the next check unless the chat really is swamped.' }
    }
    if (arg === 'save') return { text: await toggleSave($) }
    if (arg === 'handoff note') return { text: keptHandoff ?? 'No handoff note is kept.' }
    if (arg === 'handoff' || arg === 'handoff full') {
      const full = arg === 'handoff full'
      const { after } = await lastHandoffChoice($)
      await startHandoff($, full, after)
      const what = handoffWhat({ kind: full ? 'full' : 'quick', after }, config.handoffSkill)
      return { text: `Writing the ${full ? 'full' : 'quick'} handoff. ${what.by}. ${what.then}` }
    }
    if (arg.startsWith('probe')) {
      probeLevel = Number(arg.slice(5).trim()) || 0
      await update($, settingsOpen, () => true)
      $.ui.invalidate('ui.render')
      return { text: `Probe ${probeLevel} drawn above the prompt (0 is the real panel). Tell me if you see it.` }
    }
    if (arg === 'debug') {
      const ago = (t: number) => (t ? `${Math.round((Date.now() - t) / 1000)}s ago` : 'never')
      const lastFork = (await $.store.get('lastFork').catch(() => null)) as { at: number; outcome: string } | null
      return {
        text: [
          `session.start ${ago(sessionStarted)}`,
          `app SessionStart: ${classicStart ? `${ago(classicStart.at)} (${classicStart.said})` : 'never'}`,
          `cache: ${cacheExpires === 0 ? 'not started' : `${await cacheMinutes($)} min left`}, shown ${await read($, cacheLeft)}, ttl ${cacheTtl}, last reply ${lastResponseAt ? ago(lastResponseAt) : 'none seen'}, replies seen ${repliesSeen}, forced ${coldForced}`,
          `band asked for ${renderCalls} times, last ${ago(lastRenderAt)}`,
          `band error: ${lastRenderError || 'none'}`,
          `last draw: ${lastRenderBranch || 'none'}`,
          `shell: ${lastShell || 'none'}`,
          `app sent: ${lastRenderProps || 'nothing'}`,
          `settings open: ${await read($, settingsOpen)}`,
          `setup step: ${await read($, setupStep)}`,
          `handoff: ${await read($, handoffStage)}`,
          `last fork: ${lastFork ? `${lastFork.outcome}, ${ago(lastFork.at)}` : 'none'}`,
          `hidden: ${config.hide.join(',') || 'nothing'}`,
          `model: ${config.modelAuto === 'on' ? `cheaper when it can, now ${routed ?? 'the chat\'s'}` : 'always the chat\'s'}`,
          lastRequest
            ? `last request: app asked ${lastRequest.appModel} at ${lastRequest.appEffort ?? 'none'}, sent ${lastRequest.model} at ${lastRequest.effort ?? 'none'}${lastRequest.model === lastRequest.appModel && lastRequest.effort === lastRequest.appEffort ? ' (unchanged)' : ` (changed by ${PRODUCT_NAME})`}, ${ago(lastRequest.at)}`
            : 'last request: none yet',
          `compact with: ${config.compactWith}${lastHaikuCompact ? `, last by ${HAIKU} ${ago(lastHaikuCompact)}` : ''}`,
          `window: set ${windowLabel(config.compactWindow)}, ${windowState ? `in use ${windowState.raw} (${windowState.source}), compaction at ${windowState.trigger ?? 'off'}${learnedTrigger !== null ? ` (runs later: ${learnedTrigger})` : ''}, ${windowStatus(config.compactWindow, windowState)}` : 'not read yet'}`,
          `version ${ownVersion || OWN_VERSION}, based on ${UPSTREAM_BASE}`,
        ].join(' | ') +
          // On its own line, easy to find: the model and effort the last request actually ran on.
          `
model used: ${lastRequest ? `${lastRequest.model} at ${lastRequest.effort ?? 'none'}` : 'none yet'}`,
      }
    }
    if (arg === 'settings') {
      await openPluginSettings($)
      return { text: `The ${PRODUCT_NAME} settings are open above the prompt.` }
    }
    if (arg === 'setup') {
      await findOtherBuild($)
      await update($, setupStep, () => firstSetupStep())
      $.ui.invalidate('ui.render')
      return { text: `The ${PRODUCT_NAME} setup is open above the prompt.` }
    }
    if (arg === 'bench') {
      const cases = (JSON.parse(await $.fs.read(`${$.plugin.root}/bench/judge-cases.json`)) as { cases: BenchCase[] }).cases
      const answers = await runBench($, cases)
      const report = benchReport(cases, answers)
      const stamp = new Date(await $.clock.now()).toISOString().slice(0, 16).replace(/[:T]/g, '-')
      const out = `${PLUGIN}-bench-${stamp}`
      await $.fs.write(`${out}.json`, JSON.stringify({ cases: cases.length, answers }, null, 2))
      await $.fs.write(`${out}.md`, report)
      return { text: `${report}

Saved to ${out}.md and .json` }
    }
    if (arg === 'cold') {
      coldForced = true
      cacheExpires = await $.clock.now()
      await update($, cacheLeft, () => 0)
      $.ui.invalidate('ui.render')
      return { text: 'The cache shows as cold now (a test). Compact is in the footer. The next response restarts the countdown.' }
    }
    if (arg === 'stats' || arg === 'saved') return { text: `Smart effort, this session:\n${savedText(await read($, saved))}` }
    if (arg === 'switch' || arg === 'keep') {
      if (!wanted) return { text: 'No model suggestion right now.' }
      if (arg === 'switch') {
        $.clock.after(0, () => void switchModel($, wanted).catch(() => undefined))
        return { text: `Switching to ${wanted}. The context reloads.` }
      }
      declined = wanted
      await update($, suggestion, () => null)
      return { text: `Keeping the current model.` }
    }
    // Anything else, the bare command too: what there is to type. A pending model suggestion stays as it is.
    return { text: `${arg ? `Unknown: ${arg.slice(0, 40)}. ` : ''}${COMMAND_LIST}` }
  })

  on('prompt.submit', async ($, e, engineNext) => {
    await syncSession($).catch(() => undefined)
    await setTurnBusy($, true)
    // A prompt held back beneath ({ drop }) starts no turn: nothing is busy then.
    const next = async (input: Parameters<typeof engineNext>[0]) => {
      const result = await engineNext(input)
      if ((result as { drop?: unknown } | undefined)?.drop !== undefined) await setTurnBusy($, false)
      return result
    }
    // A landed handoff's card goes once the next message is sent.
    const card = await read($, handoffCard)
    if (card && (card.kind === 'done' || card.kind === 'copied')) await update($, handoffCard, () => null)
    const byPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    // The handoff check runs for every message the person types, whatever the effort judge is doing (or whether Auto is on).
    if (byPerson && !e.text.trim().startsWith('/') && !isFollowUp(e.text)) void checkHandoff($, e.text).catch(() => undefined)
    const wantsEffort = await read($, isAuto)
    const wantsModel = await read($, isAutoModel)
    // A typed slash command is judged only when it is a skill or a custom command (what the person added); the app's own
    // (/compact, /clear, /model) and Smart Token Saver's never are. The judge is told what the command is, since its name alone says little.
    const slash = e.text.trim().startsWith('/')
    const skill = slash && byPerson ? await typedSkill($, e.text) : undefined
    if (!byPerson || (slash && !skill) || (!wantsEffort && !wantsModel)) return next(e)
    // On a model where an effort change rewrites the cache, Auto waits instead of judging.
    const modelId = await $.session.model()
    await modelIs($, modelId)
    if (!cacheSafe(modelId) && keyOf(modelId) !== 'haiku') return next(e)
    // A Haiku before 5.5 takes no effort: with only the effort on Smart there is nothing to judge.
    if (noEffort(modelId) && !wantsModel) return next(e)
    // "go", "ok", "yes" between two steps of work keep the effort Auto already chose; no judge is asked.
    const before = await read($, pick)
    // A message with an image is never a bare follow-up: "fix this" plus a screenshot is new work.
    // Typed while a turn ran (e.turnId), it often steers that task: the judge is told, so it can keep the effort.
    const midTurn = e.turnId !== undefined && before !== null
    const said = skill ? `${e.text}

[This is a slash command that runs a skill: ${skill.description || skill.name}. Judge the work the skill will do.]` : e.text
    const shown = midTurn ? withMidTurn(withAttachments(said, e.attachments), before.effort) : withAttachments(said, e.attachments)
    // "max effort", "effort: low": the person said the level, so it runs, past Min, Max and save mode, and no judge is asked.
    // Checked before the short follow-up below ("max effort" alone is short too), and not on a model that takes no effort.
    const named = wantsEffort && !slash && !noEffort(modelId) ? namedEffort(e.text) : undefined
    if (named) {
      const inUse = await sessionModel($)
      const applied: Pick = { model: inUse, effort: named, why: 'you asked for it', by: 'named' }
      const running = await read($, pick)
      if (midTurn && running && EFFORTS.indexOf(named) < EFFORTS.indexOf(running.effort)) heldPick = applied
      else {
        heldPick = null
        await choose($, applied)
      }
      if (!midTurn && routed) routed = null
      await countPrompt($, withoutEffort(inUse) ? undefined : named, 'named', 0, 0)
      // Typed mid-turn, the running turn keeps its prompt in the log (its requests are still that prompt's).
      if (!midTurn) await abPrompt($, 'named', { model: inUse, applied: named, chars: e.text.length })
      void proof($, `named level ${named} in "${e.text.slice(0, 50)}": no judge`)
      $.ui.invalidate('ui.render')
      return next(e)
    }
    if (wantsEffort && before && before.by !== 'manual' && !e.attachments?.length && !slash && isFollowUp(e.text) && keepsEffort(e.text, await recentContext($).catch(() => ''))) {
      // Kept, but never above what save mode allows now, and on the chat's own model: what the step before ran on
      // (a cheaper model for a simple prompt) says nothing about the work a "go" starts.
      const kept = capped(before.effort, (await read($, saveUntil)) !== null)
      if (kept !== before.effort) await choose($, { ...before, effort: kept, why: 'save mode' })
      if (!midTurn && routed) {
        routed = null
        $.ui.invalidate('ui.render')
      }
      await countPrompt($, kept, undefined, 0, 0)
      void proof($, `follow-up "${e.text.trim()}": keeping ${kept}`)
      return next(e)
    }

    judgeStartedAt = await $.clock.now().catch(() => Date.now())
    judgeEndedAt = null
    renderLog.push(`${new Date().toISOString()} ${loadedSession} judge: start`)
    // The band is drawn again as the judge starts, so the mark pulses from the first frame.
    $.ui.invalidate('ui.render')
    await update($, isJudging, () => true)
    try {
      const inUse = await sessionModel($)
      const startedAt = Date.now()
      const { verdict, tokens: judgeTokens } = await judge($, shown, {
        model: inUse,
        effort: (await read($, pick))?.effort ?? 'medium',
        why: '',
        by: 'manual',
      })
      await endJudging($, 'verdict')
      const ms = Date.now() - startedAt
      // The judge's call is counted here; the prompt itself below, under the effort that goes out (the verdict after
      // the lean, Min, Max and save mode), so a level's average is over the prompts that ran at it.
      await countPrompt($, undefined, verdict?.by, ms, judgeTokens)
      void proof(
        $,
        verdict
          ? `judged by ${verdict.by} in ${ms} ms: ${verdict.model}/${verdict.effort} (${verdict.why}) for "${e.text.slice(0, 50)}"`
          : `no verdict after ${ms} ms for "${e.text.slice(0, 50)}"`,
      )
      $.ui.invalidate('ui.render')
      if (!verdict && wantsEffort && !midTurn) await abPrompt($, 'nojudge', { model: inUse, judgeMs: ms, chars: e.text.length })
      if (!verdict) {
        // No verdict: the prompt runs at the effort already chosen (save mode still caps it) and is counted there, so
        // its cost and its count land in the same row. It runs on the chat's own model, not on the last cheaper one.
        const running = await read($, pick)
        if (wantsEffort && running && running.by !== 'manual') {
          const kept = capped(running.effort, (await read($, saveUntil)) !== null)
          if (kept !== running.effort && !midTurn) await choose($, { ...running, effort: kept, why: 'save mode' })
          if (!withoutEffort(inUse)) await countPrompt($, midTurn ? running.effort : kept, undefined, 0, 0)
        }
        if (!midTurn && routed) {
          routed = null
          void proof($, `no verdict: back on ${inUse}`)
        }
      }
      if (verdict) {
        // Effort follows the verdict at once, when Auto is on for effort. The model stays: switching it
        // reloads the context, so with Auto on for model it is only suggested.
        if (wantsEffort) {
          const saving = (await read($, saveUntil)) !== null
          const leaned = bounded(tipped(verdict.effort, verdict.sure, config.bias), config.floor, config.ceiling)
          const autoEffort = capped(leaned, saving)
          // Mid-turn the message steers the running task: no new arm, the turn stays in the arm it started in.
          // Measurement off: no control arm at all.
          await syncMeasure($)
          const share = config.measureLog === 'on' ? config.abControl : 0
          const arm = midTurn ? (abCurrent?.arm === 'control' ? 'control' : 'auto') : share > 0 ? abArmFor(share, await abCoin($)) : 'auto'
          const appSet = (await read($, appEffort)) as string | null
          const appLevel: Effort = appSet && EFFORTS.includes(appSet as Effort) ? (appSet as Effort) : 'medium'
          const effort = arm === 'control' ? appLevel : autoEffort
          const why =
            arm === 'control'
              ? 'A/B control: app setting'
              : effort !== leaned ? 'save mode' : leaned !== verdict.effort ? 'your settings' : verdict.why
          const applied: Pick = { ...verdict, model: inUse, effort, why }
          if (!withoutEffort(inUse)) await countPrompt($, effort, undefined, 0, 0)
          if (!midTurn) await abPrompt($, arm, {
            model: inUse,
            by: verdict.by,
            judged: verdict.effort,
            auto: autoEffort,
            app: appLevel,
            applied: effort,
            judgeMs: ms,
            judgeTokens,
            share: config.abControl,
            midTurn,
            redo: looksLikeRedo(e.text),
            chars: e.text.length,
          })
          // Mid-turn, a lower verdict would cut the running task's effort for its remaining steps: it waits for the
          // turn to end (the queued message may run as a turn of its own). A higher one helps the task, so it applies.
          const running = await read($, pick)
          if (midTurn && running && EFFORTS.indexOf(effort) < EFFORTS.indexOf(running.effort)) {
            heldPick = applied
            void proof($, `typed mid-turn: ${effort} waits, the running turn keeps ${running.effort}`)
          } else {
            heldPick = null
            await choose($, applied)
          }
        }
        // A prompt the judge calls simple runs on a cheaper model; a message typed mid-turn leaves the running choice.
        if (!midTurn) {
          let to = wantsEffort && config.modelAuto === 'on' ? routeTo(verdict.model, inUse) : null
          // The last prompt ran on a cheaper model and this one says it was wrong: that is a miss. The retry runs on the
          // chat's own model, and so do the next few prompts.
          if (routed && looksLikeRedo(e.text)) {
            stayUp = REDO_STAY_PROMPTS
            await update($, saved, old => ({ ...asSpent(old), redone: asSpent(old).redone + 1 }))
            void proof($, `redo after ${routed}: the next ${REDO_STAY_PROMPTS} prompts stay on ${inUse}`)
          }
          if (stayUp > 0) {
            stayUp--
            if (to) void proof($, `stays on ${inUse}: a cheaper answer was just redone (${stayUp} more)`)
            to = null
          }
          // A switch to a model whose cache is cold writes the whole chat to it: stay when that costs more than it saves.
          const now = await $.clock.now().catch(() => Date.now())
          if (to && !routeWorth(to, inUse, lastContext?.tokens ?? 0, { to: isWarm(to, now), inUse: !(await chatIsCold($)) })) {
            void proof($, `stays on ${inUse}: ${to} has a cold cache, switching would cost more`)
            to = null
          }
          if (to) await update($, saved, old => ({ ...asSpent(old), moved: asSpent(old).moved + 1 }))
          if (to !== routed) {
            routed = to
            void proof($, to ? `this prompt runs on ${to} (the chat is on ${inUse})` : `back on ${inUse}`)
            $.ui.invalidate('ui.render')
          }
        }
        if (wantsModel && verdict.model !== inUse && verdict.model !== declined) {
          await update($, suggestion, () => verdict.model)
          $.ui.toast(`Suggestion: switch to ${verdict.model}? /${PLUGIN} switch or /${PLUGIN} keep`)
        } else if (verdict.model === inUse) {
          await update($, suggestion, () => null)
        }
      }
    } finally {
      // A judge that failed or threw ends here.
      await endJudging($, 'end')
      await update($, isJudging, () => false)
    }
    return next(e)
  })

  // A switch from anywhere (the app's picker, /model, a fallback) moves the pick at once.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await modelIs($, e.to_model)
    // Another model can have another window (and a per-model value): read it again.
    void readWindow($).catch(() => undefined)
    return result
  })

  on('turn.step', async function* ($, e, next) {
    // Every main-conversation response, whatever its effort, keeps the cache warm for its lifetime from now.
    const send = async function* (request: typeof e) {
      if (e.agentId === undefined) lastRequest = { index: e.index, appModel: e.model, appEffort: e.effort, model: request.model, effort: request.effort, at: Date.now() }
      const answer = yield* next(request)
      // Inside the hook ($ calls after it returns are refused), and never allowed to break the request.
      if (e.agentId === undefined && answer?.usage) markWarm(request.model, answer.usage, await $.clock.now().catch(() => Date.now()))
      // A prompt run on a cheaper model leaves the chat's own cache as it was: only the chat's model restarts the countdown.
      if (e.agentId === undefined && answer?.usage && request.model === e.model) await cacheTouched($, answer.usage).catch(() => undefined)
      if (e.agentId !== undefined && answer?.usage) await agentCost($, e.agentId, weighted(answer.usage)).catch(() => undefined)
      return answer
    }
    if (e.agentId === undefined) await setTurnBusy($, true)
    if (e.agentId === undefined) await modelIs($, e.model)
    if (e.agentId === undefined && typeof e.effort === 'string') {
      const seen = e.effort
      const isFirst = engineEffort === undefined
      const isByPerson = !isFirst && seen !== engineEffort
      engineEffort = seen
      // The first effort seen is the app's setting; a change the mod did not make is the person's.
      if (isFirst || isByPerson) await update($, appEffort, () => seen)
      // A new chat with Auto off starts from the pick kept from the last chat; the effort the app is on now is the
      // person's (they may have set it before this first prompt), so it wins. A pick made in this chat stays.
      const takesApp = isFirst && pickCarried && !(await read($, isAuto)) && (await read($, pick))?.effort !== seen
      if (isByPerson || takesApp) {
        await update($, isAuto, () => false)
        await $.store.set('isAuto', false)
        await choose($, { model: await sessionModel($), effort: seen, why: 'your pick in the app', by: 'manual' })
        void proof($, `request ${e.index}: you set effort ${seen} yourself, Auto off`)
        // The app has no event for its effort picker: this is the first request after the pick, so say it plainly.
        $.ui.toast(`${PRODUCT_NAME}: Default effort. You picked ${EFFORT_LABELS[seen as Effort] ?? seen}; turn Smart on to hand it back.`)
        return yield* send(e)
      }
    }
    // The judge put this prompt on a cheaper model: each of its requests goes there, at the picked effort.
    if (e.agentId === undefined && routed && (await read($, isAuto))) {
      const to = MODELS.find(m => m.key === routed)!.id
      const picked = await read($, pick)
      const effort = picked?.effort ?? e.effort
      void proof($, `request ${e.index}: ${e.model} -> ${to} at ${effort}`)
      const tag = await abTag($)
      const result = yield* send({ ...e, model: to, effort })
      if (picked && picked.by !== 'manual' && result.usage) await tally($, picked.effort, result.usage, tag)
      return result
    }
    // A helper the judge picked an effort for at its spawn runs every request at it. A Haiku before 5.5 takes no effort.
    if (e.agentId !== undefined && config.helpers === 'on' && typeof e.effort === 'string' && !noEffort(e.model)) {
      const effort = await helperEffortOf($, e.agentId)
      if (effort) {
        if (e.index === 0) void proof($, `helper ${e.agentId} request 0 (${e.model}): effort ${e.effort} -> ${effort}`)
        const result = yield* send({ ...e, effort })
        if (result.usage) await helperTally($, result.usage).catch(() => undefined)
        return result
      }
    }
    const p = await read($, pick)
    // Decided by the model this request names, never by a stored pick: off the list (cacheSafe) the request goes out
    // as it came, which covers a Haiku before 5.5 too (it takes no effort).
    if (!p || !cacheSafe(e.model)) return yield* send(e)
    // Auto off: the app's own effort goes out. A pick the judge made while Auto was on is not the person's choice, and
    // with the app already on the effort they want, the mod would never see a change to give way to.
    if (p.by !== 'manual' && !(await read($, isAuto))) return yield* send(e)
    // A subagent of a turn Auto picked for (Helpers off, or no verdict for it) runs at that turn's effort, no extra
    // judge call, but never below medium: a helper's answer goes back unchecked (see helperFloor). A subagent whose
    // definition sets its own effort cannot be told apart from one that inherits it, so it follows the turn too.
    if (e.agentId !== undefined) {
      if (p.by === 'manual') return yield* send(e)
      const floor = helperFloor(config.floor, config.ceiling)
      const effort = EFFORTS.indexOf(p.effort) < EFFORTS.indexOf(floor) ? floor : p.effort
      if (e.index === 0) void proof($, `subagent ${e.agentId} (${e.model}): effort ${e.effort ?? 'none'} -> ${effort}, the turn's`)
      return yield* send({ ...e, effort })
    }
    // A/B control (Measurement): the request goes out at the app's own effort, as it would without Smart Token Saver. The tag is
    // read now, before the answer, so a prompt typed meanwhile cannot claim this request.
    const tag = e.agentId === undefined ? await abTag($) : null
    const control = tag?.arm === 'control' && p.by !== 'manual' && typeof e.effort === 'string' && EFFORTS.includes(e.effort as Effort)
    const sentEffort = control ? (e.effort as Effort) : p.effort
    if (e.agentId === undefined) void proof($, `request ${e.index} (${e.model}): effort ${e.effort ?? 'none'} -> ${sentEffort}${control ? ' (A/B control)' : ''}`)
    const result = yield* send({ ...e, effort: sentEffort })
    // Only requests Auto steered count.
    if (e.agentId === undefined && p.by !== 'manual' && result.usage) {
      await tally($, sentEffort, result.usage, tag)
      void proof(
        $,
        `response ${e.index} at ${p.effort}: ${result.usage.output_tokens} out, ${result.usage.cache_read_input_tokens ?? 0} cache read, ${result.usage.cache_creation_input_tokens ?? 0} cache write`,
      )
    }
    return result
  })

  // The only desktop UI: the effort in use, as purple text in the prompt footer, under the chat box, and a small
  // button that switches Auto off and on. A Button cannot be coloured and the footer draws no outline or tint, so
  // plain Text is what is purple. While the judge decides it says "Deciding…", for a moment after Auto switches the level it says
  // "Low → High", and while Auto is off it says "Off" in the dim colour. Auto is switched with /smarttokensaver auto.
  // Terminal, Below prompt: the bar's first line at the end of the hint line under the prompt. The engine's own line
  // (its pills) stays: only `tail` is set, after any tail a hook before set.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || config.terminalPlace !== 'bottom') return next(e)
    let status = ''
    try {
      status = await bottomStatus($)
    } catch {
      return next(e)
    }
    const tail = e.props.tail ? `${e.props.tail} · ${status}` : status
    return next({ ...e, props: { ...e.props, tail } })
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    // Takes its turn among this module's drawings (see drawTurn): it names its own surface to the theme.
    const drawn = await drawTurn($)
    if (!drawn) {
      redrawAfterTurn($)
      return next(e)
    }
    try {
    // The dashboard look keeps all of this in the band above the prompt; the app's own footer shows.
    if (e.surface !== 'desktop' || config.layout === 'default') return next(e)
    const { Box, Text, Button } = themedEls($.ui.resolve(e), e.surface)
    const v = await snap($)
    const handoffNow = (await read($, handoffStage)) !== null
    const needsSetup = await read($, setupPending)
    const effortNow = effortOf(v, v.modelNow ?? 'sonnet')
    // Save mode paints the level in the running-hot band's ember until the limit resets.
    const saving = (await read($, saveUntil)) !== null
    const label = v.judging
      ? 'Deciding…'
      : v.switchedNow
        ? `${EFFORT_LABELS[v.switchedNow.from]} → ${EFFORT_LABELS[v.switchedNow.to]}`
        : effortNow
          ? EFFORT_LABELS[effortNow]
          : 'Smart'
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        {e.props.modes.length > 0 ? <Text dimColor>{e.props.modes.join(' & ')}</Text> : null}
        {/* The level is information, not a control: no hover box (only what can be clicked lights up). Its hover
            group still reveals what it means above the prompt. The spaces are its padding: Text has none. */}
        {v.auto && v.pausedNow ? (
          // Fable 5.1 and older models: an effort change rewrites the cache there, so Auto waits.
          <Text dimColor hover={{ scope: 'effort' }}>
            {' Paused '}
          </Text>
        ) : v.auto ? (
          <Text color={saving ? EMBER : ACCENT} bold hover={{ scope: 'effort' }}>
            {` ${label} `}
          </Text>
        ) : (
          <Text dimColor hover={{ scope: 'effort' }}>
            {' Default '}
          </Text>
        )}
        {/* Show the bar again: back to the full bar above the prompt (Settings → Customize → Bar). */}
        <Button key="show-bar" plain dimColor label=" ☰ " hover={{ scope: 'show-bar', backgroundColor: HOVER_BOX }} onPress={async () => {
          await saveField($, 'layout', 'default')
          $.ui.invalidate('ui.render')
        }} />
        {/* It switches Auto off and on. Text cannot be clicked, so it is a small button. */}
        <Button key="auto" plain dimColor label=" ⏻ " hover={{ scope: 'power', backgroundColor: HOVER_BOX }} onPress={() => toggleAutoEffort($)} />
        {/* Reduce: the same as the bar's Reduce context, with its icon (two arrows meeting at a line): it opens the
            compact bar, which offers the handoff too. Pressed again it closes what it opened. */}
        {config.hide.includes('handoff') ? null : (
          <Button
            key="handoff"
            plain
            dimColor
            label={handoffNow ? ' … ' : ' →|← '}
            hover={{ scope: 'handoff', backgroundColor: HOVER_BOX }}
            onPress={async () => {
              if (await read($, handoffPick)) return closeHandoffBar($)
              if (await read($, compactAsk)) { await update($, compactAsk, () => false); $.ui.invalidate('ui.render'); return }
              await openCompact($, e)
            }}
          />
        )}
        {/* Until the setup is done the footer offers it; after that the same place opens the settings panel. */}
        {needsSetup ? (
          <Button
            key="setup"
            plain
            label=" Setup "
            hover={{ scope: 'setup', backgroundColor: HOVER_BOX }}
            onPress={async () => {
              await update($, setupStep, () => firstSetupStep())
              $.ui.invalidate('ui.render')
            }}
          />
        ) : (
          <Button
            key="settings"
            plain
            dimColor
            label=" ⚙︎ "
            hover={{ scope: 'settings', backgroundColor: HOVER_BOX }}
            onPress={async () => {
              if (await read($, settingsOpen)) {
                await update($, settingsDraft, () => ({}))
                await update($, settingsOpen, () => false)
                $.ui.invalidate('ui.render')
              } else await openPluginSettings($)
            }}
          />
        )}
        {/* How long the prompt cache stays warm: grey, yellow from 20 minutes, red from 5, then "cold" (the next message
            writes the whole context again). Nothing before the first response. */}
        {/* Cold: the band above the prompt says it and holds Compact; the footer only shows the state, in ice blue. */}
        {/* Hovering it reveals a card above the prompt (the cache scope); see the hover cards in AbovePrompt. */}
        {config.hide.includes('timer') ? null : v.cacheNow === 0 ? (
          <Text color={ICE} hover={{ scope: 'cache' }}>{cacheLabel(0)}</Text>
        ) : v.cacheNow === null ? null : cacheColor(v.cacheNow) ? (
          <Text color={cacheColor(v.cacheNow)} hover={{ scope: 'cache' }}>{cacheLabel(v.cacheNow)}</Text>
        ) : (
          <Text dimColor hover={{ scope: 'cache' }}>{cacheLabel(v.cacheNow)}</Text>
        )}
      </Box>
    )
    } finally {
      drawn()
    }
  })

  // The terminal's line under each reply ("Baked 3s") in the brand's colours, with the effort and the cache. The
  // desktop draws no such line; the bands above the prompt warn there (a card under the reply repeated them, removed).
  // The agent panel. Each subagent the chat sends off gets a record: spawned, what it does now, its own steps, how it
  // ended. Teammates and workflow agents are left out for now.
  on('agent.spawn', async ($, e, next) => {
    // Effort for helpers: the judge reads the subagent's task before it starts (a fork shares the chat's context and
    // keeps its effort). Without a verdict it runs at the chat's effort, as with the setting off.
    const helper = config.helpers === 'on' && !e.fork && !e.isTeammate && !e.workflow
      ? await helperEffort($, e.prompt, e.subagentType).catch(() => null)
      : null
    const waiting = helper ? { description: e.description, type: e.subagentType, parentId: e.parentAgentId, effort: helper.effort } : null
    if (waiting) helperWaiting = [...helperWaiting, waiting].slice(-20)
    const result = await next(e)
    if (waiting) {
      helperWaiting = helperWaiting.filter(w => w !== waiting)
      if ('agentId' in result && result.agentId && !helperPicks.has(result.agentId)) helperPicks.set(result.agentId, waiting.effort)
      if ('agentId' in result && result.agentId) {
        await update($, saved, old => {
          const t = asSpent(old)
          return { ...t, helpers: { ...t.helpers, runs: { ...t.helpers.runs, [waiting.effort]: (t.helpers.runs[waiting.effort] ?? 0) + 1 } } }
        }).catch(() => undefined)
        void proof($, `helper ${e.subagentType} "${e.description}": ${waiting.effort} (${helper?.why})`)
      }
    }
    if (e.isTeammate || e.workflow || !('agentId' in result) || !result.agentId) return result
    const id = result.agentId
    const now = await $.clock.now()
    const rec: AgentRec = { id, type: e.fork ? 'fork' : e.subagentType, task: e.description, state: 'running', startedAt: now, model: result.model }
    if (helper) {
      rec.effort = EFFORT_LABELS[helper.effort]
      rec.why = helper.why
    }
    if (e.parentAgentId) rec.parentId = e.parentAgentId
    await update($, agentsState, list => [...list.filter(a => a.id !== id), rec].slice(-40))
    return result
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    const input = e as unknown as Record<string, unknown>
    const touch = touchOf(e.tool, input)
    const isList = e.tool === 'TodoWrite' || e.tool === 'TaskCreate' || e.tool === 'TaskUpdate'
    const known = id !== undefined && (await read($, agentsState)).some(a => a.id === id)
    if (!touch && !known && !(id === undefined && isList)) return next(e)
    if (known && id !== undefined) {
      const now = await $.clock.now()
      const file = touch ? (relPath(touch.path, await $.session.root()) ?? undefined) : undefined
      await agentSet($, id, a => ({ ...a, now: toolLine(e.tool, input), toolSince: now, file }))
    }
    const result = await next(e)
    const ok = !('deny' in result && result.deny) && !result.isError
    if (ok && touch) await fileTouched($, touch.path, touch.edited, id ?? 'main').catch(() => undefined)
    if (ok && id === undefined && isList) {
      if (e.tool === 'TodoWrite') await update($, agentSteps, () => stepsFromTodos(e.todos))
      else if (e.tool === 'TaskCreate') {
        const taskId = (result.result as { task?: { id?: string } } | undefined)?.task?.id
        if (taskId) await update($, agentSteps, steps => withTaskCreated(steps ?? [], taskId, e))
      } else await update($, agentSteps, steps => (steps ? withTaskUpdated(steps, e) : steps))
    }
    if (known && id !== undefined) {
      const steps = ok && e.tool === 'TodoWrite' ? stepsFromTodos(e.todos) : undefined
      await agentSet($, id, a => ({ ...a, toolSince: undefined, file: undefined, state: a.state === 'waiting' ? 'running' : a.state, ...(steps ? { steps } : {}) }))
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: 'smarttokensaver-agents' }, async ($, e, next) => {
    // Takes its turn among this module's drawings (see drawTurn): it names its own surface to the theme.
    const drawn = await drawTurn($)
    if (!drawn) {
      redrawAfterTurn($)
      return next(e)
    }
    try {
    const els = themedEls($.ui.resolve(e), e.surface)
    const agents = await read($, agentsState)
    const open = await read($, agentsOpen)
    const rows = Math.max(12, e.props.scroll.bodyRows)
    return agentsPane(
      {
        ...els,
        rows,
        nowMs: await $.clock.now(),
        title: 'This chat',
        open,
        ringSvg,
        cardArt: { source: DASH_SVG, width: FROST_WIDTH * 2, height: FROST_HEIGHT * 2 },
        onOpen: (id: string) => update($, agentsOpen, cur => (cur === id ? null : id)),
        files: await read($, agentFiles),
        steps: await read($, agentSteps),
        module: await read($, agentsModule),
        onModule: (key: string) => update($, agentsModule, cur => (cur === key ? null : key)),
      },
      agents,
    )
    } finally {
      drawn()
    }
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    // Takes its turn among this module's drawings (see drawTurn): it names its own surface to the theme.
    const drawn = await drawTurn($)
    if (!drawn) {
      redrawAfterTurn($)
      return next(e)
    }
    try {
    const { Box, Text } = themedEls($.ui.resolve(e), e.surface)
    const v = await snap($)
    const effortNow = effortOf(v, v.modelNow ?? 'sonnet')
    const took = Math.max(1, Math.round(e.props.durationMs / 1000))
    return (
      <Box key="turn-line" flexDirection="row" gap={1}>
        <Text dimColor>{`${e.props.word} ${took < 60 ? `${took}s` : `${Math.floor(took / 60)}m ${took % 60}s`}`}</Text>
        <Text color={ACCENT}>{`✦ ${effortNow ? EFFORT_LABELS[effortNow] : 'Smart'}`}</Text>
        {v.cacheNow === null ? null : (
          <Text dimColor={cacheColor(v.cacheNow) === undefined} color={cacheColor(v.cacheNow)}>{`· ${v.cacheNow <= 0 ? 'cache cold' : `cache ${cacheLabel(v.cacheNow)}`}`}</Text>
        )}
      </Box>
    )
    } finally {
      drawn()
    }
  })

  // Above the prompt: the terminal's rows (effort steps, Auto, and the model row when it is switched on).
  // On desktop nothing is drawn here, except the question when the judge suggests another model.
  // Draws the bands and the settings panel. Counted and guarded so /smarttokensaver debug can say whether the app asks
  // for it at all and whether drawing failed: an error here otherwise only leaves the slot empty.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, engineNext) => {
    // One drawing at a time. A drawing waits on the store and the engine many times, and it shares the layer list,
    // the open dropdown and the surface's appearance with every other drawing of this module. Two that ran into each
    // other left a panel without its top bar or its shell, and the app could show the older tree after the newer
    // one, whose buttons the engine no longer answered until the next redraw.
    const drawn = await drawTurn($)
    if (!drawn) {
      redrawAfterTurn($)
      return engineNext(e)
    }
    try {
    // Whether the slot went to the plugins beneath and the app (a survey, nothing of this plugin's to draw): their
    // tree is handed on as it is, without this plugin's shell.
    let passed = false
    openChoiceDrawn = false
    const next = ((given: Parameters<typeof engineNext>[0]) => {
      passed = true
      return engineNext(given)
    }) as typeof engineNext
    // Setup changes a reload cut off are saved from here: the reloaded plugin draws before anything else runs.
    void drainSetupSave($).catch(() => undefined)
    void afterLoad($).catch(() => undefined)
    await restoreCache($).catch(() => undefined)
    await syncSession($).catch(() => undefined)
    await syncSharedSetup($).catch(() => undefined)
    renderCalls++
    lastRenderAt = Date.now()
    void refreshAppearance($).catch(() => undefined)
    lastRenderProps = JSON.stringify(e.props).slice(0, 200)
    renderLog.push(`${new Date(lastRenderAt).toISOString()} ${loadedSession} ${lastRenderProps}`)
    if (!firstDrawLogged) {
      firstDrawLogged = true
      renderLog.push(`${new Date().toISOString()} ${loadedSession} first draw asked ${lastRenderAt - loadedAt} ms after load`)
      void writeRenderLog($).catch(() => undefined)
    }
    // The layers this panel hands to its shell (its art, its top bar); the terminal draws no shell.
    // This drawing's own list: another drawing that starts while this one waits takes the shared name, not this list.
    const layers: unknown[] | null = e.surface === 'terminal' ? null : []
    try {
    slotLayers = layers
    // The surface's appearance as this drawing's parts were made with it: another hook's drawing may name its own
    // surface while this one waits, and the shell follows the panel it wraps.
    let shellLook: { adaptive: boolean; pin: ReturnType<typeof pinned>; palette: ReturnType<typeof palette> } | null = null
    const panel = await (async () => {
    if (e.props.hasSurvey) {
      lastRenderBranch = 'stepped aside: the app has a survey in this spot'
      return next(e)
    }
    const asked = await $.store.get('openSettingsAt')
    const askedHere =
      asked && typeof asked === 'object' && (asked as { session?: string }).session === (await $.session.id().catch(() => ''))
        ? (asked as { at: number }).at
        : null
    // A request left in the store (see openPluginSettings) opens the panel in this drawing, and is taken into the
    // chat's state right after it, outside the drawing: a drawing does not write state, and the request is only
    // cleared once the state holds it, so it cannot get lost between the two.
    const askedOpen = typeof askedHere === 'number' && Date.now() - askedHere < 60_000
    if (typeof askedHere === 'number' && !openRequestTaking) {
      openRequestTaking = true
      $.clock.after(0, () => { void takeOpenRequest($, askedHere).catch(() => undefined) })
    }
    const panelOpen = askedOpen || (await read($, settingsOpen))
    lastRenderBranch = panelOpen ? 'drew the settings panel' : 'drew a band or nothing'
    const { Box, Text, Button, Svg, Link } = themedEls($.ui.resolve(e), e.surface)
    shellLook = { adaptive: isAdaptive(), pin: pinned(), palette: palette() }
    // The guide, linked from the settings, the setup and the cold band. A terminal without link support prints the whole
    // address after the label, so there it copies the link instead.
    const pinPalette = e.surface === 'terminal' ? null : palette()
    const pinParts = pinPalette ? parts() : null
    // One of the app's own text fields: under a fixed mode on a patch that keeps its text readable (pinned.ts).
    const backed = <T,>(key: string, field: T, inset = 0): T => {
      const mode = e.surface === 'terminal' ? null : pinned()
      return mode && pinParts ? fieldBacking(pinParts, mode, key, field, inset) as T : field
    }
    const guideLink = (key: string, label = 'Guide', url = GUIDE_URL, what = 'Guide') =>
      e.surface === 'terminal' ? (
        <Button key={key} plain dimColor label={label} onPress={async () => {
          const r = await $.ui.copy({ text: url, surface: e.surface }).catch(() => ({ isCopied: false as const }))
          $.ui.toast(r.isCopied ? `${what} link copied: ${url}` : `${what}: ${url}`)
        }} />
      ) : pinPalette && pinParts ? (
        // A fixed mode: the app's own link keeps the app's ink (dark blue in a light app), so the word is painted.
        paintedLink(pinParts, pinPalette, key, label, () => openGuide($, e.surface, url)) as never
      ) : (
        <Text key={key} color="#9a9aa3"><Link href={url} label={label} /></Text>
      )
    // The Guide button of the settings and the setup, top right: a book and the word as one button, lit as a block on
    // hover like the bar's buttons. A press opens the guide (at a section, given one) in the browser, or copies it.
    // The terminal copies the link.
    const guideButton = (key: string, url = GUIDE_URL) => e.surface === 'terminal' ? guideLink(key, 'Guide', url) : (
      // The bar's own button style (Compact, Context size): plain, dim, the app's rounded box on hover. The book is
      // drawn over blank room at the start of the label, so the hover box takes in the book and the word as one.
      <Box key={`${key}-box`} position="relative" flexDirection="row" alignItems="center" flexShrink={0}>
        <Button key={key} plain dimColor hover={{ scope: key, backgroundColor: HOVER_BOX }} label={Svg ? `${'\u00a0'.repeat(7)}Guide` : 'Guide'} onPress={() => openGuide($, e.surface, url)} />
        {Svg ? (
          <Box key={`${key}-book`} position="absolute" top={0} bottom={0} left={1} flexDirection="row" alignItems="center">
            <Svg source={rowIconSvg('guide', DASH_DIM)} alt="Guide" width={14} height={14} />
          </Box>
        ) : null}
      </Box>
    )
    // The rows the slot above the prompt shows whole (12 on the desktop); a taller tree scrolls there.
    const slotRows = typeof e.props.maxRows === 'number' && e.props.maxRows > 0 ? e.props.maxRows : 12
    // The settings panel: a branded header bar, then one compact row per setting, a dim hint at the end of each row.
    if (panelOpen) {
      // An open card's rows are laid out for SETTINGS_DESIGN_COLUMNS. In a narrower band they keep that width and
      // scroll sideways (the slot itself never does: it cut them at the right edge); the top bar with Back, Guide and ✕
      // stays where it is.
      const wideCols = e.surface !== 'terminal' && typeof e.props.bodyColumns === 'number' && e.props.bodyColumns < SETTINGS_DESIGN_COLUMNS
        ? SETTINGS_DESIGN_COLUMNS : 0
      // The overview scrolls only where its seven cards would take a third row, cut at the slot's foot: fewer than four
      // at their least width (18, gaps of 1) beside each other, inside the panel's padding of 2 a side. Then it keeps
      // two rows (4 + 3) as wide as they need. At the design width of an open card (100) it scrolled in a window that
      // had room: the cards stretched and Context size was cut at the right.
      const OVERVIEW_COLS = 4 * 18 + 3
      const cardsCols = e.surface !== 'terminal' && typeof e.props.bodyColumns === 'number' && e.props.bodyColumns - 4 < OVERVIEW_COLS
        ? OVERVIEW_COLS : 0
      // The app gives this slot maxRows rows and drops a taller tree whole, without a word. With gaps the panel is 12
      // rows (2 border, 2 header, 4 settings, 4 gaps); without, 7.
      const roomy = slotRows >= 12
      const { Select } = themedEls($.ui.resolve(e), e.surface)
      // Save mode, for its switch on the Effort card.
      const saveUntilAt = await read($, saveUntil)
      const savingNow = saveUntilAt !== null
      const saveUntilLabel = savingNow ? (resetLabel(new Date(saveUntilAt).toISOString(), await $.clock.now()) || 'the limit resets') : ''
      const opts = (values: readonly string[]) => values.map(value => ({ value, label: value }))
      // The skills and commands installed here, to pick the handoff writer from: no typing, no file paths. A plugin
      // cannot open a file dialog, and a skill is run by its name anyway.
      const skillNames = await read($, installedSkills)
      const windowNow = await read($, windowInfo)
      const labNow = await read($, maintainerUpdates)
      // A plain button with its own handler: a dismiss-role button may be taken by the app before onPress runs.
      const checking = await read($, updateCheck)
      // Support: the maintainer's clone (null for an install from GitHub), and this plugin's own update check.
      const maint = await maintainerClone($)
      const ownOn = await ownUpdatesOn($)
      const ownChecking = await read($, ownCheck)
      const ownFound = (await read($, ownCard)) as OwnCard | null
      const close = async () => {
        await update($, settingsDraft, () => ({}))
        await update($, settingsCard, () => null)
        await update($, settingsOpen, () => false)
        $.ui.invalidate('ui.render')
      }
      // The panel shows the draft over the saved settings; every control writes to the draft only.
      const draft = await read($, settingsDraft)
      const card = await read($, settingsCard)
      // The top bar in a narrow band: what does not fit goes, in this order, so nothing runs into anything: the product
      // name, then the part's name (with the mark), then Guide. ← Settings and ✕ always stay. Cells measured with
      // tools/render-band (8.4 px a cell): inset 2 a side, ← Settings 11, the mark and its gaps 3, Guide 10.4 with the
      // Saved slot (8) and gaps (2 + 2) before it, ✕ 3.7; bold text about 0.9 of a cell a letter. The overview has no
      // ← Settings: its "Settings" title stays with the mark, only the name and Guide go.
      const headCols = e.surface !== 'terminal' && typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : Infinity
      const headPartLen = Math.ceil(0.9 * (card === null ? 'Settings' : CARDS.find(c => c.id === card)?.title ?? '').length)
      const HEAD_RIGHT = 29
      const HEAD_LEFT = card === null ? 2 : 13
      const HEAD_NAME = 18
      const headGuide = headCols >= HEAD_LEFT + (card === null ? 3 + headPartLen : 0) + 2 + HEAD_RIGHT
      const headPart = card === null || headCols >= HEAD_LEFT + 3 + headPartLen + 2 + HEAD_RIGHT
      const headName = headCols >= HEAD_LEFT + 3 + HEAD_NAME + headPartLen + 2 + HEAD_RIGHT
      const openCard = (to: SettingsCard | null) => async () => {
        await update($, settingsCard, () => to)
        $.ui.invalidate('ui.render')
      }
      // Every change is saved at once (no Save button): the draft shows it until the setting is read back, and
      // "✓ Saved" shows top right for a moment.
      const set = (field: keyof SettingsDraft) => async (value: string) => {
        await update($, settingsDraft, d => ({ ...d, [field]: value }))
        $.ui.invalidate('ui.render')
        await saveField($, field, value)
      }
      const shown = {
        bias: draft.bias !== undefined ? Number(draft.bias) : config.bias,
        floor: (draft.floor ?? config.floor) as Effort,
        ceiling: (draft.ceiling ?? config.ceiling) as Effort,
        handoffAfter: draft.handoffAfter ?? config.handoffAfter,
        handoffSkill: draft.handoffSkill ?? config.handoffSkill,
        swampAt: draft.swampAt ?? swampValue(config.swampAt),
        layout: draft.layout ?? config.layout,
        terminalPlace: draft.terminalPlace ?? config.terminalPlace,
        compactWith: draft.compactWith ?? config.compactWith,
        handoffButton: draft.handoffButton ?? config.handoffButton,
        modelAuto: draft.modelAuto ?? config.modelAuto,
        helpers: draft.helpers ?? config.helpers,
        theme: draft.theme ?? config.theme,
        appearance: draft.appearance ?? config.appearance,
        compactWindow: draft.compactWindow !== undefined ? (parseWindow(draft.compactWindow) ?? null) : config.compactWindow,
      }
      // The Helpers switch slides like Auto's: the time it flipped, seen by the draw after the click.
      const helpersNow = await $.clock.now()
      if (helpersSeen !== undefined && helpersSeen !== shown.helpers) helpersFlipAt = helpersNow
      helpersSeen = shown.helpers
      const flash = (await $.store.get('settingsFlash').catch(() => null)) as { at: number; session: string } | null
      const savedShows = !!flash && flash.session === (await $.session.id().catch(() => '')) && (await $.clock.now().catch(() => Date.now())) - flash.at < SAVED_FLASH_MS
      const hidden = (draft.hide ?? config.hide.join(',')).split(',').filter(Boolean)
      // For a maintainer: whether the lab (Measurement) runs, as the flask and On or Off: top right on the Support card
      // (shown only) and as the switch in the Measurement row. Others never see it.
      const labOn = config.measureLog === 'on'
      const labMark = (key: string, colon = false) => (
        <Box key={key} flexShrink={0} flexDirection="row" alignItems="center" gap={1}>
          {Svg && !term ? <Svg source={rowIconSvg('lab', labOn ? LAB_ON_COLOR : DASH_DIM)} alt={labOn ? 'Measurement on' : 'Measurement off'} width={14} height={14} /> : <Text color={labOn ? LAB_ON_COLOR : DASH_DIM}>⚗</Text>}
          {/* As wide for On as for Off: nothing shifts when it changes. */}
          <Box width={3} flexShrink={0}><Text color={labOn ? LAB_ON_COLOR : DASH_DIM} bold={labOn}>{labOn ? (colon ? 'On:' : 'On') : 'Off'}</Text></Box>
        </Box>
      )
      // One short line per card, about 22 characters: a card is a quarter of the panel wide, and a longer line was cut.
      // Context size sits in the wider bottom row: the size new chats get, and this chat's when it is another one.
      const newSize = shown.compactWindow === null ? 'default' : windowLabel(shown.compactWindow)
      const currentSize = chatOverride ?? windowNow?.raw ?? null
      const sameSize = currentSize === null || (shown.compactWindow !== null && currentSize === Math.min(shown.compactWindow, windowNow?.modelWindow || shown.compactWindow))
      const contextSummary = currentSize === null ? `New: ${newSize}`
        : sameSize ? `New & current: ${newSize}` : `New: ${newSize} / Current: ${windowLabel(currentSize)}`
      const summaries: Record<SettingsCard, string> = {
        effort: `${BIAS_WORDS[shown.bias + 2]} · ${shown.floor} to ${shown.ceiling}`,
        model: shown.modelAuto === 'on' ? 'Cheaper when it can' : "Keeps the chat's model",
        context: contextSummary,
        about: `${PRODUCT_NAME} ${ownVersion || OWN_VERSION}`,
        // What the card holds, short enough for one line.
        lab: maint ? 'Update · Maintain' : 'Update · Report a bug',
        handoff: `${shown.handoffSkill ? `/${shown.handoffSkill}` : 'Built in'} · alert at ${shown.swampAt === 'auto' ? 'Auto' : `${shown.swampAt}%`}`,
        show: `${shown.layout === 'minimal' ? 'Buttons only' : 'Bar'} · ${{ auto: 'automatic', dark: 'dark', light: 'light' }[shown.appearance as 'auto' | 'dark' | 'light'] ?? 'automatic'}`,
      }
      // The cache timer, the judge's line (who picked and how sure) and the three alerts can be switched off here (an
      // alert's ✕ only closes it for now); the rest is the mod itself. A ticked box in plain text, dim when off: lighter than a row of white buttons.
      const box = ([part, label]: readonly [Hideable, string]) => {
        const off = hidden.includes(part)
        const after = off ? hidden.filter(h => h !== part) : [...hidden, part]
        return (
          <Button key={`show-box-${part}`} plain dimColor={off} label={`${off ? '☐' : '☑'}︎ ${label}`}
            onPress={() => set('hide')(after.join(','))} />
        )
      }
      const toggles = ([['timer', 'Cache countdown'], ['reason', 'Why this effort']] as const).map(box)
      // The alerts sit in the Handoff card, next to the share of context the context alert waits for.
      const alertToggles = ([['swamp', 'Context at'], ['hot', 'Running low'], ['cold', 'Cold cache']] as const).map(box)
      // The slider: five stops, the marker on the one in force. No animation, a click moves it.
      const track: unknown[] = []
      // On the desktop each stop is a column: its circle, and under it its name in small italics, so every stop says
      // what it is (a hover cannot explain it). The dashes sit in columns of their own, level with the circles.
      const termTrack = e.surface === 'terminal'
      for (const n of [-2, -1, 0, 1, 2]) {
        if (n > -2) track.push(termTrack ? <Text key={`t${n}`} dimColor>─</Text> : (
          <Box key={`t${n}`} flexDirection="column" alignItems="center"><Text dimColor>──</Text><Text size="caption"> </Text></Box>
        ))
        const stop = <Button key={`bias${n + 2}`} plain label={n === shown.bias ? '◉' : '○'} onPress={() => set('bias')(String(n))} />
        track.push(termTrack ? stop : (
          <Box key={`stop${n + 2}`} flexDirection="column" alignItems="center" width={10}>
            {stop}
            <Text size="caption" italic dimColor={n !== shown.bias} color={n === shown.bias ? DASH_TEXT : undefined}>{LEAN_STOPS[n + 2]?.[0]}</Text>
          </Box>
        ))
      }
      // The terminal has no art and few rows: no gaps, one row under the title.
      const term = e.surface === 'terminal'
      // The terminal's dropdown opens its list inside the wrapping row, which jumps the layout and is hard to click.
      // There a short list is a row of buttons, the picked one boxed; a long one (the skills) stays a dropdown.
      // `drop: 'up'` is for a dropdown low in its card: a fixed mode's own list (see ownChoice) opens inside the panel,
      // and below such a row there is no room for it.
      type Pick = { key: string; label?: string; value: string; options: { value: string; label: string }[]; onSelect: (v: string) => unknown; drop?: 'up'; tall?: number }
      const pick = (p: Pick) => {
        if (term && p.options.length <= 5) return (
          <Box key={p.key} width="100%" flexDirection="row" flexWrap="wrap" columnGap={1} alignItems="center">
            {p.label ? <Text key={`${p.key}-label`} dimColor>{p.label}</Text> : null}
            {p.options.map(o => o.value === p.value ? (
              <Button key={`${p.key}-${o.value}`} variant="secondary" label={o.label} onPress={() => p.onSelect(o.value)} />
            ) : (
              <Button key={`${p.key}-${o.value}`} plain dimColor label={o.label} onPress={() => p.onSelect(o.value)} />
            ))}
          </Box>
        )
        // Always dark / Always light: the plugin's own dropdown in the mode's colours (the app's is drawn for the
        // app's mode). Its list opens under the field and moves the rows below down, or lies over the rows above.
        const own = term ? null : ownChoice($, p, p.tall ?? 3)
        if (!own) return <Select key={p.key} label={p.label} value={p.value} options={p.options} onSelect={p.onSelect} />
        return (
          <Box key={`${p.key}~anchor`} position="relative" flexDirection="column" alignItems="flex-start" flexShrink={0}>
            {own.field as never}
            {!own.list ? null : p.drop === 'up' ? (
              <Box key={`${p.key}~drop`} position="absolute" bottom={1} left={0} marginBottom={0.4}>{own.list as never}</Box>
            ) : (
              // No width of its own, so the open list moves nothing beside it; positioned, so it lies over the hint.
              <Box key={`${p.key}~drop`} position="relative" width={0} marginTop={0.4}>{own.list as never}</Box>
            )}
          </Box>
        )
      }
      // The grid every open card uses: the setting's name in a fixed column, its controls, then one dim line on what it
      // does (cut to the row, never wrapped). Notes sit under the controls, aligned with them; a blank row parts groups.
      const GRID_LABEL = 16
      // The Support card of a maintainer has the flask with On or Off beside Measurement: its labels get a little more room.
      const labelW = card === 'lab' && maint ? GRID_LABEL + 4 : GRID_LABEL
      const gridRow = (key: string, label: string, controls: unknown[], hint?: string, hintKey?: string, beside?: unknown) => (
        <Box key={key} width="100%" flexDirection="row" columnGap={2} alignItems={term ? 'center' : 'flex-start'} flexWrap={term ? 'wrap' : 'nowrap'}>
          <Box width={labelW} flexShrink={0} flexDirection="row" alignItems="center" columnGap={1}><Text color={DASH_TEXT}>{label}</Text>{beside ?? null}</Box>
          {/* While a fixed mode's dropdown is open its list hangs under its field: the controls keep to the top line. */}
          <Box flexShrink={0} flexDirection="row" columnGap={1} alignItems={openChoice && !term ? 'flex-start' : 'center'}>{controls}</Box>
          {/* On the desktop a long hint wraps under itself (the cards have the rows now); the terminal cuts it. */}
          {hint ? <Box flexShrink={1} minWidth={0}><Text key={hintKey} dimColor wrap={term ? 'truncate' : 'wrap'}>{hint}</Text></Box> : null}
        </Box>
      )
      // A card in parts: a part's name in bold (with what sits beside it), its rows indented under it.
      const gridSection = (key: string, title: string, rows: unknown[], beside?: unknown, before = 0) => (
        <Box key={key} width="100%" flexDirection="column" rowGap={term ? 0 : CARD_ROW_GAP / 2} marginTop={term ? 0 : before}>
          <Box key={`${key}-head`} flexDirection="row" alignItems="center" columnGap={1}>
            <Text color={DASH_TEXT} bold>{title}</Text>
            {beside ?? null}
          </Box>
          <Box key={`${key}-rows`} flexDirection="column" paddingLeft={2} rowGap={term ? 0 : CARD_ROW_GAP}>{rows}</Box>
        </Box>
      )
      // A small line in italics under a row's controls, aligned with them: what a choice does, where beside the row it
      // had no room.
      const gridSub = (key: string, text: string) => (
        <Box key={key} width="100%" flexDirection="row" columnGap={2} marginTop={term ? 0 : -CARD_ROW_GAP}>
          {term ? null : <Box width={GRID_LABEL} flexShrink={0} />}
          <Box flexShrink={1} minWidth={0}><Text size="caption" italic dimColor wrap="truncate">{text}</Text></Box>
        </Box>
      )
      const gridNote = (key: string, text: string) => (
        <Box key={key} width="100%" flexDirection="row" columnGap={2}>
          {term ? null : <Box width={GRID_LABEL} flexShrink={0} />}
          {/* A note may take two lines on the desktop: cut at the card's edge it lost its end. */}
          <Box flexShrink={1} minWidth={0}><Text dimColor wrap={term ? 'truncate' : 'wrap'}>{text}</Text></Box>
        </Box>
      )
      // The card's column puts a blank row between all rows now; a group gap adds nothing more.
      // A blank row between the rows of a card on the desktop: rows that touch read as one block.
      // Gone since 20.11.2026: every card must fit the slot without scrolling, so rows are half a row apart and no group
      // gap is added. Kept as a no-op so the cards read as before.
      const gridGap = (_key: string) => null
      // A row that starts a new group: a little more room above it than between the rows of a group.
      const groupStart = (key: string, row: unknown) => (term ? row : <Box key={key} width="100%" marginTop={CARD_GROUP_GAP}>{row}</Box>)
      // The /autocompact command inline in its row, where the plugin cannot set the window itself: the line, Paste into
      // chat and Copy while the size is not in force; "✓ in use" once a read shows it (the row keeps its height).
      const commandControls = (key: string, pending: boolean, mine: boolean) => {
        if (!mine || pending) return []
        return windowNow && (settingsHookBlocked || windowNow.modelValue !== undefined) ? [<Text key={`${key}-in-use`} dimColor>✓ in use</Text>] : []
      }
      // A card's fixed note at its top, small and in italics, aligned with the controls.
      const contextNote = (key: string, text: string) => (
        <Box key={key} width="100%" flexDirection="row" columnGap={2}>
          <Box flexShrink={1} minWidth={0}><Text dimColor italic size="caption" wrap={term ? 'truncate' : 'wrap'}>{text}</Text></Box>
        </Box>
      )
      // One column, a row per setting, its hint at the end. The header is three absolute layers, drawn in order (bar and
      // art, then the title, then the buttons): an absolute layer covers whatever is in the flow, so nothing of the
      // header is in the flow but a spacer that keeps its row free.
      if (probeLevel === 1) {
        return (
          <Box key="probe" borderStyle="round" borderColor={BRAND_EDGE} paddingX={1}>
            <Text>{`${PRODUCT_NAME} probe 1: a bare box`}</Text>
          </Box>
        )
      }
      // Probe 2 keeps only the frame and header; probe 3 keeps the rows of buttons and text, no pickers or fields.
      const frameOnly = probeLevel === 2
      const bare = probeLevel === 3
      // Desktop keeps title and buttons as absolute layers straight under the panel; the terminal gets a wrapping row.
      const headRow = (kids: unknown[]) => term
        ? <Box key="settings-head" flexDirection="row" flexWrap="wrap" justifyContent="space-between" columnGap={2}>{kids}</Box>
        : kids
      return (
        // The dashboard's look: the neutral band and its quiet edge, purple only on the star, no art behind the rows (it
        // made them busy). The entrance
        // sweep plays once, behind everything, as the panel opens.
        // As tall as the slot shows without scrolling (the app's maxRows, 12 on the desktop): a few pixels more and the
        // panel scrolled by that much under the wheel.
        <Box key="settings" position="relative" flexDirection="column" gap={roomy && !term ? 1 : 0} paddingX={term ? 1 : 2} overflow="hidden"
          // The overview is one row lower than the slot allows: at the full height its two rows of cards had 19 px
          // of air above and 39 below. A part keeps the full height, which Effort and Customize
          // use.
          height={term ? undefined : card === null && slotRows >= 12 ? slotRows - 1 : slotRows}
          {...panelFrame(DASH_BG)}>
          {term ? null : introLayer({ Box, Svg }, 'settings', await introShows($, 'settings'))}
          {/* The top bar: barely a shade lighter than the band, holding the title, Save and the cross. */}
          {!term ? underSlot(
            // In the slot's shape (its round upper corners, edge to edge), drawn by the shell: inside the panel it was a
            // rectangle that stopped short of the slot's edges. The hairline along its bottom is a one-pixel image
            // stretched across (a Box cannot draw one pixel).
            slotHead({ Box, Text, Button } as unknown as Parts, 'settings-bar', 3, DASH_HEAD,
              <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1" viewBox="0 0 1600 1" preserveAspectRatio="none"><rect width="1600" height="1" fill="${DASH_EDGE}"/></svg>`} alt="rule" width={1600} height={1} />),
          ) : null}
          {/* Title and buttons are centred in the whole bar (it reaches from the border to the line under it), so the
              space above them equals the space below. The terminal has no bar: both sit in the flow on one row that
              wraps, since two absolute layers drew over each other in a narrow window ("SettCheck for updates"). */}
          {headRow([
          <Box key="settings-title" {...(term ? { flexShrink: 0 } : { position: 'absolute', top: 0, left: 2, height: 2.5 })} flexDirection="row" alignItems="center" gap={1}>
            {term ? <Text color={ACCENT} bold>✦</Text> : null}
            {/* The small orange mark, as in the bar and the setup, left of the name on the overview and inside every part. */}
            {!term && Svg && card === null ? <Svg key="settings-mark" source={markLogoSvg(BRAND_ORANGE, 'on')} alt={PRODUCT_NAME} width={14} height={14} /> : null}
            {/* The overview: the name and Settings. Inside a part: a button back to Settings first (far left, wherever
                the part was opened from, the bar's Context size too), then the part's name. The version is in About. */}
            {/* One title block everywhere: the name bold, a raised dot, then where you are in italics ("Settings" on
                the overview, the part's name inside one, after the way back). */}
            {card === null ? (
              <Box key="settings-trail" flexDirection="row" alignItems="center" gap={1}>
                {headName ? <Text color={DASH_TEXT} bold>{PRODUCT_NAME}</Text> : null}
                {headName ? <Text color={DASH_DIM}>·</Text> : null}
                <Text color={DASH_TEXT} italic>Settings</Text>
              </Box>
            ) : (
              <Box key="settings-trail" flexDirection="row" alignItems="center" gap={1}>
                <Button key="settings-back" variant="secondary" label="← Settings" onPress={openCard(null)} />
                {!term && Svg && headPart ? <Svg key="settings-mark" source={markLogoSvg(BRAND_ORANGE, 'on')} alt={PRODUCT_NAME} width={14} height={14} /> : null}
                {/* A narrow window leaves the name out (the mark says it), then the part's name with the mark: with
                    them, the part's name ran into Guide. */}
                {headName ? <Text color={DASH_TEXT} bold>{PRODUCT_NAME}</Text> : null}
                {headName ? <Text color={DASH_DIM}>·</Text> : null}
                {headPart ? <Text color={DASH_TEXT} italic>{CARDS.find(c => c.id === card)?.title}</Text> : null}
              </Box>
            )}
          </Box>,
          <Box key="settings-actions" {...(term ? { flexShrink: 1, flexWrap: 'wrap', columnGap: 2 } : { position: 'absolute', top: 0, right: 2, height: 2.5, gap: 2 })} flexDirection="row" alignItems="center">
            {/* A terminal without link support prints the whole address after the label, so there it copies instead. */}
            {/* Changes save themselves; this says so for a moment after each one, where a Save button would be. */}
            {headGuide || savedShows ? (
              <Box key="settings-saved-slot" width={8} flexShrink={0} justifyContent="flex-end">
                {savedShows ? <Text key="settings-saved" color={LAB_ON_COLOR} bold>✓ Saved</Text> : null}
              </Box>
            ) : null}
            {/* The guide: a book and the word, one button beside the cross, in every part; inside a part it opens at that
                part's section. The terminal copies the link. */}
            {headGuide ? guideButton('settings-guide', card ? `${GUIDE_URL}#${GUIDE_ANCHORS[card]}` : GUIDE_URL) : null}
            <Button key="settings-close" plain label="✕" onPress={close} />
          </Box>,
          ])}
          {/* An open card needs its rows for its text: the gap above it shrinks to one. */}
          {/* The bar covers the first rows: an open card keeps the same gap as the overview, or its first line sits
              under the bar. */}
          {term ? null : <Box key="settings-spacer" height={roomy ? 2 : 1} flexShrink={0} />}
          {frameOnly ? null : card === null ? (
            // The overview: a card per part, what it is set to in a few words. A card opens that part alone.
            // On the desktop the cards sit in the middle between the line under the bar and the slot's lower edge.
            // The slot reaches 10 px past the panel below, hence the padding on top (measured: 18 px above the
            // cards, 19 below); a row kept free under them had put the air below.
            <Box key="settings-cards-room" flexDirection="column" flexGrow={term ? 0 : 1} justifyContent="center" paddingTop={term ? 0 : 0.75}>
            {/* A narrow window: the cards keep the width they were made for (two rows) and scroll sideways, as an open
                card's rows do. Wrapped into a third row they were cut at the bottom, and the slot cannot scroll down. */}
            <Box key="settings-cards-scroll" flexDirection="column" {...(cardsCols ? { overflowX: 'scroll' } : {})}>
            <Box key="settings-cards" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={term ? 0 : 1} {...(cardsCols ? { width: cardsCols, flexShrink: 0 } : {})}>
              <Box position="absolute" top={0} left={0} />
              {CARDS.map(c => (
                <Box key={`card-${c.id}`} position="relative" flexDirection="column" flexGrow={1} width={0} minWidth={18}
                  paddingX={1} borderStyle="round" borderColor={DASH_EDGE} hover={{ backgroundColor: CARD_HOVER, borderColor: CARD_HOVER_EDGE }}>
                  <Box flexDirection="row" gap={1} alignItems="center">
                    {Svg && !term ? <Svg source={rowIconSvg(c.id, DASH_TEXT)} alt={c.title} width={14} height={14} /> : null}
                    {/* The terminal draws the blank buttons below as real spaces over the card's text, so there the
                        title itself is the button. (Full-width padded buttons per row looked worse: a big lit block.) */}
                    {term ? (
                      <Button key={`settings-card-${c.id}`} plain label={`${c.title} ›`} onPress={openCard(c.id)} />
                    ) : (
                      // One line, cut if need be: a title on two lines made its row taller and pushed the second row out
                      // of the slot.
                      <Text color={DASH_TEXT} bold wrap="truncate" hover={{ color: '#ffffff' }}>{c.title}</Text>
                    )}
                    {/* Maintainer tools' state at the right end of the Support title row; shown only, the card still opens Support. */}
                    {c.id === 'lab' && maint && !term ? <Box key="lab-power-push" flexGrow={1} /> : null}
                    {c.id === 'lab' && maint && !term ? labMark('settings-lab-power') : null}
                  </Box>
                  <Text dimColor wrap="truncate" hover={{ dimColor: false, color: DASH_TEXT }}>{summaries[c.id]}</Text>
                  {/* The click takes the whole card: a button is one line high and centred in its box, whatever the box,
                      so three blank ones are spread from the top edge to the bottom one and overlap. The card lights as a
                      whole (its own hover); two, spaced around, left its edges and a stripe between the lines dead. */}
                  {term ? null : <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="column" justifyContent="space-between">
                    {/* Each button sits in a clipping box and does not shrink: in a narrow card a shrunk button cut its
                        blank label to "\u2026", three stacked dots on the card. 800 no-break spaces (about 2,000 px: one is ~2.6 px, measured with
                        tools/render-band --hit) cover a card alone on its row edge to edge; the box clips the rest. */}
                    {['', '-2', '-3'].map(n => (
                      <Box key={`settings-card-box-${c.id}${n}`} flexDirection="row" justifyContent="center" overflow="hidden">
                        <Box flexShrink={0}>
                          <Button key={`settings-card-${c.id}${n}`} plain hover={{ backgroundColor: '#00000000' }} label={'\u00a0'.repeat(800)} onPress={openCard(c.id)} />
                        </Box>
                      </Box>
                    ))}
                  </Box>}
                </Box>
              ))}
            </Box>
            </Box>
            </Box>
          ) : (
            // One part: Back, its name and what it does, then its controls.
            // No gaps between the rows of an open card: the slot has few rows, and a card taller than it is cut off.
            // Never taller than the room left: a card that does not fit is cut at the bottom, never pushed under the bar.
            <Box key={`settings-${card}`} flexDirection="column" gap={0} flexShrink={1} overflow={openChoice && !term ? undefined : 'hidden'} minHeight={term ? undefined : SETTINGS_BODY_H}>
              {/* An empty absolute child makes the box positioned, so its rows paint, and take clicks, over the
                  entrance sweep and the art (absolute layers cover every plain box, and the sweep stays until the next
                  redraw). */}
              <Box position="absolute" top={0} left={0} />
              {/* Half a row of air under the top bar, in every part: the first line stuck to the bar's line. */}
              {term ? null : <Box key="settings-card-top" height={0.5} flexShrink={0} />}
              {/* What the part does, one dim line; then a blank row and the part's rows on the grid below. */}
              {/* Context size draws its own top line (a note in place of this one) and keeps its rows close: it must fit
                  the slot whole, also with its command. */}
              {/* Support has none: its parts' names (This plugin, Maintainer) say it, and the card needs the rows. Nor has
                  Customize: with its Terminal row, Uninstall was cut at the bottom. */}
              {/* Half a row between rows: lines that touch read as one block, and a whole row each made the cards scroll. */}
              {/* A narrow window scrolls the rows sideways (they keep the width they were made for). A scroll box also cuts
                  what leaves it at the top or bottom, so while a fixed mode's own list is open (it may open upwards,
                  over the rows above) the box does not scroll: the dropdowns sit near the left edge, in view. */}
              <Box key="settings-rows-scroll" flexDirection="column" {...(wideCols && !openChoice ? { overflowX: 'scroll' } : {})}>
              {/* The line on what the part does scrolls with the rows, at their width: wrapped in a narrow window it took
                  two or three lines and pushed the rows out at the bottom. */}
              {card === 'context' || card === 'lab' || card === 'show' ? null : (
                <Box key="settings-about" flexDirection="column" flexShrink={0} {...(wideCols ? { width: wideCols } : {})}>
                  <Text dimColor wrap={term ? 'truncate' : 'wrap'}>{CARDS.find(c => c.id === card)?.about}</Text>
                  {term ? null : <Box key="settings-card-gap" height={CARD_ROW_GAP} flexShrink={0} />}
                </Box>
              )}
              <Box key="settings-rows" flexDirection="column" alignItems="flex-start" gap={term ? 0 : CARD_ROW_GAP} {...(wideCols ? { width: wideCols, flexShrink: 0 } : {})}>
                {card === 'effort' ? [
            ...(term ? [gridRow('effort-lean', 'Lean', [
              <Text key="cheap" dimColor>Cheaper</Text>,
              <Box key="track" flexDirection="row" alignItems="center">{track}</Box>,
              <Text key="smart" dimColor>Smarter</Text>,
            ], `${LEAN_STOPS[shown.bias + 2]?.[0]}: ${LEAN_STOPS[shown.bias + 2]?.[1]}`)] : [
              // The stops with their names under them, then what the picked one does, in full on a line of its own
              // (beside the track it was cut off).
              gridRow('effort-lean', 'Lean', [
                <Box key="track" flexDirection="row" alignItems="flex-start">{track}</Box>,
              ]),
              gridSub('effort-lean-help', LEAN_HELP[shown.bias + 2] ?? ''),
            ]),
            ...(bare ? [] : [
              gridGap('effort-gap-1'),
              groupStart('effort-limits-group', gridRow('effort-limits', 'Limits', [
                pick({ drop: 'up', key: 'settings-floor', label: 'Min', value: shown.floor, options: opts(EFFORTS), onSelect: set('floor') }),
                pick({ drop: 'up', key: 'settings-ceiling', label: 'Max', value: shown.ceiling, options: opts(EFFORTS), onSelect: set('ceiling') }),
              ], 'Smart never goes below Min or above Max.')),
              gridGap('effort-gap-2'),
              // The dashboard's Auto switch exactly (switch, word, one blank button laid over both).
              gridRow('effort-helpers', 'Subagents', [
                Svg && !term ? (
                  <Box key="settings-helpers" position="relative" flexDirection="row" alignItems="center" gap={1}>
                    <Svg source={autoSwitchSvg(shown.helpers === 'on', helpersNow - helpersFlipAt)} alt={shown.helpers === 'on' ? 'Helpers on' : 'Helpers off'} width={26} height={15} />
                    <Box width={3} flexShrink={0}><Text color={shown.helpers === 'on' ? DASH_TEXT : DASH_DIM}>{shown.helpers === 'on' ? 'On' : 'Off'}</Text></Box>
                    <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                      <Box flexShrink={0}>
                        <Button key="settings-helpers-switch" plain hover={{ backgroundColor: '#00000000' }} label={' '.repeat(40)} onPress={() => set('helpers')(shown.helpers === 'on' ? 'off' : 'on')} />
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Button key="settings-helpers-switch" plain label={`${shown.helpers === 'on' ? '◉ On' : '○ Off'}`} onPress={() => set('helpers')(shown.helpers === 'on' ? 'off' : 'on')} />
                ),
              ], shown.helpers === 'on' ? 'Smart picks each subagent\'s effort, medium or more.' : 'Subagents run at the chat\'s effort.'),
              // Save mode: the running-low band's button as a switch, here at any time.
              gridRow('effort-save', 'Save mode', [
                Svg && !term ? (
                  <Box key="settings-save" position="relative" flexDirection="row" alignItems="center" gap={1}>
                    <Svg source={autoSwitchSvg(savingNow, 0)} alt={savingNow ? 'Save mode on' : 'Save mode off'} width={26} height={15} />
                    <Box width={3} flexShrink={0}><Text color={savingNow ? DASH_TEXT : DASH_DIM}>{savingNow ? 'On' : 'Off'}</Text></Box>
                    <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                      <Box flexShrink={0}>
                        <Button key="settings-save-switch" plain hover={{ backgroundColor: '#00000000' }} label={' '.repeat(40)} onPress={async () => { $.ui.toast(`${PRODUCT_NAME}: ${await toggleSave($)}`) }} />
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Button key="settings-save-switch" plain label={savingNow ? '◉ On' : '○ Off'} onPress={async () => { $.ui.toast(`${PRODUCT_NAME}: ${await toggleSave($)}`) }} />
                ),
              ], savingNow ? `Smart stays at medium or below until ${saveUntilLabel}.` : 'Smart stays at medium or below until a usage limit resets.'),
            ]),
] : card === 'context' ? (bare ? [] : [
            // The card has to fit the slot without scrolling: one note line at its top (in place of the part's "what it
            // does" line), New chats on one row with its state at the end, This chat only on one row with its command,
            // Paste into chat and Copy inline, and one note under it. No blank rows.
            ...((): unknown[] => {
              const viaCmd = settingsHookBlocked || windowViaCommand() || windowNow?.modelValue !== undefined
              const pending = (chatOverride === null && commandPending(shown.compactWindow, windowNow)) || (chatOverride !== null && commandPending(chatOverride, windowNow))
              const text = settingsFileRefused ? REFUSED_NOTE
                : viaCmd ? (windowViaFile() && !defaultFileFailed ? FILE_MODE_NOTE : COMMAND_MODE_NOTE)
                : pending ? COMMAND_MAYBE_NOTE
                : CARDS.find(c => c.id === 'context')?.about ?? ''
              return [contextNote('settings-context-command-note', text)]
            })(),
            // New chats: the default window. Where the plugin may write the settings file, a pick saves it there; where
            // Claude Code refuses that, Paste into new chat opens a chat of its own with the request, for the person to send.
            ...((): unknown[] => {
              const wantDefault = shown.compactWindow
              const defaultCmd = chatOverride === null && commandPending(wantDefault, windowNow) && (defaultFileFailed || !windowViaFile())
              // The file (read through settings.read) does not hold the default yet: the new chat still has work to do.
              const fileBehind = (userFileWindow ?? null) !== wantDefault
              // Its state at the end of the row, short enough to fit beside Paste into new chat. Where the settings
              // file sets the window, it says what the file holds, not what this chat runs on (the row below says that).
              const fileWay = settingsHookBlocked || settingsFileRefused || windowViaFile()
              const newChatsHint = !fileWay || !windowNow || chatOverride !== null
                ? windowNote(effectiveWindow(config.compactWindow, chatOverride), windowNow, chatOverride !== null)
                : !newChatsGet(wantDefault)
                  ? `Not saved yet: settings.json holds ${userFileWindow !== undefined ? windowLabel(userFileWindow) : 'no size'}.`
                  : commandPending(wantDefault, windowNow)
                    ? `Saved in settings.json. This chat runs on ${windowLabel(windowNow.raw)}.`
                    : wantDefault === null
                      ? `No size in settings.json: Claude Code's own. ${windowNow.trigger === null ? '' : `Compacts at ${windowLabel(windowNow.trigger)}.`}`
                      : `Saved in settings.json. ${windowNow.trigger === null ? 'Auto-compact is off.' : `Compacts at ${windowLabel(windowNow.trigger)}.`}`
              return [
                gridRow('context-default', 'New chats', [
                  pick({ key: 'settings-window', value: wantDefault === null ? 'default' : String(wantDefault),
                    options: [...new Set([...WINDOW_CHOICES, wantDefault])].map(w => ({ value: w === null ? 'default' : String(w), label: w === DEFAULT_WINDOW ? `${windowLabel(w)} (recommended)` : windowLabel(w) })),
                    onSelect: async (v: string) => {
                      const w = parseWindow(v)
                      if (w === undefined) { await set('compactWindow')(v); return }
                      const said = await applyDefaultWindow($, w, () => set('compactWindow')(v))
                      if (said) $.ui.toast(said)
                    } }),
                  ...commandControls('settings-window', defaultCmd, chatOverride === null),
                  // Where New chats goes into the settings file and the file holds another default: one click saves it.
                  ...(windowViaFile() && !defaultFileFailed && windowNow && fileBehind ? [
                    <Button key="settings-window-save" variant="secondary" label="Save for new chats" onPress={async () => {
                      const saved = await saveDefaultToFile($, wantDefault)
                      defaultFileFailed = !saved.ok
                      $.ui.toast(saved.text)
                      $.ui.invalidate('ui.render')
                    }} />,
                  ] : []),
                  // Where Claude Code keeps the file from plugins: a new chat of its own asks Claude to write it there.
                  ...(settingsFileRefused && fileBehind ? [
                    <Button key="settings-window-newchat" variant="secondary" label="Paste into new chat" onPress={async () => {
                      $.ui.toast(await openSettingsChat($, wantDefault, e.surface))
                    }} />,
                  ] : []),
                ], newChatsHint, 'settings-window-note'),
              ]
            })(),
            // This chat only (R10): a list like New chats, "Your default" first, then every size the model holds. A size
            // is shown as in use only once a window read confirms it. Where it must go through /autocompact, the command
            // with Paste into chat and Copy sits in the same row until it is in force.
            ...((): unknown[] => {
              const modelMax = windowNow?.modelWindow ?? lastContext?.window
              const sizes = chatWindowChoices(config.compactWindow, modelMax)
              const state = chatWindowState(chatOverride, windowNow, chatWindowChecked)
              const fileMode = windowViaFile() && !defaultFileFailed
              const viaCmdHere = settingsHookBlocked || windowViaCommand() || windowNow?.modelValue !== undefined || defaultFileFailed || settingsFileRefused
              // On the default, but this chat still runs on another size: the /autocompact for the default (the New
              // chats value), ready in the row. Without the settings file it also sets new chats on this model.
              const defaultHere = chatOverride === null && (fileMode || viaCmdHere) && commandPending(config.compactWindow, windowNow)
              const now = chatOverride === null
                ? (defaultHere && windowNow
                  ? fileMode
                    ? `Still on ${windowLabel(windowNow.raw)}. Send the command to switch this chat to ${windowLabel(config.compactWindow)}.`
                    : `Still on ${windowLabel(windowNow.raw)}. Send the command: it switches this chat and new chats on this model.`
                  : `Uses your default, ${windowLabel(config.compactWindow)}.`)
                : chatWindowWords(chatOverride, state, windowNow).card
              const chatCmd = chatOverride !== null && state !== 'active' && commandPending(chatOverride, windowNow) && (modelMax === undefined || chatOverride <= modelMax)
              const cmdW = chatOverride ?? config.compactWindow
              // On the default, but this chat runs on another size: the list shows the size it runs on, and the
              // /autocompact for the default comes only once Your default is picked.
              const actual = chatOverride === null && defaultHere && !chatDefaultPicked && windowNow ? windowNow.raw : null
              const offerDefault = defaultHere && actual === null
              return [
                gridRow('settings-chat-window-row', 'This chat only', [
                  pick({ key: 'settings-chat-window', value: actual !== null ? String(actual) : chatOverride === null ? 'default' : String(chatOverride),
                    options: [
                      { value: 'default', label: `Your default (${windowLabel(config.compactWindow)})` },
                      ...[...new Set([...sizes, ...(chatOverride !== null && (!modelMax || chatOverride <= modelMax) ? [chatOverride] : []), ...(actual !== null ? [actual] : [])])].sort((x, y) => x - y)
                        .map(w => ({ value: String(w), label: `${windowLabel(w)}${w === DEFAULT_WINDOW ? ' (recommended)' : ''}${w === actual ? ' (now)' : ''}` })),
                    ],
                    onSelect: async (v: string) => {
                      const w = v === 'default' ? null : parseWindow(v)
                      if (w === undefined || (actual !== null && w === actual)) return
                      if (w === null) chatDefaultPicked = true
                      $.ui.toast(await setChatWindow($, w, e.surface))
                      await flashSaved($)
                    } }),
                  ...(chatCmd || offerDefault ? [
                    <Text key="settings-chat-window-command-text" color={DASH_TEXT}>{autocompactLine(cmdW)}</Text>,
                    <Button key="settings-chat-window-paste" variant="secondary" label="Paste into chat" onPress={async () => { $.ui.toast(await offerAutocompact($, cmdW, e.surface)) }} />,
                    <Button key="settings-chat-window-copy" plain dimColor label="Copy" onPress={async () => { $.ui.toast(await copyAutocompact($, cmdW, e.surface)) }} />,
                  ] : commandControls('settings-chat-window', chatCmd, chatOverride !== null)),
                ]),
                gridNote('settings-chat-window-now', actual !== null
                  ? `Runs on ${windowLabel(actual)}; new chats start on ${windowLabel(config.compactWindow)}. Your default switches this chat too.`
                  : chatOverride === null && defaultHere ? now : `${now} ${fileMode ? 'Only this chat: new chats keep your default.' : viaCmdHere ? 'It also sets new chats on this model.' : MORE_ROOM_TIP}`),
              ]
            })(),
]) : card === 'model' ? (bare ? [] : [
            // Both choices on one row, the one in force filled; what it does in the hint.
            gridRow('model-route', 'Simple prompts', [
              ...[...MODEL_CHOICES].reverse().map(c => (
                <Button key={`settings-model-${c.value}`} plain dimColor={shown.modelAuto !== c.value} label={`${shown.modelAuto === c.value ? '◉' : '○'} ${c.label}`} onPress={() => set('modelAuto')(c.value)} />
              )),
              // A warning in the cache countdown's yellow: this choice rarely pays.
              <Text key="model-tag-on" color={YELLOW}>⚠ experimental</Text>,
            ]),
            // What the choice does: one small line under the choices (beside them it wrapped into a column of four lines).
            gridSub('model-route-about', MODEL_CHOICES.find(c => c.value === shown.modelAuto)?.about ?? ''),
            gridGap('model-gap'),
            gridRow('model-compact', 'Summaries', [
              pick({ key: 'settings-compact-with', value: shown.compactWith, options: COMPACT_CHOICES.map(c => ({ value: c.value, label: c.label })), onSelect: set('compactWith') }),
            ], COMPACT_CHOICES.find(c => c.value === shown.compactWith)?.about, 'settings-compact-about'),
            ...(compactHookBlocked && shown.compactWith === 'auto' ? [gridNote('settings-compact-blocked', COMPACT_BLOCKED_NOTE)] : []),
          ]) : card === 'about' ? [
            gridRow('about-version', 'Version', [<Text key="about-name" color={DASH_TEXT} bold>{`${PRODUCT_NAME} ${ownVersion || OWN_VERSION}`}</Text>]),
            gridRow('about-base', 'Based on', [
              <Text key="about-base-text">{`${UPSTREAM_NAME} ${UPSTREAM_BASE} by HeyCubit (MIT)`}</Text>,
              guideLink('about-upstream', UPSTREAM_URL.replace('https://', ''), UPSTREAM_URL, 'Upstream'),
            ]),
            ...(SUPPORT_HINT ? [gridRow('about-support', 'Questions', [<Text key="about-support-text">{SUPPORT_HINT.replace(/^Questions:\s*/, '')}</Text>])] : []),
          ] : card === 'lab' ? (bare ? [] : [
            // Two parts: This plugin (its own updates from GitHub, a maintainer's clone being its own source, and Report a
            // bug), then, for a maintainer only, Maintainer with its On / Off beside the name.
            gridSection('support-plugin', 'This plugin', [
            gridRow('support-updates', 'Updates', maint ? [
              <Text key="support-clone" dimColor wrap="truncate">From your clone</Text>,
            ] : ownOn ? [
              ownChecking === 'checking' ? <Text key="support-checking" dimColor>Checking…</Text>
                : ownChecking === 'newest' ? <Text key="support-newest" dimColor>✓ Up to date</Text>
                : ownChecking === 'failed' ? <Text key="support-failed" dimColor>Check failed</Text>
                : ownChecking === 'found' && ownFound ? <Button key="support-found" variant="secondary" label={`Update to ${ownFound.version}`} onPress={() => runOwnUpdate($, ownFound)} />
                : ownChecking === 'skipped' ? <Text key="support-skipped" dimColor>Newest version skipped</Text>
                : ownChecking === 'local' ? <Text key="support-local" dimColor>Installed from a local folder</Text>
                : <Button key="support-check" variant="secondary" label="Check now" onPress={() => void checkOwnNow($)} />,
              <Button key="support-updates-off" plain dimColor label="Turn off" onPress={async () => { $.ui.toast(await setOwnUpdates($, false)) }} />,
            ] : [
              <Button key="support-updates-on" variant="secondary" label="Turn on" onPress={async () => { $.ui.toast(await setOwnUpdates($, true)) }} />,
            ], maint ? 'git pull updates it.' : ownOn ? 'Checks GitHub every 6 hours.' : 'Off. No update checks.'),
            gridRow('support-bug', 'Report a bug', [
              guideLink('support-bug-link', 'Open an issue', bugReportUrl(ownVersion || OWN_VERSION), 'New issue'),
            ], 'On GitHub, with your version filled in.'),
            ]),
            ...(maint ? [gridSection('support-maintainer', 'Maintainer', [
            // Upstream updates: off unless a folder is set. Off, no network call of its own runs.
            gridRow('lab-updates', 'Upstream updates', labNow?.on ? [
              checking === 'checking' ? <Text key="lab-checking" dimColor>Checking…</Text>
                : checking === 'newest' ? <Text key="lab-newest" dimColor>✓ Up to date</Text>
                : checking === 'failed' ? <Text key="lab-failed" dimColor>Check failed</Text>
                : <Button key="lab-check" variant="secondary" label="Check now" onPress={() => void checkUpdateNow($)} />,
              <Button key="lab-updates-off" plain dimColor label="Turn off" onPress={async () => { $.ui.toast(await setLabUpdates($, null)) }} />,
            ] : [
              // On with the plugin's own folder where that is a clone of the repo (a maintainer's install); otherwise the
              // toast says which command takes another folder.
              <Button key="lab-updates-on" variant="secondary" label="Turn on" onPress={async () => {
                const root = String($.plugin.root ?? '')
                const problem = root ? await labFolderProblem($, root) : 'No plugin folder.'
                $.ui.toast(problem ? `This install isn't a clone of the repo. Run /${PLUGIN} maintainer updates <folder of your clone>.` : await setLabUpdates($, root))
              }} />,
            ], labNow?.on ? 'Checks every 6 hours.' : 'Off. Review new upstream releases.'),
            // Measurement, the lab: a switch with the flask and On or Off, and once on the share that runs as the control
            // arm. Off, nothing is logged and no control arm runs. On again takes the last share, else 10 %.
            gridRow('lab-measure', 'Measurement', [
              Svg && !term ? (
                <Box key="lab-measure-switch-box" position="relative" flexShrink={0} flexDirection="row" alignItems="center" gap={1}>
                  <Svg source={autoSwitchSvg(labOn, 0)} alt={labOn ? 'Measurement on' : 'Measurement off'} width={26} height={15} />
                  <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center" justifyContent="center" overflow="hidden">
                    <Box flexShrink={0}>
                      <Button key="lab-measure-switch" plain hover={{ backgroundColor: '#00000000' }} label={'\u00a0'.repeat(4)} onPress={async () => {
                        $.ui.toast(await setLabMeasure($, labOn ? null : config.abControl > 0 ? config.abControl : MAINTAINER_MEASURE_DEFAULT)); await flashSaved($)
                      }} />
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Button key="lab-measure-switch" plain label={labOn ? '◉ On' : '○ Off'} onPress={async () => {
                  $.ui.toast(await setLabMeasure($, labOn ? null : config.abControl > 0 ? config.abControl : MAINTAINER_MEASURE_DEFAULT)); await flashSaved($)
                }} />
              ),
              ...(labOn ? [pick({ key: 'lab-measure-pick', value: String(config.abControl),
                options: AB_STEPS.map(n => ({ value: String(n), label: n ? `${n} % compare` : 'Log only' })),
                onSelect: async v => { $.ui.toast(await setLabMeasure($, Number(v))); await flashSaved($) } })] : []),
            ], labOn ? 'Logs cost and effort data on this computer.' : 'No cost data is logged for later analysis.', undefined, labMark('settings-lab-power-row')),
            ], undefined, 0.5)] : []),
          ]) : card === 'handoff' ? (bare ? [] : [
            gridRow('handoff-skill', 'Handoff skill', [
              pick({ key: 'settings-skill', value: shown.handoffSkill || '-', options: [
                  { value: '-', label: `${PRODUCT_NAME} (built in)` },
                  ...[...new Set([...(shown.handoffSkill ? [shown.handoffSkill] : []), ...skillNames])].map(name => ({ value: name, label: `/${name}` })),
                ], onSelect: v => set('handoffSkill')(v === '-' ? '' : v) }),
            ], 'Writes the note a new chat starts from.'),
            gridRow('handoff-button', 'Handoff button', [
              pick({ key: 'settings-handoff-button', value: shown.handoffButton, options: [{ value: 'advised', label: 'When advised' }, { value: 'always', label: 'Always' }], onSelect: set('handoffButton') }),
            ], shown.handoffButton === 'always' ? 'Always in the bar.' : 'Shows when a handoff beats compacting.'),
            gridGap('handoff-gap'),
            gridRow('handoff-alerts', 'Alerts', [
              alertToggles[0],
              pick({ drop: 'up', key: 'settings-swamp', value: shown.swampAt, options: [{ value: 'auto', label: 'Auto (recommended)' }, ...SWAMP_STEPS.map(n => ({ value: String(n), label: `${n}%` }))], onSelect: set('swampAt') }),
              alertToggles[1],
              alertToggles[2],
            ]),
            gridNote('handoff-alerts-about', 'Context: the chat is nearly full. Running low: a usage limit is close. Cold cache: the next message pays full price.'),
]) : [
            // The colours are always navy & orange; only light or dark is a choice. (The theme stays a setting for a
            // neutral build later, see names.ts, but is not offered here.)
            ...(bare ? [] : [
              gridRow('show-layout', 'Show', [
                pick({ key: 'settings-layout', value: shown.layout, options: [{ value: 'default', label: 'Bar' }, { value: 'minimal', label: 'Buttons only' }], onSelect: set('layout') }),
              ], shown.layout === 'minimal' ? '☰, Smart, Reduce and ⚙ under the prompt.' : 'Effort, context, cache and buttons in one bar.'),
              // Acts in the terminal only (the bar above the prompt can cover what lies there; below, one status line
              // instead), but shown in the app too, so every setting sits in one place.
              gridRow('show-terminal', 'Terminal', [
                pick({ key: 'settings-terminal-place', value: shown.terminalPlace, options: [{ value: 'top', label: 'Above prompt' }, { value: 'bottom', label: 'Below prompt' }], onSelect: set('terminalPlace') }),
              ], !term ? 'When Claude runs in a terminal. The app keeps its bar.'
                : shown.terminalPlace === 'bottom' ? 'A status line under the prompt. /smarttokensaver settings opens this panel.' : 'The bar above the prompt.'),
              gridRow('show-panels', 'Panels', [
                pick({ key: 'settings-appearance', value: shown.appearance, options: [{ value: 'auto', label: 'Automatic' }, { value: 'dark', label: 'Always dark' }, { value: 'light', label: 'Always light' }], onSelect: set('appearance') }),
              ], shown.appearance === 'auto' ? 'Follows the app, light or dark.' : `These panels only, ${shown.appearance}. The app keeps its own mode.`),
              gridGap('show-gap-1'),
            ]),
            gridRow('show-details', 'In the bar', toggles, 'Shown beside Smart.', 'settings-show-about'),
            ...(bare ? [] : [
              gridGap('show-gap-2'),
              gridRow('show-uninstall', 'Remove', [uninstallButton($, themedEls($.ui.resolve(e), e.surface))]),
            ]),
]}
              </Box>
              </Box>
            </Box>
          )}
        </Box>
      )
    }
    // The handoff bar: quick or full, then what follows, and a line saying what that does. Opened by ⇥ or the swamp
    // band's Handoff; Go keeps the choice for next time. Enter presses Go once the bar holds the keyboard.
    // The compact bar: an optional note for the summary, then Compact (or Enter).
    if (e.surface !== 'terminal' && (await read($, compactAsk))) {
      const { Input } = themedEls($.ui.resolve(e), e.surface)
      // The pill's word keeps its colour: the light turn would darken white words on the dark pill.
      const go = () => compactCold($, compactNote)
      const nowCompact = await $.clock.now()
      // One redraw once the fade is over, to drop its layer.
      if (nowCompact - compactOpenedAt < COMPACT_FADE_MS) $.clock.after(COMPACT_FADE_MS + 150 - (nowCompact - compactOpenedAt), () => $.ui.invalidate('ui.render'))
      return (
        <Box key="compact-bar" position="relative" flexDirection="row" alignItems="center" paddingX={1} overflow="hidden"
          {...panelFrame(BRAND_BG)}>
          {/* Opening from the swamped band: its green fades out over the violet, then the entrance sweep. */}
          {nowCompact - compactOpenedAt < COMPACT_FADE_MS + 100 ? (
            <Box key="compact-fade" position="absolute" top={-1} left={0} right={0} bottom={-1}>
              <Svg source={compactFadeSvg(nowCompact - compactOpenedAt)} alt="" width={1600} height={240} />
            </Box>
          ) : null}
          {introLayer({ Box, Svg }, 'compact', await introShows($, 'compact'))}
          {/* One line, as tall as the bands, as the handoff bar: the name, "or" and the other way (Handoff instead) on the
              left; the note, Compact and ✕ on the right. Each group is relative with an empty absolute child, so it is
              drawn over the absolute art and takes clicks. */}
          <Box key="compact-words" position="relative" flexShrink={0} flexDirection="row" alignItems="center" gap={1}>
            <Box position="absolute" top={0} left={0} />
            {markTitle({ Box, Text, Svg }, 'compact-title', ACCENT, '✦ Compact session')}
            <Text dimColor>or</Text>
            <Button key="compact-to-handoff" plain dimColor label="Handoff instead" onPress={async () => { await update($, compactAsk, () => false); await openHandoffBar($) }} />
          </Box>
          <Box key="compact-controls" position="relative" flexGrow={1} flexShrink={1} minWidth={0} marginLeft={2} flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1}>
            <Box position="absolute" top={0} left={0} />
            {/* The field shows through a window anchored right: its own Enter hint (a submit button 12 px wide, 6 px
                after the field) is pushed past the window's right edge and clipped, whatever width the app gives the
                field. Three cells out, one cell of padding back: the field ends 2 px inside, the hint starts 4 px out. */}
            {/* The window reaches a row above and below the field (absolutely, so the bar stays one line): one line tall,
                it cut the field's focus ring off at the top and bottom. */}
            {/* It gives way before the Compact button does: in a narrow pane the field shrinks, the button stays. */}
            <Box key="compact-field" position="relative" width={44} minWidth={6} height={1} flexShrink={1}>
              <Box position="absolute" top={-1} bottom={-1} left={0} right={0} overflow="hidden">
                <Box position="absolute" top={0} bottom={0} right={-3} width={60} flexDirection="row" alignItems="center" justifyContent="flex-end" paddingRight={1}>
                  {backed('compact-note', <Input key="compact-note" placeholder="What to keep (optional)" submitLabel={'​'}
                      onInput={v => { compactNote = v }} onSubmit={v => { compactNote = v; void go() }} />, 2.86)}
                </Box>
              </Box>
            </Box>
            {/* Compact: the app's own primary button, as Save mode and Next are. Enter in the field compacts too. */}
            <Box key="compact-go-box" position="relative" flexShrink={0}>
              <Box position="absolute" top={0} left={0} />
              <Button key="compact-go" variant="primary" label="Compact" onPress={go} />
            </Box>
            <Box key="compact-close-box" position="relative" flexShrink={0}>
              <Box position="absolute" top={0} left={0} />
              <Button key="compact-close" plain label="✕" hover={{ backgroundColor: CARD_CLOSE_HOVER }} onPress={() => update($, compactAsk, () => false)} />
            </Box>
          </Box>
        </Box>
      )
    }
    const choice = await read($, handoffPick)
    if (choice) {
      const setBar = (change: Partial<HandoffChoice>) => async () => {
        if (change.kind && change.kind !== choice.kind) kindFlipAt = await $.clock.now()
        await update($, handoffPick, () => ({ ...choice, ...change }))
        // The write alone redraws the bar; a full invalidate redraws the art too, which flickers.
      }
      const { Select } = themedEls($.ui.resolve(e), e.surface)
      const what = handoffWhat(choice, config.handoffSkill)
      // What happens after the note is written: the app's dropdown, or the pinned panel's own.
      const afterPick: OwnPick = {
        key: 'handoff-after', value: choice.after,
        options: [
          { value: 'continue', label: 'Clear & carry on' },
          { value: 'confirm', label: 'Clear & wait' },
          { value: 'copy', label: 'Keep chat & copy' },
        ],
        onSelect: v => setBar({ after: v as HandoffAfter })(),
      }
      const afterOwn = e.surface === 'terminal' ? null : ownChoice($, afterPick)
      // Go is the one lit button: the picked kind is a quiet box, the other plain text. The app draws a hotkey's
      // letter faint on a grey button, so only the terminal gets letters there.
      const term = e.surface === 'terminal'
      const kindNow = await $.clock.now()
      // Go and ✕ close the list of controls; the desktop bar draws them apart from the rest, in the middle of its rows.
      const goButton = <Button key="handoff-go" variant="primary" autoFocus label="Go" onPress={() => goHandoff($, choice)} />
      const closeButton = <Button key="handoff-close" plain role="dismiss" label="✕" onPress={() => closeHandoffBar($)} />
      const controls = [
        // Desktop: one switch with both words, the knob under the picked one (like Auto), each half a blank button.
        !term && Svg ? (
          <Box key="handoff-kind" position="relative" flexShrink={0} flexDirection="row" alignItems="center">
            <Box width={KIND_CELLS * 2} height={1} flexShrink={0} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
              <Svg source={kindSwitchSvg(choice.kind, kindNow - kindFlipAt)} alt={choice.kind === 'full' ? 'Full handoff' : 'Quick handoff'} width={KIND_W} height={KIND_H} />
            </Box>
            <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center">
              {(['quick', 'full'] as const).map(k => (
                <Box key={`handoff-kind-${k}`} flexGrow={1} width={0} flexDirection="row" alignItems="center" justifyContent="center">
                  <Box flexShrink={0} width={2} alignItems="center"><Svg source={rowIconSvg(k, choice.kind === k ? DASH_TEXT : DASH_DIM)} alt={k === 'quick' ? 'bolt' : 'pen'} width={14} height={14} /></Box>
                  <Text color={choice.kind === k ? DASH_TEXT : DASH_DIM}>{k === 'quick' ? 'Quick' : 'Full'}</Text>
                </Box>
              ))}
            </Box>
            <Box position="absolute" top={0} bottom={0} left={0} right={0} flexDirection="row" alignItems="center">
              {(['quick', 'full'] as const).map(k => (
                // Each half clips its blank button: the focus ring a click leaves is drawn outside the button, so it is
                // cut off here instead of framing the half (or, moved on, the Go button).
                <Box key={`handoff-kind-hit-${k}`} flexGrow={1} width={0} justifyContent="center" overflow="hidden">
                  <Button key={`handoff-${k}`} plain hover={{ backgroundColor: '#00000000' }} label={' '.repeat(KIND_CELLS)} onPress={setBar({ kind: k })} />
                </Box>
              ))}
            </Box>
          </Box>
        ) : null,
        term || !Svg ? (choice.kind === 'quick' ? (
          <Button key="handoff-quick" hotkey={term ? 'q' : undefined} variant="secondary" label="Quick" onPress={setBar({ kind: 'quick' })} />
        ) : (
          <Button key="handoff-quick" hotkey={term ? 'q' : undefined} plain dimColor label="Quick" onPress={setBar({ kind: 'quick' })} />
        )) : null,
        term || !Svg ? (choice.kind === 'full' ? (
          <Button key="handoff-full" hotkey={term ? 'f' : undefined} variant="secondary" label="Full" onPress={setBar({ kind: 'full' })} />
        ) : (
          <Button key="handoff-full" hotkey={term ? 'f' : undefined} plain dimColor label="Full" onPress={setBar({ kind: 'full' })} />
        )) : null,
        afterOwn ? afterOwn.field : <Select key={afterPick.key} value={afterPick.value} options={afterPick.options} onSelect={afterPick.onSelect} />,
        goButton,
        closeButton,
      ]
      // The terminal says all of it on one line. The desktop bar has two rows on the right: the controls, with a few
      // dim words before the switch that say what the picked kind is, and under them, from those words to the bar's
      // end, a line that says what the way picked in the dropdown does (the three names alone did not say it).
      const line = `${what.by}. ${what.then}`
      const kindLine = choice.kind === 'full' ? (config.handoffSkill ? `Runs /${config.handoffSkill}.` : 'Takes a turn.') : 'In seconds.'
      if (e.surface === 'terminal') return terminalPanel($, e, 'handoff-bar', '⇥ Handoff', line, controls)
      // In a narrow pane the words before the switch go: the controls and the line under them matter more.
      const kindFits = typeof e.props.bodyColumns !== 'number' || e.props.bodyColumns >= 64
      return (
        // The name and the other way on the left, in the row of the controls; the controls and their line on the right.
        // In a narrow pane the right group wraps to rows of its own.
        <Box key="handoff-bar" position="relative" flexDirection="column" paddingX={1} overflow="hidden"
          {...panelFrame(BRAND_BG)}>
          {/* The entrance as the bar opens, only then: a choice redraws the bar. */}
          {introLayer({ Box, Svg }, 'handoff', await introShows($, 'handoff'))}
          {/* The row is relative with an empty absolute child, so its buttons are drawn over the art and take clicks. */}
          {/* The name with the other way, and Go with ✕, sit in the middle of the bar's two rows;
              the switch and the dropdown keep the upper row, their line the lower one. */}
          <Box key="handoff-row" position="relative" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={1}>
            <Box position="absolute" top={0} left={0} />
            <Box key="handoff-words" flexDirection="row" alignItems="center" gap={1} flexShrink={0}>
              <Box flexShrink={0}><Text color={ACCENT} bold>⇥ Handoff</Text></Box>
              <Box flexShrink={0}><Text dimColor>or</Text></Box>
              <Box key="handoff-to-compact-box" flexShrink={0}>
                <Button key="handoff-to-compact" plain dimColor label="Compact instead" onPress={async () => { await closeHandoffBar($); await openCompact($, e) }} />
              </Box>
            </Box>
            <Box key="handoff-actions" flexGrow={1} flexShrink={1} minWidth={0} flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1}>
              <Box key="handoff-side" flexDirection="column" flexShrink={0}>
                <Box key="handoff-controls" flexDirection="row" alignItems="center" gap={1}>
                  {kindFits ? <Box key="handoff-what-box" flexShrink={0}><Text key="handoff-what" dimColor italic size="caption">{kindLine}</Text></Box> : null}
                  {controls.slice(0, -2)}
                </Box>
                {/* No width of its own, so it takes the controls' and wraps inside it: it starts under the first of them
                    and never widens the bar. */}
                <Box key="handoff-explain-row" flexDirection="row" marginTop={0.3}>
                  <Box key="handoff-explain-box" width={0} flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text key="handoff-explain" dimColor size="caption" wrap="wrap">{handoffAfterNote(choice.after)}</Text>
                  </Box>
                </Box>
              </Box>
              {goButton}
              {closeButton}
            </Box>
          </Box>
          {/* A pinned panel's dropdown opens here, under its field. */}
          {afterOwn?.list ? (
            <Box key="handoff-after-list" position="relative" flexDirection="row" justifyContent="flex-end" paddingRight={10.4} marginTop={1}>
              <Box position="absolute" top={0} left={0} />
              {afterOwn.list}
            </Box>
          ) : null}
        </Box>
      )
    }
    // The setup guide, one step at a time: the lean, the compaction window (only where the model's window is bigger
    // than the recommended one), the handoff, the look, then a word on what else is there. The choices are saved together at Done or ✕ (see setupDraft).
    const step = await read($, setupStep)
    if (step) {
      const { Input } = themedEls($.ui.resolve(e), e.surface)
      const draft = await read($, setupDraft)
      const shown = setupShown(draft, config)
      const pick = (field: keyof SettingsDraft, value: string) => update($, setupDraft, d => ({ ...d, [field]: value }))
      const go = (to: SetupStep | null) => () => goSetup($, to)
      const withWindow = guideHasWindow()
      const withOther = otherFound !== null || step === 'other'
      // Step 2b, this chat: where new chats get the size picked in step 2 (Apply saved it, or the settings file held it
      // already) and this chat still runs on another one. It counts as part of step 2 and sits between it and the look.
      const chatStep = (w: number | null) => (windowViaCommand() || settingsHookBlocked || settingsFileRefused)
        && ((setupApplied !== undefined && setupApplied === w) || newChatsGet(w)) && !!windowState && commandPending(w, windowState)
      const back = step === 'windowchat' ? 'window'
        : step === 'look' && withWindow && chatStep(shown.compactWindow) ? 'windowchat'
        : setupBack(step, withWindow, withOther)
      const counter = setupCounter(step === 'windowchat' ? 'window' : step, withWindow, withOther)
      const nextStep = step === 'windowchat' ? 'look'
        : step === 'window' && chatStep(shown.compactWindow) ? 'windowchat'
        : setupNext(step, withWindow, withOther)
      // Back and the way on, bottom right. The ✕ sits top right beside Guide (see band), as in the settings.
      const nav = (forward: unknown) => [
        ...(back ? [<Button key="setup-back" plain dimColor label="Back" onPress={go(back)} />] : []),
        forward,
      ]
      const nextButton = <Button key="setup-next" variant="primary" label="Next" onPress={go(nextStep)} />
      // The title over one line of words on the left, the controls on the right. The controls are their own absolute
      // layer, drawn last: the app draws anything in the flow under the absolute art, where it takes no clicks
      // (position="relative" does not lift it). The spacer keeps the words clear of them; room is their width in
      // columns. The art is still: every click redraws the band.
      // Three rows: the title with the question, a line that explains the choice in full (it wraps instead of being cut),
      // and the controls. The controls are their own absolute layer, drawn last: the app draws anything in the flow
      // under the absolute art, where it takes no clicks (position="relative" does not lift it). A blank row in the flow
      // holds their place. The art is still: every click redraws the band.
      // notice: a line in the accent colour that says what is the person's to do, an arrow, and its buttons, in a row of
      // its own between the choices and Back / Next (so those stay where every step has them).
      // A narrow band (a small window, or the app's zoom): the window step's sizes no longer fit in one row (about 97
      // cells), so the steps take shorter words, stack their rows and move a notice's words up into the text.
      const setupCols = typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : undefined
      const narrow = setupCols !== undefined && setupCols < SETUP_NARROW_COLUMNS
      const band = (question: string, explain: unknown, choices: unknown[], controls: unknown[], look: 'brand' | 'done' = 'brand', stacked = false,
        notice?: { text: string; buttons: unknown[] }, choiceRows = 2) => {
        // The choices take their rows and a blank one; the notice shares the bottom row with Back and Next (in a row of
        // its own the window step ran past the bottom of the space above the prompt).
        const choicesH = stacked && choices.length ? choiceRows + 1 : 0
        const actionsH = choicesH + 2
        const title = look === 'done' ? `✓ ${PRODUCT_NAME} setup complete` : counter ? `✦ ${PRODUCT_NAME} setup  ${counter}` : `✦ ${PRODUCT_NAME} setup`
        const color = look === 'done' ? DONE_ACCENT : ACCENT
        const lines = (Array.isArray(explain) ? explain : [explain]).filter(Boolean)
        if (e.surface === 'terminal')
          return terminalPanel($, e, 'setup', `${title}  ${question}`, (
            <Box key="setup-what" flexDirection="column">
              {lines.map((l, i) => typeof l === 'string' ? <Text key={`setup-line-${i}`} dimColor wrap="wrap">{l}</Text> : l)}
            </Box>
          ), [...choices, ...(notice ? notice.buttons : []), ...controls, ...(look === 'done' ? [] : [<Button key="setup-close" plain role="dismiss" label="✕" onPress={() => closeSetup($)} />])])
        // Narrow: a notice's words go up into the text (beside its buttons they were squeezed into a column one word wide);
        // the row of Back and Next keeps the arrow and its buttons.
        const noticeUp = !!notice && narrow
        // The rows the text may take: the band's rows less the head, its gap, the question and the actions' layer. The
        // text is clipped there, so a wrong guess cuts its last line instead of running under the choices.
        const textRows = slotRows - 3 - (stacked ? actionsH : 2)
        // Narrow: a dim line that would not fit goes (the lean's line on what effort is, the window step's how): estimated per
        // line from its length, generously, since the font is proportional.
        const rowsOf = (l: unknown) => {
          const t = typeof l === 'string' ? l : l && typeof l === 'object' && 'accent' in l ? (l as { accent: string }).accent : ''
          return t && setupCols ? Math.max(1, Math.ceil(t.length / (setupCols * 0.85))) : 1
        }
        // The notice goes first: it says what to do before Next works, and the lines after it are what gives way.
        const shownLines: unknown[] = noticeUp ? [{ accent: notice!.text }, ...lines] : [...lines]
        while (look !== 'done' && narrow && setupCols && shownLines.reduce((n: number, l) => n + rowsOf(l), 0) > textRows) {
          let drop = -1
          shownLines.forEach((l, i) => { if (i > 0 && typeof l === 'string') drop = i })
          if (drop < 0) break
          shownLines.splice(drop, 1)
        }
        // Desktop: the title as the settings write it (the logo, the name in bold, a dot, the place in italics, the step),
        // a blank row, the question in bold, what the choice does, a dim hint, then the choices and buttons. The buttons
        // get two rows of their own: in one row the app's button was cut at the band's bottom edge.
        return (
          // Every step but the last as tall as the slot shows without scrolling (see slotRows): the same height on each
          // step, and no scrolling by a few pixels. Back, Next and the choices sit at the bottom, so they stay in view.
          <Box key="setup" position="relative" flexDirection="column" paddingX={1} overflow="hidden" height={look === 'done' ? undefined : slotRows}
            {...panelFrame(look === 'done' ? DONE_BG : BRAND_BG, look === 'done', { Box })}>
            {/* The art is taller than any setup band and centred on it, cut at the edges: at the bars' height (128) it
                left a strip unpainted above and below in a band of seven rows. */}
            {ownArt(slotArt({ Box, Text, Button } as unknown as Parts, 'setup-art',
              <Svg source={setupArtSvg(look, isLight(), config.theme)} alt={PRODUCT_NAME} width={SETUP_ART_W} height={SETUP_ART_H} />, 'right', 'middle'))}
            <Box key="setup-head" position="relative" flexDirection="row" alignItems="center" gap={1}>
              {look === 'done'
                ? <Text color={color} bold>✓</Text>
                : <Svg source={markLogoSvg(BRAND_ORANGE, 'on')} alt={title} width={14} height={14} />}
              <Text color={color} bold>{PRODUCT_NAME}</Text>
              <Text color={DASH_DIM}>·</Text>
              <Text italic>{look === 'done' ? 'Setup complete' : 'Setup'}</Text>
              {counter && look !== 'done' ? <Text dimColor>{counter}</Text> : null}
            </Box>
            <Box key="setup-gap" height={1} />
            <Text key="setup-question" bold wrap="wrap">{question}</Text>
            <Box key="setup-text" flexDirection="column" flexShrink={0} {...(look === 'done' ? {} : { height: textRows, overflow: 'hidden' })}>
              {shownLines.map((l, i) => typeof l === 'string'
                ? <Text key={`setup-line-${i}`} dimColor={i > (noticeUp ? 1 : 0)} wrap="wrap">{l}</Text>
                : l && typeof l === 'object' && 'accent' in l
                  ? <Text key="setup-notice-words" color={ACCENT} wrap="wrap">{(l as { accent: string }).accent}</Text>
                  : <Box key={`setup-line-${i}`}>{l as never}</Box>)}
            </Box>
            {/* The done step's Close sits in the row of its last line where that line is short; narrow, it gets a row
                of its own, so it never covers the words. */}
            <Box key="setup-room" height={stacked ? actionsH : look === 'done' && !narrow ? 1 : 2} />
            {/* The choices and buttons: an absolute layer, drawn after the art, so they take clicks. A wide row of
                choices (the lean's track) gets a row of its own, the buttons a row under it: side by side they ran out
                of the band. */}
            {stacked ? (
              <Box key="setup-actions" position="absolute" bottom={0} left={1} right={1} height={actionsH} flexDirection="column" justifyContent="flex-end">
                {choicesH ? <Box key="setup-choices" flexDirection="row" alignItems="flex-end" gap={2} height={choicesH}>{choices}</Box> : null}
                <Box key="setup-nav" flexDirection="row" gap={2} alignItems="center" height={2}>
                  {notice ? [
                    ...(noticeUp ? [] : [<Box key="setup-notice-words" flexShrink={1} minWidth={0}><Text color={ACCENT} wrap="wrap">{notice.text}</Text></Box>]),
                    <Box key="setup-notice-actions" flexShrink={0} flexDirection="row" alignItems="center" gap={2}>
                      <Text color={ACCENT} bold>→</Text>
                      {notice.buttons}
                    </Box>,
                  ] : null}
                  <Box flexGrow={1} />
                  {notice ? <Box key="setup-notice-sep" flexShrink={0} width={1} /> : null}
                  {controls}
                </Box>
              </Box>
            ) : (
              <Box key="setup-actions" position="absolute" bottom={0} left={1} right={1} height={2} flexDirection="row" gap={2} alignItems={look === 'done' ? 'flex-start' : 'center'}>
                {choices}
                <Box flexGrow={1} />
                {controls}
              </Box>
            )}
            {/* The guide, top right: a layer of its own over the art too (in the title's row it took no clicks). */}
            <Box key="setup-guide-layer" position="absolute" top={0} right={1} height={2} flexDirection="row" alignItems="center" gap={2}>
              {guideButton('setup-guide', step === 'lean' ? `${GUIDE_URL}#auto` : step === 'window' ? `${GUIDE_URL}#window` : GUIDE_URL)}
              {/* The ✕ closes the guide; what was picked so far is kept. The done step closes with its own button. */}
              {look === 'done' ? null : <Button key="setup-close" plain role="dismiss" label="✕" onPress={() => closeSetup($)} />}
            </Box>
          </Box>
        )
      }
      if (step === 'intro') {
        // What the setup is for, before any choice: Next only.
        const asks = setupSteps(withWindow, withOther).filter(s => s !== 'intro' && s !== 'done')
        const what: Partial<Record<SetupStep, string>> = {
          other: 'another copy of the plugin',
          lean: 'how Smart picks the effort',
          window: 'when a chat is compacted',
          look: 'light or dark panels',
        }
        const words = asks.map(a => what[a]).filter(Boolean) as string[]
        const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]
        return band(`Welcome to ${PRODUCT_NAME}`, [
          'Smart picks how long Claude thinks per prompt, and long chats are compacted before they get expensive.',
          `${asks.length} short questions: ${list}. Saved at Finish; ⚙ in the bar changes it later.`,
        ], [], nav(nextButton))
      }
      if (step === 'other') {
        // Another effortless or Smart Token Saver install is there too: both would judge every prompt. Nothing happens without a click.
        const found = otherFound
        const after = async () => goSetup($, 'lean')
        return band('Another copy of the plugin', found ? otherBuildText(found) : 'No other copy of effortless or Smart Token Saver is installed. Nothing to remove.', [], [
          ...(found
            ? [
                // A failed removal stays on this step: the toast says what to run, and Remove it can be pressed again.
                <Button key="setup-other-remove" variant="primary" label="Remove it" onPress={async () => { if (await removeOtherBuild($, found)) await after() }} />,
                <Button key="setup-other-keep" plain label="Keep both" onPress={async () => { await keepOtherBuild($, found); await after() }} />,
              ]
            : [<Button key="setup-next" variant="primary" label="Next" onPress={after} />]),
        ])
      }
      if (step === 'lean') {
        // Five stops, the marker on the one picked. The track is lit from the middle out to the marker, so it shows which
        // way it leans; the line above says what the stop does.
        const lean = shown.bias
        const track: unknown[] = []
        // On the desktop each stop is a column, its name under it in small italics, as on Settings → Effort.
        const termTrack = e.surface === 'terminal'
        for (const n of [-2, -1, 0, 1, 2]) {
          if (n > -2) {
            const lit = lean > 0 ? n > 0 && n <= lean : lean < 0 ? n <= 0 && n > lean : false
            const dash = lit ? <Text color={ACCENT}>──</Text> : <Text dimColor>──</Text>
            track.push(termTrack ? <Box key={`t${n}`}>{dash}</Box> : (
              <Box key={`t${n}`} flexDirection="column" alignItems="center">{dash}<Text size="caption"> </Text></Box>
            ))
          }
          const stop = <Button key={`setup-bias${n + 2}`} plain label={n === lean ? '◉' : '○'} onPress={() => pick('bias', String(n))} />
          track.push(termTrack ? stop : (
            <Box key={`setup-stop${n + 2}`} flexDirection="column" alignItems="center" width={10}>
              {stop}
              <Text size="caption" italic dimColor={n !== lean} color={n === lean ? ACCENT : undefined}>{LEAN_STOPS[n + 2]?.[0]}</Text>
            </Box>
          ))
        }
        const side = (label: string, lit: boolean) =>
          lit ? <Text key={label} color={ACCENT}>{label}</Text> : <Text key={label} dimColor>{label}</Text>
        return band('How should Smart pick the effort?', [LEAN_HELP[lean + 2], EFFORT_LINE], termTrack ? [
          side('Cheaper', lean < 0),
          <Box key="track" flexDirection="row" alignItems="center">
            {track}
          </Box>,
          side('Smarter', lean > 0),
        ] : [
          // Each circle with its name under it, Cheapest to Smartest, Balanced in the middle.
          <Box key="track" flexDirection="row" alignItems="flex-start">{track}</Box>,
        ], nav(nextButton), 'brand', true)
      }
      if (step === 'window') {
        // Only shown where the model holds more than the recommended window. Saved at the end, like every step. Own…
        // takes any size from 100k to the model's window, typed.
        const modelWindow = windowState?.modelWindow ?? lastContext?.window ?? 0
        const full = modelWindow > 0 ? windowLabel(modelWindow) : "the model's full window"
        // The sizes, plus the one this chat runs on, in its place by size (300k, 400k, then Claude Code's default).
        const chatSize = chatWindowChoice()
        const base: (number | null)[] = [DEFAULT_WINDOW, 400_000, null]
        const choices: (number | null)[] = chatSize === undefined || base.includes(chatSize) ? base
          : [...[...base.filter((w): w is number => w !== null), chatSize as number].sort((x, y) => x - y), null]
        const picked = shown.compactWindow
        const own = picked !== null && !choices.includes(picked)
        // Where the hook is known not to take, new chats get a size only through the settings file, whatever this chat's
        // read says (a chat pinned by /autocompact may run on the size picked without the hook).
        const viaCommand = windowViaCommand() || settingsHookBlocked
        const explain = own || setupOwnOpen
          ? `Individual: type a size (100k to ${modelWindow > 0 ? windowLabel(Math.min(modelWindow, WINDOW_MAX)) : '1M'}, e.g. 250k) and press Enter.${own ? ` Picked: ${windowLabel(picked)}.` : ''}`
          : picked === DEFAULT_WINDOW && narrow ? '300k (recommended): compacts at about 267k tokens. Long sessions use about half the tokens of 1M.'
          : picked === DEFAULT_WINDOW ? `300k (recommended): the chat compacts at about 267k tokens. Every message rereads the whole chat, so this saves the most: long sessions use about half the tokens of Claude Code's default (1M), about 30 % less across all chats.`
          : picked === 400_000 ? '400k: compacts later. Fewer compactions, but each message rereads more and costs a bit more.'
          : picked === null ? `Claude Code default: no size set, compacts near the full window (${full}). Fewest compactions, priciest messages.`
          : `${windowLabel(picked)}: the size this chat runs on now.`
        // Where the plugin cannot set it, a size new chats do not get yet is applied here (Apply) before Next: the
        // settings file for new chats, or, where Claude Code keeps that file from plugins, the step that is the person's.
        // A size new chats get already needs no Apply; where this chat runs on another, Next goes to step 2b.
        const applied = setupApplied !== undefined && setupApplied === picked
        const needApply = viaCommand && !applied && !newChatsGet(picked)
        // Applied, but Claude Code keeps its settings file from plugins (or the write failed): the size reaches new chats
        // only through a chat the person sends the request in. Next waits until it went there (or was copied).
        const askNewChat = applied && (settingsFileRefused || defaultFileFailed) && !newChatsGet(picked)
        const sent = setupNewChatSent !== undefined && setupNewChatSent === picked
        const chatDiffers = !!windowState && commandPending(picked, windowState)
        const chatWord = windowState ? windowLabel(windowState.raw) : ''
        const how = !viaCommand ? ''
          : needApply ? (chatDiffers
            ? settingsFileRefused
              ? 'Claude Code keeps plugins from setting it here. Apply shows the step that is yours.'
              : `Claude Code blocks plugins from setting it directly. Apply saves it in ${USER_SETTINGS_SHOWN} for new chats.`
            : settingsFileRefused
              ? `This chat runs on ${windowLabel(picked)} already; new chats do not. Apply shows the step that is yours.`
              : `This chat runs on ${windowLabel(picked)} already; Apply saves it in ${USER_SETTINGS_SHOWN} for new chats too.`)
          : askNewChat ? ''
          : chatDiffers ? `New chats run on ${windowLabel(picked)} already (${USER_SETTINGS_SHOWN}). This chat runs on ${chatWord}: Next asks whether to switch it.`
          : 'In use already, here and in new chats.'
        const notice = askNewChat ? {
          text: sent
            ? `In the new chat: send the request and allow the edit. New chats then compact at ${windowLabel(picked)}.`
            : `A security rule keeps plugins out of Claude Code's settings: send the request in a new chat and allow the edit there.`,
          buttons: [
            <Button key="setup-window-newchat" variant={sent ? 'secondary' : 'primary'} label="Paste into new chat" onPress={async () => {
              $.ui.toast(await openSettingsChat($, picked, e.surface))
              setupNewChatSent = picked
              $.ui.invalidate('ui.render')
            }} />,
            <Button key="setup-window-copyrequest" plain label="Copy" onPress={async () => {
              $.ui.toast(await copySettingsPrompt($, picked))
              setupNewChatSent = picked
              $.ui.invalidate('ui.render')
            }} />,
          ],
        } : undefined
        // Apply: after the sizes in the terminal, beside Next on the desktop (see rows). Saved, it goes on at
        // once (to step 2b where this chat runs on another size); refused, it stays and shows the person's step.
        const apply = <Button key="setup-window-apply" variant="primary" label="Apply" onPress={async () => {
          setupApplied = picked
          if (!settingsFileRefused) {
            const saved = await saveDefaultToFile($, picked)
            defaultFileFailed = !saved.ok
            if (saved.ok || !settingsFileRefused) $.ui.toast(saved.text)
          }
          if ((settingsFileRefused || defaultFileFailed) && !newChatsGet(picked)) { $.ui.invalidate('ui.render'); return }
          await goSetup($, chatStep(picked) ? 'windowchat' : setupNext('window', withWindow, withOther))
        }} />
        // Next stays grey until the size is applied and, where the file is closed, its request went to a new chat.
        const waitFor = needApply ? 'Apply the size first, or pick the one in use.'
          : askNewChat && !sent ? 'Paste the request into a new chat or copy it first, or pick the size in use.' : ''
        const forward = waitFor
          ? <Button key="setup-next" plain dimColor label="Next" onPress={() => $.ui.toast(waitFor)} />
          : nextButton
        const sizeLabel = (w: number | null) => {
          // Narrow: the short names, but the size this chat runs on keeps its mark: "pick the one in use" needs it.
          const tags = narrow ? [...(w === null && modelWindow > 0 ? [windowLabel(modelWindow)] : []), ...(chatSize !== undefined && w === chatSize ? ['this chat'] : [])]
            : [...(w === null && modelWindow > 0 ? [windowLabel(modelWindow)] : []), ...(w === DEFAULT_WINDOW ? ['recommended'] : []), ...(chatSize !== undefined && w === chatSize ? ['this chat'] : [])]
          const name = w === null ? (narrow ? 'Default' : 'Claude Code default') : windowLabel(w)
          return tags.length ? `${name} (${tags.join(', ')})` : name
        }
        const sizes = choices.map(w => (
          <Button key={`setup-window-${w ?? 'default'}`} plain label={`${!own && !setupOwnOpen && picked === w ? '◉' : '○'} ${sizeLabel(w)}`}
            onPress={() => { setupOwnOpen = false; return pick('compactWindow', w === null ? 'default' : String(w)) }} />
        ))
        // Individual: one slot as wide closed as open, so Back and Next never move. Open, a mark, the field and its
        // Enter in the slot; closed, the choice.
        const ownSlot = (
          <Box key="setup-window-own" width={28} height={1} flexShrink={0} flexDirection="row" alignItems="center" gap={1}>
            {own || setupOwnOpen ? [
              <Text key="setup-window-own-mark">◉</Text>,
              <Box key="setup-window-own-field" width={22} height={1} flexShrink={0}>
                {backed('setup-window-input', <Input key="setup-window-input" placeholder={own ? windowLabel(picked) : 'e.g. 250k'} submitLabel="Enter"
                  onSubmit={(v: string) => {
                    const n = parseWindow(v)
                    if (typeof n !== 'number' || (modelWindow > 0 && n > modelWindow)) { $.ui.toast(`Type a size from 100k to ${modelWindow > 0 ? windowLabel(modelWindow) : '1M'}, e.g. 250k.`); return }
                    // A size that is one of the choices (300k, 400k, this chat's) shows as that choice; any other stays Individual.
                    if (choices.includes(n)) setupOwnOpen = false
                    void pick('compactWindow', String(n))
                  }} />)}
              </Box>,
            ] : (
              <Button key="setup-window-own-open" plain label="○ Individual" onPress={() => { setupOwnOpen = true; $.ui.invalidate('ui.render') }} />
            )}
          </Box>
        )
        // Desktop: the three sizes and Individual in one row, Apply at its end; with this chat's own size as a fourth they
        // no longer fit side by side, and Individual gets a row under them. The terminal lists them all as buttons.
        const oneRow = choices.length <= 3 && !narrow
        // Desktop: Apply sits in the row of Back and Next, before Next. At the end of the sizes' row the band cut it off
        // where the window was narrow (the sizes and Individual keep their width), and Next only said to Apply.
        const rows = e.surface === 'terminal'
          ? [...sizes, ownSlot, ...(needApply ? [apply] : [])]
          : [
            oneRow ? (
              <Box key="setup-window-rows" flexDirection="row" alignItems="center" gap={2} flexGrow={1}>
                {sizes}
                {ownSlot}
              </Box>
            ) : (
              <Box key="setup-window-rows" flexDirection="column" flexGrow={1} gap={1}>
                <Box key="setup-window-sizes" flexDirection="row" alignItems="center" gap={2}>{sizes}</Box>
                <Box key="setup-window-own-row" flexDirection="row" alignItems="center">{ownSlot}</Box>
              </Box>
            ),
          ]
        const controls = e.surface !== 'terminal' && needApply ? [...nav(apply), forward] : nav(forward)
        return band('When should a chat be compacted?', askNewChat ? [explain] : [explain, how], rows, controls, 'brand', true, notice, oneRow ? 1 : 2)
      }
      if (step === 'windowchat') {
        // Step 2b: the default changed in step 2, but this chat keeps its own size until it ends. Optional: the
        // /autocompact for it, Paste into chat or Copy; Next goes on either way.
        const w = shown.compactWindow
        const pending = !!windowState && commandPending(w, windowState)
        const line = autocompactLine(w)
        const sentHere = setupChatSent !== undefined && setupChatSent === w
        const nowWord = windowState ? windowLabel(windowState.raw) : 'its size'
        return band(`Use ${windowLabel(w)} in this chat too?`, [
          pending
            ? `You just set ${windowLabel(w)} for new chats. This chat still runs on ${nowWord}: Claude Code keeps a running chat's size.`
            : `This chat already runs on ${windowLabel(w)}.`,
          pending ? `Optional. Next skips it, and this chat stays at ${nowWord}.` : '',
        ], [], nav(nextButton), 'brand', true, pending ? {
          text: sentHere
            ? `${line} is in the prompt box (or copied): press Enter to send it.`
            : `Send ${line} to switch this chat.`,
          buttons: [
            <Button key="setup-chat-paste" variant={sentHere ? 'secondary' : 'primary'} label="Paste into chat" onPress={async () => {
              $.ui.toast(await offerAutocompact($, w, e.surface))
              setupChatSent = w
              $.ui.invalidate('ui.render')
            }} />,
            <Button key="setup-chat-copy" plain label="Copy" onPress={async () => {
              $.ui.toast(await copyAutocompact($, w, e.surface))
              setupChatSent = w
              $.ui.invalidate('ui.render')
            }} />,
          ],
        } : undefined)
      }
      if (step === 'look') {
        // Automatic (the app's own colours) is the default; the other two fix it. The choice shows at once.
        const mode = shown.appearance
        const words = { auto: 'Automatic', dark: 'Always dark', light: 'Always light' } as const
        const explain = mode === 'auto'
          ? "Automatic: the panels take the app's own colours, light or dark, with orange accents."
          : mode === 'dark' ? 'Always dark: these panels stay dark. The app keeps its own mode.' : 'Always light: these panels stay light. The app keeps its own mode.'
        return band('Light or dark panels?', [explain, 'You can change it later in Settings → Customize.'], [
          ...(['auto', 'dark', 'light'] as const).map(value => (
            <Button key={`setup-look-${value}`} plain label={`${mode === value ? '◉' : '○'} ${words[value]}`} onPress={() => pick('appearance', value)} />
          )),
        ], nav(<Button key="setup-next" variant="primary" label="Finish" onPress={() => completeSetup($)} />), 'brand', true, undefined, 1)
      }
      // Done: everything is saved already (see completeSetup). The band sums up what was set, in green, with a check;
      // the steps that were the person's (a new chat, /autocompact) were offered on their own pages before.
      const effortWord = BIAS_WORDS[config.bias + 2]
      const lookWord = { auto: "follow the app's colours", dark: 'always dark', light: 'always light' }[config.appearance]
      const w = config.compactWindow
      const items: string[] = [
        (await read($, isAuto)) ? `Effort: Smart picks it per prompt, leaning ${effortWord}.` : 'Effort: Default, Smart is off.',
      ]
      if (withWindow) {
        const viaCmd = windowViaCommand() || settingsHookBlocked || settingsFileRefused
        const fileHas = (userFileWindow ?? null) === w
        items.push(!viaCmd || (windowState && !commandPending(w, windowState) && !settingsFileRefused)
          ? `New chats run on ${windowLabel(w)}.`
          : fileHas ? `New chats run on ${windowLabel(w)} (saved in ${USER_SETTINGS_SHOWN}).`
          : setupNewChatSent === w ? `New chats run on ${windowLabel(w)} once you send the request in the new chat and allow the edit.`
          : `New chats keep their size: Settings → Context size → Paste into new chat sets ${windowLabel(w)}.`)
        if (windowState && viaCmd) items.push(!commandPending(w, windowState)
          ? `This chat runs on ${windowLabel(w)} too.`
          : setupChatSent === w ? `This chat runs on ${windowLabel(w)} once ${autocompactLine(w)} is sent.`
          : `This chat stays at ${windowLabel(windowState.raw)} until it ends.`)
      }
      items.push(`Panels: ${lookWord}.`)
      return band('All set. Your setup:', [
        <Box key="setup-summary" flexDirection="column">
          {items.map((t, i) => <Text key={`setup-summary-${i}`} wrap="wrap">{`· ${t}`}</Text>)}
        </Box>,
        `${narrow ? '⚙ under the prompt changes any of it.' : 'Changed your mind? Click ⚙ under the prompt to change any of it.'}${(await read($, paused)) ? ' On this model Smart pauses: an effort change would rewrite the prompt cache.' : ''}`,
      ], [], [
        <Button key="setup-done" variant="primary" autoFocus label="Close" onPress={() => goSetup($, null)} />,
      ], 'done')
    }
    // Another install, found after the setup was done: asked once, on a card of its own.
    if (otherFound) {
      const found = otherFound
      const buttons = [
        <Button key="other-remove" variant="primary" label="Remove it" onPress={() => removeOtherBuild($, found)} />,
        <Button key="other-keep" plain label="Keep both" onPress={() => keepOtherBuild($, found)} />,
      ]
      if (e.surface === 'terminal')
        return terminalBand($, e, { key: 'other', kind: 'brand', color: ACCENT, bg: BRAND_BG, edge: BRAND_EDGE, title: PRODUCT_NAME, detail: otherBuildText(found), buttons })
      return (
        <Box key="other" position="relative" flexDirection="row" alignItems="center" gap={1} paddingX={1} overflow="hidden"
          {...panelFrame(BRAND_BG)}>
          <Text color={ACCENT} bold wrap="truncate">{`✦ ${PRODUCT_NAME}`}</Text>
          <Text key="other-what" wrap="truncate">{otherBuildText(found)}</Text>
          <Box flexGrow={1} />
          {buttons}
        </Box>
      )
    }
    // A bigger window another chat set through /autocompact (it holds for the whole model) is still in force here:
    // asked once in this chat; Back to puts the /autocompact line for the default into the prompt box.
    const raised = raisedHandled ? null : raisedToOffer(raisedKept, loadedSid, windowState)
    if (raised) {
      const back = raised.standard
      // Keep it: the person wants the raised value, so no chat asks again. Back: the record stays until a read shows
      // the default in force (a draft never sent leaves the next chat asking again). ✕: only this chat.
      const done = async (forget: boolean) => {
        raisedHandled = true
        if (forget) await rememberRaised($, raised.model, null)
        $.ui.invalidate('ui.render')
      }
      const buttons = [
        <Button key="raised-back" variant="primary" label={`Back to ${windowLabel(back)}`} onPress={async () => { await done(false); $.ui.toast(await offerAutocompact($, back, e.surface)) }} />,
        <Button key="raised-keep" plain label="Keep it" onPress={() => done(true)} />,
        <Button key="raised-close" plain role="dismiss" label="✕" onPress={() => done(false)} />,
      ]
      const words = `Another window from another chat is still set (${windowLabel(raised.window)}). Back to ${windowLabel(back)}?`
      if (e.surface === 'terminal')
        return terminalBand($, e, { key: 'raised', kind: 'brand', color: ACCENT, bg: BRAND_BG, edge: BRAND_EDGE, title: PRODUCT_NAME, detail: words, buttons })
      return (
        <Box key="raised" position="relative" flexDirection="row" alignItems="center" gap={1} paddingX={1} overflow="hidden"
          {...panelFrame(BRAND_BG)}>
          <Text color={ACCENT} bold wrap="truncate">{`✦ ${PRODUCT_NAME}`}</Text>
          <Text key="raised-what" wrap="truncate">{words}</Text>
          <Box flexGrow={1} />
          {buttons}
        </Box>
      )
    }
    // A usage limit is close: Save mode keeps Auto at medium or below until it resets.
    const heat = await read($, hot)
    if (heat && !config.hide.includes('hot') && hotVisible(heat, await hotClosedNow($))) {
      const saving = (await read($, saveUntil)) !== null
      const window = heat.kind === 'five_hour' ? '5h' : 'weekly'
      const resets = resetLabel(heat.resetsAt, await $.clock.now())
      // Skip for now comes back 5 points later; the other skip waits for the reset of the limit shown.
      const skipLabel = heat.kind === 'five_hour' ? 'Skip until reset' : 'Skip this week'
      // The second line names Settings → Effort only where it fits beside the guide link and the buttons.
      const hotRoomy = typeof e.props.bodyColumns !== 'number' || e.props.bodyColumns >= 130
      const openEffortSettings = async () => {
        await update($, settingsCard, () => 'effort')
        await openPluginSettings($)
      }
      if (e.surface === 'terminal')
        return terminalBand($, e, {
          key: 'hot', kind: 'hot', color: EMBER, bg: EMBER_BG, edge: EMBER_EDGE, title: 'Running low',
          detail: `${Math.round(heat.percent)}% of your ${window} limit used${resets ? ` · resets ${resets}` : ''}`,
          buttons: [
            <Button key="hot-save" variant="primary" hotkey="s" label={saving ? 'Save mode on' : 'Save mode'}
              onPress={async () => { $.ui.toast(`${PRODUCT_NAME}: ${await toggleSave($)}`) }} />,
            <Button key="hot-later" plain label="Skip for now" onPress={() => closeHot($, heat)} />,
            <Button key="hot-skip" plain dimColor label={skipLabel} onPress={() => closeHot($, heat, true)} />,
            guideLink('hot-guide', 'What is it?', `${GUIDE_URL}#save-mode`),
          ],
        })
      return (
        <Box key="hot" position="relative" flexDirection="row" gap={1} alignItems="center" paddingX={1} overflow="hidden"
          {...panelFrame(EMBER_BG, true, { Box })}>
          {/* Two rows high in a slot of 72 px: the art is drawn half as large again (both ways, so its fade on the left stays), to reach the slot's lower edge. */}
          {underSlot(slotArt({ Box, Text, Button } as unknown as Parts, 'ember',
            <Svg source={quietArt(EMBER_SVG)} alt="embers" width={FROST_WIDTH * 1.5} height={FROST_HEIGHT * 1.5} />))}
          {introLayer({ Box, Svg }, 'hot', await introShows($, 'hot'), EMBER, '#ffd2a8')}
          {/* Two lines, each on one line and cut at the end rather than wrapped: the name and how much is used, then dim
              when it resets, what Save mode is, and where its switch is in the settings. */}
          <Box flexDirection="column" flexShrink={1} minWidth={0} overflow="hidden">
            <Box flexDirection="row" gap={1} alignItems="center">
              <Box flexShrink={0}>
                <Text color={EMBER} bold wrap="truncate">✦ Running low</Text>
              </Box>
              <Text wrap="truncate">{`${Math.round(heat.percent)}% of your ${window} limit used`}</Text>
            </Box>
            <Box flexDirection="row" gap={1} alignItems="center">
              {resets ? <Box key="hot-resets" flexShrink={0}><Text dimColor wrap="truncate">{`Resets ${resets}`}</Text></Box> : null}
              {resets ? <Box key="hot-dot1" flexShrink={0}><Text dimColor>·</Text></Box> : null}
              <Box key="hot-guide-box" flexShrink={0}>{guideLink('hot-guide', 'What is Save mode?', `${GUIDE_URL}#save-mode`)}</Box>
              {/* Where the switch also is, only where the band has room for it: it cut the guide link short. */}
              {hotRoomy ? <Box key="hot-dot2" flexShrink={0}><Text dimColor>·</Text></Box> : null}
              {hotRoomy ? <Box key="hot-settings-box" flexShrink={0}><Button key="hot-settings" plain dimColor label="Settings → Effort" onPress={openEffortSettings} /></Box> : null}
            </Box>
          </Box>
          {/* The room the buttons on the right take (Save mode, Skip for now, Skip this week), so the words stop short of them:
              measured at about 39 cells, so 42 (54 cut the words in half on a normal window). */}
          <Box flexGrow={1} minWidth={42} />
          <Box key="hot-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            <Button
              key="hot-save"
              variant="primary"
              label={saving ? 'Save mode on' : 'Save mode'}
              onPress={async () => {
                $.ui.toast(`${PRODUCT_NAME}: ${await toggleSave($)}`)
              }}
            />
            <Button key="hot-later" plain label="Skip for now" onPress={() => closeHot($, heat)} />
            <Button key="hot-skip" plain dimColor label={skipLabel} onPress={() => closeHot($, heat, true)} />
          </Box>
        </Box>
      )
    }
    // A handoff or compact running or just done: said above the prompt, where it is seen at once.
    // Maintainer, Upstream updates: a newer upstream release, offered for review. Desktop only; the terminal has /smarttokensaver maintainer.
    const upd = e.surface === 'terminal' ? null : await read($, updateCard)
    if (upd && (await updatesOn($))) return updateCardTree($, e, upd)
    // Support, Updates: a newer version of this plugin. Desktop only; the terminal has /smarttokensaver support.
    const ownUpd = e.surface === 'terminal' ? null : ((await read($, ownCard)) as OwnCard | null)
    if (ownUpd && (await ownUpdatesOn($))) return updateCardTree($, e, ownUpd)
    const compactNow = e.surface === 'terminal' ? null : await compactCard($, !!e.props.isWorking)
    if (compactNow)
      return handoffCardTree($, e, compactNow,
        !cardRunning(compactNow.kind) ? () => update($, handoffCard, card => (card && !cardRunning(card.kind) ? null : card)) : undefined)
    // The cache went cold: the next message rereads the whole chat at full price. Only worth a band on a big chat.
    const compacting = await read($, isCompacting)
    const coldTokens = compacting ? null : await coldWorth($)
    if (coldTokens !== null) {
      // The slot the app gives the band is narrower than it was (it has a frame of its own now): the long line ended in
      // an ellipsis in front of the buttons, so a narrow band says the same in fewer words.
      const narrow = typeof e.props.bodyColumns === 'number' && e.props.bodyColumns < 115
      const line = narrow ? `Rereads ${kTokens(coldTokens)} tokens at full price.` : `Next message rereads ${kTokens(coldTokens)} tokens at full price.`
      if (e.surface === 'terminal')
        return terminalBand($, e, {
          key: 'cold', kind: 'cold', color: ICE, bg: ICE_BG, edge: ICE_EDGE, title: 'Chat went cold',
          detail: `${line} Hand off or compact first. Why: ${GUIDE_URL}`,
          buttons: [
            <Button key="cold-hide" plain hotkey="n" label="Not now" onPress={() => update($, isColdHidden, () => true)} />,
            <Button key="cold-handoff" hotkey="h" label="Handoff" onPress={() => openHandoffBar($)} />,
            <Button key="cold-compact" variant="primary" hotkey="c" label="Compact" onPress={() => openCompact($, e)} />,
          ],
        })
      // The art is a backdrop: an absolutely placed layer behind the right side, so the words and buttons sit on it.
      return (
        <Box
          key="cold"
          position="relative"
          flexDirection="row"
          gap={1}
          alignItems="center"
          paddingX={1}
          overflow="hidden"
          {...panelFrame(ICE_BG, true, { Box })}
        >
          {/* Taller than the band and clipped by it, so the frost reaches every edge on the right. */}
          {underSlot(slotArt({ Box, Text, Button } as unknown as Parts, 'frost',
            <Svg source={quietArt(FROST_SVG)} alt="frost" width={FROST_WIDTH} height={FROST_HEIGHT} />))}
          {introLayer({ Box, Svg }, 'cold', await introShows($, 'cold'), ICE, '#cfeeff')}
          <Box flexShrink={0}>
            <Text color={ICE} bold wrap="truncate">
              ✦ Chat went cold
            </Text>
          </Box>
          <Text wrap="truncate">{line}</Text>
          {/* Room for the buttons, which sit in their own layer after the frost so they are drawn on top of it. */}
          <Box flexGrow={1} minWidth={40} />
          <Box key="cold-actions" position="absolute" top={0} right={1} bottom={0} flexDirection="row" gap={1} alignItems="center">
            {guideLink('cold-guide', 'Why?')}
            <Button key="cold-hide" plain label="Not now" onPress={() => update($, isColdHidden, () => true)} />
            {/* Compact is the cheap way back and the main one; Handoff the grey one before it. */}
            <Button key="cold-handoff" variant="secondary" label="Handoff" onPress={() => openHandoffBar($)} />
            <Button key="cold-compact" variant="primary" label="Compact" onPress={() => openCompact($, e)} />
          </Box>
        </Box>
      )
    }
    // The context is swamped: every message re-reads all of it. Compact or hand off, right here.
    const swampTokens = await read($, swamped)
    const hiddenAt = await read($, swampHiddenAt)
    if (swampTokens !== null && !config.hide.includes('swamp') && !turnBusy() && !compacting && (hiddenAt === null || swampTokens >= hiddenAt + SWAMP_REGROW)) {
      const handing = (await read($, handoffStage)) !== null
      // What fits is shown whole, what does not is left out: nothing is cut to "…" and nothing runs under the buttons.
      // Measured in the app's font (a cell is 8.39 px); the Context size button takes its label and a gap more,
      // "Handing off…" five more.
      const cols = typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : Infinity
      // In a very narrow pane the Context size button goes first: the figure and the two ways out matter more.
      const swampRoom = moreRoomShown() && cols >= 60
      const swampCells = (swampRoom ? moreRoomLabel().length + 1 : 0) + (handing ? 5 : 0)
      // The reason beside the title: the whole sentence where it fits, its short form in less room, else none (59
      // cells go to the title, the three buttons and the gaps).
      const swampWhy = [SWAMP_WHY, SWAMP_WHY_SHORT].find(w => cols >= 59 + w.length + 2 + swampCells)
      // The point it compacts at, beside the figure, and with room what is left until then (the figure, the buttons
      // and the gaps take 47 cells).
      const swampLeftFull = untilCompaction(swampTokens, true)
      const swampLeft = cols >= 47 + swampLeftFull.length + 2 + swampCells ? swampLeftFull : cols >= 47 + untilCompaction(swampTokens).length + 2 + swampCells ? untilCompaction(swampTokens) : null
      // The title in full (62 cells), else its short form.
      const swampTitle = cols >= 62 + swampCells ? 'Chat window is getting swamped' : 'Getting swamped'
      if (e.surface === 'terminal')
        return terminalBand($, e, {
          key: 'swamp', kind: 'swamp', color: BOG, bg: BOG_BG, edge: BOG_EDGE, title: 'Chat window is getting swamped',
          detail: `${lastContext && limits().trigger !== null ? `${windowFill(swampTokens)}, ${untilCompaction(swampTokens)}` : `${Math.round(swampTokens / 1000)}k tokens`}; ${SWAMP_WHY}.`,
          buttons: [
            <Button key="swamp-compact" variant="primary" label="Compact" onPress={() => openCompact($, e)} />,
            <Button key="swamp-handoff" label={handing ? 'Handing off…' : 'Handoff'} onPress={() => openHandoffBar($)} />,
            ...(moreRoomShown() ? [<Button key="swamp-room" plain label={moreRoomLabel()} onPress={() => openContextCard($)} />] : []),
            <Button key="swamp-close" plain role="dismiss" label="✕" onPress={() => update($, swampHiddenAt, () => swampTokens)} />,
          ],
        })
      return (
        <Box
          key="swamp"
          position="relative"
          flexDirection="row"
          alignItems="center"
          paddingX={1}
          overflow="hidden"
          {...panelFrame(BOG_BG, true, { Box })}
        >
          {underSlot(slotArt({ Box, Text, Button } as unknown as Parts, 'bog',
            <Svg source={quietArt(swampArt())} alt="swamp" width={FROST_WIDTH * 2} height={FROST_HEIGHT * 2} />))}
          {introLayer({ Box, Svg }, 'swamp', await introShows($, 'swamp'), BOG_WASH, BOG_SHINE)}
          {/* Two rows on the left: the title, then the figures. The buttons sit on the right, centred over both rows, and
              take the room they need; the words get all that is left (a fixed share kept for the buttons cut the
              words short with room to spare). */}
          <Box key="swamp-words" position="relative" flexDirection="column" flexShrink={1} minWidth={0}>
          {/* Why it matters is said only where the whole of it fits: cut short ("every message …") it said nothing. */}
          <Box key="swamp-title" flexDirection="row" gap={1} minWidth={0}>
            <Box flexShrink={0}><Text color={BOG} bold>{`✦ ${swampTitle}`}</Text></Box>
            {swampWhy ? <Text key="swamp-why" dimColor wrap="truncate">{`· ${swampWhy}`}</Text> : null}
          </Box>
          {/* How full the chat is against the window Claude Code really uses for it ("90% · 360k / 400k", as /context
              shows it; each chat can have its own) and what is left before it compacts. */}
          <Box key="swamp-figures" position="relative" flexDirection="row" gap={1} alignItems="center">
            {lastContext && lastContext.window && limits().trigger !== null ? [
              <Svg key="swamp-ring" source={ringSvg(windowShare().percent, BOG).replace('<svg ', '<svg data-raw="1" ')} alt={`${windowShare().text} used`} width={16} height={16} />,
              // The figure never wraps: it is what the band is for. The rest after it is cut to the room left.
              <Box key="swamp-fill-box" flexShrink={0}><Text key="swamp-fill" color={BOG} bold wrap="truncate">{`${windowFill(swampTokens)} (${Math.round(windowShare().percent)}%)`}</Text></Box>,
              swampLeft ? <Text key="swamp-left" dimColor wrap="truncate">{`· ${swampLeft}`}</Text> : null,
            ] : <Text key="swamp-left" dimColor wrap="truncate">{`${Math.round(swampTokens / 1000)}k tokens reread with every message.`}</Text>}
          </Box>
          </Box>
          <Box flexGrow={1} minWidth={2} />
          {/* Relative with an empty absolute child, so the buttons lie over the art and take the clicks. Handoff in the
              middle, Compact (the lit one) on the right, as on the cold band. */}
          <Box key="swamp-actions" position="relative" flexShrink={0} flexDirection="row" gap={1} alignItems="center">
            <Box position="absolute" top={0} left={0} />
            {/* The swamp band takes the bar's place near compaction: More room comes along, or it would vanish then. */}
            {swampRoom ? <Button key="swamp-room" plain dimColor label={moreRoomLabel()} onPress={() => openContextCard($)} /> : null}
            <Button key="swamp-handoff" label={handing ? 'Handing off…' : 'Handoff'} onPress={() => openHandoffBar($)} />
            <Button key="swamp-compact" variant="primary" label="Compact" onPress={() => openCompact($, e)} />
            <Button key="swamp-close" plain role="dismiss" label="✕" onPress={() => update($, swampHiddenAt, () => swampTokens)} />
          </Box>
        </Box>
      )
    }
    // Terminal, Below prompt (Settings → Customize → Terminal): no bar at rest; the status line under the prompt says
    // what it would (the PromptHint hook). A model question still asks here, and Handoff advice keeps the bar, with its
    // Handoff button, until it is taken or passes.
    if (e.surface === 'terminal' && config.terminalPlace === 'bottom') {
      adviceNow = (await read($, handoffAdvice)) ?? null
      if (adviceNow === null) {
        introKind = 'rest'
        const { question } = await effortRows($, e)
        return question ?? next(e)
      }
      // The advice needs its Handoff button: the bar, also where Show is Buttons only.
      return dashboardBand($, e)
    }
    // At rest: the dashboard, unless the person picked the minimal look (the footer's buttons, no band).
    if (config.layout === 'default') {
      if (e.surface === 'terminal') return dashboardBand($, e)
      const { question } = await effortRows($, e)
      const dash = await dashboardBand($, e)
      return question ? (
        <Box key="dash-col" flexDirection="column">
          {question}
          {dash}
        </Box>
      ) : dash
    }
    // The minimal look draws no dashboard: mark the rest here, so the next band plays its entrance.
    introKind = 'rest'
    const { question, rows } = await effortRows($, e)
    if (e.surface !== 'terminal') return question ?? next(e)
    return rows
    })()
    // A dropdown whose panel is gone is closed: it would open by itself the next time the panel shows.
    if (openChoice && !openChoiceDrawn) openChoice = null
    // Off the terminal every panel sits in one shell: the pinned mode's ground (Always dark, Always light) and the lift.
    const under = layers ?? []
    if (slotLayers === layers) slotLayers = null
    const look = shellLook as { adaptive: boolean; pin: ReturnType<typeof pinned>; palette: ReturnType<typeof palette> } | null
    const shelled = !(passed || !panel || e.surface === 'terminal' || !(look ? look.adaptive : isAdaptive()))
    // For /smarttokensaver debug: a panel that shows without its ground or top bar is answered from here.
    lastShell = `${shelled ? 'yes' : 'no'} (${e.surface ?? 'no surface'}, ${look ? (look.pin ?? (look.adaptive ? 'automatic' : 'painted')) : 'no parts'}, ${under.length} layers, ${layers && ownLook.has(layers) ? 'own look' : 'shared wash'}${passed ? ', handed on' : ''}${drawFreed.length > 0 ? `, ${drawFreed.length} waiting` : ''})`
    if (!shelled) return panel
    // A plain panel lies on the shared wash; one with a look of its own (an alert, the setup guide) does not.
    const shellParts = $.ui.resolve(e) as unknown as Parts
    const pinNow = look ? look.pin : pinned()
    const wash = layers && ownLook.has(layers) ? [] : [slotWash(shellParts, pinNow)]
    return slotShell(shellParts, look ? look.palette : palette(), pinNow, panel, [...wash, ...under]) as typeof panel
    } catch (error) {
      if (slotLayers === layers) slotLayers = null
      lastRenderError = (error instanceof Error ? error.message : String(error)).slice(0, 300)
      return next(e)
    } finally {
      // How long the draws take, for the first few after a load: the render log says where a slow start goes.
      if (drawsTimed < 5) {
        drawsTimed++
        renderLog.push(`${new Date().toISOString()} ${loadedSession} draw took ${Date.now() - lastRenderAt} ms`)
      }
    }
    } finally {
      drawn()
    }
  })
}
