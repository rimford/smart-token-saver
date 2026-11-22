// The look of the mod's accent: navy & orange (the default), a neutral grey, violet (the upstream brand), Claude orange or rose.
// Which one a new install starts with is DEFAULT_THEME in names.ts. Every violet in the mod is one hex of the same
// family, so the theme turns them in one place instead of keeping two sets of colours: any #rrggbb in a violet hue is
// moved to the orange hue, neutrals and the other signal colours (green, yellow, red, blue) are left alone.

import { isBlank, paintedButton, PALETTES, type Palette, type Parts, type Pin } from './pinned'

export type ThemeName = 'navy' | 'neutral' | 'violet' | 'orange' | 'rose'
export const THEMES: readonly ThemeName[] = ['navy', 'neutral', 'violet', 'orange', 'rose']
// The default skin's tokens: navy, with Claude orange as the accent (its sky blue is a hue, SKY_HUE). Navy carries the look; the orange is only ever a thin highlight (the effort flash) or a mark,
// never a fill behind light text and never text on a light surface (3.1:1). Sky is the calm secondary the accent text is drawn in.
export const BRAND_NAVY = '#00243B'
export const BRAND_ORANGE = '#D97757'
// Neutral: the violets lose almost all colour and keep their lightness, so the accent reads as a cool light grey.
const NEUTRAL_HUE = 215
const SKY_HUE = 199
// The hue each theme turns the violets to. Rose is a cherry-blossom pink; its sparkles are drawn as falling petals (see petals).
const HUES: Record<Exclude<ThemeName, 'violet' | 'navy' | 'neutral'>, number> = { orange: 15, rose: 340 }

let current: ThemeName = 'violet'
// Light appearance: the panels are drawn for a dark app; on a light one every colour is turned (lightHex) so the surfaces
// come out pale and the text and accents deep. It sits on top of the theme's hue, so every theme has a light form.
let light = false
export const setLight = (on: boolean) => {
  if (on !== light) lmemo.clear()
  light = on
}
export const isLight = () => light && !adaptive
// Adaptive appearance ("Automatic"): the plugin cannot read whether the desktop app is light or dark (that switch lives in
// the app alone; Claude Code's own theme setting often says otherwise). So it paints no ground of its own: panels show
// the app's own surface, text takes the app's own text colour, edges and hovers are a see-through grey, and the accents
// sit at a lightness that reads on both. Navy accents turn orange (navy would vanish on a dark app).
// Wanted when the appearance is Automatic; it holds on the desktop and the phone, where a panel is a web page that can
// show the app through. A terminal keeps the painted panels (themedEls sets it per surface).
let adaptiveWanted = false
let adaptive = false
export const setAdaptive = (on: boolean) => {
  adaptiveWanted = on
  if (!on && !pinWanted) adaptive = false
}
export const isAdaptive = () => adaptive
// Pinned appearance ("Always dark", "Always light"): the panel is built exactly as in Automatic (the same tree, the same
// see-through greys and mid-tone accents), and only what Automatic leaves to the app is named outright in the pinned
// mode's colours: the ground, the text, and the controls (pinned.ts paints them). So a pinned panel looks like Automatic
// does in an app of that mode, whatever mode the app is in, and the app itself is never touched. Like adaptive it holds
// on the desktop and the phone; a terminal keeps the painted panels.
let pinWanted: Pin | null = null
let pin: Pin | null = null
export const setPinned = (mode: Pin | null) => {
  pinWanted = mode
  if (!mode) {
    pin = null
    if (!adaptiveWanted) adaptive = false
  }
}
/** The pinned mode of the panel being drawn, or null (Automatic, or a terminal). */
export const pinned = () => pin
/** The pinned mode's colours, or null. */
export const palette = (): Palette | null => (pin ? PALETTES[pin] : null)
// The parts as the app handed them over, for what is drawn in final colours (the ground, the painted controls).
let rawParts: Parts | null = null
export const parts = () => rawParts
export const setTheme = (name: ThemeName) => {
  // The turned colours are remembered per hex, so a new theme starts with none: orange's would show in rose.
  if (name !== current) { memo.clear(); lmemo.clear() }
  current = name
}
export const getTheme = () => current

/** The brand violet, the colour the rest of the family is turned from. */
export const VIOLET = '#a79cf7'

// Claude's orange (#d97757) sits at hue 15, saturation 63%, lightness 60%. The brand violet is lighter and stronger, so
// the saturation and the lightness of what turns come down to meet it.
const hexRe = /#[0-9a-fA-F]{6}\b/g
const memo = new Map<string, string>()
const lmemo = new Map<string, string>()
const amemo = new Map<string, string | null>()

function toHsl(r: number, g: number, b: number): [number, number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
  }
  return [h, s, l, d]
}

function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0')
  return `#${byte(r)}${byte(g)}${byte(b)}`
}

/** One hex in the current theme: violets turn orange, everything else stays. */
export function tintHex(hex: string): string {
  if (current === 'violet') return hex
  const key = hex.toLowerCase()
  const hit = memo.get(key)
  if (hit) return hit
  const n = parseInt(key.slice(1), 16)
  const [h, s, l, chroma] = toHsl((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  // Violet hues with real colour in them; the greys that lean blue (hardly any chroma or saturation) are not in the family.
  const violet = h >= 235 && h <= 300 && chroma >= 0.03 && s >= 0.15
  // Navy & orange: light violets (text, accents, art) turn sky blue; dark ones (surfaces, edges) turn the app's own
  // dark grey, so Always dark looks like the app in dark mode, not a blue panel.
  const out = violet && current === 'navy'
    ? (l > 0.5 ? fromHsl(SKY_HUE, Math.min(s, 0.7), Math.max(0.55, l - 0.12)) : fromHsl(NEUTRAL_HUE, Math.min(s, 0.04), Math.max(0.12, Math.min(0.3, l))))
    : violet && current === 'neutral' ? fromHsl(NEUTRAL_HUE, Math.min(s, 0.12), l)
    : violet ? fromHsl(HUES[current as 'orange' | 'rose'], Math.min(1, s * (current === 'rose' ? 0.9 : 0.75)), l > 0.5 ? Math.max(0.5, l - (current === 'rose' ? 0.08 : 0.19)) : l) : hex
  memo.set(key, out)
  return out
}

// A cherry-blossom petal, and the fall it makes: each sparkle of the art becomes a petal at the same place, falling slowly
// and turning as it goes. The drawing's own CSS animates sparkles in place; the petals bring their own.
const PETAL = 'M0 -2.2C1.7 -1.7 1.9 0.9 0 2.2C-1.9 0.9 -1.7 -1.7 0 -2.2Z'
const PETAL_CSS = '.pt{fill:#ffb3cf;opacity:0;animation-name:fall;animation-timing-function:linear;animation-iteration-count:infinite}@keyframes fall{0%{opacity:0;transform:translate(0,-4px) rotate(0deg)}12%{opacity:.6}85%{opacity:.5}100%{opacity:0;transform:translate(-16px,34px) rotate(280deg)}}'
function petals(text: string): string {
  if (!text.includes('class="sp"')) return text
  return text
    .replace(/<path class="sp" style="transform-origin:([\d.]+)px [\d.]+px;animation-duration:([\d.]+)s;animation-delay:([\d.]+)s" d="[^"]*"\/>/g, (_m, x: string, dur: string, delay: string) =>
      `<g transform="translate(${x} 0)"><path class="pt" style="animation-duration:${(Number(dur) * 2.2).toFixed(1)}s;animation-delay:${delay}s" d="${PETAL}"/></g>`)
    .replace('</style>', `${PETAL_CSS}</style>`)
}

/**
 * One hex turned for a light app. A surface that was dark comes out pale. Text that was light comes out deep, as light as
 * it can be while still reading on the pale surfaces (4.6:1), so violet stays violet and green stays green; text that was
 * already dark is only darkened if it would not read. Drawn art has no role, so it follows its own lightness. An
 * eight-digit hex keeps its alpha.
 */
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16)
  const f = (v: number) => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
// The palest and the deepest of the turned surfaces: text has to read on both.
const PALE_REF = luminance('#e3e0ed')
export function lightHex(hex: string, role: 'text' | 'surface' | 'art' = 'art'): string {
  const key = hex.toLowerCase()
  const memoKey = role + key
  const hit = lmemo.get(memoKey)
  if (hit) return hit
  const n = parseInt(key.slice(1, 7), 16)
  const [h, s, l] = toHsl((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  const asText = role === 'text' || (role === 'art' && l >= 0.5)
  let out: string
  if (asText && current === 'navy' && h >= 180 && h <= 230 && s >= 0.3) {
    // Navy & orange on light: the blue accents (sky on dark) are drawn in the brand's navy.
    out = BRAND_NAVY
  } else if (asText) {
    const sat = Math.min(s, 0.72)
    // Greys keep their order (main text darker than dim); strong colours start a little lighter so they stay colours.
    let at = l >= 0.5 ? Math.max(0.12, Math.min(0.5, 1 - l + (s >= 0.35 ? 0.2 : 0))) : l
    out = fromHsl(h, sat, at)
    while (at > 0.12 && (PALE_REF + 0.05) / (luminance(out) + 0.05) < 4.6) {
      at -= 0.01
      out = fromHsl(h, sat, at)
    }
  } else {
    // Near white like the app's own light panels: the darkest surfaces (the panel itself) come out lightest, and the
    // lighter ones (hover, edges, header) a step darker, as they were a step lighter on dark.
    // A tinted surface (an alert band, the brand panel) keeps more of its colour, so cold still reads blue and swamp green.
    // Navy & orange keeps its light surfaces white and grey: no pale blue.
    // Navy & orange keeps its light surfaces near grey, except an orange one (the swamp band): that stays a pale orange.
    const data = current === 'navy'
    const orange = data && h >= 8 && h <= 32 && s >= 0.4
    const top = orange ? 0.94 : data ? 0.975 : s >= 0.2 ? 0.955 : 0.99
    const sat = orange ? Math.min(s, 0.7) : data ? Math.min(s, 0.12) : Math.min(s, s >= 0.2 ? 0.6 : 0.35)
    out = l >= 0.5 ? key.slice(0, 7) : fromHsl(h, sat, Math.max(0.8, Math.min(top, top - (l - 0.07) * 0.9)))
  }
  const result = key.length === 9 ? out + key.slice(7) : out
  lmemo.set(memoKey, result)
  return result
}
/**
 * One hex for the adaptive appearance, by role. null means "none of its own": a surface shows the app's ground, a text
 * takes the app's text colour. Greys are told apart by lightness (the base colours are drawn for a dark app: the darkest
 * surface is the panel, lighter ones are header and hover; the lightest text is the main text, mid greys are dim).
 */
export function adaptHex(hex: string, role: 'text' | 'surface' | 'edge' | 'art'): string | null {
  const key = current + role + hex.toLowerCase()
  if (amemo.has(key)) return amemo.get(key) ?? null
  const n = parseInt(hex.slice(1, 7), 16)
  const [h, s, l, chroma] = toHsl((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  const grey = chroma < 0.09 || s < 0.14
  // The blues of navy & orange (navy panels, sky accents) count as greys for grounds and edges and turn orange as text
  // or art: on the app's own ground the plugin's one colour is its orange. Only in navy & orange: other themes keep
  // their hue.
  const navy = current === 'navy' && h >= 185 && h <= 225 && !grey
  // A mid tone of a colour: dark enough on a pale app, light enough on a dark one.
  // Blues and violets look darker at the same lightness, so they sit a step higher.
  const mid = (hh: number, ss: number) => fromHsl(hh, Math.min(ss, 0.7), hh >= 200 && hh <= 300 ? 0.64 : 0.56)
  let out: string | null
  if (role === 'surface') {
    // The darkest ground is the panel: none of its own. Lighter ones (header, hover, pills) a see-through grey.
    out = grey || navy ? (l < 0.096 ? null : `#808080${Math.round(Math.min(0.22, (l - 0.06) * 1.3) * 255).toString(16).padStart(2, '0')}`)
      // A coloured ground (the swamp band) only as a hint of its colour: the app's own ground still carries it.
      : `${mid(h, s)}14`
  } else if (role === 'edge') {
    out = grey || navy ? '#8080804d' : `${mid(h, s)}4d`
  } else if (role === 'text') {
    out = grey ? null : navy ? BRAND_ORANGE : mid(h, s)
  } else {
    // Art: greys become a mid grey that shows on both grounds (dark ones see-through), colours a mid tone.
    // A dark navy in art is a ground (a pill, a hover box), so it becomes the see-through grey too, not orange.
    out = grey || (navy && l < 0.3) ? (l < 0.3 ? '#80808040' : '#8f8f96') : navy ? BRAND_ORANGE : mid(h, s)
  }
  amemo.set(key, out)
  return out
}
const adaptRe = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-fA-F])/g
/** Every hex in an SVG, for the adaptive appearance; a shape marked data-keep keeps its colours. */
function adaptArt(text: string): string {
  return text.replace(/(<[^>]*>)|([^<]+)/g, (part: string, tag?: string) =>
    tag && tag.includes('data-keep') ? part : part.replace(adaptRe, hx => {
      const turned = adaptHex(hx, 'art') ?? hx
      return hx.length === 9 && turned.length === 7 ? turned + hx.slice(7) : turned
    }))
}
const lightRe = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-fA-F])/g

/** Every hex in a string (an SVG, a style) in the current theme. */
export function tint(text: string): string {
  if (adaptive) return adaptArt(current === 'violet' ? text : text.replace(hexRe, tintHex))
  if (current === 'violet' && !(light && !adaptive)) return text
  const turned = current === 'violet' ? text : text.replace(hexRe, tintHex)
  // Petals only where the art was violet and has turned pink: the green, yellow, blue and red cards keep their sparkles.
  const drawn = current === 'rose' && turned !== text ? petals(turned) : turned
  if (!light) return drawn
  // A shape marked data-keep (a switch's knob) keeps its colour: it sits on a colour of its own, not on the panel.
  return drawn.replace(/(<[^>]*>)|([^<]+)/g, (part: string, tag?: string) =>
    tag && tag.includes('data-keep') ? part : part.replace(lightRe, hex => lightHex(hex)))
}

/** The glow of the effort word when it changes: orange on dark in navy & orange (navy on light, where orange would
 * not read as text), otherwise a stronger tone of the theme's accent. */
export const highlight = () => current === 'navy' ? (light && !adaptive ? BRAND_NAVY : BRAND_ORANGE) : tintHex('#9b7bff')
/** A switch that is on: the brand's orange in navy & orange, on dark and light alike; the theme's accent otherwise. */
export const switchOn = () => current === 'navy' ? BRAND_ORANGE : tintHex(VIOLET)

/** The accent as text colour. */
export const accent = () => tintHex(VIOLET)

type Component = (props: Record<string, unknown>) => unknown
const wrapped = new WeakMap<object, Component>()
/** Scheme art for a pinned mode: its dark rules always hold (dark) or never (light), its light rules the other way. */
export function pinScheme(src: string, mode: Pin): string {
  return src.replace(/@media\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/g, (_m, scheme: string) => (scheme === mode ? '@media all' : '@media not all'))
}

/** The Svg element that draws its source in the theme. In violet it is the app's own, untouched. */
export function themedSvg<T>(Svg: T): T {
  if ((current === 'violet' && !light && !adaptive) || typeof Svg !== 'function') return Svg
  let wrap = wrapped.get(Svg as object)
  if (!wrap) {
    const inner = Svg as unknown as Component
    // A drawing marked data-raw is already drawn for the theme and the appearance (the navy & orange art): left alone.
    wrap = props => {
      const src = props.source
      if (typeof src !== 'string') return inner(props)
      // Adaptive: art drawn for a scheme (data-scheme, its own @media) stays; raw art is only brought to mid tones.
      // Pinned: art that follows the app's mode through its own @media is told the pinned mode instead.
      if (adaptive) return inner(src.includes('data-scheme') ? (pin ? { ...props, source: pinScheme(src, pin) } : props) : { ...props, source: src.includes('data-raw') ? adaptArt(src) : tint(src) })
      return inner(!src.includes('data-raw') ? { ...props, source: tint(src) } : props)
    }
    wrapped.set(Svg as object, wrap)
  }
  return wrap as unknown as T
}

const PAINT = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']
const paint = (v: unknown, role: 'text' | 'surface') => (typeof v === 'string' && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v) ? lightHex(v, role) : v)
/** A props object with its hex colours (and those of its hover) turned for a light app. */
export function lightProps(props: Record<string, unknown>): Record<string, unknown> {
  let out = props
  for (const k of PAINT) {
    const turned = paint(props[k], k === 'color' ? 'text' : 'surface')
    if (turned !== props[k]) out = { ...out, [k]: turned }
  }
  const hover = props.hover
  if (hover && typeof hover === 'object') out = { ...out, hover: lightProps(hover as Record<string, unknown>) }
  return out
}
/** A props object for the adaptive appearance: no ground, the app's text colour, see-through edges (hover too). */
export function adaptProps(props: Record<string, unknown>, inHover = false): Record<string, unknown> {
  let out: Record<string, unknown> = props
  for (const k of PAINT) {
    const v = props[k]
    if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(v)) continue
    // Fully see-through stays so: it is there to keep the app's own hover off (a card's blank click layers).
    if (v.length === 9 && v.slice(7) === '00') continue
    const role = k === 'color' ? 'text' : k === 'backgroundColor' ? 'surface' : 'edge'
    let turned = adaptHex(v, role)
    // A colour that was see-through keeps being so.
    if (turned && v.length === 9 && turned.length === 7) turned += v.slice(7)
    if (turned === v) continue
    out = { ...out }
    if (turned === null && inHover && role === 'surface') {
      // A hover ground that turns into the panel's own: say none outright, or the app lights the part in its own grey
      // (one patch per button where the card should light as a whole).
      out[k] = '#00000000'
    } else if (turned === null) {
      delete out[k]
      // A mid-grey text was the dim one: the app's own dim.
      if (role === 'text') {
        const n = parseInt(v.slice(1, 7), 16)
        const l = (Math.max(n >> 16, (n >> 8) & 255, n & 255) + Math.min(n >> 16, (n >> 8) & 255, n & 255)) / 510
        if (l < 0.62) out.dimColor = true
      }
    } else out[k] = turned
  }
  const hover = props.hover
  if (hover && typeof hover === 'object') out = { ...out, hover: adaptProps(hover as Record<string, unknown>, true) }
  return out
}
const adaptWrapped = new WeakMap<object, Component>()
const adapted = (Part: unknown): unknown => {
  if (typeof Part !== 'function') return Part
  let wrap = adaptWrapped.get(Part as object)
  if (!wrap) {
    const inner = Part as unknown as Component
    wrap = props => inner(props && typeof props === 'object' ? adaptProps(props) : props)
    adaptWrapped.set(Part as object, wrap)
  }
  return wrap
}
const lightWrapped = new WeakMap<object, Component>()
const lit = (Part: unknown): unknown => {
  if (typeof Part !== 'function') return Part
  let wrap = lightWrapped.get(Part as object)
  if (!wrap) {
    const inner = Part as unknown as Component
    wrap = props => inner(props && typeof props === 'object' ? lightProps(props) : props)
    lightWrapped.set(Part as object, wrap)
  }
  return wrap
}

// Text the plugin draws always carries its own colour. A Text with none (or only dimColor) would take the app's
// own text colour, which follows the app's light or dark mode, not the panel's: the desktop app can be dark while
// Claude Code's theme setting (all a plugin can read) says light, and white text then sat on the pale panel.
export const TEXT_DEFAULT = '#d4d4d8'
export const DIM_DEFAULT = '#8b8b93'
/** A Text's props with a colour of the panel's own where it had none: dim text grey, other text the main text colour. */
export function ownColour(props: Record<string, unknown>): Record<string, unknown> {
  if (typeof props.color === 'string' && props.color) return props
  const { dimColor, ...rest } = props
  return { ...rest, color: dimColor ? DIM_DEFAULT : TEXT_DEFAULT }
}
const colouredWrapped = new WeakMap<object, Component>()
const coloured = (Part: unknown): unknown => {
  if (typeof Part !== 'function') return Part
  let wrap = colouredWrapped.get(Part as object)
  if (!wrap) {
    const inner = Part as unknown as Component
    wrap = props => inner(props && typeof props === 'object' ? ownColour(props) : props)
    colouredWrapped.set(Part as object, wrap)
  }
  return wrap
}

// Pinned text. Automatic gives a Text no colour, so it takes the app's (and a dim one the app's dim); pinned, that colour
// is the pinned mode's. A Text inside a Text has to keep inheriting, as it does in Automatic (a bold word inside an
// orange line stays orange): the outer Text draws such an inner one again without the colour it was given.
const pinInked = new WeakMap<object, { props: Record<string, unknown>; dim: boolean }>()
const pinTextWrapped = new WeakMap<object, Component>()
const pinnedText = (Part: unknown): unknown => {
  if (typeof Part !== 'function') return Part
  let wrap = pinTextWrapped.get(Part as object)
  if (!wrap) {
    const inner = Part as unknown as Component
    wrap = given => {
      if (!given || typeof given !== 'object' || !pin) return inner(given)
      const P = PALETTES[pin]
      const props = adaptProps(given)
      const own = typeof props.color === 'string' && props.color !== ''
      // Inner texts that were inked on their own: back to inheriting, except a dim one under a text with no colour of
      // its own (its dim is the pinned dim).
      const again = (kid: unknown) => {
        const was = kid && typeof kid === 'object' ? pinInked.get(kid as object) : undefined
        return was && (own || !was.dim) ? inner(was.props) : kid
      }
      const kids = Array.isArray(props.children) ? props.children.map(again) : again(props.children)
      if (own) return inner({ ...props, children: kids })
      const { dimColor, ...rest } = props
      const dim = dimColor === true
      // A hover that only turns the dim on or off names the colour it turns to.
      const over = rest.hover && typeof rest.hover === 'object' ? (rest.hover as Record<string, unknown>) : null
      const hover = over && typeof over.dimColor === 'boolean' && over.color === undefined
        ? (({ dimColor: to, ...more }) => ({ ...more, color: to ? P.dim : P.text }))(over)
        : over
      const node = inner({ ...rest, ...(hover ? { hover } : {}), color: dim ? P.dim : P.text, children: kids })
      if (node && typeof node === 'object') pinInked.set(node as object, { props: { ...props, children: kids }, dim })
      return node
    }
    pinTextWrapped.set(Part as object, wrap)
  }
  return wrap
}
// Pinned buttons: painted in the pinned mode (pinned.ts). A button with a blank label is a click layer and stays native.
const pinButtonWrapped = new WeakMap<object, Component>()
const pinnedButton = (Part: unknown): unknown => {
  if (typeof Part !== 'function') return Part
  let wrap = pinButtonWrapped.get(Part as object)
  if (!wrap) {
    const inner = Part as unknown as Component
    wrap = given => {
      if (!given || typeof given !== 'object') return inner(given)
      const props = adaptProps(given)
      return !pin || !rawParts || isBlank(props.label) ? inner(props) : paintedButton(rawParts, PALETTES[pin], props)
    }
    pinButtonWrapped.set(Part as object, wrap)
  }
  return wrap
}

/** The parts `$.ui.resolve` hands over, with the Svg in the theme, every Text in a colour of its own and, in a light
 * app, the Box, Text and Button turned light. Absent stays absent. */
export function themedEls<T extends object>(els: T, surface?: string): T {
  adaptive = (adaptiveWanted || pinWanted !== null) && surface !== undefined && surface !== 'terminal'
  pin = adaptive ? pinWanted : null
  rawParts = 'Box' in els && 'Text' in els && 'Button' in els ? (els as unknown as Parts) : rawParts
  const out: Record<string, unknown> = { ...els }
  if ('Svg' in els) out.Svg = themedSvg((els as { Svg: unknown }).Svg)
  if (adaptive && pin) {
    // Pinned: the adaptive tree, with the text and the buttons named in the pinned mode's colours.
    if ('Box' in els) out.Box = adapted((els as Record<string, unknown>).Box)
    if ('Text' in els) out.Text = pinnedText((els as Record<string, unknown>).Text)
    if ('Button' in els) out.Button = pinnedButton((els as Record<string, unknown>).Button)
    return out as T
  }
  if (adaptive) {
    // Adaptive: the app's own colours carry the panel; nothing is forced on the text.
    for (const part of ['Box', 'Text', 'Button']) if (part in els) out[part] = adapted((els as Record<string, unknown>)[part])
    return out as T
  }
  if (light && !adaptive) for (const part of ['Box', 'Text', 'Button']) if (part in els) out[part] = lit((els as Record<string, unknown>)[part])
  if ('Text' in els) out.Text = coloured(out.Text)
  return out as T
}
