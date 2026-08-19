# Reader Webapp

A calm, local-first reading webapp for articles, AI responses, TXT, Markdown, PDF, and DOCX files. It runs entirely in the browser and provides a temporary multi-document “reading desk” so several local documents can be opened, compared, and listened to without building a persistent document library.

## Core features

- Clean reader view for long articles, notes, AI responses, and pasted text
- Temporary multi-document session queue for pasted text plus local TXT, Markdown, PDF, and DOCX
- Stable session-only document IDs, display names, source type, safe parsed representation, counts, headings, parse state, and in-memory reading progress
- Active-document TOC with current-section tracking and empty state for documents without headings
- Reading progress tracked as a deliberately coarse normalized scroll ratio plus nearest visible heading/anchor; progress is restored only while the current page session remains alive
- Text-to-speech and auto-scroll synchronized to the active document, with teardown on switching, clearing, leaving the reader, opening another document, and entering focus mode
- Existing reading themes, typography presets, mobile bottom-sheet settings, FAB/close-pill behavior, focus mode, and accessibility state are preserved by keeping the mature reader controller intact and adding the desk as a separate controller
- Installable PWA support with offline app-shell reload
- Vendored PDF.js and Mammoth parser libraries; no third-party document upload or remote parser service

## Temporary session model

The reading desk is intentionally ephemeral. A session lives only in JavaScript memory for the current page lifetime:

```text
Session
├── documents: Map<sessionId, Document>
├── order: sessionId[]
├── activeId: sessionId | null
└── generation: number

Document
├── id: stable session-only identifier
├── displayName: safe UI label with duplicate-name disambiguation
├── sourceType: Pasted text | TXT | Markdown | PDF | DOCX
├── parseStatus: ready / error
├── safe: structured source + parsed blocks + headings + counts + speech text
├── progress: ratio + headingId + timestamp
├── lastVisibleHeading
├── lifecycle
└── cleanup handles
```

No document text, parsed representation, progress, or queue metadata is written to `localStorage`, `sessionStorage`, IndexedDB, URLs, analytics, or remote APIs. Uploaded files are not intercepted by the service worker and are never placed in its cache. Reloading the page, restarting the browser, or using **Clear session** discards the session. Generated downloads are separate browser downloads and are not added to the app cache.

This is local-first, not an absolute privacy guarantee: a document processed in a browser can still be exposed by the host environment, browser extensions, device compromise, screen capture, or other software with access to the browser session. Use a trusted host for sensitive material.

## Document ingestion and safety

Supported extensions are `.txt`, `.md`, `.markdown`, `.pdf`, and `.docx`.

The existing safety limits remain:

- Maximum input file size: 15 MiB
- Maximum extracted text: 1,000,000 characters
- Maximum PDF pages: 500
- Local parser bundles only: `vendor/pdf.min.js`, `vendor/pdf.worker.min.js`, and `vendor/mammoth.browser.min.js`

Each ingestion has a generation token plus an `AbortController`. Starting another ingestion invalidates and cancels the older FileReader/parser task, so a slower parse cannot overwrite a newer session. PDF parsing is checked between pages and destroyed when stale. File reads, parser failures, malformed PDFs/DOCX files, empty files, unsupported formats, and oversized documents produce actionable status messages.

Markdown is rendered from a structured parser rather than trusted HTML. Scripts, event-handler attributes, unsafe links (`javascript:`, `data:`, protocol-relative URLs), and raw HTML are never activated. HTTPS/FTP/mailto and safe root-relative/hash links are rendered as real links; query strings are preserved. Inline code and fenced code are rendered with `textContent`, so markup stays literal.

## Reading progress and navigation

Progress is intentionally approximate. The app records a rounded normalized vertical reading ratio together with the nearest visible heading when one exists. Scroll work is scheduled through `requestAnimationFrame` and the scroll listener is passive; the whole document is not re-rendered during scrolling.

The TOC remains the existing reader TOC and is scoped automatically to the active document because only that document’s safe rendering is in the reader surface. The desk controller adds current-heading state and interception for active-document navigation. Selecting a heading moves the reader to that heading and updates in-memory progress state without writing navigation state to the URL. Documents with no headings keep the existing useful “No headings found in this document” behavior.

## Mobile reading desk

On desktop, the queue appears as a restrained reading-desk rail. On mobile, the queue is exposed inside the existing settings bottom sheet rather than introducing a second toolbar. The existing FAB, close pill, backdrop, scroll lock, focus mode, and collapsible original settings sections remain the controlling mobile state machine.

Queue entries expose document name, source type, word count, parse status, coarse progress, and an explicit Remove action. The queue uses `role="listbox"` / `role="option"` semantics and supports Arrow Up/Down, Arrow Left/Right, Home, and End keyboard navigation.

The mobile queue is intentionally quiet: it shares the current typography, themes, borders, spacing, and PWA identity instead of introducing a dashboard-style surface.

## State transitions

| Event | Lifecycle behavior |
|---|---|
| Open/paste | Create a session-only document from safe parsed content; activate the newly opened document |
| Parsing | Generation token marks the read as current; newer ingestion aborts and invalidates it |
| Active | Render safe representation, track approximate progress, enable existing TOC/TTS through the active desk controller |
| Switch | Save current progress, cancel speech, activate target, restore target progress |
| Remove | Stop speech, run cleanup handles, remove document from in-memory map/order |
| Clear | Invalidate pending reads, cancel speech, drop all documents, return to input view |
| Error | Keep the existing session intact and show an actionable status message for the failed input |
| Reload/restart | JavaScript memory disappears; no session is restored |

## PWA and offline boundary

The service worker caches only the application shell and local parser assets. `session-desk.js` is part of the app shell so the reading-desk behavior also works offline. The worker does not intercept or cache uploaded document data; user files are read from browser memory/file objects only.

The shell cache is versioned and old caches are removed on activation. Canonical navigation is served network-first with the cached shell as offline fallback. Non-shell same-origin requests are not added to the cache.

## Keyboard controls

- **Queue:** Arrow Up/Down or Left/Right to move; Home/End to jump to the first/last document
- **TOC:** Tab/Shift+Tab through the existing dialog controls/headings; Escape safely closes the dialog
- **Focus mode:** Escape exits focus mode; entering focus mode also tears down active desk speech
- Existing browser and native control keyboard behavior is preserved

## Project structure

```text
reader-webapp/
|-- .github/
|   `-- workflows/
|       `-- quality-checks.yml
|-- icons/
|-- scripts/
|   |-- browser-smoke-utils.js
|   |-- deep-playwright.js
|   |-- session-playwright.js
|   |-- smoke-chromium.js
|   |-- smoke-playwright.js
|   `-- validate-pwa.js
|-- vendor/
|   |-- mammoth.browser.min.js
|   |-- pdf.min.js
|   `-- pdf.worker.min.js
|-- package.json
|-- package-lock.json
|-- index.html
|-- style.css
|-- script.js
|-- session-desk.js
|-- sw.js
|-- manifest.webmanifest
|-- README.md
|-- LICENSE
`-- .gitignore
```

## Local development

Run the static server for the most reliable PDF/DOCX and service-worker behavior:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`.

Opening `index.html` directly may work for pasted text and simple TXT/Markdown, but browser file restrictions can make parser and service-worker behavior unreliable.

## Testing

The project has static, PWA, smoke, deep regression, Chromium fallback, and reading-desk session tests.

```bash
npm run test:syntax
npm run test:pwa
npm run test:smoke
npm run test:deep
npm run test:session
npm run test:chromium
npm test
```

`npm test` runs syntax validation, PWA validation, Playwright/Chromium smoke coverage, the existing deep regression contract, and the new reading-desk session regression suite. The Chromium fallback remains available separately when the smoke helper needs an alternate launch path.

The new session suite covers:

- multi-document creation and switching
- duplicate display names
- isolated in-memory progress and restoration
- explicit clear and reload reset
- large-read stale-result rejection
- mixed TXT/Markdown/PDF/DOCX parsing when fixtures are available
- queue keyboard navigation
- active-document TOC behavior
- speech teardown on document switch when browser speech APIs exist
- unsafe Markdown in a second document
- absence of document data in browser storage/cache
- mobile queue behavior at 390×844

PDF/DOCX fixtures are created in temporary system locations and are not committed. If a local environment lacks a facility required for a fixture, the session test records the skip instead of fabricating success.

## Performance and lifecycle notes

The session stores structured text needed by the active reading flow rather than DOM snapshots. Queue updates rebuild only the small queue surface, while scroll updates use `requestAnimationFrame`. Download object URLs are revoked after use. Removed documents have their cleanup hooks invoked and are dropped from the session map so they are no longer retained by queue/listener references. Parser work is invalidated on newer reads so stale results cannot keep ownership of active reader state. The mature reader controller in `script.js` remains the source of existing theme, typography, mobile-sheet, focus-mode, editor, and TTS behavior; `session-desk.js` adds only the multi-document lifecycle and synchronization layer.

## License

MIT. See [`LICENSE`](LICENSE).
