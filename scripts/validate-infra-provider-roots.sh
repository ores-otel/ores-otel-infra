#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
for root in neon supabase cloudflare aws gcp tf; do
  [[ -d "$root" && ! -L "$root" ]] || { echo "infra provider root must be a real directory: $root" >&2; exit 2; }
  [[ -f "$root/.ores-provider-root.json" && ! -L "$root/.ores-provider-root.json" ]] || { echo "missing provider marker: $root/.ores-provider-root.json" >&2; exit 2; }
done
if command -v oresc >/dev/null 2>&1; then
  oresc --no-json audit repo --path "$repo_root" --profile baseline --required-paths 'neon,supabase,cloudflare,aws,gcp,tf'
elif [[ -n "${ZED_BIN:-}" && -n "${ORESC_TOOL_WORKSPACE:-}" ]]; then
  (
    cd "$ORESC_TOOL_WORKSPACE"
    "$ZED_BIN" run oresc -- --no-json audit repo --path "$repo_root" --profile baseline --required-paths 'neon,supabase,cloudflare,aws,gcp,tf'
  )
else
  echo 'oresc is required (directly or through ZED_BIN + ORESC_TOOL_WORKSPACE)' >&2
  exit 3
fi
