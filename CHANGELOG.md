# Changelog

## 1.0.0 (2026-11-23)

First release. Smart Token Saver is based on effortless by HeyCubit (MIT); this version builds on effortless 1.72.0.
[UPSTREAM.md](UPSTREAM.md) lists what is different from upstream.

- **Smart effort.** Haiku 5.5 reads each message and picks Low, Medium or High, through your own Claude login. It runs
  on Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.2, where an effort change keeps the prompt cache, and pauses on older
  models. A Smart / Default switch, a floor and a ceiling, and a lean toward cheaper or smarter. An effort you name in
  a message ("use max effort") is taken as said.
- **Compaction window.** 300k by default, set without writing to `settings.json` where Claude Code lets a plugin do
  that. Another size for one chat (*This chat only*). Where an organisation keeps plugins out, the Context size card
  says so and offers `/autocompact` or a request for a new chat instead.
- **Alerts that follow the compaction point.** "Chat window is getting swamped" near compaction, "Chat went cold" on
  a big chat whose cache lapsed, and "Running low" past 80 % of the 5-hour or weekly limit, with Save mode.
- **Compact and Handoff in one click.** Haiku 5.5 writes the summary of a cold chat, the chat's own model that of a
  warm one. A Quick or Full handoff writes a note, clears the chat and starts the new one; it never overwrites a draft
  in the prompt box.
- **Setup, Settings and commands.** A short setup in a new chat, Settings above the prompt, `/smarttokensaver` with
  `settings`, `setup`, `auto`, `save`, `handoff`, `window`, `guide`, `stats` and `support`.
- **Panels.** Automatic (follows the app), always dark or always light; the bar, or buttons only.
- **Support.** An update check for this repository every 6 hours (Update, Later, Skip) and Report a bug. In a clone
  with the opt-in file, two maintainer tools: Upstream updates and Measurement.
- **Privacy.** No outside judge service, no analytics, no usage log outside the maintainer's Measurement. The only
  network call of its own is the update check.
- **Documentation.** The full reference is in [docs/](docs/README.md); the guide is the short user manual at
  https://rimford.github.io/smart-token-saver/guide/.
