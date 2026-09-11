import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const lanes = ["supabase/auth", "supabase/admin", "neon/auth", "neon/admin"];
const migration = (lane) => `${lane}/migrations/202609070001_shared_auth_runtime_policy.sql`;
const files = ["shared-auth/topology.json", ...lanes.map(migration)];
const original = new Map(files.map((path) => [path, readFileSync(join(root, path), "utf8")]));
function validate(mutate = () => {}) {
  const sources = new Map(original); mutate(sources); mkdirSync(join(root, "tmp"), { recursive: true });
  const fixture = mkdtempSync(join(root, "tmp/shared-auth-validation-"));
  for (const [path, source] of sources) { const destination = join(fixture, path); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, source); }
  return spawnSync(process.execPath, [join(root, "shared-auth/validate.mjs")], { env: { ...process.env, SHARED_AUTH_REPOSITORY_ROOT: fixture }, encoding: "utf8", timeout: 10_000 });
}
function rejects(mutate, reason) { const result = validate(mutate); assert.equal(result.status, 1, result.stderr); assert.match(result.stderr, reason); }
test("checked-in topology and all four migration records agree", () => { const result = validate(); assert.equal(result.status, 0, result.stderr); });
for (const lane of lanes) {
  test(`${lane}: missing migration is rejected`, () => rejects((sources) => sources.delete(migration(lane)), /missing migration/));
  test(`${lane}: stale provider organization in SQL is rejected`, () => rejects((sources) => { const path = migration(lane); sources.set(path, sources.get(path).replace("'ores-otel','ores-otel','ores-otel'", "'ores-otel','oresoftware','ores-otel'")); }, /policy metadata disagrees with topology/));
}
test("admin migration cannot use customer credentials", () => rejects((sources) => { const path = migration("supabase/admin"); sources.set(path, sources.get(path).replace("SUPABASE_ADMIN_DATABASE_URL", "SUPABASE_AUTH_DATABASE_URL")); }, /policy metadata disagrees with topology/));
test("admin migration cannot weaken paired decisions", () => rejects((sources) => { const path = migration("neon/admin"); sources.set(path, sources.get(path).replace("'NEON_ADMIN_DATABASE_URL','strict-paired'", "'NEON_ADMIN_DATABASE_URL','availability-first'")); }, /policy metadata disagrees with topology/));
for (const [name, mutate, reason] of [
  ["shared provider placement", (t) => { t.supabase.placement = "shared-org-schema"; }, /dedicated-org placement/],
  ["whole-topology org drift", (t) => { t.githubOrg = "oresoftware"; t.supabase.runtimeOrg = "oresoftware"; t.supabase.targetOrg = "oresoftware"; t.neon.runtimeOrg = "oresoftware"; t.neon.targetOrg = "oresoftware"; }, /githubOrg must remain ores-otel/],
  ["cross-organization evidence", (t) => { t.auditRepositories[0] = "oresoftware/another-service"; }, /same-org repositories/],
  ["customer role using admin credentials", (t) => { t.roles.webServer.neonDatabaseUrlEnv = "NEON_ADMIN_DATABASE_URL"; }, /wrong auth plane/],
  ["provider disagreement acceptance", (t) => { t.requestPolicy.rejectProviderDisagreement = false; }, /provider disagreement must fail closed/],
  ["generic database credentials", (t) => { t.neon.authDatabaseUrlEnv = "DATABASE_URL"; }, /generic DATABASE_URL is forbidden/],
]) test(`${name} is rejected`, () => rejects((sources) => { const topology = JSON.parse(sources.get("shared-auth/topology.json")); mutate(topology); sources.set("shared-auth/topology.json", JSON.stringify(topology)); }, reason));
