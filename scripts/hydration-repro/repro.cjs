/**
 * Repeatable test for hydration error #418.
 *
 * Starts the production build already in .next, puts proxy.cjs in front of it,
 * and loads one page many times in a clean headless Chrome. The page is
 * delivered late and in slices, which is the condition the error needs. Exits
 * 1 if any load failed hydration, 2 if the test could not run.
 *
 *   npm run build
 *   node --env-file=<env file with DATABASE_URL> scripts/hydration-repro/repro.cjs [options]
 *
 *   --runs 40          loads to make
 *   --path <path>      page to load, default the Instagram 30 day drill-down
 *   --delay 2000       ms before the body starts
 *   --slice 30000      bytes per slice, 0 for one piece (the control)
 *   --gap 40           ms between slices
 *   --port 3210        next start listens here, the proxy on port + 1
 *
 * PYTHON names a Python with Playwright installed. The default is the
 * collector's virtual environment in the main checkout.
 *
 * Reads the database named by DATABASE_URL and writes nothing. The session
 * secret is made up for the run, and the ingest and cron secrets are removed
 * from the server's environment.
 */
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { startProxy } = require('./proxy.cjs');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at > -1 ? args[at + 1] : fallback;
};
const runs = Number(opt('runs', 40));
const pagePath = opt('path', '/dashboard/posts?period=30&platform=instagram');
const delayMs = Number(opt('delay', 2000));
const sliceBytes = Number(opt('slice', 30000));
const gapMs = Number(opt('gap', 40));
const port = Number(opt('port', 3210));

const root = path.resolve(__dirname, '..', '..');
const python =
  process.env.PYTHON ||
  [
    path.join(root, 'scripts', 'personal-fb', '.venv', 'Scripts', 'python.exe'),
    path.resolve(root, '..', 'qylat-analytics', 'scripts', 'personal-fb', '.venv', 'Scripts', 'python.exe'),
  ].find((p) => fs.existsSync(p));

function fail(message) {
  console.error(`CANNOT RUN: ${message}`);
  process.exit(2);
}

if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set. Pass an env file with node --env-file.');
if (!fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) fail('No production build in .next. Run npm run build first.');
if (!python) fail('No Python with Playwright found. Set PYTHON.');

const session = crypto.randomBytes(24).toString('hex');
const env = { ...process.env, SESSION_SECRET: session, ANALYTICS_PASSWORD: crypto.randomBytes(16).toString('hex') };
delete env.PERSONAL_INGEST_SECRET;
delete env.CRON_SECRET;

const versions = ['next', 'react-dom'].map((p) => `${p} ${require(path.join(root, 'node_modules', p, 'package.json')).version}`);
let bundled = 'unknown';
try {
  const src = fs.readFileSync(path.join(root, 'node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js'), 'utf8');
  bundled = (src.match(/version:\s*"(19[^"]+)"/) || src.match(/"(19\.\d+\.\d+-[a-z]+-[0-9a-f]+-\d+)"/) || [])[1] || 'unknown';
} catch {
  // Left as unknown. It is a label on the report, not part of the test.
}

const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
  cwd: root,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

function stop(code) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F']);
  else server.kill('SIGTERM');
  process.exit(code);
}

function ready(triesLeft) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: 'localhost', port, path: pagePath, headers: { cookie: `analytics_auth=${session}` } },
      (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (triesLeft <= 0) return reject(new Error(`page answered HTTP ${res.statusCode}`));
        setTimeout(() => ready(triesLeft - 1).then(resolve, reject), 1000);
      }
    );
    req.on('error', (e) => {
      if (triesLeft <= 0) return reject(e);
      setTimeout(() => ready(triesLeft - 1).then(resolve, reject), 1000);
    });
  });
}

(async () => {
  try {
    await ready(40);
  } catch (e) {
    console.error(`CANNOT RUN: the build did not serve ${pagePath}: ${e.message}\n${serverLog.slice(-600)}`);
    stop(2);
  }
  await startProxy({ listen: port + 1, target: port, delayMs, sliceBytes, gapMs });

  const how = sliceBytes ? `${sliceBytes} byte slices ${gapMs} ms apart after ${delayMs} ms` : `one piece after ${delayMs} ms`;
  console.log(`${versions.join(', ')}, bundled React ${bundled}`);
  console.log(`${runs} loads of ${pagePath}, body in ${how}`);

  const child = spawn(python, [path.join(__dirname, 'loads.py')], {
    env: { ...process.env, REPRO_BASE: `http://localhost:${port + 1}`, REPRO_PATH: pagePath, REPRO_RUNS: String(runs), REPRO_SESSION: session },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let out = '';
  child.stdout.on('data', (d) => {
    out += d;
    process.stdout.write(String(d).replace(/^RESULT .*$/m, ''));
  });
  child.on('exit', (code) => {
    const line = out.split('\n').find((l) => l.startsWith('RESULT '));
    if (code !== 0 || !line) {
      console.error(`CANNOT RUN: the browser run ended with code ${code} and no result`);
      return stop(2);
    }
    const r = JSON.parse(line.slice(7));
    const usable = r.runs - r.unusable;
    console.log(`\n${r.failed} of ${usable} loads failed hydration${r.unusable ? `, ${r.unusable} could not be judged` : ''}`);
    if (usable === 0) return stop(2);
    stop(r.failed ? 1 : 0);
  });
})();
