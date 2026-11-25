# Smart Token Saver

A Claude Code plugin that spends fewer tokens for you. It picks how hard Claude thinks for each message, shows when a
chat gets expensive, and compacts or hands off a chat in one click.

Smart Token Saver is based on [effortless](https://github.com/HeyCubit/effortless) by HeyCubit (MIT).
[UPSTREAM.md](UPSTREAM.md) lists the version it builds on and what is different.

The guide is the short user manual: https://rimford.github.io/smart-token-saver/guide/

The full documentation is in [docs/](docs/README.md): [how it works](docs/how-it-works.md),
[the compaction window](docs/compaction-window.md), [settings and commands](docs/settings-and-commands.md),
[privacy and files](docs/privacy-and-files.md), [measurements](docs/measurements.md) and
[known limitations](docs/known-limitations.md).

## Install

Smart Token Saver is a plugin mod: it needs a current Claude Code (tested with 2.1.330). Update Claude Code first if
your version is older.

In Claude Code (terminal or desktop app), paste this and press Enter:

```text
/plugin install smarttokensaver --marketplace rimford/smart-token-saver
```

On older Claude Code versions, add the marketplace first:

```text
/plugin marketplace add rimford/smart-token-saver
/plugin install smarttokensaver@smart-token-saver
```

In the desktop app you can also go to **+ → Plugins → Add marketplace**, enter `rimford/smart-token-saver` and install
Smart Token Saver from there.

Then open a new chat. Plugins load when a chat starts. A short setup opens above the prompt: how much Smart should lean
cheaper or smarter, which compaction window to use (300k recommended) and how the panels look. Run it again any time
with `/smarttokensaver setup`. If no bar shows up in the new chat, `/plugin` lists the plugin with the reason it did not
load; most often Claude Code is too old.

## What it does

- **Smart effort.** Before each message, Haiku 5.5 reads it and picks Low, Medium or High. A rename gets Low, a
  refactor gets High. The **Smart / Default** switch in the bar turns it off (Default keeps the effort set in the app),
  and picking an effort yourself also switches to Default. It runs on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2,
  where an effort change keeps the prompt cache (measured, see `tools/effort-cache-probe`), and pauses on older models.
- **A 300k compaction window.** Claude Code compacts a chat about 33k tokens below its window. On 1M-token models
  that is very late, and every message rereads the whole chat until then. Smart Token Saver sets the window to 300k by
  default, so a chat compacts at about 267k and each message rereads less. Replayed on seven weeks of real use, 300k cost about 30 % less than no limit (1M), long
  work sessions about half, and 9 % less than 400k. Below 300k the saving flattens while compactions keep doubling.
  Change it in Settings → Context size or with `/smarttokensaver window 400k`.
- **Where plugins may not set the window.** Some organisations run a policy plugin that skips this plugin's hooks or
  keeps `~/.claude/settings.json` closed to plugins. The plugin notices that, says so at the top of the Context size
  card and offers the way that works: `/autocompact <size>` with **Paste into chat** and **Copy**, or **Paste into new
  chat**, which opens a chat with a request to write the size into the settings file for you to send and allow.
- **Another size for one chat.** Settings → Context size has a **This chat only** list for a chat that needs more
  detail than a compaction keeps. The Context size card's line says the size new chats get and, when it differs, this chat's. The row shows "in use"
  only once Claude Code confirms the size.
- **Cold chats.** After a pause the prompt cache goes cold and the next message rereads everything at full price. The
  bar counts down until then, and a cold, big chat gets a light blue band that offers a cheap compact or a handoff.
- **Handoff.** Quick (written from the chat in seconds) or Full (your own skill, or the built-in one that checks git
  and saves `HANDOFF.md`). Haiku 5.5 tells you when a fresh chat would work better than compacting. The plugin never
  overwrites a draft in the prompt box: a note that could go nowhere is kept, and `/smarttokensaver handoff note` shows it.
- **Save mode when a limit runs low.** Past 80 % of the 5-hour or weekly limit, an orange band says so and when it
  resets. **Save mode** (or `/smarttokensaver save`) keeps Smart effort at Medium or below until that limit resets.
  The same switch sits in Settings → Effort. **Skip for now** brings the band back 5 points later, **Skip this week**
  (or **Skip until reset** for the 5-hour limit) not before the reset.
- **Buttons only.** Settings → Customize → Show can swap the bar for a small row under the prompt: ☰ brings the bar
  back, ⏻ switches Smart, the Reduce button opens Compact session (and Handoff), ⚙ opens Settings.
- **Terminal: above or below the prompt.** Settings → Customize → Terminal → *Below prompt* takes the bar away at rest
  and puts a dim status line (effort, cache, context) under the prompt. Alerts and Settings still open above.
- **Alerts that fit the window.** The "getting swamped" alert comes close to compaction in a small window and well
  before it in a big one (227k at 300k, 507k at 1M).

## What it measures, and what it doesn't

The bar shows what Claude Code itself reports: tokens in the chat, the window it compacts at (the same figures as
`/context`), the cache countdown and, once one runs low, your 5-hour or weekly limit. `/smarttokensaver stats` sums up the current chat.

The 300k figures above come from replaying real chats against Claude Code's prices. Whether Smart effort saves money on
top of that is not proven yet; the first measurements are too few and point both ways.

## Privacy

- Picking the effort, the handoff check and Haiku summaries go through the same connection and Claude login as Claude
  Code itself. No other service sees your prompts. The outside judge service of upstream effortless is removed.
- The plugin keeps its own files under `~/.claude/smarttokensaver/`. A Full handoff saves `HANDOFF.md` in your project.
- The compaction window is added to the settings Claude Code runs with while the plugin is loaded. Only where that
  does not take (a policy plugin skips the hook, or a per-model value wins) do Setup, the Context size card and
  `/smarttokensaver window` write it into `~/.claude/settings.json`, after copying the file as it was to
  `settings.json.smarttokensaver.bak` (the two copies before it stay as `.bak.1` and `.bak.2`). Saving a default this
  way removes every model's own `autoCompactWindow` from the file, so the default applies on all of them. That value
  stays after an uninstall; remove `autoCompactWindow` from the file to undo it. **This chat only** removes just the
  per-model value its own `/autocompact` line leaves behind, so only that chat keeps the size; another per-model
  window you set yourself stays then. Where plugins may not write the file, `/autocompact` or the settings file is used only after you send or
  allow it. A value set with `/autocompact` is Claude Code's own per-model setting and stays after an uninstall until
  you run `/autocompact auto`.
- No usage log, no analytics. The only network call of its own is the update check below, and you can turn it off.
- `SMARTTOKENSAVER_LOG=<file>` writes a debug log for troubleshooting. It can hold excerpts of your prompts, so share it
  with care. Without that variable nothing is written.

## Updates

Settings → **Support** → Updates checks this repository every 6 hours (through `claude plugin marketplace update`,
the same way Claude Code updates any marketplace). When a newer version is out, a card above the prompt offers
**Update**, **Later** or **Skip**. Update installs the new version for every new chat; the chat you are in keeps the
old one until you run `/reload-plugins --force` there (the next message then rereads the chat at full price).
**Check now** looks at once, **Turn off** stops the checks in every open chat.
Claude Code's own marketplace auto-update works too, if you switch it on for this marketplace.

## Report a bug

Settings → **Support** → **Report a bug** opens a new issue on
[GitHub](https://github.com/rimford/smart-token-saver/issues), with your plugin version filled in and nothing else.
`/smarttokensaver support` shows the same link.

## Uninstall

Settings → Customize → Uninstall (press twice), or:

```bash
claude plugin uninstall smarttokensaver@smart-token-saver
```

## For maintainers

Anyone who checks out this repository to work on it can use two maintainer tools. A normal install from the marketplace
never shows them. To turn them on for your checkout:

1. Clone the repository and load it as a folder marketplace (`/plugin marketplace add <path to clone>`, then install
   `smarttokensaver` from it) or start Claude Code with `--plugin-dir <path to clone>`.
2. Create an empty file `.smarttokensaver-maintainer` in the top folder of the clone (`touch .smarttokensaver-maintainer`).
   It is in `.gitignore`, so it never reaches the repository or anyone's install.
3. Open a new chat. Settings → Support now has a **Maintainer** section below **This plugin**. Once the setup has run,
   both tools go on by themselves, once: Upstream updates for this clone and Measurement at 10 %.

- **Upstream updates** checks HeyCubit/effortless every 6 hours. A new release gets a card whose **Review** opens a new
  Claude Code session in your clone with the review prompt from [MAINTAINER-UPDATE.md](MAINTAINER-UPDATE.md). The check
  runs in a git repo of its own under `~/.claude/smarttokensaver/upstream-check`, over HTTPS only and without your git
  config.
- **Measurement** (the lab: the flask with On or Off beside its name, a switch, then the compare share; the flask
  and On/Off also show on the Support card) logs each message and compaction to `~/.claude/smarttokensaver/usage/` (no prompt text) and runs a
  share of messages at Claude Code's own effort, so the saving can be measured. Files older than 30 days are removed.
  `tools/ab-report.mjs` reads the log.

Each part switches on and off on its own, and the choice is kept: a tool you turn off stays off, also in new chats.
Measurement changes how some of your own prompts run (at Claude Code's effort instead of the picked one), so it only
runs in a clone with the file. `SMARTTOKENSAVER_MAINTAINER=0`
hides the section in a checkout that has the file. The commands are `/smarttokensaver maintainer updates <folder>|off` and
`/smarttokensaver maintainer measure <percent>|off`.

## Development

```bash
tools/test.sh
```

This checks that the code defaults match `plugin.json` and runs the test suite. `claude plugin validate .` checks the
manifest.

The guide is `docs/guide/index.html`, built from `docs/guide/template.html` with `python3 -I docs/guide/build.py` and
served by GitHub Pages from the `docs` folder (repository Settings → Pages → branch `main`, folder `/docs`).

## Credits and license

Smart Token Saver is based on [effortless](https://github.com/HeyCubit/effortless) by HeyCubit, under the MIT license.
This version builds on effortless 1.72.0. The license and both copyright notices are in [LICENSE](LICENSE).
