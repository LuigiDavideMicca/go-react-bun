
import { type BunPlugin } from "bun";

const outDirFe = "public/assets";
const outDirBe = "../be/views/index.tmpl";

const style: BunPlugin = {
    name: 'Sass Loader',
    async setup(build: any) {
        // implementation
        console.log("Running sass Plugin...");

        const sass = await import ('sass');

        // when a .scss file is imported...
        build.onLoad({ filter: /\.scss$/ }, ({ path }: { path: string }) => {
            // read and compile it with the sass compiler
            const contents = sass.compile(path);

            globalThis.Bun.write(`${outDirFe}/style.css`, contents.css);

            console.log("Sass code compiled!")

            // and return the compiled source code as "css"
            return {};
        });
    },
};
async function copy(src: string, dest: string) {
    const file = Bun.file(src);
    await Bun.write(dest, file);
  }
  
  await copy("index.html", `${outDirBe}`)
  .then(() => console.log("Bundling the app..."));
  
  await Bun.build({
    entrypoints: ["_app.tsx"],
    outdir: outDirFe,
    minify: true,
  })
  .then( async () => await Bun.build({
    entrypoints: ["style.scss"],
    outdir: outDirFe,
    minify: true,
    plugins: [style]
  }))
  .then(() => console.log("⚡ Build complete! ⚡"))
  .catch(() => process.exit(1))
  ;