# Settings and commands

Open Settings with ⚙ in the bar or under the prompt, or with `/smarttokensaver settings`. The overview shows one card
per part, each with a short line on what is set. Click a card to open it; *← Settings* goes back. Every change saves
itself the moment you make it (*✓ Saved* shows for a moment) and reaches every open chat within a few seconds. Settings
are kept in the plugin's own store under `~/.claude/smarttokensaver/`, so no reload line appears in the chat. The
*Guide* button top right opens the matching section of the guide.

## Effort

Overview line: the lean and the limits, for example *Balanced · low to high*.

| Row | What it does | Option |
| --- | --- | --- |
| Lean | Five stops from *Cheapest* to *Smartest*. *Balanced* lets Haiku 5.5 decide alone. *Cheaper* and *Smarter* only tip close calls; *Cheapest* and *Smartest* move more messages down or up. | `effortBias` (−2 to 2) |
| Limits | *Min* and *Max*: the lowest and highest level Smart may pick (default Low to High). | `effortFloor`, `effortCeiling` |
| Subagents | Off by default: subagents run at the chat's effort. On, Smart reads each subagent's task first and picks its effort, Medium or more. | `helpers` |
| Save mode | Keeps Smart at Medium or below until the usage limit resets. | per chat |

## Model

Overview line: whether the chat keeps its model.

| Row | What it does | Option |
| --- | --- | --- |
| Simple prompts | *Always the chat's* (default): every message keeps your model, only the effort changes. *Cheaper when it can* lets Haiku 5.5 or Sonnet 5.5 answer simple messages. Experimental: the prompt cache belongs to one model, so the other model reads the whole chat again at full price, which often costs more than the cheaper model saves. It only pays on short chats or after a long pause, and the answer can differ in style. Kept to measure it, not as a recommendation. | `modelAuto` |
| Summaries | Who writes the summary when a chat compacts. *Auto*: Haiku 5.5 on a cold cache, the chat's model on a warm one. *Chat's model*: always the chat's model. Where your organization keeps plugins out of compaction, a note says the chat's model writes every summary. | `compactWith` |

## Customize

Overview line: what shows and how it looks, for example *Bar · automatic*.

| Row | What it does | Option |
| --- | --- | --- |
| Show | *Bar*: effort, context, cache and buttons in one bar above the prompt. *Buttons only*: the small row under the prompt. | `layout` |
| Terminal | Terminal only. *Above prompt* (default): the bar above the prompt. *Below prompt*: no bar at rest, a dim status line under the prompt (effort, cache, context); alerts, the setup and Settings still open above. | `terminalPlace` |
| Panels | *Automatic* follows the app. *Always dark* and *Always light* colour the plugin's panels only; the app keeps its own mode. In the terminal they paint the panels dark or light as well. | `appearance` |
| In the bar | *Cache countdown* (on by default). *Why this effort* (off by default): beside Smart the bar names who picked the effort, *(Haiku 5.5)* or *(You)*, with the reason on hover. | `hide` |
| Remove | *Uninstall* (press twice) removes the plugin. | |

## Handoff & alerts

Overview line: who writes a Full handoff and when the context alert comes, for example *Built in · alert at Auto*.

| Row | What it does | Option |
| --- | --- | --- |
| Handoff skill | Who writes a Full handoff: the built-in one, or one of your installed skills or commands. | `handoffSkill` |
| Handoff button | *When advised* (default): the bar's button turns into Handoff only when Haiku 5.5 thinks a fresh chat beats compacting. *Always*: Compact and Handoff sit side by side as two quiet buttons; Handoff lights up once Haiku 5.5 advises it. | `handoffButton` |
| Alerts | Which bands show. *Context*: the chat is nearly full, at *Auto* or a fixed percent. *Running low*: a usage limit is close. *Cold cache*: the next message pays full price. An alert's ✕ only closes it for now; the box here switches it off. | `swampAt`, `hide` |

## Context size

Overview line: *New & current: 300k*, or *New: 300k / Current: 400k*. See
[The compaction window](compaction-window.md).

| Row | What it does |
| --- | --- |
| New chats | The compaction window every new chat gets (default 300k). Option `compactWindow`. |
| This chat only | Another size for the chat you are in. New chats keep your default. The row says "in use" once Claude Code confirms the size. |
| Where plugins may not set it | A line on top says so, and the card shows the `/autocompact` command with *Paste into chat* and *Copy*, or *Paste into new chat*. |

## About

Your version and the public effortless version it builds on, with the link to the original project.

## Support

Overview line: *Update · Report a bug*.

| Row | What it does |
| --- | --- |
| Updates | Checks the plugin's repository every six hours. *Check now* looks at once, *Turn off* stops the checks in every open chat. In a clone of the repository it says *From your clone*. |
| Report a bug | *Open an issue* opens a new GitHub issue with your plugin version filled in and nothing else. |

In a checkout of the repository with the opt-in file, a **Maintainer** section adds *Upstream updates* and
*Measurement*; see [README, For maintainers](../README.md#for-maintainers).

## Options in plugin.json

The cards above write these options. They can also be set as plugin options in Claude Code; the descriptions in
`.claude-plugin/plugin.json` are the reference. Options without a card:

| Option | What it does |
| --- | --- |
| `handoffAfter` | What the handoff bar starts on (`continue`, `confirm`, `copy`); the bar then remembers your last choice. |
| `theme` | The colours of everything the plugin draws: `navy` (default), `neutral`, `violet`, `orange`, `rose`. |
| `abControl`, `measureLog` | Measurement, for maintainers only. Ignored unless the maintainer tools are on. |

## Commands

| Command | What it does |
| --- | --- |
| `/smarttokensaver setup` | Runs the setup again. |
| `/smarttokensaver settings` | Opens Settings. |
| `/smarttokensaver auto` | Switches Smart effort on or off. |
| `/smarttokensaver save` | Switches Save mode on or off. |
| `/smarttokensaver window <size>` | The compaction window for new chats, e.g. `300k` or `1M`. Without a size it says what is set; `window default` leaves it to Claude Code. |
| `/smarttokensaver window this <size>` | Another size for this chat only; `window this reset` (also `default` or `off`) undoes it, and without a size it says what this chat uses. |
| `/smarttokensaver handoff`, `handoff full` | Writes a quick or a full handoff at once, with your last way on. |
| `/smarttokensaver handoff note` | Shows the handoff note the plugin kept because neither the prompt box nor the clipboard took it. |
| `/smarttokensaver switch`, `keep` | Answers a model suggestion (only with the model row on, see below): switch to the suggested model, or keep the current one. |
| `/smarttokensaver stats` (or `saved`) | Sums up the efforts and tokens of this chat (see [Measurements](measurements.md#stats)). |
| `/smarttokensaver guide` | Opens the guide. |
| `/smarttokensaver support` | The link for a bug report. |
| `/smarttokensaver debug` | One line of state for a bug report: cache, last drawing, window in use, last request, version. No prompt text. |

For trying things out:

| Command | What it does |
| --- | --- |
| `/smarttokensaver cold` | Shows the cache as cold now. The next reply restarts the countdown. |
| `/smarttokensaver hot` | Shows the Running low band now. It goes away at the next check. |
| `/smarttokensaver swamp` | Shows the "getting swamped" band now. It goes away at the next check. |
| `/smarttokensaver agents`, `agents demo` | Opens the agents pane (a preview; `demo` fills it with sample agents). |
| `/smarttokensaver bench` | Runs the judge over `bench/judge-cases.json` and saves a report in the current folder. It costs Haiku 5.5 calls. |

| `/smarttokensaver probe <n>` | Draws a test panel above the prompt, to find out what a surface can show (`probe 0` is the real panel). |

`/smarttokensaver` alone, or with a word it does not know, lists the commands.

Other switches, for trying things out:

- `SMARTTOKENSAVER_MODEL_UI=1` (environment) brings back the model row in the bar and the model suggestion. It is
  paused by default: effort first.
- `~/.claude/smarttokensaver/preview.json` with `{"contextPercent": 45}` draws the bars at that share, so a level can
  be looked at without filling a chat. No file, no change.
- The `hide` option takes these names, comma-separated: `handoff`, `timer`, `reason`, `progress`, `sounds`, `swamp`,
  `hot`, `cold`.
- In Settings → Context size, **Save for new chats** shows when this chat runs on another size than your default: it
  makes this chat's size the default.

For maintainers (only with the opt-in file): `/smarttokensaver maintainer updates <folder>|off` and
`/smarttokensaver maintainer measure <percent>|off`.
