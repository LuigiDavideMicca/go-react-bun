#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { buildAssets } from "./build";
import { banner, c, fmtMs } from "./colors";
import { dev } from "./dev";
import { serve } from "./server";
import { goBinName, runBorgogen } from "./util";

const command = process.argv[2];

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} kB`;

async function assetLine(path: string, note = "") {
  const file = Bun.file(path);
  if (!(await file.exists())) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const gzip = Bun.gzipSync(bytes).length;
  const label = note ? c.dim(note) : c.dim(`gzip: ${kb(gzip)}`);
  console.log(`  ${c.sage("✓")} ${path.padEnd(40)} ${kb(bytes.length).padStart(9)} ${label}`);
}

switch (command) {
  case "dev": {
    await dev();
    break;
  }

  case "build": {
    const t0 = performance.now();
    console.log(`\n  ${banner("build")}\n`);

    await runBorgogen();
    const assets = await buildAssets();
    const rel = (p: string) => p.replaceAll("\\", "/").replace(/^.*?(public\/assets\/)/, "$1");
    for (const asset of assets.sort((a, b) => (a.kind === b.kind ? b.size - a.size : a.kind === "entry-point" ? -1 : 1))) {
      await assetLine(rel(asset.path), asset.kind === "entry-point" ? "entry (runtime + react)" : "");
    }
    await assetLine("public/assets/style.css");

    const bin = `dist/${goBinName()}`;
    const goBuild = Bun.spawn(["go", "build", "-o", bin, "."], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await goBuild.exited) !== 0) {
      console.error(`  ${c.red("✗")} go build failed`);
      process.exit(1);
    }
    const binSize = Bun.file(bin).size;
    console.log(`  ${c.sage("✓")} ${bin.padEnd(28)} ${kb(binSize).padStart(9)} ${c.dim("go api binary")}`);
    console.log(`\n  done in ${c.bold(fmtMs(performance.now() - t0))}\n`);
    break;
  }

  case "start": {
    const bin = `dist/${goBinName()}`;
    if (!existsSync(bin)) {
      console.error(`  ${c.red("✗")} ${bin} not found - run \`borgo build\` first`);
      process.exit(1);
    }

    const apiProc = Bun.spawn([bin], { stdout: "inherit", stderr: "inherit" });
    process.on("SIGINT", () => {
      apiProc.kill();
      process.exit(0);
    });

    await serve({ dev: false });
    break;
  }

  default: {
    console.log(`\n  ${banner()}\n\n  usage: borgo <dev|build|start>\n`);
    process.exit(command ? 1 : 0);
  }
}
