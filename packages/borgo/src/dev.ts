import { renameSync, watch } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";
import { c } from "./colors";
import { goBinName, runBorgogen } from "./util";

const serverEntry = fileURLToPath(new URL("serve-entry.ts", import.meta.url));
const ignored = /^(node_modules|\.git|\.borgo|public|dist)([\\/]|$)|borgo\.gen\.go$/;

export async function dev() {
  const goBin = `.borgo/${goBinName()}`;
  const goNext = `.borgo/next-${goBinName()}`;
  const frontPort = process.env.PORT || "3000";
  const apiPort = process.env.API_PORT || "3501";
  let goProc: Subprocess | null = null;
  let frontProc: Subprocess | null = null;
  let reload = false;

  // the front server owns the dev websocket; these endpoints let this
  // process trigger a css hot swap or a full reload in connected browsers.
  // it may be mid-restart, so keep knocking for a while
  const notifyFront = async (path: string): Promise<Response | null> => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        return await fetch(`http://localhost:${frontPort}/__borgo/dev/${path}`, {
          method: "POST",
          signal: AbortSignal.timeout(2_000),
        });
      } catch {}
      await Bun.sleep(250);
    }
    return null;
  };

  // wait until the api actually accepts requests: a freshly built binary can
  // take a while to start listening (antivirus scans, slow disks), and
  // reloading the browser before that lands it on a dead backend
  const apiReady = async (proc: Subprocess) => {
    const deadline = Date.now() + 30_000;
    let exited = false;
    proc.exited.then(() => (exited = true));
    while (Date.now() < deadline && !exited) {
      try {
        await fetch(`http://localhost:${apiPort}/`, { signal: AbortSignal.timeout(1_000) });
        return true;
      } catch {}
      await Bun.sleep(100);
    }
    return false;
  };

  // build to a scratch name while the old api keeps serving, swap only once
  // the binary is ready; windows can hold the old file briefly after exit
  const startGo = async () => {
    await runBorgogen();
    const build = Bun.spawn(["go", "build", "-o", goNext, "."], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await build.exited) !== 0) {
      console.error(`  ${c.red("✗")} go build failed, the previous api keeps serving...`);
      return;
    }
    goProc?.kill();
    await goProc?.exited;
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(goNext, goBin);
        break;
      } catch (error) {
        if (attempt >= 20) throw error;
        await Bun.sleep(100);
      }
    }
    const proc = Bun.spawn([goBin], {
      stdout: "inherit",
      stderr: "inherit",
      env: reload ? { ...process.env, BORGO_RELOAD: "1" } : process.env,
    });
    goProc = proc;
    const ready = await apiReady(proc);
    if (!ready) console.error(`  ${c.red("✗")} api is not answering on :${apiPort}`);
    if (reload && ready) await notifyFront("reload");
  };

  // a code change restarts the front server for a clean module graph; the
  // browser keeps its state and hot-applies the change when it reconnects
  const startFront = async (changed?: string) => {
    frontProc?.kill();
    await frontProc?.exited;
    // process.execPath, not "bun": a PATH lookup can resolve to a shim (npm
    // installs one) whose kill leaves the real server orphaned on the port
    frontProc = Bun.spawn([process.execPath, serverEntry], {
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        DEV: "1",
        ...(reload ? { BORGO_RELOAD: "1" } : {}),
        ...(changed ? { BORGO_CHANGED: changed } : {}),
      },
    });
  };

  // a css edit normally hot-swaps in place; if the front server is parked on
  // a build error (fallback marks its responses), restart it instead
  const swapCss = async (changed: string) => {
    const res = await notifyFront("css");
    if (res?.headers.get("x-borgo-fallback")) await startFront(changed);
  };

  await startGo();
  await startFront();
  reload = true;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let queue = Promise.resolve();
  let busy = 0;
  const schedule = (file: string, side: string, fn: () => Promise<void>, log = true) => {
    const timer = timers.get(side);
    if (timer) clearTimeout(timer);
    timers.set(
      side,
      setTimeout(() => {
        if (log) {
          console.log(`  ${c.terracotta("↻")} ${file.replaceAll("\\", "/")} ${c.dim(`changed, rebuilding ${side}`)}`);
        }
        // errors must not poison the chain, or every later rebuild is skipped
        queue = queue
          .then(async () => {
            busy++;
            try {
              await fn();
            } finally {
              setTimeout(() => busy--, 1_000);
            }
          })
          .catch((error) => console.error(error));
      }, 100),
    );
  };

  watch(".", { recursive: true }, (_, file) => {
    if (file && ignored.test(file)) return;
    if (!file) {
      // the watch buffer overflowed and events were lost; unless it was our
      // own rebuild writing, restart the front and force a full reload
      if (!busy) schedule("(events lost)", "app", () => startFront("__borgo_unknown__"));
      return;
    }
    const normalized = file.replaceAll("\\", "/");
    if (file.endsWith(".go")) schedule(file, "api", startGo);
    else if (file.endsWith(".scss")) schedule(file, "css", () => swapCss(normalized));
    else if (/\.(tsx?|html)$/.test(file)) {
      schedule(file, "app", () => startFront(normalized));
    }
  });

  process.on("SIGINT", () => {
    goProc?.kill();
    frontProc?.kill();
    process.exit(0);
  });
}
