// Where things are, relative to this folder, so the tests run from any clone
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

export const TESTS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(TESTS, "..");
export const SITE = join(REPO, "site");
// Everything the tests make (samples, the last commit's site, screenshots, logs) goes here. It is in .gitignore.
export const OUTPUT = join(TESTS, ".output");
export const SAMPLES = process.env.SAMPLES || join(OUTPUT, "samples");
export const SHOTS = process.env.SHOTS || join(OUTPUT, "shots");
mkdirSync(SHOTS, { recursive: true });       // some suites always save a few screenshots here
export const BASE_SITE = join(OUTPUT, "base", "site");

export const LIVE = "http://127.0.0.1:8765/";     // the working copy of site/
export const BASE = "http://127.0.0.1:8766/";     // site/ as in the last commit, for before/after comparisons
