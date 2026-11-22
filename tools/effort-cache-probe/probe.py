#!/usr/bin/env python3
"""Does an effort change between two messages keep the prompt cache on a model?

usage: python3 -I tools/effort-cache-probe/probe.py claude-fable-5-2 [more model ids]

Runs one short headless chat per model (six turns, each a `claude -p`, the chat resumed in between). The small mod in
mod/ sends every request at the effort the turn names, as Smart Token Saver does, and writes down what each request
read from and wrote to the prompt cache. A model is safe for Smart when the turns after an effort change still read
the chat from the cache. Needs `claude` on PATH and a login; costs about $0.30 per Fable run at API prices.
"""
import json
import os
import pathlib
import subprocess
import sys
import uuid

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "out"
CWD = OUT / "cwd"
# About 25k tokens of text in the first message, so the chat part of the cache is as big as the system prompt and tools.
FILLER = "\n".join(
    f"Record {i:04d}: store {1000 + i * 7 % 900} sold {i * 37 % 1000} units of item {i * 13 % 500} in week {i % 52 + 1}, margin {(i * 17) % 40 + 5} percent."
    for i in range(900)
)
# (effort, prompt). Turns 3 to 6 each follow an effort change; 3 and 4 need thought, 5 and 6 call a tool.
TURNS = [
    ("high", "Below is reference material for later questions. Do not use any tools. Reply with exactly: OK 1\n\n" + FILLER + "\n"),
    ("high", "Reply with exactly: OK 2"),
    ("low", "How many integers from 1 to 5000 are divisible by 7 or 11 but not by 13? Reply with the number only."),
    ("xhigh", "How many integers from 1 to 7000 are divisible by 6 or 13 but not by 17? Reply with the number only."),
    ("low", "Read the file note-a.txt in the current folder with the Read tool and reply with its first word only."),
    ("high", "Read the file note-b.txt in the current folder with the Read tool and reply with its last word only."),
]
KEPT_FROM = 90  # percent of the request read from the cache


def run(model: str) -> bool:
    tag = model.replace("claude-", "")
    session = str(uuid.uuid4())
    env = {k: os.environ[k] for k in ("HOME", "PATH", "USER", "LOGNAME", "TMPDIR", "LANG") if k in os.environ}
    print(f"== {model}")
    worst = 100.0
    for n, (effort, prompt) in enumerate(TURNS, 1):
        log = OUT / f"{tag}-{n}.jsonl"
        log.unlink(missing_ok=True)
        which = ["--session-id", session] if n == 1 else ["--resume", session]
        # A clean environment and no user settings: only the probe changes the effort, nothing else is loaded.
        done = subprocess.run(
            ["claude", "-p", "--model", model, "--plugin-dir", str(HERE / "mod"), "--setting-sources", "project", "--strict-mcp-config", *which, "--output-format", "json"],
            input=prompt, capture_output=True, text=True, cwd=CWD, env={**env, "EFFORT_PROBE_EFFORT": effort, "EFFORT_PROBE_OUT": str(log)},
        )
        try:
            result = json.loads(done.stdout)
        except ValueError:
            print(f"  turn {n}: no result ({done.stderr.strip()[:200]})")
            return False
        thinking = (result.get("usage", {}).get("output_tokens_details") or {}).get("thinking_tokens")
        if not log.exists():
            print(f"  turn {n}: the probe wrote nothing (was the mod loaded?)")
            return False
        for line in log.read_text().splitlines():
            step = json.loads(line)
            total = (step["input"] or 0) + (step["read"] or 0) + (step["write"] or 0)
            share = 100 * (step["read"] or 0) / total if total else 0
            if n >= 3:
                worst = min(worst, share)
            print(f"  turn {n} step {step['step']}: sent {step['sent']:<6} read {step['read']:>6} write {step['write']:>6}  {share:5.1f}% from cache  thinking {thinking}  answer {str(result.get('result'))[:24]!r}")
    kept = worst >= KEPT_FROM
    print(f"  -> {'cache kept' if kept else 'CACHE REWRITTEN'} across effort changes (lowest share after a change: {worst:.1f}%), ${result.get('total_cost_usd', 0):.2f}")
    return kept


def main() -> int:
    models = sys.argv[1:]
    if not models:
        print(__doc__)
        return 2
    CWD.mkdir(parents=True, exist_ok=True)
    (CWD / "note-a.txt").write_text("amber river stone\n")
    (CWD / "note-b.txt").write_text("copper field lantern\n")
    return 0 if all([run(m) for m in models]) else 1


if __name__ == "__main__":
    sys.exit(main())
