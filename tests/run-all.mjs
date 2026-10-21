// Runs the test suites against a local copy of site/ served with the production security headers.
//   node run-all.mjs                   every suite
//   node run-all.mjs wall security     only these suites
//   node run-all.mjs --shots           save every screenshot to .output/shots (a few are always saved)
// Nothing here talks to AWS: the suites answer every API call with a fake response inside the page.
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { startServer } from "./lib/server.mjs";
import { TESTS, REPO, OUTPUT, SAMPLES, SHOTS, BASE_SITE } from "./lib/paths.mjs";

// In run order: [suite, what it checks]
const SUITES = [
  ["csp", "The page runs under the production CSP and Permissions-Policy"],
  ["flow", "Recording flow, timers, prep time, playback"],
  ["wall", "Wall of Fame: saving, validation of stored entries, playbills"],
  ["trophies", "Trophy shelf"],
  ["stage1-stubs", "Ticket stubs: behaviour, saved choices, no mic, end to end"],
  ["stage1b-ticket", "Topic ticket, curtains and the ticket look"],
  ["stage1b-menu", "Dressed settings menu and topic buttons"],
  ["stage2-nav", "Navigation: signs, bottom bar, Backstage and Wall"],
  ["tap-highlight", "No blue tap highlight on phones"],
  ["stage3-upload", "Upload any recording or video, convert on the device"],
  ["stage4-words", "Your words (the transcript)"],
  ["stage5-review", "Words used as filler, The Nightly Review"],
  ["stage6-run", "Your run so far, Long run trophy"],
  ["backstage-layout", "Backstage as in the mockup"],
  ["backstage-narrow", "One-column Backstage below 990px"],
  ["backstage-column", "Backstage left column and tab focus"],
  ["phone-scroll", "Phone scrolling and the Stage 7 polish"],
  ["security", "Hostile text from outside the page"],
  ["throttle", "Throttling: quiet waiting, retries, a calm busy message"]
];
const SUITE_TIMEOUT = 30 * 60 * 1000;

const args = process.argv.slice(2);
const wanted = args.filter(a => !a.startsWith("--"));
const unknown = wanted.filter(name => !SUITES.some(([s]) => s === name));
if (unknown.length) {
  console.error(`Unknown suite: ${unknown.join(", ")}. Suites: ${SUITES.map(([s]) => s).join(", ")}`);
  process.exit(2);
}
const run = SUITES.filter(([name]) => !wanted.length || wanted.includes(name));
const env = { ...process.env, SAMPLES };
if (args.includes("--shots")) { env.SHOTS = SHOTS; mkdirSync(SHOTS, { recursive: true }); }
const LOGS = join(OUTPUT, "logs");
mkdirSync(LOGS, { recursive: true });

// site/ as in the last commit, for the before/after comparisons (always fresh)
const baseRoot = join(OUTPUT, "base");
rmSync(baseRoot, { recursive: true, force: true });
mkdirSync(baseRoot, { recursive: true });
// Each file comes straight out of git (no tar needed, and the working copy is never touched)
const files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "site"], { cwd: REPO, encoding: "utf8" }).split("\n").filter(Boolean);
for (const file of files) {
  const target = join(baseRoot, ...file.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, execFileSync("git", ["show", `HEAD:${file}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }));
}

let servers;
try {
  servers = await Promise.all([startServer({ port: 8765 }), startServer({ root: BASE_SITE, port: 8766 })]);
} catch (error) {
  console.error(`Couldn't start the test servers on ports 8765 and 8766 (${error.code || error.message}). Is another test run still open?`);
  process.exit(2);
}

// Runs a script, its output going to a log file (and failures to the screen); resolves with the exit code
function node(script, scriptArgs, logName, timeout = SUITE_TIMEOUT) {
  return new Promise(resolve => {
    const log = createWriteStream(join(LOGS, logName));
    const child = spawn(process.execPath, [script, ...scriptArgs], { cwd: TESTS, env });
    let tail = "", passes = 0, fails = 0;
    const read = chunk => {
      log.write(chunk);
      tail += chunk.toString();
      const lines = tail.split(/\r?\n/);
      tail = lines.pop();
      for (const line of lines) {
        if (line.startsWith("PASS")) passes++;
        if (line.startsWith("FAIL")) { fails++; console.log("    " + line.slice(0, 300)); }
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", chunk => { read(chunk); process.stderr.write(chunk); });
    const timer = setTimeout(() => { child.kill(); log.write("\nTIMED OUT\n"); }, timeout);
    child.on("close", code => { clearTimeout(timer); log.end(); resolve({ code: code ?? 1, passes, fails }); });
  });
}

// Sample audio and video files, made once (they are never committed)
const needSamples = run.some(([name]) => name === "stage3-upload");
const marker = join(SAMPLES, "made.txt");
if (needSamples && !existsSync(marker)) {
  console.log("Making the sample audio and video files ...");
  mkdirSync(SAMPLES, { recursive: true });
  const a = await node(join("samples", "make-node.mjs"), [SAMPLES], "make-node.log", 10 * 60 * 1000);
  const b = await node(join("samples", "make-chrome.mjs"), [SAMPLES], "make-chrome.log", 10 * 60 * 1000);
  if (a.code || b.code) {
    console.error("Making the samples failed: see .output/logs/make-node.log and make-chrome.log. Did you run npm install in tests/?");
    servers.forEach(s => s.close());
    process.exit(1);
  }
  writeFileSync(marker, new Date().toISOString());
}

const results = [];
for (const [name, about] of run) {
  console.log(`\n${name}: ${about}`);
  const started = Date.now();
  const r = await node(join("suites", `${name}.mjs`), [], `${name}.log`);
  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  results.push({ name, ...r, minutes });
  console.log(`  ${r.code === 0 ? "passed" : "FAILED"}: ${r.passes} checks passed, ${r.fails} failed (${minutes} min)`);
}
servers.forEach(s => s.close());

const width = Math.max(...results.map(r => r.name.length));
console.log("\nSuite".padEnd(width + 3) + "Result   Passed  Failed");
for (const r of results) console.log(`${r.name.padEnd(width + 2)}${(r.code === 0 ? "pass" : "FAIL").padEnd(9)}${String(r.passes).padStart(6)}  ${String(r.fails).padStart(6)}`);
const total = results.reduce((t, r) => t + r.passes, 0), failed = results.filter(r => r.code !== 0);
console.log(`\n${results.length - failed.length} of ${results.length} suites passed, ${total} checks passed.` + (failed.length ? ` Failed: ${failed.map(r => r.name).join(", ")}. Logs: tests/.output/logs` : ""));
process.exit(failed.length ? 1 : 0);
