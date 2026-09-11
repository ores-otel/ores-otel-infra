import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_GITHUB_ORG = "ores-otel";
const EXPECTED_SCHEMA = "ores_otel";
const root = process.env.SHARED_AUTH_REPOSITORY_ROOT ? resolve(process.env.SHARED_AUTH_REPOSITORY_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), "..");
const t = JSON.parse(readFileSync(resolve(root, "shared-auth/topology.json"), "utf8"));
const errors = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const provider = { supabase: ["SUPABASE_AUTH_DATABASE_URL", "SUPABASE_ADMIN_DATABASE_URL"], neon: ["NEON_AUTH_DATABASE_URL", "NEON_ADMIN_DATABASE_URL"] };
const roles = { webServer: ["customer-auth", provider.supabase[0], provider.neon[0]], apiServer: ["customer-auth", provider.supabase[0], provider.neon[0]], adminWebServer: ["admin-auth", provider.supabase[1], provider.neon[1]], adminApiServer: ["admin-auth", provider.supabase[1], provider.neon[1]] };
check(t.contract === "SharedAuthTopology" && t.version === 1, "invalid contract/version");
check(t.githubOrg === EXPECTED_GITHUB_ORG, `githubOrg must remain ${EXPECTED_GITHUB_ORG}`);
check(["direct", "ores-middleware"].includes(t.integration), "invalid integration");
for (const [name, keys] of Object.entries(provider)) {
  const p = t[name] ?? {};
  check(p.runtimeOrg === EXPECTED_GITHUB_ORG && p.targetOrg === EXPECTED_GITHUB_ORG, `${name} organizations must exactly equal githubOrg`);
  check(p.placement === "dedicated-org", `${name} must use dedicated-org placement`);
  check(p.schema === EXPECTED_SCHEMA, `${name} schema is invalid`);
  check(p.authDatabaseUrlEnv === keys[0] && p.adminDatabaseUrlEnv === keys[1], `${name} database settings are not canonical`);
}
check(t.supabase?.schema === t.neon?.schema, "provider schemas must match");
check(t.requestPolicy?.requireBothProvidersConfigured === true, "both providers are required");
check(["availability-first", "strict-paired"].includes(t.requestPolicy?.customerMode), "invalid customer mode");
check(t.requestPolicy?.adminMode === "strict-paired" && t.requestPolicy?.sensitiveMode === "strict-paired", "admin/sensitive must be strict-paired");
check(t.requestPolicy?.rejectProviderDisagreement === true, "provider disagreement must fail closed");
for (const [name, [plane, supabase, neon]] of Object.entries(roles)) check(same(t.roles?.[name], { dataPlane: plane, supabaseDatabaseUrlEnv: supabase, neonDatabaseUrlEnv: neon }), `${name} uses the wrong auth plane`);
check(Array.isArray(t.auditRepositories) && t.auditRepositories.length === 5 && new Set(t.auditRepositories).size === 5 && t.auditRepositories.every((repo) => repo.startsWith(`${EXPECTED_GITHUB_ORG}/`)), "auditRepositories must contain five unique same-org repositories");
for (const [name, keys] of Object.entries(provider)) for (const [lane, plane, key, mode, serverRoles] of [["auth", "customer-auth", keys[0], t.requestPolicy?.customerMode, ["web-server", "api-server"]], ["admin", "admin-auth", keys[1], t.requestPolicy?.adminMode, ["admin-web-server", "admin-api-server"]]]) {
  const path = `${name}/${lane}/migrations/202609070001_shared_auth_runtime_policy.sql`;
  const full = resolve(root, path);
  check(existsSync(full), `missing migration ${path}`);
  if (existsSync(full)) {
    const source = readFileSync(full, "utf8");
    check(!/postgres(?:ql)?:\/\//i.test(source), `${path} contains a database URL`);
    check(!/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i.test(source), `${path} contains a private key`);
    const columns = "provider,data_plane,contract_version,github_org,runtime_org,target_org,database_url_env,decision_mode,server_roles";
    const values = `'${name}','${plane}',1,'${EXPECTED_GITHUB_ORG}','${EXPECTED_GITHUB_ORG}','${EXPECTED_GITHUB_ORG}','${key}','${mode}',ARRAY['${serverRoles.join("','")}']`;
    const expected = `INSERT INTO ${EXPECTED_SCHEMA}.shared_auth_runtime_policy(${columns})VALUES(${values})ON CONFLICT DO NOTHING;`;
    const inserts = source.split(/\r?\n/).filter((line) => /^\s*INSERT\b/i.test(line));
    check(inserts.length === 1 && inserts[0] === expected, `${path} policy metadata disagrees with topology`);
  }
}
const source = JSON.stringify(t);
check(!/shared-org-schema|shared-organization-namespace/i.test(source), "shared provider placement is forbidden");
check(!/postgres(?:ql)?:\/\//i.test(source), "topology contains a database URL");
check(!/\"DATABASE_URL\"/.test(source), "generic DATABASE_URL is forbidden");
check(!/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i.test(source), "topology contains a private key");
if (errors.length) { errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`validated strict Shared Auth topology for ${EXPECTED_GITHUB_ORG}`);
