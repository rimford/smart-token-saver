# How it works

## Why it exists

Every message you send in Claude Code sends the whole chat again. While the prompt cache is warm, that costs little:
Opus 5.5 reads the history at 5 % of the normal price. After a pause the cache goes cold (one hour on a subscription,
five minutes on API credits), and the next message pays full price for everything.

So long chats and pauses are where the money goes. Smart Token Saver helps in three ways:

- It picks the effort per message, so a quick question doesn't run as deep as a refactor.
- It shows how full the chat is and how long the cache stays warm.
- It compacts or hands off in one click, and picks the cheaper way when the chat is cold.

## Install and setup

```
/plugin install smarttokensaver --marketplace rimford/smart-token-saver
```

On an older Claude Code, add the marketplace first with `/plugin marketplace add rimford/smart-token-saver`, then
`/plugin install smarttokensaver@smart-token-saver`. In the desktop app, *+ → Plugins → Add marketplace* takes
`rimford/smart-token-saver` as well. It needs a current Claude Code (tested with 2.1.330). If no bar shows up in a new
chat, `/plugin` says why the plugin did not load; most often Claude Code is too old.

Plugins load when a chat starts, so the chat you installed from doesn't show the bar yet. In a new chat a short setup
opens above the prompt:

1. A welcome page says what the plugin does.
2. **Effort**: how much Smart should lean cheaper or smarter. Five stops: Cheapest, Cheaper, Balanced (the middle,
   recommended), Smarter, Smartest.
3. **Compaction window**: 300k is recommended; *Individual* takes your own size. The sizes also list the one this chat
   runs on (say *350k (this chat)*).
4. **Panels**: follow the app, or always dark or always light.

The answers are saved on *Finish*; closing the setup early keeps them as a draft, and the next setup starts from it.
On a model whose window is 300k or less the compaction step is skipped: there is nothing to set. A green *Setup complete* then sums up what was set: effort, the compaction size for
new chats and for this chat, and the panels. If the setup was open in several chats, finishing it in one closes it in
the others. `/smarttokensaver setup` runs it again at any time.

The setup also looks for other installs. If effortless (the public plugin Smart Token Saver is based on) is installed,
it offers to remove it, since both would run at once. If Smart Token Saver is installed twice (from two marketplaces),
Claude Code runs only one of them, and the setup offers to remove the other.

Where the plugin cannot set the window itself, the window step has extra buttons; see
[The compaction window](compaction-window.md#where-the-plugin-cannot-set-it).

## The bar

```
High · Opus 5.5    ◔ 123k / 300k (41%)    cache 47:12    Reduce context    Smart | Default    ⚙
```

| Part | Meaning |
| --- | --- |
| `High · Opus 5.5` | The effort for this message and the model, named with its version from the model id. Hover it to see why Smart picked it. |
| `◔ 123k / 300k (41%)` | How full the chat is in tokens and percent, and the window it compacts at, both as Claude Code reports them (the same figures as `/context`). It says *default* when Claude Code's own window is in force. Each chat shows its own window, and the figure is read again after every reply, so an `/autocompact` you just ran shows up at once. |
| `cache 47:12` | Time until the cache goes cold. Yellow from 20 minutes, red from 5, then ❄ Cold. |
| `→\|← Reduce context` / `Handoff` | Usually *Reduce context*: it opens the compact bar. It changes to Handoff when Haiku 5.5 thinks a fresh chat would work better, for example because the task is done and you start something new; Compact then sits beside it. |
| `Smart` / `Default` | The switch. *Smart* picks the effort for each message, *Default* keeps the effort the chat has in the app. With Default, the word on the left says what the chat runs on, as the app's footer does, for example *Opus 5.5 · Medium*. |
| `⚙` | Opens Settings (pressed again, closes them). Before the setup is done, the same place offers the setup. |
| Orange mark | The plugin's logo. It pulses softly while Smart decides the effort for your message. |

Claude Code compacts about 33k tokens below the window: a 300k window compacts at about 267k. The bar's ring counts
against the window; the "getting swamped" band names both (*308k / 400k (77%) · compacts at 367k*).

When you resume a long chat, Claude Code can give that chat a bigger window than it reports. Once the chat grows past
the reported point without compacting, the plugin uses the bigger window for the ring, the alerts and the bar, so you
never see something like *335k / 300k*.

### Buttons only: the row under the prompt

With Settings → Customize → *Show* set to *Buttons only*, the bar goes away and a small row sits under the prompt, left
of Claude Code's own model and effort:

| Part | Meaning |
| --- | --- |
| ☰ | Brings the bar back (the same as Customize → Show → *Bar*). |
| ⏻ | Switches Smart effort on and off (`/smarttokensaver auto`). |
| →\|← | Reduce: opens the compact bar, with *Handoff instead* in it. Pressed again, it closes the bar. It shows *…* while a handoff is being written. |
| ⚙ | Settings, or *Setup* until the setup is done. |
| Low, Medium, High | The effort Smart picked for the last message, in purple (orange while Save mode is on). *Default* when Smart is off, *Paused* on models where an effort change would cost the cache. |
| cache 47:12 / ❄ Cold | The cache countdown, as in the bar. |

### How the panels are drawn

Panels follow the app (light or dark) or stay dark or light; a fixed mode colours the plugin's panels only, the app
keeps its own. All panels above the prompt are drawn one at a time: a second drawing waits for the first, and one
that has waited four seconds steps back and is asked for again a moment later. A change of the panels' look waits for
the drawing in progress. This keeps a panel from showing an older drawing than the one that takes your click.

## Smart effort

With Smart on, Haiku 5.5 reads a message before it goes out and picks Low, Medium or High. Not every message is
judged: a short follow-up ("go", "ok", "yes") keeps the effort of the step before unless Claude just asked a question,
a level you name is taken as said, and Claude Code's own slash commands are left alone. Until the first message of a
chat, no level shows. "What does this function
do?" gets Low. "Find why the totals are off across these three jobs" gets High. It takes about a second and uses your
own Claude login.

- **Range.** Smart stops at High by default. The two levels above it cost a lot more and rarely help in everyday work.
  Settings → Effort → *Limits* changes the range.
- **Lean.** *Balanced* lets Haiku 5.5 decide alone. *Cheaper* and *Smarter* only tip close calls; *Cheapest* and
  *Smartest* move more messages down or up.
- **A level you name wins.** "use max effort for this" is taken as said, without asking Haiku. A level that is only
  quoted or talked about ("what does `high` mean?", "the button says "max"") is not an order: Haiku decides as usual.
- **Your own change wins.** If you change the effort in the app, the switch goes to Default at your next message and
  tells you.
- **Subagents** run at the chat's effort unless Settings → Effort → *Subagents* is on; then Smart reads each
  subagent's task first and picks its effort, Medium or more.

**Which models.** Smart runs on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2. On these the effort can change from one
message to the next without losing the prompt cache (measured: 99 to 100 % of the chat still read from the cache after
a change, see [Measurements](measurements.md)). On older models (Fable 5.1, Opus 5 and earlier) a change makes the
next message reread most of the chat at full price, so Smart pauses there and the bar says *Smart paused*. A Haiku
before 5.5 takes no effort at all: no level is shown and Haiku is not asked.

If Haiku 5.5 cannot be reached, the message goes out at the chat's effort; nothing is held back.

## Cold chats

When the countdown runs out on a big chat, the bar turns light blue: **Chat went cold. Rereads 210k tokens at full
price.**, with Handoff and Compact (the bright one) on the right. It shows from about 110k to 150k tokens, depending on
your compaction window (30k below the compaction point, but never below 110k or above 150k). Smaller chats are cheap enough
to reread. The band stays away when too little room is left before compaction anyway.

You can carry on, compact or hand off; see [Compact, Handoff or carry on](#compact-handoff-or-carry-on).

## Running low and Save mode

Your Claude plan has two usage limits: one for the last 5 hours and one for the week. Once either passes 80 %, an orange
band shows above the prompt: **Running low · 80% of your weekly limit used · resets Tue 08:00**. It names the fuller of
the two limits and when it resets.

**Save mode** stretches what's left. While it's on, Smart effort picks at most Medium. A message Smart would have sent
at High goes at Medium; Low and Medium stay as they are.

- **Turn it on** with *Save mode* in the band (`s` in the terminal), with the switch in Settings → Effort (at any time,
  also before a limit runs low), or with `/smarttokensaver save`.
- **It ends by itself** when the limit resets, the 5-hour one or the weekly one, whichever the band showed. Turned on in
  Settings while no limit runs low, it lasts 5 hours. It holds in the chat where you turned it on.
- **It only touches Smart effort.** If you set the effort yourself, or the switch is on Default, your choice wins.
  Model, compaction window and everything else stay as they are, and no message is held back.
- **Skip for now** hides the band until the limit is 5 points fuller: 85 %, then 90 % and 95 %.
- **Skip this week** hides it until the weekly limit resets (*Skip until reset* for the 5-hour limit). The alert itself
  can be turned off in Settings → Handoff & alerts.

When to use it: a long task should still finish before the reset, or you want to keep room for later in the week. When
not to: you're in the middle of something hard where High matters more than the limit.

## Compact, Handoff or carry on

| Way | What happens |
| --- | --- |
| Carry on | Your next message rereads the whole chat once at full price. After that it's cheap again until the next pause. |
| Compact (same task) | Claude replaces the chat with a summary. You stay in the same chat and keep going. |
| Handoff (next task) | Claude writes a short note, clears the chat and starts fresh with the note as the first message. |

### What each costs

Example: a cold chat with 210k tokens on Opus 5.5, at list prices. On a subscription the same ratios apply to your usage
limit.

| Option | Once | Per message after | Chat size after |
| --- | --- | --- | --- |
| Carry on | $1.05 to $1.70 | $0.04 | 210k and growing |
| Compact, cold (Haiku 5.5 writes it) | $0.13 | $0.01 | 20k to 50k |
| Compact with the chat's model | $1.00 | $0.01 | 20k to 50k |
| Handoff, Quick (Haiku 5.5 writes it) | $0.11 | $0.002 | about 10k |

Prices: Opus 5.5 $4 per million input tokens, $0.20 when cached, $20 output. Haiku 5.5 $0.50 input and $2.50 output
above 100k tokens. Over ten more messages, carrying on costs about $1.20 to $1.90 more than compacting or handing off.
Between Compact and Handoff the difference is a cent or less per message.

### Which to pick

- **Same task, and the details matter** (numbers, decisions, what you tried): Compact. You can add a note on what the
  summary must keep, like "keep the test results and the open question about the date filter".
- **One part is done and a new one starts:** Handoff. The new chat is small and isn't distracted by old history.
- **You're finished:** do nothing. A chat you don't touch costs nothing.

### The two bars

*Reduce context* opens the compact bar: **Compact session** or *Handoff instead* on the left, a field for a note to the
summary and **Compact** on the right. The handoff bar reads **Handoff** or *Compact instead*, then its controls and
**Go**. Each bar switches to the other, and the handoff bar remembers your last choice.

### Who writes the summary

Settings → Model → *Summaries*:

- **Auto** (default): Haiku 5.5 when the cache is cold, the chat's own model when it's warm.
- **Chat's model**: always the chat's model.

Why Auto: with a warm cache, Opus 5.5 reads the chat cheaply and writes a better summary for a few cents more. With a
cold cache, Opus 5.5 pays full price for the whole chat (about $1 for 210k), Haiku 5.5 about $0.13. Automatic
compactions usually run right after a reply, while the cache is warm, so Auto mostly matters for the compactions you
start yourself after a pause. If Haiku 5.5 fails, the chat's model takes over.

Haiku 5.5 sees long tool output shortened, so its summary has less detail. If a chat is full of details you need, use
Handoff, or switch to *Chat's model* for that one compaction.

Another plugin or a hook of your own can veto a compaction (a PreCompact hook). Where the plugin sees one, or cannot
tell, it leaves the compaction to Claude Code, so the veto gets its say. See
[Known limitations](known-limitations.md) for the one case it cannot see.

## Handoff options

### Quick or Full

| Kind | What it does |
| --- | --- |
| Quick (recommended) | Written in seconds from the chat, without tools. On a cold chat Haiku 5.5 writes it. The git state in it is what the chat last saw. |
| Full | A normal turn with tools. It checks git, commits and pull requests (asking GitHub when the `gh` tool is installed), rewrites `HANDOFF.md` in your project and then answers with the note. Slower, costs a full turn, and leaves a file in your repo. |

Use Full before a longer break or when the exact git state matters. Settings → Handoff & alerts → *Handoff skill*
points Full at your own handoff skill or command.

### What happens next

| Way on | What it does |
| --- | --- |
| Clear & wait (recommended) | The chat is cleared. The new chat sums up in two lines where things stand and waits. You check the note before anything runs. |
| Clear & carry on | The chat is cleared and the new chat starts on the next step right away. Faster, but it works from a note you haven't read. |
| Keep chat & copy | Nothing is cleared. The note goes to your clipboard. |

### What keeps a handoff safe

- **Go** pressed while Claude is still answering waits for that reply to end. Only the handoff's own turn is taken as
  the note.
- If the cleared chat does not take the note (another plugin held the message back), the note goes into the prompt
  box when the box is empty, else to the clipboard, and a toast says where it is.
- The plugin never overwrites a draft in the prompt box. If the clipboard refuses too, the note is kept in the chat's
  memory and `/smarttokensaver handoff note` shows it.
- `/smarttokensaver handoff` writes a quick handoff at once with your last choice, `/smarttokensaver handoff full` a
  full one.

## The "getting swamped" band

Near compaction a band says **Chat window is getting swamped**, with the figures (*308k / 400k (77%) · compacts at
367k*), **Context size** (another window for this chat), **Handoff** and **Compact**. When it shows depends on the
window; the table is in [The compaction window](compaction-window.md#when-the-alert-shows).

## Updates

The plugin checks its own repository every six hours, the same way Claude Code updates any marketplace
(`claude plugin marketplace update`). When a newer version is out, a card above the prompt offers **Update**, **Later**
or **Skip**. Update installs the new version; it runs in every new chat. The chat you are in keeps the old version
until you run `/reload-plugins --force` there, which makes the next message reread the chat at full price; that is why
the plugin does not reload by itself. Claude Code's own marketplace auto-update works too, if you switch it on for this
marketplace. In a clone of the repository Settings → Support says *From your clone*: `git pull` updates it.
