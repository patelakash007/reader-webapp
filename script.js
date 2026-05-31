  (function () {
    'use strict';

    // ===== Constants and Startup Cleanup =====
    function cleanupLegacyBrowserStorage() {
      const legacyKeys = [
        'reader_text',
        'reader_scroll',
        'reader_size',
        'reader_mode',
        'reader_preset_index',
        'reader_font',
        'reader_theme',
        'reader_textcolor',
        'reader_smart_headings',
        'reader_remember_document',
        'reader_lineheight',
        'reader_letterspacing',
        'reader_margin',
        'reader_voice_rate',
        'reader_voice_uri',
        'reader_scroll_speed'
      ];

      try {
        const legacyStore = window.localStorage;
        if (!legacyStore) return;
        legacyKeys.forEach(key => legacyStore.removeItem(key));
      } catch (err) {
        console.warn('Unable to clean up legacy reader storage.', err);
      }
    }

    const VALID_SIZES = new Set(['small', 'medium', 'large', 'xl']);
    const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'docx']);
    const MAX_FILE_SIZE = 15 * 1024 * 1024;
    const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
    const MAX_PDF_PAGES = 500;

    const VALID_FONTS = new Set([
      'sans', 'serif', 'minimal', 'bold', 'clean', 'literata', 'merriweather', 'libre', 'atkinson', 'jakarta', 'outfit', 'bebas', 'oswald', 'manrope', 'sora'
    ]);

    const VALID_THEMES = new Set([
      'claude', 'zen', 'stark', 'paper', 'cream', 'notion', 'kindle', 'apple', 'github', 'solarized',
      'slate',
      'rose', 'sand', 'amber', 'newspaper', 'creamy', 'ivory', 'mint', 'peach', 'lavender',
      'dark', 'void', 'carbon', 'midnight', 'obsidian', 'dracula', 'nord', 'catppuccin', 'forest', 'ink', 'deep', 'onyx'
    ]);

    // Dynamic library configurations. Parser bundles are vendored locally.
    const LIBRARIES = {
      pdf: {
        src: 'vendor/pdf.min.js',
        check: () => window.pdfjsLib,
        onLoad: () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
          }
        }
      },
      mammoth: {
        src: 'vendor/mammoth.browser.min.js',
        check: () => window.mammoth
      }
    };

    const loadedLibraries = new Map();

    // Promise-based dynamic loader for local parser bundles.
    function loadLibrary(name) {
      if (loadedLibraries.has(name)) {
        return loadedLibraries.get(name);
      }

      const promise = new Promise((resolve, reject) => {
        const lib = LIBRARIES[name];
        if (!lib) return reject(new Error('Unknown library: ' + name));

        if (lib.check()) {
          if (lib.onLoad) lib.onLoad();
          resolve(lib.check());
          return;
        }

        function createScript() {
          const script = document.createElement('script');
          script.src = lib.src;
          script.onload = () => {
            try {
              if (lib.onLoad) lib.onLoad();
              if (lib.check()) {
                resolve(lib.check());
              } else {
                reject(new Error(`Library ${name} loaded but could not be initialized.`));
              }
            } catch (err) {
              reject(err);
            }
          };
          script.onerror = () => {
            reject(new Error(`Failed to load local parser library ${name} from ${lib.src}. Check that the vendor file is available.`));
          };
          document.head.appendChild(script);
        }

        createScript();
      });

      loadedLibraries.set(name, promise);
      promise.catch(() => loadedLibraries.delete(name));
      return promise;
    }

    const els = {
      inputView: document.getElementById('inputView'),
      readerView: document.getElementById('readerView'),
      readerContent: document.getElementById('readerContent'),
      pasteArea: document.getElementById('pasteArea'),
      readBtn: document.getElementById('readBtn'),
      fileInput: document.getElementById('fileInput'),
      clearBtn: document.getElementById('clearBtn'),
      loader: document.getElementById('loader'),
      loaderText: document.querySelector('.loader-text'),
      toolbar: document.getElementById('toolbar'),
      backBtn: document.getElementById('backBtn'),
      wordCount: document.getElementById('wordCount'),
      focusRestore: document.getElementById('focusRestore'),
      presetTrack: document.getElementById('presetTrack'),
      presetDots: document.getElementById('presetDots'),
      presetWindow: document.getElementById('presetWindow'),
      modeLight: document.getElementById('modeLight'),
      modeDark: document.getElementById('modeDark'),
      focusBtn: document.getElementById('focusBtn'),
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      autoScrollBtn: document.getElementById('autoScrollBtn'),
      ttsBtn: document.getElementById('ttsBtn'),
      downloadBtn: document.getElementById('downloadBtn'),
      editBtn: document.getElementById('editBtn'),
      gestureHint: document.getElementById('gestureHint'),
      gestureHintText: document.getElementById('gestureHintText'),
      arrowLeft: document.getElementById('arrowLeft'),
      arrowRight: document.getElementById('arrowRight'),
      progressBar: document.getElementById('progressBar'),
      statusMessage: document.getElementById('statusMessage'),
      readerStatusMessage: document.getElementById('readerStatusMessage'),
      tocDialog: document.getElementById('tocDialog'),
      closeTocBtn: document.getElementById('closeTocBtn'),
      tocBody: document.getElementById('tocBody'),
      tocBtn: document.getElementById('tocBtn'),
      rulerBtn: document.getElementById('rulerBtn'),
      readingRuler: document.getElementById('readingRuler'),
      settingsBtn: document.getElementById('settingsBtn'),
      settingsDrawer: document.getElementById('settingsDrawer'),
      voiceSelect: document.getElementById('voiceSelect'),
      voiceRateInput: document.getElementById('voiceRateInput'),
      voiceRateVal: document.getElementById('voiceRateVal'),
      scrollSpeedInput: document.getElementById('scrollSpeedInput'),
      scrollSpeedVal: document.getElementById('scrollSpeedVal'),
      lineHeightInput: document.getElementById('lineHeightInput'),
      letterSpacingInput: document.getElementById('letterSpacingInput'),
      marginInput: document.getElementById('marginInput'),
      smartHeadingsInput: document.getElementById('smartHeadingsInput'),
      mobileFab: document.getElementById('mobileFab'),
      sheetBackdrop: document.getElementById('sheetBackdrop'),
      bottomSheetHandle: document.getElementById('bottomSheetHandle'),
      editingBanner: document.getElementById('editingBanner'),
      saveEditBannerBtn: document.getElementById('saveEditBannerBtn')
    };

    const state = {
      currentText: '',
      focusMode: false,
      currentPresetIndex: 0,
      currentMode: 'light',
      currentTextColor: 'default',
      toolbarTimer: null,
      gestureHintTimer: null,
      statusTimer: null,
      dragStartX: 0,
      dragCurrentX: 0,
      dragStartIndex: 0,
      isDraggingCarousel: false,
      carouselWidth: 0,
      gestureStartX: 0,
      gestureStartY: 0,
      gestureStartTime: 0,
      isGesture: false,
      isEditing: false,
      smartHeadings: true,
      wordCountTimer: null
    };

    let isAutoScrolling = false;
    let autoScrollSpeed = 0.04;
    let lastScrollTime = 0;
    let scrollAccumulator = 0;
    
    let isSpeaking = false;
    let ttsQueue = [];
    let ttsUtterance = null;
    let ttsHeartbeatInterval = null;
    let editDebounceTimer = null;
    let lastActiveElement = null;
    let activeRenderId = 0;

    // ===== Status & Loader UI Functions =====
    function updateStatusTarget(target, message, type) {
      if (!target) return;
      const baseClass = target === els.readerStatusMessage ? 'status-message reader-status-message' : 'status-message';
      target.textContent = message || '';
      target.className = message ? `${baseClass} show ${type}` : baseClass;
    }

    function showStatus(message, type = 'info') {
      if (!els.statusMessage && !els.readerStatusMessage) return;
      if (!message) {
        clearStatus();
        return;
      }
      updateStatusTarget(els.statusMessage, message, type);
      updateStatusTarget(els.readerStatusMessage, message, type);
      window.clearTimeout(state.statusTimer);
      state.statusTimer = window.setTimeout(clearStatus, 4500);
    }

    function clearStatus() {
      updateStatusTarget(els.statusMessage, '', 'info');
      updateStatusTarget(els.readerStatusMessage, '', 'info');
    }

    function showLoader(message = 'Loading text...') {
      if (els.loader && els.loaderText) {
        els.loaderText.textContent = message;
        els.loader.classList.add('active');
      }
    }

    function hideLoader() {
      if (els.loader) {
        els.loader.classList.remove('active');
      }
    }

    function formatError(err) {
      return err && err.message ? err.message : 'Unknown error';
    }

    function enforceExtractedTextLimit(text, context = 'document') {
      const value = typeof text === 'string' ? text : '';
      if (value.length > MAX_EXTRACTED_TEXT_CHARS) {
        throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
      }
      return value;
    }

    function clampNumber(value, fallback, min, max) {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(Math.max(parsed, min), max);
    }

    function getElementTarget(target) {
      return target instanceof Element ? target : null;
    }

    // ===== Presets and Custom Typography Colors =====
    const loadedFonts = new Set(['sans', 'serif']);
    const systemSans = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const systemSerif = 'Georgia, "Times New Roman", serif';
    const systemMono = 'ui-monospace, SFMono-Regular, Consolas, monospace';
    const fontMap = {
      serif: { family: systemSerif, weight: 500, url: null },
      sans: { family: systemSans, weight: 600, url: null },
      minimal: { family: systemSans, weight: 700, url: null },
      bold: { family: systemSans, weight: 800, url: null },
      clean: { family: systemSans, weight: 700, url: null },
      literata: { family: systemSerif, weight: 700, url: null },
      merriweather: { family: systemSerif, weight: 700, url: null },
      libre: { family: systemSerif, weight: 700, url: null },
      atkinson: { family: systemSans, weight: 700, url: null },
      jakarta: { family: systemSans, weight: 700, url: null },
      outfit: { family: systemSans, weight: 700, url: null },
      bebas: { family: systemSans, weight: 700, url: null },
      oswald: { family: systemSans, weight: 700, url: null },
      manrope: { family: systemSans, weight: 700, url: null },
      sora: { family: systemSans, weight: 700, url: null },
      mono: { family: systemMono, weight: 600, url: null }
    };

    const lightPresets = [
      { name: 'Claude', font: 'sans', theme: 'claude', color: 'default', desc: 'Clean warm like Claude.ai' },
      { name: 'Zen', font: 'outfit', theme: 'zen', color: 'default', desc: 'Pure minimal white' },
      { name: 'Stark', font: 'sora', theme: 'stark', color: 'high', desc: 'Bold high contrast' },
      { name: 'Book', font: 'literata', theme: 'paper', color: 'warm', desc: 'Long-form book reading' },
      { name: 'Classic', font: 'merriweather', theme: 'cream', color: 'default', desc: 'Traditional print feel' },
      { name: 'Notion', font: 'sans', theme: 'notion', color: 'default', desc: 'Crisp white workspace' },
      { name: 'Kindle', font: 'merriweather', theme: 'kindle', color: 'warm', desc: 'E-ink sepia warmth' },
      { name: 'Apple', font: 'sans', theme: 'apple', color: 'default', desc: 'Clean system aesthetic' },
      { name: 'GitHub', font: 'sans', theme: 'github', color: 'default', desc: 'Developer favourite' },
      { name: 'Solarized', font: 'literata', theme: 'solarized', color: 'default', desc: 'Famous light tone' },
      { name: 'Bold', font: 'bold', theme: 'cream', color: 'high', desc: 'Maximum contrast loud' },
      { name: 'Editor', font: 'serif', theme: 'cream', color: 'default', desc: 'Magazine editorial' },
      { name: 'Minimal', font: 'outfit', theme: 'slate', color: 'cool', desc: 'Modern grey focus' },
      { name: 'Rose', font: 'clean', theme: 'rose', color: 'warm', desc: 'Soft rose light' },
      { name: 'Sand', font: 'clean', theme: 'sand', color: 'warm', desc: 'Desert warmth' },
      { name: 'Amber', font: 'atkinson', theme: 'amber', color: 'high', desc: 'High contrast warm' },
      { name: 'Paper', font: 'atkinson', theme: 'paper', color: 'high', desc: 'Dyslexia friendly' },
      { name: 'Legible', font: 'atkinson', theme: 'slate', color: 'high', desc: 'Max readability' },
      { name: 'Newspaper', font: 'merriweather', theme: 'newspaper', color: 'default', desc: 'Old school print' },
      { name: 'Creamy', font: 'libre', theme: 'creamy', color: 'warm', desc: 'Soft golden cream' },
      { name: 'Ivory', font: 'literata', theme: 'ivory', color: 'default', desc: 'Gentle ivory tone' },
      { name: 'Mint', font: 'jakarta', theme: 'mint', color: 'default', desc: 'Fresh soft green' },
      { name: 'Peach', font: 'manrope', theme: 'peach', color: 'warm', desc: 'Warm peach glow' },
      { name: 'Lavender', font: 'clean', theme: 'lavender', color: 'default', desc: 'Soft purple calm' }
    ];

    const darkPresets = [
      { name: 'Night', font: 'sans', theme: 'dark', color: 'soft', desc: 'Deep black OLED' },
      { name: 'Void', font: 'sora', theme: 'void', color: 'soft', desc: 'Pure black void' },
      { name: 'Carbon', font: 'minimal', theme: 'carbon', color: 'soft', desc: 'Material dark grey' },
      { name: 'Midnight', font: 'libre', theme: 'midnight', color: 'soft', desc: 'Purple dark elegance' },
      { name: 'Obsidian', font: 'sans', theme: 'obsidian', color: 'soft', desc: 'Note app dark' },
      { name: 'Dracula', font: 'minimal', theme: 'dracula', color: 'soft', desc: 'Famous code dark' },
      { name: 'Nord', font: 'jakarta', theme: 'nord', color: 'soft', desc: 'Arctic blue dark' },
      { name: 'Catppuccin', font: 'clean', theme: 'catppuccin', color: 'soft', desc: 'Pastel dark cozy' },
      { name: 'Forest', font: 'jakarta', theme: 'forest', color: 'soft', desc: 'Green night easy' },
      { name: 'Ink', font: 'literata', theme: 'ink', color: 'soft', desc: 'Navy scholarly' },
      { name: 'Deep', font: 'manrope', theme: 'deep', color: 'soft', desc: 'Deep ocean blue' },
      { name: 'Onyx', font: 'oswald', theme: 'onyx', color: 'soft', desc: 'Warm black stone' }
    ];

    const textColorMap = {
      light: { default: null, soft: '#6e6a62', warm: '#78350f', cool: '#1e3a5f', high: '#000000' },
      dark: { default: null, soft: '#b0a898', warm: '#fde68a', cool: '#bfdbfe', high: '#ffffff' }
    };

    function clampIndex(index, length) {
      const parsed = Number.parseInt(index, 10);
      if (!Number.isFinite(parsed)) return 0;
      return Math.min(Math.max(parsed, 0), Math.max(length - 1, 0));
    }

    function getPresets() {
      return state.currentMode === 'dark' ? darkPresets : lightPresets;
    }

    function ensureFontLoaded(fontKey) {
      if (loadedFonts.has(fontKey)) return;
      const cfg = fontMap[fontKey];
      if (!cfg) return;
      loadedFonts.add(fontKey);
    }

    function buildPresetCarousel(selectedIndex = state.currentPresetIndex) {
      const list = getPresets();
      const safeIndex = clampIndex(selectedIndex, list.length);
      state.currentPresetIndex = safeIndex;

      if (els.presetTrack) {
        els.presetTrack.innerHTML = list.map((preset, index) =>
          `<div class="preset-card" data-index="${index}" aria-hidden="${index === safeIndex ? 'false' : 'true'}">
            <div class="preset-name">${escapeHtml(preset.name)}</div>
            <div class="preset-desc">${escapeHtml(preset.desc)}</div>
          </div>`
        ).join('');
      }

      if (els.presetDots) {
        els.presetDots.innerHTML = list.map((_, index) =>
          `<div class="preset-dot ${index === safeIndex ? 'active' : ''}"></div>`
        ).join('');
      }

      setTrackPosition(safeIndex, false);
      updatePresetA11y();
    }

    function setTrackPosition(index, animate) {
      if (!els.presetTrack) return;
      els.presetTrack.classList.toggle('snapping', Boolean(animate));
      els.presetTrack.classList.toggle('dragging', false);
      els.presetTrack.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
    }

    function updateDots() {
      if (!els.presetDots) return;
      els.presetDots.querySelectorAll('.preset-dot').forEach((dot, index) => {
        dot.classList.toggle('active', index === state.currentPresetIndex);
      });
    }

    function updatePresetA11y() {
      if (!els.presetWindow || !els.presetTrack) return;
      const list = getPresets();
      const preset = list[state.currentPresetIndex];
      if (!preset) return;

      els.presetWindow.setAttribute(
        'aria-label',
        `Reading preset carousel. Current preset: ${preset.name}. Use left and right arrow keys to change presets.`
      );
      els.presetTrack.querySelectorAll('.preset-card').forEach((card, index) => {
        card.setAttribute('aria-hidden', index === state.currentPresetIndex ? 'false' : 'true');
      });
    }

    function applyPreset(index, options = {}) {
      const list = getPresets();
      const safeIndex = clampIndex(index, list.length);
      const preset = list[safeIndex];
      if (!preset) return;

      state.currentPresetIndex = safeIndex;
      setFont(preset.font);
      setTheme(preset.theme);
      setTextColor(preset.color);
      setTrackPosition(safeIndex, options.animate !== false);
      updateDots();
      updatePresetA11y();

      if (options.resetTimer !== false) resetToolbarTimer();
    }

    function nextPreset() {
      const list = getPresets();
      state.currentPresetIndex = (state.currentPresetIndex + 1) % list.length;
      applyPreset(state.currentPresetIndex);
      showGestureHint(list[state.currentPresetIndex].name);
    }

    function prevPreset() {
      const list = getPresets();
      state.currentPresetIndex = (state.currentPresetIndex - 1 + list.length) % list.length;
      applyPreset(state.currentPresetIndex);
      showGestureHint(list[state.currentPresetIndex].name);
    }

    function setMode(mode, options = {}) {
      state.currentMode = mode === 'dark' ? 'dark' : 'light';

      if (els.modeLight) els.modeLight.classList.toggle('active', state.currentMode === 'light');
      if (els.modeDark) els.modeDark.classList.toggle('active', state.currentMode === 'dark');
      if (els.modeLight) els.modeLight.setAttribute('aria-pressed', state.currentMode === 'light' ? 'true' : 'false');
      if (els.modeDark) els.modeDark.setAttribute('aria-pressed', state.currentMode === 'dark' ? 'true' : 'false');

      const selectedIndex = options.presetIndex === undefined ? 0 : options.presetIndex;
      buildPresetCarousel(selectedIndex);
      applyPreset(state.currentPresetIndex, {
        animate: false,
        resetTimer: options.resetTimer
      });
    }

    function setFont(font) {
      if (!VALID_FONTS.has(font)) font = 'sans';
      const cfg = fontMap[font];
      if (!cfg) return;

      ensureFontLoaded(font);
      document.documentElement.style.setProperty('--body-font', cfg.family);
      document.documentElement.style.setProperty('--heading-weight', cfg.weight);
    }

    function setTheme(theme) {
      if (!VALID_THEMES.has(theme)) theme = 'claude';
      Array.from(document.body.classList)
        .filter(className => className.startsWith('theme-'))
        .forEach(className => document.body.classList.remove(className));
      document.body.classList.add(`theme-${theme}`);
    }

    function setTextColor(color) {
      state.currentTextColor = color || 'default';
      applyTextColor(state.currentTextColor);
    }

    function applyTextColor(color) {
      if (!els.readerContent) return;
      const modeColors = textColorMap[state.currentMode] || textColorMap.light;
      const val = modeColors[color] || '';
      if (val) {
        els.readerContent.style.setProperty('--reader-text-color', val);
      } else {
        els.readerContent.style.removeProperty('--reader-text-color');
      }
    }

    function setSize(size) {
      if (!els.readerContent) return;
      const nextSize = VALID_SIZES.has(size) ? size : 'medium';
      els.readerContent.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
      els.readerContent.classList.add(`fs-${nextSize}`);

      document.querySelectorAll('[data-size]').forEach(button => {
        const active = button.getAttribute('data-size') === nextSize;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });

    }

    // ===== Core Sanitization & Markdown Parser =====

    /**
     * Security Escaper: Converts raw user input into safe HTML-encoded text.
     * Guaranteed to prevent initial rendering of user-supplied scripts or tags.
     */
    function escapeHtml(text) {
      if (typeof text !== 'string') return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    }

    /**
     * Safe Inline Tokenizer: Compiles safe basic markdown inline syntax from escaped text.
     * Prevents script injection by validating schemes and encoding link targets.
     */
    function parseInline(escapedText) {
      if (!escapedText) return '';
      return escapedText
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\b_([^_]+)_\b/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
          const cleanUrl = url.trim();
          
          // Strict blocklist for malicious URL schemes
          const unsafeSchemeRegex = /^(javascript|data|vbscript|file|blob):/i;
          const safeSchemeRegex = /^(https?|ftp|mailto):/i;
          
          const isSafe = (safeSchemeRegex.test(cleanUrl) || cleanUrl.startsWith('/') || cleanUrl.startsWith('#')) && !unsafeSchemeRegex.test(cleanUrl);
          
          // External links explicitly carry security rel rules and URI-encoded components
          return isSafe 
            ? `<a href="${encodeURI(cleanUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>` 
            : text;
        });
    }

    // High performance asynchronous chunked parser. Prevents layout thrashing on huge documents.
    function renderTextAsync(text, onComplete) {
      if (!els.readerContent) return;
      const renderId = ++activeRenderId;
      showLoader('Preparing reader...');
      els.readerContent.textContent = '';

      setTimeout(() => {
        if (renderId !== activeRenderId) return;
        const lines = text.split('\n');
        const htmlParts = [];
        let index = 0;
        let inList = false;
        let listType = null;
        let listBuffer = '';
        let wasPreviousLineEmpty = true;
        let inCodeBlock = false;
        let codeBuffer = '';

        function pushHtml(html) {
          htmlParts.push(html);
        }

        function flushParts() {
          if (renderId !== activeRenderId || !htmlParts.length || !els.readerContent) return;
          els.readerContent.insertAdjacentHTML('beforeend', htmlParts.join(''));
          htmlParts.length = 0;
        }

        function flushList() {
          if (!inList) return;
          pushHtml(listType === 'ul' ? `<ul>${listBuffer}</ul>` : `<ol>${listBuffer}</ol>`);
          inList = false;
          listType = null;
          listBuffer = '';
        }

        // Standard parser block layout processor
        function processLine(rawLine) {
          const line = rawLine.trimEnd();
          const trimmed = line.trim();

          if (trimmed.startsWith('```')) {
            if (inCodeBlock) {
              flushList();
              // Code content is completely HTML-escaped safely
              pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
              inCodeBlock = false;
              codeBuffer = '';
            } else {
              flushList();
              inCodeBlock = true;
            }
            wasPreviousLineEmpty = false;
            return;
          }

          if (inCodeBlock) {
            codeBuffer += rawLine + '\n';
            return;
          }

          if (trimmed === '') {
            flushList();
            wasPreviousLineEmpty = true;
            return;
          }

          if (trimmed === '---' || trimmed === '***') {
            flushList();
            pushHtml('<hr>');
            wasPreviousLineEmpty = false;
            return;
          }

          // Structured Markdown Heading levels h1/h2/h3
          const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
          if (headingMatch) {
            flushList();
            const level = Math.min(headingMatch[1].length, 3); // Support h1, h2, or h3 levels
            const headingText = headingMatch[2];
            pushHtml(`<h${level} id="heading-${index}">${parseInline(escapeHtml(headingText))}</h${level}>`);
            wasPreviousLineEmpty = false;
            return;
          }

          if (state.smartHeadings && wasPreviousLineEmpty && /^[A-Z][A-Z0-9\s]{2,40}[A-Z0-9]$/.test(trimmed) && trimmed.length < 50) {
            flushList();
            pushHtml(`<h2 id="heading-${index}">${escapeHtml(trimmed)}</h2>`);
            wasPreviousLineEmpty = false;
            return;
          }

          if (/^[-\u2022\*]\s+/.test(trimmed)) {
            if (!inList || listType !== 'ul') flushList();
            inList = true;
            listType = 'ul';
            listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^[-\u2022\*]\s+/, '')))}</li>`;
            wasPreviousLineEmpty = false;
            return;
          }

          if (/^\d+[.)]\s+/.test(trimmed)) {
            if (!inList || listType !== 'ol') flushList();
            inList = true;
            listType = 'ol';
            listBuffer += `<li>${parseInline(escapeHtml(trimmed.replace(/^\d+[.)]\s+/, '')))}</li>`;
            wasPreviousLineEmpty = false;
            return;
          }

          if (trimmed.startsWith('> ')) {
            flushList();
            pushHtml(`<blockquote>${parseInline(escapeHtml(trimmed.substring(2)))}</blockquote>`);
            wasPreviousLineEmpty = false;
            return;
          }

          flushList();
          pushHtml(`<p>${parseInline(escapeHtml(line))}</p>`);
          wasPreviousLineEmpty = false;
        }

        // Dynamic yielding block iterator using requestAnimationFrame
        function processChunk() {
          if (renderId !== activeRenderId) return;
          try {
            const chunkEnd = Math.min(index + 500, lines.length);
            for (; index < chunkEnd; index++) {
              if (renderId !== activeRenderId) return;
              processLine(lines[index]);
            }

            flushParts();
            if (renderId !== activeRenderId) return;

            if (index < lines.length) {
              window.requestAnimationFrame(processChunk);
              return;
            }

            flushList();
            if (inCodeBlock) {
              pushHtml(`<pre><code>${escapeHtml(codeBuffer.trimEnd())}</code></pre>`);
            }
            flushParts();
            if (renderId !== activeRenderId) return;
            applyTextColor(state.currentTextColor);
            hideLoader();
            if (onComplete) onComplete();
          } catch (err) {
            if (renderId !== activeRenderId) return;
            hideLoader();
            showStatus(`Could not render this text safely: ${formatError(err)}`, 'error');
          }
        }

        processChunk();
      }, 50);
    }

    function updateWordCount() {
      if (!els.readerContent || !els.wordCount) return;
      const text = els.readerContent.textContent || '';
      const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
      const minutes = Math.ceil(words / 238);
      const timeString = words < 238 ? '< 1 min read' : `~${minutes} min read`;
      els.wordCount.textContent = `${words.toLocaleString()} words \u00b7 ${timeString}`;
    }

    function scheduleWordCountUpdate() {
      window.clearTimeout(state.wordCountTimer);
      state.wordCountTimer = window.setTimeout(updateWordCount, 0);
    }

    // ===== Features (Ruler, AutoScroll, Fullscreen, Download, TOC) =====
    let isRulerActive = false;

    function toggleRuler() {
      if (!els.rulerBtn || !els.readingRuler) return;
      isRulerActive = !isRulerActive;
      els.rulerBtn.classList.toggle('active', isRulerActive);
      els.rulerBtn.setAttribute('aria-pressed', isRulerActive ? 'true' : 'false');
      
      if (isRulerActive) {
        els.readingRuler.style.display = 'block';
        els.rulerBtn.setAttribute('aria-label', 'Disable Reading Ruler');
        els.rulerBtn.setAttribute('title', 'Disable Reading Ruler');
        showStatus('Reading ruler guide activated.', 'success');
      } else {
        els.readingRuler.style.display = 'none';
        els.rulerBtn.setAttribute('aria-label', 'Enable Reading Ruler');
        els.rulerBtn.setAttribute('title', 'Enable Reading Ruler');
        showStatus('Reading ruler guide deactivated.', 'info');
      }
    }

    function updateRulerPosition(e) {
      if (!isRulerActive || !els.readingRuler || !els.readerContent) return;
      const target = getElementTarget(e.target);
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      if (target && els.readerContent.contains(target) && 
          (target.tagName === 'P' || target.tagName === 'LI' || 
           target.tagName === 'H1' || target.tagName === 'H2' || target.tagName === 'H3' || target.tagName === 'BLOCKQUOTE' || 
           target.closest('p, li, h1, h2, h3, blockquote'))) {
        const textContainer = target.closest('p, li, h1, h2, h3, blockquote') || target;
        const rect = textContainer.getBoundingClientRect();
        const top = rect.top + scrollTop;
        els.readingRuler.style.height = `${rect.height + 4}px`;
        els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
      } else if (e.pageY) {
        const y = e.pageY - 14;
        els.readingRuler.style.height = `28px`;
        els.readingRuler.style.transform = `translate3d(0, ${y}px, 0)`;
      }
    }

    function autoScrollLoop(timestamp) {
      if (!isAutoScrolling) return;
      if (!lastScrollTime) lastScrollTime = timestamp;
      const deltaTime = timestamp - lastScrollTime;
      lastScrollTime = timestamp;

      scrollAccumulator += deltaTime * autoScrollSpeed;
      if (scrollAccumulator >= 1) {
         const pixelsToScroll = Math.floor(scrollAccumulator);
         window.scrollBy(0, pixelsToScroll);
         scrollAccumulator -= pixelsToScroll;
      }

      const distanceToBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (distanceToBottom < 1) {
        toggleAutoScroll();
      } else {
        requestAnimationFrame(autoScrollLoop);
      }
    }

    function toggleAutoScroll() {
      if (!els.autoScrollBtn) return;
      isAutoScrolling = !isAutoScrolling;
      if (isAutoScrolling) {
        els.autoScrollBtn.classList.add('active');
        els.autoScrollBtn.innerHTML = '&#x23F8;'; // Pause icon
        els.autoScrollBtn.setAttribute('aria-pressed', 'true');
        els.autoScrollBtn.setAttribute('aria-label', 'Stop Auto Scroll');
        els.autoScrollBtn.setAttribute('title', 'Stop Auto Scroll');
        lastScrollTime = 0;
        scrollAccumulator = 0;
        requestAnimationFrame(autoScrollLoop);
        announceLive('Auto-scroll started.');
      } else {
        els.autoScrollBtn.classList.remove('active');
        els.autoScrollBtn.innerHTML = '&#x25B6;'; // Play icon
        els.autoScrollBtn.setAttribute('aria-pressed', 'false');
        els.autoScrollBtn.setAttribute('aria-label', 'Start Auto Scroll');
        els.autoScrollBtn.setAttribute('title', 'Start Auto Scroll');
        announceLive('Auto-scroll stopped.');
      }
    }

    // TTS Chromium Bug fixes & keepaliveheartbeat loop
    function startTTSHeartbeat() {
      clearTTSHeartbeat();
      ttsHeartbeatInterval = window.setInterval(() => {
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000); // Trigger heartbeat every 10s to keep Chrome process awake
    }

    function clearTTSHeartbeat() {
      if (ttsHeartbeatInterval) {
        window.clearInterval(ttsHeartbeatInterval);
        ttsHeartbeatInterval = null;
      }
    }

    function populateVoices() {
      if (!('speechSynthesis' in window) || !els.voiceSelect) return;
      const select = els.voiceSelect;
      const voices = window.speechSynthesis.getVoices();
      const currentSelection = select.value;
      select.innerHTML = '';

      const sortedVoices = [...voices].sort((a, b) => {
        const langA = a.lang.toLowerCase();
        const langB = b.lang.toLowerCase();
        if (langA < langB) return -1;
        if (langA > langB) return 1;
        return a.name.localeCompare(b.name);
      });

      if (sortedVoices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'System Default';
        select.appendChild(opt);
        return;
      }

      sortedVoices.forEach(voice => {
        const opt = document.createElement('option');
        opt.value = voice.voiceURI;
        opt.textContent = `${voice.name} (${voice.lang})`;
        if (voice.default) {
          opt.textContent += ' [Default]';
        }
        select.appendChild(opt);
      });

      if (currentSelection && sortedVoices.some(v => v.voiceURI === currentSelection)) {
        select.value = currentSelection;
      } else {
        const defaultVoice = sortedVoices.find(v => v.default) || sortedVoices.find(v => v.lang.startsWith('en'));
        if (defaultVoice) {
          select.value = defaultVoice.voiceURI;
        }
      }
    }

    function playNextTTS() {
      if (!isSpeaking || ttsQueue.length === 0) {
         stopTTS();
         return;
      }
      
      const sentence = ttsQueue.shift();
      ttsUtterance = new SpeechSynthesisUtterance(sentence);
      
      const rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : '1.0', 1.0, 0.5, 2.5);
      ttsUtterance.rate = rate;

      if (els.voiceSelect && els.voiceSelect.value) {
        const voices = window.speechSynthesis.getVoices();
        const selectedVoice = voices.find(v => v.voiceURI === els.voiceSelect.value);
        if (selectedVoice) {
          ttsUtterance.voice = selectedVoice;
        }
      }

      ttsUtterance.onend = () => { playNextTTS(); };
      ttsUtterance.onerror = (e) => {
         console.error('TTS error', e);
         playNextTTS();
      };
      
      window.speechSynthesis.speak(ttsUtterance);
      startTTSHeartbeat();
    }

    function stopTTS() {
       isSpeaking = false;
       ttsQueue = [];
       clearTTSHeartbeat();
       if ('speechSynthesis' in window) window.speechSynthesis.cancel();
       if (els.ttsBtn) {
         els.ttsBtn.classList.remove('active');
         els.ttsBtn.innerHTML = '&#x1F50A;'; // Sound icon
         els.ttsBtn.setAttribute('aria-pressed', 'false');
         els.ttsBtn.setAttribute('aria-label', 'Start Read Aloud');
         els.ttsBtn.setAttribute('title', 'Start Read Aloud');
       }
       announceLive('Text-to-speech stopped.');
    }

    function toggleTTS() {
       if (!('speechSynthesis' in window)) {
         showStatus('Text-to-speech is not supported in your browser.', 'error');
         return;
       }
       if (isSpeaking) {
         stopTTS();
       } else {
         if (!els.readerContent) return;
         let paragraphs = els.readerContent.querySelectorAll('p, h1, h2, h3, li, blockquote');
         ttsQueue = [];
         let foundStart = false;
         const offset = (els.toolbar ? els.toolbar.offsetHeight : 0) + 20;

         function addSentencesToQueue(text) {
           const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
           if (sentences) {
             sentences.forEach(s => {
               if (s.trim()) ttsQueue.push(s.trim());
             });
           }
         }

         for (let p of paragraphs) {
            const rect = p.getBoundingClientRect();
            if (!foundStart && rect.top >= offset) {
               foundStart = true;
            }
            if (foundStart && p.innerText.trim()) {
               addSentencesToQueue(p.innerText.trim());
            }
         }
         
         if (ttsQueue.length === 0) {
            paragraphs.forEach(p => { 
              if(p.innerText.trim()) addSentencesToQueue(p.innerText.trim());
            });
         }

         if (ttsQueue.length > 0) {
           isSpeaking = true;
           if (els.ttsBtn) {
             els.ttsBtn.classList.add('active');
             els.ttsBtn.innerHTML = '&#x23F9;'; // Stop icon
             els.ttsBtn.setAttribute('aria-pressed', 'true');
             els.ttsBtn.setAttribute('aria-label', 'Stop Read Aloud');
             els.ttsBtn.setAttribute('title', 'Stop Read Aloud');
           }
           window.speechSynthesis.cancel();
           announceLive('Text-to-speech started.');
           playNextTTS();
         } else {
           showStatus('No text content available to read.', 'info');
         }
       }
    }

    function toggleFullscreen() {
      try {
        if (!getFullscreenElement()) {
          const requestFullscreen = document.documentElement.requestFullscreen ||
            document.documentElement.webkitRequestFullscreen ||
            document.documentElement.msRequestFullscreen;
          if (!requestFullscreen) {
            showStatus('Fullscreen mode is not supported on this device.', 'error');
            return;
          }
          handleFullscreenPromise(requestFullscreen.call(document.documentElement));
        } else {
          const exitFullscreen = document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.msExitFullscreen;
          if (!exitFullscreen) {
            showStatus('Fullscreen exit is not supported on this device.', 'error');
            return;
          }
          handleFullscreenPromise(exitFullscreen.call(document));
        }
      } catch (err) {
         showStatus('Fullscreen mode not permitted on this device.', 'error');
      }
    }

    function getFullscreenElement() {
      return document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement ||
        null;
    }

    function handleFullscreenPromise(result) {
      if (result && typeof result.catch === 'function') {
        result.catch(() => showStatus('Fullscreen mode not permitted on this device.', 'error'));
      }
    }

    function updateFullscreenButton() {
      if (els.fullscreenBtn) {
        const isFullscreen = Boolean(getFullscreenElement());
        els.fullscreenBtn.classList.toggle('active', isFullscreen);
        els.fullscreenBtn.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
        els.fullscreenBtn.setAttribute('aria-label', isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen');
        els.fullscreenBtn.setAttribute('title', isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen');
      }
    }

    function downloadText() {
       if (!state.currentText) {
         showStatus('No text content to download.', 'error');
         return;
       }
       try {
         const blob = new Blob([state.currentText], { type: 'text/plain;charset=utf-8' });
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = 'Reader_Export.txt';
         document.body.appendChild(a);
         a.click();
         document.body.removeChild(a);
         URL.revokeObjectURL(url);
         showStatus("File downloaded successfully.", "success");
       } catch (err) {
         showStatus('Download failed on this device.', 'error');
       }
    }

    function setupFocusTrap(dialog) {
      if (!dialog) return;
      dialog.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const focusableElements = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstFocusable) {
            e.preventDefault();
            lastFocusable.focus();
          }
        } else {
          if (document.activeElement === lastFocusable) {
            e.preventDefault();
            firstFocusable.focus();
          }
        }
      });
    }

    function populateAndShowTOC() {
       if (!els.readerContent || !els.tocDialog || !els.tocBody) return;
       const headings = els.readerContent.querySelectorAll('h1, h2, h3');
       if (headings.length === 0) {
         showStatus("No headings found in this document.", "info");
         return;
       }
       
       lastActiveElement = document.activeElement;
       els.tocBody.innerHTML = '';

       headings.forEach((h) => {
          if (!h.id) h.id = `heading-${Math.random().toString(36).substr(2, 9)}`;
          const a = document.createElement('a');
          a.className = 'toc-item';
          a.textContent = h.textContent;
          a.href = `#${h.id}`;
          a.addEventListener('click', (e) => {
             e.preventDefault();
             h.scrollIntoView({ behavior: 'smooth', block: 'start' });
             els.tocDialog.close();
          });
          els.tocBody.appendChild(a);
       });

       els.tocDialog.showModal();
       
       setTimeout(() => {
         if (els.closeTocBtn) els.closeTocBtn.focus();
       }, 50);
    }

    // ===== File Processing Pipeline =====
    function getExtension(fileName) {
      const dot = fileName.lastIndexOf('.');
      return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
    }

    function readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result || '');
        reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
        reader.onabort = () => reject(new Error('The file read was cancelled.'));
        reader.readAsText(file);
      });
    }

    function readFileAsArrayBuffer(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(event.target.result);
        reader.onerror = () => reject(reader.error || new Error('The file could not be read.'));
        reader.onabort = () => reject(new Error('The file read was cancelled.'));
        reader.readAsArrayBuffer(file);
      });
    }

    function extractPdfPageText(items) {
      let text = '';
      let lastY = null;

      items.forEach(item => {
        const currentY = item.transform && typeof item.transform[5] === 'number' ? item.transform[5] : null;
        const value = item.str || '';

        if (lastY !== null && currentY !== null) {
          const diff = Math.abs(lastY - currentY);
          const height = Math.abs(item.height || 10);
          if (diff > height * 1.2) text += '\n\n';
          else if (diff > 2) text += ' ';
        }

        text += value;
        if (currentY !== null) lastY = currentY;
      });

      return text;
    }

    async function extractPdfText(arrayBuffer) {
      showLoader('Loading PDF worker module...');
      const pdfLib = await loadLibrary('pdf');
      if (!pdfLib) {
        throw new Error('PDF processing library could not be loaded. Try Markdown or TXT documents instead.');
      }

      const typedArray = new Uint8Array(arrayBuffer);
      const pdf = await pdfLib.getDocument({ data: typedArray }).promise;
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new Error(`This PDF has ${pdf.numPages} pages. Limit is ${MAX_PDF_PAGES} pages for browser processing.`);
      }
      const pages = [];
      let totalTextLength = 0;

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        showLoader(`Reading page ${pageNumber} of ${pdf.numPages}...`);
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = extractPdfPageText(content.items);
        totalTextLength += pageText.length;
        if (totalTextLength > MAX_EXTRACTED_TEXT_CHARS) {
          throw new Error(`This PDF contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
        }
        pages.push(pageText);
      }

      return pages.join('\n\n').trim();
    }

    async function extractDocxText(arrayBuffer) {
      showLoader('Loading DOCX parser module...');
      let mammothLib;
      try {
        mammothLib = await loadLibrary('mammoth');
      } catch (err) {
        throw new Error(`DOCX parser library failed to load: ${formatError(err)} Try reloading the app or exporting this file as TXT/Markdown.`);
      }
      if (!mammothLib) {
        throw new Error('DOCX parser library is unavailable. Try reloading the app or exporting this file as TXT/Markdown.');
      }

      const result = await mammothLib.extractRawText({ arrayBuffer });
      return enforceExtractedTextLimit((result.value || '').trim(), 'DOCX');
    }

    async function readSelectedFile(file, extension) {
      if (extension === 'txt' || extension === 'md') {
        showLoader('Reading text file...');
        return enforceExtractedTextLimit(await readFileAsText(file), 'text file');
      }

      if (extension === 'pdf') {
        showLoader('Parsing PDF document...');
        return extractPdfText(await readFileAsArrayBuffer(file));
      }

      if (extension === 'docx') {
        showLoader('Parsing DOCX document...');
        return extractDocxText(await readFileAsArrayBuffer(file));
      }

      throw new Error('Unsupported file extension.');
    }

    async function handleFile(event) {
      const target = event && event.target ? event.target : null;
      const file = target && target.files && target.files[0];
      if (!file) return;

      const extension = getExtension(file.name);
      clearStatus();

      // Production guard: prevent out-of-bounds file size crashes before parsing.
      if (file.size > MAX_FILE_SIZE) {
        showStatus(`File "${file.name}" is too large (${(file.size / (1024*1024)).toFixed(1)}MB). Limit is 15MB.`, 'error');
        if (target && 'value' in target) target.value = '';
        return;
      }

      if (file.size === 0) {
        showStatus(`File "${file.name}" is empty.`, 'error');
        if (target && 'value' in target) target.value = '';
        return;
      }

      try {
        if (!SUPPORTED_EXTENSIONS.has(extension)) {
          throw new Error('Unsupported format. Please upload TXT, Markdown, PDF, or DOCX documents.');
        }

        const text = await readSelectedFile(file, extension);
        hideLoader();
        loadTextFlow(text);
      } catch (err) {
        hideLoader();
        showStatus(`Failed to read "${file.name}": ${formatError(err)}`, 'error');
      } finally {
        if (target && 'value' in target) target.value = '';
      }
    }

    // ===== Flow Controls =====
    function toggleClearBtn() {
      if (!els.clearBtn || !els.pasteArea) return;
      const hasInputText = Boolean(els.pasteArea.value.trim());
      els.clearBtn.style.display = hasInputText ? 'block' : 'none';
    }

    function clearText() {
      state.currentText = '';
      if (els.pasteArea) els.pasteArea.value = '';
      toggleClearBtn();
      showStatus('Text cleared from this session.', 'success');
    }

    function loadTextFlow(text) {
      if (!text || !text.trim()) {
        showStatus('Provide text input or upload a file first.', 'error');
        return;
      }

      let safeText;
      try {
        safeText = enforceExtractedTextLimit(text, 'document');
      } catch (err) {
        showStatus(formatError(err), 'error');
        return;
      }

      clearStatus();
      state.currentText = safeText;
      renderTextAsync(state.currentText, enterReader);
    }

    function loadFromPaste() {
      if (els.pasteArea) {
        loadTextFlow(els.pasteArea.value);
      }
    }

    function goBack() {
      if (state.isEditing) {
        saveAndExitEditMode();
      }
      if (isSpeaking) stopTTS();
      if (isAutoScrolling) toggleAutoScroll();
      if (getFullscreenElement()) toggleFullscreen();

      if (els.readerView) els.readerView.classList.remove('active');
      if (els.inputView) els.inputView.classList.remove('hidden');
      if (els.backBtn) els.backBtn.classList.remove('show');
      if (els.toolbar) {
        els.toolbar.classList.add('hidden-bar');
        els.toolbar.classList.remove('force-hidden', 'expanded');
      }
      if (els.backBtn) els.backBtn.classList.remove('force-hidden');
      if (els.wordCount) els.wordCount.classList.remove('force-hidden');
      if (els.focusRestore) els.focusRestore.classList.remove('show');
      if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
      if (els.mobileFab) {
        els.mobileFab.classList.remove('active', 'reader-active');
        els.mobileFab.setAttribute('aria-expanded', 'false');
        els.mobileFab.setAttribute('aria-label', 'Toggle Reading Settings');
      }
      
      state.focusMode = false;
      if (els.toolbar) setContainerFocusable(els.toolbar, false);
      if (els.pasteArea) els.pasteArea.value = state.currentText;
      toggleClearBtn();
      if (els.progressBar) els.progressBar.style.width = '0%';
    }

    function enterReader() {
      if (els.inputView) els.inputView.classList.add('hidden');
      if (els.readerView) els.readerView.classList.add('active');
      if (els.backBtn) els.backBtn.classList.add('show');
      if (els.toolbar) els.toolbar.classList.remove('hidden-bar', 'force-hidden', 'expanded');
      if (els.backBtn) els.backBtn.classList.remove('force-hidden');
      if (els.wordCount) els.wordCount.classList.remove('force-hidden');
      if (els.focusRestore) els.focusRestore.classList.remove('show');
      if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
      if (els.mobileFab) {
        els.mobileFab.classList.add('reader-active');
        els.mobileFab.classList.remove('active');
        els.mobileFab.setAttribute('aria-expanded', 'false');
        els.mobileFab.setAttribute('aria-label', 'Toggle Reading Settings');
      }
      
      state.focusMode = false;
      if (els.toolbar) setContainerFocusable(els.toolbar, true);
      scheduleWordCountUpdate();
      resetToolbarTimer();

      setTimeout(() => {
        window.scrollTo(0, 0);
      }, 50);
    }

    // ===== Settings drawer bindings =====
    function toggleSettingsDrawer() {
      if (!els.settingsDrawer || !els.settingsBtn) return;
      els.settingsDrawer.classList.toggle('active');
      const expanded = els.settingsDrawer.classList.contains('active');
      els.settingsBtn.classList.toggle('active', expanded);
      els.settingsBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      els.settingsBtn.setAttribute('aria-label', expanded ? 'Close Reading Settings' : 'Open Reading Settings');
      els.settingsBtn.setAttribute('title', expanded ? 'Close Reading Settings' : 'Open Reading Settings');
    }

    function toggleMobileSheet() {
      if (!els.toolbar) return;
      const isExpanded = els.toolbar.classList.contains('expanded');
      if (isExpanded) {
        collapseMobileSheet();
      } else {
        expandMobileSheet();
      }
    }

    function expandMobileSheet() {
      if (els.toolbar) els.toolbar.classList.add('expanded');
      if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
      if (els.toolbar) setContainerFocusable(els.toolbar, true);
      if (els.mobileFab) {
        els.mobileFab.classList.add('active');
        els.mobileFab.setAttribute('aria-label', 'Close Reading Settings');
        els.mobileFab.setAttribute('aria-expanded', 'true');
      }
    }

    function collapseMobileSheet() {
      if (els.toolbar) els.toolbar.classList.remove('expanded');
      if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
      if (els.toolbar) setContainerFocusable(els.toolbar, false);
      if (els.mobileFab) {
        els.mobileFab.classList.remove('active');
        els.mobileFab.setAttribute('aria-label', 'Toggle Reading Settings');
        els.mobileFab.setAttribute('aria-expanded', 'false');
      }
      if (els.settingsDrawer) els.settingsDrawer.classList.remove('active');
      if (els.settingsBtn) {
        els.settingsBtn.classList.remove('active');
        els.settingsBtn.setAttribute('aria-expanded', 'false');
      }
    }

    // ===== In-Context Inline Content Editor =====
    function toggleEditing() {
      if (state.isEditing) {
        saveAndExitEditMode();
      } else {
        enterEditMode();
      }
    }

    function enterEditMode() {
      if (!els.readerContent || !els.editingBanner || !els.editBtn) return;
      if (isSpeaking) stopTTS();
      if (isAutoScrolling) toggleAutoScroll();

      state.isEditing = true;
      
      // Swap content to raw source text block for easy inline edits
      els.readerContent.textContent = state.currentText;
      
      els.readerContent.setAttribute('contenteditable', 'true');
      els.readerContent.setAttribute('role', 'textbox');
      els.readerContent.setAttribute('aria-label', 'Editable reader text');
      els.readerContent.setAttribute('aria-multiline', 'true');
      els.editingBanner.classList.add('show');
      els.editBtn.innerHTML = '💾 Save';
      els.editBtn.classList.add('active');
      els.editBtn.setAttribute('title', 'Save and Exit');
      els.editBtn.setAttribute('aria-label', 'Save and Exit');
      els.editBtn.setAttribute('aria-pressed', 'true');
      els.readerContent.focus();

      announceLive('Editing mode activated. Focus moved to raw reader text.');
    }

    function saveAndExitEditMode() {
      if (!els.readerContent || !els.editingBanner || !els.editBtn) return;
      state.isEditing = false;
      els.readerContent.setAttribute('contenteditable', 'false');
      els.readerContent.removeAttribute('role');
      els.readerContent.removeAttribute('aria-label');
      els.readerContent.removeAttribute('aria-multiline');
      els.editingBanner.classList.remove('show');
      els.editBtn.innerHTML = '✏️ Edit';
      els.editBtn.classList.remove('active');
      els.editBtn.setAttribute('title', 'Edit Text');
      els.editBtn.setAttribute('aria-label', 'Edit Text');
      els.editBtn.setAttribute('aria-pressed', 'false');

      const editedText = els.readerContent.innerText || '';
      state.currentText = editedText;

      // Re-compile raw markdown back into safe HTML blocks
      renderTextAsync(state.currentText, () => {
        scheduleWordCountUpdate();
        announceLive('Changes kept for this session. Reading mode restored.');
        showStatus('Edits kept for this session.', 'success');
      });
    }

    function announceLive(msg) {
      let live = document.getElementById('liveAnnouncer');
      if (!live) {
        live = document.createElement('div');
        live.id = 'liveAnnouncer';
        live.className = 'sr-only';
        live.setAttribute('aria-live', 'polite');
        live.style.position = 'absolute';
        live.style.width = '1px';
        live.style.height = '1px';
        live.style.padding = '0';
        live.style.margin = '-1px';
        live.style.overflow = 'hidden';
        live.style.clip = 'rect(0, 0, 0, 0)';
        live.style.whiteSpace = 'nowrap';
        live.style.border = '0';
        document.body.appendChild(live);
      }
      live.textContent = '';
      setTimeout(() => {
        live.textContent = msg;
      }, 50);
    }

    function updateMarginStyle(value) {
      if (!els.readerContent) return;
      let padding = clampNumber(value, 24, 12, 80);
      if (window.innerWidth <= 640) {
        padding = Math.min(padding, 24); // Safe mobile margins clamp
      }
      els.readerContent.style.paddingLeft = `${padding}px`;
      els.readerContent.style.paddingRight = `${padding}px`;
    }

    // ===== Focus Mode Handling =====
    function setContainerFocusable(container, enabled) {
      if (!container) return;
      container.querySelectorAll('button, input, [tabindex], select').forEach(element => {
        if (enabled) {
          if (element.dataset.savedTabindex !== undefined) {
            const previous = element.dataset.savedTabindex;
            if (previous) element.setAttribute('tabindex', previous);
            else element.removeAttribute('tabindex');
            delete element.dataset.savedTabindex;
          }
          return;
        }

        if (element.dataset.savedTabindex === undefined) {
          element.dataset.savedTabindex = element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : '';
        }
        element.setAttribute('tabindex', '-1');
      });
    }

    function isMobileSheetLayout() {
      return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    }

    function toggleFocus() {
      if (!els.toolbar || !els.backBtn || !els.wordCount || !els.focusRestore || !els.focusBtn) return;
      state.focusMode = !state.focusMode;

      if (state.focusMode) {
        els.toolbar.classList.add('force-hidden');
        els.backBtn.classList.add('force-hidden');
        els.wordCount.classList.add('force-hidden');
        els.focusRestore.classList.add('show');
        els.focusBtn.setAttribute('aria-pressed', 'true');
        els.focusBtn.setAttribute('aria-label', 'Show UI');
        els.focusBtn.setAttribute('title', 'Show UI');
        setContainerFocusable(els.toolbar, false);
        window.clearTimeout(state.toolbarTimer);
        announceLive('Focus mode activated. UI controls hidden.');
        return;
      }

      els.toolbar.classList.remove('force-hidden');
      els.backBtn.classList.remove('force-hidden');
      els.wordCount.classList.remove('force-hidden');
      els.focusRestore.classList.remove('show');
      els.focusBtn.setAttribute('aria-pressed', 'false');
      els.focusBtn.setAttribute('aria-label', 'Hide UI');
      els.focusBtn.setAttribute('title', 'Hide UI');
      setContainerFocusable(els.toolbar, true);
      resetToolbarTimer();
      announceLive('Focus mode deactivated. UI controls visible.');
    }

    function resetToolbarTimer() {
      if (state.focusMode || state.isEditing || !els.toolbar) return;

      if (isMobileSheetLayout()) {
        window.clearTimeout(state.toolbarTimer);
        setContainerFocusable(els.toolbar, els.toolbar.classList.contains('expanded'));
        return;
      }

      els.toolbar.classList.remove('hidden-bar');
      setContainerFocusable(els.toolbar, true);
      window.clearTimeout(state.toolbarTimer);

      state.toolbarTimer = window.setTimeout(() => {
        if (els.toolbar.contains(document.activeElement)) return;
        els.toolbar.classList.add('hidden-bar');
        setContainerFocusable(els.toolbar, false);
      }, 3500);
    }

    function showGestureHint(text) {
      if (!els.gestureHintText || !els.gestureHint) return;
      els.gestureHintText.textContent = text;
      els.gestureHint.classList.add('show');
      window.clearTimeout(state.gestureHintTimer);
      state.gestureHintTimer = window.setTimeout(() => {
        els.gestureHint.classList.remove('show');
      }, 700);
    }

    // ===== Swipe Carousel Event Bindings =====
    function getCarouselWidth() {
      return els.presetWindow ? (els.presetWindow.getBoundingClientRect().width || 1) : 1;
    }

    function updateCarouselDrag() {
      if (!state.isDraggingCarousel || !els.presetTrack) return;

      let dx = state.dragCurrentX - state.dragStartX;
      const list = getPresets();
      if ((state.dragStartIndex === 0 && dx > 0) || 
          (state.dragStartIndex === list.length - 1 && dx < 0)) {
        dx = dx * 0.35; // Rubber band bounds constraint
      }

      const pct = (dx / state.carouselWidth) * 100;
      els.presetTrack.style.transform = `translate3d(${(-state.dragStartIndex * 100) + pct}%, 0, 0)`;
      window.requestAnimationFrame(updateCarouselDrag);
    }

    function startCarouselDrag(x) {
      if (!els.presetTrack) return;
      state.carouselWidth = getCarouselWidth();
      state.dragStartX = x;
      state.dragCurrentX = x;
      state.dragStartIndex = state.currentPresetIndex;
      state.isDraggingCarousel = true;
      els.presetTrack.classList.remove('snapping');
      els.presetTrack.classList.add('dragging');
      window.requestAnimationFrame(updateCarouselDrag);
    }

    function endCarouselDrag() {
      if (!state.isDraggingCarousel) return;

      state.isDraggingCarousel = false;
      const dx = state.dragCurrentX - state.dragStartX;
      const threshold = state.carouselWidth * 0.18;
      const list = getPresets();

      if (dx < -threshold && state.currentPresetIndex < list.length - 1) state.currentPresetIndex++;
      else if (dx > threshold && state.currentPresetIndex > 0) state.currentPresetIndex--;

      applyPreset(state.currentPresetIndex);
    }

    function attachGestureArea(element) {
      if (!element) return;
      element.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) return;
        const target = getElementTarget(event.target);
        if ((target && target.closest('pre')) || state.isEditing) return;
        
        state.gestureStartX = event.touches[0].screenX;
        state.gestureStartY = event.touches[0].screenY;
        state.gestureStartTime = Date.now();
        state.isGesture = true;
      }, { passive: true });

      element.addEventListener('touchmove', event => {
        if (!state.isGesture) return;
        const dx = Math.abs(event.touches[0].screenX - state.gestureStartX);
        const dy = Math.abs(event.touches[0].screenY - state.gestureStartY);
        if (dy > dx && dy > 20) state.isGesture = false;
      }, { passive: true });

      element.addEventListener('touchend', event => {
        if (!state.isGesture) return;
        state.isGesture = false;
        if (window.getSelection && window.getSelection().toString().trim().length > 0) return;

        const dt = Date.now() - state.gestureStartTime;
        const dx = event.changedTouches[0].screenX - state.gestureStartX;
        const dy = event.changedTouches[0].screenY - state.gestureStartY;
        if (dt > 500 || Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

        if (dx < 0) nextPreset();
        else prevPreset();
      }, { passive: true });

      element.addEventListener('mousedown', event => {
        const target = getElementTarget(event.target);
        if ((target && target.closest('pre')) || state.isEditing) return;

        state.gestureStartX = event.clientX;
        state.gestureStartY = event.clientY;
        state.gestureStartTime = Date.now();
        state.isGesture = true;
      });

      element.addEventListener('mouseup', event => {
        if (!state.isGesture) return;
        state.isGesture = false;
        if (window.getSelection && window.getSelection().toString().trim().length > 0) return;

        const dt = Date.now() - state.gestureStartTime;
        const dx = event.clientX - state.gestureStartX;
        const dy = event.clientY - state.gestureStartY;
        if (dt > 500 || Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.7) return;

        if (dx < 0) nextPreset();
        else prevPreset();
      });

      element.addEventListener('mouseleave', () => {
        state.isGesture = false;
      });
    }

    function isInteractiveShortcutTarget(target) {
      const element = getElementTarget(target);
      if (!element) return false;
      return Boolean(element.closest('input, select, textarea, button, a, [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"], [role="combobox"]'));
    }

    function canUseGlobalPresetShortcut(event) {
      if (state.isEditing || !els.tocDialog || els.tocDialog.open) return false;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
      if (event.target === els.presetWindow) return false;
      return !isInteractiveShortcutTarget(event.target);
    }

    // ===== Safe DOM Event Bindings =====
    function bindEvents() {
      if (els.readBtn) els.readBtn.addEventListener('click', loadFromPaste);
      if (els.fileInput) els.fileInput.addEventListener('change', handleFile);
      if (els.clearBtn) els.clearBtn.addEventListener('click', clearText);
      if (els.backBtn) els.backBtn.addEventListener('click', goBack);
      if (els.focusBtn) els.focusBtn.addEventListener('click', toggleFocus);
      if (els.editBtn) els.editBtn.addEventListener('click', toggleEditing);
      if (els.focusRestore) els.focusRestore.addEventListener('click', toggleFocus);
      if (els.modeLight) els.modeLight.addEventListener('click', () => setMode('light'));
      if (els.modeDark) els.modeDark.addEventListener('click', () => setMode('dark'));
      
      document.querySelectorAll('[data-size]').forEach(button => {
        button.addEventListener('click', () => setSize(button.getAttribute('data-size')));
      });

      if (els.presetWindow) {
        els.presetWindow.addEventListener('touchstart', event => {
          if (event.touches.length === 1) startCarouselDrag(event.touches[0].clientX);
        }, { passive: true });
        els.presetWindow.addEventListener('touchmove', event => {
          if (state.isDraggingCarousel) state.dragCurrentX = event.touches[0].clientX;
        }, { passive: true });
        els.presetWindow.addEventListener('touchend', endCarouselDrag, { passive: true });
        els.presetWindow.addEventListener('mousedown', event => startCarouselDrag(event.clientX));
        els.presetWindow.addEventListener('click', event => {
          if (state.isDraggingCarousel || Math.abs(state.dragCurrentX - state.dragStartX) > 5) return;
          const target = getElementTarget(event.target);
          const card = target ? target.closest('.preset-card') : null;
          if (!card) return;
          applyPreset(card.getAttribute('data-index'));
        });
        els.presetWindow.addEventListener('keydown', event => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            nextPreset();
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            prevPreset();
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            applyPreset(state.currentPresetIndex);
          }
        });
      }

      window.addEventListener('mousemove', event => {
        if (state.isDraggingCarousel) state.dragCurrentX = event.clientX;
      });
      window.addEventListener('mouseup', endCarouselDrag);
      if (els.arrowLeft) els.arrowLeft.addEventListener('click', prevPreset);
      if (els.arrowRight) els.arrowRight.addEventListener('click', nextPreset);

      if (els.readerContent) attachGestureArea(els.readerContent);
      if (els.wordCount) attachGestureArea(els.wordCount);

      window.addEventListener('scroll', () => {
        if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar) return;

        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
        els.progressBar.style.width = `${scrolled}%`;
      }, { passive: true });

      if (els.inputView) {
        els.inputView.addEventListener('dragover', event => {
          event.preventDefault();
          els.inputView.classList.add('drag-active');
        });
        els.inputView.addEventListener('dragleave', event => {
          event.preventDefault();
          els.inputView.classList.remove('drag-active');
        });
        els.inputView.addEventListener('drop', event => {
          event.preventDefault();
          els.inputView.classList.remove('drag-active');
          if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
            handleFile({ target: { files: [event.dataTransfer.files[0]], value: '' } });
          }
        });
      }

      if (els.pasteArea) {
        els.pasteArea.addEventListener('input', () => {
          toggleClearBtn();
          clearStatus();
        });
      }

      if (els.toolbar) {
        els.toolbar.addEventListener('click', resetToolbarTimer);
        els.toolbar.addEventListener('touchstart', resetToolbarTimer, { passive: true });
        els.toolbar.addEventListener('touchmove', resetToolbarTimer, { passive: true });
        els.toolbar.addEventListener('mouseenter', () => window.clearTimeout(state.toolbarTimer));
        els.toolbar.addEventListener('mouseleave', resetToolbarTimer);
        els.toolbar.addEventListener('focusin', () => window.clearTimeout(state.toolbarTimer));
        els.toolbar.addEventListener('focusout', resetToolbarTimer);
      }

      document.addEventListener('click', event => {
        if (els.readerView && els.readerView.classList.contains('active')
          && els.toolbar && !els.toolbar.contains(event.target)
          && els.backBtn && !els.backBtn.contains(event.target)
          && els.focusRestore && !els.focusRestore.contains(event.target)
          && els.tocDialog && !els.tocDialog.contains(event.target)
          && els.mobileFab && !els.mobileFab.contains(event.target)
          && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) {
          resetToolbarTimer();
        }
      });

      document.addEventListener('touchstart', event => {
        if (els.readerView && els.readerView.classList.contains('active')
          && els.toolbar && !els.toolbar.contains(event.target)
          && els.backBtn && !els.backBtn.contains(event.target)
          && els.focusRestore && !els.focusRestore.contains(event.target)
          && els.tocDialog && !els.tocDialog.contains(event.target)
          && els.mobileFab && !els.mobileFab.contains(event.target)
          && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) {
          resetToolbarTimer();
        }
      }, { passive: true });

      document.addEventListener('scroll', () => {
        if (!els.readerView || !els.readerView.classList.contains('active')) return;
        if (els.toolbar && els.toolbar.contains(document.activeElement)) resetToolbarTimer();
      }, { passive: true });

      document.addEventListener('keydown', event => {
        if (!els.readerView || !els.readerView.classList.contains('active')) return;
        if (event.key === 'Escape') {
          if (els.tocDialog && els.tocDialog.open) els.tocDialog.close();
          else if (state.focusMode) toggleFocus();
          else goBack();
        }
        if (event.key === 'ArrowRight' && canUseGlobalPresetShortcut(event)) {
          event.preventDefault();
          nextPreset();
        }
        if (event.key === 'ArrowLeft' && canUseGlobalPresetShortcut(event)) {
          event.preventDefault();
          prevPreset();
        }
      });

      if (els.fullscreenBtn) els.fullscreenBtn.addEventListener('click', toggleFullscreen);
      if (els.autoScrollBtn) els.autoScrollBtn.addEventListener('click', toggleAutoScroll);
      if (els.ttsBtn) els.ttsBtn.addEventListener('click', toggleTTS);
      if (els.downloadBtn) els.downloadBtn.addEventListener('click', downloadText);
      
      document.addEventListener('fullscreenchange', () => {
         updateFullscreenButton();
      });
      document.addEventListener('webkitfullscreenchange', () => {
         updateFullscreenButton();
      });
      document.addEventListener('msfullscreenchange', () => {
         updateFullscreenButton();
      });

      // Dialog Events and Focus Restoration controls
      if (els.tocBtn) els.tocBtn.addEventListener('click', populateAndShowTOC);
      if (els.closeTocBtn) els.closeTocBtn.addEventListener('click', () => { if(els.tocDialog) els.tocDialog.close(); });
      if (els.tocDialog) {
        setupFocusTrap(els.tocDialog);
        els.tocDialog.addEventListener('click', (e) => {
           const rect = els.tocDialog.getBoundingClientRect();
           if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
              els.tocDialog.close();
           }
        });
        els.tocDialog.addEventListener('close', () => {
          if (lastActiveElement) {
            lastActiveElement.focus();
          }
        });
      }

      // Reading Ruler Event Mapping
      if (els.rulerBtn) els.rulerBtn.addEventListener('click', toggleRuler);
      if (els.readerContent) {
        els.readerContent.addEventListener('mousemove', updateRulerPosition);
        els.readerContent.addEventListener('touchmove', (e) => {
          if (!isRulerActive || e.touches.length !== 1 || !els.readingRuler) return;
          const touch = e.touches[0];
          const target = getElementTarget(document.elementFromPoint(touch.clientX, touch.clientY));
          if (target && els.readerContent.contains(target)) {
            const textContainer = target.closest('p, li, h1, h2, h3, blockquote') || target;
            const rect = textContainer.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const top = rect.top + scrollTop;
            els.readingRuler.style.height = `${rect.height + 4}px`;
            els.readingRuler.style.transform = `translate3d(0, ${top - 2}px, 0)`;
          }
        }, { passive: true });
      }

      if (els.settingsBtn) els.settingsBtn.addEventListener('click', toggleSettingsDrawer);
      
      // Sliders Typography Range Hooks
      if (els.lineHeightInput) {
        els.lineHeightInput.addEventListener('input', () => {
          const val = clampNumber(els.lineHeightInput.value, 1.85, 1.4, 2.6);
          els.lineHeightInput.value = val;
          if (els.readerContent) els.readerContent.style.lineHeight = val;
        });
      }

      if (els.letterSpacingInput) {
        els.letterSpacingInput.addEventListener('input', () => {
          const val = clampNumber(els.letterSpacingInput.value, -0.015, -0.03, 0.15);
          els.letterSpacingInput.value = val;
          if (els.readerContent) els.readerContent.style.letterSpacing = `${val}em`;
        });
      }

      if (els.marginInput) {
        els.marginInput.addEventListener('input', () => {
          const val = clampNumber(els.marginInput.value, 24, 12, 80);
          els.marginInput.value = val;
          updateMarginStyle(val);
        });
      }

      if (els.smartHeadingsInput) {
        els.smartHeadingsInput.addEventListener('change', () => {
          state.smartHeadings = els.smartHeadingsInput.checked;
          announceLive(`Smart headings ${state.smartHeadings ? 'enabled' : 'disabled'}.`);

          if (state.currentText && els.readerView && els.readerView.classList.contains('active') && !state.isEditing) {
            const currentScroll = window.scrollY;
            renderTextAsync(state.currentText, () => {
              scheduleWordCountUpdate();
              window.scrollTo(0, currentScroll);
            });
          }
        });
      }
      
      window.addEventListener('resize', () => {
        if (els.marginInput) {
          updateMarginStyle(parseFloat(els.marginInput.value));
        }
      });

      if (els.voiceRateInput && els.voiceRateVal) {
        els.voiceRateInput.addEventListener('input', () => {
          const val = clampNumber(els.voiceRateInput.value, 1.0, 0.5, 2.5);
          els.voiceRateInput.value = val;
          els.voiceRateVal.textContent = `${val.toFixed(1)}x`;
          announceLive(`Speech speed changed to ${val.toFixed(1)}x.`);
        });
      }

      if (els.scrollSpeedInput && els.scrollSpeedVal) {
        els.scrollSpeedInput.addEventListener('input', () => {
          const val = clampNumber(els.scrollSpeedInput.value, 0.04, 0.01, 0.2);
          els.scrollSpeedInput.value = val;
          autoScrollSpeed = val;
          els.scrollSpeedVal.textContent = `${(val / 0.04).toFixed(1)}x`;
          announceLive(`Auto-scroll speed changed to ${(val / 0.04).toFixed(1)}x.`);
        });
      }

      // Mobile Bottom Sheet Event listeners
      if (els.mobileFab) els.mobileFab.addEventListener('click', toggleMobileSheet);
      if (els.sheetBackdrop) els.sheetBackdrop.addEventListener('click', collapseMobileSheet);
      if (els.bottomSheetHandle) els.bottomSheetHandle.addEventListener('click', collapseMobileSheet);

      // Save Banner triggers
      if (els.saveEditBannerBtn) els.saveEditBannerBtn.addEventListener('click', saveAndExitEditMode);

      if (els.readerContent) {
        els.readerContent.addEventListener('input', () => {
          if (!state.isEditing) return;

          window.clearTimeout(editDebounceTimer);
          editDebounceTimer = window.setTimeout(() => {
            const text = els.readerContent.innerText || '';
            state.currentText = text;
            scheduleWordCountUpdate();
            showStatus('Edits kept for this session.', 'success');
          }, 1000);
        });
      }
    }

    function init() {
      cleanupLegacyBrowserStorage();
      bindEvents();

      state.smartHeadings = true;
      if (els.smartHeadingsInput) els.smartHeadingsInput.checked = state.smartHeadings;

      setMode('light', { presetIndex: 0, resetTimer: false });

      setSize('medium');
      toggleClearBtn();
      if (els.toolbar) setContainerFocusable(els.toolbar, false);

      const defaultLineHeight = 1.85;
      if (els.lineHeightInput) els.lineHeightInput.value = defaultLineHeight;
      if (els.readerContent) els.readerContent.style.lineHeight = defaultLineHeight;

      const defaultLetterSpacing = -0.015;
      if (els.letterSpacingInput) els.letterSpacingInput.value = defaultLetterSpacing;
      if (els.readerContent) els.readerContent.style.letterSpacing = `${defaultLetterSpacing}em`;

      const defaultMargin = 24;
      if (els.marginInput) els.marginInput.value = defaultMargin;
      updateMarginStyle(defaultMargin);

      const defaultVoiceRate = 1.0;
      if (els.voiceRateInput) els.voiceRateInput.value = defaultVoiceRate;
      if (els.voiceRateVal) els.voiceRateVal.textContent = `${defaultVoiceRate.toFixed(1)}x`;

      const defaultScrollSpeed = 0.04;
      if (els.scrollSpeedInput) els.scrollSpeedInput.value = defaultScrollSpeed;
      autoScrollSpeed = defaultScrollSpeed;
      if (els.scrollSpeedVal) els.scrollSpeedVal.textContent = `${(autoScrollSpeed / 0.04).toFixed(1)}x`;

      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = populateVoices;
        populateVoices();
      }
    }

    init();
  })();
