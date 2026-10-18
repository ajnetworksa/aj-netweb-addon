// Bundles src/ into one file and copies it into the Dashboard Suite add-on.
//   npm run build      one-off build
//   npm run watch      rebuild on change
import { build, context } from "esbuild";
import { copyFileSync, existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
// AJ Netweb licence public key (empty = developer build, licence not enforced). See licensing/README.md.
const pubFile = new URL("../licensing/public_key.txt", import.meta.url);
const pubKey = existsSync(pubFile) ? readFileSync(pubFile, "utf8").trim() : "";
const options = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: ["chrome90", "safari14", "firefox90"], // older wall-panel WebViews
  outfile: "dist/ajnetweb-ui.js",
  minify: true,
  legalComments: "eof", // keeps the MIT notices of bundled libraries (noble-ed25519, noble-hashes)
  define: { __VERSION__: JSON.stringify(pkg.version), __AJN_PUBKEY__: JSON.stringify(pubKey) },
  banner: { js: `/* AJ Netweb UI ${pkg.version} - https://github.com/ajnetworksa/aj-netweb-addon */` },
  plugins: [{
    name: "copy-to-addon",
    setup(b) {
      b.onEnd((res) => {
        if (res.errors.length) return;
        // The add-on registers this file name as a Lovelace resource; keep it stable.
        copyFileSync("dist/ajnetweb-ui.js", "../ajnetweb_dashboard/www/ajnetweb-card-suite.js");
        console.log(`built dist/ajnetweb-ui.js (${pkg.version}, licence ${pubKey ? "enforced" : "not enforced"}) and copied to the add-on`);
      });
    },
  }],
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
