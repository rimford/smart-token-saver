import type { Register } from 'claude-code'

// Measurement only. One process per turn: the effort to send comes from EFFORT_PROBE_EFFORT ("keep" sends the
// engine's own), each step's usage goes to the file named in EFFORT_PROBE_OUT.
const lines: string[] = []
export const register: Register = on => {
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const want = (await $.env.get('EFFORT_PROBE_EFFORT')) ?? 'keep'
    const out = await $.env.get('EFFORT_PROBE_OUT')
    const sent = want === 'keep' || typeof e.effort !== 'string' ? e.effort : (want as typeof e.effort)
    const r = yield* next(sent === e.effort ? e : { ...e, effort: sent })
    const u = r.usage
    lines.push(
      JSON.stringify({
        step: e.index,
        model: e.model,
        messages: e.messageCount,
        engineEffort: e.effort ?? null,
        sent: sent ?? null,
        input: u?.input_tokens ?? null,
        read: u?.cache_read_input_tokens ?? null,
        write: u?.cache_creation_input_tokens ?? null,
        out: u?.output_tokens ?? null,
      }),
    )
    if (out) await $.fs.write(out, lines.join('\n') + '\n').catch(() => undefined)
    return r
  })
}
