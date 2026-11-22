# The compaction window

Opus 5.5 and Fable 5.2 can hold one million tokens, and by default Claude Code lets a chat grow to almost that before
it compacts. Every message rereads the whole chat. A chat at 800k pays for 800k tokens on every message, even while you
only ask a short follow-up. A limit on the chat's size (the compaction window) is the plugin's biggest saving, bigger
than Smart effort or the cold-chat warning.

**Window and compaction point.** Claude Code compacts a chat about 33k tokens below its window. With the default of
300k, a chat compacts at about 267k.

## What a limit saves

Measured on one heavy user's real Claude Code logs. In September 2026 the chats ran without a limit (1M). From
1 October they ran with 400k. Same person, same kind of work: long development sessions, many subagents.

| Main chat | September, no limit | October to November, 400k |
| --- | --- | --- |
| Chat size per message, median | 320k | 179k |
| Chat size, largest 10 % | 760k and more | 319k and more |
| Messages above 400k | 41 % of messages, 65 % of the cost | none |
| Message after a long pause (cold cache) | $4.58 each, 24 % of all cost | $1.25 each, 4 % of all cost |

The two periods differ in more than the limit (models, projects, how much was done), so every chat of October and
November was also replayed message by message under different limits. Same messages, same pauses, same manual compacts;
only the limit changes. Costs are at list price.

| Window | Cost vs. no limit (1M) | Cost vs. 400k | Compactions per week, main chats |
| --- | --- | --- | --- |
| 200k | −32 % | −13 % | 131 |
| 250k | −32 % | −12 % | 62 |
| **300k (recommended)** | −30 % | −9 % | 40 |
| 350k | −26 % | −5 % | 29 |
| 400k | −23 % | ±0 | 20 |
| 500k | −17 % | +7 % | 14 |
| 600k | −12 % | +14 % | 9 |
| No limit (1M) | ±0 | +29 % | 4 |

Replay of 7 weeks (1 October to 19 November 2026), main chats and subagents. The same replay on September came out at
−37 % for 300k against no limit. A second, independent replay (20 November) gave −9 % for 300k against 400k as well.

## What to expect for yourself

The saving comes only from chats that would grow past the limit. A chat that never gets to the compaction point of a
300k window costs exactly the same with or without it. So it depends on how you work:

| Chats that | Share of chats | Share of the cost without a limit | 300k saves |
| --- | --- | --- | --- |
| stay under the compaction point | 94 % | 31 % | nothing |
| grow up to 600k | 5 % | 26 % | about 31 % |
| grow past 600k | 2 % | 43 % | about 53 % |
| all together | 100 % | 100 % | about 31 % |

2,009 chats and subagent runs, same logs. Few chats get long, but they carry most of the cost. If you mostly ask short
questions in fresh chats, expect little. If you work in long sessions (debugging, refactoring, a plan you build over a
day), expect those sessions to cost about half. Across everything, about a third less than without a limit.

## Why 300k and not less

250k and 200k are a little cheaper still. 300k is recommended anyway:

- **The curve gets flat.** 400k to 300k saves 9 %. 300k to 250k saves only 3 % more, and 250k to 200k almost nothing.
- **Compactions double with every step.** 20 a week at 400k, 40 at 300k, 62 at 250k, 131 at 200k. Each one takes about
  a minute and a half, and each one drops detail from the chat.
- **Small windows break first.** After a compaction Claude often rereads files it had already seen. If that costs 20k
  tokens per compaction, 200k ends up more expensive than 400k, while 300k still saves 6 to 8 %. Under every assumption
  tried, 300k stayed between 6 % and 11 % cheaper than 400k.

**What is not known yet.** This is one person's work, priced at list price; the replay comes out about 5 % above the
real bills, so trust the differences more than the dollar amounts. Whether more compactions hurt the quality of answers
can only be guessed from how often Claude rereads files afterwards. Your mix of work will move the numbers, which is
why the window is a setting. A second measurement with 300k against 400k on real usage is planned.

## Changing it

- Settings → *Context size* → *New chats*, or `/smarttokensaver window 350000` (also `350k`, `1M`) for any value from
  100k to 1M. A default above what the current model holds is saved, and the answer says it changes nothing in this chat;
  `/smarttokensaver window this <size>` refuses a size the model cannot hold.
- *Claude Code default* leaves the limit to Claude Code.
- The Context size card shows the limit of the current chat and, if different, the one new chats get
  (*New & current: 300k*, or *New: 300k / Current: 400k*).
- If your organization sets a limit, it wins, and the card says so. A limit you saved with `/autocompact` for one
  model also wins for that model, and the card says "set with /autocompact".

Normally the plugin sets the window for its chats without writing to `~/.claude/settings.json`: it answers Claude
Code's settings question for the session. A limit applied this way ends when you uninstall the plugin.

## Context size for one chat

Sometimes a chat is worth keeping whole: a long debugging session, a big review, a plan you are halfway through. You can
give that one chat a bigger limit while your default stays as it is.

- Settings → *Context size* → *This chat only*. Pick any size from the list (only what your model can hold, smaller
  ones too), or *Your default* to go back.
- The "getting swamped" band offers the same choice as *Context size*.
- `/smarttokensaver window this 500000`, and `/smarttokensaver window this reset` to undo it.

The card says *asked* until Claude Code confirms the new size, then *500k in use for this chat*. If Claude Code doesn't
take it, it says *not applied*. The bar always shows the window Claude Code really uses, never one that was only asked
for. New chats start on your default again.

A bigger window isn't free: every message reads the whole chat, so a bigger chat costs more per message, and a cold
restart costs more too.

## Where the plugin cannot set it

Some organizations don't let plugins change Claude Code settings through hooks. The plugin then uses Claude Code's own
two ways.

**New chats: the settings file.** *New chats* saves the size in `~/.claude/settings.json` (`autoCompactWindow`, for
every model) and tells you so. The setup does the same at *Finish*, or at **Apply** on its window step: where the plugin
cannot set the window, a changed size needs Apply (next to the sizes) before Next. A size new chats already get needs no
Apply.

- Before each change the file as it was is copied beside it: `settings.json.smarttokensaver.bak` is the newest copy,
  `.bak.1` and `.bak.2` the two before it. No copy is made when the file equals the newest copy.
- Nothing is written when the file changed between reading and saving (another chat, Claude Code itself); a toast says
  to try again.
- That value stays after an uninstall until you remove `autoCompactWindow` from the file.

**This chat: `/autocompact`.** *This chat only* shows `/autocompact <size>` on a line under the picker, with *Paste
into chat* and *Copy*. Nothing goes into the chat by itself: you send the command. Claude Code keeps that size in this
chat, and also writes it per model into the settings file. The plugin takes that per-model value out again, so new
chats stay on your default. It only removes a value whose command it handed out itself: a per-model window you set with
`/autocompact` on your own stays in your file, also where it equals the default. Should a Claude Code version not keep
the size in the chat, the plugin puts the value back, and the next chat you open asks: *Another window from another
chat is still set (500k). Back to 300k?*

After the setup's Apply, a page asks whether this chat should switch too, with `/autocompact`, *Paste into chat* and
*Copy*; that one is optional.

**When the settings file is closed too.** Many Team and Enterprise organizations also keep `~/.claude/settings.json`
closed to plugins. The plugin notices the refusal once, says so in the card's top line and stops trying for a week.
*New chats* then gets **Set in a new chat** / *Paste into new chat*: a new Code chat opens (desktop app, macOS;
elsewhere the request is copied) with a request to write `autoCompactWindow` into the file. Send it there and allow the
edit; the chat you're in stays as it is. The new chat opens without a folder, so the app does not ask to trust a
workspace. In the setup an orange line says the step is yours, with *Paste into new chat* and *Copy*, and Next waits
until you used one; skip it and new chats keep their size.

A real per-chat window, and a default without a file, need your Claude admins to allow the plugin's hooks.

A limit set with `/autocompact` stays until you run `/autocompact auto`.

## What follows the window

Everything that depends on the limit adjusts itself: the ring, when the cold band shows, the "getting swamped" band,
and when Haiku 5.5 starts checking whether a handoff would help.

### When the alert shows

The "getting swamped" band sits closer to compaction in a small window and further below it in a big one, because every
message rereads the whole chat and a handoff saves more the more room is left:

| Window | Compacts at | Warning from |
| --- | --- | --- |
| 200k | 167k | 147k (88 %) |
| 300k | 267k | 227k (85 %) |
| 400k | 367k | 267k (73 %) |
| 500k | 467k | 307k (66 %) |
| 1M | 967k | 507k (52 %) |

Under 200k compaction comes so soon that no warning shows, and neither do the cold band or the handoff check when they
would leave too little room before it. Settings → Handoff & alerts → *Context alert at* is *Auto* by default; a fixed
percent (of the compaction point) can be picked instead.
