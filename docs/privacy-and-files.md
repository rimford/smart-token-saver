# Privacy and files

## What leaves your computer

- Picking the effort, checking for a handoff and Haiku 5.5 summaries go through the same connection Claude Code uses,
  with your own Claude login. No extra service sees your prompts. If your Claude Code runs through a gateway, these
  calls do too.
- The only network call of its own is the update check against the plugin's GitHub repository, done by Claude Code's
  own `claude plugin marketplace update`. Settings → Support → *Turn off* stops it. *Check now* and
  `/smarttokensaver support` look once when you ask, also with the checks off.
- `/smarttokensaver guide` and the Guide buttons open the guide in your browser when you ask. *Report a bug* opens a
  GitHub issue page with the plugin version filled in and nothing else.
- The guide is a web page: it loads its fonts from Google Fonts, as many pages do.
- No usage log and no analytics.

The public effortless plugin can send prompts to an outside judge service. Smart Token Saver removes that.

## Files the plugin writes

| Where | What | When |
| --- | --- | --- |
| `~/.claude/smarttokensaver/` | The plugin's own settings and state. | Always. |
| `~/.claude/settings.json` | `autoCompactWindow` only. | Only where Claude Code does not let the plugin set the window through its hook (or a per-model value would win over it), and only when you set a window: Setup's Finish or Apply, the Context size card, `/smarttokensaver window`. Saving a default this way removes every model's own `autoCompactWindow` from the file, so the default applies on all of them. *This chat only* removes just the per-model value its own `/autocompact` line left. |
| `~/.claude/settings.json.smarttokensaver.bak`, `.bak.1`, `.bak.2` | The settings file as it was before the last three changes, newest first. | Before each write to the settings file. |
| `HANDOFF.md` in your project | The note of a Full handoff. | Only on a Full handoff with the built-in writer. |
| `smarttokensaver-bench-<time>.md` / `.json` in the current folder | The judge benchmark's report. | Only on `/smarttokensaver bench`. |
| `~/.claude/smarttokensaver/usage/` | A local usage log: a chat id, the time, effort levels, token counts, prompt length, the plugin version and the settings, never prompt text. Files older than 30 days are removed at each start (on macOS and Linux; on Windows remove them by hand). | Only for maintainers with Measurement on. |
| The file named in `SMARTTOKENSAVER_LOG` | A debug log for troubleshooting. It can hold excerpts of your prompts, so share it with care. | Only while that environment variable is set, or while the plugin is loaded from a `dev-mods` folder (a development load): then it goes to `smarttokensaver-proof.log` in the temp folder. |
| `~/.claude/smarttokensaver/upstream-check` | A git repo of its own for the upstream check, over HTTPS only and without your git config. | Only for maintainers with Upstream updates on. |

The settings file is never written when it changed between reading and saving, and a refused write keeps the plugin
off the file for a week. The write itself is not atomic and takes no lock (Claude Code offers plugins neither), which
is why the three backups exist. Where `CLAUDE_CONFIG_DIR` moves Claude Code's folder, the plugin follows it.

## After an uninstall

Settings → Customize → *Uninstall* (press twice), or `claude plugin uninstall smarttokensaver@smart-token-saver`.

- A window the plugin applied itself ends with the plugin.
- `autoCompactWindow` in `~/.claude/settings.json` stays until you remove it; so do the backup copies beside it.
- A window set with `/autocompact` stays until you run `/autocompact auto`.
- `~/.claude/smarttokensaver/` and a `HANDOFF.md` stay until you delete them.
