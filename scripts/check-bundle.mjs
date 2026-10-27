// Fails when a secret or a server-only name reached the browser bundle. Run after `npm run build`:
//   npm run check:bundle
// Looks in .next/static (everything a phone downloads) and in the prerendered pages and RSC payloads
// under .next/server/app (served as-is). Secret values come from the
// environment or .env.local; the names are checked even without values.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile(".env.local");
} catch {
  // the variables may already be set (CI, the VPS)
}

const SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCESS_KEY_ID",
  "DEVICE_TOKEN_PEPPER",
  "ADMIN_PASSCODE",
  "CRON_SECRET",
];
const NAMES = [...SECRET_VARS, "service_role"];
const values = SECRET_VARS.map((name) => [name, process.env[name]]).filter(([, v]) => v && v.length >= 8);

const files = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const roots = [".next/static", ".next/server/app"];
const scanned = roots.flatMap((root) =>
  files(root).filter((file) => (root === ".next/static" ? /\.(js|css|html|json|map)$/ : /\.(html|rsc|segment)$/).test(file)),
);
const found = [];
for (const file of scanned) {
  const text = readFileSync(file, "utf8");
  for (const [name, value] of values) if (text.includes(value)) found.push(`${file}: the value of ${name}`);
  for (const name of NAMES) if (text.includes(name)) found.push(`${file}: the name ${name}`);
}

if (found.length > 0) {
  console.error(`Secrets or server-only names in the browser bundle:\n${found.join("\n")}`);
  process.exit(1);
}
console.log(`Bundle clean: ${scanned.length} files in ${roots.join(" and ")}, ${values.length} secret values and ${NAMES.length} names checked.`);
