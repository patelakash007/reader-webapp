import { createMarkdownRenderer } from './parser.mjs';

export function createReaderRenderer(context, { ui, tts, applyTextColor }) {
  const { els, state, runtime } = context;
  function renderTextAsync(text, onComplete, options = {}) {
    if (!els.readerContent) return;
    const renderId = ++runtime.reader.activeRenderId;
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    const shouldShowLoader = !options.suppressLoader;
    if (shouldShowLoader) ui.showLoader('Preparing reader...');
    els.readerContent.textContent = '';

    const renderer = createMarkdownRenderer(state.smartHeadings);
    let tokens = [];
    try {
      tokens = renderer.tokenize(text);
    } catch (err) {
      if (renderId !== runtime.reader.activeRenderId) return;
      if (shouldShowLoader) ui.hideLoader();
      ui.showStatus(`Could not render this text safely: ${err && err.message ? err.message : 'Unknown error'}`, 'error');
      return;
    }
    let index = 0;

    const processChunk = () => {
      if (renderId !== runtime.reader.activeRenderId) return;
      try {
        const deadline = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) + 12;
        let charsCount = 0;
        const startIndex = index;
        while (index < tokens.length && (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) < deadline && charsCount < 30000) {
          if (renderId !== runtime.reader.activeRenderId) return;
          const token = tokens[index];
          charsCount += (token.raw ? token.raw.length : (token.text ? token.text.length : 0));
          index += 1;
        }

        if (index > startIndex) {
          const chunkTokens = tokens.slice(startIndex, index);
          chunkTokens.links = tokens.links;
          const html = renderer.renderTokens(chunkTokens, tokens.links);
          if (html && renderId === runtime.reader.activeRenderId && els.readerContent) {
            els.readerContent.insertAdjacentHTML('beforeend', html);
          }
        }
        if (renderId !== runtime.reader.activeRenderId) return;

        if (index < tokens.length) {
          if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            window.requestAnimationFrame(processChunk);
          } else {
            setTimeout(processChunk, 0);
          }
          return;
        }
        if (renderId !== runtime.reader.activeRenderId) return;
        applyTextColor();
        if (tts && typeof tts.invalidateTokenization === 'function') {
          tts.invalidateTokenization();
        }
        // Lazy tokenization: TTS tokenization runs on-demand when TTS starts, not synchronously on initial render
        if (shouldShowLoader) ui.hideLoader();
        if (onComplete && renderId === runtime.reader.activeRenderId) onComplete();
      } catch (err) {
        if (renderId !== runtime.reader.activeRenderId) return;
        if (shouldShowLoader) ui.hideLoader();
        ui.showStatus(`Could not render this text safely: ${err && err.message ? err.message : 'Unknown error'}`, 'error');
      }
    };

    if (typeof setTimeout !== 'undefined') {
      setTimeout(() => {
        if (renderId !== runtime.reader.activeRenderId) return;
        processChunk();
      }, 10);
    } else {
      processChunk();
    }
  }

  function updateWordCount() {
    if (!els.wordCount) return;
    const text = state.isEditing && els.readerEditor
      ? els.readerEditor.value
      : (state.currentText || (els.readerContent ? els.readerContent.textContent : ''));
    let words = 0;
    const re = /\S+/g;
    while (re.exec(text) !== null) words += 1;
    const minutes = Math.ceil(words / 238);
    const timeString = words < 238 ? '< 1 min read' : `~${minutes} min read`;
    els.wordCount.textContent = `${words.toLocaleString()} words · ${timeString}`;
  }

  function scheduleWordCountUpdate() {
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.wordCountTimer);
      state.wordCountTimer = window.setTimeout(updateWordCount, 0);
    } else {
      updateWordCount();
    }
  }


  return { renderTextAsync, scheduleWordCountUpdate, updateWordCount };
}
