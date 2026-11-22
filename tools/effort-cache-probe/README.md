# effort-cache-probe

Answers one question per model: does a change of effort between two messages keep the prompt cache? Smart changes
the effort from message to message, so it may only run on models where the answer is yes (`cacheSafe` in
`hooks/register.tsx`). Run this before a new model joins that list.

```
python3 -I tools/effort-cache-probe/probe.py claude-fable-5-2 claude-opus-5-5
```

It exits 0 when every named model kept its cache and prints one line per request.

## How it measures

- One short chat per model, six turns, each turn its own `claude -p` (the chat is resumed in between). The first
  message carries about 25k tokens of text, so the chat is as large a part of the cache as the system prompt and tools.
- `mod/` is a hooks module with one `turn.step` hook. It sends each request at the effort the turn names (high, high,
  low, xhigh, low, high), the way Smart Token Saver does, and writes down `cache_read_input_tokens` and
  `cache_creation_input_tokens` of every response.
- Turns 3 to 6 each follow an effort change. Turns 3 and 4 need some thought, turns 5 and 6 call a tool (two requests
  each). A model passes when every request of those turns reads at least 90 % of its input from the cache.
- The chats run with a clean environment and `--setting-sources project`: no user plugins, no MCP servers, nothing
  else that touches the effort. Turn 2 writes about 4k tokens again on every model at an unchanged effort; that is the
  resume, not the effort, and it is why the verdict starts at turn 3.

## Results, 21.11.2026 (Claude Code 2.1.330, Claude subscription login)

Share of each request read from the cache after an effort change, lowest value of the run:

| Model | high, high, low, low, high, medium, medium (plain replies) | with thought and tool turns | thinking tokens at low / xhigh |
| --- | --- | --- | --- |
| Haiku 5.5 | 99.9 % | 99.3 % | 277 / 297 |
| Sonnet 5.5 | 100.0 % | 99.5 % | 0 / 210 |
| Opus 5.5 | 100.0 % | 99.5 % | 97 / 192 |
| Fable 5.2 | 100.0 % | 99.6 % | 145 / 192 |

What was written after a change was the new turn only (20 to 360 tokens of a chat of about 52k). The thinking tokens
show that the effort the mod sends takes hold; they are one question each, so read them as a sign, not as a measure.
The whole measurement cost about $1.60 at API prices.

Why it holds: on these models Claude Code states the effort in a message of its own after the cached chat, so
nothing before it changes. Where a model or provider takes effort only as a setting of the whole request (Fable 5.1,
Opus 5 and older in upstream's measurement, where 56 to 100 % of the cache was rewritten), the same change rewrites
the chat. The probe was run on Anthropic's own API through a subscription login only; other providers are not measured.
