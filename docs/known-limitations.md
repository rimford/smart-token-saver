# Known limitations

## A PreCompact veto from a plugin loaded with `--plugin-dir` alone is not seen

On a cold chat with *Summaries* on Auto, the plugin lets Haiku 5.5 write the summary. Before it does, it checks whether
anything else might veto the compaction (a PreCompact hook): Claude Code's settings, every enabled plugin's hooks, and
plugins loaded from folders named in `CLAUDE_CODE_PLUGIN_DIRS`. Where it finds one, or cannot read a list, it leaves
the compaction to Claude Code, so the veto gets its say.

A plugin loaded only through the `--plugin-dir` flag is in no list a plugin can read. If such a plugin has a PreCompact
hook that would veto, a cold compaction through Haiku 5.5 can go ahead without it. This concerns people developing
plugins. Ways around it: name the folder in `CLAUDE_CODE_PLUGIN_DIRS` instead of the flag, install the plugin from a
folder marketplace, or set Settings → Model → *Summaries* to *Chat's model*.

## Haiku summaries step back when another plugin cannot be looked into

Before Haiku 5.5 writes a summary, the plugin checks that no other enabled plugin could veto the compaction. An
installed plugin it cannot look into counts as one that could: no readable manifest, a hooks module that cannot be
read, or one that names `PreCompact`. Claude Code then compacts with the chat's own model, which works but costs more.
An entry in `enabledPlugins` for a plugin that has no install record is left out: Claude Code has no folder to load it
from, so it runs no hook.

## Organizations that keep plugins out

- **Out of settings hooks:** the plugin cannot set the compaction window by itself. It writes the settings file or
  hands you `/autocompact`; see [The compaction window](compaction-window.md#where-the-plugin-cannot-set-it).
- **Out of the settings file too:** the step is yours (*Paste into new chat*).
- **Out of compaction:** the chat's model writes every summary, Auto saves nothing on cold chats, and Settings → Model
  says so.

Your Claude admins can allow these for this plugin.

## Models

- Smart pauses on Fable 5.1, Opus 5 and earlier (an effort change would cost the cache there).
- A Haiku before 5.5 takes no effort; nothing is picked.
- *Cheaper when it can* (Settings → Model) rarely saves anything in a chat that is in use; it is experimental.

## Where things show

- The *Buttons only* row and the update cards are drawn in the desktop app; the terminal shows the bar and the bands,
  and `/smarttokensaver support` says there whether an update is out.
- *From your clone* and *Review* are maintainer tools. Review opens the new session by itself on macOS only.
- A narrow window shortens the bar: words go before figures do.

## What the plugin cannot make safe

- **The settings file.** Claude Code gives plugins no atomic write and no lock. The plugin reads the file again right
  before it writes and keeps three backups, but two programs writing in the same instant can still lose one change.
- **The handoff's turn.** Claude Code gives a plugin no id for the turn it started, so the plugin tells its handoff
  turn by time and by the chat's id. A message you send in the same second can be taken for it.
- **A failed summary call.** Claude Code says only that the call failed, not why. The plugin tries the model's other
  name once, also where the reason was a rate limit.
- **The replay figures.** The chat logs behind the 300k figures are private and not in this repository, so the
  figures cannot be rerun from it.

## Other

- Plugins load when a chat starts. After an install or an update, the chat you are in keeps what it had until
  `/reload-plugins --force`, which makes the next message reread the chat at full price.
- *Paste into new chat* opens a new chat only in the desktop app on macOS; elsewhere the request is copied.
- The guide opens in the browser by itself on macOS only; elsewhere the link is copied or shown.
- Haiku 5.5 sees long tool output shortened when it writes a summary or a quick handoff.
- The cost figures in the documentation are list prices from one person's logs; trust the differences more than the
  amounts.
