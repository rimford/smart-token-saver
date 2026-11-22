# Reviewing an upstream effortless release

This is the prompt file for the review session that Settings → Support → Maintainer → Upstream updates opens (Review on the update card). The goal:
check a new effortless release from HeyCubit before a single line of it runs, then decide whether it comes in. Nothing
is merged without the maintainer's explicit OK.

## What Smart Token Saver keeps different (must survive a merge)

| Change | Where |
| --- | --- |
| Names, paths, version, upstream base | `hooks/names.ts`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` |
| Defaults (ceiling High, handoff confirm, compactWith auto, window 300k, theme navy, measureLog off) | `.claude-plugin/plugin.json`, `hooks/defaults.ts` (checked by `tools/check-defaults.mjs`) |
| Compaction window, This chat only, thresholds from the trigger | `hooks/register.tsx` (`withWindow`, `thresholds`, `effectiveThresholds`, `readWindow`) |
| Compact with Auto, fuller Haiku transcript | `hooks/register.tsx` (`compactPlan`, `fitTranscript`) |
| Maintainer: Upstream updates and Measurement | `hooks/register.tsx` (Maintainer blocks), `tools/ab-report.mjs` |
| Other-install detection | `hooks/register.tsx` (`otherBuilds`) |
| Navy & orange theme | `hooks/theme.ts` |
| Desktop panels: one shell in the slot's shape, Always dark / Always light paint the plugin only | `hooks/pinned.ts`, `hooks/theme.ts` (`setPinned`, `themedEls`), `hooks/register.tsx` (`panelFrame`, `underSlot`, the AbovePrompt hook's end) |
| One look for the plain panels: a soft orange fade and faint staggered dots, drawn once by the shell; alert bands, the setup guide and a running handoff keep their own | `hooks/pinned.ts` (`slotWash`), `hooks/register.tsx` (`ownArt`, `ownLook`, the AbovePrompt hook) |
| Swamp band names the compaction point ("compacts at 267k"), handoff bar explains the picked way on | `hooks/register.tsx` (`untilCompaction`, `handoffAfterNote`) |
| Smart runs on the four current models (Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2), each measured; Haiku 5.5 takes an effort | `hooks/register.tsx` (`cacheSafe`, `noEffort`, `withoutEffort`), `tools/effort-cache-probe` (run it before a model joins the list) |
| No rim glow around the bar (judge, Auto on, cold band): the mark pulses instead | removed in 1.0.0 with its redraw schedule (`judgeGlowSvg`, `judgeGlowAt`, `drawGlowSteps`, `autoGlowSvg`, `coldGlowSvg`); must not come back |
| No outside judge, no upstream self-update | removed in 1.0.0; must not come back |

## Steps

1. **Check the state.** `git status` must be clean. Otherwise stop and ask.
2. **Fetch without running anything.** `git fetch https://github.com/HeyCubit/effortless.git stable`, then pin it:
   `REVIEWED=$(git rev-parse FETCH_HEAD)`. Everything below refers to exactly this commit. Check that
   `.claude-plugin/plugin.json` there carries the announced version and note the SHA.
3. **Read the diff** from the commit in UPSTREAM.md to `$REVIEWED`. Read in full what runs in the plugin or configures
   it: `hooks/`, `.claude-plugin/`, `commands/`, `types/`, `sounds/`, scripts under `tools/`, and any new file a module
   loads. Folders that are not part of the plugin are skimmed only.
4. **Security review** of new lines, with file:line evidence:
   - new network targets (`$.http.fetch`, URLs) and what data goes there, above all prompts and chat content;
   - new child processes (`$.process.run`/`start`), file writes outside the plugin folder and `~/.claude/smarttokensaver`;
   - code loaded or run without a click (eval, dynamic import, downloads, self-update);
   - changed defaults that raise cost (effort ceiling, model switching, who compacts).
   A second read by another model, read-only, is welcome.
5. **Judge the value.** What does the release bring? Is it worth taking, or Skip?
6. **Show the findings** to the maintainer (new features, risks, recommendation) and wait for an OK.
7. **After the OK,** bring the changes in on a new branch. This repository does not share its history with upstream,
   so a plain merge has no common base: apply the diff from the base commit in UPSTREAM.md instead
   (`git diff --full-index <base> $REVIEWED | git apply --3way`, or `git cherry-pick <base>..$REVIEWED` to keep
   upstream's commits). Resolve conflicts in favour of the table above, but take new upstream logic. Check every row
   still holds.
8. **Version.** Bump this plugin's version (minor for an upstream merge), add a row to UPSTREAM.md, a line to CHANGELOG.md,
   set `UPSTREAM_BASE` in `hooks/names.ts`.
9. **Test.** `tools/test.sh`, `claude plugin validate .`, and the type-check
   (`npx -y -p typescript@5.6.3 tsc -p . --noEmit`). The type-check needs the types Claude Code writes into
   `.claude-plugin/types/` when it loads the plugin from this folder, so load it once first. New failures must be
   explained.
10. **PR** on this plugin's repository. Merge only after the review.
