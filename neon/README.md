# Neon GitOps boundary

This directory is the non-secret desired-state boundary for the `ores-otel` Neon organization. Production placement must use the dedicated provider organization matching the GitHub organization exactly: `ores-otel`; shared-provider organization fallback is forbidden.

- `auth/migrations/` owns customer/user Shared Auth migration state and is addressed only through `NEON_AUTH_DATABASE_URL`.
- `admin/migrations/` owns administrator Shared Auth migration state and is addressed only through `NEON_ADMIN_DATABASE_URL`.
- Migrations are promoted by reviewed GitOps/release automation; runtime/application boot never owns DDL.
- Database URLs, passwords, private keys, and provider tokens are secret-manager or encrypted `env/enc` inputs and never committed here.
- TypeSpec and independently authored JSON Schema remain peer authorities; `ORESoftware/typespec-json-schema-validator` (TJSV) remains the cross-authority admission gate.
- A DEN-2843-capable `ores-cli` additionally checks this repository with `oresc audit repo --profile infra`.

This directory describes desired state only and does not claim live provider provisioning or runtime readiness.
