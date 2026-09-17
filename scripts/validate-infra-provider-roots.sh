#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
for root in neon supabase cloudflare aws gcp tf; do
  [[ -d "$root" && ! -L "$root" ]] || { echo "infra provider root must be a real directory: $root" >&2; exit 2; }
  marker="$root/.ores-provider-root.json"
  [[ -f "$marker" && ! -L "$marker" ]] || { echo "missing provider marker: $marker" >&2; exit 2; }
  python3 -m json.tool "$marker" >/dev/null
  grep -q '"secrets":"external-only"' "$marker" || { echo "provider marker must keep secrets external-only: $marker" >&2; exit 2; }
done

if [[ "${1:-}" == "--structural-only" ]]; then
  exit 0
fi

if command -v oresc >/dev/null 2>&1; then
  oresc --no-json audit repo --path "$repo_root" --profile baseline --required-paths 'neon,supabase,cloudflare,aws,gcp,tf'
elif [[ -n "${ZED_BIN:-}" && -n "${ORESC_TOOL_WORKSPACE:-}" ]]; then
  (
    cd "$ORESC_TOOL_WORKSPACE"
    "$ZED_BIN" run oresc -- --no-json audit repo --path "$repo_root" --profile baseline --required-paths 'neon,supabase,cloudflare,aws,gcp,tf'
  )
else
  echo 'oresc is required for full provider-root admission; use --structural-only only for the public PR structural lane' >&2
  exit 3
fi
