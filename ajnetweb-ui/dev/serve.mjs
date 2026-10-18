// npm run preview  ->  http://localhost:5173
// Bundles dev/preview.js (real cards + strategy) and serves the dev folder with live rebuilds.
import { context } from "esbuild";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const themesPy = new URL("../../ajnetweb_dashboard/themes.py", import.meta.url).pathname;
try {
  const json = execFileSync("python3", ["-c",
    `import json,sys,importlib.util as u;s=u.spec_from_file_location('t',sys.argv[1]);m=u.module_from_spec(s);s.loader.exec_module(m);print(json.dumps({k:dict(v['modes'],__name=v['name']) for k,v in m.THEMES.items()}))`,
    themesPy]).toString();
  writeFileSync(new URL("./themes.json", import.meta.url), json);
} catch (e) {
  console.warn("Could not export themes from themes.py (python3 + pyyaml needed); using existing dev/themes.json");
}

const ctx = await context({
  entryPoints: ["dev/preview.js"], bundle: true, format: "esm", outfile: "dev/preview.bundle.js",
  define: { __VERSION__: '"preview"', __AJN_PUBKEY__: JSON.stringify(process.env.AJN_PUBKEY || "") }, sourcemap: true, logLevel: "info",
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: "dev", port: 5173 });
console.log(`Preview: http://localhost:${port}/?theme=apple_frosted_glass&mode=dark&view=home`);
