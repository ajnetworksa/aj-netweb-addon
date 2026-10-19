// Bundles src/ into one file and copies it into the Dashboard Suite add-on, and builds the shared
// add-on look (src/look/addon-look.js) into every add-on's www/ajnetweb-look.js.
//   npm run build      one-off build
//   npm run watch      rebuild on change
import { build, context } from "esbuild";
import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));
// AJ Netweb licence public key (empty = developer build, licence not enforced). See licensing/README.md.
const pubFile = new URL("../licensing/public_key.txt", import.meta.url);
const pubKey = existsSync(pubFile) ? readFileSync(pubFile, "utf8").trim() : "";
const rootCa = new URL("../licensing/root_ca.pem", import.meta.url);
const enforced = !!pubKey || (existsSync(rootCa) && readFileSync(rootCa, "utf8").includes("BEGIN CERTIFICATE"));
const options = {
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  target: ["chrome90", "safari14", "firefox90"], // older wall-panel WebViews
  outfile: "dist/ajnetweb-ui.js",
  minify: true,
  legalComments: "eof", // keeps the MIT notices of bundled libraries (noble-ed25519, noble-hashes)
  define: { __VERSION__: JSON.stringify(pkg.version), __AJN_PUBKEY__: JSON.stringify(pubKey),
            __AJN_ENFORCED__: JSON.stringify(enforced) },
  banner: { js: `/* AJ Netweb UI ${pkg.version} - https://github.com/ajnetworksa/aj-netweb-addon */` },
  plugins: [{
    name: "copy-to-addon",
    setup(b) {
      b.onEnd((res) => {
        if (res.errors.length) return;
        // The add-on registers this file name as a Lovelace resource; keep it stable.
        copyFileSync("dist/ajnetweb-ui.js", "../ajnetweb_dashboard/www/ajnetweb-card-suite.js");
        console.log(`built dist/ajnetweb-ui.js (${pkg.version}, licence ${enforced ? "enforced" : "not enforced"}) and copied to the add-on`);
      });
    },
  }],
};

// add-on pages: a small classic script (no module), one identical copy per add-on
// (not Remote Access: its page and agent ship together and are changed only on request)
const addons = readdirSync("..").filter((d) => d.startsWith("ajnetweb_") && d !== "ajnetweb_tunnel" && existsSync(`../${d}/www`));
const lookOptions = {
  entryPoints: ["src/look/addon-look.js"],
  bundle: true,
  format: "iife",
  target: ["chrome90", "safari14", "firefox90"],
  outfile: "dist/ajnetweb-look.js",
  minify: true,
  banner: { js: `/* AJ Netweb look - built from ajnetweb-ui/src/look/addon-look.js, do not edit */` },
  plugins: [{
    name: "copy-to-addons",
    setup(b) {
      b.onEnd((res) => {
        if (res.errors.length) return;
        addons.forEach((d) => copyFileSync("dist/ajnetweb-look.js", `../${d}/www/ajnetweb-look.js`));
        console.log(`built dist/ajnetweb-look.js and copied to ${addons.join(", ")}`);
      });
    },
  }],
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  const lookCtx = await context(lookOptions);
  await lookCtx.watch();
} else {
  await build(options);
  await build(lookOptions);
}
