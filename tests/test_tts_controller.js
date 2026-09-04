'use strict';

const assert = require('node:assert');

class FakeUtterance {
  constructor(text) { this.text = text; this.rate = 1; this.pitch = 1; this.voice = null; this.onstart = null; this.onboundary = null; this.onend = null; this.onerror = null; }
}
class FakeSynth {
  constructor() { this.speaking = false; this.paused = false; this.history = []; this.onvoiceschanged = null; }
  speak(utterance) { this.speaking = true; this.paused = false; this.history.push({ action: 'speak', text: utterance.text, rate: utterance.rate, utterance }); if (utterance.onstart) utterance.onstart(); }
  pause() { this.paused = true; this.history.push({ action: 'pause' }); }
  resume() { this.paused = false; this.history.push({ action: 'resume' }); }
  cancel() { this.speaking = false; this.paused = false; this.history.push({ action: 'cancel' }); }
  getVoices() { return []; }
}
function classList() { const values = new Set(); return { add(v) { values.add(v); }, remove(v) { values.delete(v); }, contains(v) { return values.has(v); } }; }

(async () => {
  global.SpeechSynthesisUtterance = FakeUtterance;
  global.document = { hidden: false, addEventListener() {} };
  const { createAppContext } = await import('../src/context.mjs');
  const { createTTS } = await import('../src/tts.mjs');

  function createFixture(isMobile, long = false) {
    const synth = new FakeSynth();
    const words = long ? Array.from({ length: 120 }, (_, i) => `word${i}`) : ['The', 'quick', 'brown', 'fox', 'jumps', 'over', 'the', 'lazy', 'dog'];
    const fullText = words.join(' ');
    const spans = words.map(() => ({ classList: classList(), scrollIntoView() {} }));
    const meta = [];
    let cursor = 0;
    words.forEach((word, index) => { const start = cursor; const end = start + word.length; meta.push({ index, text: word, start, end, element: spans[index] }); cursor = end + 1; });
    const context = createAppContext({ readerContent: { querySelectorAll: () => [], contains: () => true }, voiceRateInput: { value: '1.0' }, ttsBtn: null, ttsStopBtn: null, audioPlayerBar: null, audioPlayPauseBtn: null, audioStopBtn: null, audioStatusText: null, audioSpeedBtn: null, voiceSelect: null });
    const session = context.runtime.tts;
    session.supported = true; session.synth = synth; session.isMobile = isMobile; session.wordSpans = spans; session.wordMeta = meta; session.fullSpokenText = fullText;
    return { controller: createTTS(context, { ui: { showStatus() {}, announceLive() {} } }), session, synth };
  }

  const desktop = createFixture(false);
  desktop.controller.startSpeech(0);
  assert.strictEqual(desktop.session.state, 'playing');
  assert(desktop.session.keepAliveTimer);
  desktop.controller.pauseSpeech();
  assert.strictEqual(desktop.session.state, 'paused');
  assert.strictEqual(desktop.synth.history.at(-1).action, 'pause');
  desktop.controller.resumeSpeech();
  assert.strictEqual(desktop.session.state, 'playing');
  assert.strictEqual(desktop.synth.history.at(-1).action, 'resume');
  desktop.controller.stopTTS();
  assert.strictEqual(desktop.session.state, 'idle');

  const mobile = createFixture(true);
  mobile.controller.startSpeech(2);
  assert.strictEqual(mobile.session.state, 'playing');
  assert.strictEqual(mobile.session.keepAliveTimer, null);
  mobile.controller.pauseSpeech();
  assert.strictEqual(mobile.session.state, 'paused');
  assert.strictEqual(mobile.synth.history.at(-1).action, 'cancel');
  mobile.controller.resumeSpeech();
  assert.strictEqual(mobile.session.state, 'playing');
  assert(mobile.synth.history.at(-1).action === 'speak');
  assert(mobile.synth.history.at(-1).text.startsWith('brown'));
  mobile.controller.stopTTS();
  assert.strictEqual(mobile.session.state, 'idle');

  const multi = createFixture(false, true);
  multi.controller.startSpeech(0);
  assert(multi.session.chunks.length > 1, 'fixture must span multiple speech chunks');
  multi.session.currentUtterance.onend();
  assert.strictEqual(multi.session.state, 'playing', 'chunk completion should advance while playing');
  assert.strictEqual(multi.session.chunkIndex, 1);
  assert.strictEqual(multi.synth.history.filter(entry => entry.action === 'speak').length, 2);
  while (multi.session.state === 'playing') multi.session.currentUtterance.onend();
  assert.strictEqual(multi.session.state, 'idle', 'final chunk completion should end the session');

  const boundary = createFixture(false);
  boundary.controller.startSpeech(0);
  boundary.session.currentUtterance.onboundary({ name: 'word', charIndex: 4 });
  assert.strictEqual(boundary.session.currentWordIndex, 1);
  boundary.controller.stopTTS();

  console.log('Production TTS lifecycle, boundary, mobile, and multi-chunk tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Regression: chunk completion must chain to the next utterance before finishing the session.
