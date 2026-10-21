# SpeakReview tests

Browser tests for the site in `site/`. They open the real pages in headless Google Chrome, served on your computer with the same Content-Security-Policy and Permissions-Policy headers that CloudFront adds in production.

The tests never call AWS. Every API and S3 request is answered with a fake response inside the page, so no keys or accounts are needed. This folder is never deployed: the deploy workflow only uploads `site/`.

## What you need (Windows)

1. **Node.js 22 or newer** from https://nodejs.org (the LTS installer is fine).
2. **Google Chrome**, installed in the usual place. If it is somewhere else, set `CHROME` to the full path of `chrome.exe` first, for example in PowerShell:
   `$env:CHROME = "D:\Apps\Chrome\chrome.exe"`
3. **Git**, used to get the last commit's version of the site for the before/after checks.
4. Once, in this folder:

   ```
   cd tests
   npm install
   ```

   This installs one package, `lamejs`, which is only used to make the MP3 test file.

## Run

From the `tests` folder:

| Command | Runs |
|---|---|
| `npm test` | every suite, then a table of results |
| `node run-all.mjs wall` | one suite (any name from the table below) |
| `node run-all.mjs wall security` | several suites |
| `node run-all.mjs --shots` | every suite, saving all screenshots to `.output/shots` (without it, only a few are saved) |

The whole run takes about an hour. Keep the computer awake. Ports 8765 and 8766 must be free: close any other test run first.

Each suite's full output goes to `.output/logs/<suite>.log`. Failures are also printed as they happen. `npm test` exits with code 1 if any check fails.

## What gets made at run time

Everything goes into `tests/.output/`, which git ignores. Nothing in it is ever committed.

- `samples/`: audio and video test files (WAV, FLAC, MP3, WebM, M4A, MP4, MOV, Ogg, Opus, a silent file, a corrupt file, and two large empty files of 150 MB and 210 MB for the size limits). They are made the first time `stage3-upload` runs. To make them again, delete the folder.
- `base/`: `site/` as in the last commit, copied out of git. The before/after checks compare against it, so commit before relying on them.
- `logs/` (each suite's full output), `shots/` (screenshots) and `violations.log` (any CSP violations).

## The suites

| Suite | Checks |
|---|---|
| `csp` | The page runs under the production CSP: no inline code or styles, only allowed addresses |
| `flow` | Recording: mic permission, timers, prep time, playback, sending |
| `wall` | Wall of Fame: what is saved, validation of stored entries, playbills, clearing |
| `trophies` | Trophy shelf: earning, locked rules, storage |
| `stage1-stubs` | The Speaking time and Prep time stubs: opening, choosing, keyboard, saved choices (including bad stored values), no mic, end to end |
| `stage1b-ticket` | Curtains, the topic ticket and the look of the stubs |
| `stage1b-menu` | The dressed settings menu and the topic buttons |
| `stage2-nav` | Arrow signs, the bottom bar, moving between rooms |
| `tap-highlight` | No blue tap highlight on phones |
| `stage3-upload` | Uploading any recording or video, converting it on the device, limits and warnings |
| `stage4-words` | Your words: the transcript, its marks and tabs |
| `stage5-review` | Words used as filler, The Nightly Review |
| `stage6-run` | Your run so far, the Long run trophy |
| `backstage-layout` | Backstage as in the mockup (number row, buttons at the bottom right) |
| `backstage-narrow` | One-column Backstage below 990px |
| `backstage-column` | The Backstage left column scrolls while the buttons stay visible; tab focus |
| `phone-scroll` | Phone heights that don't move when the toolbar slides, scenery under the scene, no overscroll, top fades |
| `security` | Hostile text (HTML, scripts, quotes, very long strings) from the API, storage, typing and file names shows as plain text, runs nothing and keeps the layout |
| `throttle` | Throttling (429): the wait for a result keeps going quietly and checks less often; sending tries again, then shows a calm busy message and keeps the take or file; the daily limit messages are unchanged |

Most suites take an optional part name to run only part of them, for example `node suites/security.mjs wall`. Run a suite directly like this only while `npm test` isn't running, and after starting the two servers yourself:

```
node lib/server.mjs
```

and, in a second window, the last commit's site (after one `npm test` has made `.output/base`):

PowerShell:

```
$env:ROOT = ".output\base\site"; $env:PORT = "8766"; node lib/server.mjs
```

## Notes

- The phone checks use Chrome's phone emulation. Emulation can't slide a real browser toolbar, so a real phone (Chrome and Brave on Android) is still the final check for scrolling.
- Contrast is measured from screenshots and must be at least 4.5:1.
- `lib/cdp.mjs` drives Chrome through the DevTools protocol, with no other packages. `lib/page.mjs` holds the shared helpers (checks, opening a page with the fake API, sample results, contrast).
