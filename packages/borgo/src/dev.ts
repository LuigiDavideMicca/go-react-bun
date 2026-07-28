import { watch } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";
import { c } from "./colors";
import { goBinName } from "./util";

const serverEntry = fileURLToPath(new URL("serve-entry.ts", import.meta.url));
const ignored = /^(node_modules|\.git|\.borgo|public|dist)([\\/]|$)/;

export async function dev() {
  const goBin = `.borgo/${goBinName()}`;
  let goProc: Subprocess | null = null;
  let frontProc: Subprocess | null = null;
  let reload = false;

  const startGo = async () => {
    goProc?.kill();
    await goProc?.exited;

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
  };

  const startFront = async () => {
    frontProc?.kill();
    await frontProc?.exited;
    frontProc = Bun.spawn(["bun", serverEntry], {
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, DEV: "1", ...(reload ? { BORGO_RELOAD: "1" } : {}) },
    });
  };

  await startGo();
  await startFront();
  reload = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue = Promise.resolve();
  const schedule = (file: string, side: string, fn: () => Promise<void>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      console.log(`  ${c.terracotta("↻")} ${file.replaceAll("\\", "/")} ${c.dim(`changed, rebuilding ${side}`)}`);
      queue = queue.then(fn);
    }, 100);
  };

  watch(".", { recursive: true }, (_, file) => {
    if (!file || ignored.test(file)) return;
    if (file.endsWith(".go")) schedule(file, "api", startGo);
    else if (/\.(tsx?|scss|html)$/.test(file)) schedule(file, "app", startFront);
  });

  process.on("SIGINT", () => {
    goProc?.kill();
    frontProc?.kill();
    process.exit(0);
  });
}
