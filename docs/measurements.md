# Measurements

## What's proven

- **The compaction window saves money.** The replay in [The compaction window](compaction-window.md) holds up for
  heavy use: about 30 % less than without a limit, 9 % less than 400k.
- **Compacting or handing off a cold chat saves money.** That follows from the prices
  ([the cost table](how-it-works.md#what-each-costs)).
- **Whether Smart effort saves money is open.** The first measurements are too few and point both ways.

## An effort change keeps the prompt cache

Smart only runs on models where the effort can change between messages without losing the prompt cache. Measured on
21 November 2026 with Claude Code 2.1.330 on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2: after an effort change, 99
to 100 % of the chat is still read from the cache, also across tool calls. On older models (Fable 5.1, Opus 5 and
earlier) a change rereads most of the chat at full price, so Smart pauses there.

`tools/effort-cache-probe` repeats the measurement for a new model.

## Stats

`/smarttokensaver stats` sums up this chat: how many messages ran at each effort, the average weighted tokens per
level, and the shares of cache reads, cache writes and output.

Tokens are weighted by price, relative to one input token:

| Kind | Weight |
| --- | --- |
| Input | 1 |
| Cache read | 0.05 |
| Cache write, 5-minute | 1.25 |
| Cache write, 1-hour | 2 |
| Output | 5 |

Claude Code writes its cache for one hour, so a write Claude Code does not split by lifetime counts as a 1-hour write.
The weights are the price ratios of Opus 5.5 and Sonnet 5.5. Fable 5.2 reads its cache cheaper (2.5 % of input),
models before 5.5 dearer (10 %), so there the cache share is a little off. A message the judge gave no verdict for is
counted at the effort it ran on. The figures are a comparison between levels in one chat, not a bill.

## The judge benchmark

`bench/` holds the cases and scripts the judge is checked against (`bench/judge-cases.json`, `bench/RESULTS.md`).
`/smarttokensaver bench` runs the judge cases from inside a chat and saves a report.

## Measurement for maintainers

In a checkout with the opt-in file, *Measurement* logs each judged message and compaction locally and runs a share of
messages at Claude Code's own effort (the control arm), so Smart's saving can be measured. `tools/ab-report.mjs` reads
the log. See [README, For maintainers](../README.md#for-maintainers).
