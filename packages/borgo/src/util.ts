import { existsSync } from "node:fs";
import { c, g } from "./colors";

export const goBinName = () => "api" + (process.platform === "win32" ? ".exe" : "");

// the /api proxy buffers request bodies so a refused connection (api mid-
// restart) can be retried; only bodies of known, modest size qualify - a
// large upload or a chunked stream passes through once, without retry
export const PROXY_RETRY_MAX_BODY = 10 * 1024 * 1024;

export function shouldBufferBody(method: string, contentLength: string | null): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (contentLength === null) return false;
  const length = Number(contentLength);
  return Number.isInteger(length) && length >= 0 && length <= PROXY_RETRY_MAX_BODY;
}

// regenerate .borgo/api-types.d.ts (and the route mounting) from the go api.
// the tool is wired through the app's go.mod `tool` directive.
export async function runBorgogen() {
  if (!existsSync("api")) return;
  const proc = Bun.spawn(["go", "tool", "borgogen"], { stdout: "ignore", stderr: "pipe" });
  if ((await proc.exited) !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(stderr.trimEnd());
    console.error(
      `  ${c.red(g.err)} borgogen failed - api types are stale ${c.dim("(is `tool github.com/LuigiDavideMicca/borgo/cmd/borgogen` in go.mod?)")}`,
    );
  }
}
