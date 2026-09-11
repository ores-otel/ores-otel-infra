import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = fileURLToPath(new URL("../", import.meta.url));
const topology = JSON.parse(readFileSync(join(root, "shared-auth/topology.json"), "utf8"));
const enabled = process.env.SHARED_AUTH_TEST_PG === "1";
function run(command, args, input) {
  assert.ok(["127.0.0.1", "localhost"].includes(process.env.PGHOST), "PGHOST must be loopback");
  assert.ok(process.env.PGPORT && process.env.PGUSER, "Set disposable server PGPORT and PGUSER");
  const env = { PATH: process.env.PATH, PGHOST: process.env.PGHOST, PGPORT: process.env.PGPORT, PGUSER: process.env.PGUSER, PGPASSFILE: "/dev/null", PGCONNECT_TIMEOUT: "5" };
  if (process.env.PGPASSWORD) env.PGPASSWORD = process.env.PGPASSWORD;
  const result = spawnSync(command, args, { input, env, encoding: "utf8", timeout: 20_000 }); assert.equal(result.status, 0, `${command} failed: ${result.stderr || result.error}`); return result.stdout.trim();
}
for (const provider of ["supabase", "neon"]) for (const lane of ["auth", "admin"]) test(`${provider}/${lane}: migration records exact topology and replays idempotently`, { skip: enabled ? false : "Set SHARED_AUTH_TEST_PG=1 for disposable PostgreSQL" }, () => {
  const database = `ores_otel_shared_auth_${randomUUID().replaceAll("-", "")}`; run("createdb", ["--maintenance-db=postgres", "--template=template0", database]);
  const sql = readFileSync(join(root, provider, lane, "migrations/202609070001_shared_auth_runtime_policy.sql"), "utf8"); const psql = ["-X", "--no-password", "--set=ON_ERROR_STOP=1", "--dbname", database]; const admin = lane === "admin";
  const expected = [{ provider, data_plane: admin ? "admin-auth" : "customer-auth", contract_version: topology.version, github_org: topology.githubOrg, runtime_org: topology[provider].runtimeOrg, target_org: topology[provider].targetOrg, database_url_env: topology[provider][admin ? "adminDatabaseUrlEnv" : "authDatabaseUrlEnv"], decision_mode: topology.requestPolicy[admin ? "adminMode" : "customerMode"], server_roles: admin ? ["admin-web-server", "admin-api-server"] : ["web-server", "api-server"] }];
  const query = "SELECT coalesce(jsonb_agg(to_jsonb(p) - 'recorded_at'), '[]'::jsonb) FROM ores_otel.shared_auth_runtime_policy p;";
  for (let replay = 0; replay < 2; replay += 1) { run("psql", psql, sql); const actual = JSON.parse(run("psql", [...psql, "-At", "--command", query])); assert.deepEqual(actual, expected); }
});
