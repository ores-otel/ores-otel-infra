# OCI registry adapter for `ores-otel/ores-otel-infra`

This root pins the shared registry modules to `zed-pkg/zed-infra@a14d27928c6feb3600ca6c9dd0eda62c21a976a6`. Every provider is disabled by default, so a checkout and `terraform plan` cannot create registries without an explicit reviewed opt-in.

## Intended routing

- AWS Lambda: same-region private ECR, one `linux/amd64` or `linux/arm64` image per Lambda reference.
- Cloud Run: Google Artifact Registry in the Cloud Run region.
- Azure: Basic ACR is an optional paid mirror; the admin account remains disabled.
- Docker Hub: promotion target only; authenticate externally and use the digest-pinned promotion script.
- Cloudflare R2: blob backend/cache for a separately secured OCI Distribution-compatible service, never a direct Lambda or Cloud Run image URL.

## Review sequence

```sh
terraform -chdir=oci-registry init -backend=false
terraform -chdir=oci-registry fmt -check
terraform -chdir=oci-registry validate
PROMOTE_OCI_DRY_RUN=1 ./scripts/promote-oci-image.sh \
  registry.example/source@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
  registry.example/ores-otel:sha-0123456789ab portable
```

Use OIDC/workload identity or credential helpers. Do not put PATs, access keys, service-account JSON, Docker passwords, R2 credentials, log bodies, trace attributes containing personal data, raw exemplars, or tenant secrets in this repository, Terraform state, image labels, or image layers. Review cost, region, cleanup, IAM, telemetry minimization, and rollback before apply or Crossplane sync. Production deployment manifests must pin the emitted digest.
