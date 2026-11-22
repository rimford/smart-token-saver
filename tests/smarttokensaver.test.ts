import { describe, expect, mock, test as baseTest } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { handoffAfterNote, noEffort, bugReportUrl, listedVersion, abArmFor, COMMAND_MODE_NOTE, commandPending, COMMAND_MAYBE_NOTE, modelDisplayName, chatWindowChoices, needsAutocompact, reviewLink, SKIP_FOREVER_AT, helperFloor, namedEffort, hotVisible, looksLikeRedo, REDO_STAY_PROMPTS, routeWorth, tipped, bounded, handoffEvidence, parseHandoffAnswer, parseVerdict, capped, resetLabel, HANDOFF_PROMPT, handoffMessage, withAttachments, endsOnQuestion, keepsEffort, benchGrade, benchReport, contextFrom, readConfig, asSpent, cacheColor, cacheLabel, cacheClock, cacheSafe, cacheTtlOf, mostlyCached, isFollowUp, savedText, forkOutcome, setupNext, setupBack, setupCounter, dashboardLines, flashColor, handoffGlowStep, weighted, handoffLook, isNewer, latestRelease, updateSnoozed, claudeCandidates, noClaudeHint, compactTranscript, thresholds, isCold, parseWindow, windowLabel, withWindow, windowStatus, windowNote, compactPlan, fitTranscript, COMPACT_MAX_CHARS, COMPACT_TAIL, contextLine, setupSteps, windowStepNeeded, duplicateInstalls, staleLogs, abConfigTag, reviewPrompt, VERSION_RE, DEFAULT_WINDOW, LEAN_STOPS, GUIDE_URL, PRODUCT_NAME, OWN_VERSION, UPSTREAM_BASE, CREDIT, SUPPORT_HINT, hoverTips, otherBuilds, otherBuildText, withWindowSafe, chatWindowSteps, effectiveWindow, effectiveThresholds, ownInstall, ownInstalls, uninstallLine, uninstallArgs, PLUGIN_ID_RE, chatWindowState, chatWindowWords, windowNeedsCommand, autocompactLine, AUTOCOMPACT_NOTE, sendHint, FILE_MODE_NOTE, REFUSED_HINT, REFUSED_NOTE, settingsChatPrompt, settingsChatLink, withUserWindow, raisedToOffer, COMPACT_BLOCKED_NOTE, hasPreCompactHooks, hooksFileHasPreCompact, transcriptPrint, upstreamGitArgs, UPSTREAM_GIT_ENV, settleRaised, retargetRaised, nextWarmTtl, AB_LOG_NAME, pulseShows, learnTrigger, withLearned, autoSwampFrom, MAINTAINER_MEASURE_DEFAULT, SLIM_LABEL } from '../hooks/register'
import { MARK_PULSE_MS, markLogoSvg } from '../hooks/brand-head'
import { ART_COLUMNS, artFrame, artPixel, MOVING } from '../hooks/art'
import { CONFIG_DEFAULTS } from '../hooks/defaults'
import { PALETTES } from '../hooks/pinned'
import { adaptHex, adaptProps, BRAND_ORANGE, setAdaptive, DIM_DEFAULT, ownColour, TEXT_DEFAULT, highlight, isLight, lightHex, lightProps, setLight, setTheme, themedEls, themedSvg, tint, tintHex } from '../hooks/theme'
import { importsOf, moduleLinks, moduleOf, relPath, withTouch } from '../hooks/agents'
import { afterPrompt, currentStep, phaseAtTurnEnd, progressShare, progressShows, progressTitle, soundArgv, stepNumber, stepsFromTodos, withTaskCreated, withTaskUpdated } from '../hooks/progress'


/** The plugin's own folder, as the test engine loads it: $.plugin.root. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '')

// Most tests below were written for the footer's buttons: they run in the minimal look unless they name another.
// The dashboard's own tests pass { layout: 'default' }. The drawing tests check upstream's violet hexes, so they run in
// the violet theme; the navy & orange default has its own tests under 'theme'.
type Opts = Parameters<typeof baseTest>[1]
const minimal = (o?: Record<string, unknown>) => ({ ...(o ?? {}), options: { layout: 'minimal', theme: 'violet', ...((o?.options as object) ?? {}) } })
const test = ((name: string, a: unknown, b?: unknown) =>
  b === undefined
    ? baseTest(name, minimal() as Opts, a as never)
    : baseTest(name, minimal(a as Record<string, unknown>) as Opts, b as never)) as typeof baseTest

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/** Haiku as the judge answers this reply, and counts how often it was asked. */
function judgeSays(on: On, text: string) {
  const asked: string[] = []
  on('model.complete', (_$, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true as const, text, usage: USAGE } }
  })
  return asked
}

/** What sits beneath the plugins in a session: the prompt goes through, the status line takes text. */
/** The store engine() set up last, and what listens to its writes. */
let testStore = new Map<string, unknown>()
let storeTaps: ((key: string, value: unknown) => void)[] = []

function engine(on: On, env: Record<string, string> = {}, sessionModel = 'claude-opus-5-5', said: { role: string; text: string }[] = [], stored?: Record<string, unknown>) {
  // The store as mock.store keeps it, plus a tap (savedSets) and a handle a test writes through as another chat would.
  testStore = new Map(Object.entries(stored ?? {}))
  storeTaps = []
  const kept = testStore
  on('store.get', (_$, e) => ({ value: kept.has(e.key) ? structuredClone(kept.get(e.key)) : null }) as never)
  on('store.set', (_$, e) => {
    for (const tap of storeTaps) tap(e.key, e.value)
    if (e.value === null || e.value === undefined) kept.delete(e.key)
    else kept.set(e.key, structuredClone(e.value))
    return { value: undefined } as never
  })
  mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1', ...env })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('session.messages', () => ({ value: said }) as never)
  on('session.model', () => ({ value: sessionModel }))
  on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }, { name: 'session-handoff', source: 'user' }] as never }))
}

/** Records the slash commands the mod runs, as the person's own /model and /effort. */
/** Records each setting the plugin saves to its own store (savedSettings), as `plugin.field` and value, in order. */
function savedSets(on: On) {
  const set: { key: string; value: unknown }[] = []
  let before: Record<string, unknown> = {}
  void on
  storeTaps.push((key, value) => {
    if (key !== 'savedSettings') return
    const now = (value ?? {}) as Record<string, unknown>
    for (const [k, v] of Object.entries(now)) if (before[k] !== v) set.push({ key: `smarttokensaver.${k}`, value: v })
    before = { ...now }
  })
  return set
}

function recordCommands(on: On) {
  const ran: string[] = []
  on('command.run', (_$, e) => {
    ran.push(`/${e.command} ${e.args}`)
    return { text: 'ok' }
  })
  return ran
}

/** Records the model and effort each main-conversation request was sent with. */
function recordSteps(on: On) {
  const sent: { model: string; effort: unknown }[] = []
  on('turn.step', async function* (_$, e) {
    sent.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return sent
}

/** One main-loop request, the engine sending `effort` as its own setting (high unless /effort set another). */
async function step($: Engine, effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' = 'high') {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort, messageCount: 1 })
  for await (const _ of stream) {
    // drain
  }
}

/** The desktop footer: one Auto button, and the effort in use beside it. */
const FOOTER = { plugin: 'smarttokensaver', surface: 'desktop', component: 'SessionMode', props: { modes: [] } } as never

/** The band above the prompt on desktop: it draws nothing (only the terminal has rows there). */
const DESK_BAND = { plugin: 'smarttokensaver', surface: 'desktop', ...BAND } as never

/** What a mounted tree draws, as text: its elements, props and strings. */
/** Nothing shows above the prompt on desktop: only the hidden hover cards, revealed by hovering the footer. */
async function noBand($: Engine, at: never) {
  const ui = await $.ui.mount(at)
  const text = await drawn(ui)
  expect(text).toContain('hover-cards')
  expect(text).not.toMatch(/"key":"(settings|setup|down|hot|cold|swamp)"/)
  await ui.unmount()
}

/** The mod draws nothing of its own there: the slot passes through to what sits beneath (the engine's own element).
 *  A mount that throws fails the test: a render that broke must not pass as "nothing drawn". */
async function drawsNothing($: Engine, at: never) {
  const ui = await $.ui.mount(at)
  expect(await drawn(ui)).toMatch(/^\{"type":"engine"/)
  await ui.unmount()
}

/** The footer's Reduce button opens the compact bar; its Handoff instead opens the handoff bar. */
async function openHandoff($: Engine, footer: { press: (at: { key: string }) => Promise<unknown> }) {
  await footer.press({ key: 'handoff' })
  const band = await $.ui.mount(DESK_BAND)
  await band.press({ key: 'compact-to-handoff' })
  await band.unmount()
}
async function drawn(ui: { drawn: () => Promise<unknown> }): Promise<string> {
  return JSON.stringify(await ui.drawn())
}

/**
 * The band's buttons take clicks: the app draws anything in the flow under an absolutely placed art layer, so the
 * layer holding them must itself be absolute and come after the art.
 */
async function clickable(ui: { drawn: () => Promise<unknown> }, layer: string, position: 'absolute' | 'relative' = 'absolute') {
  const find = (node: unknown): Record<string, unknown> | undefined => {
    if (!node || typeof node !== 'object') return undefined
    const n = node as Record<string, unknown>
    const props = (n.props ?? {}) as Record<string, unknown>
    if (n.key === layer || props.key === layer) return n
    for (const value of Object.values(n)) {
      const hit = Array.isArray(value) ? value.map(find).find(Boolean) : find(value)
      if (hit) return hit
    }
    return undefined
  }
  const node = find(await ui.drawn())
  expect(node).toBeDefined()
  const props = ((node as Record<string, unknown>).props ?? node) as Record<string, unknown>
  expect(props.position).toBe(position)
  // The app positions a relative box only when it anchors an absolute child: without one, layers behind it take the clicks.
  if (position === 'relative') {
    const kids = ((node as Record<string, unknown>).children ?? props.children ?? []) as unknown[]
    expect(kids.some(k => ((k as { props?: { position?: string } } | null)?.props?.position) === 'absolute')).toBe(true)
  }
}

describe('auto', () => {
  test('with the cheaper model off, effort follows the judge and the model stays the one in use', { options: { modelAuto: 'off' } } as never, async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple question"}')
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'vad heter mappen?', wait: false, origin: { kind: 'composer' } })
    await step($)

    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'low' })
  })

  test('Auto switched off: the app effort goes out, not the pick the judge made while Auto was on', async ($, on) => {
    engine(on)
    on('model.complete', () => ({ value: { isAnswered: true as const, text: '{"model":"opus","effort":"low","why":"tiny"}', usage: USAGE } }))
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'rename this one variable for me', wait: false, origin: { kind: 'composer' } })
    await step($, 'xhigh')
    expect(sent[0].effort).toBe('low')
    // Auto off, the app still on Extra (no change the mod could see): Extra goes out, not the judge's old low.
    await $.command.run({ command: 'smarttokensaver', args: 'auto' })
    await step($, 'xhigh')
    expect(sent[1].effort).toBe('xhigh')
    await $.prompt.submit({ text: 'now plan the whole architecture', wait: false, origin: { kind: 'composer' } })
    await step($, 'xhigh')
    expect(sent[2].effort).toBe('xhigh')
  })

  test('routeWorth: a switch to a cold model pays only when it still comes out cheaper', () => {
    const big = 100_000
    // Opus chat, cache warm: a cold Sonnet writes the whole chat and costs more; a warm Sonnet is far cheaper.
    expect(routeWorth('sonnet', 'opus', big, { to: false, inUse: true })).toBe(false)
    expect(routeWorth('sonnet', 'opus', big, { to: true, inUse: true })).toBe(true)
    // A cold Haiku writes the whole chat (a third of the price, 1.25 times) against a warm Opus read (twice the price, a tenth): still more.
    expect(routeWorth('haiku', 'opus', big, { to: false, inUse: true })).toBe(false)
    expect(routeWorth('haiku', 'opus', big, { to: true, inUse: true })).toBe(true)
    // The chat's own cache gone cold: staying would write it all again on Opus, so Sonnet wins even cold.
    expect(routeWorth('sonnet', 'opus', big, { to: false, inUse: false })).toBe(true)
    // No context size known: route as before.
    expect(routeWorth('sonnet', 'opus', 0, { to: false, inUse: true })).toBe(true)
  })

  test('a prompt the judge calls simple runs on Haiku 5.5; the next hard one is back on the chat model', { options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    let verdict = '{"model":"haiku","effort":"low","why":"simple question"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }))
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'vad heter mappen?', wait: false, origin: { kind: 'composer' } })
    await step($)
    expect(sent[0]).toEqual({ model: 'claude-haiku-5-5', effort: 'low' })
    verdict = '{"model":"opus","effort":"high","why":"big refactor"}'
    await $.prompt.submit({ text: 'refactor the whole auth layer', wait: false, origin: { kind: 'composer' } })
    await step($)
    expect(sent[1]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  })

  test('a typed skill is judged like a prompt (told what it is); the app\'s own commands are not', { options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(String((e as { prompt?: string }).prompt ?? ''))
      return { value: { isAnswered: true as const, text: '{"model":"haiku","effort":"low","why":"small job"}', usage: USAGE } }
    })
    const sent = recordSteps(on)
    // /session-handoff is a user skill (see engine's command list): judged, even though it is short enough to look like a follow-up.
    await $.prompt.submit({ text: '/session-handoff', wait: false, origin: { kind: 'composer' } })
    await step($)
    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('slash command that runs a skill')
    expect(sent[0].model).toBe('claude-haiku-5-5')
    // /model is the app's own: never judged.
    await $.prompt.submit({ text: '/model', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(1)
  })

  test('the judge never moves a prompt to a dearer model than the chat model, nor to Fable', async ($, on) => {
    engine(on, {}, 'claude-sonnet-5-5')
    judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'debug this race condition', wait: false, origin: { kind: 'composer' } })
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 1 })) {
      // drain
    }
    expect(sent[0].model).toBe('claude-sonnet-5-5')
  })

  test('a reply that is not a verdict leaves the session as it is', async ($, on) => {
    engine(on)
    judgeSays(on, 'I think sonnet')
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'fixa buggen', wait: false, origin: { kind: 'composer' } })
    await step($)

    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  })

  test('slash commands are not judged', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"max","why":"x"}')

    await $.prompt.submit({ text: '/clear', wait: false, origin: { kind: 'composer' } })

    expect(asked.length).toBe(0)
  })
})

describe('manual effort', () => {
  test("the app's own Effort control wins over Auto and turns it off", async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    const drain = async (index: number, effort: 'low' | 'medium' | 'high') => {
      for await (const _ of $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', effort, messageCount: 1 })) {
        // drain
      }
    }

    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    await drain(0, 'medium')
    expect(sent[0].effort).toBe('high')

    // The person picks Low in the app between two requests.
    await drain(1, 'low')
    expect(sent[1].effort).toBe('low')
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'auto' }))?.text).toContain('Default')
    await ui.unmount()

    await drain(2, 'low')
    expect(sent[2].effort).toBe('low')
  })
})

describe('model in use', () => {
  test('a switch in the app moves the band, and effort applies to the new model at once', { options: { modelAuto: 'off' } } as never, async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"kort"}')
    const sent = recordSteps(on)
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const switchTo = (from: string, to: string) =>
      $.classic.PostModelSwitch({ from_model: from, to_model: to, requested_model: null, source: 'picker', context_tokens: 0 } as never)

    await switchTo('claude-opus-5-5', 'claude-haiku-5-5')
    await $.prompt.submit({ text: 'ok', wait: false, origin: { kind: 'composer' } })
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await ui.redraw()
    expect((await ui.find({ key: 'm-haiku' }))?.text).toContain('Haiku')

    // The person picks Opus in the app.
    await switchTo('claude-haiku-5-5', 'claude-opus-5-5')
    await ui.redraw()
    expect((await ui.find({ key: 'm-opus' }))?.text).toContain('Opus')

    await step($, 'medium')
    expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'low' })
    await ui.unmount()
  })
})

describe('two autos', () => {
  test('Auto for model starts off: effort follows the judge and no model is suggested', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const sent = recordSteps(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    expect((await ui.find({ key: 'auto' }))?.text).toContain('Smart')
    expect((await ui.find({ key: 'auto-model' }))?.text).toContain('Auto off')

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeUndefined()

    await step($, 'medium')
    expect(sent[0].effort).toBe('low')
    expect(ran).toEqual([])
    await ui.unmount()
  })

  test('Auto for effort off: the judge may still suggest a model, effort is left alone', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    on('turn.complete', () => ({ text: '' }))
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto' })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeDefined()

    await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'completed' } as never)
    await mocked.advance(10)
    expect(ran).toEqual([])
    await ui.unmount()
  })
})

describe('the command without a known word', () => {
  test('bare or unknown, it lists what there is to type; switch and keep answer only a suggestion', async ($, on) => {
    engine(on)
    const run = async (args: string) => String((await $.command.run({ command: 'smarttokensaver', args })).text)
    expect(await run('')).toContain('/smarttokensaver takes: settings, setup')
    expect(await run('nonsense')).toMatch(/^Unknown: nonsense\. \/smarttokensaver takes:/)
    expect(await run('keep')).toBe('No model suggestion right now.')
    expect(await run('switch')).toBe('No model suggestion right now.')
  })
})

describe('typed commands', () => {
  const box = (on: On, draft: string) => {
    const filled: string[] = []
    on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }) as never)
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    return filled
  }

  test('a model click types /model into an empty box for you to send', async ($, on) => {
    engine(on)
    const filled = box(on, '')
    const ran = recordCommands(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })

    await ui.press({ key: 'm-haiku' })

    expect(filled).toEqual(['/model haiku'])
    expect(ran).toEqual([])
    await ui.unmount()
  })

  test('with a draft in the box nothing is overwritten and the mod runs the model switch itself', async ($, on) => {
    engine(on)
    const filled = box(on, 'ett halvskrivet meddelande')
    const ran = recordCommands(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })

    await ui.press({ key: 'm-haiku' })

    expect(filled).toEqual([])
    expect(ran).toEqual(['/model haiku'])
    await ui.unmount()
  })

  test('an effort click sets the effort at once and also types /effort for the app', async ($, on) => {
    engine(on)
    const filled = box(on, '')
    const sent = recordSteps(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })

    await ui.press({ key: 'e-high' })
    await step($, 'medium')

    expect(filled).toEqual(['/effort high'])
    expect(sent[0].effort).toBe('high')
    await ui.unmount()
  })
})

describe('footer text', () => {
  const PURPLE = '#a79cf7'
  const auto = async ($: Engine) => String((await $.command.run({ command: 'smarttokensaver', args: 'auto' })).text)
  const saving = (on: On, outputTokens: number) =>
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { ...USAGE, output_tokens: outputTokens, model: 'claude-opus-5-5' },
      } as never
    })
  const asked = async ($: Engine) => String((await $.command.run({ command: 'smarttokensaver', args: 'stats' })).text)

  test('the footer is purple text and one small button; no box, nothing lit', { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    const footer = await $.ui.mount(FOOTER)
    const text = await drawn(footer)
    expect(text).toContain(`"color":"${adaptHex(PURPLE, 'text')}"`)
    expect(text).toContain('"children":[" Smart "]')
    // The only button is the small switch for Auto: no label other than the power glyph, not the lit look.
    // Show the bar, the Auto switch, Reduce and the setup (or settings gear), in that order.
    expect(text.match(/"type":"Button"/g)?.length).toBe(4)
    expect(text).toContain('"label":" ⏻ "')
    const at = (l: string) => text.indexOf(`"label":"${l}"`)
    expect(at(' ☰ ')).toBeGreaterThan(-1)
    expect(at(' ☰ ')).toBeLessThan(at(' ⏻ '))
    expect(at(' ⏻ ')).toBeLessThan(at(' →|← '))
    // No frame of its own (it drew wide and cut off): plain, with the same grey box as the level on hover.
    expect(text).toContain('"plain":true')
    expect(text).toMatch(/"hover":\{"scope":"power","backgroundColor":"[^"]+"\}/)
    expect(text).not.toContain('"variant":"primary"')
    expect(text).not.toContain('borderStyle')
    // The level is not a control: its hover only names the group (for its tip), no box behind it.
    expect(text).toContain('"hover":{"scope":"effort"}')
    // No background at rest: the only ones are in the hover styles and the hidden hover cards (display none).
    expect(text.replace(/"hover":\{[^}]*\}/g, '').replace(/"display":"none"[^}]*"backgroundColor":"[^"]+"/g, '').replace(/"backgroundColor":"[^"]+"(?=[^{]*"display":"none")/g, '')).not.toMatch(/"props":\{[^}]*"backgroundColor"[^}]*\}(?![^{]*display)/)
    await footer.unmount()
  })

  test('with Auto on it is the effort in use, in purple', { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    const text = await drawn(footer)
    expect(text).toContain('"children":[" High "]')
    expect(text).toContain(`"color":"${adaptHex(PURPLE, 'text')}"`)
    await footer.unmount()
  })

  test('the small button switches Auto off ("Off", dim, not purple) and on again', { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).toContain('"children":[" High "]')

    await footer.press({ key: 'auto' })
    const off = await drawn(footer)
    expect(off).toContain('"children":[" Default "]')
    expect(off).not.toContain(`"color":"${adaptHex(PURPLE, 'text')}"`)
    await $.prompt.submit({ text: 'en till', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(1)

    await footer.press({ key: 'auto' })
    expect(await drawn(footer)).toContain(`"color":"${adaptHex(PURPLE, 'text')}"`)

    // The command does the same.
    expect(await auto($)).toContain('Default:')
    expect(await drawn(footer)).toContain('"children":[" Default "]')
    await footer.unmount()
  })

  test("the app's own Effort control turns Auto off and the footer says Off", { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"high","why":"hard"}')
    recordSteps(on)
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(await drawn(footer)).toContain(`"color":"${adaptHex(PURPLE, 'text')}"`)

    // The person picks another effort in the app between two requests.
    await step($, 'low')
    expect(await drawn(footer)).toContain('"children":[" Default "]')
    await footer.unmount()
  })

  test('on a Haiku before 5.5 there is no effort to name', async ($, on) => {
    engine(on, {}, 'claude-haiku-4-5')
    const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const footer = await $.ui.mount(FOOTER)
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5',
      to_model: 'claude-haiku-4-5',
      requested_model: 'haiku',
      source: 'picker',
      context_tokens: 0,
    } as never)
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).not.toContain('Low')
    // And nothing to judge: no verdict is paid for that the request could not use.
    expect(asked.length).toBe(0)
    await footer.unmount()
  })

  test('the judge is told that scope counts: a short message can be a big job', async ($, on) => {
    engine(on)
    let system = ''
    on('model.complete', (_$, e) => {
      system = String(e.system)
      return { value: { isAnswered: true as const, text: '{"model":"opus","effort":"high","why":"stor uppgift"}', usage: USAGE } } as never
    })
    await $.prompt.submit({ text: 'go through my whole google drive and clean it up', wait: false, origin: { kind: 'composer' } })
    expect(system).toContain('SCOPE')
    expect(system).toContain('whole drive')
    expect(system).toContain('never low')
  })

  test('the mark pulses while the judge runs and plays its last pulse to the end, at least one whole pulse', () => {
    const P = MARK_PULSE_MS
    expect(pulseShows(5000, 1000, null)).toBe(true)
    // A quick verdict (200 ms): one whole pulse still plays.
    expect(pulseShows(1000 + P - 1, 1000, 1200)).toBe(true)
    expect(pulseShows(1000 + P, 1000, 1200)).toBe(false)
    // A long one (1.5 pulses): the second pulse ends first.
    expect(pulseShows(1000 + 2 * P - 1, 1000, 1000 + 1.5 * P)).toBe(true)
    expect(pulseShows(1000 + 2 * P, 1000, 1000 + 1.5 * P)).toBe(false)
    expect(markLogoSvg('#FF6B00', 'thinking')).toContain('class="rr"')
    expect(markLogoSvg('#FF6B00', 'on')).not.toContain('animation')
  })

  test('a thinking state while the judge decides', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    // The judge takes half a second to answer.
    on('model.complete', async () => {
      await mocked.sleep(500)
      return { value: { isAnswered: true as const, text: '{"model":"sonnet","effort":"high","why":"x"}', usage: USAGE } } as never
    })
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).not.toContain('Deciding')

    const submitted = $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(100)
    expect(await drawn(footer)).toContain('"children":[" Deciding… "]')

    await mocked.advance(600)
    await submitted
    expect(await drawn(footer)).not.toContain('Deciding')
    expect(await drawn(footer)).toContain('"children":[" High "]')
    await footer.unmount()
  })

  test('a switch is shown as Low → High for a moment, then only the level', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let verdict = '{"model":"sonnet","effort":"low","why":"simple"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }) as never)
    const footer = await $.ui.mount(FOOTER)

    // The first verdict has nothing to switch from.
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).not.toContain(' → ')

    verdict = '{"model":"sonnet","effort":"high","why":"hard"}'
    await $.prompt.submit({ text: 'hard task across several files', wait: false, origin: { kind: 'composer' } })
    expect(await drawn(footer)).toContain('"children":[" Low → High "]')

    await mocked.advance(2600)
    const settled = await drawn(footer)
    expect(settled).not.toContain(' → ')
    expect(settled).toContain('"children":[" High "]')
    await footer.unmount()
  })

  test('/smarttokensaver stats reports the measured cost of every token kind, per effort, and the judge', async ($, on) => {
    engine(on)
    mock.clock(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 600, cache_read_input_tokens: 10000, cache_creation_input_tokens: 800, model: 'claude-opus-5-5' },
      } as never
    })
    expect(await asked($)).toContain('nothing measured yet')

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await step($, 'high')

    // 100 in + 800 written x2 (1-hour writes, what Claude Code writes) + 10000 read x0.05 + 600 out x5
    // = 100 + 1600 + 500 + 3000 = 5200.
    const text = await asked($)
    expect(text).toContain('1 prompts, 1 requests, cost about 5.2k')
    expect(text).toContain('cache reads 10 %, cache writes 31 %, output 58 %')
    expect(text).toContain('Low 1, average 5.2k')
    expect(text).toContain('Judge: Haiku 5.5 1')
    expect(text).not.toContain('saved about')
  })

  test('requests you steered yourself are not counted', async ($, on) => {
    engine(on)
    saving(on, 600)
    const rows = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await rows.press({ key: 'e-low' })
    await step($, 'high')
    expect(await asked($)).toContain('nothing measured yet')
    await rows.unmount()
  })

  test('nothing is drawn above the prompt on desktop', async ($, on) => {
    engine(on)
    await drawsNothing($, DESK_BAND)
  })

  test('a model suggestion still asks above the prompt on desktop', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    mock.clock(on)
    const rows = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await rows.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    const ask = await $.ui.mount(DESK_BAND)
    expect(await ask.find({ key: 'accept' })).toBeDefined()
    await ask.unmount()
    await rows.unmount()
  })

  test('the model row is paused: effort only, unless SMARTTOKENSAVER_MODEL_UI=1', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MODEL_UI: '0' })
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'e-high' })).toBeDefined()
    expect(await ui.find({ key: 'm-opus' })).toBeUndefined()
    expect(await ui.find({ key: 'auto-model' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('helpers', () => {
  test('cacheSafe: effort may change on the four measured models only; a Haiku before 5.5 takes none', () => {
    expect(cacheSafe('claude-opus-5-5')).toBe(true)
    expect(cacheSafe('claude-sonnet-5-5[1m]')).toBe(true)
    expect(cacheSafe('claude-fable-5-2')).toBe(true)
    expect(cacheSafe('claude-haiku-5-5')).toBe(true)
    expect(cacheSafe('claude-haiku-4-5-20251001')).toBe(false)
    expect(noEffort('claude-haiku-4-5-20251001')).toBe(true)
    expect(noEffort('claude-haiku-5-5')).toBe(false)
    expect(noEffort('claude-fable-5-1')).toBe(false)
    expect(cacheSafe('claude-fable-5-1')).toBe(false)
    expect(cacheSafe('claude-opus-4-8')).toBe(false)
    expect(cacheSafe('claude-opus-5')).toBe(false)
  })

})

describe('follow-ups', () => {
  test('isFollowUp: short go-aheads yes, real requests no', () => {
    for (const t of ['go', 'ok', ' yes ', 'ok go', 'continue']) expect(isFollowUp(t)).toBe(true)
    for (const t of ['', 'rename x to count in utils', 'go through my whole drive']) expect(isFollowUp(t)).toBe(false)
  })

  test('"go" after a judged prompt keeps its effort and asks no judge', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'granska hela relayn', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(asked.length).toBe(1)
    expect(sent[0].effort).toBe('high')
  })

  test('"go" after a High answer runs at Medium once save mode is on', async ($, on) => {
    engine(on)
    mock.clock(on)
    judgeSays(on, '{"model":"opus","effort":"high","why":"hard"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'granska hela relayn', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[0].effort).toBe('high')
    expect(String((await $.command.run({ command: 'smarttokensaver', args: 'save' })).text)).toContain('save mode on')
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[1].effort).toBe('medium')
  })

  test('a message the judge gives no verdict for keeps the effort, capped by save mode, and is counted there', async ($, on) => {
    engine(on)
    mock.clock(on)
    let answers = true
    on('model.complete', () => (answers
      ? { value: { isAnswered: true as const, text: '{"model":"opus","effort":"high","why":"hard"}', usage: USAGE } }
      : { value: { isAnswered: false as const, reason: 'api-error' } }) as never)
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'granska hela relayn', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[0].effort).toBe('high')
    answers = false
    await $.prompt.submit({ text: 'now do the same for the sync module, all of it', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[1].effort).toBe('high')
    const stats = String((await $.command.run({ command: 'smarttokensaver', args: 'stats' })).text)
    expect(stats).toContain('2 prompts')
    expect(stats).toContain('High 2')
    await $.command.run({ command: 'smarttokensaver', args: 'save' })
    await $.prompt.submit({ text: 'and now the third module, in the same way', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[2].effort).toBe('medium')
  })

  test('"go" after a prompt that ran on a cheaper model runs on the chat\'s own model', { options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple question"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'vad heter mappen?', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[0].model).toContain('haiku')
    await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(sent[1].model).toBe('claude-opus-5-5')
  })
})

describe('named level', () => {
  test('namedEffort: a level said with the word effort, or xhigh, counts; other senses and negations do not', () => {
    expect(namedEffort('do this with max effort please')).toBe('max')
    expect(namedEffort('Effort: high, then refactor the relay')).toBe('high')
    expect(namedEffort('run it at effort low')).toBe('low')
    expect(namedEffort('use extra high effort for this one')).toBe('xhigh')
    expect(namedEffort('xhigh, review the whole repo')).toBe('xhigh')
    expect(namedEffort('maximum effort on this bug')).toBe('max')
    expect(namedEffort('make a medium sized image')).toBeUndefined()
    expect(namedEffort('this needs a lot of effort, the bug is high up in the stack')).toBeUndefined()
    expect(namedEffort("don't use max effort for this")).toBeUndefined()
    expect(namedEffort('no need for high effort here')).toBeUndefined()
    expect(namedEffort('a high effort job: migrate everything')).toBeUndefined()
    expect(namedEffort('That was a low effort answer')).toBeUndefined()
    expect(namedEffort('what is the difference between high effort and max effort')).toBeUndefined()
    expect(namedEffort('Do not, under any circumstances, use max effort')).toBeUndefined()
    expect(namedEffort("rename 'max effort' in the docs")).toBeUndefined()
    expect(namedEffort('> use max effort\nwho wrote that line')).toBeUndefined()
    expect(namedEffort('\u201euse max effort\u201d stands in the readme')).toBeUndefined()
    expect(namedEffort('start it with effort=low in the env')).toBeUndefined()
    expect(namedEffort('make an effort to max out the cache')).toBeUndefined()
    expect(namedEffort('use `high` effort for this')).toBe('high')
    expect(namedEffort('set effort to low')).toBe('low')
    expect(namedEffort('max effort')).toBe('max')
    expect(namedEffort("it's big, so use max effort, don't you think")).toBe('max')
    // Talked about or quoted, a level names nothing: the judge decides.
    expect(namedEffort('what does max effort do?')).toBeUndefined()
    expect(namedEffort('the button says max effort, rename it')).toBeUndefined()
    expect(namedEffort('rename the label "max effort" to "Smartest"')).toBeUndefined()
    expect(namedEffort('why is `effort: high` in this config')).toBeUndefined()
    expect(namedEffort('the log is long. use max effort')).toBe('max')
  })

  test('"max effort" alone is a named level, not a short follow-up', async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"small"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'rename this variable', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'max effort', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(asked.length).toBe(1)
    expect(sent[0].effort).toBe('max')
  })

  test('a prompt that names a level runs at it without asking the judge, past Max', { options: { effortCeiling: 'high' } } as never, async ($, on) => {
    engine(on)
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"small"}')
    const sent = recordSteps(on)
    await $.prompt.submit({ text: 'max effort: find why the relay drops messages', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(asked.length).toBe(0)
    expect(sent[0].effort).toBe('max')
    // The next prompt without a level goes back to the judge, within Max.
    await $.prompt.submit({ text: 'now rename the helper in utils', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')
    expect(asked.length).toBe(1)
    expect(sent[1].effort).toBe('low')
  })
})

describe('state from an older version', () => {
  test('the pre-0.2.0 tally { requests, actual, baseline } reads as an empty tally, never throws', () => {
    const old = { requests: 3, actual: 900, baseline: 1500 } as never
    expect(asSpent(old).judge).toEqual({ haiku: 0, ms: 0, tokens: 0 })
    expect(asSpent(old).byEffort).toEqual({})
    expect(() => savedText(old)).not.toThrow()
    expect(asSpent(undefined).prompts).toBe(0)
  })
})

describe('cache countdown', () => {
  const answer = (on: On, cacheCreation?: Record<string, number>) =>
    on('turn.step', async function* (_$, e) {
      return {
        turnId: e.turnId,
        index: e.index,
        answer: '',
        toolUses: [],
        stopReason: 'end_turn',
        usage: { ...USAGE, ...(cacheCreation ? { cache_creation: cacheCreation } : {}) },
      } as never
    })
  // The countdown's timer starts with the session, as in the app.
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }
  const shows = (text: string) => `"children":["${text}"]`

  test('cacheTtlOf and cacheLabel', () => {
    expect(cacheTtlOf({ cache_creation: { ephemeral_1h_input_tokens: 900, ephemeral_5m_input_tokens: 0 } })).toBe('1h')
    expect(cacheTtlOf({ cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 10 } })).toBe('5m')
    expect(cacheTtlOf({ input_tokens: 1 })).toBeUndefined()
    expect(cacheLabel(60)).toBe('59m')
    expect(cacheClock(3_521_000)).toBe('58:41')
    expect(cacheClock(59_400)).toBe('1:00')
    expect(cacheClock(5_000)).toBe('0:05')
    expect(cacheClock(0)).toBe('❄ Cold')
    expect(cacheLabel(1)).toBe('<1m')
    expect(cacheLabel(0)).toBe('❄ Cold')
    expect(cacheColor(60)).toBeUndefined()
    expect(cacheColor(22)).toBeUndefined()
    expect(cacheColor(21)).toBe('#e0a33a')
    expect(cacheColor(7)).toBe('#e0a33a')
    expect(cacheColor(6)).toBe('#e5534b')
    expect(cacheColor(1)).toBe('#e5534b')
    expect(cacheColor(0)).toBe('#7cc4ff')
    expect(mostlyCached({ input_tokens: 90000, cache_read_input_tokens: 10 })).toBe(false)
  })

  test('nothing before the first response; then it counts down with no further response, turns amber, goes cold', { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 0 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).not.toContain('Cold')

    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))

    // No request in between: the session's own timer moves it.
    await mocked.advance(30 * 60_000)
    expect(await drawn(footer)).toContain(shows('29m'))

    expect(await drawn(footer)).not.toContain('"color":"#e')
    await mocked.advance(10 * 60_000)
    expect(await drawn(footer)).toContain(shows('19m'))
    expect(await drawn(footer)).toContain(`"color":"${adaptHex('#e0a33a', 'text')}"`)
    await mocked.advance(16 * 60_000)
    const late = await drawn(footer)
    expect(late).toContain(shows('3m'))
    expect(late).toContain(`"color":"${adaptHex('#e5534b', 'text')}"`)

    await mocked.advance(5 * 60_000)
    expect(await drawn(footer)).toContain(shows('❄ Cold'))

    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))
    await footer.unmount()
  })

  test('a response that does not say its lifetime is counted as 1 hour', async ($, on) => {
    engine(on)
    mock.clock(on)
    answer(on)
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    expect(await drawn(footer)).toContain(shows('59m'))
    await footer.unmount()
  })

  test('a response that says 5 minutes counts down 5 minutes', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    expect(await drawn(footer)).toContain(shows('4m'))
    await mocked.advance(6 * 60_000)
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    await footer.unmount()
  })

  /** The band above the prompt, with the first-run setup guide closed so the cold band can show. */
  const coldBand = async ($: Engine) => {
    const band = await $.ui.mount(DESK_BAND)
    if (await band.find({ key: 'setup-close' })) {
      await band.press({ key: 'setup-close' })
    }
    return band
  }

  test('Compact appears only once the cache is cold, and a click compacts', async ($, on) => {
    engine(on)
    on('session.usage', () => ({ value: { context: { tokens: 500_000, window: 1_000_000, percent: 50 } } }) as never)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500, ephemeral_5m_input_tokens: 0 })
    let compacted = 0
    let note = ''
    on('command.run', (_$, e) => {
      if (e.command === 'compact') note = e.args
      if (e.command === 'compact') compacted++
      return { text: 'ok' }
    })
    await start($, on)
    await step($)
    await mocked.advance(59 * 60_000)
    // Still warm: no band (only the first-run guide, closed here), so nothing to compact yet.
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await drawsNothing($, DESK_BAND)
    await mocked.advance(2 * 60_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'cold-compact' })).toBeDefined()
    await band.press({ key: 'cold-compact' })
    // The bar asks for an optional note first; Enter in it compacts with the note as /compact's instructions.
    await band.input({ key: 'compact-note', text: 'keep the API decisions' })
    await mocked.advance(100)
    // The test kit's compaction has no transcript to run over, so only the call is checked here.
    expect(compacted).toBe(1)
    expect(note).toBe('keep the API decisions')
    await band.unmount()
  })

  test('/smarttokensaver cold shows Cold and the Compact button at once, for testing', async ($, on) => {
    engine(on)
    mock.clock(on)
    answer(on, { ephemeral_1h_input_tokens: 500 })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    await step($)
    const reply = await $.command.run({ command: 'smarttokensaver', args: 'cold' })
    expect(String(reply.text)).toContain('cold')
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    expect(await footer.find({ key: 'compact' })).toBeUndefined()
    const band = await coldBand($)
    expect(await band.find({ key: 'cold-compact' })).toBeDefined()
    await band.unmount()
    await footer.unmount()
  })

  test('a compact that fails says why in a toast, nothing breaks', async ($, on) => {
    engine(on)
    on('session.usage', () => ({ value: { context: { tokens: 500_000, window: 1_000_000, percent: 50 } } }) as never)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    on('command.run', (_$, e) => {
      if (e.command === 'compact') throw new Error('compact is not available here')
      return { text: 'ok' }
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const footer = await $.ui.mount(FOOTER)
    const band = await coldBand($)
    await step($)
    await mocked.advance(6 * 60_000)
    await band.press({ key: 'cold-compact' })
    // The bar asks for an optional note first; Compact runs it.
    await band.press({ key: 'compact-go' })
    expect(toasts.join(' ')).toContain('compact failed')
    expect(await drawn(footer)).toContain(shows('❄ Cold'))
    await band.unmount()
    await footer.unmount()
  })

  test('a Compact the plugin\'s session.compact hook never saw (skipped by a plugin above it) is noted: the Model card says the chat\'s model writes it', { options: { layout: 'default' } } as never, async ($, on) => {
    const chat = [{ role: 'user', text: 'a long chat', toolUses: [] }, { role: 'assistant', text: 'done', toolUses: [] }]
    engine(on, {}, 'claude-opus-5-5', chat as never)
    on('session.usage', () => ({ value: { context: { tokens: 500_000, window: 1_000_000, percent: 50 } } }) as never)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    // Claude Code's /compact runs and compacts (the transcript is a summary now), but the session.compact event goes
    // past the plugin (as cc-plugin-sec-default does).
    on('command.run', () => {
      chat.splice(0, chat.length, { role: 'user', text: 'core summary', toolUses: [] })
      return { text: 'ok' }
    })
    on('session.compact', () => ({ messages: [{ role: 'user', text: 'core summary', toolUses: [] }] }) as never)
    on('model.complete', () => ({ value: { isAnswered: true as const, text: 'S'.repeat(400), usage: USAGE } }))
    await start($, on)
    const band = await coldBand($)
    await step($)
    await mocked.advance(6 * 60_000)
    await band.press({ key: 'cold-compact' })
    await band.press({ key: 'compact-go' })
    await band.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-model' })
    expect(await drawn(panel)).toContain(COMPACT_BLOCKED_NOTE)
    // A compaction the hook does see clears it.
    await $.session.compact({})
    await panel.press({ key: 'settings-back' })
    expect(await drawn(panel)).not.toContain("chat's model here")
    await panel.unmount()
  })

  test('a /compact that answered but left the transcript as it was: no "Compacted", the cache stays, and the hook is not called skipped', { options: { layout: 'default' } } as never, async ($, on) => {
    const chat = [{ role: 'user', text: 'a long chat', toolUses: [] }, { role: 'assistant', text: 'done', toolUses: [] }]
    engine(on, {}, 'claude-opus-5-5', chat as never)
    on('session.usage', () => ({ value: { context: { tokens: 500_000, window: 1_000_000, percent: 50 } } }) as never)
    const mocked = mock.clock(on)
    answer(on, { ephemeral_5m_input_tokens: 500 })
    on('command.run', () => ({ text: 'Not enough messages to compact.' }))
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? JSON.stringify(e)))
      return { value: undefined } as never
    })
    await start($, on)
    const band = await coldBand($)
    await step($)
    await mocked.advance(6 * 60_000)
    await band.press({ key: 'cold-compact' })
    await band.press({ key: 'compact-go' })
    expect(toasts.join(' ')).toContain('nothing was compacted (Not enough messages to compact.)')
    expect(await drawn(band)).not.toContain('Compacted')
    await band.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    expect(await drawn(panel)).not.toContain("chat's model here")
    await panel.unmount()
  })
})

describe('cache guard', () => {
  test('on Fable Auto neither judges nor changes the effort, and the footer says Paused', async ($, on) => {
    engine(on, {}, 'claude-fable-5-1')
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"x"}')
    const sent: unknown[] = []
    on('turn.step', async function* (_$, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    const footer = await $.ui.mount(FOOTER)
    await $.prompt.submit({ text: 'hard task', wait: false, origin: { kind: 'composer' } })
    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-fable-5-1', effort: 'xhigh', messageCount: 1 })
    for await (const _ of stream) {
      // drain
    }
    expect(asked.length).toBe(0)
    expect(sent).toEqual(['xhigh'])
    expect(await drawn(footer)).toContain('"children":[" Paused "]')
    await footer.unmount()
  })

  // Measured 21.11.2026 (tools/effort-cache-probe): an effort change keeps the cache on these two as well.
  for (const [id, key] of [['claude-fable-5-2', 'fable'], ['claude-haiku-5-5', 'haiku']] as const) {
    test(`on ${id} Smart judges, its effort goes out and the footer names it`, async ($, on) => {
      engine(on, {}, id)
      const asked = judgeSays(on, `{"model":"${key}","effort":"low","why":"x"}`)
      const sent: unknown[] = []
      on('turn.step', async function* (_$, e) {
        sent.push(e.effort)
        return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
      })
      const footer = await $.ui.mount(FOOTER)
      await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
      const stream = $.turn.step({ turnId: 't1', index: 0, model: id, effort: 'xhigh', messageCount: 1 })
      for await (const _ of stream) {
        // drain
      }
      expect(asked.length).toBe(1)
      expect(sent).toEqual(['low'])
      const shown = await drawn(footer)
      expect(shown).not.toContain('Paused')
      expect(shown).toContain('Low')
      await footer.unmount()
    })
  }

  test('a pick made on Opus 5.5 is not applied to a Fable request', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"opus","effort":"low","why":"x"}')
    const sent: unknown[] = []
    on('turn.step', async function* (_$, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    for (const model of ['claude-opus-5-5', 'claude-fable-5-1']) {
      const stream = $.turn.step({ turnId: 't1', index: 0, model, effort: 'xhigh', messageCount: 1 })
      for await (const _ of stream) {
        // drain
      }
    }
    expect(sent).toEqual(['low', 'xhigh'])
  })
})

describe('footer', () => {
  test('auto sets the effort of the request, never runs /effort or /model', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'rename the function', wait: false, origin: { kind: 'composer' } })
    await step($, 'medium')

    expect(sent[0].effort).toBe('low')
    expect(ran).toEqual([])
  })

  test('a different model is only suggested, and /smarttokensaver switch switches it', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    expect(ran.some(c => c.startsWith('/model'))).toBe(false)
    await ui.redraw()
    expect(await ui.find({ key: 'accept' })).toBeDefined()

    await ui.press({ key: 'accept' })
    expect(ran).toContain('/model haiku')
    await ui.unmount()
  })

  test('Keep turns the suggestion down and it does not come back', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    await ui.redraw()
    await ui.press({ key: 'decline' })
    await $.prompt.submit({ text: 'hej igen', wait: false, origin: { kind: 'composer' } })
    await mocked.advance(10)
    await ui.redraw()

    expect(await ui.find({ key: 'accept' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('band', () => {
  for (const surface of ['terminal'] as const) {
    test(`clicking an effort turns auto off and is what the turn runs with (${surface})`, async ($, on) => {
      engine(on)
      const asked = judgeSays(on, '{"model":"haiku","effort":"low","why":"x"}')
      const sent = recordSteps(on)
      const ran = recordCommands(on)

      const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface, ...BAND })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Smart')

      await ui.press({ key: 'e-xhigh' })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Default')
      expect(ran).toEqual([])

      await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
      await step($, 'xhigh')

      expect(asked.length).toBe(0)
      expect(sent[0]).toEqual({ model: 'claude-opus-5-5', effort: 'xhigh' })

      await ui.press({ key: 'auto' })
      expect((await ui.find({ key: 'auto' }))?.text).toContain('Smart')
      await ui.unmount()
    })
  }
})

describe('review fixes', () => {
  test('a model switch that changes the engine effort is not read as you choosing, Auto stays on', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"sonnet","effort":"low","why":"simple"}')
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    await step($, 'xhigh')
    expect(sent[0].effort).toBe('low')

    // The person picks another model; the engine's own effort for it is different.
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5',
      to_model: 'claude-sonnet-5-5',
      requested_model: 'sonnet',
      source: 'picker',
      context_tokens: 0,
    } as never)
    await step($, 'medium')

    // Auto still decides: the request keeps the judged effort instead of the engine's 'medium'.
    expect(sent[1].effort).toBe('low')
  })

  test('/smarttokensaver switch switches to the suggested model and /smarttokensaver keep turns it down', async ($, on) => {
    engine(on)
    judgeSays(on, '{"model":"haiku","effort":"low","why":"simple"}')
    const ran = recordCommands(on)
    const mocked = mock.clock(on)
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await ui.press({ key: 'auto-model' })

    await $.prompt.submit({ text: 'hej', wait: false, origin: { kind: 'composer' } })
    const result = await $.command.run({ command: 'smarttokensaver', args: 'switch' })
    await mocked.advance(10)
    expect(String(result.text)).toContain('haiku')
    expect(ran).toContain('/model haiku')

    await $.prompt.submit({ text: 'a new question about something else', wait: false, origin: { kind: 'composer' } })
    const kept = await $.command.run({ command: 'smarttokensaver', args: 'keep' })
    expect(String(kept.text)).toContain('Keeping')
    await ui.unmount()
  })
})

describe('judge choice (plugin settings)', () => {
  const chat = (content: string) =>
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 20 } })

  test('readConfig: the defaults are the shipped defaults, values are trimmed, a saved judge or key is ignored', () => {
    expect(readConfig({ judge: 'jev', typesafeKey: 'k' })).not.toHaveProperty('judge')
    expect(readConfig({ judge: 'jev', typesafeKey: 'k' })).not.toHaveProperty('typesafeKey')
    expect(readConfig({})).toEqual({
      handoffSkill: '',
      handoffAfter: 'confirm',
      bias: 0,
      floor: 'low',
      ceiling: 'high',
      hide: ['reason'],
      swampAt: 0,
      layout: 'default',
      compactWith: 'auto',
      handoffButton: 'advised',
      modelAuto: 'off',
      helpers: 'off',
      theme: 'navy',
      appearance: 'auto',
      abControl: 0,
      measureLog: 'off',
      compactWindow: 300_000,
    })
    // "haiku" (Haiku always) is gone: a saved one reads as Auto.
    expect(readConfig({ compactWith: 'haiku' }).compactWith).toBe('auto')
    expect(readConfig({ compactWith: 'session' }).compactWith).toBe('session')
    expect(readConfig({ swampAt: '20' })).toMatchObject({ swampAt: 20 })
    expect(readConfig({ swampAt: '33' }).swampAt).toBe(0)
    expect(readConfig({ swampAt: 'auto' }).swampAt).toBe(0)
    expect(readConfig({ handoffSkill: '/session-handoff', handoffAfter: 'confirm' })).toMatchObject({
      handoffSkill: 'session-handoff',
      handoffAfter: 'confirm',
    })
  })

})

describe('context for the judge', () => {
  test("the assistant's last reply goes along, long and from its end, where its question sits", () => {
    const question = 'Which section should I build: A (simple), B (a complicated multi-step layout) or C?'
    const reply = 'x'.repeat(5000) + ' ' + question
    const text = contextFrom([
      { role: 'user', text: 'make me a new section' },
      { role: 'assistant', text: reply },
    ])
    expect(text).toContain(question)
    expect(text).toContain('user: make me a new section')
    expect(text.length).toBeLessThan(2500)
    expect(contextFrom([])).toBe('')
  })

  test("Haiku is handed the assistant's question and told how to judge an answer to it", async ($, on) => {
    mock.store(on)
    mock.env(on, {})
    mock.clock(on)
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('session.messages', () => ({
      value: [
        { role: 'user', text: 'make me a new section' },
        { role: 'assistant', text: 'Which one: A (simple) or B (a complicated multi-step layout)?' },
      ],
    }) as never)
    const seen: { system?: string; prompt: string }[] = []
    on('model.complete', (_$, e) => {
      seen.push({ system: e.system, prompt: e.prompt })
      return { value: { isAnswered: true as const, text: '{"model":"opus","effort":"high","why":"B is big"}', usage: USAGE } }
    })
    await $.prompt.submit({ text: 'B', wait: false, origin: { kind: 'composer' } })
    expect(seen[0].prompt).toContain('B (a complicated multi-step layout)')
    expect(seen[0].system).toContain('judge only the work that answer starts')
    expect(seen[0].system).toContain('should I archive this?')
  })
})

describe('model-aware effort', () => {
  test('the judge is told which model runs and that effort is relative to it', async ($, on) => {
    engine(on, {}, 'claude-sonnet-5-5')
    mock.clock(on)
    const seen: { system?: string; prompt: string }[] = []
    on('model.complete', (_$, e) => {
      seen.push({ system: e.system, prompt: e.prompt })
      return { value: { isAnswered: true as const, text: '{"model":"sonnet","effort":"high","why":"x"}', usage: USAGE } }
    })
    await $.prompt.submit({ text: 'refactor the parser', wait: false, origin: { kind: 'composer' } })
    expect(seen[0].prompt).toContain('Current: sonnet')
    expect(seen[0].system).toContain('Opus at medium does about what Sonnet does at high')
  })

})

describe('setup guide', () => {
  const DESK = { plugin: 'smarttokensaver', surface: 'desktop', ...BAND } as never
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }
  const settings = savedSets
  const toasts = (on: On) => {
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    return said
  }

  test('the choices are kept in the plugin\'s own store, never through /config (no reload line), and come back next session', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let configWrites = 0
    on('config.set', (_$, e) => {
      configWrites++
      return { value: e.value } as never
    })
    const said = toasts(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    // The welcome page first: Next only.
    await band.press({ key: 'setup-next' })
    await band.press({ key: 'setup-bias4' })
    for (let i = 0; i < 5 && !(await band.find({ key: 'setup-done' })); i++) await band.press({ key: 'setup-next' })
    await band.press({ key: 'setup-done' })
    await band.unmount()
    await mocked.advance(16_000)
    expect(said.join(' ')).not.toContain('could not save')
    expect(configWrites).toBe(0)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK)
    expect(await drawn(panel)).toContain('Smartest')
    await panel.unmount()
  })

  test('a setting saved in another open chat is taken over here within a few seconds, with no reload', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    await start($, on)
    const guide = await $.ui.mount(DESK)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    testStore.set('savedSettings', { effortBias: '2' })
    await mocked.advance(3500)
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK)
    expect(await drawn(panel)).toContain('Smartest')
    await panel.unmount()
  })

  test('the steps run intro, lean, window, look, done; the window step only where the model holds more than 300k', () => {
    expect(setupSteps(true)).toEqual(['intro', 'lean', 'window', 'look', 'done'])
    expect(setupSteps(false)).toEqual(['intro', 'lean', 'look', 'done'])
    expect(setupSteps(true, true)).toEqual(['intro', 'other', 'lean', 'window', 'look', 'done'])
    expect(setupNext('intro')).toBe('lean')
    expect(setupNext('intro', true, true)).toBe('other')
    expect(setupCounter('intro')).toBe('')
    expect(setupNext('lean')).toBe('window')
    expect(setupNext('window')).toBe('look')
    expect(setupNext('lean', false)).toBe('look')
    expect(setupNext('look')).toBe('done')
    expect(setupNext('done')).toBeNull()
    expect(setupBack('intro')).toBeNull()
    expect(setupBack('lean')).toBe('intro')
    expect(setupBack('look')).toBe('window')
    expect(setupBack('look', false)).toBe('lean')
    expect(setupBack('done')).toBe('look')
    expect(setupCounter('lean')).toBe('1/3')
    expect(setupCounter('window')).toBe('2/3')
    expect(setupCounter('look', false)).toBe('2/2')
    expect(setupCounter('look')).toBe('3/3')
    expect(setupCounter('done')).toBe('')
    expect(windowStepNeeded(1_000_000)).toBe(true)
    expect(windowStepNeeded(200_000)).toBe(false)
    expect(windowStepNeeded(undefined)).toBe(false)
  })

  test('opens by itself the first time; the choices are saved together at Done, which closes it for good', async ($, on) => {
    engine(on)
    mock.clock(on)
    // A model that holds no more than 300k: no window step.
    on('session.usage', () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 0 } } }) as never)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    // The welcome page first: Next only.
    await band.press({ key: 'setup-next' })
    // 1/2 the lean is the first question; Back returns to the welcome page.
    expect(await band.find({ key: 'setup-bias2' })).toBeDefined()
    expect(await band.find({ key: 'setup-back' })).toBeDefined()
    await clickable(band, 'setup-actions')
    // Branded: the name in the accent, the step counter beside it, the question, the stop explained in full, a guide link.
    expect(await drawn(band)).toContain(`"color":"${adaptHex('#a79cf7', 'text')}"`)
    expect(await drawn(band)).toContain('✦ Smart Token Saver setup  1/2')
    expect(await drawn(band)).toContain('How should Smart pick the effort?')
    expect(await drawn(band)).toContain('Balanced (recommended): ')
    expect(await drawn(band)).toContain('Effort is how long Claude thinks')
    // The guide is a button top right in the setup's header.
    expect(await band.find({ key: 'setup-guide' })).toBeDefined()
    // The right side: a still SVG (every click redraws the band, and a redrawn animation flickers) with the gradient.
    const first = await drawn(band)
    expect(first).toContain('"type":"Svg"')
    expect(first).not.toContain('"isInteractive":true')
    expect(first).toContain('url(#dots)')
    await band.press({ key: 'setup-bias4' })
    expect(await drawn(band)).toContain('Smartest: ')
    expect(await drawn(band)).toContain(`{"color":"${adaptHex('#a79cf7', 'text')}"},"children":["──"]`)
    // Nothing is saved yet: each saved setting reloads the plugin and puts a notice in the chat.
    expect(set).toEqual([])
    await band.press({ key: 'setup-next' })

    // The look: automatic, dark or light, said in full. Light is picked here. (No window step: the model holds no more
    // than 300k. No handoff step: the built-in one is the default and Settings has the choice.)
    expect(await drawn(band)).toContain('2/2')
    expect(await drawn(band)).toContain('Light or dark panels?')
    expect(await drawn(band)).toContain('◉ Automatic')
    expect(await drawn(band)).toContain("take the app's own colours")
    await band.press({ key: 'setup-look-light' })
    expect(await drawn(band)).toContain('◉ Always light')
    await band.press({ key: 'setup-back' })
    expect(await drawn(band)).toContain('1/2')
    await band.press({ key: 'setup-next' })
    expect(set).toEqual([])
    // Finish saves, then the done step says what is in force, in green with a check, and only closes.
    await band.press({ key: 'setup-next' })
    expect(set).toEqual([
      { key: 'smarttokensaver.effortBias', value: '2' },
      { key: 'smarttokensaver.appearance', value: 'light' },
    ])
    expect(await drawn(band)).toContain('Setup complete')
    expect(await drawn(band)).toContain('Changed your mind? Click ⚙ under the prompt')
    expect(await band.find({ key: 'setup-back' })).toBeUndefined()
    await band.press({ key: 'setup-done' })
    await band.unmount()
    await drawsNothing($, DESK)

    // A new session: the guide stays closed; /smarttokensaver setup opens it again on the welcome page.
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await drawsNothing($, DESK)
    await $.command.run({ command: 'smarttokensaver', args: 'setup' })
    const again = await $.ui.mount(DESK)
    await again.press({ key: 'setup-next' })
    expect(await again.find({ key: 'setup-bias2' })).toBeDefined()
    await again.unmount()
  })

  test('another chat that went through the guide closes it here, without saving this chat\'s picks', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const chat = { id: 'chat-a' }
    on('session.id', () => ({ value: chat.id }) as never)
    on('session.usage', () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 0 } } }) as never)
    const set = settings(on)
    await start($, on)
    const band = await $.ui.mount(DESK)
    // The welcome page first: Next only.
    await band.press({ key: 'setup-next' })
    // Chat A moves through the guide: it owns it, and it counts as done.
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('Light or dark panels?')
    await band.unmount()
    // Seen from another chat that still shows its own copy: it closes, and nothing of it is saved.
    chat.id = 'chat-b'
    await mocked.advance(4000)
    const other = await $.ui.mount(DESK)
    await other.unmount()
    await mocked.advance(10)
    const again = await $.ui.mount(DESK)
    expect(await again.find({ key: 'setup-look-auto' })).toBeUndefined()
    expect(set).toEqual([])
    await again.unmount()
  })

  test('the window step shows where the model holds more than 300k, and its pick is saved at Done', async ($, on) => {
    engine(on, {}, 'claude-opus-5-5[1m]')
    mock.clock(on)
    const set = settings(on)
    on('session.usage', () => ({ value: { context: { window: 1_000_000, tokens: 20_000, breakdown: { rawMaxTokens: 1_000_000, isAutoCompactEnabled: true, autocompactSource: 'default' } } } }) as never)
    await start($, on)
    const band = await $.ui.mount(DESK)
    // The welcome page first: Next only.
    await band.press({ key: 'setup-next' })
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('When should a chat be compacted?')
    expect(await drawn(band)).toContain('300k (recommended)')
    await band.press({ key: 'setup-window-default' })
    expect(await drawn(band)).toContain("Claude Code default: no size set, compacts near the full window (1M)")
    await band.press({ key: 'setup-window-400000' })
    expect(await drawn(band)).toContain('◉ 400k')
    // Own…: a typed size, checked against the model's window.
    await band.press({ key: 'setup-window-own-open' })
    expect(await drawn(band)).toContain('Individual: type a size')
    await band.input({ key: 'setup-window-input', text: '250k' })
    expect(await drawn(band)).toContain('Picked: 250k.')
    for (let i = 0; i < 8 && !(await band.find({ key: 'setup-done' })); i++) {
      if (await band.find({ key: 'setup-window-apply' })) await band.press({ key: 'setup-window-apply' })
      // Where the file could not be written, Next waits for the request to go to a new chat.
      if (await band.find({ key: 'setup-window-newchat' })) await band.press({ key: 'setup-window-newchat' })
      await band.press({ key: 'setup-next' })
    }
    expect(set).toContainEqual({ key: 'smarttokensaver.compactWindow', value: '250000' })
    await band.press({ key: 'setup-done' })
    await band.unmount()
  })

})

describe('judge benchmark', () => {
  const c = (id: string, ok: ('low' | 'medium' | 'high')[], message = 'do a thing please') =>
    ({ id, kind: 'k', current: { model: 'sonnet', effort: 'medium' }, message, ok }) as never

  test('grades an answer as right, too low, too high or missing', () => {
    expect(benchGrade(c('a', ['medium', 'high']), 'high')).toBe('hit')
    expect(benchGrade(c('a', ['medium', 'high']), 'low')).toBe('under')
    expect(benchGrade(c('a', ['low']), 'xhigh')).toBe('over')
    expect(benchGrade(c('a', ['low']), undefined)).toBe('none')
  })

  test('the report counts per judge and lists the misses', () => {
    const cases = [c('a', ['low']), c('b', ['high'])]
    const report = benchReport(cases, [
      { id: 'a', judge: 'haiku', effort: 'low', ms: 300, tokens: 10 },
      { id: 'b', judge: 'haiku', effort: 'medium', ms: 500, tokens: 10 },
    ])
    expect(report).toContain('| haiku | 50% | 1 | 0 | 0 | 500 |')
    expect(report).toContain('haiku b: said medium, wanted high')
  })

  test('/smarttokensaver bench runs every case through Haiku, keeps follow-ups, and writes the report', async ($, on) => {
    engine(on)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"low","why":"x"}')
    const cases = { cases: [c('a', ['low'], 'rename foo to bar in utils.ts'), c('f', ['medium'], 'go')] }
    on('fs.read', (_$, e) => ({ value: String(e.path).endsWith('judge-cases.json') ? JSON.stringify(cases) : '' }) as never)
    const written: Record<string, string> = {}
    on('fs.write', (_$, e) => {
      written[String(e.path)] = String(e.text)
      return { value: undefined } as never
    })
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const res = await $.command.run({ command: 'smarttokensaver', args: 'bench' })
    expect(asked.length).toBe(1)
    expect(res.text).toContain('| haiku | 100% |')
    expect(res.text).toContain('| always medium |')
    expect(Object.keys(written).some(p => p.endsWith('.md'))).toBe(true)
  })
})

describe('short answers to a question', () => {
  test('a short reply after a question goes to the judge; between two steps it keeps the effort', () => {
    const asked = 'user: tidy up\nassistant: Done. Should I archive it?'
    const told = 'user: add export\nassistant: Added the button. Next I wire it up.'
    expect(endsOnQuestion(asked)).toBe(true)
    expect(endsOnQuestion(told)).toBe(false)
    expect(endsOnQuestion('')).toBe(false)
    expect(keepsEffort('yes', asked)).toBe(false)
    expect(keepsEffort('go', told)).toBe(true)
    expect(keepsEffort('build the whole thing', told)).toBe(false)
  })

  test('"yes" to "should I archive it?" is judged, not kept', async ($, on) => {
    const said: { role: string; text: string }[] = []
    engine(on, {}, 'claude-sonnet-5-5', said)
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"high","why":"x"}')
    await $.prompt.submit({ text: 'refactor the sync engine end to end', wait: false, origin: { kind: 'composer' } })
    said.push({ role: 'assistant', text: 'Done. Should I archive the old branch?' })
    await $.prompt.submit({ text: 'yes', wait: false, origin: { kind: 'composer' } })
    expect(asked.length).toBe(2)
  })

})

describe('images', () => {
  test('the judge is told what the message carries', () => {
    expect(withAttachments('fix this', [{ type: 'image' }, { type: 'image' }])).toContain('[The message comes with 2 images to look at.]')
    expect(withAttachments('fix this')).toBe('fix this')
  })

  test('"fix this" with a screenshot is judged, not kept as a follow-up', async ($, on) => {
    engine(on, {}, 'claude-sonnet-5-5')
    mock.clock(on)
    const asked = judgeSays(on, '{"model":"sonnet","effort":"medium","why":"x"}')
    await $.prompt.submit({ text: 'refactor the sync engine end to end', wait: false, origin: { kind: 'composer' } })
    await $.prompt.submit({ text: 'fix this', wait: false, origin: { kind: 'composer' }, attachments: [{ type: 'image', mediaType: 'image/png' }] } as never)
    expect(asked.length).toBe(2)
    expect(asked[1]).toContain('1 image')
  })
})

describe('compaction by Haiku', () => {
  const SUMMARY = '1. Primary request: rename userId across the app. ' + 'Details. '.repeat(40)
  const said = [
    { role: 'user', text: 'rename this variable to userId', toolUses: [] },
    { role: 'assistant', text: 'Renamed in 4 files.', toolUses: [{ tool_use_id: 't1', tool: 'Edit', input: { file_path: 'a.ts' }, text: 'x'.repeat(5000) }] },
  ]
  /** Claude Code's own compaction beneath the mod, and whether it ran. */
  /** Settings that read fine and name no PreCompact hook: nothing beneath can veto, so Haiku may write. */
  const settingsOk = (on: On) => on('settings.read', () => ({ value: {} }) as never)
  const core = (on: On) => {
    const ran = { core: 0 }
    on('session.compact', (_$, e) => {
      ran.core++
      return { messages: [{ role: 'user', text: 'core summary', toolUses: [] }] } as never
    })
    return ran
  }

  test('the last messages reach Haiku nearly whole: the code just written is not cut to 400 characters', () => {
    const code = 'x'.repeat(5000)
    const old = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i}`, toolUses: [{ tool: 'Edit', input: { new_string: code }, text: code }] }))
    const text = compactTranscript(old as never)
    // The first message is cut; the last COMPACT_TAIL (12) come whole.
    expect(COMPACT_TAIL).toBe(12)
    expect(text.split('turn 0')[1].split('turn 1')[0]).toContain('more characters')
    expect(text.split('turn 8')[1]).not.toContain('more characters')
    expect(text.split('turn 7')[1].split('turn 8')[0]).toContain('more characters')
  })

  test('the transcript names each tool call and cuts long results', () => {
    // Two messages are all tail; with the tail held to the same 2000 the cut shows.
    const text = compactTranscript(said as never, 2000, 2000)
    expect(text).toContain('USER: rename this variable to userId')
    expect(text).toContain('[Edit {"file_path":"a.ts"}]')
    expect(text).toContain('[3000 more characters]')
  })

  test('Haiku 5.5 writes the summary, with the note typed after /compact; Claude Code does not compact', async ($, on) => {
    engine(on, {}, 'claude-opus-5-5', said as never)
    settingsOk(on)
    // No cache read yet counts as cold: Auto lets Haiku write it.
    mock.clock(on)
    const ran = core(on)
    const asked: { model: string; prompt: string }[] = []
    on('model.complete', (_$, e) => {
      asked.push({ model: e.model, prompt: e.prompt })
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    const out = (await $.session.compact({ instructions: 'keep the API decisions' })) as { messages?: { text: string }[] }
    expect(ran.core).toBe(0)
    expect(asked[0].model).toBe('claude-haiku-5-5')
    expect(asked[0].prompt).toContain('keep the API decisions')
    expect(out.messages?.[0].text).toContain('rename userId across the app')
  })

  test('when Haiku fails, Claude Code compacts as usual and a toast says why', async ($, on) => {
    engine(on)
    settingsOk(on)
    mock.clock(on)
    const ran = core(on)
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? JSON.stringify(e)))
      return { value: undefined } as never
    })
    on('model.complete', () => ({ value: { isAnswered: false as const, reason: 'api-error', status: 500 } }) as never)
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(toasts.join(' ')).toContain("Haiku 5.5 could not write the summary (api-error")
    expect(toasts.join(' ')).toContain("The chat's model writes it.")
  })

  test('warm on Opus, then a switch to a model the chat has not run on: /compact counts as cold and Haiku writes it', async ($, on) => {
    const now = { model: 'claude-opus-5-5' }
    mock.store(on)
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1' })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: said }) as never)
    on('session.model', () => ({ value: now.model }))
    on('command.list', () => ({ value: [] as never }))
    settingsOk(on)
    mock.clock(on)
    on('turn.step', async function* (_$, e) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { ...USAGE, cache_read_input_tokens: 900, cache_creation: { ephemeral_1h_input_tokens: 50 } } } as never
    })
    const ran = core(on)
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(e.model)
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    await openChat($, on)
    // A reply on Opus: its cache is warm for the hour.
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })) {
      // drain
    }
    // Warm on Opus: Claude Code's own compaction reads the cache.
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(asked).toEqual([])
    // Switched to Sonnet before any reply: Sonnet's cache for this chat is cold.
    now.model = 'claude-sonnet-5-5'
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(asked).toEqual(['claude-haiku-5-5'])
  })

  test('a PreCompact hook in the settings can veto a compaction: then Claude Code compacts (and the hook runs), not Haiku', async ($, on) => {
    engine(on, {}, 'claude-opus-5-5', said as never)
    mock.clock(on)
    on('settings.read', () => ({ value: { hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'check' }] }] } } }) as never)
    const ran = core(on)
    let asked = 0
    on('model.complete', () => {
      asked++
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(asked).toBe(0)
    expect(hasPreCompactHooks({ hooks: { PreCompact: [] } })).toBe(false)
    expect(hasPreCompactHooks({})).toBe(false)
  })

  test('a PreCompact hook in an enabled plugin\'s hooks.json: Claude Code compacts, and its veto stands', async ($, on) => {
    engine(on, { HOME: '/home/t' }, 'claude-opus-5-5', said as never)
    mock.clock(on)
    on('settings.read', () => ({ value: { enabledPlugins: { 'guard@corp': true, 'other@corp': false } } }) as never)
    on('fs.read', (_$, e) => {
      const path = String(e.path)
      if (path.endsWith('plugins/installed_plugins.json'))
        return { value: JSON.stringify({ version: 2, plugins: { 'guard@corp': [{ scope: 'user', installPath: '/p/guard' }], 'other@corp': [{ scope: 'user', installPath: '/p/other' }] } }) } as never
      if (path === '/p/guard/hooks/hooks.json') return { value: JSON.stringify({ hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'audit' }] }] } }) } as never
      return { value: '' } as never
    })
    // The veto, as Claude Code answers when the classic PreCompact hook blocks.
    on('session.compact', () => ({ skip: 'PreCompact: kept for the audit' }) as never)
    let asked = 0
    on('model.complete', () => {
      asked++
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    const out = (await $.session.compact({})) as { skip?: string; messages?: unknown[] }
    expect(asked).toBe(0)
    expect(out.skip).toBe('PreCompact: kept for the audit')
    expect(out.messages).toBeUndefined()
  })

  /** One enabled plugin, as the files say it is installed; Haiku and Claude Code's own compaction counted. */
  const withPlugin = (on: On, files: Record<string, string>) => {
    engine(on, { HOME: '/home/t' }, 'claude-opus-5-5', said as never)
    mock.clock(on)
    on('settings.read', () => ({ value: { enabledPlugins: { 'guard@corp': true } } }) as never)
    on('fs.read', (_$, e) => {
      const path = String(e.path)
      const hit = Object.keys(files).find(f => path === f || (f.startsWith('*') && path.endsWith(f.slice(1))))
      return { value: hit ? files[hit] : '' } as never
    })
    const ran = core(on)
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(e.model)
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    return { ran, asked }
  }
  const RECORD = JSON.stringify({ version: 2, plugins: { 'guard@corp': [{ scope: 'user', installPath: '/p/guard' }] } })

  test('an enabled plugin that reads clean (a manifest, no PreCompact anywhere) leaves the summary to Haiku', async ($, on) => {
    const w = withPlugin(on, {
      '*plugins/installed_plugins.json': RECORD,
      '/p/guard/hooks/hooks.json': JSON.stringify({ modules: ['./register.ts'] }),
      '/p/guard/hooks/register.ts': "export const register = on => { on('tool.call', ($, e, next) => next(e)) }",
      '/p/guard/.claude-plugin/plugin.json': JSON.stringify({ name: 'guard' }),
    })
    await $.session.compact({})
    expect(w.asked).toEqual(['claude-haiku-5-5'])
    expect(w.ran.core).toBe(0)
  })

  test('an enabled plugin with no install record (a stale entry) is left out: Claude Code loads none, so Haiku writes', async ($, on) => {
    const w = withPlugin(on, { '*plugins/installed_plugins.json': JSON.stringify({ version: 2, plugins: {} }) })
    await $.session.compact({})
    expect(w.asked).toEqual(['claude-haiku-5-5'])
    expect(w.ran.core).toBe(0)
  })

  test('a plugin without a readable manifest, or with a hooks module that names PreCompact, counts as a possible veto', async ($, on) => {
    const w = withPlugin(on, {
      '*plugins/installed_plugins.json': RECORD,
      '/p/guard/hooks/hooks.json': JSON.stringify({ modules: ['./register.ts'] }),
      '/p/guard/hooks/register.ts': "export const register = on => { on('classic.PreCompact', ($, e, next) => next(e)) }",
      '/p/guard/.claude-plugin/plugin.json': JSON.stringify({ name: 'guard' }),
    })
    await $.session.compact({})
    expect(w.asked).toEqual([])
    expect(w.ran.core).toBe(1)
  })

  test('settings that cannot be read count as a possible veto: Claude Code compacts, not Haiku', async ($, on) => {
    engine(on, {}, 'claude-opus-5-5', said as never)
    mock.clock(on)
    on('settings.read', () => ({ deny: 'settings are not readable here' }) as never)
    const ran = core(on)
    let asked = 0
    on('model.complete', () => {
      asked++
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(asked).toBe(0)
    expect(hooksFileHasPreCompact('{ "modules": ["./register.tsx"] }')).toBe(false)
    expect(hooksFileHasPreCompact('{ "hooks": { "PreCompact": [{}] } }')).toBe(true)
    expect(hooksFileHasPreCompact('{ "PreCompact": [{}] }')).toBe(true)
    expect(hooksFileHasPreCompact('{ not json, PreCompact }')).toBe(true)
    expect(hooksFileHasPreCompact('')).toBe(false)
  })

  test('a model on the 1-hour cache stays warm for the hour when a reply writes only a 5-minute tail', () => {
    const tail = { input_tokens: 10, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 500 } }
    expect(nextWarmTtl('1h', tail)).toBe('1h')
    // Mostly written anew: the 5-minute lifetime is what holds.
    expect(nextWarmTtl('1h', { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 90_000, cache_creation: { ephemeral_5m_input_tokens: 90_000 } })).toBe('5m')
    expect(nextWarmTtl(undefined, { cache_creation: { ephemeral_1h_input_tokens: 5 } })).toBe('1h')
    expect(nextWarmTtl(undefined, {})).toBe('5m')
  })

  test('a precompute counts only when Claude Code took it, for the same transcript, and with no note after /compact', () => {
    const a = [{ role: 'user', text: 'one', handle: 'h1' }, { role: 'assistant', text: 'two', handle: 'h2' }]
    expect(transcriptPrint(a)).toBe('2|h:h1|h:h2')
    // Same length, other messages: another fingerprint.
    expect(transcriptPrint([{ role: 'user', text: 'one', handle: 'h1' }, { role: 'assistant', text: 'three', handle: 'h3' }])).not.toBe(transcriptPrint(a))
    expect(transcriptPrint([{ role: 'user', text: 'x' }])).toBe('1|user:x')
    expect(transcriptPrint([])).toBeNull()
  })

  test('the size cap counts the prompt and instructions too, and stays near 400k tokens for dense text', () => {
    expect(COMPACT_MAX_CHARS).toBe(1_200_000)
    const big = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `m${i}`, toolUses: [{ tool: 'Read', input: {}, text: 'y'.repeat(150_000) }] }))
    const loose = fitTranscript(big) ?? ''
    const tight = fitTranscript(big, 1_000_000) ?? ''
    expect(loose.length).toBeLessThanOrEqual(COMPACT_MAX_CHARS)
    expect(tight.length + 1_000_000).toBeLessThanOrEqual(COMPACT_MAX_CHARS)
    expect(tight.length).toBeLessThan(loose.length)
  })

  test("set to the chat's model, Claude Code compacts and Haiku is never asked", { options: { compactWith: 'session' } } as never, async ($, on) => {
    engine(on)
    const ran = core(on)
    let asked = 0
    on('model.complete', () => {
      asked++
      return { value: { isAnswered: true as const, text: SUMMARY, usage: USAGE } }
    })
    await $.session.compact({})
    expect(ran.core).toBe(1)
    expect(asked).toBe(0)
  })
})

describe('cold band', () => {
  test('shows above the prompt when the cache is cold, compacts in one click, and hides until the next cold', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('session.compact', () => ({ value: { messages: [] } }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const DESK = { plugin: 'smarttokensaver', surface: 'desktop', ...BAND } as never
    const guide = await $.ui.mount(DESK)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'cold' })
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Chat went cold')
    expect(await drawn(band)).toContain('class=\\"f\\"')
    await band.press({ key: 'cold-hide' })
    await band.unmount()
    await drawsNothing($, DESK)
  })
})

describe('handoff', () => {
  test('the first message carries the handoff and what to do next', () => {
    expect(handoffMessage(' the plan ', 'continue')).toBe(
      'Handoff from the previous chat:\n\nthe plan\n\nContinue with the next step. If it is marked "needs user", say what you need and wait.',
    )
    expect(handoffMessage('x', 'confirm')).toContain('then wait for me')
    // Full: the skill saved the handoff; its last words may only say so. The new chat reads what it saved first.
    const full = handoffMessage("I've saved the handoff.", 'continue', 'session-handoff')
    expect(full).toContain('it ran /session-handoff')
    expect(full).toContain('First read the handoff /session-handoff saved')
    expect(full).toContain('HANDOFF.md')
    expect(full).toContain('Continue with the next step')
  })

  test('the prompt asks for checked work, marked user steps and git as of last check', () => {
    expect(HANDOFF_PROMPT).toContain('needs user')
    expect(HANDOFF_PROMPT).toContain('as of last check')
    expect(HANDOFF_PROMPT).toContain('Never present something planned, skipped or untested as done')
    expect(HANDOFF_PROMPT).toContain('Do not use tools')
  })

  /** Presses ⇥ in the footer, makes the choices in the handoff bar, and presses Go. */
  async function handOff($: Engine, footer: { press: (at: { key: string }) => Promise<unknown> }, keys: string[] = [], after?: string) {
    await openHandoff($, footer)
    const bar = await $.ui.mount(DESK_BAND)
    for (const key of keys) await bar.press({ key })
    if (after) await bar.select({ key: 'handoff-after', value: after })
    await bar.press({ key: 'handoff-go' })
    await bar.unmount()
  }

  function handoffEngine(on: On, said: { role: string; text: string }[] = []) {
    mock.store(on)
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: said }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const forked: string[] = []
    on('model.fork', (_$, e) => {
      forked.push(e.prompt)
      return { value: { isAnswered: true, text: 'Goal: quick.', usage: USAGE } } as never
    })
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    return { forked, ran, submitted }
  }

  test('⇥ opens the handoff bar; it says what happens and starts nothing until Go', async ($, on) => {
    const { forked } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await openHandoff($, footer)
    const bar = await $.ui.mount(DESK_BAND)
    // Its buttons lie over the art and take the clicks.
    await clickable(bar, 'handoff-row', 'relative')
    expect(await drawn(bar)).toContain('Handoff')
    // A few dim words say what the picked kind is; a line under the controls says what the picked way on does.
    expect(await drawn(bar)).toContain('In seconds.')
    expect(await drawn(bar)).toContain(handoffAfterNote((await bar.find({ key: 'handoff-after' }))?.props.value as never))
    expect(await drawn(bar)).not.toContain('Quick: written from this chat')
    expect(await drawn(bar)).toContain('Compact instead')
    await bar.select({ key: 'handoff-after', value: 'copy' })
    expect(await drawn(bar)).toContain('"value":"copy"')
    expect(await drawn(bar)).toContain('Copies the note. This chat stays as it is.')
    // A plain panel lies on the shared wash (the orange fade and the dots), drawn by its shell.
    expect(await drawn(bar)).toContain('slot-wash')
    expect(await drawn(bar)).not.toContain('Then it is copied')
    await mocked.advance(2500)
    expect(forked).toEqual([])
    await bar.press({ key: 'handoff-close' })
    await bar.unmount()
    const after = await $.ui.mount(DESK_BAND)
    expect(await after.find({ key: 'handoff-go' })).toBeUndefined()
    await after.unmount()
    await footer.unmount()
  })

  test('on a cold cache, Quick is written by Haiku from the transcript, not a fork that rereads the chat', async ($, on) => {
    const { forked, submitted } = handoffEngine(on, [{ role: 'user', text: 'build the thing' }, { role: 'assistant', text: 'built it' }])
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(String(e.model))
      return { value: { isAnswered: true as const, text: `Goal: from Haiku. ${'x'.repeat(120)}`, usage: USAGE } }
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await $.command.run({ command: 'smarttokensaver', args: 'cold' })
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, ['handoff-quick'])
    await mocked.advance(2500)
    expect(forked).toEqual([])
    expect(asked.some(m => m.includes('haiku'))).toBe(true)
    expect(submitted.some(t => t.includes('Goal: from Haiku'))).toBe(true)
    await footer.unmount()
  })

  test('hotVisible: Skip for now comes back 5 points later, Skip until reset not in that window', () => {
    const heat = { kind: 'five_hour', percent: 82, resetsAt: '2026-10-10T20:00:00Z' }
    expect(hotVisible(heat, null)).toBe(true)
    const closed = { window: 'five_hour ' + Math.round(new Date(heat.resetsAt).getTime() / 900_000), percent: 82 }
    expect(hotVisible({ ...heat, percent: 86 }, closed)).toBe(false)
    expect(hotVisible({ ...heat, percent: 87 }, closed)).toBe(true)
    expect(hotVisible({ ...heat, percent: 99 }, { ...closed, untilReset: true })).toBe(false)
    expect(hotVisible({ ...heat, resetsAt: '2026-10-11T01:00:00Z' }, closed)).toBe(true)
    expect(hotVisible({ ...heat, resetsAt: '2026-10-11T01:00:00Z' }, { ...closed, untilReset: true })).toBe(true)
  })

  test('with a skill set, Quick forks and Full runs the skill', { options: { handoffSkill: 'session-handoff' } } as never, async ($, on) => {
    const { forked, ran, submitted } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, ['handoff-quick'])
    await mocked.advance(2500)
    expect(forked).toEqual([HANDOFF_PROMPT])
    expect(ran).not.toContain('session-handoff')
    expect(ran).toContain('clear')
    await handOff($, footer, ['handoff-full'])
    await mocked.advance(1000)
    expect(ran).toContain('session-handoff')
    expect(forked).toHaveLength(1)
    // The skill's last words only say it saved the handoff: the new chat is told to read what it saved.
    await $.turn.complete({ turnId: 't2', answer: "I've saved the handoff.", durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(2500)
    expect(submitted.at(-1)).toContain('First read the handoff /session-handoff saved')
    await footer.unmount()
  })

  test('the bar opens on the choice made last', { options: { handoffSkill: 'session-handoff' } } as never, async ($, on) => {
    handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, ['handoff-full'], 'confirm')
    await mocked.advance(1000)
    await $.turn.complete({ turnId: 't1', answer: 'Goal: full.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(1500)
    await openHandoff($, footer)
    const bar = await $.ui.mount(DESK_BAND)
    expect(await drawn(bar)).toContain('Runs /session-handoff.')
    expect(await drawn(bar)).toContain('"value":"confirm"')
    await bar.unmount()
    await footer.unmount()
  })

  test("without a skill, Full is Smart Token Saver's own: a turn that checks git and saves HANDOFF.md, no fork", async ($, on) => {
    const { forked, submitted } = handoffEngine(on)
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await openHandoff($, footer)
    const bar = await $.ui.mount(DESK_BAND)
    await bar.press({ key: 'handoff-full' })
    expect(await drawn(bar)).toContain('Takes a turn.')
    await bar.press({ key: 'handoff-go' })
    await mocked.advance(2500)
    expect(forked).toEqual([])
    expect(submitted.some(t => t.includes('Rewrite HANDOFF.md'))).toBe(true)
    await bar.unmount()
    await footer.unmount()
  })

  test('Keep chat & copy copies the handoff and clears nothing', async ($, on) => {
    const { ran, submitted } = handoffEngine(on)
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'copy')
    await mocked.advance(2500)
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('Goal: quick.')
    expect(copied[0]).toContain('Continue with the next step.')
    expect(ran).not.toContain('clear')
    expect(submitted).toEqual([])
    await footer.unmount()
  })

  test('a handoff card shows above the prompt, not under the reply: handing off, then landed, gone after the next message', async ($, on) => {
    handoffEngine(on)
    on('ui.copy', () => ({ value: { isCopied: true } }) as never)
    on('ui.render', { component: 'AssistantMessage' }, (h, e) => {
      const { Text } = h.ui.resolve(e)
      return Text({ children: e.props.text } as never) as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const reply = (text: string) =>
      ({ plugin: 'smarttokensaver', surface: 'desktop', component: 'AssistantMessage', props: { text, isFirstOfReply: true } }) as never
    await $.turn.complete({ turnId: 't1', answer: 'Last reply.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const footer = await $.ui.mount(FOOTER)
    await openHandoff($, footer)
    const bar = await $.ui.mount(DESK_BAND)
    await bar.select({ key: 'handoff-after', value: 'copy' })
    await bar.press({ key: 'handoff-go' })
    await bar.unmount()
    // The first-run guide comes before the card: closed here.
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    const under = await $.ui.mount(reply('Last reply.'))
    expect(await under.find({ key: 'reply-handoff' })).toBeUndefined()
    await under.unmount()
    const during = await $.ui.mount(DESK_BAND)
    expect(await drawn(during)).toContain('Handing off')
    await during.unmount()
    await mocked.advance(2500)
    const landed = await $.ui.mount(DESK_BAND)
    expect(await drawn(landed)).toContain('Handoff copied')
    expect(await landed.find({ key: 'card-close' })).toBeDefined()
    await landed.unmount()
    await $.prompt.submit({ text: 'next', wait: false, origin: { kind: 'composer' } })
    await $.turn.complete({ turnId: 't2', answer: 'Next reply.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    // The card is gone: the band draws whatever else it has, or nothing.
    const after = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(after ? await after.find({ key: 'reply-handoff' }) : undefined).toBeUndefined()
    await after?.unmount()
    await footer.unmount()
  })

  test('if the clipboard refuses, the handoff goes in the prompt box', async ($, on) => {
    const { ran } = handoffEngine(on)
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'no clipboard' } }) as never)
    on('ui.toast', () => ({ value: undefined }) as never)
    on('prompt.read', () => ({ value: { text: '' } }) as never)
    const filled: string[] = []
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'copy')
    await mocked.advance(2500)
    expect(filled.join('')).toContain('Goal: quick.')
    expect(ran).not.toContain('clear')
    await footer.unmount()
  })

  test('the clipboard refuses and the prompt box holds a draft: the draft stays, and /smarttokensaver handoff note shows the handoff', async ($, on) => {
    const { ran } = handoffEngine(on)
    on('ui.copy', () => ({ value: { isCopied: false, reason: 'no clipboard' } }) as never)
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: unknown }).text ?? ''))
      return { value: undefined } as never
    })
    on('prompt.read', () => ({ value: { text: 'half a thought of my own' } }) as never)
    const filled: string[] = []
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer, [], 'copy')
    await mocked.advance(2500)
    expect(filled).toEqual([])
    expect(ran).not.toContain('clear')
    expect(toasts.join(' ')).toContain('/smarttokensaver handoff note')
    const note = await $.command.run({ command: 'smarttokensaver', args: 'handoff note' } as never)
    expect(JSON.stringify(note)).toContain('Goal: quick.')
    await footer.unmount()
  })

  test('the handoff is written by a fork: no turn in the chat, then cleared and sent', async ($, on) => {
    mock.store(on)
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const forked: string[] = []
    on('model.fork', (_$, e) => {
      forked.push(e.prompt)
      return { value: { isAnswered: true, text: 'Goal: fork it. Next: ship.', usage: USAGE } } as never
    })
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(forked).toEqual([HANDOFF_PROMPT])
    expect(submitted).not.toContain(HANDOFF_PROMPT)
    await mocked.advance(1500)
    expect(ran).toContain('clear')
    expect(submitted.at(-1)).toContain('Goal: fork it. Next: ship.')
    await footer.unmount()
  })

  test('without a fork (no reply yet, or it failed) the handoff is written as a turn, then cleared and sent', { options: { handoffAfter: 'continue' } } as never, async ($, on) => {
    // engine() without its prompt.submit, so this test can see what the mod sends.
    mock.store(on)
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    const ran: string[] = []
    on('command.run', (_$, e) => {
      ran.push(e.command)
      return { text: 'ok' }
    })
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(submitted.at(-1)).toBe(HANDOFF_PROMPT)
    await $.turn.complete({ turnId: 't9', answer: 'Goal: ship it. Next: tests.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    await mocked.advance(1500)
    expect(ran).toContain('clear')
    expect(submitted.at(-1)).toContain('Goal: ship it. Next: tests.')
    expect(submitted.at(-1)).toContain('Continue with the next step.')
    await footer.unmount()
  })

  test('a fork that writes nothing says why: in a toast and in /smarttokensaver debug, and the turn takes over', async ($, on) => {
    mock.store(on)
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1' })
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [{ name: 'model' }, { name: 'effort' }] as never }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('model.fork', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE } }) as never)
    on('command.run', () => ({ text: 'ok' }))
    const submitted: string[] = []
    on('prompt.submit', (_$, e) => {
      submitted.push(e.text)
      return { text: e.text }
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    const mocked = mock.clock(on)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const footer = await $.ui.mount(FOOTER)
    await handOff($, footer)
    await mocked.advance(1000)
    expect(submitted.at(-1)).toBe(HANDOFF_PROMPT)
    expect(toasts.join(' ')).toContain('api-error 529 overloaded')
    const debug = String((await $.command.run({ command: 'smarttokensaver', args: 'debug' })).text)
    expect(debug).toContain('last fork: api-error 529 overloaded')
    await footer.unmount()
  })

  test('the fork outcome names the reason, or what an answer cost', () => {
    expect(forkOutcome({ isAnswered: false, reason: 'nothing-to-fork' }, 0)).toBe('nothing-to-fork (0.0s)')
    expect(forkOutcome({ isAnswered: false, reason: 'aborted', usage: USAGE }, 2500)).toBe('aborted (2.5s)')
    expect(forkOutcome({ isAnswered: false, reason: 'api-error', status: null, error: 'unknown', usage: USAGE }, 0)).toBe('api-error no response unknown (0.0s)')
    expect(forkOutcome(new Error('refused from a timer'), 100)).toBe('threw: refused from a timer (0.1s)')
    const usage = { input_tokens: 10, output_tokens: 700, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 }
    expect(forkOutcome({ isAnswered: true, text: 'Goal', usage }, 4000)).toBe('answered, 700 out, 90% cached (4.0s)')
    expect(forkOutcome({ isAnswered: true, text: '  ', usage }, 0)).toBe('answered with blank text (0.0s)')
  })
})

describe('swamp band and setup entry', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('the swamp band waits for the threshold set: 21% of a 1M window is not swamped at the default 70%', { options: { compactWindow: 'default' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 208_000, window: 1_000_000, percent: 21 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    // Nothing to draw above the prompt: the engine has no band to mount.
    const band = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(band ? await drawn(band) : '').not.toContain('Chat window is getting swamped')
    await band?.unmount()
  })

  test('at a 20% threshold the same chat is swamped', { options: { swampAt: '20' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 208_000, window: 1_000_000, percent: 21 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat window is getting swamped')
    await band.unmount()
  })

  test('a swamped context shows Compact and Handoff above the prompt; closing hides it until the context grows', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    // Auto: at a 250k window (trigger 217k) the alert comes at 187k.
    let tokens = 190_000
    on('session.usage', () => ({ value: { context: { tokens, window: 250_000, percent: Math.round(tokens / 2_500) } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat window is getting swamped')
    // The tokens over this chat's window, and the point it compacts at (250k less the 33k buffer).
    expect(await drawn(band)).toContain('190k / 250k')
    expect(await drawn(band)).toContain('· auto-compacts at 217k, 27k left until then')
    // An alert band keeps its own colour and art: no shared wash under it.
    expect(await drawn(band)).not.toContain('slot-wash')
    expect(await band.find({ key: 'swamp-compact' })).toBeDefined()
    expect(await band.find({ key: 'swamp-handoff' })).toBeDefined()
    // Handoff in the middle, Compact (the lit one) on the right; the alert's colour lies in the slot's round shape.
    const text = await drawn(band)
    expect(text.indexOf('"key":"swamp-handoff"')).toBeLessThan(text.indexOf('"key":"swamp-compact"'))
    expect(text).toContain('"key":"slot-tint"')
    await band.press({ key: 'swamp-close' })
    await band.unmount()
    await drawsNothing($, DESK_BAND)
    tokens = 240_000
    await mocked.advance(16_000)
    const again = await $.ui.mount(DESK_BAND)
    expect(await drawn(again)).toContain('240k / 250k')
    await again.unmount()
  })

  test('the swamp band waits while a turn runs and comes back when it ends', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('turn.complete', () => ({ text: '' }) as never)
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 250_000, percent: 80 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    await $.prompt.submit({ text: '/status', wait: false, origin: { kind: 'composer' } })
    const busy = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(busy ? await drawn(busy) : '').not.toContain('Chat window is getting swamped')
    await busy?.unmount()
    await $.turn.complete({ turnId: 't1', answer: 'Done.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const after = await $.ui.mount(DESK_BAND)
    expect(await drawn(after)).toContain('Chat window is getting swamped')
    await after.unmount()
  })

  test('while compacting, the swamp band steps aside: the card under the reply says it', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    let release = () => {}
    on('command.run', (_$, e) => {
      if (e.command !== 'compact') return { text: 'ok' }
      return new Promise(resolve => {
        release = () => resolve({ text: 'ok' })
      }) as never
    })
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 250_000, percent: 80 } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    await band.press({ key: 'swamp-compact' })
    const pressed = band.press({ key: 'compact-go' })
    await mocked.advance(100)
    const during = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(during ? await drawn(during) : '').not.toContain('Chat window is getting swamped')
    expect(await during?.find({ key: 'swamp-compact' })).toBeUndefined()
    release()
    await pressed
    await during?.unmount()
    await band.unmount()
  })

  test('Compact shows its card above the prompt at once: Compacting while it runs, then Compacted until the next reply', async ($, on) => {
    // The chat as the plugin reads it: another one after the compact, which is how it knows it compacted.
    const chat = [{ role: 'user', text: 'a long chat' }]
    engine(on, {}, 'claude-opus-5-5', chat)
    const mocked = mock.clock(on)
    let release = () => {}
    on('command.run', (_$, e) => {
      if (e.command !== 'compact') return { text: 'ok' }
      return new Promise(resolve => {
        release = () => {
          chat.splice(0, chat.length, { role: 'user', text: 'the summary' })
          resolve({ text: 'ok' })
        }
      }) as never
    })
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 250_000, percent: 80 } } }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    on('ui.render', { component: 'AssistantMessage' }, (h, e) => {
      const { Text } = h.ui.resolve(e)
      return Text({ children: e.props.text } as never) as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    await $.turn.complete({ turnId: 't1', answer: 'Last reply.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const reply = () => $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', component: 'AssistantMessage', props: { text: 'Last reply.', isFirstOfReply: true } } as never)
    const band = await $.ui.mount(DESK_BAND)
    await band.press({ key: 'swamp-compact' })
    const pressed = band.press({ key: 'compact-go' })
    await mocked.advance(100)
    expect(await drawn(band)).toContain('Compacting…')
    // Not under the old reply: after a compact no reply sits past the boundary.
    const during = await reply()
    expect(await during.find({ key: 'reply-handoff' })).toBeUndefined()
    await during.unmount()
    release()
    await pressed
    expect(await drawn(band)).toContain('Compacted')
    await band.unmount()
    // The first reply after it takes it away.
    await $.turn.complete({ turnId: 't2', answer: 'Next reply.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const later = await $.ui.mount(DESK_BAND).catch(() => null)
    const text = later ? await drawn(later) : ''
    expect(text).not.toContain('Compacted')
    // The engine still reports the chat before (200k): no swamp band for a chat that was just compacted.
    expect(text).not.toContain('Chat window is getting swamped')
    await later?.unmount()
  })

  /** A swamped chat (200k of 250k) whose compaction Claude Code answers with `answer`; the figures the engine reports. */
  const swampedThenCompact = async ($: Engine, on: On, settings: Record<string, unknown>, answer: Record<string, unknown>) => {
    engine(on, {}, 'claude-opus-5-5', [{ role: 'user', text: 'a long chat' }])
    const mocked = mock.clock(on)
    on('settings.read', () => ({ value: settings }) as never)
    on('session.compact', () => answer as never)
    on('model.complete', () => ({ value: { isAnswered: true as const, text: 'Summary. ' + 'Details. '.repeat(40), usage: USAGE } }) as never)
    const now = { tokens: 200_000 }
    on('session.usage', () => ({ value: { context: { tokens: now.tokens, window: 250_000, percent: Math.round(now.tokens / 2_500) } } }) as never)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const before = await $.ui.mount(DESK_BAND)
    expect(await drawn(before)).toContain('Chat window is getting swamped')
    await before.unmount()
    const shown = async () => {
      const band = await $.ui.mount(DESK_BAND).catch(() => null)
      const text = band ? await drawn(band) : ''
      await band?.unmount()
      return text
    }
    return { mocked, now, shown }
  }

  test('after a compaction the swamp band goes at once, and stays away while the engine still reports the chat before', async ($, on) => {
    const w = await swampedThenCompact($, on, {}, { messages: [{ role: 'user', text: 'core summary', toolUses: [] }] })
    await $.session.compact({})
    expect(await w.shown()).not.toContain('Chat window is getting swamped')
    // The next checks read the same old figure: still the chat before.
    await w.mocked.advance(31_000)
    expect(await w.shown()).not.toContain('Chat window is getting swamped')
    // A reply came and the figure is another one: it counts again.
    w.now.tokens = 205_000
    await w.mocked.advance(16_000)
    expect(await w.shown()).toContain('205k / 250k')
  })

  test('a compaction that was vetoed leaves the swamp band: the chat is as big as before', async ($, on) => {
    const w = await swampedThenCompact($, on, { hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'audit' }] }] } }, { skip: 'PreCompact: kept for the audit' })
    await $.session.compact({})
    await w.mocked.advance(16_000)
    expect(await w.shown()).toContain('Chat window is getting swamped')
  })

  test('Compact with no chat to read before and after says it could not tell, and shows no Compacted', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    const told: string[] = []
    on('ui.toast', (_$, e) => {
      told.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    on('command.run', () => ({ text: 'ok' }))
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 250_000, percent: 80 } } }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    await $.turn.complete({ turnId: 't1', answer: 'Last reply.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const band = await $.ui.mount(DESK_BAND)
    await band.press({ key: 'swamp-compact' })
    await band.press({ key: 'compact-go' })
    await mocked.advance(100)
    expect(told.join(' ')).toContain('compact failed: the chat could not be read')
    expect(await drawn(band)).not.toContain('Compacted')
    await band.unmount()
  })

  test('a swamped chat draws no card under the reply: the band above the prompt says it', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 200_000, window: 250_000, percent: 80 } } }) as never)
    on('turn.complete', (_$, e) => ({ text: e.answer }))
    // The app's own drawing of a reply block, beneath the plugin.
    on('ui.render', { component: 'AssistantMessage' }, (h, e) => {
      const { Text } = h.ui.resolve(e)
      return Text({ children: e.props.text } as never) as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    await $.turn.complete({ turnId: 't1', answer: 'First answer.', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const reply = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', component: 'AssistantMessage', props: { text: 'First answer.', isFirstOfReply: true } } as never)
    expect(await reply.find({ key: 'reply-warn' })).toBeUndefined()
    expect(await drawn(reply)).not.toContain('swamped')
    await reply.unmount()
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat window is getting swamped')
    await band.unmount()
  })

  test('/smarttokensaver save switches save mode on and off', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    expect(String((await $.command.run({ command: 'smarttokensaver', args: 'save' })).text)).toContain('save mode on')
    expect(String((await $.command.run({ command: 'smarttokensaver', args: 'save' })).text)).toContain('save mode off')
  })

  test('save mode paints the footer level ember; off again, it is purple', { options: { appearance: 'auto' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    await $.command.run({ command: 'smarttokensaver', args: 'save' })
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).toContain(`"color":"${adaptHex('#f08a3c', 'text')}"`)
    await $.command.run({ command: 'smarttokensaver', args: 'save' })
    await footer.unmount()
    const again = await $.ui.mount(FOOTER)
    const text = await drawn(again)
    expect(text).not.toContain(`"color":"${adaptHex('#f08a3c', 'text')}"`)
    expect(text).toContain(`"color":"${adaptHex('#a79cf7', 'text')}"`)
    await again.unmount()
  })

  test('the setup can be closed with the cross; the footer then offers Setup, which opens it again', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await drawsNothing($, DESK_BAND)
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'setup' })).toBeDefined()
    await footer.press({ key: 'setup' })
    const reopened = await $.ui.mount(DESK_BAND)
    expect(await drawn(reopened)).toContain('Welcome to Smart Token Saver')
    await reopened.press({ key: 'setup-next' })
    expect(await reopened.find({ key: 'setup-bias2' })).toBeDefined()
    // Past the first question, then ✕: the guide counts as seen.
    await reopened.press({ key: 'setup-next' })
    await reopened.press({ key: 'setup-close' })
    await reopened.unmount()
    expect(await footer.find({ key: 'setup' })).toBeUndefined()
    // Once set up, the same place is a gear that opens the settings panel.
    await footer.press({ key: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    expect(await drawn(panel)).toContain('"key":"settings-title"')
    await panel.unmount()
    await footer.unmount()
  })
})

describe('running hot and judge down', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('save mode caps at medium, and reset times read short', () => {
    expect(capped('xhigh', true)).toBe('medium')
    expect(capped('low', true)).toBe('low')
    expect(capped('xhigh', false)).toBe('xhigh')
    const now = new Date('2026-10-06T10:00:00').getTime()
    expect(resetLabel('2026-10-06T14:20:00', now)).toBe('14:20')
    expect(resetLabel(null, now)).toBe('')
  })

  test('a limit past 80% shows the running-hot band; save mode can be switched on', async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 1 }, rateLimits: [
      { kind: 'five_hour', percentUsed: 84, resetsAt: '2026-10-06T14:20:00Z' },
      { kind: 'seven_day', percentUsed: 40 },
    ] } }) as never)
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Running low')
    expect(await drawn(band)).toContain('84% of your 5h limit used')
    await band.press({ key: 'hot-save' })
    expect(said.join(' ')).toContain('save mode on')
    await band.unmount()
  })

})

describe('settings panel', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('the slider tips only close calls; floor and ceiling clamp', () => {
    expect(tipped('medium', 0.6, 1)).toBe('high')
    expect(tipped('medium', 0.9, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 1)).toBe('medium')
    expect(tipped('medium', 0.8, 2)).toBe('high')
    expect(tipped('medium', 0.6, -1)).toBe('low')
    expect(tipped('low', 0.3, -2)).toBe('low')
    expect(tipped('medium', undefined, 2)).toBe('medium')
    expect(bounded('low', 'medium', 'max')).toBe('medium')
    expect(bounded('max', 'low', 'high')).toBe('high')
    expect(parseVerdict('{"model":"opus","effort":"high","sure":0.7,"why":"x"}')?.sure).toBe(0.7)
  })

  test('a setting the store does not take says so, shows no Saved, and stays queued for the next try', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '0' })
    mock.clock(on)
    const told: string[] = []
    on('ui.toast', (_$, e) => {
      told.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' } as never)
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-show' })
    let full = true
    storeTaps.push(key => {
      if (key === 'savedSettings' && full) throw new Error('disk full')
    })
    await panel.press({ key: 'show-box-timer' })
    expect(told.join(' ')).toContain('could not save hide')
    expect(await drawn(panel)).not.toContain('✓ Saved')
    expect(testStore.get('setupSave')).toEqual({ hide: expect.stringContaining('timer') })
    // The next change goes through, and takes the queued one with it.
    full = false
    await panel.press({ key: 'show-box-reason' })
    expect(await drawn(panel)).toContain('✓ Saved')
    expect(testStore.get('setupSave') ?? null).toBeNull()
    await panel.unmount()
  })

  test('Open settings opens the panel; effort, context, model and handoff are saved from it; About and Lab are there', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '0' })
    const mocked = mock.clock(on)
    const set = savedSets(on)
    await start($, on)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' } as never)
    const panel = await $.ui.mount(DESK_BAND)
    expect(await drawn(panel)).toContain('"key":"settings-title"')
    // The cards in order; the last two are About and Lab, Lab closed and off.
    for (const card of ['effort', 'model', 'context', 'handoff', 'show', 'about', 'lab'])
      expect(await panel.find({ key: `settings-card-${card}` })).toBeDefined()
    // Not a maintainer's install: Support has no power symbol, and its line names its own updates.
    expect(await panel.find({ key: 'settings-lab-power' })).toBeUndefined()
    expect(await drawn(panel)).toContain('Update · Report a bug')
    // Seven cards; the guide is a button in the header, beside the cross.
    expect(await panel.find({ key: 'settings-card-guide' })).toBeUndefined()
    expect(await panel.find({ key: 'settings-guide' })).toBeDefined()
    expect(await panel.find({ key: 'bias3' })).toBeUndefined()
    await panel.press({ key: 'settings-card-effort' })
    await panel.press({ key: 'bias3' })
    await panel.select({ key: 'settings-floor', value: 'medium' })
    // Helpers: the Auto switch again, off by default.
    expect(await drawn(panel)).toContain('Helpers off')
    await panel.press({ key: 'settings-helpers-switch' })
    expect(await drawn(panel)).toContain('Helpers on')
    await panel.press({ key: 'settings-back' })
    // Context: the compaction window, 300k by default.
    expect(await drawn(panel)).toContain('300k')
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-window', value: '400000' })
    await panel.press({ key: 'settings-back' })
    expect(await drawn(panel)).toContain('400k')
    await panel.press({ key: 'settings-card-handoff' })
    await panel.select({ key: 'settings-skill', value: 'session-handoff' })
    expect(await panel.find({ key: 'show-box-swamp' })).toBeDefined()
    expect(await panel.find({ key: 'show-box-cold' })).toBeDefined()
    await panel.press({ key: 'settings-back' })
    // Model has its own card: two choices, and the card says which is on. Off by default; compaction on Auto.
    expect(await drawn(panel)).toContain("Keeps the chat's model")
    await panel.press({ key: 'settings-card-model' })
    await panel.press({ key: 'settings-model-on' })
    await panel.select({ key: 'settings-compact-with', value: 'session' })
    await panel.press({ key: 'settings-back' })
    expect(await drawn(panel)).toContain('Cheaper when it can')
    // The cards say what is set.
    expect(await drawn(panel)).toContain('Smarter · medium to high')
    expect(await drawn(panel)).toContain('/session-handoff · alert at')
    // About: our version and the upstream base, with credit.
    await panel.press({ key: 'settings-card-about' })
    expect(await drawn(panel)).toContain(`Smart Token Saver ${OWN_VERSION}`)
    expect(await drawn(panel)).toContain(`effortless ${UPSTREAM_BASE} by HeyCubit (MIT)`)
    expect(await drawn(panel)).toContain('github.com/HeyCubit/effortless')
    // No contact line unless a deployment sets SUPPORT_HINT.
    expect(await drawn(panel)).not.toContain('Questions')
    await panel.press({ key: 'settings-back' })
    await panel.press({ key: 'settings-card-lab' })
    // Support for an install from GitHub: its own updates and Report a bug; the maintainer's tools are not there.
    expect(await drawn(panel)).toContain('Support')
    expect(await drawn(panel)).toContain('Checks GitHub every 6 hours.')
    expect(await drawn(panel)).toContain('Report a bug')
    expect(await panel.find({ key: 'support-check' })).toBeDefined()
    expect(await drawn(panel)).not.toContain('Upstream updates')
    expect(await drawn(panel)).not.toContain('Measurement')
    expect(await panel.find({ key: 'lab-updates-on' })).toBeUndefined()
    await panel.press({ key: 'settings-back' })
    await panel.press({ key: 'settings-card-show' })
    await panel.press({ key: 'show-box-timer' })
    await panel.press({ key: 'show-box-reason' })
    expect(await panel.find({ key: 'show-box-sounds' })).toBeUndefined()
    expect(await panel.find({ key: 'show-box-swamp' })).toBeUndefined()
    // Every change was saved as it was made, and the top bar says so for a moment.
    expect(await panel.find({ key: 'settings-save' })).toBeUndefined()
    expect(await drawn(panel)).toContain('✓ Saved')
    expect(set).toContainEqual({ key: 'smarttokensaver.hide', value: 'timer' })
    expect(set).toContainEqual({ key: 'smarttokensaver.handoffSkill', value: 'session-handoff' })
    expect(set).toContainEqual({ key: 'smarttokensaver.effortBias', value: '1' })
    expect(set).toContainEqual({ key: 'smarttokensaver.effortFloor', value: 'medium' })
    expect(set).toContainEqual({ key: 'smarttokensaver.modelAuto', value: 'on' })
    expect(set).toContainEqual({ key: 'smarttokensaver.compactWith', value: 'session' })
    expect(set).toContainEqual({ key: 'smarttokensaver.compactWindow', value: '400000' })
    expect(set).toContainEqual({ key: 'smarttokensaver.helpers', value: 'on' })
    expect(set.map(x => x.key)).not.toContain('smarttokensaver.judge')
    await mocked.advance(3000)
    expect(await drawn(panel)).not.toContain('✓ Saved')
    await panel.unmount()
  })
})

describe('switching parts off', () => {
  test('readConfig keeps only parts that can be switched off; the judge-down alert is not among them', () => {
    expect(readConfig({ hide: 'swamp, handoff,bogus,down,progress' }).hide).toEqual(['swamp', 'handoff', 'progress'])
  })

  test('a hidden handoff button is not in the footer; a switched-off context alert does not show', { options: { hide: 'handoff,swamp' } } as never, async ($, on) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 600_000, window: 1_000_000, percent: 60 } } }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await mocked.advance(16_000)
    // Nothing above the prompt: the swamp band was the only thing to draw.
    await drawsNothing($, DESK_BAND)
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'handoff' })).toBeUndefined()
    await footer.unmount()
  })
})

describe('the command file', () => {
  test('/smarttokensaver:smarttokensaver, as the app may name the command file, is answered by the mod', async ($, on) => {
    engine(on)
    mock.clock(on)
    const answer = await $.command.run({ command: 'smarttokensaver:smarttokensaver', args: 'settings' } as never)
    expect(String((answer as { text?: string }).text)).toContain('settings are open')
  })
})


// The progress bar is switched off for now (hooks/progress.tsx stays for later): its rules only.
describe('progress bar rules', () => {
  const todos = (statuses: ('pending' | 'in_progress' | 'completed')[]) =>
    statuses.map((status, i) => ({ content: `Step ${i + 1}`, activeForm: `Doing step ${i + 1}`, status }))
  test('the steps: share, number and the one named', () => {
    const steps = stepsFromTodos(todos(['completed', 'in_progress', 'pending', 'pending']))
    expect(progressShare(steps)).toBe(1.5 / 4)
    expect(stepNumber(steps)).toBe(2)
    expect(currentStep(steps)?.doing).toBe('Doing step 2')
    expect(stepNumber(stepsFromTodos(todos(['completed', 'completed', 'completed'])))).toBe(3)
    expect(progressShare([])).toBe(0)
  })

  test('tasks are added, updated and deleted by id', () => {
    let steps = withTaskCreated([], '1', { subject: 'Read', activeForm: 'Reading' })
    steps = withTaskCreated(steps, '2', { subject: 'Write' })
    steps = withTaskUpdated(steps, { taskId: '1', status: 'in_progress' })
    expect(steps.map(s => [s.id, s.status, s.doing])).toEqual([['1', 'in_progress', 'Reading'], ['2', 'pending', 'Write']])
    expect(withTaskUpdated(steps, { taskId: '2', status: 'deleted' }).map(s => s.id)).toEqual(['1'])
  })

  test('a turn ends done, asking or paused; too short a list ends the bar', () => {
    const q = endsOnQuestion
    const p = (s: ('pending' | 'in_progress' | 'completed')[]) => ({ phase: 'working' as const, steps: stepsFromTodos(todos(s)) })
    expect(phaseAtTurnEnd(p(['completed', 'completed', 'completed']), { reason: 'answer', answer: 'All done.' }, q)).toBe('done')
    expect(phaseAtTurnEnd(p(['completed', 'pending', 'pending']), { reason: 'answer', answer: 'Should I go on?' }, q)).toBe('asking')
    expect(phaseAtTurnEnd(p(['completed', 'pending', 'pending']), { reason: 'aborted', answer: '' }, q)).toBe('paused')
    expect(phaseAtTurnEnd(p(['completed', 'pending']), { reason: 'answer', answer: '' }, q)).toBeNull()
  })

  test('a prompt carries an asking or paused task on and ends a finished one; slash commands change nothing', () => {
    const steps = stepsFromTodos(todos(['completed', 'pending', 'pending']))
    const said = { text: 'yes', origin: { kind: 'composer' } }
    expect(afterPrompt({ phase: 'asking', steps }, said)?.phase).toBe('working')
    expect(afterPrompt({ phase: 'paused', steps }, said)?.phase).toBe('working')
    expect(afterPrompt({ phase: 'done', steps }, said)).toBeNull()
    expect(afterPrompt({ phase: 'done', steps }, { text: '/smarttokensaver debug', origin: { kind: 'composer' } })?.phase).toBe('done')
  })

  test('where it shows, what it says, and when the judge calls a turn big', () => {
    const steps = stepsFromTodos(todos(['completed', 'in_progress', 'pending']))
    expect(progressShows({ phase: 'working', steps }, null, 'active')).toBe(true)
    expect(progressShows({ phase: 'working', steps }, null, 'resting')).toBe(false)
    expect(progressShows({ phase: 'done', steps }, null, 'active')).toBe(true)
    expect(progressShows({ phase: 'paused', steps }, null, 'resting')).toBe(true)
    expect(progressShows({ phase: 'working', steps }, 'Step 1\nStep 2\nStep 3', 'active')).toBe(false)
    expect(progressShows({ phase: 'working', steps: steps.slice(0, 2) }, null, 'active')).toBe(false)
    expect(progressTitle({ phase: 'asking', steps })).toBe('Waiting for your answer · step 2 of 3')
    expect(progressTitle({ phase: 'done', steps })).toBe('Done · all 3 steps')
  })

  test('Windows plays the chime with PowerShell; elsewhere the app plays it', () => {
    const argv = soundArgv('C:\\Users\\x\\plugins\\smarttokensaver', 'sounds/done.wav')
    expect(argv?.[0]).toBe('powershell.exe')
    expect(argv?.join(' ')).toContain("SoundPlayer 'C:\\Users\\x\\plugins\\smarttokensaver\\sounds\\done.wav'")
    expect(soundArgv('/Users/x/.claude/plugins/smarttokensaver', 'sounds/done.wav')).toBeNull()
  })

})

describe('terminal art', () => {
  test('a frame is 16 by 2 cells of ▀, faded in from the left', () => {
    // 32 cells of three 4-byte words: 384 bytes, 512 base64 characters.
    expect(artFrame('swamp', 0)).toHaveLength(512)
    for (const kind of ['cold', 'swamp', 'hot', 'brand', 'calm', 'compacting', 'done'] as const) {
      expect(artPixel(kind, 3, 0, 1)).toBe(artPixel(kind, 9, 0, 1))
    }
  })

  test('moving kinds change over time; still ones do not', () => {
    const frames = (kind: Parameters<typeof artFrame>[0]) => new Set(Array.from({ length: 30 }, (_, t) => artFrame(kind, t))).size
    for (const kind of MOVING) expect(frames(kind)).toBeGreaterThan(1)
    expect(frames('brand')).toBe(1)
    expect(frames('calm')).toBe(1)
    expect(frames('done')).toBe(1)
  })
})

describe('terminal bands', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface: 'terminal', isInteractive: true } as never)
  }
  const at = (columns: number) =>
    ({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: columns, maxRows: 14 } }) as never

  for (const kind of ['swamp', 'cold', 'hot'] as const) {
    test(`${kind}: art on the right when wide, none at 80 columns; the effort row stays under it`, async ($, on) => {
      engine(on)
      mock.clock(on)
      await start($, on)
      const guide = await $.ui.mount(at(120))
      await guide.press({ key: 'setup-close' })
      await guide.unmount()
      await $.command.run({ command: 'smarttokensaver', args: kind } as never)
      const wide = await $.ui.mount(at(120))
      const text = await drawn(wide)
      expect(text).toContain('"type":"Raster"')
      expect(text).toContain('"children":["Effort"]')
      await wide.unmount()
      const narrow = await $.ui.mount(at(80))
      const small = await drawn(narrow)
      expect(small).not.toContain('"type":"Raster"')
      expect(small).toContain('"children":["Effort"]')
      await narrow.unmount()
    })
  }

  test('Settings in a narrow terminal: cards keep their text, the header wraps, the guide link copies', async ($, on) => {
    engine(on)
    mock.clock(on)
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push(e.text)
      return { value: { isCopied: true } } as never
    })
    await start($, on)
    const guide = await $.ui.mount(at(36))
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' } as never)
    const panel = await $.ui.mount(at(36))
    const text = await drawn(panel)
    // No blank buttons laid over the cards: a terminal paints their spaces over the title and summary.
    expect(text).not.toContain(' '.repeat(800))
    expect(text).toContain('Effort ›')
    // Title and buttons are in the flow, so a narrow window wraps them instead of drawing one over the other.
    expect(text).not.toMatch(/"key":"settings-(title|actions)"[^}]*"position":"absolute"/)
    expect(text).not.toContain('"href"')
    await panel.press({ key: 'settings-guide' })
    expect(copied[0]).toBe(GUIDE_URL)
    await panel.press({ key: 'settings-card-effort' })
    expect(await drawn(panel)).toContain('Subagents')
    expect(await drawn(panel)).not.toContain(' '.repeat(40))
    // Inside a part, Guide goes to that part's section.
    await panel.press({ key: 'settings-guide' })
    expect(copied[copied.length - 1]).toBe(`${GUIDE_URL}#settings-effort`)
    // Short choices are buttons, not a dropdown that opens inside the row: one press picks.
    await panel.press({ key: 'settings-back' })
    await panel.press({ key: 'settings-card-show' })
    // The colours are always navy & orange: no theme to pick, only light or dark.
    expect(await panel.find({ key: 'settings-theme' })).toBeUndefined()
    await panel.press({ key: 'settings-appearance-light' })
    expect(await drawn(panel)).toContain('✓ Saved')
    expect(JSON.stringify(await panel.find({ key: 'settings-appearance-light' }))).toContain('"variant":"secondary"')
    await panel.unmount()
  })
})

describe('dashboard', () => {
  // These tests measure against the model's whole window, as with the window left to Claude Code (no cap of 300k).
  const UNCAPPED = { options: { layout: 'default', compactWindow: 'default' } } as never
  const DASH = { options: { layout: 'default' } } as never
  const start = async ($: Engine, on: On, surface: 'desktop' | 'terminal' = 'desktop') => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    await $.session.start({ cwd: '.', surface, isInteractive: true } as never)
  }
  const closeSetup = async ($: Engine, band: unknown) => {
    const guide = await $.ui.mount(band as never)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
  }

  test('cache-aware routing, live through the hooks: a cold Sonnet is skipped on a big warm Opus chat, Haiku moves, a cold chat moves, and a routed reply leaves the countdown alone', { timeoutMs: 20_000, options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 100_000, window: 1_000_000, percent: 10 } } }) as never)
    let verdict = '{"model":"opus","effort":"high","why":"big refactor"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }))
    const sent: string[] = []
    const used = { input_tokens: 5, output_tokens: 40, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 10_000, cache_creation: { ephemeral_1h_input_tokens: 10_000 } }
    on('turn.step', async function* (_$, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: used } as never
    })
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    const ask = async (v: string, text: string) => {
      verdict = v
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await step($)
    }
    const cacheLine = async () => String((await $.command.run({ command: 'smarttokensaver', args: 'debug' })).text).split(' | ').find(l => l.startsWith('cache:')) ?? ''
    // A hard prompt on the chat's own model warms the Opus cache.
    await ask('{"model":"opus","effort":"high","why":"big refactor"}', 'refactor the whole auth layer')
    expect(sent.at(-1)).toBe('claude-opus-5-5')
    // Sonnet has never answered: its cache is cold, and writing 100k tokens there costs more than reading them on Opus.
    await ask('{"model":"sonnet","effort":"low","why":"small fix"}', 'rename this variable to userId')
    expect(sent.at(-1)).toBe('claude-opus-5-5')
    // A cold Haiku loses to a warm Opus read as well, whatever the size of the chat.
    await mocked.advance(30 * 60_000)
    await ask('{"model":"haiku","effort":"low","why":"lookup"}', 'what is the folder called')
    expect(sent.at(-1)).toBe('claude-opus-5-5')
    // An hour and more on, the Opus cache is cold too: staying would write it all again, so Sonnet is worth it now.
    await mocked.advance(61 * 60_000)
    await ask('{"model":"sonnet","effort":"low","why":"small fix"}', 'add a log line here')
    expect(sent.at(-1)).toBe('claude-sonnet-5-5')
    // Opus warm again, Sonnet warm from the last reply: the switch reads a warm cache and goes ahead.
    await ask('{"model":"opus","effort":"high","why":"hard"}', 'debug the race in the queue')
    expect(sent.at(-1)).toBe('claude-opus-5-5')
    await ask('{"model":"sonnet","effort":"low","why":"small fix"}', 'fix the typo in the log line')
    expect(sent.at(-1)).toBe('claude-sonnet-5-5')
    // Twenty minutes on, a routed reply from the warm Sonnet must not restart the chat's countdown: Opus is still 40 min out.
    await mocked.advance(20 * 60_000)
    await ask('{"model":"sonnet","effort":"low","why":"small fix"}', 'fix another typo in the log line')
    expect(sent.at(-1)).toBe('claude-sonnet-5-5')
    expect(await cacheLine()).toContain('40 min left')
  })

  test('looksLikeRedo: a correction after a cheaper answer, not a thank-you or a new task', () => {
    for (const yes of ["no, that's wrong", 'Nope. still fails on line 3', 'wrong, it is the other file', "that doesn't work", 'still broken', 'try again please', 'funkar inte', 'fel, det ska vara src', 'inte rätt', "it still doesn't compile"])
      expect(looksLikeRedo(yes)).toBe(true)
    for (const no of ['no problem, thanks', 'nothing else to fix', 'now add a test for it', 'looks right, ship it', 'what does this function do', 'normal', 'felsök det här', 'ok'])
      expect(looksLikeRedo(no)).toBe(false)
  })

  test('a redone cheaper answer: the retry and the next prompts stay on the chat model, and stats count it', { options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 100_000, window: 1_000_000, percent: 10 } } }) as never)
    let verdict = '{"model":"opus","effort":"high","why":"big refactor"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }))
    const sent: string[] = []
    const used = { input_tokens: 5, output_tokens: 40, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 10_000, cache_creation: { ephemeral_1h_input_tokens: 10_000 } }
    on('turn.step', async function* (_$, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: used } as never
    })
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    const HAIKU = '{"model":"haiku","effort":"low","why":"lookup"}'
    const ask = async (v: string, text: string) => {
      verdict = v
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await step($)
    }
    await ask('{"model":"opus","effort":"high","why":"big refactor"}', 'refactor the whole auth layer')
    // Once the Opus cache has gone cold, a Haiku move is cheaper than writing it all again.
    await mocked.advance(61 * 60_000)
    await ask(HAIKU, 'what is the folder called')
    expect(sent.at(-1)).toBe('claude-haiku-5-5')
    // The person says it was wrong: the retry runs on Opus, and so do the next ones, though the judge still says Haiku.
    await ask(HAIKU, "no that's wrong, it is the src folder")
    expect(sent.at(-1)).toBe('claude-opus-5-5')
    for (let i = 1; i < REDO_STAY_PROMPTS; i++) {
      await ask(HAIKU, `which file holds the config number ${i}`)
      expect(sent.at(-1)).toBe('claude-opus-5-5')
    }
    await ask(HAIKU, 'what is the folder for the tests')
    expect(sent.at(-1)).toBe('claude-haiku-5-5')
    const stats = String((await $.command.run({ command: 'smarttokensaver', args: 'stats' })).text)
    expect(stats).toContain('Cheaper model: 2 prompts moved down, 1 redone (50 %)')
  })

  test('a new default moves the way back of raised windows; one the default covers goes', () => {
    const raised = { opus: { window: 400_000, standard: 300_000, session: 's', model: 'opus', confirmed: true }, fable: { window: 700_000, standard: 300_000, session: 's', model: 'fable' } }
    expect(retargetRaised(raised, 400_000)).toEqual({ fable: { window: 700_000, standard: 400_000, session: 's', model: 'fable' } })
    expect(retargetRaised(raised, null).opus.standard).toBeNull()
    expect(retargetRaised(null, 400_000)).toEqual({})
  })

  test('adaptive appearance: the panel ground and the main text are the app\'s own, edges see-through, navy turns orange', () => {
    setTheme('navy')
    expect(adaptHex('#0a1a26', 'surface')).toBeNull()
    expect(adaptHex('#151515', 'surface')).toBeNull()
    expect(adaptHex('#2b2b2b', 'surface')).toMatch(/^#808080[0-9a-f]{2}$/)
    expect(adaptHex('#123852', 'edge')).toBe('#8080804d')
    expect(adaptHex('#d4d4d8', 'text')).toBeNull()
    expect(adaptHex('#00243B', 'text')).toBe(BRAND_ORANGE)
    // In art a dark navy is a ground (the Compact and Handoff pill): grey, not an orange block.
    expect(adaptHex('#163246', 'art')).toBe('#80808040')
    expect(adaptProps({ color: '#8b8b93' })).toEqual({ dimColor: true })
    expect(adaptProps({ color: '#d4d4d8', backgroundColor: '#0a1a26' })).toEqual({})
    // A card's blank click layers keep the app's own hover off: see-through stays, a hover ground never goes missing.
    expect(adaptProps({ hover: { backgroundColor: '#00000000' } })).toEqual({ hover: { backgroundColor: '#00000000' } })
    expect(adaptProps({ hover: { backgroundColor: '#0a1a26' } })).toEqual({ hover: { backgroundColor: '#00000000' } })
    setTheme('violet')
  })

  test('light appearance: surfaces come out pale, text reads on them, alpha and hue are kept', () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1, 7), 16)
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
      return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
    }
    const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
    // Edges stay a visible step darker than the panels they frame.
    for (const edge of ['#2a2a2f', '#4a3f80']) expect(lum(lightHex(edge, 'surface'))).toBeGreaterThan(0.45)
    for (const dark of ['#141416', '#15121f', '#0e1820', '#111710', '#1a110c', '#0f1c15']) {
      const pale = lightHex(dark, 'surface')
      expect(lum(pale)).toBeGreaterThan(0.6)
    }
    const surfaces = ['#141416', '#15121f', '#0e1820', '#111710', '#1a110c', '#0f1c15', '#12141b'].map(h => lightHex(h, 'surface'))
    for (const text of ['#d4d4d8', '#8b8b93', '#a79cf7', '#7c6cf0', '#7cc4ff', '#a7c98f', '#f08a3c', '#7fe0a4', '#ffffff', '#6b6b73', '#e0a33a', '#e5534b'])
      for (const bg of surfaces) expect(contrast(lightHex(text, 'text'), bg)).toBeGreaterThanOrEqual(4.5)
    // Main text stays darker than dim text, and a colour stays its hue.
    expect(lum(lightHex('#d4d4d8', 'text'))).toBeLessThan(lum(lightHex('#8b8b93', 'text')))
    expect(lightHex('#7fe0a4', 'text')).toMatch(/^#[0-9a-f]{2}[0-9a-f]{2}[0-9a-f]{2}$/)
    const green = parseInt(lightHex('#7fe0a4', 'text').slice(3, 5), 16)
    const red = parseInt(lightHex('#7fe0a4', 'text').slice(1, 3), 16)
    expect(green).toBeGreaterThan(red)
    expect(lightHex('#14141680', 'surface').endsWith('80')).toBe(true)
  })

  test('every Text carries a colour of its own, so it reads on the panel whatever mode the app is in', () => {
    expect(ownColour({ dimColor: true, wrap: 'truncate' })).toEqual({ wrap: 'truncate', color: DIM_DEFAULT })
    expect(ownColour({ bold: true })).toEqual({ bold: true, color: TEXT_DEFAULT })
    expect(ownColour({ color: '#2ea043', dimColor: true })).toEqual({ color: '#2ea043', dimColor: true })
  })
  test('light appearance: Box, Text and Button props are turned, hover too; dark leaves the apps own parts alone', () => {
    const Box = (p: Record<string, unknown>) => p
    const Text = (p: Record<string, unknown>) => p
    const Button = (p: Record<string, unknown>) => p
    const els = { Box, Text, Button, Svg: (p: Record<string, unknown>) => p }
    expect(themedEls(els).Box).toBe(Box)
    try {
      setLight(true)
      const lit = themedEls(els) as typeof els
      expect(lit.Box).not.toBe(Box)
      const box = lit.Box({ backgroundColor: '#141416', borderColor: '#2a2a2f', hover: { backgroundColor: '#1c1c20' }, flexDirection: 'row' })
      expect(box.backgroundColor).toBe(lightHex('#141416', 'surface'))
      expect(box.borderColor).toBe(lightHex('#2a2a2f', 'surface'))
      expect((box.hover as { backgroundColor: string }).backgroundColor).toBe(lightHex('#1c1c20', 'surface'))
      expect(box.flexDirection).toBe('row')
      expect(lit.Text({ color: '#d4d4d8', bold: true }).color).toBe(lightHex('#d4d4d8', 'text'))
      expect(lit.Text({ color: 'red' }).color).toBe('red')
      expect(lit.Button({ hover: { backgroundColor: '#00000000' } }).hover).toEqual({ backgroundColor: lightHex('#00000000', 'surface') })
      expect(lightProps({ color: '#fff' }).color).toBe('#fff')
    } finally {
      setLight(false)
    }
    expect(isLight()).toBe(false)
  })

  test('light appearance: drawn art turns pale, with the sparkles still petals in rose', () => {
    setAdaptive(false)
    const art = '<svg><style>.sp{fill:#fff}</style><rect fill="#15121f" width="9" height="9"/><rect fill="#7c6cf0" width="9" height="9"/><path class="sp" style="transform-origin:168px 8px;animation-duration:4.2s;animation-delay:0.3s" d="M168 6.4 L168.34 7.66 Z"/></svg>'
    try {
      setLight(true)
      const violet = tint(art)
      expect(violet).not.toContain('#15121f')
      expect(violet).toContain(lightHex('#15121f'))
      expect(violet).toContain('class="sp"')
      setTheme('rose')
      const rose = tint(art)
      expect(rose).toContain('class="pt"')
      expect(rose).not.toContain('#ffb3cf')
    } finally {
      setTheme('violet')
      setLight(false)
    }
  })

  test('Always light and Always dark colour the plugin only: the app keeps its own mode', { options: { layout: 'default', appearance: 'light', theme: 'navy', hide: '' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    const themes: unknown[] = []
    on('theme.set' as never, (async (_$: unknown, e: unknown) => { themes.push(e); return { value: { isDrawn: true, requestId: 't' } } }) as never)
    on('theme.clear' as never, (async () => { themes.push('clear'); return { value: { isDrawn: false, reason: 'cleared' } } }) as never)
    await start($, on)
    await closeSetup($, DESK_BAND)
    const band = await $.ui.mount(DESK_BAND)
    const bar = await drawn(band)
    // The bar is the same tree Automatic draws, in a shell that paints the slot's round light ground; the app's mode
    // is never touched.
    expect(bar).toContain('"key":"slot-shell"')
    expect(bar).toContain(`"backgroundColor":"${PALETTES.light.ground}"`)
    expect(bar).not.toContain(`"backgroundColor":"${PALETTES.dark.ground}"`)
    expect(bar).toContain('(Haiku 5.5)')
    await band.unmount()
    expect(JSON.stringify(themes)).not.toContain('overrideColorScheme')
  })
  test("auto appearance on the desktop paints nothing of its own: the app's light or dark shows through", { options: { layout: 'default' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    // Claude Code's theme row says light (as it can while the app is dark): Automatic ignores it on the desktop.
    on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: 'light', provider: { kind: 'engine' }, isLocked: false }] }) as never)
    await start($, on)
    await closeSetup($, DESK_BAND)
    let band = await $.ui.mount(DESK_BAND)
    await band.unmount()
    await mocked.advance(100)
    band = await $.ui.mount(DESK_BAND)
    const text = await drawn(band)
    expect(text).not.toContain('"backgroundColor":"#141416"')
    expect(text).not.toContain(lightHex('#141416', 'surface'))
    expect(text).not.toContain('#d4d4d8')
    await band.unmount()
  })

  test('a new chat: Low picked by hand in another chat does not beat the effort the app is on when the first prompt goes', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
    on('prompt.fill', () => ({ isFilled: true }) as never)
    const sent = recordSteps(on)
    await start($, on)
    await closeSetup($, DESK_BAND)
    // The other chat: Low picked by hand in Smart Token Saver, so Auto went off and the pick is kept for the next chat.
    const rows = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND } as never)
    await rows.press({ key: 'e-low' })
    await rows.unmount()
    // A new chat starts from that; the person sets the app to Extra before the first prompt goes.
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await $.prompt.submit({ text: 'plan the architecture of the trainer', wait: false, origin: { kind: 'composer' } })
    await step($, 'xhigh')
    expect(sent.at(-1)!.effort).toBe('xhigh')
  })

  test('picking an effort in the app turns Auto off and says so', async ($, on) => {
    engine(on)
    const said: string[] = []
    on('ui.toast', (_$, e) => {
      said.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    const sent = recordSteps(on)
    await step($, 'high')
    await step($, 'low')
    expect(sent.at(-1)!.effort).toBe('low')
    expect(said.join(' ')).toContain('Default effort. You picked Low')
    expect(String((await $.command.run({ command: 'smarttokensaver', args: 'auto' })).text)).toContain('Smart:')
  })

  test('/smarttokensaver debug says what the app asked for and what was sent', async ($, on) => {
    engine(on)
    const sent = recordSteps(on)
    const debug = async () => String((await $.command.run({ command: 'smarttokensaver', args: 'debug' })).text)
    expect(await debug()).toContain('last request: none yet')
    await $.command.run({ command: 'smarttokensaver', args: 'auto' })
    await step($, 'xhigh')
    expect(sent.at(-1)!.effort).toBe('xhigh')
    expect(await debug()).toContain('last request: app asked claude-opus-5-5 at xhigh, sent claude-opus-5-5 at xhigh (unchanged)')
    // The model that ran is also on a line of its own.
    expect((await debug()).split(String.fromCharCode(10)).at(-1)).toBe('model used: claude-opus-5-5 at xhigh')
  })

  test('a thank-you after a cheaper answer is not a redo', { options: { modelAuto: 'on' } } as never, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 100_000, window: 1_000_000, percent: 10 } } }) as never)
    let verdict = '{"model":"opus","effort":"high","why":"big refactor"}'
    on('model.complete', () => ({ value: { isAnswered: true as const, text: verdict, usage: USAGE } }))
    const sent: string[] = []
    const used = { input_tokens: 5, output_tokens: 40, cache_read_input_tokens: 90_000, cache_creation_input_tokens: 10_000, cache_creation: { ephemeral_1h_input_tokens: 10_000 } }
    on('turn.step', async function* (_$, e) {
      sent.push(e.model)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: used } as never
    })
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    const HAIKU = '{"model":"haiku","effort":"low","why":"lookup"}'
    const ask = async (v: string, text: string) => {
      verdict = v
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
      await step($)
    }
    await ask('{"model":"opus","effort":"high","why":"big refactor"}', 'refactor the whole auth layer')
    await mocked.advance(61 * 60_000)
    await ask(HAIKU, 'what is the folder called')
    await ask(HAIKU, 'no problem, now what is the tests folder called')
    expect(sent.at(-1)).toBe('claude-haiku-5-5')
    expect(String((await $.command.run({ command: 'smarttokensaver', args: 'stats' })).text)).toContain('0 redone')
  })

  test('the bench report says whether low confidence predicts a miss, and which models the judges picked', () => {
    const cases = [
      { id: 'a', kind: 'k', current: { model: 'sonnet', effort: 'medium', why: '', by: 'manual' }, message: 'x', ok: ['low'] },
      { id: 'b', kind: 'k', current: { model: 'sonnet', effort: 'medium', why: '', by: 'manual' }, message: 'y', ok: ['high'] },
      { id: 'c', kind: 'k', current: { model: 'sonnet', effort: 'medium', why: '', by: 'manual' }, message: 'z', ok: ['medium'] },
    ] as never
    const report = benchReport(cases, [
      { id: 'a', judge: 'haiku', effort: 'low', sure: 0.95, model: 'haiku', ms: 1, tokens: 1 },
      { id: 'b', judge: 'haiku', effort: 'low', sure: 0.5, model: 'sonnet', ms: 1, tokens: 1 },
      { id: 'c', judge: 'haiku', effort: 'medium', sure: 0.9, model: 'sonnet', ms: 1, tokens: 1 },
    ] as never)
    expect(report).toContain('| haiku (3 with a score) | 93% | 50% | 1 of 1 | 1 of 1 | 1 | 1 |')
    expect(report).toContain('| haiku | 1 | 2 | 0 | 0 |')
  })

  test("its lines: the effort, cache and context; the judge's reason and the last reply", () => {
    const base = { auto: true, paused: false, judging: false, effort: 'medium' as const, cacheNow: 42, contextPercent: 18, reason: 'Jev: a small fix', last: null }
    expect(dashboardLines(base).head).toBe(`✦ Medium · cache ${cacheLabel(42)} · 18% context`)
    expect(dashboardLines(base).detail).toBe('Jev: a small fix')
    expect(dashboardLines({ ...base, last: { cost: 42_000, ms: 38_200 } }).detail).toBe('Jev: a small fix · last reply ≈42.0k tokens · 38s')
    // Smart off: the chat's model and effort, as the app's footer says them.
    expect(dashboardLines({ ...base, auto: false, modelName: 'Opus 5.5' }).head).toBe(`✦ Opus 5.5 · Medium · cache ${cacheLabel(42)} · 18% context`)
    expect(dashboardLines({ ...base, auto: false, effort: undefined }).head).toBe(`✦ Default · cache ${cacheLabel(42)} · 18% context`)
    expect(modelDisplayName('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(modelDisplayName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelDisplayName('claude-fable-5-2')).toBe('Fable 5.2')
    expect(modelDisplayName('claude-opus-5')).toBe('Opus 5')
    expect(modelDisplayName('gpt-x')).toBeUndefined()
    expect(dashboardLines({ ...base, cacheNow: null, contextPercent: null }).head).toBe('✦ Medium')
    expect(weighted({ input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 1000, cache_creation_input_tokens: 4 })).toBe(10 + 10 + 50 + 8)
    // 5-minute writes cost 1.25, 1-hour writes 2.
    expect(weighted({ cache_creation_input_tokens: 12, cache_creation: { ephemeral_5m_input_tokens: 8, ephemeral_1h_input_tokens: 4 } })).toBe(10 + 8)
  })

  test('the effort word and the figures after it are drawn apart, so the figures can be cut and the word stays whole', () => {
    const base = { auto: true, paused: false, judging: false, effort: 'low' as const, cacheNow: 42, contextPercent: null, reason: '', last: null }
    expect(dashboardLines(base).what).toBe('Low')
    expect(dashboardLines(base).rest).toBe(` · cache ${cacheLabel(42)}`)
    expect(dashboardLines({ ...base, cacheNow: null }).rest).toBe('')
  })

  test('a new effort glows violet, then turns the band white in one redraw', () => {
    expect(flashColor(0)).toBe('#9b7bff')
    expect(flashColor(999)).toBe('#9b7bff')
    expect(new Set([1000, 1160, 1320, 1480, 1640].map(flashColor)).size).toBe(5)
    expect(flashColor(1400)).not.toBe('#9b7bff')
    expect(flashColor(1400)).not.toBe('#d4d4d8')
    expect(flashColor(null)).toBe('#d4d4d8')
    expect(flashColor(1800)).toBe('#d4d4d8')
  })

  test('desktop: Auto switched off does not light the word up: it turns Off in white', { options: { layout: 'default', appearance: 'dark' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    on('prompt.read', () => ({ value: { text: '', cursor: 0 } }) as never)
    on('prompt.fill', () => ({ isFilled: true }) as never)
    await start($, on)
    await closeSetup($, DESK_BAND)
    const first = await $.ui.mount(DESK_BAND)
    await first.unmount()
    // Picking an effort by hand turns Auto off, so the word becomes Off: the switch says so, no flash.
    const rows = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'terminal', ...BAND })
    await rows.press({ key: 'e-low' })
    await rows.unmount()
    const band = await $.ui.mount(DESK_BAND)
    // The app's own text colour (Automatic and the painted modes look alike on the desktop), not the flash.
    const word = (await drawn(band)).match(/"props":\{([^}]*)"bold":true[^}]*},"hover":\{[^}]*},"children":\["\w+ \d+\.\d+ · Low"\]/)
    expect(word).not.toBeNull()
    expect(word![1]).not.toContain(highlight())
    await band.unmount()
  })

  test("desktop: the band above the prompt at rest, with Auto, Handoff and settings; the footer is the app's own", UNCAPPED, async ($, on) => {
    engine(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 180_000, window: 1_000_000, percent: 18 } } }) as never)
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    // The context as a ring and a figure, as Claude Code's /context counts it: the share of the window in force, and
    // which window that is (no window read yet here, so the session's own figure).
    expect(await band.find({ key: 'dash-ring' })).toBeDefined()
    expect(await drawn(band)).toContain('"children":["180k / 1M (18%)"]')
    expect(await band.find({ key: 'dash-auto' })).toBeDefined()
    expect(await band.find({ key: 'dash-settings' })).toBeDefined()
    // A drawn icon on desktop, not the word.
    expect(await band.find({ key: 'dash-settings-icon' })).toBeDefined()
    expect(await drawn(band)).not.toContain('"label":"Settings"')
    // The mark stands in for the ✦ on desktop.
    expect(await band.find({ key: 'dash-mark' })).toBeDefined()
    await band.press({ key: 'dash-auto' })
    expect(await drawn(band)).toContain('Default')
    // One button: Compact on a fresh chat. It opens the compact card, which can switch to Handoff.
    await band.press({ key: 'dash-handoff' })
    expect(await drawn(band)).toContain('compact-bar')
    await band.press({ key: 'compact-to-handoff' })
    expect(await drawn(band)).toContain('⇥ Handoff')
    await band.unmount()
    await drawsNothing($, FOOTER)
  })

  test('Handoff button set to always: Handoff from the start, calm, no glow, with Compact beside it', { options: { layout: 'default', handoffButton: 'always' } } as never, async ($, on) => {
    engine(on)
    recordSteps(on)
    const mocked = mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 100_000, window: 1_000_000, percent: 10 } } }) as never)
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'dash-handoff' })).toBeDefined()
    expect(await band.find({ key: 'dash-glow' })).toBeUndefined()
    expect(await band.find({ key: 'dash-handoff-h' })).toBeUndefined()
    const text = await drawn(band)
    expect(text).toContain('Handoff')
    // Compact stays beside it as quiet text, so both are a press away.
    expect(await band.find({ key: 'dash-compact' })).toBeDefined()
    await band.unmount()
  })

  test('readConfig keeps handoffButton to advised or always', () => {
    expect(readConfig({}).handoffButton).toBe('advised')
    expect(readConfig({ handoffButton: 'always' }).handoffButton).toBe('always')
    expect(readConfig({ handoffButton: 'sometimes' }).handoffButton).toBe('advised')
  })

  test('one button: Compact until the Haiku check says a handoff would suit; then Handoff, lit, with the reason', UNCAPPED, async ($, on) => {
    engine(on)
    recordSteps(on)
    const mocked = mock.clock(on)
    // Past the handoff check's start: half the way to compaction (here 967k), at least 150k; below Auto's swamp (507k).
    on('session.usage', () => ({ value: { context: { tokens: 490_000, window: 1_000_000, percent: 49 } } }) as never)
    let handoff: string | null = null
    const systems: string[] = []
    on('model.complete', (_$, e) => {
      systems.push(String((e as { system?: string }).system ?? '').slice(0, 30))
      const text = String((e as { system?: string }).system ?? '').includes('decide whether the person should hand off')
        ? JSON.stringify({ handoff })
        : '{"model":"opus","effort":"high","why":"big refactor"}'
      return { value: { isAnswered: true as const, text, usage: USAGE } }
    })
    await start($, on)
    await closeSetup($, DESK_BAND)
    await mocked.advance(16_000)
    // A fairly full chat, no advice: no glow, no H key, one button, and it says Slim down (it opens the compact bar,
    // which offers Handoff too).
    let band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'dash-handoff' })).toBeDefined()
    expect(await drawn(band)).toContain(`"children":["${SLIM_LABEL}"]`)
    expect(await drawn(band)).toContain('M7 2.2V11.8')
    expect(await band.find({ key: 'dash-compact' })).toBeUndefined()
    expect(await band.find({ key: 'dash-handoff-h' })).toBeUndefined()
    expect(await band.find({ key: 'dash-glow' })).toBeUndefined()
    expect(await drawn(band)).not.toContain('"Compact"')
    await band.unmount()
    // The check runs every second message from 30%. Haiku says a handoff would suit.
    handoff = 'Task done, new topic'
    await $.prompt.submit({ text: 'completely different: help me plan a trip to Lisbon', wait: false, origin: { kind: 'composer' } })
    await step($)
    await $.prompt.submit({ text: 'and which neighbourhood should I stay in for the first night', wait: false, origin: { kind: 'composer' } })
    await step($)
    band = await $.ui.mount(DESK_BAND)
    expect((await band.find({ key: 'dash-handoff-h' }))?.props).toMatchObject({ hotkey: 'h' })
    expect(await band.find({ key: 'dash-glow' })).toBeDefined()
    expect(await drawn(band)).toContain('Handoff would suit: Task done, new topic')
    await band.unmount()
    // A later check that says no clears it again.
    handoff = null
    await $.prompt.submit({ text: 'now make the Lisbon plan a three day one with a budget', wait: false, origin: { kind: 'composer' } })
    await step($)
    await $.prompt.submit({ text: 'add the cost of the tram tickets to the budget as well', wait: false, origin: { kind: 'composer' } })
    await step($)
    band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'dash-glow' })).toBeUndefined()
    expect(await drawn(band)).not.toContain('Handoff would suit')
    await band.unmount()
  })

  test('the handoff check reads the purpose, the trail, the last reply, the fill and the cache; an unclear answer is no', () => {
    const messages = [
      { role: 'user', text: 'build the settings page' },
      { role: 'assistant', text: 'done, anything else?' },
      { role: 'user', text: 'also fix the footer' },
      { role: 'assistant', text: 'footer fixed' },
    ]
    const text = handoffEvidence(messages, 'plan a trip to Lisbon', 420_000, 967_000, true)
    expect(text).toContain('build the settings page')
    expect(text).toContain('footer fixed')
    expect(text).toContain('plan a trip to Lisbon')
    expect(text).toContain('Context: 420k tokens; compaction at 967k tokens')
    expect(text).toContain('cache is cold')
    expect(handoffEvidence(messages, 'x', 420_000, null, false)).toContain('auto-compaction is off')
    expect(parseHandoffAnswer('{"handoff":"Task done"}')).toBe('Task done')
    expect(parseHandoffAnswer('{"handoff":null}')).toBeNull()
    expect(parseHandoffAnswer('{"handoff":"  "}')).toBeNull()
    expect(parseHandoffAnswer('maybe')).toBeNull()
  })

  test('parseVerdict keeps only a real handoff reason', () => {
    const base = '"model":"opus","effort":"high","why":"x"'
    expect(parseVerdict(`{${base},"handoff":"Task done"}`)?.handoff).toBe('Task done')
    expect(parseVerdict(`{${base},"handoff":"   "}`)?.handoff).toBeUndefined()
    expect(parseVerdict(`{${base},"handoff":false}`)?.handoff).toBeUndefined()
    expect(parseVerdict(`{${base}}`)?.handoff).toBeUndefined()
  })

  test('the Handoff glow steps up every 10% from 30%', () => {
    expect([0, 29, 30, 39, 40, 55, 69, 70, 95].map(handoffGlowStep)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5])
  })

  test('the running-low band: Skip for now, Skip this week, and a way to the switch in Settings → Effort', DASH, async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    await closeSetup($, DESK_BAND)
    await $.command.run({ command: 'smarttokensaver', args: 'hot' } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'hot-later' })).toBeDefined()
    expect(await band.find({ key: 'hot-skip' })).toBeDefined()
    // At 100 columns the second line is the reset and the guide link alone, so neither is cut.
    expect(await band.find({ key: 'hot-settings' })).toBeUndefined()
    expect(await drawn(band)).toContain('What is Save mode?')
    await band.unmount()
    // A wide band names Settings → Effort too, and it opens there.
    const wide = await $.ui.mount({ ...(DESK_BAND as object), props: { ...BAND.props, bodyColumns: 150 } } as never)
    await wide.press({ key: 'hot-settings' })
    expect(await wide.find({ key: 'settings-save-switch' })).toBeDefined()
    await wide.unmount()
  })

  test("an alert takes the dashboard's place, and the dashboard comes back after it", DASH, async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    await closeSetup($, DESK_BAND)
    await $.command.run({ command: 'smarttokensaver', args: 'hot' } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Running low')
    expect(await band.find({ key: 'dash-auto' })).toBeUndefined()
    await band.press({ key: 'hot-later' })
    expect(await band.find({ key: 'dash-auto' })).toBeDefined()
    await band.unmount()
  })

  test('terminal: the same band with the effort row under it', DASH, async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on, 'terminal')
    const at = { plugin: 'smarttokensaver', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 120, maxRows: 14 } } as never
    await closeSetup($, at)
    const band = await $.ui.mount(at)
    const text = await drawn(band)
    // Auto is switched in the bar, not twice: the effort row under it drops its own.
    const before = (await band.find({ key: 'dash-auto' }))?.text
    expect(before).toContain('Smart')
    expect(await band.find({ key: 'auto' })).toBeUndefined()
    await band.press({ key: 'dash-auto' })
    expect((await band.find({ key: 'dash-auto' }))?.text).not.toBe(before)
    expect(await band.find({ key: 'dash-handoff' })).toBeDefined()
    expect(text).toContain('"children":["Effort"]')
    // No still sparkles at rest: 16 by 4 pixels of them read as noise in a terminal.
    expect(text).not.toContain('"type":"Raster"')
    await band.unmount()
  })

  test("the minimal look draws no band and keeps the footer's buttons", { options: { layout: 'minimal' } } as never, async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    await closeSetup($, DESK_BAND)
    await drawsNothing($, DESK_BAND)
    const footer = await $.ui.mount(FOOTER)
    expect(await footer.find({ key: 'auto' })).toBeDefined()
    await footer.unmount()
  })
})

describe('a chat opened again', () => {
  const start = async ($: Engine, on: On) => {
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('classic.SessionStart', () => ({}) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }
  const closeSetup = async ($: Engine) => {
    const guide = await $.ui.mount(DESK_BAND)
    await guide.press({ key: 'setup-close' })
    await guide.unmount()
  }

  test('two hours after its last response: the cache shows cold at once', async ($, on) => {
    engine(on)
    on('session.usage', () => ({ value: { context: { tokens: 500_000, window: 1_000_000, percent: 50 } } }) as never)
    mock.clock(on)
    await start($, on)
    await closeSetup($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 7200, prompt_cache_likely_expired: true } as never)
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat went cold')
    await band.unmount()
  })

  test('a small chat that went cold shows no band: rereading it costs too little', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('session.usage', () => ({ value: { context: { tokens: 30_000, window: 1_000_000, percent: 3 } } }) as never)
    await start($, on)
    await closeSetup($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 7200, prompt_cache_likely_expired: true } as never)
    await drawsNothing($, DESK_BAND)
  })

  test('ten minutes after: the countdown goes on from where it was, no cold band', async ($, on) => {
    engine(on)
    mock.clock(on)
    await start($, on)
    await closeSetup($)
    await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 600, prompt_cache_likely_expired: false } as never)
    await drawsNothing($, DESK_BAND)
    const footer = await $.ui.mount(FOOTER)
    expect(await drawn(footer)).toMatch(/"(49|50)m"/)
    await footer.unmount()
  })
})

describe('handoff look', () => {
  test('no box at 0%, the grey box at 15%, white at 30% where the glow starts, a step each percent', () => {
    expect(handoffLook(0).opacity).toBe(0)
    expect(handoffLook(15)).toMatchObject({ opacity: 1, fill: '#2b2b2f' })
    expect(handoffLook(30)).toMatchObject({ fill: '#ececf0', label: '#141416' })
    expect(handoffLook(80)).toEqual(handoffLook(30))
    expect(new Set(Array.from({ length: 31 }, (_, p) => JSON.stringify(handoffLook(p)))).size).toBe(31)
  })
})

describe('a message typed while a turn runs', () => {
  /** The judge answers with whatever `says.effort` holds at the time. */
  function judgeSaysNow(on: On, says: { effort: string }) {
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(e.prompt)
      return { value: { isAnswered: true as const, text: `{"model":"opus","effort":"${says.effort}","why":"x"}`, usage: USAGE } }
    })
    return asked
  }
  /** One request of turn `turnId` at request `index`. */
  async function stepOf($: Engine, turnId: string, index: number) {
    for await (const _ of $.turn.step({ turnId, index, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })) {
      // drain
    }
  }

  test('a lower verdict never lowers the running turn; it takes the next one', async ($, on) => {
    engine(on)
    const says = { effort: 'high' }
    const asked = judgeSaysNow(on, says)
    const sent = recordSteps(on)
    mock.clock(on)
    on('turn.complete', () => ({ text: '' }) as never)

    await $.prompt.submit({ text: 'refactor the whole auth module across the app', wait: false, origin: { kind: 'composer' } })
    await stepOf($, 't1', 0)
    says.effort = 'low'
    await $.prompt.submit({ text: 'also rename the helper you made', wait: false, turnId: 't1', origin: { kind: 'composer' } } as never)
    await stepOf($, 't1', 1)
    await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, reason: 'completed' } as never)
    await stepOf($, 't2', 0)

    expect(asked.length).toBe(2)
    // The judge is told the message came in while the task ran.
    expect(asked[1]).toContain('still working')
    expect(sent.map(s => s.effort)).toEqual(['high', 'high', 'low'])
  })

  test('a higher verdict raises the running turn at once', async ($, on) => {
    engine(on)
    const says = { effort: 'low' }
    judgeSaysNow(on, says)
    const sent = recordSteps(on)

    await $.prompt.submit({ text: 'fix the typo in the readme', wait: false, origin: { kind: 'composer' } })
    await stepOf($, 't1', 0)
    says.effort = 'high'
    await $.prompt.submit({ text: 'actually go through every doc and fix them all', wait: false, turnId: 't1', origin: { kind: 'composer' } } as never)
    await stepOf($, 't1', 1)

    expect(sent.map(s => s.effort)).toEqual(['low', 'high'])
  })

  test('Auto switched off or on mid-turn leaves the running turn at its effort', async ($, on) => {
    engine(on)
    const says = { effort: 'high' }
    judgeSaysNow(on, says)
    const sent = recordSteps(on)
    const auto = () => $.command.run({ command: 'smarttokensaver', args: 'auto' })

    await $.prompt.submit({ text: 'refactor the whole auth module across the app', wait: false, origin: { kind: 'composer' } })
    await stepOf($, 't1', 0)
    expect(String((await auto()).text)).toContain('Default:')
    await stepOf($, 't1', 1)
    expect(String((await auto()).text)).toContain('Smart:')
    await stepOf($, 't1', 2)

    expect(sent.map(s => s.effort)).toEqual(['high', 'high', 'high'])
  })
})

describe('updates', () => {
  const DESK = { options: { layout: 'default' } } as never
  /** A session with `installed` on disk and `latest` on main; records what the mod runs. */
  function world(on: On, v: { installed: string; latest: string; fails?: string; failsOn?: (argv: string) => boolean; git?: string; noCli?: (bin: string) => boolean; env?: Record<string, string>; installedAs?: { id: string; scope: string; projectPath?: string }; installedAll?: Record<string, unknown[]>; root?: string }) {
    engine(on, v.env)
    const clock = mock.clock(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    if (v.root) on('session.root', () => ({ value: v.root }) as never)
    on('fs.read', (_$, e) => {
      // The marketplace's own copy holds the newest version; the running install holds `installed`.
      if (String(e.path).replaceAll('\\', '/').includes('/marketplaces/') && String(e.path).endsWith('.claude-plugin/plugin.json')) return { value: JSON.stringify({ version: v.latest }) } as never
      if (String(e.path).replaceAll('\\', '/').endsWith('.claude-plugin/plugin.json')) return { value: JSON.stringify({ version: v.installed }) } as never
      // The plugin list: every record given, or this plugin installed as installedAs, at its own folder.
      if (v.installedAll && String(e.path).endsWith('plugins/installed_plugins.json')) return { value: JSON.stringify({ version: 2, plugins: v.installedAll }) } as never
      if (v.installedAs && String(e.path).endsWith('plugins/installed_plugins.json'))
        return { value: JSON.stringify({ version: 2, plugins: { [v.installedAs.id]: [{ scope: v.installedAs.scope, installPath: ROOT, ...(v.installedAs.projectPath ? { projectPath: v.installedAs.projectPath } : {}) }] } }) } as never
      return { value: '' } as never
    })
    on('http.fetch', (_$, e) => {
      if (String(e.url).includes('public.json'))
        return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify([{ version: v.latest, date: '2026-10-07', note: 'Quick and Full as one switch.' }]) } } as never
      return { value: { status: 404, ok: false, headers: {}, text: '' } } as never
    })
    const ran: string[] = []
    const envs: (Record<string, string> | undefined)[] = []
    const cwds: (string | undefined)[] = []
    on('process.run', (_$, e) => {
      // No claude where the app looks: the engine refuses to start it, as it does for a desktop-only user.
      if (v.noCli?.(e.argv[0])) return { deny: `$.process.run(${e.argv[0]}) failed to start: ENOENT: Command '${e.argv[0]}' not found or is in an unsafe location (current directory)` } as never
      ran.push(e.argv.join(' '))
      envs.push(e.init?.env)
      cwds.push(e.init?.cwd)
      // git show answers with public.json as it is on stable, when the test gives one.
      const stdout = e.argv[0] === 'git' && e.argv.includes('show') ? (v.git ?? '') : ''
      if (v.failsOn?.(e.argv.join(' '))) return { value: { exitCode: 1, stdout: '', stderr: 'boom' } } as never
      return { value: v.fails ? { exitCode: 1, stdout: '', stderr: v.fails } : { exitCode: 0, stdout, stderr: '' } } as never
    })
    const commands: string[] = []
    const commandArgs: string[] = []
    on('command.run', (_$, e) => {
      commands.push(`/${e.command}`)
      if (e.args) commandArgs.push(`/${e.command} ${e.args}`)
      return { text: 'ok' }
    })
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push((e as { text: string }).text)
      return { value: { isCopied: true as const } } as never
    })
    return { clock, ran, envs, cwds, commands, commandArgs, copied }
  }
  const settle = () => new Promise(resolve => setTimeout(resolve, 30))
  /** Through the setup guide a first session opens, which takes the band before any card. */
  async function pastSetup(ui: { find: (q: { key: string }) => Promise<unknown>; press: (q: { key: string }) => Promise<unknown> }) {
    for (let i = 0; i < 6 && (await ui.find({ key: 'setup-close' })); i++)
      await ui.press({ key: 'setup-close' })
  }
  const start = ($: Engine) => $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)

  test('versions compare by number and releases.json gives its newest entry', () => {
    expect(isNewer('1.35.80', '1.35.79')).toBe(true)
    expect(isNewer('1.36.0', '1.35.99')).toBe(true)
    expect(isNewer('1.35.9', '1.35.10')).toBe(false)
    expect(isNewer('1.35.79', '1.35.79')).toBe(false)
    expect(latestRelease('[{"version":"1.2.3","note":"x"},{"version":"1.2.2"}]')).toEqual({ version: '1.2.3', note: 'x' })
    expect(latestRelease('not json')).toBeUndefined()
    expect(latestRelease('[{"version":"latest"}]')).toBeUndefined()
  })

  test('the one button says Compact, opens the compact step, and stays on a narrow bar', DESK, async ($, on) => {
    world(on, { installed: '1.0.1', latest: '1.0.1' })
    await start($)
    await settle()
    const wide = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(wide)
    expect(await wide.find({ key: 'dash-compact' })).toBeUndefined()
    expect(await wide.find({ key: 'dash-handoff' })).toBeDefined()
    await wide.press({ key: 'dash-handoff' })
    await settle()
    expect(await drawn(wide)).toContain('compact-bar')
    await wide.press({ key: 'compact-close' })
    await settle()
    await wide.unmount()
    const narrow = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns: 60 } } as never)
    await pastSetup(narrow)
    expect(await narrow.find({ key: 'dash-handoff' })).toBeDefined()
    await narrow.unmount()
  })

  // An upstream release is reviewed in a new session, never installed in place.
  test('Settings shows no Star link anywhere; it belongs on the Updated card only', DESK, async ($, on) => {
    world(on, { installed: '1.0.1', latest: '1.0.1' })
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    expect(await drawn(ui)).not.toContain('Star')
    await ui.press({ key: 'settings-card-show' })
    expect(await drawn(ui)).not.toContain('Star')
    await ui.unmount()
  })

  test('Support, Updates: a newer version on its marketplace is offered above the prompt; Update runs claude plugin update for this install', DESK, async ($, on) => {
    const w = world(on, { installed: '1.0.0', latest: '1.1.0', env: { HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '0' }, installedAs: { id: 'smarttokensaver@stts', scope: 'user' } })
    on('ui.toast', () => ({ value: undefined }) as never)
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await settle()
    expect(w.ran).toContain('claude plugin marketplace update stts')
    expect(await drawn(ui)).toContain('Smart Token Saver 1.1.0 is out')
    await ui.press({ key: 'update-go' })
    await settle()
    expect(w.ran).toContain('claude plugin update smarttokensaver@stts --scope user')
    // No forced reload in the running chat: it can cost this chat its cache. The toast names the command.
    expect(w.commands).not.toContain('/reload-plugins')
    await ui.unmount()
  })

  test('Support, Updates: an update that fails says so and brings its card back', DESK, async ($, on) => {
    const w = world(on, { installed: '1.0.0', latest: '1.1.0', failsOn: argv => argv.includes('plugin update'), env: { HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '0' }, installedAs: { id: 'smarttokensaver@stts', scope: 'user' } })
    const told: string[] = []
    on('ui.toast', (_$, e) => {
      told.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await settle()
    expect(await drawn(ui)).toContain('Smart Token Saver 1.1.0 is out')
    await ui.press({ key: 'update-go' })
    await settle()
    expect(told.join(' ')).toContain('the update failed')
    expect(told.join(' ')).not.toContain('is installed')
    expect(await drawn(ui)).toContain('Smart Token Saver 1.1.0 is out')
    await ui.unmount()
  })

  test('Support, Updates: Skip holds for Check now and /smarttokensaver support, which says what it found', DESK, async ($, on) => {
    const w = world(on, { installed: '1.0.0', latest: '1.1.0', env: { HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '0' }, installedAs: { id: 'smarttokensaver@stts', scope: 'user' } })
    on('ui.toast', () => ({ value: undefined }) as never)
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await settle()
    expect(await drawn(ui)).toContain('Smart Token Saver 1.1.0 is out')
    await ui.press({ key: 'update-skip' })
    await settle()
    expect(await drawn(ui)).not.toContain('1.1.0 is out')
    const said = String(((await $.command.run({ command: 'smarttokensaver', args: 'support' })) as { text?: string }).text)
    expect(said).toContain('the newest version is skipped')
    await settle()
    expect(await drawn(ui)).not.toContain('1.1.0 is out')
    expect(w.ran.filter(r => r.startsWith('claude plugin update'))).toEqual([])
    await ui.unmount()
  })

  test('listedVersion reads the version of this install only: same scope, same project', () => {
    const installed = { plugins: { 'smarttokensaver@stts': [
      { scope: 'project', projectPath: '/p/a', version: '1.0.0' },
      { scope: 'user', version: '1.1.0' },
    ] } }
    expect(listedVersion(installed, { id: 'smarttokensaver@stts', scope: 'user' })).toBe('1.1.0')
    expect(listedVersion(installed, { id: 'smarttokensaver@stts', scope: 'project', projectPath: '/p/a' })).toBe('1.0.0')
    expect(listedVersion(installed, { id: 'smarttokensaver@stts', scope: 'project', projectPath: '/p/b' })).toBe('')
    expect(listedVersion(null, { id: 'x@y', scope: 'user' })).toBe('')
  })

  test('Uninstall in Customize asks for a second press, then uninstalls this install, in its scope, and reloads', DESK, async ($, on) => {
    const w = world(on, { installed: '1.0.1', latest: '1.0.1', env: { HOME: '/home/t' }, installedAs: { id: 'smarttokensaver@team', scope: 'project', projectPath: '/work/p' } })
    on('ui.toast', () => ({ value: undefined }) as never)
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    await ui.press({ key: 'settings-card-show' })
    expect(await drawn(ui)).toContain('Customize')
    w.ran.length = 0
    await ui.press({ key: 'settings-uninstall' })
    expect(w.ran).toEqual([])
    expect(await drawn(ui)).toContain('Press again to uninstall')
    await ui.press({ key: 'settings-uninstall' })
    await settle()
    expect(w.ran.filter(c => !c.includes('marketplace update'))).toEqual(['claude plugin uninstall smarttokensaver@team --scope project'])
    // A project install is removed from its project.
    expect(w.cwds.filter(Boolean)).toEqual(['/work/p'])
    expect(w.commands).toContain('/reload-plugins')
    await ui.unmount()
  })

  test('Uninstall of a copy loaded from a folder (not in the plugin list) runs nothing and says why', DESK, async ($, on) => {
    const w = world(on, { installed: '1.0.1', latest: '1.0.1' })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    await ui.press({ key: 'settings-card-show' })
    w.ran.length = 0
    await ui.press({ key: 'settings-uninstall' })
    await ui.press({ key: 'settings-uninstall' })
    await settle()
    expect(w.ran.filter(c => c.includes('uninstall'))).toEqual([])
    expect(toasts.join(' ')).toContain('loaded from a folder')
    await ui.unmount()
  })

  test('Uninstall with one cached copy for two projects removes the install of this chat\'s project, in that project', DESK, async ($, on) => {
    const w = world(on, {
      installed: '1.0.1', latest: '1.0.1', env: { HOME: '/home/t' }, root: '/work/b',
      // Claude Code caches one copy per marketplace, plugin and version: both project installs share the path.
      installedAll: { 'smarttokensaver@team': [{ scope: 'project', installPath: ROOT, projectPath: '/work/a' }, { scope: 'project', installPath: ROOT, projectPath: '/work/b' }] },
    })
    on('ui.toast', () => ({ value: undefined }) as never)
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    await ui.press({ key: 'settings-card-show' })
    w.ran.length = 0
    w.cwds.length = 0
    await ui.press({ key: 'settings-uninstall' })
    await ui.press({ key: 'settings-uninstall' })
    await settle()
    expect(w.ran).toEqual(['claude plugin uninstall smarttokensaver@team --scope project'])
    expect(w.cwds).toEqual(['/work/b'])
    await ui.unmount()
  })

  test('Uninstall: a project install at the same path for another project does not count, so the user install goes', DESK, async ($, on) => {
    const w = world(on, {
      installed: '1.0.1', latest: '1.0.1', env: { HOME: '/home/t' }, root: '/work/b',
      installedAll: { 'smarttokensaver@team': [{ scope: 'user', installPath: ROOT }, { scope: 'project', installPath: ROOT, projectPath: '/work/my project' }] },
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    await ui.press({ key: 'settings-card-show' })
    w.ran.length = 0
    await ui.press({ key: 'settings-uninstall' })
    await ui.press({ key: 'settings-uninstall' })
    await settle()
    // /work/b is not "/work/my project": only the user install applies here, so that one goes.
    expect(w.ran).toEqual(['claude plugin uninstall smarttokensaver@team --scope user'])
    await ui.unmount()
    expect(ownInstalls({ plugins: { 'smarttokensaver@team': [{ scope: 'user', installPath: ROOT }, { scope: 'project', installPath: ROOT, projectPath: '/work/b' }] } }, ROOT, '/work/b/src')).toHaveLength(2)
    expect(ownInstall({ plugins: { 'smarttokensaver@team': [{ scope: 'user', installPath: ROOT }, { scope: 'project', installPath: ROOT, projectPath: '/work/b' }] } }, ROOT, '/work/b')).toBeNull()
    expect(uninstallLine({ id: 'smarttokensaver@team', scope: 'project', projectPath: "/work/it's here" })).toBe("cd '/work/it'\\''s here' && claude plugin uninstall smarttokensaver@team --scope project")
    expect(uninstallLine({ id: 'smarttokensaver@team', scope: 'user' })).toBe('claude plugin uninstall smarttokensaver@team --scope user')
    expect(toasts.join(' ')).not.toContain('more than once')
  })

  test('Uninstall that cannot tell which install runs (user and this project at one path) runs nothing and gives the lines', DESK, async ($, on) => {
    const w = world(on, {
      installed: '1.0.1', latest: '1.0.1', env: { HOME: '/home/t' }, root: '/work/b',
      installedAll: { 'smarttokensaver@team': [{ scope: 'user', installPath: ROOT }, { scope: 'project', installPath: ROOT, projectPath: '/work/b' }] },
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    await start($)
    await settle()
    const ui = await $.ui.mount({ plugin: 'smarttokensaver', surface: 'desktop', ...BAND })
    await pastSetup(ui)
    await ui.press({ key: 'dash-settings' })
    await ui.press({ key: 'settings-card-show' })
    w.ran.length = 0
    await ui.press({ key: 'settings-uninstall' })
    await ui.press({ key: 'settings-uninstall' })
    await settle()
    expect(w.ran.filter(c => c.includes('uninstall'))).toEqual([])
    const said = toasts.join(' ')
    expect(said).toContain('installed more than once here')
    expect(said).toContain('claude plugin uninstall smarttokensaver@team --scope user')
    expect(said).toContain('cd /work/b && claude plugin uninstall smarttokensaver@team --scope project')
    await ui.unmount()
  })

  test('claude is looked for on PATH, then where the Windows and Mac installers put it', () => {
    expect(claudeCandidates('C:/Users/friend')).toEqual(['claude', 'C:/Users/friend/.local/bin/claude.exe'])
    expect(claudeCandidates('/Users/friend')).toEqual(['claude', '/Users/friend/.local/bin/claude'])
    expect(claudeCandidates(undefined)).toEqual(['claude'])
    expect(noClaudeHint("$.process.run(claude) failed to start: ENOENT: Command 'claude' not found or is in an unsafe location (current directory)", 'C:/Users/friend')).toContain('install.ps1')
    expect(noClaudeHint('spawn claude ENOENT', '/Users/friend')).toContain('install.sh')
    expect(noClaudeHint('network down', '/Users/friend')).toBeUndefined()
  })

})

describe('agent panel', () => {
  const PANE = {
    plugin: 'smarttokensaver',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'smarttokensaver-agents',
    props: { title: 'Agents', isFocused: false, bodyColumns: 46, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  } as never
  const start = async ($: Engine, on: On) => {
    engine(on)
    mock.clock(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
    on('command.register', () => ({ value: undefined }) as never)
    on('classic.SessionStart', () => ({}) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
  }

  test('the demo shows a card per agent still going and folds the finished ones into one', async ($, on) => {
    await start($, on)
    const reply = await $.command.run({ command: 'smarttokensaver', args: 'agents demo' })
    expect(String(reply.text)).toContain('agent panel')
    const pane = await $.ui.mount(PANE)
    const text = await drawn(pane)
    // A tree for tools/render-band (--tree), when asked for.
    if (text && (globalThis as { AGENT_TREE?: boolean }).AGENT_TREE) console.log(`AGENT_TREE ${text}`)
    for (const id of ['demo-1', 'demo-2', 'demo-3']) expect(await pane.find({ key: `agent-${id}` })).toBeDefined()
    expect(await pane.find({ key: 'agent-demo-4' })).toBeUndefined()
    expect(text).toContain('✓ 2 done')
    expect(text).toContain('1 waiting')
    expect(text).toContain('waiting on Bash npm test')
    // Pressing a card opens it: the pick and why show.
    await pane.press({ key: 'agent-demo-2-press' })
    expect(await drawn(pane)).toContain('a review before merge')
    await pane.unmount()
  })

  test('a spawned agent runs, waits on a long tool, and is done when its loop answers', async ($, on) => {
    on('agent.spawn', () => ({ agentId: 'a1', model: 'claude-haiku-5-5' }) as never)
    on('tool.call', () => ({ result: 'ok', isError: false }) as never)
    on('turn.complete', () => ({ text: '' }))
    await start($, on)
    await $.agent.spawn({ prompt: 'look around', description: 'find the hooks', subagentType: 'Explore' } as never)
    await $.command.run({ command: 'smarttokensaver', args: 'agents' })
    const pane = await $.ui.mount(PANE)
    expect(await drawn(pane)).toContain('1 working')
    expect(await drawn(pane)).toContain('find the hooks')
    await $.tool.call({ tool: 'Grep', pattern: 'agentId', agentId: 'a1' } as never)
    expect(await drawn(pane)).toContain('Grep agentId')
    await $.turn.complete({ turnId: 'x', agentId: 'a1', answer: 'found', durationMs: 1, isAborted: false, reason: 'answer' } as never)
    const text = await drawn(pane)
    expect(text).toContain('All done')
    expect(text).toContain('✓ 1 done')
    await pane.unmount()
  })

  test('with Helpers on, the judge picks a subagent\'s effort at its spawn and every request of it runs at that', { options: { helpers: 'on' } } as never, async ($, on) => {
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"quick search"}')
    on('agent.spawn', () => ({ agentId: 'h1', model: 'claude-opus-5-5' }) as never)
    on('turn.complete', () => ({ text: '' }))
    const sent = recordSteps(on)
    await start($, on)
    await $.agent.spawn({ prompt: 'list the files under hooks', description: 'find files', subagentType: 'Explore' } as never)
    expect(asked.some(p => p.includes('Explore subagent'))).toBe(true)
    for (const index of [0, 1]) {
      for await (const _ of $.turn.step({ turnId: 't1', index, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: 'h1' } as never)) {
        // drain
      }
    }
    // Helpers start at medium: a low verdict comes up to it.
    expect(sent.map(s => s.effort)).toEqual(['medium', 'medium'])
    await $.command.run({ command: 'smarttokensaver', args: 'agents' })
    const pane = await $.ui.mount(PANE)
    await pane.press({ key: 'agent-h1-press' }).catch(() => undefined)
    expect(await drawn(pane)).toContain('Medium')
    expect(await drawn(pane)).toContain('helpers start at medium')
    await pane.unmount()
  })

  test('a subagent\'s first request before its spawn resolves still gets the picked effort', { options: { helpers: 'on' } } as never, async ($, on) => {
    judgeSays(on, '{"model":"opus","effort":"low","why":"quick search"}')
    const sent = recordSteps(on)
    on('agent.list', () => ({ value: [{ id: 'h2', description: 'find files', type: 'Explore', status: 'running' }] }) as never)
    // The engine's own spawn: the subagent's first request goes out before the spawn answers with its id.
    let early: Promise<void> | null = null
    on('agent.spawn', async () => {
      early = (async () => {
        for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: 'h2' } as never)) {
          // drain
        }
      })()
      await early
      return { agentId: 'h2', model: 'claude-opus-5-5' } as never
    })
    await start($, on)
    await $.agent.spawn({ prompt: 'list the files under hooks', description: 'find files', subagentType: 'Explore' } as never)
    expect(sent.map(s => s.effort)).toEqual(['medium'])
  })

  test("helperFloor: medium, the person's Min when higher, never above their Max", () => {
    expect(helperFloor('low', 'max')).toBe('medium')
    expect(helperFloor('high', 'max')).toBe('high')
    expect(helperFloor('low', 'low')).toBe('low')
  })

  test('with Helpers off, a subagent runs at the chat\'s effort and the judge is not asked', async ($, on) => {
    const asked = judgeSays(on, '{"model":"opus","effort":"low","why":"quick search"}')
    on('agent.spawn', () => ({ agentId: 'h3', model: 'claude-opus-5-5' }) as never)
    const sent = recordSteps(on)
    await start($, on)
    await $.agent.spawn({ prompt: 'list the files', description: 'find files', subagentType: 'Explore' } as never)
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId: 'h3' } as never)) {
      // drain
    }
    expect(asked.some(p => p.includes('subagent'))).toBe(false)
    expect(sent.map(s => s.effort)).toEqual(['high'])
  })

  test('with Helpers off, a subagent of a judged turn runs at the turn\'s effort, never below medium', { options: { effortCeiling: 'max' } } as never, async ($, on) => {
    engine(on)
    let verdict = '{"model":"opus","effort":"xhigh","why":"hard"}'
    const asked: string[] = []
    on('model.complete', (_$, e) => {
      asked.push(e.prompt)
      return { value: { isAnswered: true as const, text: verdict, usage: USAGE } }
    })
    on('agent.spawn', () => ({ agentId: 'h4', model: 'claude-opus-5-5' }) as never)
    const sent = recordSteps(on)
    const sub = async () => {
      for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1, agentId: 'h4' } as never)) {
        // drain
      }
    }
    await $.prompt.submit({ text: 'find why the relay drops messages', wait: false, origin: { kind: 'composer' } })
    await $.agent.spawn({ prompt: 'read relay/worker.js', description: 'read relay', subagentType: 'Explore' } as never)
    await sub()
    verdict = '{"model":"opus","effort":"low","why":"small"}'
    await $.prompt.submit({ text: 'list the files in hooks', wait: false, origin: { kind: 'composer' } })
    await sub()
    // No judge call for the subagent itself; it follows the turn, raised to medium at least.
    expect(asked.some(p => p.includes('subagent'))).toBe(false)
    expect(sent.map(s => s.effort)).toEqual(['xhigh', 'medium'])
  })

  test('the demo map shows the parts touched; a part opens to its files', async ($, on) => {
    await start($, on)
    await $.command.run({ command: 'smarttokensaver', args: 'agents demo' })
    const pane = await $.ui.mount(PANE)
    const text = await drawn(pane)
    expect(text).toContain('Map')
    expect(text).toContain('5 parts touched')
    expect(text).toContain('map of 5 parts of the code')
    // The main chat's own list is the total progress: 2 of 5 steps.
    expect(text).toContain('2 of 5 steps')
    expect(text).not.toContain('register.tsx')
    await pane.press({ key: 'mod-hooks-press' })
    const open = await drawn(pane)
    expect(open).toContain('register.tsx')
    expect(open).toContain('agents.tsx')
    await pane.unmount()
  })

  test("a file the main chat reads lands on the map under its folder", async ($, on) => {
    on('tool.call', () => ({ result: 'ok', isError: false }) as never)
    on('fs.read', () => ({ value: "import { a } from '../types'" }) as never)
    on('session.root', () => ({ value: '/proj' }) as never)
    await start($, on)
    await $.tool.call({ tool: 'Read', file_path: '/proj/hooks/x.ts' } as never)
    await $.command.run({ command: 'smarttokensaver', args: 'agents' })
    const pane = await $.ui.mount(PANE)
    const text = await drawn(pane)
    expect(text).toContain('1 part touched')
    expect(text).toContain('hooks')
    await pane.unmount()
  })

  test('imports, folders and links between parts', () => {
    expect(relPath('C:\\proj\\hooks\\a.ts', 'C:/proj')).toBe('hooks/a.ts')
    expect(relPath('/elsewhere/a.ts', '/proj')).toBeNull()
    expect(importsOf('hooks/a.tsx', "import x from './b'\nimport type { T } from '../types'")).toEqual(['hooks/b', 'types'])
    expect(importsOf('pkg/mod.py', 'from .util import x\nimport os')).toEqual(['pkg/util', 'os'])
    expect(moduleOf('docs/agent-panel/mockups/x.mjs')).toBe('docs/agent-panel')
    expect(moduleOf('README.md')).toBe('project')
    let files = withTouch([], 'hooks/a.ts', false, 'main', 1, ['types'])
    files = withTouch(files, 'types/index.d.ts', true, 'a1', 2, [])
    expect(moduleLinks(files)).toEqual(['hooks>types'])
    expect(files.find(f => f.path === 'types/index.d.ts')?.by).toEqual(['a1'])
  })
})

describe('theme', () => {
  test('readConfig reads orange and falls back to navy & orange', () => {
    expect(readConfig({ theme: 'orange' }).theme).toBe('orange')
    expect(readConfig({ theme: ' orange ' }).theme).toBe('orange')
    expect(readConfig({ theme: 'violet' }).theme).toBe('violet')
    expect(readConfig({ theme: 'pink' }).theme).toBe('navy')
    expect(readConfig({}).theme).toBe('navy')
  })

  test('Neutral is a picker option and turns the violets into a cool grey', () => {
    try {
      expect(readConfig({ theme: 'neutral' }).theme).toBe('neutral')
      setTheme('neutral')
      const n = parseInt(tintHex('#a79cf7').slice(1), 16)
      const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
      // Almost no colour left: the channels sit close together.
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40)
      expect(tintHex('#ef4444')).toBe('#ef4444')
    } finally {
      setTheme('violet')
    }
  })

  test('Navy & orange turns violet text sky blue and violet surfaces the app\'s dark grey; orange is only the flash', () => {
    try {
      setTheme('navy')
      const hsl = (hex: string) => {
        const n = parseInt(hex.slice(1), 16)
        const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
        const h = d === 0 ? 0 : max === r ? (((g - b) / d) % 6) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60
        return [(h + 360) % 360, (max + min) / 2]
      }
      const [textHue, textL] = hsl(tintHex('#a79cf7'))
      expect(Math.abs(textHue - 199)).toBeLessThan(4)
      expect(textL).toBeGreaterThan(0.5)
      // Dark violets (surfaces, edges) turn grey, not navy: no channel stands more than a few steps above the others.
      const surf = tintHex('#15121f')
      const [r, g, b] = [1, 3, 5].map(i => parseInt(surf.slice(i, i + 2), 16))
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(6)
      expect(hsl(surf)[1]).toBeLessThan(0.2)
      // Signal colours stay: the cold band's blue, the swamp's green, the hot band's red.
      for (const keep of ['#3b82f6', '#22c55e', '#ef4444', '#2a2a2f']) expect(tintHex(keep)).toBe(keep)
      setLight(false)
      expect(highlight()).toBe('#D97757')
      setLight(true)
      // Never yellow text on a light surface.
      expect(highlight()).toBe('#00243B')
    } finally {
      setLight(false)
      setTheme('violet')
    }
  })

  test('orange turns the violets and leaves greys, greens, blues and yellows alone', () => {
    try {
      setTheme('orange')
      const hue = (hex: string) => {
        const n = parseInt(hex.slice(1), 16)
        const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
        return (h * 60 + 360) % 360
      }
      for (const violet of ['#a79cf7', '#b9a7ff', '#7c6cf0', '#4a3f80', '#15121f', '#9b7bff', '#e4dfff'])
        expect(Math.abs(hue(tintHex(violet)) - 15) < 4).toBe(true)
      for (const same of ['#ffffff', '#000000', '#141416', '#d4d4d8', '#8b8b93', '#2c2c31', '#7fe0a4', '#e0a33a', '#7cc4ff', '#e5534b', '#5d6a86'])
        expect(tintHex(same)).toBe(same)
      expect(tint('<stop stop-color="#a79cf7"/><path fill="#ffffff"/>')).toBe(`<stop stop-color="${tintHex('#a79cf7')}"/><path fill="#ffffff"/>`)
    } finally {
      setTheme('violet')
    }
  })

  test('rose turns the violets pink, leaves the signal colours alone, and draws the sparkles as falling petals', () => {
    expect(readConfig({ theme: 'rose' }).theme).toBe('rose')
    try {
      setTheme('rose')
      const hue = (hex: string) => {
        const n = parseInt(hex.slice(1), 16)
        const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
        const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
        const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
        return (h * 60 + 360) % 360
      }
      for (const violet of ['#a79cf7', '#b9a7ff', '#7c6cf0', '#4a3f80', '#9b7bff'])
        expect(Math.abs(hue(tintHex(violet)) - 340) < 4).toBe(true)
      for (const same of ['#ffffff', '#141416', '#7fe0a4', '#e0a33a', '#7cc4ff', '#e5534b'])
        expect(tintHex(same)).toBe(same)
      const art = '<svg><style>.sp{fill:#fff}</style><rect fill="#7c6cf0" width="9" height="9"/><path class="sp" style="transform-origin:168px 8px;animation-duration:4.2s;animation-delay:0.3s" d="M168 6.4 L168.34 7.66 Z"/></svg>'
      const petals = tint(art)
      expect(petals).toContain('class="pt"')
      expect(petals).toContain('<g transform="translate(168 0)">')
      expect(petals).toContain('@keyframes fall')
      expect(petals).not.toContain('class="sp"')
      // Art with no violet in it (the green Done card) keeps its sparkles.
      const green = '<svg><style>.sp{fill:#fff}</style><rect fill="#2fae62" width="9" height="9"/><path class="sp" style="transform-origin:168px 8px;animation-duration:4.2s;animation-delay:0.3s" d="M168 6.4 L168.34 7.66 Z"/></svg>'
      expect(tint(green)).toContain('class="sp"')
      expect(tint(green)).not.toContain('class="pt"')
      // Orange keeps the sparkles.
      setTheme('orange')
      expect(tint(art)).toContain('class="sp"')
    } finally {
      setTheme('violet')
    }
  })

  test('violet changes nothing and the Svg is left as it is', () => {
    setTheme('violet')
    const Svg = (p: Record<string, unknown>) => p
    expect(tint('#a79cf7')).toBe('#a79cf7')
    expect(themedSvg(Svg)).toBe(Svg)
    try {
      setTheme('orange')
      const wrapped = themedSvg(Svg) as typeof Svg
      expect(wrapped({ source: '<g fill="#a79cf7"/>' }).source).toBe(`<g fill="${tintHex('#a79cf7')}"/>`)
      expect(wrapped({ source: 42 }).source).toBe(42)
    } finally {
      setTheme('violet')
    }
  })
})

describe('Lab: measurement log', () => {
  test('abArmFor sends the given share to control', () => {
    expect(abArmFor(20, 0.19)).toBe('control')
    expect(abArmFor(20, 0.2)).toBe('auto')
    expect(abArmFor(0, 0)).toBe('auto')
    expect(abArmFor(100, 0.99)).toBe('control')
  })

  test('readConfig takes the offered shares and is off otherwise', () => {
    expect(readConfig({ abControl: '20' }).abControl).toBe(20)
    expect(readConfig({ abControl: '33' }).abControl).toBe(0)
    expect(readConfig({}).abControl).toBe(0)
  })

  const usage = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  const setup = (on: On, coin: string, stored?: Record<string, unknown>, maintainer = '1') => {
    engine(on, { HOME: '/home/t', SMARTTOKENSAVER_AB_COIN: coin, SMARTTOKENSAVER_MAINTAINER: maintainer }, 'claude-opus-5-5', [], stored)
    mock.clock(on)
    judgeSays(on, '{"model":"opus","effort":"low","why":"small"}')
    const sent: unknown[] = []
    on('turn.step', async function* (_$, e) {
      sent.push(e.effort)
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage } as never
    })
    const written: Record<string, string> = {}
    on('fs.write', (_$, e) => {
      written[String(e.path)] = String(e.text)
      return { value: undefined } as never
    })
    return { sent, written }
  }
  // The judge answers on its own schedule: wait until the prompt is logged before the request goes out.
  const judged = async (written: Record<string, string>) => {
    for (let i = 0; i < 200 && !lines(written).some(l => l.type === 'prompt'); i++) await new Promise(r => setTimeout(r, 10))
  }
  const lines = (written: Record<string, string>) =>
    Object.entries(written)
      .filter(([p]) => p.includes('smarttokensaver/usage'))
      .flatMap(([, text]) => text.trim().split('\n'))
      .map(l => JSON.parse(l))

  test('a control prompt runs at the app effort and both prompt and request are logged', { options: { abControl: '50', measureLog: 'on' } }, async ($, on) => {
    const { sent, written } = setup(on, '0.1')
    try {
      await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
      await judged(written)
      await step($, 'high')
    } finally {
      // nothing to undo: the coin lives in this test's environment
    }
    expect(sent).toEqual(['high'])
    const log = lines(written)
    const prompt = log.find(l => l.type === 'prompt')
    expect(prompt).toMatchObject({ arm: 'control', judged: 'low', auto: 'low', v: OWN_VERSION })
    // Every line says which build and which settings wrote it.
    expect(prompt.cfg).toMatchObject({ share: 50, compactWith: 'auto', window: 300_000 })
    expect(log.every(l => l.v === OWN_VERSION && JSON.stringify(l.cfg) === JSON.stringify(prompt.cfg))).toBe(true)
    expect(log.find(l => l.type === 'request')).toMatchObject({ arm: 'control', effort: 'high', out: 100, prompt: prompt.id })
  })

  test('not a maintainer: Measurement saved on (e.g. in Configure) logs nothing and runs no control arm', { options: { abControl: '50', measureLog: 'on' } } as never, async ($, on) => {
    const { sent, written } = setup(on, '0.1', undefined, '0')
    await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
    for (let i = 0; i < 100 && sent.length === 0; i++) await new Promise(r => setTimeout(r, 10))
    expect(lines(written)).toEqual([])
    expect(sent).not.toContain(undefined)
  })

  test('an auto prompt runs at the verdict and is logged as auto', { options: { abControl: '50', measureLog: 'on' } }, async ($, on) => {
    const { sent, written } = setup(on, '0.9')
    try {
      await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
      await judged(written)
      await step($, 'high')
    } finally {
      // nothing to undo: the coin lives in this test's environment
    }
    expect(sent).toEqual(['low'])
    const log = lines(written)
    expect(log.find(l => l.type === 'prompt')).toMatchObject({ arm: 'auto', applied: 'low' })
    expect(log.find(l => l.type === 'request')).toMatchObject({ arm: 'auto', effort: 'low' })
  })

  test('a message typed mid-turn starts no new prompt in the log; the turn keeps its arm', { options: { abControl: '50', measureLog: 'on' } }, async ($, on) => {
    const { written } = setup(on, '0.1')
    await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
    await judged(written)
    await $.prompt.submit({ text: 'also update the docs please', wait: false, origin: { kind: 'composer' }, turnId: 't1' } as never)
    await new Promise(r => setTimeout(r, 100))
    await step($, 'high')
    const log = lines(written)
    expect(log.filter(l => l.type === 'prompt').length).toBe(1)
    expect(log.find(l => l.type === 'request')).toMatchObject({ arm: 'control' })
  })

  test('with the control off every judged prompt is auto, and still logged', { options: { measureLog: 'on' } } as never, async ($, on) => {
    const { sent, written } = setup(on, '0')
    try {
      await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
      await judged(written)
      await step($, 'high')
    } finally {
      // nothing to undo: the coin lives in this test's environment
    }
    expect(sent).toEqual(['low'])
    expect(lines(written).find(l => l.type === 'prompt')).toMatchObject({ arm: 'auto' })
  })

  test('with Measurement off (the default) nothing is logged and no control arm runs, whatever the share says', { options: { abControl: '50' } } as never, async ($, on) => {
    const { sent, written } = setup(on, '0.1')
    await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
    await new Promise(r => setTimeout(r, 300))
    await step($, 'high')
    expect(sent).toEqual(['low'])
    expect(lines(written)).toEqual([])
  })

  test('Measurement switched off in another open chat: this chat, loaded with it on, logs nothing and runs no control arm', { options: { abControl: '50', measureLog: 'on' } } as never, async ($, on) => {
    // The shared store says off (another chat switched it off where the config write was refused).
    const { sent, written } = setup(on, '0.1', { maintainerMeasure: { measureLog: 'off', abControl: '0' } })
    await $.prompt.submit({ text: 'rename foo to bar', wait: false, origin: { kind: 'composer' } })
    await new Promise(r => setTimeout(r, 300))
    await step($, 'high')
    expect(sent).toEqual(['low'])
    expect(lines(written)).toEqual([])
  })

  test('startup cleanup: only its own old log parts, only in a real usage folder, and a failed rm is counted', async ($, on) => {
    const day = 86_400_000
    engine(on, { HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '1' })
    const clock = mock.clock(on)
    // 100 days in: a file from time 0 is old, one stamped far ahead is new.
    await clock.advance(100 * day)
    const old = 0, fresh = Number.MAX_SAFE_INTEGER
    const base = '/home/t/.claude/smarttokensaver'
    const own = '1a2b3c4d-20261001T101500-ab12-000.jsonl'
    const where = { usageReal: `${base}/usage`, usageLink: false, rmFails: false }
    on('fs.exists', () => ({ value: true }) as never)
    on('fs.stat', (_$, e) => {
      const path = String((e as { path: string }).path)
      if (path === base) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: base } } as never
      if (path === `${base}/usage`) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: where.usageLink, realPath: where.usageReal } } as never
      const name = path.split('/').pop() ?? ''
      if (name === 'linked-20261001T101500-ab12-000.jsonl') return { value: { kind: 'file', size: 1, mtimeMs: old, isLink: true, realPath: '/srv/other.jsonl' } } as never
      return { value: { kind: 'file', size: 1, mtimeMs: name.includes('20261118') ? fresh : old, isLink: false, realPath: `${where.usageReal}/${name}` } } as never
    })
    on('fs.list', () => ({ value: [own, '1a2b3c4d-20261118T101500-ab12-000.jsonl', 'other-tool.jsonl', 'linked-20261001T101500-ab12-000.jsonl'].map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }) as never)
    const ran: string[] = []
    on('process.run', (_$, e) => {
      ran.push((e.argv as string[]).join(' '))
      return { value: where.rmFails ? { exitCode: 1, stdout: '', stderr: 'Permission denied' } : { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    expect(ran.filter(c => c.startsWith('rm '))).toEqual([`rm -f -- ${base}/usage/${own}`])
    // A new chat whose rm fails: counted, and /smarttokensaver maintainer says so.
    where.rmFails = true
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await new Promise(r => setTimeout(r, 50))
    expect(String(((await $.command.run({ command: 'smarttokensaver', args: 'maintainer' })) as { text?: string }).text)).toContain('cleanup left 1 old log file')
    expect(AB_LOG_NAME.test(own)).toBe(true)
    expect(AB_LOG_NAME.test('other-tool.jsonl')).toBe(false)
  })

  test('startup cleanup leaves a usage folder that is a link alone, and says so in /smarttokensaver maintainer', async ($, on) => {
    engine(on, { HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '1' })
    mock.clock(on)
    const base = '/home/t/.claude/smarttokensaver'
    on('fs.exists', () => ({ value: true }) as never)
    on('fs.stat', (_$, e) => {
      const path = String((e as { path: string }).path)
      if (path === base) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: base } } as never
      // usage is a link to a shared archive.
      return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, realPath: '/srv/archive' } } as never
    })
    on('fs.list', () => ({ value: [{ name: '1a2b3c4d-20261001T101500-ab12-000.jsonl', kind: 'file', size: 1, mtimeMs: 1, isLink: false }] }) as never)
    const ran: string[] = []
    on('process.run', (_$, e) => {
      ran.push((e.argv as string[]).join(' '))
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    expect(ran.filter(c => c.startsWith('rm '))).toEqual([])
    const said = String(((await $.command.run({ command: 'smarttokensaver', args: 'maintainer' })) as { text?: string }).text)
    expect(said).toContain('cleanup left 1 old log file (or a folder that is a link) alone')
  })

  test('logs older than 30 days are the ones cleaned up', () => {
    const day = 86_400_000
    const now = 100 * day
    const old = '1a2b3c4d-20261001T101500-ab12-000.jsonl'
    const files = [
      { name: old, mtimeMs: now - 31 * day },
      { name: '1a2b3c4d-20261118T101500-ab12-000.jsonl', mtimeMs: now - 2 * day },
      { name: 'notes.txt', mtimeMs: now - 90 * day },
      // Not this plugin's own log parts, however old: another tool's file, a link, a folder.
      { name: 'old.jsonl', mtimeMs: now - 31 * day },
      { name: '1a2b3c4d-20261001T101500-ab12-001.jsonl', mtimeMs: now - 31 * day, isLink: true },
      { name: '1a2b3c4d-20261001T101500-ab12-002.jsonl', mtimeMs: now - 31 * day, kind: 'dir' },
    ]
    expect(staleLogs(files, now)).toEqual([old])
  })
})

/** A desktop chat opened the way the app opens one. */
async function openChat($: Engine, on: On) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
}

describe('compaction window', () => {
  test('parseWindow reads 300k, 300000, 0.4M and default; out of range is refused', () => {
    expect(parseWindow('300k')).toBe(300_000)
    expect(parseWindow('300000')).toBe(300_000)
    expect(parseWindow('300.000')).toBe(300_000)
    expect(parseWindow(' 0.4M ')).toBe(400_000)
    expect(parseWindow('default')).toBeNull()
    expect(parseWindow('5k')).toBeUndefined()
    expect(parseWindow('9M')).toBeUndefined()
    expect(parseWindow('lots')).toBeUndefined()
    expect(windowLabel(300_000)).toBe('300k')
    expect(windowLabel(1_000_000)).toBe('1M')
    expect(windowLabel(null)).toBe('Claude Code default')
    expect(DEFAULT_WINDOW).toBe(300_000)
  })

  test('thresholds follow the compaction point: cold band 110k to 150k, handoff check from half, swamp of the trigger', () => {
    const at300 = thresholds({ window: 300_000, trigger: 267_000 })
    expect(at300.trigger).toBe(267_000)
    expect(at300.coldFrom).toBe(150_000)
    expect(at300.handoffFrom).toBe(150_000)
    expect(Math.round(at300.percent(133_500) ?? 0)).toBe(50)
    expect(at300.swampFrom(60)).toBe(160_200)
    // A window of 200k: as R2 says, 30k under the trigger.
    expect(thresholds({ window: 200_000, trigger: 167_000 }).coldFrom).toBe(137_000)
    // The handoff check would start 17k before compaction, too late to be of use (it needs 40k): it stays away.
    expect(thresholds({ window: 200_000, trigger: 167_000 }).handoffFrom).toBe(Infinity)
    // A small window: compaction comes first anyway, so neither the cold band nor the handoff check shows.
    const small = thresholds({ window: 150_000, trigger: 117_000 })
    expect(small.coldFrom).toBe(Infinity)
    expect(small.handoffFrom).toBe(Infinity)
    expect(small.swampFrom(0)).toBe(Infinity)
    // A manual percent that leaves under 20k before compaction stays away too.
    expect(small.swampFrom(90 as never)).toBe(Infinity)
    expect(small.swampFrom(70)).toBe(81_900)
    // No trigger read yet: the window less the 33k buffer.
    expect(thresholds({ window: 1_000_000 }).trigger).toBe(967_000)
    expect(thresholds({ window: 1_000_000 }).handoffFrom).toBe(483_500)
    // Auto-compaction off: no ring, the swamp alert from the model's window.
    const off = thresholds({ window: 1_000_000, modelWindow: 1_000_000, autoCompact: false })
    expect(off.trigger).toBeNull()
    expect(off.percent(500_000)).toBeNull()
    expect(off.coldFrom).toBe(150_000)
    expect(off.swampFrom(50)).toBe(500_000)
  })

  test('isCold: unknown and expired are cold; a live cache is not', () => {
    expect(isCold(null, 0, 1000)).toBe(true)
    expect(isCold(0, 5000, 1000)).toBe(true)
    expect(isCold(30, 5000, 1000)).toBe(false)
    expect(isCold(30, 5000, 6000)).toBe(true)
    // After a reload nothing was seen yet: expires is 0.
    expect(isCold(undefined, 0, 6000)).toBe(true)
  })

  test('withWindow adds the window to the merge, never over a managed value, and not for the default', () => {
    expect(withWindow({ model: 'opus' }, [{ source: 'user', settings: {} }], 300_000)).toEqual({ model: 'opus', autoCompactWindow: 300_000 })
    expect(withWindow({ autoCompactWindow: 500_000 }, [{ source: 'policy', settings: { autoCompactWindow: 500_000 } }], 300_000)).toEqual({ autoCompactWindow: 500_000 })
    expect(withWindow({ model: 'opus' }, [], null)).toEqual({ model: 'opus' })
    // The hook's own guard: whatever goes wrong, the merge stands as it was.
    expect(withWindowSafe({ model: 'opus' }, null as never, 300_000)).toEqual({ model: 'opus' })
    expect(withWindowSafe({ model: 'opus' }, [], 300_000)).toEqual({ model: 'opus', autoCompactWindow: 300_000 })
  })

  test('windowStatus and windowNote say whether the window is in force, and why not', () => {
    const base = { raw: 300_000, source: 'settings', modelWindow: 1_000_000, trigger: 267_000, autoCompact: true, model: 'opus', at: 0 }
    expect(windowStatus(300_000, base)).toBe('ok')
    expect(windowStatus(null, base)).toBe('default')
    expect(windowStatus(300_000, { ...base, raw: 200_000, modelWindow: 200_000 })).toBe('ok')
    expect(windowStatus(300_000, { ...base, raw: 1_000_000, source: 'env' })).toBe('env')
    expect(windowStatus(300_000, { ...base, raw: 500_000, policyValue: 500_000 })).toBe('policy')
    expect(windowStatus(300_000, { ...base, raw: 400_000, modelValue: 400_000 })).toBe('model')
    // The same number, set by /autocompact for the model: in use, but the card names who set it (a later change in
    // the plugin would not take), and a change goes through /autocompact.
    expect(windowStatus(300_000, { ...base, modelValue: 300_000 })).toBe('command')
    expect(windowNote(300_000, { ...base, modelValue: 300_000 })).toBe('In use: 300k, set with /autocompact for opus. Compacts at 267k.')
    expect(windowStatus(300_000, { ...base, source: 'env' })).toBe('env')
    expect(windowStatus(300_000, { ...base, policyValue: 300_000 })).toBe('policy')
    expect(windowNeedsCommand('ok', false)).toBe(false)
    expect(windowNeedsCommand('ok', true)).toBe(true)
    expect(windowNeedsCommand('blocked', false)).toBe(true)
    expect(windowNeedsCommand('command', false)).toBe(true)
    expect(windowStatus(300_000, { ...base, raw: 1_000_000, source: 'default' })).toBe('blocked')
    expect(windowNote(300_000, base)).toBe('In use: 300k. Compacts at 267k.')
    expect(windowNote(300_000, { ...base, raw: 400_000, modelValue: 400_000 })).toContain('/autocompact set 400k')
    expect(windowNote(300_000, null)).toContain('Not read yet')
  })

  test('a model switch reads the window again', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('classic.PostModelSwitch', () => ({}) as never)
    let reads = 0
    on('session.usage', () => {
      reads++
      return { value: { context: { tokens: 10_000, window: 1_000_000, breakdown: { rawMaxTokens: 300_000, isAutoCompactEnabled: true, autocompactSource: 'settings' } } } } as never
    })
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    const before = reads
    await $.classic.PostModelSwitch({ from_model: 'claude-opus-5-5', to_model: 'claude-sonnet-5-5' } as never)
    await new Promise(r => setTimeout(r, 50))
    expect(reads).toBeGreaterThan(before)
  })

  test('/smarttokensaver window sets it and /smarttokensaver window explains a bad value', async ($, on) => {
    engine(on)
    mock.clock(on)
    const set = savedSets(on)
    await openChat($, on)
    const bad = await $.command.run({ command: 'smarttokensaver', args: 'window lots' })
    expect(String((bad as { text?: string }).text)).toContain('between 100k and 1M')
    const ok = await $.command.run({ command: 'smarttokensaver', args: 'window 400k' })
    expect(String((ok as { text?: string }).text)).toContain('400k')
    expect(set).toContainEqual({ key: 'smarttokensaver.compactWindow', value: '400000' })
  })
})

describe('compaction plan and prompts', () => {
  test('compactPlan: Auto sends a cold chat to Haiku and a warm one to the chat model; a precompute is skipped only for Haiku', () => {
    expect(compactPlan('auto', 'auto', true)).toBe('haiku')
    expect(compactPlan('auto', 'manual', false)).toBe('session')
    expect(compactPlan('auto', 'precompute', true)).toBe('skip')
    expect(compactPlan('auto', 'precompute', false)).toBe('session')
    expect(compactPlan('session', 'auto', true)).toBe('session')
  })

  test('fitTranscript cuts tighter until it fits, and gives up past the tightest cut', () => {
    const small = [{ role: 'user', text: 'hello' }]
    expect(fitTranscript(small)).toContain('USER: hello')
    const big = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `m${i}`, toolUses: [{ tool: 'Read', input: {}, text: 'y'.repeat(150_000) }] }))
    const fitted = fitTranscript(big)
    expect(fitted).not.toBeNull()
    expect((fitted ?? '').length).toBeLessThanOrEqual(COMPACT_MAX_CHARS)
    const huge = Array.from({ length: 4000 }, (_, i) => ({ role: 'user', text: `${i} ${'z'.repeat(500)}` }))
    expect(fitTranscript(huge)).toBeNull()
  })

  test('contextLine names tokens and the compaction point, or says auto-compaction is off', () => {
    expect(contextLine(120_000, 267_000)).toBe('Context: 120k tokens; compaction at 267k tokens')
    expect(contextLine(120_000, null)).toBe('Context: 120k tokens; auto-compaction is off')
  })
})

describe('defaults', () => {
  test('readConfig falls back to the listed defaults (tools/check-defaults.mjs checks the list against plugin.json)', () => {
    expect(Object.keys(CONFIG_DEFAULTS).length).toBeGreaterThan(15)
    // readConfig of the declared defaults is readConfig of nothing: the code holds no other default.
    expect(readConfig(CONFIG_DEFAULTS)).toEqual(readConfig({}))
  })
})

describe('duplicates and other builds', () => {
  test('duplicateInstalls lists the enabled installs of Smart Token Saver and effortless by id', () => {
    expect(duplicateInstalls({ 'effortless@effortless': true, 'smarttokensaver@smarttokensaver-folder': true, 'other@x': true })).toEqual(['effortless@effortless', 'smarttokensaver@smarttokensaver-folder'])
    expect(duplicateInstalls({ 'effortless@effortless': false, 'smarttokensaver@smarttokensaver-folder': true })).toEqual(['smarttokensaver@smarttokensaver-folder'])
    expect(duplicateInstalls(null)).toEqual([])
  })

  const cache = (id: string) => `/home/t/.claude/plugins/cache/${id.split('@')[1]}/${id.split('@')[0]}/1.0.0`
  const recs = (ids: string[], own?: string) => ({ version: 2, plugins: Object.fromEntries(ids.map(id => [id, [{ scope: 'user', installPath: id === own ? ROOT : cache(id) }]])) })

  test('otherBuilds finds the public build and older builds by id, never the running one (known by its path)', () => {
    const installed = recs(['effortless@effortless', 'effortless@effortless-local', 'smarttokensaver@smarttokensaver-folder', 'smarttokensaver@team', 'easel@x'], 'smarttokensaver@smarttokensaver-folder')
    // Every effortless@* is someone else's; another marketplace's Smart Token Saver is a second install of this one.
    expect(otherBuilds(installed, { root: ROOT, name: 'smarttokensaver' })).toEqual([
      { id: 'effortless@effortless', kind: 'public', scope: 'user' },
      { id: 'effortless@effortless-local', kind: 'older', scope: 'user' },
      { id: 'smarttokensaver@team', kind: 'twin', scope: 'user' },
    ])
    // Renamed: this build's own id is whatever it runs as, and an older build under the new name counts too.
    expect(otherBuilds(recs(['effortless@effortless', 'tempo@team', 'tempo@old-team'], 'tempo@team'), { root: ROOT, name: 'tempo' }).map(b => b.id)).toEqual(['effortless@effortless', 'tempo@old-team'])
    expect(otherBuilds(recs(['smarttokensaver@smarttokensaver-folder'], 'smarttokensaver@smarttokensaver-folder'), { root: ROOT })).toEqual([])
    expect(otherBuilds(null, 'x@y')).toEqual([])
    expect(otherBuildText({ id: 'effortless@effortless', kind: 'public' })).toBe('The public effortless (HeyCubit) is also installed. Both would run on every prompt. Remove it?')
    expect(otherBuildText({ id: 'effortless@effortless-local', kind: 'older' })).toBe('An older effortless build is also installed. Both would run on every prompt. Remove it?')
    expect(otherBuildText({ id: 'smarttokensaver@team', kind: 'twin' })).toBe('Smart Token Saver from team is also installed. Claude Code runs only one of the two, maybe that one. Remove it?')
    // Turned off in the settings: it does not run, and the line says so.
    expect(otherBuildText({ id: 'effortless@effortless', kind: 'public', enabled: false })).toBe('The public effortless (HeyCubit) is also installed, turned off. Remove it?')
  })

  test('the own install is found by its path, not by a cache folder in CLAUDE_CONFIG_DIR, and a folder load (--plugin-dir) is not listed', () => {
    // A config folder that itself holds a "cache" segment: the old guess took "claude" as the marketplace.
    const root = '/home/u/.cache/claude/plugins/cache/team/smarttokensaver/1.0.0'
    const installed = { version: 2, plugins: { 'smarttokensaver@team': [{ scope: 'user', installPath: root }], 'smarttokensaver@claude': [{ scope: 'user', installPath: '/elsewhere' }] } }
    expect(ownInstall(installed, root)).toEqual({ id: 'smarttokensaver@team', scope: 'user', installPath: root })
    expect(otherBuilds(installed, { root }).map(b => b.id)).toEqual(['smarttokensaver@claude'])
    // Loaded with --plugin-dir: no record has its path, so nothing listed is taken for it, and the same id elsewhere is
    // still another build.
    expect(ownInstall(installed, '/src/smarttokensaver')).toBeNull()
    expect(otherBuilds(installed, { root: '/src/smarttokensaver', name: 'smarttokensaver' }).map(b => b.id)).toEqual(['smarttokensaver@claude', 'smarttokensaver@team'])
  })

  test('each install keeps its scope; one for another project is left out; ids and scopes are checked before a command', () => {
    const installed = {
      version: 2,
      plugins: {
        'effortless@effortless': [
          { scope: 'project', installPath: '/c/a', projectPath: '/work/here' },
          { scope: 'local', installPath: '/c/b', projectPath: '/work/other' },
          { scope: 'user', installPath: '/c/c' },
        ],
      },
    }
    const found = otherBuilds(installed, { root: ROOT, name: 'smarttokensaver' }, '/work/here', { 'effortless@effortless': true })
    expect(found).toEqual([
      { id: 'effortless@effortless', kind: 'public', scope: 'project', projectPath: '/work/here', enabled: true },
      { id: 'effortless@effortless', kind: 'public', scope: 'user', enabled: true },
    ])
    expect(uninstallArgs(found[0])).toEqual(['plugin', 'uninstall', 'effortless@effortless', '--scope', 'project'])
    expect(uninstallArgs({ id: 'effortless@x; rm -rf ~', scope: 'user' })).toBeNull()
    expect(uninstallArgs({ id: '--help@x', scope: 'user' })).toBeNull()
    expect(uninstallArgs({ id: 'effortless@x', scope: 'managed' })).toBeNull()
    expect(PLUGIN_ID_RE.test('smarttokensaver@team-tools')).toBe(true)
  })

  /** A session whose plugin list holds `ids`, under CLAUDE_CONFIG_DIR when given; records what runs. The running
   *  install (`own`, smarttokensaver@smarttokensaver-folder unless named) sits at the plugin's own folder. */
  function others(on: On, ids: string[], v: { fails?: boolean; configDir?: string; setupDone?: boolean; own?: string; enabled?: Record<string, boolean> } = {}) {
    engine(on, { HOME: '/home/t', ...(v.configDir ? { CLAUDE_CONFIG_DIR: v.configDir } : {}) }, 'claude-opus-5-5', [], v.setupDone ? { setupDone: true } : undefined)
    mock.clock(on)
    const list = `${v.configDir ?? '/home/t/.claude'}/plugins/installed_plugins.json`
    const own = v.own ?? 'smarttokensaver@smarttokensaver-folder'
    on('fs.read', (_$, e) => ({ value: String(e.path) === list ? JSON.stringify(recs(ids, own)) : '' }) as never)
    if (v.enabled) on('settings.read', (_$, e) => ({ value: (e as { key?: string }).key === 'enabledPlugins' ? v.enabled : {} }) as never)
    const ran: string[] = []
    const cwds: (string | undefined)[] = []
    on('process.run', (_$, e) => {
      ran.push(e.argv.join(' '))
      cwds.push(e.init?.cwd)
      return { value: v.fails ? { exitCode: 1, stdout: '', stderr: 'boom' } : { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    return { ran, toasts, cwds }
  }
  const DESK = { plugin: 'smarttokensaver', surface: 'desktop', ...BAND } as const

  test('the setup asks first; Remove it uninstalls the public build and moves on', async ($, on) => {
    const w = others(on, ['effortless@effortless', 'smarttokensaver@smarttokensaver-folder'])
    await openChat($, on)
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Welcome to Smart Token Saver')
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('The public effortless (HeyCubit) is also installed. Both would run on every prompt. Remove it?')
    // The other build, the lean, the window (the model's window is not known yet, so it stays in) and the look.
    expect(await drawn(band)).toContain('1/4')
    // Nothing runs without the click.
    expect(w.ran.filter(c => c.includes('plugin') && !c.includes('marketplace update'))).toEqual([])
    await band.press({ key: 'setup-other-remove' })
    expect(w.ran).toContain('claude plugin uninstall effortless@effortless --scope user')
    expect(w.ran.join(' ')).not.toContain('smarttokensaver@')
    expect(w.toasts).toContain('Removed. Open a new chat to finish.')
    expect(await band.find({ key: 'setup-bias2' })).toBeDefined()
    await band.unmount()
  })

  test('Keep both moves on and is not asked again', async ($, on) => {
    const w = others(on, ['effortless@effortless-local'])
    await openChat($, on)
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Welcome to Smart Token Saver')
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('An older effortless build is also installed.')
    await band.press({ key: 'setup-other-keep' })
    expect(w.ran.filter(c => c.includes('uninstall'))).toEqual([])
    expect(await band.find({ key: 'setup-bias2' })).toBeDefined()
    await band.press({ key: 'setup-close' })
    await band.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'setup' })
    const again = await $.ui.mount(DESK)
    await again.press({ key: 'setup-next' })
    expect(await drawn(again)).not.toContain('also installed')
    expect(await again.find({ key: 'setup-bias2' })).toBeDefined()
    await again.unmount()
  })

  test('the same plugin from another marketplace counts too, and Remove it uninstalls that one only', async ($, on) => {
    const w = others(on, ['smarttokensaver@smarttokensaver-folder', 'smarttokensaver@team-tools'], { setupDone: true })
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Smart Token Saver from team-tools is also installed. Claude Code runs only one of the two, maybe that one. Remove it?')
    await band.press({ key: 'other-remove' })
    expect(w.ran).toContain('claude plugin uninstall smarttokensaver@team-tools --scope user')
    expect(w.ran.join(' ')).not.toContain('uninstall smarttokensaver@smarttokensaver-folder')
    expect(w.toasts).toContain('Removed. Open a new chat to finish.')
    await band.unmount()
  })

  test('a failed removal says the exact command to run', async ($, on) => {
    const w = others(on, ['effortless@effortless'], { fails: true })
    await openChat($, on)
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('Welcome to Smart Token Saver')
    await band.press({ key: 'setup-next' })
    await band.press({ key: 'setup-other-remove' })
    expect(w.toasts.join(' ')).toContain('claude plugin uninstall effortless@effortless --scope user')
    expect(w.toasts.join(' ')).not.toContain('Removed.')
    // A failed removal stays on the step, so it can be tried again.
    expect(await band.find({ key: 'setup-other-remove' })).toBeDefined()
    await band.unmount()
  })

  test('CLAUDE_CONFIG_DIR is where the plugin list is read; after the setup the question is a card of its own', async ($, on) => {
    const w = others(on, ['effortless@effortless'], { configDir: '/cfg', setupDone: true })
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    const band = await $.ui.mount(DESK)
    expect(await drawn(band)).toContain('The public effortless (HeyCubit) is also installed.')
    expect(await band.find({ key: 'setup-bias2' })).toBeUndefined()
    await band.press({ key: 'other-keep' })
    expect(await drawn(band)).not.toContain('also installed')
    expect(w.ran.filter(c => c.includes('uninstall'))).toEqual([])
    await band.unmount()
  })
})

describe('Lab, About and the guide', () => {
  const DASHLAB = { options: { layout: 'default' } } as never
  // Hours of ticks on a mocked clock: close to the default 5 s on a busy machine, so it gets more.
  test('Lab off (the default): no network, no git, no claude plugin command runs on its own', { timeoutMs: 20_000 }, async ($, on) => {
    engine(on, { HOME: '/home/t' })
    const clock = mock.clock(on)
    const fetched: string[] = []
    on('http.fetch', (_$, e) => {
      fetched.push(String(e.url))
      return { value: { status: 404, ok: false, headers: {}, text: '' } } as never
    })
    const ran: string[] = []
    on('process.run', (_$, e) => {
      ran.push(e.argv.join(' '))
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    await openChat($, on)
    // Past the 6-hour check and many 5-minute window reads (in half-hour steps: 80 small ones ran close to the 5 s limit).
    for (let i = 0; i < 16; i++) await clock.advance(30 * 60_000)
    await new Promise(r => setTimeout(r, 50))
    expect(fetched).toEqual([])
    expect(ran.filter(c => /^(git|claude)\b/.test(c) || c.includes('plugin'))).toEqual([])
  })

  test("a maintainer's Support card: before the setup nothing is on; after it both tools go on once (Measurement 10 %), and Off sticks", async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '1' })
    mock.clock(on)
    const set = savedSets(on)
    await openChat($, on)
    await new Promise(r => setTimeout(r, 20))
    // The setup has not run: nothing switches on.
    expect(set).not.toContainEqual({ key: 'smarttokensaver.measureLog', value: 'on' })
    await $.command.run({ command: 'smarttokensaver', args: 'settings' } as never)
    const panel = await $.ui.mount(DESK_BAND)
    expect(await panel.find({ key: 'settings-lab-power' })).toBeDefined()
    await panel.press({ key: 'settings-card-lab' })
    expect(await drawn(panel)).toContain('This plugin')
    expect(await drawn(panel)).toContain('Maintainer')
    // The clone note lives in the docs, not on the card.
    expect(await drawn(panel)).not.toContain('.smarttokensaver-maintainer')
    // Measurement is the lab: a switch with the flask; the share only once it is on.
    expect(await panel.find({ key: 'lab-measure-pick' })).toBeUndefined()
    await panel.press({ key: 'lab-measure-switch' })
    expect(set).toContainEqual({ key: 'smarttokensaver.measureLog', value: 'on' })
    expect(await drawn(panel)).toContain('Measurement on')
    await panel.select({ key: 'lab-measure-pick', value: '20' })
    expect(set).toContainEqual({ key: 'smarttokensaver.abControl', value: '20' })
    await panel.press({ key: 'lab-measure-switch' })
    expect(set).toContainEqual({ key: 'smarttokensaver.measureLog', value: 'off' })
    await panel.unmount()
  })

  test('a maintainer after the setup: Measurement goes on at 10 % by itself, once; turned off it stays off in the next chat', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '1', HOME: '/home/t' }, 'claude-opus-5-5', [], { setupDone: true, maintainerUpdates: { on: true, folder: '/home/t/clone' } })
    mock.clock(on)
    on('fs.exists', () => ({ value: true }) as never)
    on('process.run', (_$, e) => {
      const argv = e.argv as string[]
      if (argv.includes('--is-inside-work-tree')) return { value: { exitCode: 0, stdout: 'true\n\n', stderr: '' } } as never
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
    })
    const set = savedSets(on)
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    expect(set).toContainEqual({ key: 'smarttokensaver.measureLog', value: 'on' })
    expect(set).toContainEqual({ key: 'smarttokensaver.abControl', value: String(MAINTAINER_MEASURE_DEFAULT) })
    expect(testStore.get('maintainerDefaults')).toBe(true)
    await $.command.run({ command: 'smarttokensaver', args: 'maintainer measure off' })
    expect(set).toContainEqual({ key: 'smarttokensaver.measureLog', value: 'off' })
    const before = set.length
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await new Promise(r => setTimeout(r, 50))
    expect(set.slice(before)).not.toContainEqual({ key: 'smarttokensaver.measureLog', value: 'on' })
  })

  test('/smarttokensaver maintainer shows both switches off; lab measure turns the log on and off', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '1' })
    mock.clock(on)
    const set = savedSets(on)
    await openChat($, on)
    const shown = String(((await $.command.run({ command: 'smarttokensaver', args: 'maintainer' })) as { text?: string }).text)
    // Nothing comes on by itself: each part is switched on by the maintainer.
    expect(shown).toContain('Maintainer tools (off)')
    expect(shown).toContain('Measurement: off')
    const bad = String(((await $.command.run({ command: 'smarttokensaver', args: 'maintainer measure 33' })) as { text?: string }).text)
    expect(bad).toContain('one of 0, 10, 20, 30, 50')
    await $.command.run({ command: 'smarttokensaver', args: 'maintainer measure 20' })
    expect(set).toContainEqual({ key: 'smarttokensaver.measureLog', value: 'on' })
    expect(set).toContainEqual({ key: 'smarttokensaver.abControl', value: '20' })
    const missing = String(((await $.command.run({ command: 'smarttokensaver', args: 'maintainer updates /no/such/folder' })) as { text?: string }).text)
    expect(missing).toContain('No folder at /no/such/folder')
  })

  /**
   * Lab, Upstream updates, with a store of its own the test can change (another open chat writes the same store), a
   * clone folder that is a git repo, and git answering: the fetch can fail or wait until released.
   */
  function labWorld(on: On, v: { fetchFails?: boolean; notRepo?: boolean; prefix?: string; noGuide?: boolean; gateOn?: string } = {}) {
    // Upstream updates switched off once before, so a maintainer's first load does not turn it on: the tests do.
    const store = new Map<string, unknown>([['setupDone', true], ['maintainerUpdates', { on: false, folder: '' }]])
    on('store.get', (_$, e) => ({ value: store.has(e.key) ? store.get(e.key) : null }) as never)
    on('store.set', (_$, e) => {
      store.set(e.key, e.value)
      return { value: undefined } as never
    })
    on('store.delete', (_$, e) => {
      store.delete((e as { key: string }).key)
      return { value: undefined } as never
    })
    // A maintainer's install: Upstream updates and Measurement are there.
    mock.env(on, { SMARTTOKENSAVER_MODEL_UI: '1', HOME: '/home/t', SMARTTOKENSAVER_MAINTAINER: '1' })
    on('prompt.submit', (_$, e) => ({ text: e.text }))
    on('ui.status', () => ({ value: undefined }))
    on('session.messages', () => ({ value: [] }) as never)
    on('session.model', () => ({ value: 'claude-opus-5-5' }))
    on('command.list', () => ({ value: [] as never }))
    on('fs.exists', (_$, e) => ({ value: !(v.noGuide && String((e as { path: string }).path).endsWith('MAINTAINER-UPDATE.md')) }) as never)
    const clock = mock.clock(on)
    const ran: string[] = []
    const envs: (Record<string, string> | undefined)[] = []
    let bareMade = false
    const gate: { wait?: Promise<void>; open?: () => void } = {}
    on('process.run', async (_$, e) => {
      const argv = e.argv as string[]
      ran.push(argv.join(' '))
      envs.push(e.init?.env)
      const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
      if (argv.includes('--is-inside-work-tree')) return v.notRepo ? ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } } as never) : ok(`true\n${v.prefix ?? ''}\n`)
      if (argv.includes('--is-bare-repository')) return bareMade ? ok('true\n') : ({ value: { exitCode: 128, stdout: '', stderr: 'no repo' } } as never)
      if (argv.includes(v.gateOn ?? 'fetch') && gate.wait) await gate.wait
      if (argv.includes('init')) {
        bareMade = true
        return ok()
      }
      if (argv.includes('fetch')) {
        return v.fetchFails ? ({ value: { exitCode: 128, stdout: '', stderr: 'unable to access' } } as never) : ok()
      }
      if (argv.includes('show')) return ok(JSON.stringify([{ version: '9.9.9', note: '' }]))
      return ok()
    })
    const hold = () => {
      gate.wait = new Promise<void>(r => (gate.open = r))
    }
    const release = () => {
      gate.wait = undefined
      gate.open?.()
    }
    return { store, ran, envs, clock, hold, release, v }
  }
  const labSay = async ($: Engine, args: string) => String(((await $.command.run({ command: 'smarttokensaver', args })) as { text?: string }).text)
  const settleLab = () => new Promise(r => setTimeout(r, 40))

  test('Lab updates: git only on the plugin\'s own bare repo (--git-dir named), fetching from upstream\'s URL, never through a remote', DASHLAB, async ($, on) => {
    const w = labWorld(on)
    await openChat($, on)
    expect(await labSay($, 'maintainer updates /work/clone')).toContain('Upstream updates on')
    await settleLab()
    const gitDir = '/home/t/.claude/smarttokensaver/upstream-check/repo.git'
    const cmd = upstreamGitArgs(gitDir)
    expect(w.ran).toContain(cmd.init.join(' '))
    expect(w.ran).toContain(cmd.fetch.join(' '))
    expect(cmd.fetch).toContain('https://github.com/HeyCubit/effortless.git')
    // Every git call on the check repo names it; none relies on git finding a repo around the folder.
    expect(w.ran.filter(c => c.startsWith('git ') && !c.includes('/work/clone')).every(c => c.includes(`--git-dir=${gitDir}`) || c === cmd.init.join(' '))).toBe(true)
    expect(w.ran.join('\n')).not.toContain('remote add')
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Upstream effortless 9.9.9 is out')
    await band.unmount()
  })

  test('Upstream updates on leaves Measurement alone: each part needs its own yes', async ($, on) => {
    labWorld(on)
    await openChat($, on)
    const said = await labSay($, 'maintainer updates /work/clone')
    expect(said).toContain('Upstream updates on')
    expect(said).not.toContain('Measurement on')
  })

  test('Lab updates: a folder that is not a git clone is refused', async ($, on) => {
    labWorld(on, { notRepo: true })
    await openChat($, on)
    expect(await labSay($, 'maintainer updates /work/notes')).toContain('is not a git clone')
  })

  test('Lab updates: a failed fetch is not "Up to date"', DASHLAB, async ($, on) => {
    labWorld(on, { fetchFails: true })
    await openChat($, on)
    await labSay($, 'maintainer updates /work/clone')
    await settleLab()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-lab' })
    await panel.press({ key: 'lab-check' })
    await settleLab()
    expect(await drawn(panel)).toContain('Check failed')
    expect(await drawn(panel)).not.toContain('Up to date')
    await panel.unmount()
    expect(await labSay($, 'maintainer')).toContain('check failed')
  })

  test('Lab updates turned off in another open chat: no card from a fetch in flight, and no more fetches here', { ...DASHLAB, timeoutMs: 20_000 } as never, async ($, on) => {
    const w = labWorld(on)
    await openChat($, on)
    w.hold()
    await labSay($, 'maintainer updates /work/clone')
    await settleLab()
    // Another chat turns it off while this chat's fetch is under way: the shared store says off.
    w.store.set('maintainerUpdates', null)
    w.release()
    await settleLab()
    // Two guards keep the card away: checkUpdate reads the switch again after the fetch, and the band reads it before drawing.
    const band = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(band ? await drawn(band) : '').not.toContain('is out')
    await band?.unmount()
    const fetches = () => w.ran.filter(c => c.includes(' fetch ')).length
    const before = fetches()
    // Small steps: the handoff poll ticks every second, and one advance may only run so many waits.
    for (let i = 0; i < 7; i++) await w.clock.advance(60 * 60_000)
    await settleLab()
    expect(fetches()).toBe(before)
  })

  test('Lab updates: every git call runs without the user\'s or system git config, over HTTPS only, and fetches whole objects (no lazy fetch later)', DASHLAB, async ($, on) => {
    const w = labWorld(on)
    await openChat($, on)
    await labSay($, 'maintainer updates /work/clone')
    await settleLab()
    const git = w.ran.map((c, i) => ({ c, env: w.envs[i] })).filter(x => x.c.startsWith('git ') && !x.c.includes('/work/clone'))
    expect(git.length).toBeGreaterThan(2)
    for (const x of git) expect(x.env).toEqual(UPSTREAM_GIT_ENV)
    expect(UPSTREAM_GIT_ENV).toEqual({ GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_LAZY_FETCH: '1' })
    const fetch = git.find(x => x.c.includes(' fetch '))?.c ?? ''
    expect(fetch).toContain('-c protocol.allow=never -c protocol.https.allow=always')
    expect(fetch).not.toContain('--filter')
  })

  test('Lab updates turned off while the check repo is being made: the fetch never starts', DASHLAB, async ($, on) => {
    const w = labWorld(on, { gateOn: 'init' })
    await openChat($, on)
    w.hold()
    await labSay($, 'maintainer updates /work/clone')
    await settleLab()
    w.store.set('maintainerUpdates', null)
    w.release()
    await settleLab()
    expect(w.ran.some(c => c.includes(' init '))).toBe(true)
    expect(w.ran.some(c => c.includes(' fetch '))).toBe(false)
  })

  test('Lab updates: a folder inside a clone, or a clone without MAINTAINER-UPDATE.md, is refused', async ($, on) => {
    const w = labWorld(on, { prefix: 'docs/' })
    await openChat($, on)
    expect(await labSay($, 'maintainer updates /work/clone/docs')).toContain('is inside a git clone, not its top folder')
    w.v.prefix = ''
    w.v.noGuide = true
    expect(await labSay($, 'maintainer updates /work/other')).toContain('has no MAINTAINER-UPDATE.md')
    // Neither refused folder was kept.
    expect((w.store.get('maintainerUpdates') as { on?: boolean } | null)?.on ?? false).toBe(false)
  })

  test('Lab updates: a failed Check now takes an earlier offer off the screen', DASHLAB, async ($, on) => {
    const w = labWorld(on)
    await openChat($, on)
    await labSay($, 'maintainer updates /work/clone')
    await settleLab()
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Upstream effortless 9.9.9 is out')
    await band.unmount()
    w.v.fetchFails = true
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-lab' })
    await panel.press({ key: 'lab-check' })
    await settleLab()
    expect(await drawn(panel)).toContain('Check failed')
    await panel.unmount()
    const after = await $.ui.mount(DESK_BAND)
    expect(await drawn(after)).not.toContain('is out')
    await after.unmount()
  })

  test('an install from GitHub: lab is for maintainers; support names the updates and a bug report prefilled with the version only', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '0' })
    mock.clock(on)
    const set = savedSets(on)
    await openChat($, on)
    expect(await labSay($, 'maintainer measure 20')).toContain('for maintainers')
    expect(set).toEqual([])
    const said = await labSay($, 'support')
    expect(said).toContain('Updates: on, checks GitHub every 6 hours')
    expect(said).toContain(`Report a bug: ${bugReportUrl(OWN_VERSION)}`)
    expect(bugReportUrl('1.2.3')).toStartWith('https://github.com/rimford/smart-token-saver/issues/new?body=')
    const body = decodeURIComponent(bugReportUrl('1.2.3').split('body=')[1] ?? '')
    expect(body).toStartWith(`Version: Smart Token Saver 1.2.3 (based on effortless ${UPSTREAM_BASE})`)
    expect(body.split('\n').filter(Boolean)).toHaveLength(3)
  })

  test('maintainer measure with no value says how it stands and switches nothing', async ($, on) => {
    engine(on, { SMARTTOKENSAVER_MAINTAINER: '1' })
    mock.clock(on)
    const set = savedSets(on)
    await openChat($, on)
    // Off until switched on; asking changes nothing.
    expect(await labSay($, 'maintainer measure')).toContain('Measurement: off.')
    const before = set.length
    await labSay($, 'maintainer measure')
    expect(set.length).toBe(before)
    expect(await labSay($, 'maintainer measure off')).toContain('removed once they are 30 days old')
  })

  test('Lab off: the render log and the proof log are not written; nothing lands outside the plugin folder', async ($, on) => {
    engine(on, { HOME: '/home/t' })
    const clock = mock.clock(on)
    const written: string[] = []
    on('fs.write', (_$, e) => {
      written.push(String((e as { path: string }).path))
      return { value: undefined } as never
    })
    await openChat($, on)
    const band = await $.ui.mount(DESK_BAND)
    await band.unmount()
    for (let i = 0; i < 5; i++) await clock.advance(1500)
    await settleLab()
    expect(written).toEqual([])
  })

  test('/smarttokensaver guide gives the guide link', async ($, on) => {
    engine(on)
    mock.clock(on)
    on('session.info', () => ({ value: { platform: 'linux' } }) as never)
    await openChat($, on)
    const r = (await $.command.run({ command: 'smarttokensaver', args: 'guide' })) as { text?: string }
    expect(String(r.text)).toBe(`The guide: ${GUIDE_URL}`)
  })

  test('the names and versions live in one place', () => {
    expect(PRODUCT_NAME).toBe('Smart Token Saver')
    expect(OWN_VERSION).toBe('1.0.0')
    expect(UPSTREAM_BASE).toMatch(VERSION_RE)
    expect(GUIDE_URL).toBe('https://rimford.github.io/smart-token-saver/guide/')
  })
})

describe('self from a directory marketplace', () => {
  test('a plugin read from its marketplace folder is not its own twin, although the record names the cached copy', () => {
    const installed = { version: 2, plugins: { 'smarttokensaver@smarttokensaver-folder': [{ scope: 'user', installPath: '/home/u/.claude/plugins/cache/smarttokensaver-folder/smarttokensaver/1.0.0' }] } }
    const root = '/work/smart-token-saver'
    expect(otherBuilds(installed, { root, name: 'smarttokensaver' })).toHaveLength(1)
    expect(otherBuilds(installed, { root, name: 'smarttokensaver', folders: { 'smarttokensaver-folder': root } })).toEqual([])
    expect(ownInstalls(installed, root, undefined, { 'smarttokensaver-folder': root }).map(r => r.id)).toEqual(['smarttokensaver@smarttokensaver-folder'])
  })
})

describe('more room for this chat (R10)', () => {
  test('the sizes offered are above the default and within the model', () => {
    expect(chatWindowSteps(300_000, 1_000_000)).toEqual([400_000, 500_000, 700_000, 1_000_000])
    expect(chatWindowSteps(300_000, 500_000)).toEqual([400_000, 500_000])
    expect(chatWindowSteps(500_000, 400_000)).toEqual([])
    // Claude Code's own default is already the model's window: nothing bigger to offer.
    expect(chatWindowSteps(null, 1_000_000)).toEqual([])
    expect(chatWindowSteps(300_000, undefined)).toEqual([])
    expect(effectiveWindow(300_000, null)).toBe(300_000)
    expect(effectiveWindow(300_000, 500_000)).toBe(500_000)
  })

  test('the thresholds follow this chat\'s window, unless Claude Code shows it runs on another', () => {
    // Not read yet: the override, less the 33k buffer.
    expect(effectiveThresholds(500_000, null, 1_000_000).trigger).toBe(467_000)
    expect(effectiveThresholds(500_000, null, 1_000_000).handoffFrom).toBe(233_500)
    // Read, and in force: Claude Code's own trigger.
    const inForce = { raw: 500_000, trigger: 470_000, modelWindow: 1_000_000, autoCompact: true }
    expect(effectiveThresholds(500_000, inForce).trigger).toBe(470_000)
    // Read, and the hook did not take (still 300k): what Claude Code really does.
    const blocked = { raw: 300_000, trigger: 267_000, modelWindow: 1_000_000, autoCompact: true }
    expect(effectiveThresholds(500_000, blocked).trigger).toBe(267_000)
    // No override: as before.
    expect(effectiveThresholds(null, blocked).trigger).toBe(267_000)
    // 700k asked on a 1M model, then a switch to a 200k model: the read (200k, compacting at 167k) wins, and the
    // 700k is not in use there.
    const small = { raw: 200_000, trigger: 167_000, modelWindow: 200_000, autoCompact: true }
    expect(effectiveThresholds(700_000, small).trigger).toBe(167_000)
    expect(chatWindowState(700_000, small, true)).toBe('not-applied')
    // Hook known not to take: before a read neither the override nor the default is assumed.
    expect(effectiveThresholds(500_000, null, 1_000_000, 300_000, true).trigger).toBe(967_000)
    expect(effectiveThresholds(500_000, null, 1_000_000, 300_000, false).trigger).toBe(467_000)
  })

  /**
   * A chat on a model with `window` tokens, `tokens` used so far; the session id can change between starts. The engine
   * reports the window it compacts against in the breakdown: with `hook` it takes what the plugin's settings.read hook
   * hands it (read through the hooks, as Claude Code merges), `blocked` it ignores the hook (as under an organization's policy plugin),
   * and a per-model value (what /autocompact writes) wins in both. `none` reports no breakdown at all.
   */
  function roomy(on: On, window: number, tokens: number, mode: 'hook' | 'blocked' | 'none' = 'none', stored: Record<string, unknown> = {}) {
    engine(on, { HOME: '/home/t' }, 'claude-opus-5-5', [], { setupDone: true, ...stored })
    mock.clock(on)
    const chat = { id: 'chat-a' }
    /** Every other file the plugin wrote (the backups beside the settings file), by path. */
    const written: Record<string, string> = {}
    // hookValue: the window the engine took from the plugin's settings.read answer (the test engine cannot merge
    // settings through the hooks, so each test says what Claude Code would have taken).
    // fileDefault: autoCompactWindow in ~/.claude/settings.json. pins: what /autocompact pinned in each chat (Claude Code
    // keeps it in the session's own metadata, above the files).
    const engineState = { refuse: false, noPin: false, modelValue: undefined as number | undefined, draft: '', hookValue: 300_000, fileDefault: undefined as number | undefined, pins: {} as Record<string, number | undefined>, writes: [] as string[], other: { theme: 'dark' } as Record<string, unknown> }
    const fileJson = () => ({ ...engineState.other, ...(engineState.fileDefault ? { autoCompactWindow: engineState.fileDefault } : {}), ...(engineState.modelValue ? { modelSettings: { 'claude-opus-5-5': { autoCompactWindow: engineState.modelValue } } } : {}) })
    on('session.id', () => ({ value: chat.id }) as never)
    on('settings.read', (_$, e) => ({ value: ['policy', 'project', 'local'].includes(String((e as { source?: string }).source)) ? {} : fileJson() }) as never)
    on('fs.read', (_$, e, next) => {
      const path = String((e as { path: string }).path)
      if (path === '/home/t/.claude/settings.json') return { value: JSON.stringify(fileJson()) } as never
      if (path in written) return { value: written[path] } as never
      return next(e)
    })
    on('fs.write', (_$, e) => {
      const { path, text } = e as { path: string; text: string }
      if (path !== '/home/t/.claude/settings.json' && !engineState.refuse) written[path] = text
      // Under an organization's policy plugin (sec-default), Claude Code refuses plugins a write to Claude Code's settings files (not the backup).
      if (engineState.refuse && path.endsWith('/.claude/settings.json')) throw new Error('a Claude Code settings file is not for plugins outside policy to write; read settings with $.settings.read')
      engineState.writes.push(path)
      if (path === '/home/t/.claude/settings.json') {
        const j = JSON.parse(text) as Record<string, unknown> & { modelSettings?: Record<string, { autoCompactWindow?: number }> }
        engineState.fileDefault = typeof j.autoCompactWindow === 'number' ? j.autoCompactWindow : undefined
        engineState.modelValue = j.modelSettings?.['claude-opus-5-5']?.autoCompactWindow
        const { autoCompactWindow: _a, modelSettings: _m, ...rest } = j
        engineState.other = rest
      }
      return { value: undefined } as never
    })
    on('session.usage', async ($, e) => {
      const context = { tokens, window, percent: Math.round((tokens / window) * 100) }
      if (mode === 'none' || !(e as { breakdown?: string }).breakdown) return { value: { context } } as never
      let raw = window
      if (mode === 'hook') raw = engineState.hookValue
      if (mode === 'blocked' && engineState.fileDefault) raw = engineState.fileDefault
      if (engineState.modelValue) raw = engineState.modelValue
      if (engineState.pins[chat.id]) raw = engineState.pins[chat.id]!
      raw = Math.min(raw, window)
      return { value: { context: { ...context, breakdown: { rawMaxTokens: raw, isAutoCompactEnabled: true, autoCompactThreshold: raw - 33_000, autocompactSource: raw === window ? 'auto' : 'settings', model: 'claude-opus-5-5' } } } } as never
    })
    // The prompt box: what the plugin puts there, and the person's own draft.
    on('prompt.read', () => ({ value: { text: engineState.draft, cursor: 0 } }) as never)
    on('turn.complete', () => ({ text: '' }))
    // Claude Code's own /autocompact, beneath the plugin.
    on('command.run', () => ({ text: 'ok' }))
    on('prompt.fill', (_$, e) => {
      engineState.draft = (e as { text: string }).text
      return { isFilled: true, text: engineState.draft, cursor: engineState.draft.length } as never
    })
    const toasts: string[] = []
    on('ui.toast', (_$, e) => {
      toasts.push(String((e as { text?: string }).text ?? e))
      return { value: undefined } as never
    })
    const copied: string[] = []
    on('ui.copy', (_$, e) => {
      copied.push((e as { text: string }).text)
      return { value: { isCopied: true as const } } as never
    })
    /** The person presses Enter on what the box holds: /autocompact N writes the per-model value, as Claude Code does. */
    const send = async ($: Engine) => {
      const m = engineState.draft.match(/^\/autocompact (\d+|auto)$/)
      if (m) engineState.modelValue = m[1] === 'auto' ? undefined : Number(m[1])
      if (m && !engineState.noPin) engineState.pins[chat.id] = engineState.modelValue
      engineState.draft = ''
      await $.command.run({ command: 'autocompact', args: m?.[1] ?? '' })
    }
    return { chat, toasts, copied, engineState, send, written }
  }
  const say = async ($: Engine, args: string) => String(((await $.command.run({ command: 'smarttokensaver', args })) as { text?: string }).text)
  const tick = () => new Promise(r => setTimeout(r, 30))
  /** A turn ends: the plugin reads the window again. */
  const turnEnds = async ($: Engine) => {
    await $.turn.complete({ turnId: 't9', answer: '', durationMs: 1, isAborted: false, reason: 'completed' } as never)
    await tick()
  }

  test('a per-model window the person set on their own stays in their file, also where it equals the default', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked')
    // Set with /autocompact before the plugin came, pinned in this chat: the plugin handed out no line for it.
    w.engineState.modelValue = 300_000
    w.engineState.pins['chat-a'] = 300_000
    await openChat($, on)
    await tick()
    await turnEnds($)
    expect(w.engineState.modelValue).toBe(300_000)
    expect(w.engineState.writes).toEqual([])
  })

  test('the settings file is backed up before each change, and the copies before stay (.bak, .bak.1)', async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked', { settingsHookBlocked: true })
    w.engineState.other = { theme: 'dark' }
    const files = w.written
    await openChat($, on)
    await tick()
    expect(await say($, 'window 400k')).toContain('400k')
    await tick()
    expect(await say($, 'window 500k')).toContain('500k')
    await tick()
    expect(w.engineState.fileDefault).toBe(500_000)
    const bak = '/home/t/.claude/settings.json.smarttokensaver.bak'
    // The newest copy holds the file before the second change, the one before it the file as the person had it.
    expect(JSON.parse(files[bak]!).autoCompactWindow).toBe(400_000)
    expect(JSON.parse(files[`${bak}.1`]!).autoCompactWindow).toBeUndefined()
    expect(JSON.parse(files[`${bak}.1`]!).theme).toBe('dark')
  })

  test('/smarttokensaver window this sets, shows and resets this chat\'s window; a new chat is back on the default', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'hook')
    await openChat($, on)
    await tick()
    expect(await say($, 'window this')).toBe('This chat uses your default, 300k. Other sizes for this chat: 150k, 200k, 250k, 350k, 400k, 500k, 700k, 1M.')
    // The engine takes the hook's value: a window read confirms it before the plugin says so.
    w.engineState.hookValue = 500_000
    expect(await say($, 'window this 500k')).toBe("This chat's window is 500k (it compacts at about 467k). New chats use your default, 300k.")
    expect(await say($, 'window this')).toContain('500k in use for this chat.')
    w.engineState.hookValue = 300_000
    expect(await say($, 'window this reset')).toBe('This chat is back on your default: 300k.')
    expect(await say($, 'window this 700k')).toContain('700k')
    // Another chat: its own state, so the default again.
    w.chat.id = 'chat-b'
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    expect(await say($, 'window this')).toContain('This chat uses your default, 300k.')
  })

  test('without a window read nothing is said to be in use: "asked", and after a turn that still shows another window, "not applied"', async ($, on) => {
    roomy(on, 1_000_000, 50_000, 'none')
    await openChat($, on)
    expect(await say($, 'window this 500k')).toBe('Asked for 500k for this chat. It shows as in use once Claude Code confirms it.')
    expect(await say($, 'window this')).toContain('500k asked.')
    expect(chatWindowState(500_000, null, false)).toBe('asked')
    expect(chatWindowState(500_000, { raw: 300_000, modelWindow: 1_000_000 }, false)).toBe('asked')
    expect(chatWindowState(500_000, { raw: 300_000, modelWindow: 1_000_000 }, true)).toBe('not-applied')
    expect(chatWindowState(500_000, { raw: 500_000, modelWindow: 1_000_000 }, false)).toBe('active')
    expect(chatWindowWords(500_000, 'not-applied', { raw: 300_000 }).card).toBe('500k not applied: Claude Code still uses 300k.')
    expect(chatWindowWords(500_000, 'active', { raw: 500_000, modelValue: 500_000 }).card).toBe('500k in use, set with /autocompact for every chat on this model.')
  })

  test('asked through the hook and not taken: after a turn it says not applied and offers /autocompact, for the whole model', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'hook')
    await openChat($, on)
    await tick()
    // The engine keeps 300k although the hook hands it 500k.
    expect(await say($, 'window this 500k')).toBe('Asked for 500k for this chat. It shows as in use once Claude Code confirms it.')
    await turnEnds($)
    expect(await say($, 'window this')).toContain('500k not applied: Claude Code still uses 300k.')
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('/autocompact 500000')
    expect(w.toasts.at(-1)).toBe(AUTOCOMPACT_NOTE)
    await panel.unmount()
  })

  test('a size above the model is refused; any size within it is taken, smaller than the default too', async ($, on) => {
    roomy(on, 500_000, 50_000)
    await openChat($, on)
    expect(await say($, 'window this 700k')).toBe('Pick a size from 100k to 500k, e.g. 150k, 200k, 250k. Or /smarttokensaver window this reset.')
    expect(await say($, 'window this 250k')).toContain('250k')
    expect(await say($, 'window this 450k')).toContain('450k')
    expect(chatWindowChoices(300_000, 500_000)).toEqual([150_000, 200_000, 250_000, 350_000, 400_000, 500_000])
  })

  test('window this works with the window left to Claude Code too', { options: { compactWindow: 'default' } } as never, async ($, on) => {
    roomy(on, 1_000_000, 50_000)
    await openChat($, on)
    expect(await say($, 'window this 500k')).toContain('500k')
  })

  test('where the default is not applied (another window in use), This chat only goes through /autocompact at once', async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'hook')
    // Claude Code runs on 400k although 300k is asked: the hook does not take, and no flag says so yet.
    w.engineState.hookValue = 400_000
    await openChat($, on)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-chat-window', value: '700000' })
    await tick()
    // Nothing is typed into the chat: the command waits in its row for Paste into chat or Copy.
    expect(w.engineState.draft).toBe('')
    expect(w.toasts.at(-1)).toBe(sendHint(700_000))
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeDefined()
    expect(w.toasts.join(' ')).not.toContain('Asked for 700k')
    await panel.unmount()
  })

  test('near compaction the bar has no Context size button; the Context card\'s This chat only sets the chat\'s size, and the cards say this chat\'s size once it is in use', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'hook')
    await openChat($, on)
    await tick()
    // The bar keeps no Context size button (it crowded the bar): Settings → Context size and the swamp band offer it.
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'dash-room' })).toBeUndefined()
    await band.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    expect(await drawn(panel)).toContain('This chat only')
    expect(((await panel.find({ key: 'settings-chat-window' }))?.props.options as { value: string }[] | undefined)?.map(o => o.value)).toContain('1000000')
    w.engineState.hookValue = 500_000
    await panel.select({ key: 'settings-chat-window', value: '500000' })
    await tick()
    expect(w.toasts).toContain("This chat's window is 500k (it compacts at about 467k). New chats use your default, 300k.")
    expect(await drawn(panel)).toContain('500k in use for this chat.')
    await panel.press({ key: 'settings-back' })
    expect(await drawn(panel)).toContain('New: 300k / Current: 500k')
    await panel.press({ key: 'settings-card-context' })
    w.engineState.hookValue = 300_000
    await panel.select({ key: 'settings-chat-window', value: 'default' })
    expect(w.toasts).toContain('This chat is back on your default: 300k.')
    await panel.unmount()
  })

  test('the swamp band keeps More room: it takes the bar\'s place near compaction', { options: { layout: 'default' } } as never, async ($, on) => {
    roomy(on, 1_000_000, 240_000, 'hook')
    await openChat($, on)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Chat window is getting swamped')
    expect((await band.find({ key: 'swamp-room' }))?.props).toMatchObject({ label: 'Context size' })
    await band.unmount()
  })

  test('blocked hook: the default goes into the settings file with one click; More room offers /autocompact, which stays this chat\'s', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked', { settingsHookBlocked: true })
    await openChat($, on)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    // The file holds no size: New chats shows what the file gives new chats, Claude Code's own window (taken over at
    // the chat's start). A pick saves it there.
    expect(await drawn(panel)).toContain(FILE_MODE_NOTE)
    expect(await drawn(panel)).toContain("No size in settings.json: Claude Code's own.")
    await panel.select({ key: 'settings-window', value: '300000' })
    await tick()
    expect(w.engineState.fileDefault).toBe(300_000)
    expect(w.engineState.other.theme).toBe('dark')
    expect(w.engineState.writes).toContain('/home/t/.claude/settings.json.smarttokensaver.bak')
    expect(w.toasts.at(-1)).toBe('New chats use 300k, saved in ~/.claude/settings.json.')
    // This chat follows the file at once (nothing pinned here): no command left, no save button.
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeUndefined()
    expect(await panel.find({ key: 'settings-window-save' })).toBeUndefined()
    // More room: the pick types nothing; Paste into chat puts the line in the box.
    await panel.select({ key: 'settings-chat-window', value: '500000' })
    expect(w.engineState.draft).toBe('')
    expect(w.toasts.at(-1)).toBe(sendHint(500_000))
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('/autocompact 500000')
    expect(w.toasts.at(-1)).toBe(AUTOCOMPACT_NOTE)
    expect(await drawn(panel)).toContain('500k asked.')
    // Enter: Claude Code pins 500k here and writes it per model; the plugin takes the per-model value out of the file
    // again, so new chats stay on 300k while this chat keeps 500k.
    await w.send($)
    await tick()
    await tick()
    expect(w.engineState.modelValue).toBeUndefined()
    expect(w.engineState.fileDefault).toBe(300_000)
    expect(await drawn(panel)).toContain('500k in use for this chat.')
    await panel.unmount()
  })

  test('blocked hook: New chats writes the settings file; a chat with its own pinned size gets the /autocompact under This chat only', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked', { settingsHookBlocked: true })
    await openChat($, on)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-window', value: '500000' })
    await tick()
    // Nothing typed, nothing to send for new chats: the file has it, and this unpinned chat follows at once.
    expect(w.engineState.draft).toBe('')
    expect(w.engineState.fileDefault).toBe(500_000)
    expect(w.toasts.at(-1)).toBe('New chats use 500k, saved in ~/.claude/settings.json.')
    expect(await panel.find({ key: 'settings-window-paste' })).toBeUndefined()
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeUndefined()
    expect(await drawn(panel)).toContain(FILE_MODE_NOTE)
    // A chat pinned to 400k by an earlier /autocompact: a new default leaves it there, and This chat only offers the
    // command for the new default, ready to paste.
    w.engineState.draft = '/autocompact 400000'
    await w.send($)
    await tick()
    await tick()
    await panel.select({ key: 'settings-window', value: '350000' })
    await tick()
    expect(w.engineState.fileDefault).toBe(350_000)
    expect(w.engineState.modelValue).toBeUndefined()
    expect(w.toasts.at(-1)).toContain('This chat still runs on 400k')
    // This chat only shows the size it runs on, and New chats what the file holds; the command for the new default
    // comes once Your default is picked.
    expect(await drawn(panel)).toContain('Saved in settings.json. This chat runs on 400k.')
    expect(await drawn(panel)).toContain('Runs on 400k; new chats start on 350k.')
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeUndefined()
    await panel.select({ key: 'settings-chat-window', value: 'default' })
    await tick()
    expect(await drawn(panel)).toContain('/autocompact 350000')
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeDefined()
    expect(w.engineState.draft).toBe('')
    expect(withUserWindow({ a: 1, modelSettings: { x: { autoCompactWindow: 1, other: 2 }, y: { autoCompactWindow: 3 } } }, 300_000, true)).toEqual({ a: 1, autoCompactWindow: 300_000, modelSettings: { x: { other: 2 } } })
    expect(withUserWindow({ autoCompactWindow: 300_000 }, null, true)).toEqual({})
    expect(needsAutocompact(400_000, { raw: 300_000, modelWindow: 1_000_000, source: 'settings' }, false)).toBe(false)
    expect(needsAutocompact(400_000, { raw: 300_000, modelWindow: 1_000_000, source: 'settings' }, true)).toBe(true)
    expect(needsAutocompact(400_000, { raw: 300_000, modelWindow: 1_000_000, source: 'settings', modelValue: 300_000 }, false)).toBe(true)
    expect(needsAutocompact(300_000, { raw: 300_000, modelWindow: 1_000_000, source: 'settings' }, true)).toBe(false)
    expect(needsAutocompact(400_000, { raw: 300_000, modelWindow: 1_000_000, source: 'settings', policyValue: 300_000 }, true)).toBe(false)
    await panel.unmount()
  })

  test('settings file refused (sec-default): New chats gets no command; This chat only has the /autocompact for the new default, ready to paste', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked', { settingsHookBlocked: true })
    w.engineState.refuse = true
    await openChat($, on)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-window', value: '400000' })
    await tick()
    expect(w.engineState.fileDefault).toBeUndefined()
    expect(w.engineState.draft).toBe('')
    expect(w.toasts.at(-1)).toContain("Claude Code doesn't let plugins write ~/.claude/settings.json here")
    expect(w.toasts.at(-1)).toBe(REFUSED_HINT(400_000))
    expect(await panel.find({ key: 'settings-window-paste' })).toBeUndefined()
    expect(await panel.find({ key: 'settings-window-save' })).toBeUndefined()
    expect(await drawn(panel)).toContain(REFUSED_NOTE)
    // New chats: a chat of its own asks Claude to write the file (here copied: no desktop app in the test).
    await panel.press({ key: 'settings-window-newchat' })
    expect(w.copied.at(-1)).toBe(settingsChatPrompt(400_000))
    expect(settingsChatPrompt(400_000)).toContain('"autoCompactWindow": 400000')
    expect(settingsChatLink('a b', '/x y')).toBe('claude://code/new?q=a%20b&folder=%2Fx%20y')
    expect(await drawn(panel)).toContain('Not saved yet: settings.json holds no size.')
    await panel.select({ key: 'settings-chat-window', value: 'default' })
    await tick()
    expect(await drawn(panel)).toContain('/autocompact 400000')
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('/autocompact 400000')
    // Remembered: the next pick does not try the file again.
    const writes = w.engineState.writes.length
    await panel.select({ key: 'settings-window', value: '500000' })
    await tick()
    expect(w.engineState.writes.length).toBe(writes)
    expect(await drawn(panel)).toContain('/autocompact 500000')
    await panel.unmount()
  })

  test('a settings file with the same 300k hides whether the hook takes: This chat only still shows the command to send', { options: { layout: 'default' } } as never, async ($, on) => {
    roomy(on, 1_000_000, 50_000, 'hook')
    await openChat($, on)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-chat-window', value: '500000' })
    await tick()
    expect(await panel.find({ key: 'settings-chat-window-paste' })).toBeDefined()
    expect(await drawn(panel)).toContain(COMMAND_MAYBE_NOTE)
    await panel.unmount()
  })

  test('blocked hook: going back to the size in force takes the plugin\'s own line out of the box again', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked')
    w.engineState.refuse = true
    await openChat($, on)
    await tick()
    // 300k in force through an /autocompact sent earlier.
    w.engineState.draft = '/autocompact 300000'
    await w.send($)
    await tick()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.select({ key: 'settings-window', value: '500000' })
    await tick()
    // The command waits under This chat only, never under New chats, once Your default is picked there.
    expect(await panel.find({ key: 'settings-window-paste' })).toBeUndefined()
    await panel.select({ key: 'settings-chat-window', value: 'default' })
    await tick()
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('/autocompact 500000')
    await panel.select({ key: 'settings-window', value: '300000' })
    await tick()
    expect(w.engineState.draft).toBe('')
    expect(commandPending(null, { raw: 300_000, modelWindow: 1_000_000, source: 'settings' })).toBe(false)
    expect(commandPending(null, { raw: 300_000, modelWindow: 1_000_000, source: 'settings', modelValue: 300_000 })).toBe(true)
    expect(commandPending(500_000, { raw: 300_000, modelWindow: 1_000_000, source: 'env' })).toBe(false)
    await panel.unmount()
  })

  test('a draft of the person\'s own is never overwritten: the /autocompact line goes to the clipboard', async ($, on) => {
    const w = roomy(on, 1_000_000, 200_000, 'blocked')
    await openChat($, on)
    await tick()
    w.engineState.draft = 'my half-written message'
    // The pick types nothing; it says which command to send.
    expect(await say($, 'window this 500k')).toBe(sendHint(500_000))
    expect(w.engineState.draft).toBe('my half-written message')
    expect(autocompactLine(null)).toBe('/autocompact auto')
    // Paste into chat over a draft of the person's own: the line goes to the clipboard instead.
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('my half-written message')
    expect(w.copied).toContain('/autocompact 500000')
    expect(w.toasts.at(-1)).toBe('/autocompact 500000 is copied. Paste it into the prompt and press Enter. It applies to every chat on this model until you set it back.')
    // Another /autocompact the person typed is theirs too: not replaced.
    w.engineState.draft = '/autocompact auto'
    await panel.press({ key: 'settings-chat-window-paste' })
    expect(w.engineState.draft).toBe('/autocompact auto')
    await panel.unmount()
  })

  test('a working hook that needs the next request: a second size right away still goes through the hook, not /autocompact', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'hook')
    await openChat($, on)
    await tick()
    // The engine has the default from the hook; the new size only lands with the next request.
    expect(await say($, 'window this 500k')).toBe('Asked for 500k for this chat. It shows as in use once Claude Code confirms it.')
    expect(await say($, 'window this 700k')).toBe('Asked for 700k for this chat. It shows as in use once Claude Code confirms it.')
    expect(w.engineState.draft).toBe('')
    w.engineState.hookValue = 700_000
    await turnEnds($)
    expect(await say($, 'window this')).toContain('700k in use for this chat.')
  })

  test('setup where plugins cannot set the window: the step says so, and Finish saves the size in the settings file, typing nothing', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked', { setupDone: false })
    await openChat($, on)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    let saw = ''
    let greyNext = false
    for (let i = 0; i < 8 && !(await band.find({ key: 'setup-done' })); i++) {
      saw += await drawn(band)
      // A changed size is applied before Next; Next before that only says so. 300k in force already: nothing to apply.
      if (await band.find({ key: 'setup-window-apply' })) {
        await band.press({ key: 'setup-next' })
        greyNext = w.toasts.at(-1) === 'Apply the size first, or pick the one in use.'
        await band.press({ key: 'setup-window-apply' })
        saw += await drawn(band)
      }
      await band.press({ key: 'setup-next' })
    }
    expect(saw).toContain('Apply saves it in ~/.claude/settings.json for new chats.')
    expect(greyNext).toBe(true)
    await tick()
    // Finish writes the default into the settings file; this unpinned chat follows, so nothing is left to send.
    expect(w.engineState.draft).toBe('')
    expect(w.engineState.fileDefault).toBe(300_000)
    expect(w.toasts.join(' ')).toContain('New chats use 300k, saved in ~/.claude/settings.json.')
    expect(await drawn(band)).toContain('All set. Your setup:')
    expect(await drawn(band)).toContain('New chats run on 300k')
    expect(await band.find({ key: 'setup-chat-paste' })).toBeUndefined()
    await band.press({ key: 'setup-done' })
    await band.unmount()
  })

  test('setup window step: the size this chat runs on is a choice of its own, in its place; a size new chats get needs no Apply, and Apply goes on to step 2b at once', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked', { setupDone: false, settingsHookBlocked: true })
    await openChat($, on)
    await tick()
    // This chat was set to 350k with /autocompact before.
    w.engineState.draft = '/autocompact 350000'
    await w.send($)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    for (let i = 0; i < 6 && !(await band.find({ key: 'setup-window-400000' })); i++) await band.press({ key: 'setup-next' })
    const text = await drawn(band)
    // 300k (recommended) stays picked; 350k (this chat) sits between 300k and 400k.
    expect(text).toContain('◉ 300k (recommended)')
    expect(text).toContain('○ 350k (this chat)')
    expect(text.indexOf('350k (this chat)')).toBeGreaterThan(text.indexOf('300k (recommended)'))
    expect(text.indexOf('350k (this chat)')).toBeLessThan(text.indexOf('○ 400k'))
    expect(text).toContain('Claude Code default (1M)')
    // This chat's size: it runs on it already, new chats do not yet (nothing in the file), so Apply saves it for them.
    await band.press({ key: 'setup-window-350000' })
    expect(await drawn(band)).toContain('This chat runs on 350k already; Apply saves it in ~/.claude/settings.json for new chats too.')
    // 400k: Apply writes the file and goes on at once, to step 2b, since this chat runs on 350k.
    await band.press({ key: 'setup-window-400000' })
    await band.press({ key: 'setup-window-apply' })
    await tick()
    expect(w.engineState.fileDefault).toBe(400_000)
    expect(await drawn(band)).toContain('Use 400k in this chat too?')
    // Back on the window step: the file holds 400k now, so no Apply; Next leads to step 2b again.
    await band.press({ key: 'setup-back' })
    expect(await band.find({ key: 'setup-window-apply' })).toBeUndefined()
    expect(await drawn(band)).toContain('New chats run on 400k already (~/.claude/settings.json). This chat runs on 350k: Next asks whether to switch it.')
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('Use 400k in this chat too?')
    await band.unmount()
  })

  test('setup where Claude Code keeps the settings file from plugins: Apply, then a new chat for new chats (Next waits for it), step 2b for this chat, and a summary', { options: { layout: 'default' } } as never, async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked', { setupDone: false, settingsHookBlocked: true })
    w.engineState.refuse = true
    await openChat($, on)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    for (let i = 0; i < 6 && !(await band.find({ key: 'setup-window-400000' })); i++) await band.press({ key: 'setup-next' })
    await band.press({ key: 'setup-window-400000' })
    expect(await band.find({ key: 'setup-window-apply' })).toBeDefined()
    await band.press({ key: 'setup-window-apply' })
    // The refusal is found here, once: a coloured line says the step is the person's, with its two buttons.
    expect(w.engineState.fileDefault).toBeUndefined()
    expect(await drawn(band)).toContain("A security rule keeps plugins out of Claude Code's settings: send the request in a new chat and allow the edit there.")
    expect(await band.find({ key: 'setup-window-apply' })).toBeUndefined()
    // Next waits until the request went to a new chat (or was copied).
    await band.press({ key: 'setup-next' })
    expect(w.toasts.at(-1)).toBe('Paste the request into a new chat or copy it first, or pick the size in use.')
    expect(await drawn(band)).toContain('When should a chat be compacted?')
    await band.press({ key: 'setup-window-newchat' })
    expect(w.copied.at(-1)).toBe(settingsChatPrompt(400_000))
    expect(await drawn(band)).toContain('In the new chat: send the request and allow the edit.')
    await band.press({ key: 'setup-window-copyrequest' })
    expect(w.copied.at(-1)).toBe(settingsChatPrompt(400_000))
    // Step 2b: this chat, optional, /autocompact with Paste into chat or Copy.
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('Use 400k in this chat too?')
    expect(await drawn(band)).toContain('Optional. Next skips it')
    await band.press({ key: 'setup-chat-paste' })
    expect(w.engineState.draft).toBe('/autocompact 400000')
    w.engineState.draft = ''
    // The look step goes back to 2b, 2b back to the window step.
    await band.press({ key: 'setup-next' })
    expect(await drawn(band)).toContain('Light or dark panels?')
    await band.press({ key: 'setup-back' })
    expect(await drawn(band)).toContain('Use 400k in this chat too?')
    for (let i = 0; i < 6 && !(await band.find({ key: 'setup-done' })); i++) await band.press({ key: 'setup-next' })
    // Finish does not try the file again; the last page only sums up.
    expect(w.engineState.fileDefault).toBeUndefined()
    const done = await drawn(band)
    expect(done).toContain('All set. Your setup:')
    expect(done).toContain('New chats run on 400k once you send the request in the new chat and allow the edit.')
    expect(done).toContain('This chat runs on 400k once /autocompact 400000 is sent.')
    expect(await band.find({ key: 'setup-chat-paste' })).toBeUndefined()
    await band.press({ key: 'setup-done' })
    await band.unmount()
  })

  test('/clear starts a new session id without session.start: nothing is left to set back, and this chat\'s size is gone', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked')
    await openChat($, on)
    await tick()
    expect(await say($, 'window this 700k')).toBe(sendHint(700_000))
    w.engineState.draft = '/autocompact 700000'
    await w.send($)
    await tick()
    // A handoff's clear: the id changes in the same process, and no session.start comes.
    w.chat.id = 'chat-cleared'
    const band = await $.ui.mount(DESK_BAND)
    await tick()
    await band.unmount()
    // The per-model value went from the file once the pinned 700k took: nothing to set back.
    const again = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(again ? await drawn(again) : '').not.toContain('from another chat')
    await again?.unmount()
    expect(await say($, 'window this')).toContain('This chat uses your default, 300k.')
  })

  test('Back to default keeps the record until a read shows the default in force; one model\'s record never touches another\'s', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked')
    await openChat($, on)
    await tick()
    // A Claude Code without the pin: the per-model value is taken out once, the chat falls back, and the second
    // /autocompact stays. Then the next chat offers to set it back, as before.
    w.engineState.noPin = true
    await say($, 'window this 700k')
    for (let i = 0; i < 2; i++) {
      w.engineState.draft = '/autocompact 700000'
      await w.send($)
      await tick()
      await tick()
    }
    expect(w.engineState.modelValue).toBe(700_000)
    w.chat.id = 'chat-b'
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    await band.press({ key: 'raised-back' })
    expect(w.engineState.draft).toBe('/autocompact 300000')
    await band.unmount()
    // Enter never pressed (the draft is thrown away): the next chat still asks.
    w.engineState.draft = ''
    w.chat.id = 'chat-c'
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await tick()
    const c = await $.ui.mount(DESK_BAND)
    expect(await drawn(c)).toContain('from another chat is still set (700k)')
    await c.press({ key: 'raised-back' })
    await c.unmount()
    // This time Enter: the read shows 300k for the model, the record goes, and no chat asks again.
    await w.send($)
    await tick()
    w.chat.id = 'chat-d'
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await tick()
    const d = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(d ? await drawn(d) : '').not.toContain('from another chat')
    await d?.unmount()
    // Per model: a Sonnet record and an Opus one live side by side; an offer needs the model and its value in force.
    const both = { 'claude-opus-5-5': { window: 700_000, standard: 300_000, session: 'a', model: 'claude-opus-5-5', confirmed: true }, 'claude-sonnet-5-5': { window: 500_000, standard: 300_000, session: 'a', model: 'claude-sonnet-5-5' } }
    expect(raisedToOffer(both, 'b', { model: 'claude-opus-5-5', modelValue: 700_000 })?.window).toBe(700_000)
    expect(raisedToOffer(both, 'b', { model: 'claude-sonnet-5-5', modelValue: 700_000 })).toBeNull()
    expect(raisedToOffer(both, 'b', { model: 'claude-sonnet-5-5', modelValue: 500_000 })?.window).toBe(500_000)
    // Settled by a read: Sonnet's in force is confirmed; Opus set back is dropped; a never-confirmed one is left.
    expect(settleRaised(both, { model: 'claude-sonnet-5-5', modelValue: 500_000 })?.['claude-sonnet-5-5'].confirmed).toBe(true)
    expect(Object.keys(settleRaised(both, { model: 'claude-opus-5-5', modelValue: undefined }) ?? {})).toEqual(['claude-sonnet-5-5'])
    expect(settleRaised(both, { model: 'claude-sonnet-5-5', modelValue: undefined })).toBeNull()
  })

  test('without a pin in the chat, a window raised through /autocompact stays per model and is offered back once, in a new chat', async ($, on) => {
    const w = roomy(on, 1_000_000, 50_000, 'blocked')
    await openChat($, on)
    await tick()
    w.engineState.noPin = true
    expect(await say($, 'window this 700k')).toBe(sendHint(700_000))
    for (let i = 0; i < 2; i++) {
      w.engineState.draft = '/autocompact 700000'
      await w.send($)
      await tick()
      await tick()
    }
    // The same chat: no question.
    const here = await $.ui.mount(DESK_BAND).catch(() => null)
    expect(here ? await drawn(here) : '').not.toContain('from another chat')
    await here?.unmount()
    // A new chat (or the one after a handoff's clear): asked once.
    w.chat.id = 'chat-b'
    await $.session.start({ cwd: '.', surface: 'desktop', isInteractive: true } as never)
    await tick()
    const band = await $.ui.mount(DESK_BAND)
    expect(await drawn(band)).toContain('Another window from another chat is still set (700k). Back to 300k?')
    await band.press({ key: 'raised-back' })
    expect(w.engineState.draft).toBe('/autocompact 300000')
    expect(await drawn(band)).not.toContain('from another chat')
    await band.unmount()
    expect(raisedToOffer({ window: 700_000, standard: 300_000, session: 'chat-a', model: 'opus' }, 'chat-a', { modelValue: 700_000 })).toBeNull()
    expect(raisedToOffer({ window: 700_000, standard: 300_000, session: 'chat-a', model: 'opus' }, 'chat-b', { modelValue: 300_000 })).toBeNull()
  })

  test('the chat\'s own window wins over the default, bigger or smaller', () => {
    expect(effectiveWindow(300_000, 500_000)).toBe(500_000)
    // This chat only means this chat: a smaller size holds too, and so does one under a default raised later.
    expect(effectiveWindow(700_000, 500_000)).toBe(500_000)
    expect(effectiveWindow(300_000, null)).toBe(300_000)
    expect(effectiveWindow(null, null)).toBeNull()
  })

  test('a fresh chat far from compaction shows no More room, but the Context card always has This chat only', { options: { layout: 'default' } } as never, async ($, on) => {
    roomy(on, 1_000_000, 50_000)
    await openChat($, on)
    await new Promise(r => setTimeout(r, 50))
    const band = await $.ui.mount(DESK_BAND)
    expect(await band.find({ key: 'dash-room' })).toBeUndefined()
    await band.unmount()
    await $.command.run({ command: 'smarttokensaver', args: 'settings' })
    const panel = await $.ui.mount(DESK_BAND)
    await panel.press({ key: 'settings-card-context' })
    expect(await drawn(panel)).toContain('This chat only')
    expect(await drawn(panel)).toContain('Uses your default, 300k.')
    expect(((await panel.find({ key: 'settings-chat-window' }))?.props.options as { value: string }[] | undefined)?.map(o => o.value)).toContain('700000')
    await panel.unmount()
  })
})

describe('a chat that compacts later than the window read says (resumed long chat)', () => {
  const read = { raw: 300_000, trigger: 267_000, modelWindow: 1_000_000 }
  test('below the read trigger nothing is learned', () => {
    expect(learnTrigger(null, read, 250_000, 180_000)).toBeNull()
  })
  test('past it: the next 50k step, or twice the load when that is more', () => {
    // 335k without compacting: Claude Code runs on about 400k (367k trigger), as this chat showed.
    expect(learnTrigger(null, read, 335_000, null)).toBe(367_000)
    expect(learnTrigger(null, read, 335_000, 200_000)).toBe(387_000)
    // Never past the model's own window.
    expect(learnTrigger(null, { ...read, modelWindow: 400_000 }, 380_000, 300_000)).toBe(380_000)
  })
  test('kept while the chat stays under it, raised when it grows past again', () => {
    expect(learnTrigger(367_000, withLearned(read, 367_000), 350_000, null)).toBe(367_000)
    expect(learnTrigger(367_000, withLearned(read, 367_000), 370_000, null)).toBe(417_000)
  })
  test('withLearned moves the trigger and the window, never down', () => {
    expect(withLearned(read, 367_000)).toEqual({ ...read, raw: 400_000, trigger: 367_000 })
    expect(withLearned(read, 200_000)).toEqual(read)
    expect(withLearned(read, null)).toEqual(read)
    expect(withLearned({ ...read, trigger: null }, 367_000)).toEqual({ ...read, trigger: null })
    expect(thresholds({ window: 400_000, trigger: withLearned(read, 367_000)!.trigger }).percent(335_000)).toBe((335_000 / 367_000) * 100)
  })
})

describe('Auto context alert: follows the window', () => {
  test('close to compaction in a small window, further below it in a big one', () => {
    const at = (window: number) => thresholds({ window }).swampFrom(0)
    expect(at(150_000)).toBe(Infinity)
    expect(at(200_000)).toBe(147_000)
    expect(at(250_000)).toBe(187_000)
    expect(at(300_000)).toBe(227_000)
    expect(at(400_000)).toBe(267_000)
    expect(at(500_000)).toBe(307_000)
    expect(at(700_000)).toBe(387_000)
    expect(at(1_000_000)).toBe(507_000)
  })
  test('rises with the window while its share of the trigger falls', () => {
    let last = 0
    let share = 1
    for (let w = 200_000; w <= 1_000_000; w += 25_000) {
      const t = w - 33_000
      const from = autoSwampFrom(t)
      expect(from).toBeGreaterThan(last)
      expect(from / t).toBeLessThanOrEqual(share)
      expect(t - from).toBeGreaterThanOrEqual(20_000)
      last = from
      share = from / t
    }
  })
  test('off when auto-compaction is off', () => {
    expect(thresholds({ window: 1_000_000, autoCompact: false }).swampFrom(0)).toBe(Infinity)
  })
})
