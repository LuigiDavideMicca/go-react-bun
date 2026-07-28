import { watch } from "node:fs";
import type { Subprocess } from "bun";

const goBin = ".dev/api" + (process.platform === "win32" ? ".exe" : "");
let goProc: Subprocess | null = null;
let frontProc: Subprocess | null = null;

async function startGo() {
  goProc?.kill();
  await goProc?.exited;

  const build = Bun.spawn(["go", "build", "-o", goBin, "."], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await build.exited) !== 0) {
    console.error("go build failed, waiting for changes...");
    return;
  }
  goProc = Bun.spawn([goBin], { stdout: "inherit", stderr: "inherit" });
}

async function startFront() {
  frontProc?.kill();
  await frontProc?.exited;
  frontProc = Bun.spawn(["bun", "framework/server.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, DEV: "1" },
  });
}

await startGo();
await startFront();

let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(fn: () => Promise<void>) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(fn, 100);
}

const onChange = (file: string | null) => {
  if (!file || file.endsWith("routes.gen.tsx")) return;
  if (file.endsWith(".go")) schedule(startGo);
  else if (/\.(tsx?|scss|html)$/.test(file)) schedule(startFront);
};

for (const dir of ["api", "db", "pages", "framework"]) {
  watch(dir, { recursive: true }, (_, file) => onChange(file));
}
watch(".", (_, file) => onChange(file));

process.on("SIGINT", () => {
  goProc?.kill();
  frontProc?.kill();
  process.exit(0);
});

console.log("dev mode: watching api/, db/, pages/, framework/ and project root");
