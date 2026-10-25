import { BYTES_PER_HOUR, POSTS_PER_HOUR } from "./limits";

export type Usage = { posts: number; bytes: number };

/** Posts and bytes a guest has asked for: one post per upload intent, every declared byte. */
export function intentUsage(intents: readonly { files: readonly { bytes: number }[] }[]): Usage {
  return {
    posts: intents.length,
    bytes: intents.reduce((sum, i) => sum + i.files.reduce((s, f) => s + f.bytes, 0), 0),
  };
}

/** Why `adding` does not fit into the hourly allowance on top of `used`, or null when it does. */
export function rateLimitProblem(used: Usage, adding: Usage): string | null {
  const over = used.posts + adding.posts > POSTS_PER_HOUR || used.bytes + adding.bytes > BYTES_PER_HOUR;
  return over ? "You’ve shared a lot in the last hour. Please try again a little later." : null;
}
