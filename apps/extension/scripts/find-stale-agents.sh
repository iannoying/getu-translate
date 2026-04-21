#!/usr/bin/env bash
# Find AGENTS.md files whose directory has source-file changes newer than the
# AGENTS.md itself. Output (sorted by staleness, descending):
#
#   <age_in_days>\t<directory>
#
# Excludes __tests__/ subdirs, generated/build dirs, and the .agents/ skill
# directory (those AGENTS.md files are managed externally).
#
# Usage:
#   ./scripts/find-stale-agents.sh             # all stale dirs
#   ./scripts/find-stale-agents.sh | head -20  # top 20 stalest
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# Collect (age_seconds, dir) tuples and sort descending.
results=()

while IFS= read -r agents_file; do
  rel="${agents_file#./}"
  dir="$(dirname "$rel")"

  # AGENTS.md last commit time (epoch). 0 if untracked / never committed.
  agents_ts=$(git log -1 --format=%ct -- "$rel" 2>/dev/null || echo 0)
  agents_ts=${agents_ts:-0}

  # Newest commit touching anything in $dir EXCEPT AGENTS.md itself and __tests__.
  if [ "$dir" = "." ]; then
    src_ts=$(git log -1 --format=%ct -- \
      ':(exclude)AGENTS.md' \
      ':(exclude,glob)**/__tests__/**' \
      ':(exclude,glob)**/AGENTS.md' \
      2>/dev/null || echo 0)
  else
    src_ts=$(git log -1 --format=%ct -- "$dir" \
      ":(exclude)$dir/AGENTS.md" \
      ":(exclude,glob)$dir/**/__tests__/**" \
      ":(exclude,glob)$dir/**/AGENTS.md" \
      2>/dev/null || echo 0)
  fi
  src_ts=${src_ts:-0}

  if [ "$src_ts" -gt "$agents_ts" ]; then
    age_days=$(( (src_ts - agents_ts) / 86400 ))
    results+=("${age_days}	${dir}")
  fi
done < <(find . -name AGENTS.md \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/.wxt/*' \
  -not -path '*/.output/*' \
  -not -path '*/.next/*' \
  -not -path '*/dist/*' \
  -not -path '*/coverage/*' \
  -not -path '*/.agents/*' \
  | sort)

# Sort by age descending (largest first).
if [ "${#results[@]}" -gt 0 ]; then
  printf '%s\n' "${results[@]}" | sort -rn
fi
