import "server-only";
import { parseEnv, type Env } from "@/lib/validation";

let cached: Env | undefined;

/** Validated server config, parsed once on first use. */
export function env(): Env {
  return (cached ??= parseEnv(process.env));
}
