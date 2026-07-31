import { readdirSync, statSync, type Dirent } from "node:fs";
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

export type AssetVariant = { path: string; encoding?: "br" | "gzip"; etag: string };

export type AssetInfo = {
  identity: AssetVariant;
  // precompressed siblings in server preference order
  variants: AssetVariant[];
  cacheControl: string;
  compressible: boolean;
  mtimeMs: number;
  lastModified: string;
  type: string;
};

// one walk of the served directory at boot, so a request never stats the disk
// to learn whether a file - or its .br/.gz sibling - is there, and every asset
// gets an etag it can be revalidated against. only used in production: dev
// rebuilds assets in place under stable names, where a cached etag would pin
// the browser to yesterday's bundle. anything written after boot is simply not
// in here and falls back to a live lookup.
export function buildAssetIndex(dir: string): Map<string, AssetInfo> {
  const files = new Map<string, { size: number; mtimeMs: number }>();
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  } catch {
    return new Map();
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name).replaceAll("\\", "/");
    try {
      const stat = statSync(path);
      files.set(path, { size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }

  const base = dir.replaceAll("\\", "/").replace(/\/+$/, "");
  const tag = (path: string, suffix: string) => {
    const file = files.get(path)!;
    return `"${file.size.toString(36)}-${Math.floor(file.mtimeMs).toString(36)}${suffix}"`;
  };

  const index = new Map<string, AssetInfo>();
  for (const [path, file] of files) {
    const url = path.slice(base.length);
    const compressible = isCompressiblePath(path);
    const variants: AssetVariant[] = [];
    if (compressible) {
      for (const [encoding, ext] of [
        ["br", ".br"],
        ["gzip", ".gz"],
      ] as const) {
        if (files.has(path + ext)) {
          variants.push({ path: path + ext, encoding, etag: tag(path + ext, `-${encoding}`) });
        }
      }
    }
    index.set(url, {
      identity: { path, etag: tag(path, "") },
      variants,
      cacheControl: assetCacheControl(path),
      compressible,
      mtimeMs: file.mtimeMs,
      lastModified: new Date(file.mtimeMs).toUTCString(),
      type: Bun.file(path).type,
    });
  }
  return index;
}

// hashed build outputs cache forever; a service worker must never be
// heuristically cached, or updates to it (and to everything it controls) lag
// behind deploys
export function assetCacheControl(path: string): string {
  if (path === "public/sw.js" || path.endsWith("/public/sw.js")) return "no-cache";
  return isHashedAsset(path) ? "public, max-age=31536000, immutable" : "";
}

// rfc 9110: if-none-match decides on its own when present, if-modified-since
// only answers when there is no etag to compare
export function isNotModified(req: Request, etag: string, mtimeMs: number): boolean {
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch !== null) {
    if (ifNoneMatch.trim() === "*") return true;
    for (const candidate of ifNoneMatch.split(",")) {
      if (candidate.trim().replace(/^W\//, "") === etag) return true;
    }
    return false;
  }
  const ifModifiedSince = req.headers.get("if-modified-since");
  if (!ifModifiedSince) return false;
  const since = Date.parse(ifModifiedSince);
  // http dates have a one second resolution: compare truncated
  return !Number.isNaN(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
}

const encoder = new TextEncoder();

// the ssr document: shell head, react's own stream, shell tail. pull-based on
// purpose - react is asked for the next chunk only when the consumer has room,
// so a slow client throttles the render instead of letting a whole document
// pile up in memory, and a client that goes away ends the render through the
// iterator's return() instead of paying for a page nobody will read
export function documentStream(
  head: string,
  chunks: AsyncIterable<Uint8Array>,
  tail: string,
): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  let tailSent = false;
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(head));
    },
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (!next.done) return controller.enqueue(next.value);
        if (!tailSent) {
          tailSent = true;
          return controller.enqueue(encoder.encode(tail));
        }
        controller.close();
      } catch (error) {
        // a cancelled consumer (head request, client gone) rejects the pump
        // by design: only a failure on a live stream is worth a log line
        if (cancelled) return;
        console.error("stream pump failed:", error);
        controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
      void iterator.return?.().catch(() => {});
    },
  });
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
