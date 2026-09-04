# Reader Webapp

A personal, clean reading webapp for articles, AI responses, basic Markdown, PDFs, DOCX files, and long text.

The goal is simple: paste or open messy reading material, remove the noise, and read it in a calmer interface with better typography, themes, and local-first privacy.

## Live demo

After GitHub Pages is enabled, the app should be available here:

https://patelakash007.github.io/reader-webapp/

## Features

- **Multi-Format Document Support**:
  - **Markdown & Plain Text**: Full CommonMark parsing via vendored `marked` 15.0.12 with safe image fallbacks (`[Image: alt]`), secure link rendering (`target="_blank" rel="noopener noreferrer"`), raw HTML escaping, nested lists, and smart heading heuristics for all-caps titles (distinguishing section titles from short acronyms like `NASA`).
  - **In-Context Editor**: Dedicated raw text editor (`#readerEditor`) that preserves exact user formatting, blank lines, and Markdown markup without DOM whitespace loss.
  - **DOCX Extraction**: Client-side text extraction via local Mammoth.js. Note: extracts text content; complex table/word processing layouts are simplified for linear reading.
  - **PDF Extraction**: Best-effort client-side text layer extraction via local PDF.js 4.10.38 ESM bundle (up to 500 pages or 1,000,000 characters). Note: scanned PDFs without OCR text layers contain no extractable text, and complex multi-column flows may reflow.
- **Native Text-to-Speech Engine**:
  - **Synchronized Real-Time Word Highlighting**: Active word highlighting (`.tts-word.active`) across all 20 custom theme presets, with on-demand lazy tokenization to keep initial rendering fast.
  - **Smart Viewport Auto-Scrolling**: Throttled scrolling that keeps narration within a comfortable reading band without jitter.
  - **Click-to-Speak Navigation**: Click any word or sentence in the reader view to instantly jump narration to that position.
  - **Chromium Timeout Mitigation**: Natural sentence and clause chunking targeting ~190 characters to mitigate Chromium's 15-second speech synthesis silent stall.
  - **Dual Boundary Tracking**: Native `SpeechSynthesisUtterance.onboundary` with an automatic 100ms synthetic estimate timer fallback (180 WPM × rate) for speech engines lacking boundary events.
  - **Generation & Concurrency Safety**: Monotonic `speechGeneration` session counter rejects stale asynchronous callbacks; navigation or settings changes safely stop active audio.
  - **Capability-Based Mobile Lifecycle**: Hardware capability detection (touch points, hover, fine pointer) rather than brittle user-agent matching; mobile cancel-on-pause with seamless word-index resume (`restartFromWord`).
  - **Background Audio Leak Prevention**: Tab lifecycle listeners (`visibilitychange`, `pagehide`, `pageshow`) manage hidden tabs cleanly.
  - **Voice Discovery & Persistent Selection**: Asynchronous voice polling, compound deduplication (`name + lang`), locale-aware sorting, and persistence ladder.
  - **Accessible Audio Controls**: Accessible Play, Pause, Resume, Stop, Voice Speed slider with live announcements only on commit, and Voice Selector.
- **20 Theme Presets & Honest Typography**:
  - 10 Light and 10 Dark themes with curated system font stacks (`system-ui` sans-serif, `Charter`/`Georgia` serif, and monospace). All fonts render from local system typography with zero third-party font requests, ensuring strict CSP compliance (`font-src 'self'`) and complete privacy.
  - Interactive reading ruler, margins, line height, and font size adjustments.
- **Table of Contents & Navigation**: Dynamic heading extraction with smooth navigation.
- **100% Local-First & Privacy-Focused**: All file extraction, parsing, and speech synthesis execute purely inside the browser without external network telemetry.
- **Progressive Web App (PWA) Offline Operation**: Standalone installable PWA with Service Worker precaching the complete local application shell and vendor libraries, with same-origin scope-gated navigation and query-parameter normalization for offline launch.

## Project structure

```text
reader-webapp/
|-- .github/
|   `-- workflows/
|       `-- quality-checks.yml
|-- icons/
|   |-- icon-192.png
|   |-- icon-512.png
|   |-- maskable-192.png
|   `-- maskable-512.png
|-- scripts/
|   |-- browser-smoke-utils.js
|   |-- check-syntax.js
|   |-- deep-playwright.js
|   |-- smoke-chromium.js
|   |-- smoke-playwright.js
|   `-- validate-pwa.js
|-- tests/
|   |-- test_reader.js
|   |-- test_tts_controller.js
|   |-- test_empirical_stress.js
|   `-- test_regressions.js
|-- vendor/
|   |-- mammoth.browser.min.js
|   |-- marked.esm.mjs
|   |-- pdf.min.mjs
|   |-- pdf.worker.min.mjs
|   |-- pdf.min.js
|   `-- pdf.worker.min.js
|-- package.json
|-- package-lock.json
|-- index.html
|-- style.css
|-- script.js                 # Stable classic compatibility entry
|-- src/
|   |-- app.mjs               # Initialization and module wiring
|   |-- constants.mjs         # Static configuration and presets
|   |-- context.mjs           # Shared transient application state
|   |-- dom.mjs               # DOM element collection
|   |-- parser.mjs             # Markdown, PDF, and DOCX extraction
|   |-- reader.mjs             # Workload-aware rendering and edit mode
|   |-- settings.mjs           # Themes, presets, and typography
|   |-- storage.mjs            # Transient storage guards
|   |-- tts.mjs                # Speech synthesis and boundary engine
|   |-- ui.mjs                 # Status, dialogs, and UI helpers
|   `-- utils.mjs              # Capability detection and numeric helpers
|-- sw.js
|-- manifest.webmanifest
|-- README.md
|-- LICENSE
`-- .gitignore
```

## How to use

### Option 1: Use from GitHub Pages

Open the live demo link above after GitHub Pages is enabled.

### Option 2: Run locally

Clone the repository:

```bash
git clone git@github.com:patelakash007/reader-webapp.git
cd reader-webapp
```

For the most reliable preview, especially for PDF/DOCX parsing and the local PDF worker, run a local server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

Opening `index.html` directly may work for pasted text, TXT, and Markdown, but browser file restrictions can make PDF/DOCX handling unreliable.

### Install as app

On supported browsers, open Reader Webapp from GitHub Pages or a local server, then use the browser's Install app option. The PWA service worker caches only static app files so the app shell can reload offline after the first visit.

## Testing

Reader Webapp supports two browser-test environments:

- Full browser automation: Node, Playwright or `playwright-core`, and a Chromium-compatible executable are available.
- Minimal browser smoke: Node and a Chromium-compatible executable are available, but Playwright may not be installed.

Playwright and Chromium do not need to be checked into this repository. Browser paths can be supplied by environment variable, and generated smoke-test artifacts are ignored by Git.

### Static checks

Run the JavaScript syntax check:

```bash
npm run test:syntax
```

This validates the classic `script.js` compatibility entry and every production ES module under `src/`. The service worker precaches the complete local module graph so the app remains available offline after installation.

Run the PWA app-shell validation:

```bash
npm run test:pwa
```

### Unit, Regression, and Empirical tests

Run the native test suite covering chunking, word tokenization, speech state machine, mobile lifecycle, and PDF extraction:

```bash
npm run test:unit
```

This runs `tests/test_reader.js`, `tests/test_tts_controller.js`, and `tests/test_regressions.js`, validating the core engine, speech state controller, and bug regressions headless in Node.js.

Run the regression suite specifically:

```bash
npm run test:regressions
```

This validates CommonMark syntax compliance (nested emphasis, spaced asterisks, nested lists, blockquotes, ordered lists), smart headings false positives, safe link/image rendering, edit mode raw text preservation, async race conditions, throttled word scrolling, and capability-based mobile detection.

Run the empirical stress test suite:

```bash
npm run test:empirical
```

This tests large text rendering, chunking throughput, memory behavior, and TTS tokenization stress.

### Full Playwright and Chromium smoke test

Run:

```bash
npm run test:smoke
```

The script starts a local static server on an available loopback port, for example:

```text
http://127.0.0.1:<port>/
```

When Playwright is available, this smoke test:

- verifies the app shell loads and the page title matches Reader Webapp
- captures desktop, reader-flow, and mobile screenshots
- captures console errors and page errors
- pastes sample Markdown into the stable `#pasteArea` field when available
- clicks the stable `#readBtn` control when available
- verifies rendered reader content without relying on brittle visual selectors

If Playwright is available and a browser executable is detected, the script launches Chromium with an explicit `executablePath`. If no executable is detected, `playwright-core` reports how to set a browser path, while the full `playwright` package may use its own installed browser if present.

### Deep Playwright regression test

Run:

```bash
npm run test:deep
```

The deeper Playwright check exercises Markdown sanitization, reload reset behavior, table of contents, settings controls, edit/save, download, `.markdown` upload support, file error states, service-worker offline reload, and mobile settings layout.

### Chromium-only fallback smoke test

Run:

```bash
npm run test:chromium
```

This starts the same dynamic-port local static server and launches an existing Chromium-compatible executable directly. It checks that the URL loads, verifies the app shell marker in dumped HTML, and saves screenshot and HTML evidence.

Chromium-only smoke is intentionally limited: it can check app load, DOM output, and screenshot capture. Playwright smoke is needed for interaction checks, console error capture, page error capture, and mobile viewport coverage.

### Browser executable detection

Both smoke scripts prefer these environment variables, in order:

```text
BROWSER_EXE
PLAYWRIGHT_CHROMIUM_EXECUTABLE
CHROMIUM_EXECUTABLE
```

If none are set, the scripts check common Chromium, Chrome, and Edge install paths for the current operating system. Do not hard-code personal paths in this repo; use an environment variable when automatic detection is not enough.

### Artifacts

Smoke-test screenshots, dumped HTML, and JSON logs are written under:

```text
output/browser-smoke/
```

The following generated paths are ignored:

- `output/`
- `test-results/`
- `playwright-report/`
- `.playwright-cli/`
- smoke-test screenshots, HTML dumps, and JSON logs

### Agent testing contract

Before editing reader UI, parser behavior, PWA behavior, service worker behavior, or file-reading behavior, agents and contributors should run:

```bash
npm test
```

Browser smoke artifacts are generated under `output/browser-smoke/`.

To run the full browser automation path directly:

```bash
npm run test:smoke
```

If full Playwright automation is unavailable but a Chromium-compatible executable exists, run the fallback path manually:

```bash
npm run test:chromium
```

Both browser smoke paths can use these environment variables to point at a Chromium-compatible executable:

```text
BROWSER_EXE
PLAYWRIGHT_CHROMIUM_EXECUTABLE
CHROMIUM_EXECUTABLE
```

### Combined test command

Run:

```bash
npm test
```

This runs JavaScript syntax and import validation across `src/`, `scripts/`, and `tests/`, PWA manifest and app shell integrity checks, production-import unit and regression tests (including `parser.handleFile` format handling), and the empirical stress suite.

**What `npm test` covers:**
- JavaScript syntax and ESM import/export resolution across all codebase files.
- PWA manifest metadata, icons, and service worker shell consistency.
- Headless unit and regression tests (file handling, chunking, sanitization, TTS state machine, settings presets).
- Large document parsing stress tests.

**What `npm test` does NOT cover (requires browser automation):**
- Real browser DOM rendering, layout styling, and CSS visibility states.
- Real user pointer and drag-and-drop interaction events.
- Live Web Speech API synthesis audio playback in browser runtimes.
- Browser-initiated file downloads and live Service Worker lifecycle caching across page reloads.

These browser interactions are verified via Playwright:

```bash
npm run test:smoke
npm run test:deep
```

In CI, both `test:smoke` and `test:deep` run on Ubuntu with Chromium to guarantee browser-level regression coverage before merges. If Playwright is unavailable locally, `npm run test:smoke` reports the skip reason and falls back to the Chromium-only smoke path.

### Manual testing checklist

For manual smoke testing, use `http://localhost:8080/` or the GitHub Pages URL. Service worker and PWA behavior should be tested from localhost or GitHub Pages, not by opening `index.html` directly.

- Paste text into the reader.
- Upload TXT, Markdown, PDF, and DOCX files.
- Try reader controls such as theme, typography, spacing, width, and text-to-speech.
- Install the PWA from a supported browser.
- After the first visit, reload the app while offline and confirm the app shell still opens.
- Confirm documents, pasted text, reading state, and preferences are not persisted after reload.

## Privacy notes

Reader Webapp is designed to keep reading local-first. Documents are opened and processed inside the browser where possible, and PDF/DOCX parser libraries are bundled locally in this repo.

Local-first does not mean zero risk when the app is hosted online, but the app avoids default third-party font requests and processes supported documents in the browser. The app does not persist documents, pasted text, reading state, or preferences in browser storage. PWA offline caching is limited to app shell files such as HTML, CSS, JavaScript, local vendor libraries, the manifest, and icons; uploaded documents and generated downloads are not cached by the app. Avoid pasting sensitive private data into any online-hosted version unless you fully trust the environment and browser session.

## Development workflow

Preferred workflow for changes:

1. Create a new branch for each improvement.
2. Commit the change to that branch.
3. Open a pull request into `main`.
4. Review the diff before merging.

Example:

```bash
git checkout -b feature/better-reading-mode
# edit files
git add index.html style.css script.js README.md .gitignore vendor/
git commit -m "feat: improve reading mode"
git push -u origin feature/better-reading-mode
```

## Roadmap ideas

- Better pasted-article cleanup
- Improved Markdown rendering
- Reading progress polish
- More accessibility checks
- Better mobile toolbar behavior

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for details.
