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
  - **Smart Viewport Auto-Scrolling**: Scrolling keeps narration within a comfortable reading band without excessive movement.
  - **Click-to-Speak Navigation**: Click any word in the reader view to start narration from that position.
  - **Chromium Timeout Mitigation**: Natural sentence and clause chunking targeting ~190 characters to mitigate Chromium's long-speech timeout behavior.
  - **Dual Boundary Tracking**: Native `SpeechSynthesisUtterance.onboundary` with a synthetic estimate fallback for speech engines lacking boundary events.
  - **Generation & Concurrency Safety**: Monotonic speech-generation state rejects stale asynchronous callbacks; navigation and rerendering safely stop stale audio.
  - **Capability-Based Mobile Lifecycle**: Mobile cancel-on-pause with word-index resume handling.
  - **Background Audio Leak Prevention**: Tab lifecycle listeners manage hidden tabs cleanly.
  - **Voice Discovery & Selection**: Asynchronous voice polling, deduplication, locale-aware sorting, and sensible default selection.
  - **Accessible Audio Controls**: Play, Pause, Resume, Stop, Voice Speed, and Voice Selector with live announcements.
- **20 Reading Environments**:
  - 10 Light and 10 Dark presets. Each preset has a dedicated typography profile covering font family, size, weight, line height, letter spacing, paragraph rhythm, reading measure, and heading scale in addition to theme colors.
  - Curated system font stacks mean no third-party font requests are required.
  - Presets can be browsed with arrows, dots, keyboard navigation, and guarded horizontal swipe gestures.
- **Distraction-Free Controls**:
  - One primary **Controls** button shows or hides the settings interface.
  - Desktop uses a compact floating settings dock; mobile uses a focused bottom-sheet treatment with a backdrop and focus trap.
  - Focus mode remains available, while the primary Controls button can restore the UI cleanly.
- **Reading Tools**: Interactive ruler, margins, line height, text size, table of contents, download, editing, fullscreen, and optional auto-scroll.
- **Local Persistence**: Reading preferences are stored locally. The most recent text session may also be restored locally on the next visit; the document is not uploaded to a server.
- **100% Local-First & Privacy-Focused**: File extraction, parsing, rendering, and speech synthesis execute in the browser. No application account or remote content-processing endpoint is required.
- **Progressive Web App (PWA) Offline Operation**: Standalone installable PWA with Service Worker precaching of the complete local application shell and vendor libraries.

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
|-- experience.css            # Visual reader experience layer
|-- script.js                 # Stable classic compatibility entry
|-- src/
|   |-- app.mjs               # Initialization and module wiring
|   |-- constants.mjs         # Static configuration and presets
|   |-- context.mjs           # Shared transient application state
|   |-- dom.mjs               # DOM element collection
|   |-- parser.mjs             # Markdown, PDF, and DOCX extraction
|   |-- reader.mjs             # Workload-aware rendering and edit mode
|   |-- settings.mjs           # Themes, presets, and typography controls
|   |-- storage.mjs            # Legacy storage cleanup
|   |-- tts.mjs                # Speech synthesis and boundary engine
|   |-- ui.mjs                 # Status, dialogs, and UI helpers
|   |-- experience.mjs         # Controls, local persistence, preset profiles
|   |-- typography.mjs         # Preset/manual typography composition
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

## Quality gates

The project includes syntax, PWA, unit/regression, empirical stress, and Playwright browser smoke checks. The browser smoke suite also covers the primary Controls affordance and validates that all 10 light and 10 dark presets remain reachable on mobile.
