// The Smart Token Saver logo: a token (rounded hexagon) holding three bars that shorten downwards (fewer tokens),
// with a small spark at its corner (smart). No text, so it reads at any size.
// Square, transparent behind; drawn in two colours: `main` for the token and the upper bars, `accent` for the last
// bar and the spark.
const spark = (cx: number, cy: number, r: number): string =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`

/**
 * The logo small, in one colour, for the bar's left edge (18 px): a touch heavier than the big one so it holds at that
 * size. `thinking` sets it moving while Smart decides: the token hops, the bars breathe one after the other and the spark
 * twinkles. Plain CSS in the image, one constant source per state (a changing source makes the app redraw the frame).
 */
/** One radar pulse of the thinking mark, in ms: it always plays to its end (see pulseShows in register.tsx). */
export const MARK_PULSE_MS = 1600

export function markLogoSvg(color: string, state: 'on' | 'off' | 'thinking'): string {
  const moving = state === 'thinking'
  const s = MARK_PULSE_MS / 1000
  // Thinking: a thin ring leaves the mark and fades, like a radar sweep, and the mark gives one soft beat with it.
  const style = moving
    ? `<style>`
      + `.t{transform-box:view-box;transform-origin:24px 25px;animation:bt ${s}s ease-in-out infinite}`
      + `.rr{transform-box:view-box;transform-origin:24px 25px;opacity:0;animation:rd ${s}s cubic-bezier(.2,.6,.4,1) infinite}`
      + `@keyframes bt{0%,100%{transform:scale(1)}16%{transform:scale(.93)}38%{transform:scale(1)}}`
      + `@keyframes rd{0%{transform:scale(.72);opacity:.42}12%{opacity:.42}100%{transform:scale(1.36);opacity:0}}`
      + `</style>`
    : ''
  const ring = moving ? `<circle class="rr" cx="24" cy="25" r="17" fill="none" stroke="${color}" stroke-width="1.6"/>` : ''
  return `<svg data-raw="1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${style}${ring}`
    + `<g class="t"${state === 'off' ? ' opacity=".4"' : ''}>`
    + `<path d="M24 7.5L39 16.25V33.75L24 42.5L9 33.75V16.25Z" fill="none" stroke="${color}" stroke-width="3.4" stroke-linejoin="round"/>`
    + `<rect x="16" y="18.2" width="16" height="3.4" rx="1.7" fill="${color}"/>`
    + `<rect x="18.5" y="23.4" width="11" height="3.4" rx="1.7" fill="${color}"/>`
    + `<rect x="21" y="28.6" width="6" height="3.4" rx="1.7" fill="${color}"/>`
    + `<path d="${spark(40.5, 7.5, 5.75)}" fill="${color}"/>`
    + `</g></svg>`
}
