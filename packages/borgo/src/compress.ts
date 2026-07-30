import { readdirSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, createGzip, gzipSync } from "node:zlib";

// types worth compressing; images, fonts and media are already compressed
const compressibleRe = /\.(js|mjs|css|html|htm|svg|json|map|txt|xml|webmanifest)$/i;

export const isCompressiblePath = (path: string) => compressibleRe.test(path);

// bun's chunk naming is [name]-[hash].[ext]: a new hash on every content
// change makes these safe to cache forever. scoped to the build-owned
// assets dir so a user file that happens to match stays out
export const isHashedAsset = (path: string) =>
  /(^|\/)assets\/[^/]+-[a-z0-9]{8}\.(js|css)$/i.test(path.replaceAll("\\", "/"));

// picks the first server-preferred encoding the client accepts (q > 0)
export function pickEncoding(
  acceptEncoding: string | null,
  preferred: readonly string[],
): string | null {
  if (!acceptEncoding) return null;
  const q = new Map<string, number>();
  for (const part of acceptEncoding.split(",")) {
    const [name, ...params] = part.trim().split(";");
    const token = name.trim().toLowerCase();
    if (!token) continue;
    let quality = 1;
    for (const param of params) {
      const [key, value] = param.trim().split("=");
      if (key.trim() === "q") quality = Number(value);
    }
    q.set(token, Number.isNaN(quality) ? 0 : quality);
  }
  for (const encoding of preferred) {
    const quality = q.get(encoding) ?? q.get("*");
    if (quality !== undefined && quality > 0) return encoding;
  }
  return null;
}

// build time: write .gz and .br siblings next to every compressible asset,
// so serving them costs nothing at runtime. skipped when not smaller.
export async function precompressAssets(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !isCompressiblePath(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    const raw = Buffer.from(await Bun.file(path).arrayBuffer());
    const gz = gzipSync(raw, { level: constants.Z_BEST_COMPRESSION });
    if (gz.length < raw.length) await Bun.write(path + ".gz", gz);
    const br = brotliCompressSync(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
    if (br.length < raw.length) await Bun.write(path + ".br", br);
  }
}

// runtime: gzip a stream with a sync flush per chunk, so every react flush
// reaches the client immediately and streamed ssr stays progressive
export function gzipStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const gzip = createGzip({ flush: constants.Z_SYNC_FLUSH });
  // an explicit reader: the pump holds the source's lock, so a client
  // disconnect must cancel through the reader, never through the source -
  // cancelling a locked stream throws, and from bun's cancel callback that
  // used to take the whole server process down
  const reader = source.getReader();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const closed = new Promise<void>((resolve) => gzip.once("close", resolve));
      gzip.on("data", (chunk: Buffer) => {
        if (!cancelled) controller.enqueue(new Uint8Array(chunk));
      });
      gzip.on("end", () => {
        if (!cancelled) controller.close();
      });
      gzip.on("error", (error) => {
        if (!cancelled) controller.error(error);
      });
      void (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done || gzip.destroyed) break;
            if (!gzip.write(value)) {
              await Promise.race([new Promise((resolve) => gzip.once("drain", resolve)), closed]);
              if (gzip.destroyed) break;
            }
          }
          if (!gzip.destroyed) gzip.end();
        } catch (error) {
          gzip.destroy(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    },
    cancel(reason) {
      cancelled = true;
      gzip.destroy();
      void reader.cancel(reason).catch(() => {});
    },
  });
}

export const COMPRESS_MIN_BYTES = 1024;

// buffered json (props, redirects): gzip only above the threshold, tiny
// payloads are cheaper on the wire uncompressed
export function jsonResponse(req: Request, value: unknown, init: ResponseInit = {}): Response {
  const payload = JSON.stringify(value);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Vary", "Accept-Encoding");
  const accepted = pickEncoding(req.headers.get("accept-encoding"), ["gzip"]);
  if (accepted && Buffer.byteLength(payload) >= COMPRESS_MIN_BYTES) {
    headers.set("Content-Encoding", "gzip");
    return new Response(gzipSync(payload), { ...init, headers });
  }
  return new Response(payload, { ...init, headers });
}
