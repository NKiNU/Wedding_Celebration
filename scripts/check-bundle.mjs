// Fails when a server secret reached what browsers download: the bundle (.next/static) and the
// prerendered pages (.next/server/app *.html / *.rsc). Run after `npm run build`.
// `--strict` (CI) also fails unless every secret had a value to look for.
// Secret NAMES are not checked: the env schema in src/lib/validation.ts is shared with the client,
// so the names are expected there. What must never ship is a secret VALUE, or a service-role JWT.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "DEVICE_TOKEN_PEPPER",
  "ADMIN_PASSCODE",
  "CRON_SECRET",
];
const DIRS = [
  { dir: ".next/static", files: /\.(js|mjs|css|html|json|map|txt)$/ },
  { dir: ".next/server/app", files: /\.(html|rsc)$/ },
];
const MIN_LENGTH = 8; // shorter values would match by chance

/** KEY=value pairs from .env.local, when it exists (a local build); the process env wins. */
function envValues() {
  const values = {};
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=([^#]*)/.exec(line);
      if (match) values[match[1]] = match[2].trim();
    }
  }
  for (const name of SECRETS) if (process.env[name]) values[name] = process.env[name];
  return values;
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/** True for a JWT whose payload claims the service role: that key bypasses every RLS policy. */
function isServiceRoleJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

if (!existsSync(DIRS[0].dir)) {
  console.error(`check-bundle: ${DIRS[0].dir} not found. Run \`npm run build\` first.`);
  process.exit(2);
}

const env = envValues();
const secrets = SECRETS.map((name) => [name, env[name]]).filter(([, v]) => v && v.length >= MIN_LENGTH);
if (process.argv.includes("--strict") && secrets.length < SECRETS.length) {
  const missing = SECRETS.filter((name) => !secrets.some(([n]) => n === name));
  console.error(`check-bundle: --strict needs a value for every secret; missing: ${missing.join(", ")}`);
  process.exit(2);
}

const problems = [];
let scanned = 0;

for (const { dir, files: wanted } of DIRS) {
  if (!existsSync(dir)) continue;
  for (const path of files(dir)) {
    if (!wanted.test(path)) continue;
    scanned += 1;
    const text = readFileSync(path, "utf8");
    for (const [name, value] of secrets) if (text.includes(value)) problems.push(`${path}: the value of ${name}`);
    for (const [token] of text.matchAll(/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]+/g)) {
      if (isServiceRoleJwt(token)) problems.push(`${path}: a service-role JWT`);
    }
    // Supabase's newer secret keys (the publishable key is meant to be public).
    if (/sb_secret_[\w-]{10,}/.test(text)) problems.push(`${path}: a Supabase secret key (sb_secret_…)`);
  }
}

if (problems.length > 0) {
  console.error(`check-bundle: secrets found in the browser bundle:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-bundle: ${scanned} files scanned, ${secrets.length} secret values checked, none found.`);
