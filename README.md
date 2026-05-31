# Reader Webapp

A personal, clean reading webapp for articles, AI responses, basic Markdown, PDFs, DOCX files, and long text.

The goal is simple: paste or open messy reading material, remove the noise, and read it in a calmer interface with better typography, themes, and local-first privacy.

## Live demo

After GitHub Pages is enabled, the app should be available here:

https://patelakash007.github.io/reader-webapp/

## Features

- Clean reader view for long articles, notes, and AI responses
- Supports pasted text and local document reading
- PDF, DOCX, basic Markdown, and TXT focused workflow
- Many reading themes including paper, dark, Kindle-like, Notion-like, GitHub-like, Dracula, Nord, and more
- Typography presets for comfortable long-form reading
- Text-to-speech support for listening while reading
- Local-first design: files are processed in the browser
- Installable PWA support on supported browsers
- Non-persistent sessions: documents, reading state, and preferences reset on reload
- PDF/DOCX parser libraries are bundled locally
- Mobile-friendly layout for phone reading
- Single-page app split into `index.html`, `style.css`, and `script.js`

## Why this exists

Modern articles and long AI answers can be hard to read because of ads, bad spacing, weak contrast, distracting backgrounds, and messy formatting. Reader Webapp is built as a personal reading space: paste the content, choose a comfortable theme, and read without distractions.

## Project structure

```text
reader-webapp/
├── index.html
├── style.css
├── script.js
├── manifest.webmanifest
├── sw.js
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── maskable-192.png
│   └── maskable-512.png
├── vendor/
│   ├── pdf.min.js
│   ├── pdf.worker.min.js
│   └── mammoth.browser.min.js
├── README.md
├── LICENSE
└── .gitignore
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

## Testing checklist

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
