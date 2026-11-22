#!/usr/bin/env bash
# Runs every check this plugin has: the defaults against plugin.json, then the test suite.
# Needs node and the Claude Code CLI on PATH. Works on macOS and Linux.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/check-defaults.mjs
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .
