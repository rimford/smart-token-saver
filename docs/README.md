# Smart Token Saver: documentation

The full reference for the plugin. The [guide](https://rimford.github.io/smart-token-saver/guide/) is the short user
manual; everything it says is here too, with the details the guide leaves out.

| Page | What it covers |
| --- | --- |
| [How it works](how-it-works.md) | The bar, the row under the prompt, Smart effort, cold chats, Running low and Save mode, Compact and Handoff |
| [The compaction window](compaction-window.md) | Why a limit on the chat's size saves the most, why 300k, how to change it, what happens where plugins may not set it |
| [Settings and commands](settings-and-commands.md) | Every Settings card row by row, every plugin option, every `/smarttokensaver` command |
| [Privacy and files](privacy-and-files.md) | What leaves your computer, which files the plugin writes, backups, what stays after an uninstall |
| [Measurements](measurements.md) | What is proven and what is not, the numbers behind the recommendations, how to repeat them |
| [Known limitations](known-limitations.md) | Where the plugin cannot do what it says elsewhere, and why |

Also in the repository: [README](../README.md) (install, overview, maintainer tools), [CHANGELOG](../CHANGELOG.md),
[UPSTREAM](../UPSTREAM.md) (what differs from effortless), [MAINTAINER-UPDATE](../MAINTAINER-UPDATE.md) (how an
upstream release is reviewed and merged).

The guide page is built from `docs/guide/template.html` with `python3 -I docs/guide/build.py`.
