// The parts the desktop panels are painted with when the Panels setting is "Always dark" or "Always light".
//
// Automatic leaves the colours to the app: its own buttons, its own dropdown, its own text colour. A fixed mode cannot use
// those, because the app draws them for its own mode (a dark app gives a native button light text, which would sit on the
// plugin's light panel). So a fixed mode paints the same controls itself, in the colours the app uses in that mode, with
// the same sizes: a rounded box (a Box with a border gets the app's corner radius), the label as text, and a blank native
// button over it for the click, the keyboard and the focus. The values below are the app's own tokens, read from its
// renderer (fill.primary, fill.secondary, fill.field, text.primary, text.secondary) and measured on its controls.

export type Pin = 'dark' | 'light'
export type Palette = {
  /** The panel's ground: the colour of the app's own slot above the prompt in that mode. */
  ground: string
  text: string
  dim: string
  primary: string
  primaryHover: string
  onPrimary: string
  secondary: string
  secondaryHover: string
  secondaryRing: string
  field: string
  fieldRing: string
  fieldRingHover: string
  ghostHover: string
  /** The open list's ground: not see-through, since a list may lie over the rows above it. */
  list: string
  listRing: string
  /** A link's ink: the app's own accent text in that mode. */
  link: string
}
export const PALETTES: Record<Pin, Palette> = {
  dark: {
    ground: '#252524', text: '#f0efec', dim: '#c3c2b7',
    primary: '#ffffff', primaryHover: '#e1e0d9', onPrimary: '#0b0b0b',
    secondary: '#ffffff1a', secondaryHover: '#ffffff24', secondaryRing: '#00000000',
    field: '#ffffff0d', fieldRing: '#ffffff1a', fieldRingHover: '#ffffff33',
    ghostHover: '#ffffff13', list: '#30302f', listRing: '#ffffff1a', link: '#6da7ec',
  },
  light: {
    ground: '#f3f3f3', text: '#0b0b0b', dim: '#52514e',
    primary: '#0b0b0b', primaryHover: '#2c2c2a', onPrimary: '#ffffff',
    secondary: '#ffffff1a', secondaryHover: '#0b0b0b0d', secondaryRing: '#0b0b0b1a',
    field: '#ffffff80', fieldRing: '#0b0b0b1a', fieldRingHover: '#0b0b0b33',
    ghostHover: '#0b0b0b0d', list: '#ffffff', listRing: '#0b0b0b1a', link: '#184f95',
  },
}

type Part = (props: Record<string, unknown>) => unknown
export type Parts = { Box: Part; Text: Part; Button: Part; Svg?: Part }

const NBSP = ' '
const CLEAR = '#00000000'
// A native control is 28 px high with 10 px of room beside its label. A painted one has a 1 px border, so its padding is
// 9 px (1.073 ch at the app's 14 px text) and 3 px (0.3 of the row unit).
const PAD_X = 1.073
const PAD_Y = 0.3
// A native control takes one text line of room (20 px) and stands 4 px over it above and below; so does a painted one.
const LINE_Y = -0.4
const FIELD_X = 0.834
const FIELD_GAP = 0.715

/** A box in the shape of the app's own button (its height, its corners, its room beside the label), for a drawn one. */
export const BUTTON_BOX = { borderStyle: 'single', borderColor: CLEAR, paddingX: PAD_X, paddingY: PAD_Y, marginY: LINE_Y } as const

/** True for a label with nothing to read: a click layer over art, which stays the app's own (it draws nothing). */
export const isBlank = (label: unknown) => typeof label !== 'string' || label.replace(/[\s ​]/g, '') === ''

// The click layer of a painted control: a blank native button, wider than any label, inside a window that cuts it to the
// control. A button that is cut by its own width instead draws "…" over the label.
function pressLayer(parts: Parts, button: Record<string, unknown>, labelLength: number): unknown {
  const blanks = Math.min(110, Math.max(40, labelLength * 3))
  return parts.Box({
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden',
    children: [parts.Box({
      width: 60, flexShrink: 0,
      children: [parts.Button({ ...button, plain: true, label: NBSP.repeat(blanks), hover: { backgroundColor: CLEAR } })],
    })],
  })
}

/** A Button's props as a painted button: primary, secondary (the default) or plain, like the app's own in that mode. */
export function paintedButton(parts: Parts, P: Palette, props: Record<string, unknown>): unknown {
  const { label, variant, plain, dimColor, hover, key, ...rest } = props
  const text = String(label)
  const id = typeof key === 'string' && key ? key : `button-${text}`
  const kind = variant === 'primary' ? 'primary' : plain ? 'plain' : 'secondary'
  const over = hover && typeof hover === 'object' ? (hover as Record<string, unknown>) : {}
  const ink = kind === 'primary' ? P.onPrimary : dimColor ? P.dim : P.text
  const inkOver = typeof over.color === 'string' && over.color ? over.color : kind !== 'primary' && dimColor ? P.text : undefined
  return parts.Box({
    key: `${id}~paint`, position: 'relative', flexShrink: 0, flexDirection: 'row', alignItems: 'center',
    borderStyle: 'single', marginY: LINE_Y,
    borderColor: kind === 'secondary' ? P.secondaryRing : CLEAR,
    ...(kind === 'primary' ? { backgroundColor: P.primary } : kind === 'secondary' ? { backgroundColor: P.secondary } : {}),
    paddingX: PAD_X, paddingY: PAD_Y,
    hover: { backgroundColor: kind === 'primary' ? P.primaryHover : kind === 'secondary' ? P.secondaryHover : P.ghostHover },
    children: [
      parts.Text({
        color: ink, wrap: 'truncate',
        ...(kind === 'primary' ? { weight: 'medium' } : {}),
        ...(inkOver ? { hover: { color: inkOver } } : {}),
        children: [text],
      }),
      pressLayer(parts, { ...rest, key: id }, text.length),
    ],
  })
}

/**
 * A link under a pin: the app's own Link takes its ink from the app's mode (dark blue in a light app), which a panel
 * pinned to the other mode cannot show. The word in that mode's link ink instead, with a press that opens the address.
 */
export function paintedLink(parts: Parts, P: Palette, key: string, label: string, onPress: () => unknown): unknown {
  return parts.Box({
    key: `${key}~paint`, position: 'relative', flexShrink: 0, flexDirection: 'row', alignItems: 'center',
    children: [
      parts.Text({ color: P.link, wrap: 'truncate', hover: { underline: true }, children: [label] }),
      pressLayer(parts, { key, onPress }, label.length),
    ],
  })
}

/**
 * A patch behind one of the app's own text fields under a pin. The field cannot be coloured: its text is the app's
 * mode's (near white in a dark app), which a panel pinned to the other mode cannot show. So behind it lies a round
 * patch in the app's own ground, drawn only while the app is in the other mode than the pin (the image asks the app's
 * scheme itself, as a plugin cannot): a dark field in a light panel, a light one in a dark panel, readable either way.
 * In the pinned mode itself nothing is drawn and the field looks as it does under Automatic. `inset` is how far, in
 * cells, the patch ends before the field's right edge (a submit hint behind the field that a window cuts off).
 */
export function fieldBacking(parts: Parts, mode: Pin, key: string, field: unknown, inset = 0): unknown {
  if (!parts.Svg) return field
  const other: Pin = mode === 'dark' ? 'light' : 'dark'
  const piece = (width: number, shape: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 20" width="${width}" height="20"><style>.g{fill:none}@media (prefers-color-scheme: ${other}){.g{fill:${PALETTES[other].ground}}}</style>${shape}</svg>`
  const end = (flip: boolean) => parts.Svg!({
    source: piece(8, `<path class="g" ${flip ? 'transform="translate(8 0) scale(-1 1)" ' : ''}d="M8 0A8 8 0 0 0 0 8V12A8 8 0 0 0 8 20Z"/>`), alt: '', width: 8, height: 20,
  })
  return parts.Box({
    key: `${key}~backed`, position: 'relative', flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center',
    children: [
      parts.Box({
        position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, marginRight: inset, flexDirection: 'row', alignItems: 'center',
        children: [
          end(false),
          parts.Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, height: 1, overflow: 'hidden', flexDirection: 'row',
            children: [parts.Box({ flexShrink: 0, children: [parts.Svg({ source: piece(1600, '<rect class="g" width="1600" height="20"/>'), alt: '', width: 1600, height: 20 })] })] }),
          end(true),
        ],
      }),
      // Positioned, and after the patch: so the field is drawn over it and takes the clicks. The app positions a box
      // only when it anchors an absolute child, hence the empty one.
      parts.Box({ position: 'relative', flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center',
        children: [parts.Box({ position: 'absolute', top: 0, left: 0 }), field] }),
    ],
  })
}

const chevron = (ink: string) =>
  `<svg data-raw="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" width="14" height="14"><path data-keep="1" d="M3.5 5.5L7 9L10.5 5.5" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const check = (ink: string) =>
  `<svg data-raw="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="12" height="12"><path data-keep="1" d="M2.5 6.4L5 8.8L9.5 3.6" fill="none" stroke="${ink}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

export type Choice = { key: string; label?: string; value: string; options: readonly { value: string; label: string }[]; onSelect: (value: string) => unknown }

/** The closed dropdown: the picked value and a chevron in a field, like the app's own. A press opens or closes its list. */
export function paintedTrigger(parts: Parts, P: Palette, c: Choice, open: boolean, onPress: () => unknown): unknown {
  const shown = c.options.find(o => o.value === c.value)?.label ?? c.value
  const field = parts.Box({
    key: `${c.key}~paint`, position: 'relative', flexShrink: 0, flexDirection: 'row', alignItems: 'center', columnGap: FIELD_GAP,
    // Above the prompt the app's own dropdown is one text line high (20 px) with 8 px beside the value.
    borderStyle: 'single', height: 1, borderColor: open ? P.fieldRingHover : P.fieldRing, backgroundColor: P.field,
    paddingX: FIELD_X, paddingY: 0,
    hover: { borderColor: P.fieldRingHover },
    children: [
      parts.Text({ color: P.text, wrap: 'truncate', children: [shown] }),
      parts.Svg ? parts.Svg({ source: chevron(P.dim), alt: '', width: 14, height: 14 }) : parts.Text({ color: P.dim, children: ['▾'] }),
      pressLayer(parts, { key: c.key, onPress }, shown.length + 3),
    ],
  })
  if (!c.label) return field
  return parts.Box({
    key: `${c.key}~field`, flexDirection: 'row', alignItems: 'center', columnGap: 1, flexShrink: 0,
    children: [parts.Text({ color: P.dim, children: [c.label] }), field],
  })
}

/**
 * The open dropdown's list: one rounded surface, a row per option, the picked one with a check mark. A list longer
 * than `tall` rows runs in columns side by side, so it stays low enough for the panel that holds it (it cannot float
 * over the app as the app's own does).
 */
export function paintedOptions(parts: Parts, P: Palette, c: Choice, onPick: (value: string) => unknown, tall = 5): unknown {
  const option = (o: Choice['options'][number]) => parts.Box({
    key: `${c.key}-${o.value}~paint`, position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: 1.5,
    borderStyle: 'single', borderColor: CLEAR, paddingX: PAD_X, paddingY: PAD_Y,
    hover: { backgroundColor: P.ghostHover },
    children: [
      parts.Text({ color: P.text, wrap: 'truncate', children: [o.label] }),
      parts.Svg
        ? parts.Svg({ source: check(o.value === c.value ? P.text : CLEAR), alt: o.value === c.value ? 'picked' : '', width: 12, height: 12 })
        : parts.Text({ color: o.value === c.value ? P.text : CLEAR, children: ['✓'] }),
      pressLayer(parts, { key: `${c.key}-${o.value}`, onPress: () => onPick(o.value) }, o.label.length + 3),
    ],
  })
  const columns: Choice['options'][number][][] = []
  const perColumn = c.options.length > tall ? Math.ceil(c.options.length / Math.ceil(c.options.length / tall)) : c.options.length
  for (let n = 0; n < c.options.length; n += perColumn) columns.push(c.options.slice(n, n + perColumn))
  return parts.Box({
    key: `${c.key}~list`, flexDirection: 'row', flexShrink: 0, columnGap: 0.36,
    borderStyle: 'round', borderColor: P.listRing, backgroundColor: P.list, paddingX: 0.36, paddingY: 0.3,
    children: columns.map((column, n) => parts.Box({ key: `${c.key}~column-${n}`, flexDirection: 'column', flexShrink: 0, children: column.map(option) })),
  })
}

// The slot above the prompt, as the app draws it: the band's own box plus 8 px left and right and 10 px above and
// below, with corners of 10 px. The app cuts everything a plugin draws to that rectangle (square), so a layer of exactly
// that size is the largest a panel can paint. It must not reach below it either: the app scrolls what does not fit, so a
// layer one pixel too tall makes the whole band scroll under the wheel. Offsets take whole cells only (a cell is
// 8.39 px wide, a line 20 px tall), so the layer starts on the band's own lines and a margin of one row (10 px) takes
// it up and down; left and right, a cell out and a padding of the 0.39 px too many back in.
const SLOT = { position: 'absolute', top: 0, bottom: 0, left: -1, right: -1, marginY: -1, paddingX: 0.046, flexDirection: 'column' } as const

/** The painted ground of a fixed mode: the slot filled in the mode's colour, with rounded corners. */
function slotGround(parts: Parts, P: Palette): unknown {
  return parts.Box({
    ...SLOT,
    children: [parts.Box({ flexGrow: 1, borderStyle: 'round', borderColor: P.ground, backgroundColor: P.ground, paddingX: 0, paddingY: 0 })],
  })
}

/**
 * A panel's own tint (an alert band's colour) in the slot's shape: as the band's own ground it was a square patch
 * inside the round slot. `parts` is the panel's own table, so the colour is turned for light and dark like the rest.
 */
export function slotTint(parts: Parts, key: string, color: string): unknown {
  return parts.Box({
    ...SLOT, key,
    children: [parts.Box({ flexGrow: 1, borderStyle: 'round', borderColor: CLEAR, backgroundColor: color, paddingX: 0, paddingY: 0 })],
  })
}

/**
 * Art behind a panel, in the slot's own shape: it reaches the slot's edges and follows its round corners, where a layer
 * cut to the band itself was a rectangle with hard ends inside the round slot. A layer for the shell (slotShell's
 * `under`), not for the panel, whose own box cuts its children to the band. The round box is one pixel larger than the
 * slot each way and has a see-through border of one pixel, so what it cuts to is the slot exactly; the layer around it
 * cuts that pixel off again, so nothing reaches past the slot. `from` is the side the art is fixed to; it starts a
 * line above the band, as it did when the band cut it, or, `at` the middle, is centred on the slot's height.
 */
export function slotArt(parts: Parts, key: string, art: unknown, from: 'left' | 'right' = 'right', at: 'top' | 'middle' = 'top'): unknown {
  return parts.Box({
    ...SLOT, key, overflow: 'hidden',
    children: [parts.Box({
      position: 'relative', flexGrow: 1, marginY: -0.1, marginX: -0.119, borderStyle: 'round', borderColor: CLEAR, paddingX: 0, paddingY: 0, overflow: 'hidden',
      children: [at === 'middle'
        ? parts.Box({ position: 'absolute', top: 0, bottom: 0, [from]: 0, flexDirection: 'column', justifyContent: 'center', children: [parts.Box({ flexShrink: 0, children: [art] })] })
        : parts.Box({ position: 'absolute', top: 0, [from]: 0, marginTop: -1, children: [art] })],
    })],
  })
}

// The wash behind every plain panel (the bar, Compact, Handoff, Settings, the cards): the logo's orange fading in from
// the middle to the right edge, under a faint grid of dots, each row set half a step off the one above. One drawing for
// all of them, so they read as one family; alert bands and the setup guide keep their own art.
// Still on purpose: the bar is always there. Drawn for the app's mode by the drawing itself, as the lift is; a fixed
// mode names its mode outright. Fixed to the slot's right edge, so the fade starts at the same distance from it in a
// wide and a narrow pane, and tall enough for the tallest panel (the slot cuts the rest). The app fits an image into
// the room it has, so the drawing is told to keep its size and its right edge (slice) instead of shrinking into it.
const WASH = {
  light: { glow: 0.12, dot: '#6b3f2c', dots: 0.13 },
  dark: { glow: 0.14, dot: '#ffffff', dots: 0.065 },
} as const
const WASH_W = 1400
const WASH_H = 900
const WASH_TONE = '#D97757'
const washes = new Map<string, string>()
function washSvg(mode: Pin | null): string {
  const key = mode ?? 'app'
  const hit = washes.get(key)
  if (hit) return hit
  const rules = (m: Pin) => `.g{opacity:${WASH[m].glow}}.d{fill:${WASH[m].dot};fill-opacity:${WASH[m].dots}}`
  const style = `<style>${mode ? rules(mode) : `${rules('light')}@media (prefers-color-scheme: dark){${rules('dark')}}`}</style>`
  const W = WASH_W, H = WASH_H
  const svg = `<svg data-raw="1" data-app-scheme="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMaxYMin slice">${style}<defs>`
    + `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${W - 540}" x2="${W}"><stop offset="0" stop-color="${WASH_TONE}" stop-opacity="0"/><stop offset=".55" stop-color="${WASH_TONE}" stop-opacity=".5"/><stop offset="1" stop-color="${WASH_TONE}" stop-opacity="1"/></linearGradient>`
    + `<linearGradient id="f" gradientUnits="userSpaceOnUse" x1="${W - 620}" x2="${W - 260}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>`
    + `<mask id="m"><rect width="${W}" height="${H}" fill="url(#f)"/></mask>`
    + `<pattern id="p" width="14" height="14" patternUnits="userSpaceOnUse"><circle class="d" cx="3.5" cy="3.5" r=".8"/><circle class="d" cx="10.5" cy="10.5" r=".8"/></pattern>`
    + `</defs><rect class="g" width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#p)" mask="url(#m)"/></svg>`
  washes.set(key, svg)
  return svg
}
/** The wash as a layer for the shell, in the slot's round shape. `mode` null lets it follow the app's light or dark. */
export function slotWash(parts: Parts, mode: Pin | null): unknown {
  const Svg = parts.Svg
  if (!Svg) return null
  return slotArt(parts, 'slot-wash', Svg({ source: washSvg(mode), alt: 'background', width: WASH_W, height: WASH_H }))
}

/**
 * A panel's top bar in the slot's shape: `lines` tall from the slot's top edge, its upper corners the slot's round
 * ones, its lower edge straight (a round box taller than the window that shows it), with `rule` laid along that edge.
 */
export function slotHead(parts: Parts, key: string, lines: number, ground: string, rule: unknown): unknown {
  return parts.Box({
    key, position: 'absolute', top: 0, left: SLOT.left, right: SLOT.right, marginTop: -1, height: lines, paddingX: SLOT.paddingX, flexDirection: 'column', overflow: 'hidden',
    children: [
      parts.Box({ flexShrink: 0, height: lines + 2, borderStyle: 'round', borderColor: CLEAR, backgroundColor: ground, paddingX: 0, paddingY: 0 }),
      parts.Box({ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, alignItems: 'flex-end', children: [rule] }),
    ],
  })
}

// The lift: no frame and no drop shadow (the app cuts a plugin's drawing at the slot, so nothing can fall outside it).
// What gives the panel a little height is a lip inside its bottom edge, 1 px of shade with 1 px of half-shade above it,
// following the rounded corners, and a hairline of light along the top. Drawn for the app's mode by the drawing itself
// (an image can read the app's light or dark, a plugin cannot); a fixed mode names its mode outright.
const LIFT = {
  light: { shade: '#0b0b0b', strong: 0.13, soft: 0.05, shine: '#ffffff', glint: 0.75 },
  dark: { shade: '#000000', strong: 0.34, soft: 0.14, shine: '#ffffff', glint: 0.07 },
} as const
function liftStyle(mode: Pin | null): string {
  const rules = (m: Pin) => {
    const l = LIFT[m]
    return `.a{fill:${l.shade};fill-opacity:${l.strong}}.b{fill:${l.shade};fill-opacity:${l.soft}}.c{fill:${l.shine};fill-opacity:${l.glint}}`
  }
  return `<style>${mode ? rules(mode) : `${rules('light')}@media (prefers-color-scheme: dark){${rules('dark')}}`}</style>`
}
function liftCorner(mode: Pin | null, top: boolean, right: boolean): string {
  // A crescent between the corner's arc (radius 10) and the same arc one pixel further in.
  const body = top
    ? '<path class="c" d="M0 10A10 10 0 0 1 10 0V1A10 10 0 0 0 0 11Z"/>'
    : '<path class="a" d="M0 0A10 10 0 0 0 10 10V9A10 10 0 0 1 0 -1Z"/><path class="b" d="M0 -1A10 10 0 0 0 10 9V8A10 10 0 0 1 0 -2Z"/>'
  return `<svg data-raw="1" data-app-scheme="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">${liftStyle(mode)}<g${right ? ' transform="translate(10 0) scale(-1 1)"' : ''}>${body}</g></svg>`
}
function liftStrip(mode: Pin | null, top: boolean): string {
  const body = top ? '<rect class="c" width="4000" height="1"/>' : '<rect class="b" width="4000" height="1"/><rect class="a" y="1" width="4000" height="1"/>'
  const h = top ? 1 : 2
  return `<svg data-raw="1" data-app-scheme="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4000 ${h}" width="4000" height="${h}" preserveAspectRatio="none">${liftStyle(mode)}${body}</svg>`
}

/** The lift of a panel, in the slot's own shape. `mode` null lets the drawing follow the app's light or dark. */
function slotLift(parts: Parts, mode: Pin | null): unknown {
  const Svg = parts.Svg
  if (!Svg) return null
  const edge = (top: boolean) => parts.Box({
    flexDirection: 'row', alignItems: top ? 'flex-start' : 'flex-end',
    children: [
      Svg({ source: liftCorner(mode, top, false), alt: 'edge', width: 10, height: 10 }),
      parts.Box({ flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', children: [Svg({ source: liftStrip(mode, top), alt: 'edge', width: 4000, height: top ? 1 : 2 })] }),
      Svg({ source: liftCorner(mode, top, true), alt: 'edge', width: 10, height: 10 }),
    ],
  })
  return parts.Box({ ...SLOT, justifyContent: 'space-between', children: [edge(true), edge(false)] })
}

/**
 * A panel in its shell: the ground (a fixed mode only), what the panel hands over to lie under it in the slot's shape
 * (`under`: its art, its top bar) and the lift behind it, the panel above them. The panel sits in a box of its own that
 * is laid over the layers, or they would take its clicks.
 */
export function slotShell(parts: Parts, P: Palette | null, mode: Pin | null, panel: unknown, under: readonly unknown[] = []): unknown {
  return parts.Box({
    key: 'slot-shell', position: 'relative', flexDirection: 'column',
    children: [
      ...(P ? [slotGround(parts, P)] : []),
      ...under,
      slotLift(parts, mode),
      parts.Box({ key: 'slot-panel', position: 'relative', flexDirection: 'column', children: [parts.Box({ position: 'absolute', top: 0, left: 0 }), panel] }),
    ],
  })
}
