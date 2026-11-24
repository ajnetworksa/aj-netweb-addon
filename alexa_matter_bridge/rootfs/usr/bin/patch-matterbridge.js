#!/usr/bin/env node
/**
 * Build-time compatibility patch for matterbridge-hass.
 *
 * Inside a Home Assistant add-on the documented way to reach Core is the
 * Supervisor proxy: ws://supervisor/core/websocket with SUPERVISOR_TOKEN.
 * The plugin always appends "/api/websocket" to the host, so we teach it that
 * a host ending in "/core" means the Supervisor proxy.
 *
 * Run with --strict (Dockerfile) to fail the build when upstream code changes.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const strict = process.argv.includes('--strict');
const globalRoot = execSync('npm root -g').toString().trim();
const file = path.join(globalRoot, 'matterbridge-hass', 'dist', 'homeAssistant.js');

const MARKER = '/* ajn-supervisor-ws */';
const NEEDLE = "this.wsUrl + '/api/websocket'";
const REPLACEMENT = `${MARKER}(this.wsUrl.endsWith('/core') ? this.wsUrl + '/websocket' : this.wsUrl + '/api/websocket')`;

function fail(msg) {
  console.error(`[patch] ${msg}`);
  if (strict) process.exit(1);
}

if (!fs.existsSync(file)) {
  fail(`not found: ${file}`);
} else {
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes(MARKER)) {
    console.log('[patch] already applied');
  } else {
    const count = src.split(NEEDLE).length - 1;
    if (count === 0) {
      fail(`pattern "${NEEDLE}" not found in ${file} - upstream changed, review the patch`);
    } else {
      src = src.split(NEEDLE).join(REPLACEMENT);
      fs.writeFileSync(file, src);
      console.log(`[patch] supervisor websocket support added (${count} place(s))`);
    }
  }
}
