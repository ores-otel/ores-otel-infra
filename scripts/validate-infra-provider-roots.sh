#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
for root in neon supabase cloudflare aws gcp tf; do
  [[ -d "$root" && ! -L "$root" ]] || { echo "infra provider root must be a real directory: $root" >&2; exit 2; }
  [[ -f "$root/.ores-provider-root.json" && ! -L "$root/.ores-provider-root.json" ]] || { echo "missing provider marker: $root/.ores-provider-root.json" >&2; exit 2; }
done
command -v oresc >/dev/null 2>&1 || { echo 'oresc is required' >&2; exit 3; }
oresc --no-json audit repo --path . --profile baseline --required-paths 'neon,supabase,cloudflare,aws,gcp,tf'
