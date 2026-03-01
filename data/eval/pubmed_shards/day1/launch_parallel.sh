#!/usr/bin/env bash
set -euo pipefail

PARALLEL_JOBS="${1:-12}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Runs each command from commands.sh in parallel.
grep -v "^#" "${SCRIPT_DIR}/commands.sh" | sed "/^$/d" | xargs -I{} -P "${PARALLEL_JOBS}" bash -lc "{}"
