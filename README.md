# Reader Webapp

A personal, clean reading webapp for articles, AI responses, basic Markdown, PDFs, DOCX files, and long text.

The goal is simple: paste or open messy reading material, remove the noise, and read it in a calmer interface with better typography, themes, and local-first privacy.

## Live demo

After GitHub Pages is enabled, the app should be available here:

https://patelakash007.github.io/reader-webapp/

## Features

- **Multi-Format Document Support**: Seamlessly parses and renders Pasted Text, plain text (`.txt`), Markdown (`.md`, `.markdown`), DOCX (`.docx` via local Mammoth.js), and PDF (`.pdf` via local PDF.js).
- **Native Text-to-Speech Engine**:
  - **Synchronized Real-Time Word Highlighting**: Active word highlighting (`.tts-word.active`) across all 20 custom theme presets.
  - **Smart Viewport Auto-Scrolling**: Keeps narration position comfortably centered in view with tempo-aware jitter prevention at high speeds.
  - **Click-to-Speak Navigation**: Click any word or sentence in the reader view to instantly jump narration to that position.
  - **190-Character Word-Safe Chunking**: Prevents Chromium's 15-second silent audio timeout.
  - **Dual Boundary Tracking**: Uses native `SpeechSynthesisUtterance.onboundary` with an automatic 100ms synthetic estimate timer fallback (180 WPM × rate) for speech engines lacking boundary events.
  - **Generation & Concurrency Safety**: Monotonic `speechGeneration` session counter rejects stale asynchronous callbacks.
  - **Mobile Lifecycle & Android Resilience**: Desktop-only 10-second watchdog keepalive and mobile cancel-on-pause with seamless word-index resume (`restartFromWord`).
  - **Background Audio Leak Prevention**: Tab lifecycle event listeners (`visibilitychange`, `pagehide`, `pageshow`) automatically pause and cleanly manage hidden tabs.
  - **Voice Discovery & Persistent Selection**: Asynchronous voice polling, compound deduplication (`name + lang`), locale-aware sorting, and multi-tier persistence ladder.
  - **Responsive Audio Controls**: Accessible Play, Pause, Resume, Stop, Voice Speed (0.5x–2.5x), and Voice Selector directly in the Listen drawer and floating bottom Audio Player Bar.
- **20 Theme Presets & Typography Engine**: 10 Light and 10 Dark themes, typography sliders (line height, letter spacing, margins), font size presets (S/M/L/XL), and reading ruler guide.
- **Table of Contents & In-Context Editor**: Modal TOC dialog extracted from document headings, distraction-free Focus mode, and in-place Markdown editing with session persistence.
- **100% Local-First & Privacy-Focused**: All file extraction, parsing, and speech synthesis execute purely inside the browser without external network telemetry.
- **Progressive Web App (PWA) Offline Operation**: Standalone installable PWA with Service Worker precaching of all 12 app shell assets and vendor parsers.

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
|   |-- deep-playwright.js
|   |-- smoke-chromium.js
|   |-- smoke-playwright.js
|   `-- validate-pwa.js
|-- tests/
|   `-- test_reader.js
|-- vendor/
|   |-- mammoth.browser.min.js
|   |-- pdf.min.js
|   `-- pdf.worker.min.js
|-- package.json
|-- package-lock.json
|-- index.html
|-- style.css
|-- app.js
|-- reader.js
|-- parser.js
|-- tts.js
|-- settings.js
|-- storage.js
|-- ui.js
|-- utils.js
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

This runs syntax checks across all 8 ES modules (`app.js`, `reader.js`, `parser.js`, `tts.js`, `settings.js`, `storage.js`, `ui.js`, `utils.js`).

Run the PWA app-shell validation:

```bash
npm run test:pwa
```

### Unit and Integration tests

Run the native test suite covering chunking, word tokenization, speech state machine, mobile lifecycle, and PDF extraction:

```bash
npm run test:unit
```

This runs `tests/test_reader.js` and validates 100% of core engine logic headless in Node.js.

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

This runs syntax validation, PWA validation, the Playwright smoke test, and the deep Playwright regression test. If Playwright is not available, `npm run test:smoke` clearly reports the skip reason and falls back to the Chromium-only smoke path.

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
