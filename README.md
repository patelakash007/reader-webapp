# Reader Webapp

A personal, clean reading webapp for pasted text, TXT, Markdown, PDF, and DOCX documents. It is designed to remove reading noise while keeping processing local-first, offline-capable, and framework-free.

## Live demo

After GitHub Pages is enabled:

https://patelakash007.github.io/reader-webapp/

## Features

- **Local document processing**: TXT/Markdown are parsed directly in the browser; PDF and DOCX parsing use the bundled local PDF.js and Mammoth engines.
- **Markdown reader**: headings H1-H6, nested lists, ordered-list starts, multiline blockquotes, inline code, links, emphasis, escaped punctuation, soft line breaks, images with a privacy-preserving placeholder, and safe malformed-input handling.
- **Text-to-speech**: word highlighting, speech-length mitigation through 190-character word-safe chunks, generation-fenced callbacks, lifecycle handling, voice selection, speed controls, and bounded tokenization for large documents.
- **Reader controls**: themes, typography controls, font-size presets, reading ruler, focus mode, table of contents, download, and in-session editing.
- **PWA**: installable offline app shell with local assets and no runtime CDN dependency.
- **Privacy**: uploaded documents and reading content are not persisted by the application.

### TTS scaling note

Normal-sized documents use `.tts-word` elements for precise word-level click-to-speak and highlighting. Documents over 5,000 words use a bounded text-node index instead of creating thousands of word spans. Large-document highlighting therefore uses a single movable visual marker and does not create one DOM node per word.

The 190-character chunk size is a speech-length mitigation for browser synthesis reliability. It is not a guarantee about a fixed number of seconds of speech because speech duration varies by voice, language, punctuation, browser, and rate.

## Project structure

```text
reader-webapp/
|-- .github/workflows/quality-checks.yml
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
|   |-- validate-pwa.js
|   `-- validate-pwa.ps1
|-- src/
|   |-- app.mjs
|   |-- constants.mjs
|   |-- context.mjs
|   |-- dom.mjs
|   |-- parser.mjs
|   |-- reader.mjs
|   |-- settings.mjs
|   |-- storage.mjs
|   |-- tts.mjs
|   |-- ui.mjs
|   `-- utils.mjs
|-- tests/
|   |-- test_reader.js
|   |-- test_tts_controller.js
|   |-- test_empirical_stress.js
|   `-- test_hardening.js
|-- vendor/
|   |-- mammoth.browser.min.js
|   |-- pdf.min.js
|   `-- pdf.worker.min.js
|-- index.html
|-- style.css
|-- script.js
|-- sw.js
|-- manifest.webmanifest
|-- package.json
|-- package-lock.json
|-- README.md
|-- LICENSE
`-- .gitignore
```

## Run locally

```bash
git clone git@github.com:patelakash007/reader-webapp.git
cd reader-webapp
npm ci
python -m http.server 8080
```

Open `http://localhost:8080/`. A local server is recommended for PDF/DOCX parsing, service-worker behavior, and PWA testing.

## Testing

### Static and native checks

```bash
npm run test:syntax
npm run test:pwa
npm run test:unit
npm run test:empirical
```

`test:unit` covers reader core, PDF extraction, TTS state transitions, multi-chunk progression, boundary handling, and focused hardening regressions. `test:empirical` adds larger inputs and stress-oriented checks.

### Browser checks

```bash
npm run test:smoke
npm run test:deep
npm run test:chromium
```

The browser suites use a dynamic loopback server. Playwright smoke covers shell loading, reader flow, console/page errors, and mobile coverage. Deep Playwright covers interaction-heavy regressions such as Markdown rendering, TOC, settings, editing, downloads, uploads, and offline reload. The Chromium-only path provides a direct executable smoke check.

### Combined validation

```bash
npm run test:all
```

This command runs syntax, PWA, unit, empirical, Playwright smoke, deep browser, and direct Chromium validation. CI uses the same families of checks rather than relying only on static repository hygiene.

## Security model

The app keeps `script-src 'self'`, `object-src 'none'`, same-origin workers, and local vendor assets. Markdown output is escaped before markup is introduced, link destinations are scheme-validated, external images are represented as placeholders instead of being silently fetched, and PDF scripting is disabled during extraction. Uploaded files are bounded by file-size, page-count, and extracted-text limits.

Links opened in a new tab use `noopener noreferrer`. The service worker only handles same-origin canonical app-shell navigations and known local shell assets; unrelated navigations are left to the browser.

## Offline behavior

The service worker precaches the complete application module graph, manifest, icons, and bundled parser engines. It also maintains canonical `/` and `/index.html` navigation fallbacks. Uploaded files, generated downloads, and document content are not added to the cache.

## Editing behavior

Editing is backed by a plain-text `<textarea>` containing the original session text rather than by serializing rendered HTML back into Markdown. This preserves blank lines, indentation, Markdown syntax, code blocks, and trailing whitespace more faithfully. Edits remain in the current page session only.

## Known limitations

Complex multi-column PDF layouts and highly structured DOCX documents can still extract text in an order that differs from the visual layout. Browser speech engines differ in boundary-event support and background-audio policies. The app mitigates those differences but cannot make browser-native speech synthesis fully uniform across platforms.

## Development workflow

Use a feature branch, run the native and browser suites relevant to a change, inspect the final diff, and open a pull request into `main`. Do not add runtime CDN dependencies or weaken the CSP to work around local asset problems.

## License

MIT. See [`LICENSE`](LICENSE).
