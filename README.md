# ores-otel-infra

Cloudflare Workers and Kubernetes manifests for `ores-otel`. Cluster source of truth remains github.com/oresoftware/k8s-cluster.

The Kubernetes base enables payload-free internal diagnostics with structured
stderr fallback. Provider overlays bind the backend to ambient AWS, GCP, or
Azure workload identity; the outage-spool CORS examples support separately
authenticated, short-lived, one-object browser uploads without exposing cloud
logging credentials.

See [Internal diagnostics deployment](docs/internal-diagnostics-deployment.md)
for identity permissions, outage-spool workers, security boundaries, state
transitions, and rollout tests.
