#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { buildAssets } from "./build";
import { dev } from "./dev";
import { serve } from "./server";
import { goBinName } from "./util";

const command = process.argv[2];

switch (command) {
  case "dev": {
    await dev();
    break;
  }

  case "build": {
    await buildAssets();

    const bin = `dist/${goBinName()}`;
    const goBuild = Bun.spawn(["go", "build", "-o", bin, "."], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await goBuild.exited) !== 0) process.exit(1);

    console.log(`client assets in public/assets, api binary at ${bin}`);
    break;
  }

  case "start": {
    const bin = `dist/${goBinName()}`;
    if (!existsSync(bin)) {
      console.error(`${bin} not found - run \`borgo build\` first`);
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
    console.log("usage: borgo <dev|build|start>");
    process.exit(command ? 1 : 0);
  }
}
