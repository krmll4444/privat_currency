#!/usr/bin/env bash
set -euo pipefail

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

mkdir -p /tmp/rate-data
cp data/latest.json data/history.jsonl data/state.json /tmp/rate-data/

branch="${GITHUB_REF_NAME:-main}"
ok=0

for i in 1 2 3 4 5 6; do
  git fetch origin "$branch"
  git reset --hard "origin/$branch"
  cp /tmp/rate-data/latest.json /tmp/rate-data/state.json data/

  python3 - <<'PY'
from pathlib import Path

ours = [line for line in Path("/tmp/rate-data/history.jsonl").read_text().splitlines() if line]
path = Path("data/history.jsonl")
remote = path.read_text().splitlines() if path.exists() else []
seen = set(remote)
merged = list(remote)
for line in ours:
    if line not in seen:
        merged.append(line)
        seen.add(line)
path.write_text(("\n".join(merged) + "\n") if merged else "")
PY

  git add data/latest.json data/history.jsonl data/state.json
  if git diff --staged --quiet; then
    echo "No data changes"
    ok=1
    break
  fi

  git commit -m "data: оновлення курсів $(date -u +%Y-%m-%dT%H:%MZ)"
  if git push origin "HEAD:$branch"; then
    ok=1
    break
  fi

  echo "push rejected, retry ${i}"
  sleep $((i * 2))
done

test "$ok" = 1
