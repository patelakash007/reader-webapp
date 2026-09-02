// tts.js - Native TTS speech synthesis engine, voice management, chunking, and highlighting

import { clampNumber } from "./utils.js";
import { els, showStatus, announceLive } from "./ui.js";

export const STATE_IDLE = "idle";
export const STATE_PLAYING = "playing";
export const STATE_PAUSED = "paused";

export const CHUNK_TARGET = 190;
export const WORDS_PER_MIN = 180;
export const BOUNDARY_FALLBACK_MS = 100;
export const VOICE_POLL_MS = 250;
export const VOICE_POLL_TIMEOUT = 5000;
export const KEEP_ALIVE_MS = 10000;
export const PAGEHIDE_CANCEL_TIMEOUT = 15000;
export const SPEED_STEPS = [0.8, 1.0, 1.2, 1.5, 1.8, 2.0];

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
const synth = speechSupported ? window.speechSynthesis : null;
const isMobile = typeof navigator !== "undefined" && (/Android/i.test(navigator.userAgent) ||
  (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches));

let voices = [];
let wordMeta = [];
let wordSpans = [];
let fullSpokenText = "";
let chunks = [];
let chunkIndex = 0;
let currentUtterance = null;
let currentWordIndex = -1;
let ttsState = STATE_IDLE;
let ttsFinishing = false;
let chunkHasBoundary = false;
let estimateTimer = null;
let keepAliveTimer = null;
let pageHideTimer = null;
let speechGeneration = 0;
let visibilityInterrupted = false;
let speechCanceledWhileHidden = false;
let isSpeaking = false;
let selectedVoice = null;
let voiceRate = 1.0;
let voicePitch = 1.0;
let ttsCallbacks = {};

export function clearHighlight() {
  if (currentWordIndex >= 0 && wordSpans[currentWordIndex]) {
    wordSpans[currentWordIndex].classList.remove("active");
  }
  if (els.readerContent) {
    const activeSpans = els.readerContent.querySelectorAll(".tts-word.active");
    activeSpans.forEach(s => s.classList.remove("active"));
  }
  currentWordIndex = -1;
}

export function highlightAtIndex(absIndex) {
  if (!wordMeta.length) return;
  let idx = wordMeta.findIndex(w => absIndex >= w.start && absIndex < w.end);
  if (idx === -1) {
    for (let i = wordMeta.length - 1; i >= 0; i--) {
      if (wordMeta[i].start <= absIndex) {
        idx = i;
        break;
      }
    }
  }
  if (idx === -1 || idx === currentWordIndex) return;
  if (currentWordIndex >= 0 && wordSpans[currentWordIndex]) {
    wordSpans[currentWordIndex].classList.remove("active");
  }
  currentWordIndex = idx;
  const span = wordSpans[idx];
  if (span) {
    span.classList.add("active");
    const rate = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : String(voiceRate)) || 1.0;
    const scrollBehavior = rate > 1.5 ? "auto" : "smooth";
    try {
      span.scrollIntoView({ block: "nearest", behavior: scrollBehavior });
    } catch (e) {
      span.scrollIntoView();
    }
  }
}

export function tokenizeReaderDOM(containerElement) {
  clearHighlight();
  wordSpans = [];
  wordMeta = [];
  fullSpokenText = "";

  if (!containerElement || typeof document === "undefined") {
    return { spans: wordSpans, meta: wordMeta, text: fullSpokenText };
  }

  // TreeWalker to safely find text nodes in reader content without altering non-text structure
  const walker = document.createTreeWalker(containerElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_SKIP;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_SKIP;
      const tag = parent.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  const re = /\S+/g;
  let lastBlockElement = null;

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    const parentBlock = textNode.parentElement ? textNode.parentElement.closest("p, h1, h2, h3, li, blockquote, pre") : null;

    if (parentBlock && lastBlockElement && parentBlock !== lastBlockElement) {
      if (!fullSpokenText.endsWith("\n\n")) {
        if (!fullSpokenText.endsWith("\n")) fullSpokenText += "\n";
        fullSpokenText += "\n";
      }
    } else if (fullSpokenText.length > 0 && !/\s$/.test(fullSpokenText)) {
      fullSpokenText += " ";
    }
    lastBlockElement = parentBlock;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let m;

    while ((m = re.exec(text)) !== null) {
      if (m.index > lastIndex) {
        const ws = text.slice(lastIndex, m.index);
        frag.appendChild(document.createTextNode(ws));
        fullSpokenText += ws;
      }
      const wordText = m[0];
      const span = document.createElement("span");
      span.className = "tts-word";
      const wordIdx = wordMeta.length;
      span.setAttribute("data-word-idx", String(wordIdx));
      span.textContent = wordText;
      frag.appendChild(span);

      const wordStart = fullSpokenText.length;
      fullSpokenText += wordText;
      const wordEnd = fullSpokenText.length;

      wordSpans.push(span);
      wordMeta.push({
        index: wordIdx,
        text: wordText,
        start: wordStart,
        end: wordEnd,
        element: span
      });

      lastIndex = m.index + wordText.length;
    }

    if (lastIndex < text.length) {
      const trailing = text.slice(lastIndex);
      frag.appendChild(document.createTextNode(trailing));
      fullSpokenText += trailing;
    }

    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode);
    }
  });

  return { spans: wordSpans, meta: wordMeta, wordMeta, text: fullSpokenText, fullSpokenText };
}

export function chunkText(text, baseOffset = 0, targetLen = CHUNK_TARGET) {
  const out = [];
  const len = text.length;
  let start = 0;
  while (start < len) {
    if (len - start <= targetLen) {
      out.push({ text: text.slice(start), start: baseOffset + start, end: baseOffset + len });
      break;
    }
    const end = start + targetLen;
    let splitAt = -1;
    for (let i = Math.min(end, len - 1); i > start; i--) {
      if (/\s/.test(text[i])) {
        splitAt = i;
        break;
      }
    }
    if (splitAt === -1) splitAt = end;
    out.push({ text: text.slice(start, splitAt), start: baseOffset + start, end: baseOffset + splitAt });
    start = splitAt;
    while (start < len && /\s/.test(text[start])) start++;
  }
  return out;
}

export function populateVoices() {
  if (!speechSupported || !synth) return [];
  const list = synth.getVoices();
  if (!list || !list.length) return [];

  const seen = new Set();
  const unique = [];
  list.forEach(v => {
    const key = v.name + "\0" + v.lang;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(v);
    }
  });

  voices = unique.sort((a, b) => {
    if (a.default !== b.default) return a.default ? -1 : 1;
    const la = a.lang || "";
    const lb = b.lang || "";
    if (la !== lb) return la.localeCompare(lb);
    return a.name.localeCompare(b.name);
  });

  if (els.voiceSelect && typeof document !== "undefined") {
    const prevSelection = els.voiceSelect.value || "";
    els.voiceSelect.innerHTML = "";

    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = v.voiceURI || String(i);
      opt.textContent = `${v.name} (${v.lang})${v.default ? " — default" : ""}`;
      opt.dataset.voiceIndex = String(i);
      els.voiceSelect.appendChild(opt);
    });

    let chosenIndex = -1;
    if (prevSelection) {
      chosenIndex = voices.findIndex(v => v.voiceURI === prevSelection || String(voices.indexOf(v)) === prevSelection || v.name === prevSelection);
    }
    if (chosenIndex === -1) {
      const userLang = (typeof navigator !== "undefined" && navigator.language) || "en-US";
      chosenIndex = voices.findIndex(v => v.lang === userLang);
      if (chosenIndex === -1) {
        chosenIndex = voices.findIndex(v => v.lang && v.lang.split("-")[0] === userLang.split("-")[0]);
      }
      if (chosenIndex === -1) chosenIndex = voices.findIndex(v => v.default);
      if (chosenIndex === -1) chosenIndex = 0;
    }

    if (chosenIndex >= 0 && chosenIndex < voices.length) {
      els.voiceSelect.value = voices[chosenIndex].voiceURI || String(chosenIndex);
      selectedVoice = voices[chosenIndex];
    }
  }

  return voices;
}

export function pollVoices() {
  if (!speechSupported) return;
  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += VOICE_POLL_MS;
    populateVoices();
    if ((voices && voices.length) || elapsed >= VOICE_POLL_TIMEOUT) {
      clearInterval(id);
    }
  }, VOICE_POLL_MS);
}

export function getVoices() {
  return voices.length ? voices : populateVoices();
}

export function getSelectedVoice() {
  if (selectedVoice) return selectedVoice;
  if (!voices.length) populateVoices();
  if (!voices.length) return null;
  if (els.voiceSelect) {
    const val = els.voiceSelect.value;
    return voices.find(v => v.voiceURI === val) || voices[parseInt(val, 10)] || voices[0] || null;
  }
  return voices[0] || null;
}

export function setVoice(voice) {
  if (typeof voice === "string") {
    selectedVoice = voices.find(v => v.voiceURI === voice || v.name === voice) || null;
  } else {
    selectedVoice = voice;
  }
  if (selectedVoice && els.voiceSelect) {
    els.voiceSelect.value = selectedVoice.voiceURI || String(voices.indexOf(selectedVoice));
  }
}

export function startEstimateTimer(chunk, generation) {
  stopEstimateTimer();
  if (!wordMeta.length) return;
  const rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : String(voiceRate), 1.0, 0.5, 2.5);
  const startIdx = chunkIndex;
  const firstWord = wordMeta.findIndex(word => word.end > chunk.start);
  const firstWordIndex = firstWord === -1 ? wordMeta.length - 1 : firstWord;
  const lastWord = wordMeta.reduce((last, word, index) => word.start < chunk.end ? index : last, firstWordIndex);
  let elapsed = 0;

  if (firstWordIndex >= 0 && firstWordIndex < wordMeta.length) {
    highlightAtIndex(wordMeta[firstWordIndex].start);
  }

  estimateTimer = setInterval(() => {
    if (generation !== speechGeneration || ttsFinishing || ttsState !== STATE_PLAYING || chunkIndex !== startIdx) {
      stopEstimateTimer();
      return;
    }
    elapsed += BOUNDARY_FALLBACK_MS;
    const wordsPerMs = (WORDS_PER_MIN * rate) / 60000;
    const estimatedOffset = Math.floor(elapsed * wordsPerMs);
    const idx = Math.min(lastWord, firstWordIndex + estimatedOffset);
    if (idx >= firstWordIndex && idx !== currentWordIndex && idx < wordMeta.length) {
      highlightAtIndex(wordMeta[idx].start);
    }
  }, BOUNDARY_FALLBACK_MS);
}

export function stopEstimateTimer() {
  if (estimateTimer) {
    clearInterval(estimateTimer);
    estimateTimer = null;
  }
}

export function startKeepAliveTimer() {
  stopKeepAliveTimer();
  if (isMobile) return;
  keepAliveTimer = setInterval(() => {
    if (ttsFinishing || ttsState !== STATE_PLAYING) return;
    try {
      if (synth && synth.speaking) {
        synth.pause();
        synth.resume();
      }
    } catch (e) {}
  }, KEEP_ALIVE_MS);
}

export function stopKeepAliveTimer() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

export function setTTSState(next) {
  ttsState = next;
  const idle = ttsState === STATE_IDLE;
  const playing = ttsState === STATE_PLAYING;
  const paused = ttsState === STATE_PAUSED;
  isSpeaking = playing || paused;

  if (els.ttsBtn) {
    els.ttsBtn.classList.toggle("active", playing || paused);
    els.ttsBtn.setAttribute("aria-pressed", playing ? "true" : "false");
    if (playing) {
      els.ttsBtn.innerHTML = "<span aria-hidden=\"true\">&#x23F8;</span> Pause";
      els.ttsBtn.setAttribute("aria-label", "Pause Read Aloud");
      els.ttsBtn.setAttribute("title", "Pause Read Aloud");
    } else if (paused) {
      els.ttsBtn.innerHTML = "<span aria-hidden=\"true\">&#x25B6;</span> Resume";
      els.ttsBtn.setAttribute("aria-label", "Resume Read Aloud");
      els.ttsBtn.setAttribute("title", "Resume Read Aloud");
    } else {
      els.ttsBtn.innerHTML = "<span aria-hidden=\"true\">&#x1F50A;</span> Read Aloud";
      els.ttsBtn.setAttribute("aria-label", "Start Read Aloud");
      els.ttsBtn.setAttribute("title", "Start Read Aloud");
    }
  }

  if (els.ttsStopBtn) {
    els.ttsStopBtn.disabled = idle;
  }

  if (els.audioPlayerBar) {
    els.audioPlayerBar.classList.toggle("active", !idle);
  }

  if (els.audioPlayPauseBtn) {
    if (playing) {
      els.audioPlayPauseBtn.innerHTML = "<span aria-hidden=\"true\">&#x23F8;</span>";
      els.audioPlayPauseBtn.setAttribute("aria-label", "Pause narration");
      els.audioPlayPauseBtn.setAttribute("title", "Pause narration");
    } else {
      els.audioPlayPauseBtn.innerHTML = "<span aria-hidden=\"true\">&#x25B6;</span>";
      els.audioPlayPauseBtn.setAttribute("aria-label", paused ? "Resume narration" : "Play narration");
      els.audioPlayPauseBtn.setAttribute("title", paused ? "Resume narration" : "Play narration");
    }
  }

  if (els.audioStopBtn) {
    els.audioStopBtn.disabled = idle;
  }

  if (els.audioStatusText) {
    if (playing) {
      els.audioStatusText.textContent = "Speaking...";
    } else if (paused) {
      els.audioStatusText.textContent = "Paused";
    } else {
      els.audioStatusText.textContent = "Speech Ready";
    }
  }
}

export function getTTSState() {
  return {
    state: ttsState,
    isPlaying: ttsState === STATE_PLAYING,
    isPaused: ttsState === STATE_PAUSED,
    isIdle: ttsState === STATE_IDLE,
    isSpeaking,
    speechGeneration,
    voiceRate,
    voicePitch,
    currentWordIndex
  };
}

export function isPlayingOrPaused() {
  return ttsState === STATE_PLAYING || ttsState === STATE_PAUSED;
}

export function buildUtterance(chunk, generation) {
  if (typeof SpeechSynthesisUtterance === "undefined") return null;
  const utt = new SpeechSynthesisUtterance(chunk.text);
  const voice = getSelectedVoice();
  if (voice) utt.voice = voice;
  const rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : String(voiceRate), 1.0, 0.5, 2.5);
  utt.rate = rate;
  utt.pitch = voicePitch;
  chunkHasBoundary = false;

  utt.onboundary = (e) => {
    if (generation !== speechGeneration || (e.name && e.name !== "word")) return;
    chunkHasBoundary = true;
    stopEstimateTimer();
    highlightAtIndex(chunk.start + e.charIndex);
    if (typeof ttsCallbacks.onBoundary === "function") {
      try { ttsCallbacks.onBoundary(e); } catch (err) {}
    }
  };

  utt.onstart = () => {
    if (generation !== speechGeneration || ttsFinishing) return;
    if (!chunkHasBoundary) {
      startEstimateTimer(chunk, generation);
    }
    if (typeof ttsCallbacks.onStart === "function") {
      try { ttsCallbacks.onStart(); } catch (err) {}
    }
  };

  utt.onend = () => {
    if (generation !== speechGeneration || ttsFinishing) return;
    stopEstimateTimer();
    if (ttsState === STATE_PLAYING && chunkIndex < chunks.length - 1) {
      chunkIndex++;
      speakChunk(chunks[chunkIndex], generation);
    } else if (ttsState === STATE_PLAYING) {
      finishSpeech();
      if (typeof ttsCallbacks.onEnd === "function") {
        try { ttsCallbacks.onEnd(); } catch (err) {}
      }
    }
  };

  utt.onerror = (e) => {
    if (generation !== speechGeneration || ttsFinishing) return;
    if (typeof ttsCallbacks.onError === "function") {
      try { ttsCallbacks.onError(e); } catch (err) {}
    }
    if (e.error === "interrupted" || e.error === "canceled") {
      stopEstimateTimer();
      if (ttsState === STATE_PLAYING && chunkIndex < chunks.length - 1) {
        chunkIndex++;
        speakChunk(chunks[chunkIndex], generation);
      } else if (ttsState === STATE_PLAYING) {
        finishSpeech();
      }
      return;
    }
    if (e.error === "not-allowed" || ttsState !== STATE_IDLE) {
      const message = e.error === "not-allowed"
        ? "Speech permission was denied. Check your browser audio settings."
        : "Speech playback stopped unexpectedly. Try another voice or browser.";
      showStatus(message, "error");
      finishSpeech();
    }
  };

  return utt;
}

export function speakChunk(chunk, generation = speechGeneration) {
  if (!speechSupported || !synth) return;
  currentUtterance = buildUtterance(chunk, generation);
  if (currentUtterance) {
    synth.speak(currentUtterance);
  }
}

export function startSpeech(fromWordIndex = 0) {
  if (!speechSupported || !synth) {
    showStatus("Text-to-speech is not supported in your browser.", "error");
    return;
  }
  if (!els.readerContent) return;

  if (!wordMeta.length) {
    tokenizeReaderDOM(els.readerContent);
  }
  if (!fullSpokenText || !wordMeta.length) {
    showStatus("No text content available to read.", "info");
    return;
  }

  const targetIdx = Math.max(0, Math.min(fromWordIndex, wordMeta.length - 1));
  restartFromWord(targetIdx);
  announceLive("Text-to-speech started.");
}

export function restartFromWord(idx = 0) {
  if (!speechSupported || !synth || !fullSpokenText || !wordMeta.length) return;
  const meta = wordMeta[idx];
  const startChar = meta ? meta.start : 0;
  chunks = chunkText(fullSpokenText.slice(startChar), startChar);
  chunkIndex = 0;
  ttsFinishing = false;
  visibilityInterrupted = false;
  speechCanceledWhileHidden = false;
  speechGeneration++;
  try { synth.cancel(); } catch (e) {}
  setTTSState(STATE_PLAYING);
  startKeepAliveTimer();
  if (chunks.length > 0) {
    speakChunk(chunks[0], speechGeneration);
    highlightAtIndex(startChar);
  } else {
    finishSpeech();
  }
}

export function pauseSpeech() {
  if (ttsState !== STATE_PLAYING) return;
  stopEstimateTimer();
  stopKeepAliveTimer();
  if (isMobile) {
    speechGeneration++;
    try { if (synth) synth.cancel(); } catch (e) {}
  } else {
    try { if (synth) synth.pause(); } catch (e) {}
  }
  setTTSState(STATE_PAUSED);
  announceLive("Text-to-speech paused.");
}

export function resumeSpeech() {
  if (ttsState !== STATE_PAUSED) return;
  if (isMobile || speechCanceledWhileHidden) {
    restartFromWord(currentWordIndex >= 0 ? currentWordIndex : 0);
  } else {
    try { if (synth) synth.resume(); } catch (e) {}
    setTTSState(STATE_PLAYING);
    startKeepAliveTimer();
  }
  announceLive("Text-to-speech resumed.");
}

export function finishSpeech() {
  stopTTS();
}

export function stopTTS() {
  if (ttsFinishing) return;
  ttsFinishing = true;
  speechGeneration++;
  visibilityInterrupted = false;
  speechCanceledWhileHidden = false;
  stopEstimateTimer();
  stopKeepAliveTimer();
  if (speechSupported && synth) {
    try { synth.cancel(); } catch (e) {}
  }
  currentUtterance = null;
  clearHighlight();
  setTTSState(STATE_IDLE);
  ttsFinishing = false;
  announceLive("Text-to-speech stopped.");
}

export function toggleTTS() {
  if (!speechSupported || !synth) {
    showStatus("Text-to-speech is not supported in your browser.", "error");
    return;
  }
  if (ttsState === STATE_PLAYING) {
    pauseSpeech();
  } else if (ttsState === STATE_PAUSED) {
    resumeSpeech();
  } else {
    startSpeech(0);
  }
}

export function cycleVoiceSpeed() {
  const current = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : String(voiceRate)) || 1.0;
  let nextIdx = SPEED_STEPS.findIndex(s => Math.abs(s - current) < 0.05) + 1;
  if (nextIdx >= SPEED_STEPS.length || nextIdx === 0) nextIdx = 0;
  const nextSpeed = SPEED_STEPS[nextIdx];
  setVoiceRate(nextSpeed);
  announceLive(`Speech speed changed to ${nextSpeed.toFixed(1)}x.`);
  return nextSpeed;
}

export function setVoiceRate(rate) {
  voiceRate = clampNumber(rate, 1.0, 0.5, 2.5);
  if (els.voiceRateInput) {
    els.voiceRateInput.value = voiceRate;
  }
  if (els.voiceRateVal) {
    els.voiceRateVal.textContent = `${voiceRate.toFixed(1)}x`;
  }
  if (els.audioSpeedBtn) {
    els.audioSpeedBtn.textContent = `${voiceRate.toFixed(1)}x`;
  }
}

export function setSpeechRate(rate) {
  setVoiceRate(rate);
}

export function setSpeechPitch(pitch) {
  voicePitch = clampNumber(pitch, 1.0, 0.5, 2.0);
}

export function getSpeechPitch() {
  return voicePitch;
}

export function handlePageHide() {
  if (pageHideTimer) clearTimeout(pageHideTimer);
  if (ttsState === STATE_PLAYING) {
    visibilityInterrupted = true;
    stopKeepAliveTimer();
    if (isMobile) {
      speechGeneration++;
      try { synth.cancel(); } catch (e) {}
    } else {
      try { synth.pause(); } catch (e) {}
    }
    setTTSState(STATE_PAUSED);
  }
  pageHideTimer = setTimeout(() => {
    if (visibilityInterrupted && ttsState === STATE_PAUSED) {
      speechCanceledWhileHidden = true;
    }
    try { if (synth) synth.cancel(); } catch (e) {}
  }, PAGEHIDE_CANCEL_TIMEOUT);
}

export function handlePageShow() {
  if (pageHideTimer) {
    clearTimeout(pageHideTimer);
    pageHideTimer = null;
  }
}

export function handleVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.hidden) {
    if (ttsState === STATE_PLAYING) {
      visibilityInterrupted = true;
      stopKeepAliveTimer();
      if (isMobile) {
        speechGeneration++;
        try { synth.cancel(); } catch (e) {}
      } else {
        try { synth.pause(); } catch (e) {}
      }
      setTTSState(STATE_PAUSED);
    }
  } else if (visibilityInterrupted) {
    visibilityInterrupted = false;
  }
}

export function initTTS(config = {}) {
  ttsCallbacks = config || {};
  if (speechSupported && synth) {
    if ("onvoiceschanged" in synth) {
      synth.onvoiceschanged = populateVoices;
    }
    populateVoices();
    pollVoices();

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", handlePageHide);
      window.addEventListener("pageshow", handlePageShow);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
  }
}

export function destroyTTS() {
  stopTTS();
  if (typeof window !== "undefined") {
    window.removeEventListener("pagehide", handlePageHide);
    window.removeEventListener("pageshow", handlePageShow);
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  }
}

// Interface Contract Aliases
export const tokenizeReaderContent = tokenizeReaderDOM;
export const chunkTextForUtterance = (text, maxLen = CHUNK_TARGET) => chunkText(text, 0, maxLen);
export const speakWord = (index = 0) => startSpeech(index);
export const togglePlayPause = toggleTTS;
export const stopSpeech = stopTTS;
export const setSelectedVoice = (voiceURI) => setVoice(voiceURI);
