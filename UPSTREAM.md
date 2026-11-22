# Upstream

Smart Token Saver is based on [effortless](https://github.com/HeyCubit/effortless) by HeyCubit (MIT). The license text and both copyright
notices are in [LICENSE](LICENSE) and stay with every copy.

## Versions

| Smart Token Saver | effortless base | Upstream commit | Date |
| --- | --- | --- | --- |
| 1.0.0 | 1.72.0 | 7912a6c | 2026-11-23 |

`UPSTREAM_BASE` in `hooks/names.ts` holds the base version the code compares new upstream releases against. Change it
together with a new row here.

## What is different from upstream

- **Name and home.** Plugin id `smarttokensaver`, command `/smarttokensaver`, files under `~/.claude/smarttokensaver/`.
- **Judge.** Haiku 5.5 through the person's own login only. The outside judge service (TypeSafe/Jev) is gone: no
  setting, no setup step, no key file, no environment variables.
- **Compaction window.** A setting (default 300k) that a `settings.read` hook adds to the merged settings, never over a
  managed value. "This chat only" gives one chat a bigger window for that session.
- **Thresholds from the trigger.** The ring, the cold band, the swamp alert and the handoff check follow the point
  where Claude Code compacts, not the model's window.
- **Compact with: Auto.** Haiku writes the summary when the cache is cold, the chat's own model when it is warm.
  Haiku gets the fullest transcript that fits its limit: tool results up to 4,000 characters and the last messages in
  full, cut tighter step by step for a longer chat.
- **Updates from this repository.** Support → Updates checks this plugin's own marketplace every 6 hours and offers
  Update, Later or Skip. Upstream releases never install in place: they come in only through a maintainer review
  (Upstream updates, see MAINTAINER-UPDATE.md). No HeyCubit links outside the About card and the maintainer section.
- **Support.** The last settings card: Updates and Report a bug (an issue on this repository, prefilled with the
  version only). In a clone of the repo with an empty `.smarttokensaver-maintainer` file (gitignored) in its top
  folder, a maintainer section adds Upstream updates and Measurement (usage log with version and settings on every
  line, 30-day cleanup). After the setup both go on once by themselves (Measurement at 10 %); a tool turned off stays
  off. Nobody else sees them.
- **Other installs.** The setup finds any `effortless@*` install and Smart Token Saver from another marketplace, and
  offers to remove it.
- **Defaults.** Effort ceiling High, handoff "Clear & wait", model switching off, theme Navy & orange (one constant, `DEFAULT_THEME`). A Neutral theme sits beside it in the picker.
- **Texts.** Every label, hover and toast rewritten in plain English. The only contact line is `SUPPORT_HINT` in
  `hooks/names.ts`, empty by default; a fork may set it, and it then shows in the About card.
- **Removed.** Website, report worker, sister plugin, release scripts, dev channels, public release lists.
