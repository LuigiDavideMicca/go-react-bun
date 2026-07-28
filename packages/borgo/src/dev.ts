import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";
import { c } from "./colors";
import { goBinName, runBorgogen } from "./util";

const serverEntry = fileURLToPath(new URL("serve-entry.ts", import.meta.url));
const ignored = /^(node_modules|\.git|\.borgo|public|dist)([\\/]|$)|borgo\.gen\.go$/;

export async function dev() {
  const goBin = `.borgo/${goBinName()}`;
  const frontPort = process.env.PORT || "3000";
  let goProc: Subprocess | null = null;
  let frontProc: Subprocess | null = null;
  let reload = false;

  // the front server owns the dev websocket; these endpoints let this
  // process trigger a css hot swap or a full reload in connected browsers
  const notifyFront = (path: string) =>
    fetch(`http://localhost:${frontPort}/__borgo/dev/${path}`, { method: "POST" }).catch(() => {});

  const startGo = async () => {
    goProc?.kill();
    await goProc?.exited;

    await runBorgogen();
    const build = Bun.spawn(["go", "build", "-o", goBin, "."], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await build.exited) !== 0) {
      console.error(`  ${c.red("✗")} go build failed, waiting for changes...`);
      return;
    }
    goProc = Bun.spawn([goBin], {
      stdout: "inherit",
      stderr: "inherit",
      env: reload ? { ...process.env, BORGO_RELOAD: "1" } : process.env,
    });
    if (reload) {
      await Bun.sleep(200);
      await notifyFront("reload");
    }
  };

  // a code change restarts the front server for a clean module graph; the
  // browser keeps its state and hot-applies the change when it reconnects
  const startFront = async (changed?: string) => {
    frontProc?.kill();
    await frontProc?.exited;
    frontProc = Bun.spawn(["bun", serverEntry], {
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

  await startGo();
  await startFront();
  reload = true;

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let queue = Promise.resolve();
  const schedule = (file: string, side: string, fn: () => Promise<void>, log = true) => {
    const timer = timers.get(side);
    if (timer) clearTimeout(timer);
    timers.set(
      side,
      setTimeout(() => {
        if (log) {
          console.log(`  ${c.terracotta("↻")} ${file.replaceAll("\\", "/")} ${c.dim(`changed, rebuilding ${side}`)}`);
        }
        queue = queue.then(fn);
      }, 100),
    );
  };

  watch(".", { recursive: true }, (_, file) => {
    if (!file || ignored.test(file)) return;
    const normalized = file.replaceAll("\\", "/");
    if (file.endsWith(".go")) schedule(file, "api", startGo);
    else if (file.endsWith(".scss")) {
      schedule(file, "css", async () => void (await notifyFront("css")));
    } else if (/\.(tsx?|html)$/.test(file)) {
      schedule(file, "app", () => startFront(normalized));
    }
  });

  process.on("SIGINT", () => {
    goProc?.kill();
    frontProc?.kill();
    process.exit(0);
  });
}
