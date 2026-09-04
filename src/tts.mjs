import {
  BOUNDARY_FALLBACK_MS,
  CHUNK_TARGET,
  KEEP_ALIVE_MS,
  PAGEHIDE_CANCEL_TIMEOUT,
  SPEED_STEPS,
  STATE_IDLE,
  STATE_PAUSED,
  STATE_PLAYING,
  VOICE_POLL_MS,
  VOICE_POLL_TIMEOUT,
  WORDS_PER_MIN
} from './constants.mjs';
import { clampNumber } from './utils.mjs';

export const LAZY_TOKENIZE_WORD_LIMIT = 5000;

export function chunkText(text, baseOffset = 0, targetLen = CHUNK_TARGET) {
  const out = [];
  const value = String(text || '');
  let start = 0;
  while (start < value.length) {
    if (value.length - start <= targetLen) {
      out.push({ text: value.slice(start), start: baseOffset + start, end: baseOffset + value.length });
      break;
    }
    const end = start + targetLen;
    let splitAt = -1;
    for (let i = Math.min(end, value.length - 1); i > start; i -= 1) {
      if (/\s/.test(value[i])) { splitAt = i; break; }
    }
    if (splitAt === -1) splitAt = end;
    out.push({ text: value.slice(start, splitAt), start: baseOffset + start, end: baseOffset + splitAt });
    start = splitAt;
    while (start < value.length && /\s/.test(value[start])) start += 1;
  }
  return out;
}

export function deduplicateAndSortVoices(list) {
  const seen = new Set();
  const unique = [];
  list.forEach(voice => {
    const key = `${voice.name}\0${voice.lang}`;
    if (!seen.has(key)) { seen.add(key); unique.push(voice); }
  });
  return unique.sort((a, b) => {
    if (a.default !== b.default) return a.default ? -1 : 1;
    const langA = a.lang || '';
    const langB = b.lang || '';
    if (langA !== langB) return langA.localeCompare(langB);
    return (a.name || '').localeCompare(b.name || '');
  });
}

export function resolveVoiceIndex(voices, previousSelection, userLanguage = 'en-US') {
  let selectedIndex = -1;
  if (previousSelection) selectedIndex = voices.findIndex((voice, index) => voice.voiceURI === previousSelection || String(index) === previousSelection);
  if (selectedIndex === -1) selectedIndex = voices.findIndex(voice => voice.lang === userLanguage);
  if (selectedIndex === -1) {
    const family = userLanguage.split('-')[0];
    selectedIndex = voices.findIndex(voice => voice.lang && voice.lang.split('-')[0] === family);
  }
  if (selectedIndex === -1) selectedIndex = voices.findIndex(voice => voice.default);
  if (selectedIndex === -1) selectedIndex = voices.length ? 0 : -1;
  return selectedIndex;
}

function isSpeechTextNode(node) {
  if (!node || node.nodeType !== 3 || !node.nodeValue || !node.nodeValue.trim()) return false;
  const parent = node.parentElement;
  if (!parent) return false;
  const tag = parent.tagName.toLowerCase();
  return tag !== 'script' && tag !== 'style' && !parent.closest('[aria-hidden="true"]');
}

function walkSpeechTextNodes(container, documentObject, visitor) {
  if (!container) return;
  const filter = typeof NodeFilter !== 'undefined' ? NodeFilter : { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_SKIP: 3, FILTER_REJECT: 2 };
  const walker = documentObject.createTreeWalker(container, filter.SHOW_TEXT, {
    acceptNode(node) {
      if (!isSpeechTextNode(node)) return filter.FILTER_SKIP;
      return filter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) visitor(walker.currentNode);
}

function blockForNode(node) {
  return node && node.parentElement ? node.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre') : null;
}

export function tokenizeReaderDOM(containerElement, documentObject = document) {
  const wordSpans = [];
  const wordMeta = [];
  let fullSpokenText = '';
  if (!containerElement) return { spans: wordSpans, meta: wordMeta, text: fullSpokenText, lazy: false };

  let lastBlockElement = null;
  walkSpeechTextNodes(containerElement, documentObject, textNode => {
    const text = textNode.nodeValue;
    const parentBlock = blockForNode(textNode);
    if (parentBlock && lastBlockElement && parentBlock !== lastBlockElement) {
      if (!fullSpokenText.endsWith('\n\n')) fullSpokenText += fullSpokenText.endsWith('\n') ? '\n' : '\n\n';
    } else if (fullSpokenText.length > 0 && !/\s$/.test(fullSpokenText)) fullSpokenText += ' ';
    lastBlockElement = parentBlock;

    const fragment = documentObject.createDocumentFragment();
    let lastIndex = 0;
    const wordPattern = /\S+/g;
    let match;
    while ((match = wordPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const whitespace = text.slice(lastIndex, match.index);
        fragment.appendChild(documentObject.createTextNode(whitespace));
        fullSpokenText += whitespace;
      }
      const wordText = match[0];
      const span = documentObject.createElement('span');
      span.className = 'tts-word';
      const index = wordMeta.length;
      span.setAttribute('data-word-idx', String(index));
      span.textContent = wordText;
      fragment.appendChild(span);
      const start = fullSpokenText.length;
      fullSpokenText += wordText;
      const end = fullSpokenText.length;
      wordSpans.push(span);
      wordMeta.push({ index, text: wordText, start, end, element: span });
      lastIndex = match.index + wordText.length;
    }
    if (lastIndex < text.length) {
      const trailing = text.slice(lastIndex);
      fragment.appendChild(documentObject.createTextNode(trailing));
      fullSpokenText += trailing;
    }
    if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
  });
  return { spans: wordSpans, meta: wordMeta, text: fullSpokenText, lazy: false };
}

export function buildLazyReaderIndex(containerElement, documentObject = document) {
  const segments = [];
  let fullSpokenText = '';
  let lastBlockElement = null;
  if (!containerElement) return { segments, text: fullSpokenText, wordCount: 0, lazy: true };

  walkSpeechTextNodes(containerElement, documentObject, textNode => {
    const text = textNode.nodeValue;
    const parentBlock = blockForNode(textNode);
    if (parentBlock && lastBlockElement && parentBlock !== lastBlockElement) {
      if (!fullSpokenText.endsWith('\n\n')) fullSpokenText += fullSpokenText.endsWith('\n') ? '\n' : '\n\n';
    } else if (fullSpokenText.length > 0 && !/\s$/.test(fullSpokenText)) fullSpokenText += ' ';
    lastBlockElement = parentBlock;
    const spokenStart = fullSpokenText.length;
    fullSpokenText += text;
    segments.push({ node: textNode, spokenStart, spokenEnd: fullSpokenText.length });
  });

  let wordCount = 0;
  segments.forEach(segment => {
    let match;
    const pattern = /\S+/g;
    while ((match = pattern.exec(segment.node.nodeValue)) !== null) wordCount += 1;
  });
  return { segments, text: fullSpokenText, wordCount, lazy: true };
}

function getLazyRange(session, absIndex) {
  let low = 0;
  let high = session.lazySegments.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const segment = session.lazySegments[mid];
    if (absIndex < segment.spokenStart) high = mid - 1;
    else if (absIndex >= segment.spokenEnd) low = mid + 1;
    else {
      const nodeText = segment.node.nodeValue || '';
      const local = Math.max(0, Math.min(nodeText.length, absIndex - segment.spokenStart));
      let start = local;
      let end = local;
      while (start > 0 && !/\s/.test(nodeText[start - 1])) start -= 1;
      while (end < nodeText.length && !/\s/.test(nodeText[end])) end += 1;
      if (start === end) return null;
      const range = document.createRange();
      range.setStart(segment.node, start);
      range.setEnd(segment.node, end);
      return { range, start: segment.spokenStart + start, end: segment.spokenStart + end, text: nodeText.slice(start, end) };
    }
  }
  return null;
}

export function createTTS(context, { ui }) {
  const { els, runtime } = context;
  const session = runtime.tts;
  let initialized = false;

  function clearLazyHighlight() {
    if (session.lazyHighlight && session.lazyHighlight.parentNode) session.lazyHighlight.parentNode.removeChild(session.lazyHighlight);
    session.lazyHighlight = null;
  }

  function clearHighlight() {
    if (session.currentWordIndex >= 0 && session.wordSpans[session.currentWordIndex]) session.wordSpans[session.currentWordIndex].classList.remove('active');
    if (els.readerContent) els.readerContent.querySelectorAll('.tts-word.active').forEach(span => span.classList.remove('active'));
    clearLazyHighlight();
    session.currentWordIndex = -1;
    session.currentCharIndex = 0;
  }

  function highlightLazy(absIndex) {
    const result = getLazyRange(session, absIndex);
    if (!result || !els.readerContent) return;
    clearLazyHighlight();
    const rangeRect = result.range.getBoundingClientRect();
    if (!rangeRect || !rangeRect.width || !rangeRect.height) return;
    const containerRect = els.readerContent.getBoundingClientRect();
    const marker = document.createElement('span');
    marker.className = 'tts-lazy-highlight';
    marker.setAttribute('aria-hidden', 'true');
    marker.style.position = 'absolute';
    marker.style.pointerEvents = 'none';
    marker.style.background = 'color-mix(in srgb, var(--accent) 22%, transparent)';
    marker.style.borderRadius = '4px';
    marker.style.left = `${rangeRect.left - containerRect.left + (els.readerContent.scrollLeft || 0)}px`;
    marker.style.top = `${rangeRect.top - containerRect.top + (els.readerContent.scrollTop || 0)}px`;
    marker.style.width = `${rangeRect.width}px`;
    marker.style.height = `${rangeRect.height}px`;
    marker.style.zIndex = '0';
    if (!els.readerContent.style.position) els.readerContent.style.position = 'relative';
    els.readerContent.appendChild(marker);
    session.lazyHighlight = marker;
    session.currentCharIndex = result.start;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (rangeRect.top < 80 || rangeRect.bottom > viewportHeight - 80) {
      window.scrollBy({ top: rangeRect.top - viewportHeight * 0.35, behavior: 'smooth' });
    }
  }

  function highlightAtIndex(absIndex) {
    if (session.lazyMode) {
      highlightLazy(absIndex);
      return;
    }
    if (!session.wordMeta.length) return;
    let index = session.wordMeta.findIndex(word => absIndex >= word.start && absIndex < word.end);
    if (index === -1) {
      for (let i = session.wordMeta.length - 1; i >= 0; i -= 1) {
        if (session.wordMeta[i].start <= absIndex) { index = i; break; }
      }
    }
    if (index === -1 || index === session.currentWordIndex) return;
    if (session.currentWordIndex >= 0 && session.wordSpans[session.currentWordIndex]) session.wordSpans[session.currentWordIndex].classList.remove('active');
    session.currentWordIndex = index;
    session.currentCharIndex = session.wordMeta[index].start;
    const span = session.wordSpans[index];
    if (!span) return;
    span.classList.add('active');
    const rate = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : '1.0') || 1.0;
    try { span.scrollIntoView({ block: 'nearest', behavior: rate > 1.5 ? 'auto' : 'smooth' }); }
    catch (err) { span.scrollIntoView(); }
  }

  function tokenize() {
    clearHighlight();
    session.wordMeta = [];
    session.wordSpans = [];
    session.lazyMode = false;
    session.lazySegments = [];
    if (!els.readerContent) return { spans: [], meta: [], text: '', lazy: false };

    let wordCount = 0;
    walkSpeechTextNodes(els.readerContent, document, node => {
      const matches = node.nodeValue.match(/\S+/g);
      wordCount += matches ? matches.length : 0;
    });

    if (wordCount > LAZY_TOKENIZE_WORD_LIMIT) {
      const result = buildLazyReaderIndex(els.readerContent, document);
      session.lazyMode = true;
      session.lazySegments = result.segments;
      session.fullSpokenText = result.text;
      return result;
    }

    const result = tokenizeReaderDOM(els.readerContent, document);
    session.fullSpokenText = result.text;
    session.wordSpans = result.spans;
    session.wordMeta = result.meta;
    return result;
  }

  function populateVoices() {
    if (!session.supported || !els.voiceSelect) return;
    const list = session.synth.getVoices();
    if (!list || !list.length) return;
    session.voices = deduplicateAndSortVoices(Array.from(list));
    const previousSelection = els.voiceSelect.value || '';
    els.voiceSelect.innerHTML = '';
    session.voices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = voice.voiceURI || String(index);
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — default' : ''}`;
      els.voiceSelect.appendChild(option);
    });
    const language = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const selectedIndex = resolveVoiceIndex(session.voices, previousSelection, language);
    if (selectedIndex >= 0) els.voiceSelect.value = session.voices[selectedIndex].voiceURI || String(selectedIndex);
  }

  function pollVoices() {
    if (!session.supported) return;
    let elapsed = 0;
    const intervalId = setInterval(() => {
      elapsed += VOICE_POLL_MS;
      populateVoices();
      if (session.voices.length || elapsed >= VOICE_POLL_TIMEOUT) clearInterval(intervalId);
    }, VOICE_POLL_MS);
  }

  function getSelectedVoice() {
    if (!session.voices.length || !els.voiceSelect) return null;
    const value = els.voiceSelect.value;
    return session.voices.find(voice => voice.voiceURI === value) || session.voices[parseInt(value, 10)] || session.voices[0] || null;
  }

  function stopEstimateTimer() {
    if (session.estimateTimer) { clearInterval(session.estimateTimer); session.estimateTimer = null; }
  }

  function startEstimateTimer(chunk, generation) {
    stopEstimateTimer();
    const rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : '1.0', 1.0, 0.5, 2.5);
    const startingChunkIndex = session.chunkIndex;
    let firstWordIndex = session.lazyMode ? -1 : session.wordMeta.findIndex(word => word.end > chunk.start);
    let lastWord = session.lazyMode ? -1 : session.wordMeta.reduce((last, word, index) => word.start < chunk.end ? index : last, Math.max(firstWordIndex, 0));
    if (!session.lazyMode) {
      if (firstWordIndex === -1) firstWordIndex = Math.max(0, session.wordMeta.length - 1);
      highlightAtIndex(session.wordMeta[firstWordIndex].start);
    }
    let elapsed = 0;
    session.estimateTimer = setInterval(() => {
      if (generation !== session.speechGeneration || session.finishing || session.state !== STATE_PLAYING || session.chunkIndex !== startingChunkIndex) { stopEstimateTimer(); return; }
      elapsed += BOUNDARY_FALLBACK_MS;
      if (session.lazyMode) {
        const characterEstimate = Math.floor((WORDS_PER_MIN * rate / 60000) * elapsed * 6);
        highlightAtIndex(Math.min(chunk.end - 1, chunk.start + characterEstimate));
      } else {
        const wordsPerMs = (WORDS_PER_MIN * rate) / 60000;
        const index = Math.min(lastWord, firstWordIndex + Math.floor(elapsed * wordsPerMs));
        if (index >= firstWordIndex) highlightAtIndex(session.wordMeta[index].start);
      }
    }, BOUNDARY_FALLBACK_MS);
  }

  function stopKeepAliveTimer() {
    if (session.keepAliveTimer) { clearInterval(session.keepAliveTimer); session.keepAliveTimer = null; }
  }

  function startKeepAliveTimer() {
    stopKeepAliveTimer();
    if (session.isMobile) return;
    session.keepAliveTimer = setInterval(() => {
      if (session.finishing || session.state !== STATE_PLAYING) return;
      try {
        if (session.synth && session.synth.speaking) { session.synth.pause(); session.synth.resume(); }
      } catch (err) {}
    }, KEEP_ALIVE_MS);
  }

  function setState(nextState) {
    session.state = nextState;
    const idle = nextState === STATE_IDLE;
    const playing = nextState === STATE_PLAYING;
    const paused = nextState === STATE_PAUSED;
    session.isSpeaking = playing || paused;
    if (els.ttsBtn) {
      els.ttsBtn.classList.toggle('active', playing || paused);
      els.ttsBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      if (playing) { els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x23F8;</span> Pause'; els.ttsBtn.setAttribute('aria-label', 'Pause Read Aloud'); }
      else if (paused) { els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x25B6;</span> Resume'; els.ttsBtn.setAttribute('aria-label', 'Resume Read Aloud'); }
      else { els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x1F50A;</span> Read Aloud'; els.ttsBtn.setAttribute('aria-label', 'Start Read Aloud'); }
    }
    if (els.ttsStopBtn) els.ttsStopBtn.disabled = idle;
    if (els.audioPlayerBar) els.audioPlayerBar.classList.toggle('active', !idle);
    if (els.audioPlayPauseBtn) {
      els.audioPlayPauseBtn.innerHTML = playing ? '<span aria-hidden="true">&#x23F8;</span>' : '<span aria-hidden="true">&#x25B6;</span>';
      els.audioPlayPauseBtn.setAttribute('aria-label', playing ? 'Pause narration' : paused ? 'Resume narration' : 'Play narration');
    }
    if (els.audioStopBtn) els.audioStopBtn.disabled = idle;
    if (els.audioStatusText) els.audioStatusText.textContent = playing ? 'Speaking...' : paused ? 'Paused' : 'Speech Ready';
  }

  function buildUtterance(chunk, generation) {
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    const voice = getSelectedVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : '1.0', 1.0, 0.5, 2.5);
    utterance.pitch = 1;
    session.chunkHasBoundary = false;
    utterance.onboundary = event => {
      if (generation !== session.speechGeneration || (event.name && event.name !== 'word')) return;
      session.chunkHasBoundary = true;
      stopEstimateTimer();
      highlightAtIndex(chunk.start + event.charIndex);
    };
    utterance.onstart = () => { if (generation === session.speechGeneration && !session.finishing && !session.chunkHasBoundary) startEstimateTimer(chunk, generation); };
    utterance.onend = () => {
      if (generation !== session.speechGeneration || session.finishing) return;
      stopEstimateTimer();
      if (session.state === STATE_PLAYING && session.chunkIndex < session.chunks.length - 1) {
        session.chunkIndex += 1;
        speakChunk(session.chunks[session.chunkIndex], generation);
      } else if (session.state === STATE_PLAYING) finishSpeech();
    };
    utterance.onerror = event => {
      if (generation !== session.speechGeneration || session.finishing) return;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        stopEstimateTimer();
        if (session.state === STATE_PLAYING && session.chunkIndex < session.chunks.length - 1) {
          session.chunkIndex += 1;
          speakChunk(session.chunks[session.chunkIndex], generation);
        } else if (session.state === STATE_PLAYING) finishSpeech();
        return;
      }
      ui.showStatus(event.error === 'not-allowed' ? 'Speech permission was denied. Check your browser audio settings.' : 'Speech playback stopped unexpectedly. Try another voice or browser.', 'error');
      finishSpeech();
    };
    return utterance;
  }

  function speakChunk(chunk, generation = session.speechGeneration) {
    if (!session.supported || !session.synth) return;
    session.currentUtterance = buildUtterance(chunk, generation);
    session.synth.speak(session.currentUtterance);
  }

  function restartFromChar(startChar) {
    if (!session.supported || !session.synth || !session.fullSpokenText) return;
    const safeStart = Math.max(0, Math.min(startChar, session.fullSpokenText.length));
    session.chunks = chunkText(session.fullSpokenText.slice(safeStart), safeStart);
    session.chunkIndex = 0;
    session.finishing = false;
    session.visibilityInterrupted = false;
    session.speechCanceledWhileHidden = false;
    session.speechGeneration += 1;
    try { session.synth.cancel(); } catch (err) {}
    setState(STATE_PLAYING);
    startKeepAliveTimer();
    if (session.chunks.length) { speakChunk(session.chunks[0], session.speechGeneration); highlightAtIndex(safeStart); }
    else finishSpeech();
  }

  function restartFromWord(index) {
    if (session.lazyMode) { restartFromChar(session.currentCharIndex || 0); return; }
    const meta = session.wordMeta[index];
    restartFromChar(meta ? meta.start : 0);
  }

  function startSpeech(fromWordIndex = 0) {
    if (!session.supported || !session.synth) { ui.showStatus('Text-to-speech is not supported in your browser.', 'error'); return; }
    if (!els.readerContent) return;
    if (!session.wordMeta.length && !session.lazyMode) tokenize();
    if (!session.fullSpokenText) { ui.showStatus('No text content available to read.', 'info'); return; }
    if (session.lazyMode) restartFromChar(session.currentCharIndex || 0);
    else restartFromWord(Math.max(0, Math.min(fromWordIndex, session.wordMeta.length - 1)));
    ui.announceLive('Text-to-speech started.');
  }

  function startSpeechAtChar(charIndex) { restartFromChar(charIndex); }

  function pauseSpeech() {
    if (session.state !== STATE_PLAYING) return;
    stopEstimateTimer();
    stopKeepAliveTimer();
    if (session.isMobile) { session.speechGeneration += 1; try { session.synth.cancel(); } catch (err) {} }
    else { try { session.synth.pause(); } catch (err) {} }
    setState(STATE_PAUSED);
    ui.announceLive('Text-to-speech paused.');
  }

  function resumeSpeech() {
    if (session.state !== STATE_PAUSED) return;
    if (session.isMobile || session.speechCanceledWhileHidden) restartFromChar(session.currentCharIndex || 0);
    else { try { session.synth.resume(); } catch (err) {} setState(STATE_PLAYING); startKeepAliveTimer(); }
    ui.announceLive('Text-to-speech resumed.');
  }

  function finishSpeech() { stopTTS(); }

  function stopTTS() {
    if (session.finishing) return;
    session.finishing = true;
    session.speechGeneration += 1;
    session.visibilityInterrupted = false;
    session.speechCanceledWhileHidden = false;
    stopEstimateTimer();
    stopKeepAliveTimer();
    try { if (session.supported && session.synth) session.synth.cancel(); } catch (err) {}
    session.currentUtterance = null;
    clearHighlight();
    setState(STATE_IDLE);
    session.finishing = false;
    ui.announceLive('Text-to-speech stopped.');
  }

  function toggleTTS() {
    if (!session.supported || !session.synth) { ui.showStatus('Text-to-speech is not supported in your browser.', 'error'); return; }
    if (session.state === STATE_PLAYING) pauseSpeech();
    else if (session.state === STATE_PAUSED) resumeSpeech();
    else startSpeech(0);
  }

  function cycleVoiceSpeed() {
    const current = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : '1.0') || 1.0;
    let nextIndex = SPEED_STEPS.findIndex(speed => Math.abs(speed - current) < 0.05) + 1;
    if (nextIndex >= SPEED_STEPS.length || nextIndex === 0) nextIndex = 0;
    const nextSpeed = SPEED_STEPS[nextIndex];
    if (els.voiceRateInput) els.voiceRateInput.value = nextSpeed;
    if (els.voiceRateVal) els.voiceRateVal.textContent = `${nextSpeed.toFixed(1)}x`;
    if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${nextSpeed.toFixed(1)}x`;
    ui.announceLive(`Speech speed changed to ${nextSpeed.toFixed(1)}x.`);
    if (session.state === STATE_PLAYING) restartFromChar(session.currentCharIndex || 0);
  }

  function handlePageHide() {
    if (session.pageHideTimer) clearTimeout(session.pageHideTimer);
    if (session.state === STATE_PLAYING) {
      session.visibilityInterrupted = true;
      stopKeepAliveTimer();
      if (session.isMobile) { session.speechGeneration += 1; try { session.synth.cancel(); } catch (err) {} }
      else { try { session.synth.pause(); } catch (err) {} }
      setState(STATE_PAUSED);
    }
    session.pageHideTimer = setTimeout(() => {
      if (session.visibilityInterrupted && session.state === STATE_PAUSED) session.speechCanceledWhileHidden = true;
      try { session.synth.cancel(); } catch (err) {}
    }, PAGEHIDE_CANCEL_TIMEOUT);
  }

  function handlePageShow() {
    if (session.pageHideTimer) { clearTimeout(session.pageHideTimer); session.pageHideTimer = null; }
  }

  function handleVisibilityChange() {
    if (document.hidden && session.state === STATE_PLAYING) {
      session.visibilityInterrupted = true;
      stopKeepAliveTimer();
      if (session.isMobile) { session.speechGeneration += 1; try { session.synth.cancel(); } catch (err) {} }
      else { try { session.synth.pause(); } catch (err) {} }
      setState(STATE_PAUSED);
    } else if (!document.hidden && session.visibilityInterrupted) session.visibilityInterrupted = false;
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.ttsBtn) els.ttsBtn.addEventListener('click', toggleTTS);
    if (els.ttsStopBtn) els.ttsStopBtn.addEventListener('click', stopTTS);
    if (els.audioPlayPauseBtn) els.audioPlayPauseBtn.addEventListener('click', toggleTTS);
    if (els.audioStopBtn) els.audioStopBtn.addEventListener('click', stopTTS);
    if (els.audioSpeedBtn) els.audioSpeedBtn.addEventListener('click', cycleVoiceSpeed);
    if (els.voiceSelect) els.voiceSelect.addEventListener('change', () => { if (session.state === STATE_PLAYING) restartFromChar(session.currentCharIndex || 0); });
    if (els.voiceRateInput && els.voiceRateVal) {
      els.voiceRateInput.addEventListener('input', () => {
        const value = clampNumber(els.voiceRateInput.value, 1.0, 0.5, 2.5);
        els.voiceRateInput.value = value;
        els.voiceRateVal.textContent = `${value.toFixed(1)}x`;
        if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${value.toFixed(1)}x`;
      });
      els.voiceRateInput.addEventListener('change', () => {
        const value = clampNumber(els.voiceRateInput.value, 1.0, 0.5, 2.5);
        ui.announceLive(`Speech speed changed to ${value.toFixed(1)}x.`);
        if (session.state === STATE_PLAYING) restartFromChar(session.currentCharIndex || 0);
      });
    }
    if (session.supported && session.synth) {
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  function initializeVoices() {
    if (!session.supported || !session.synth) return;
    populateVoices();
    if ('onvoiceschanged' in session.synth) session.synth.onvoiceschanged = populateVoices;
    pollVoices();
  }

  return {
    bindEvents, initializeVoices, cycleVoiceSpeed, getSession: () => session, highlightAtIndex,
    pauseSpeech, populateVoices, restartFromWord, startSpeechAtChar, resumeSpeech, setState,
    startSpeech, stopTTS, tokenize, tokenizeReaderDOM, toggleTTS
  };
}
