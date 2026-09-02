'use strict';

const assert = require('node:assert');

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
    this.onstart = null;
    this.onboundary = null;
    this.onend = null;
    this.onerror = null;
  }
}

class FakeSynth {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.history = [];
    this.onvoiceschanged = null;
  }
  speak(utterance) {
    this.speaking = true;
    this.paused = false;
    this.history.push({ action: 'speak', text: utterance.text, rate: utterance.rate });
    if (utterance.onstart) utterance.onstart();
  }
  pause() {
    this.paused = true;
    this.history.push({ action: 'pause' });
  }
  resume() {
    this.paused = false;
    this.history.push({ action: 'resume' });
  }
  cancel() {
    this.speaking = false;
    this.paused = false;
    this.history.push({ action: 'cancel' });
  }
  getVoices() {
    return [];
  }
}

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

(async () => {
  global.SpeechSynthesisUtterance = FakeUtterance;
  global.document = { hidden: false, addEventListener() {} };
  const { createAppContext } = await import('../src/context.mjs');
  const { createTTS } = await import('../src/tts.mjs');

  function createFixture(isMobile) {
    const synth = new FakeSynth();
    const spans = Array.from({ length: 9 }, () => ({ classList: classList(), scrollIntoView() {} }));
    const context = createAppContext({
      readerContent: { querySelectorAll: () => [], contains: () => true },
      voiceRateInput: { value: '1.0' },
      ttsBtn: null,
      ttsStopBtn: null,
      audioPlayerBar: null,
      audioPlayPauseBtn: null,
      audioStopBtn: null,
      audioStatusText: null,
      audioSpeedBtn: null,
      voiceSelect: null
    });
    const session = context.runtime.tts;
    session.supported = true;
    session.synth = synth;
    session.isMobile = isMobile;
    session.wordSpans = spans;
    session.wordMeta = [
      { index: 0, text: 'The', start: 0, end: 3, element: spans[0] },
      { index: 1, text: 'quick', start: 4, end: 9, element: spans[1] },
      { index: 2, text: 'brown', start: 10, end: 15, element: spans[2] },
      { index: 3, text: 'fox', start: 16, end: 19, element: spans[3] },
      { index: 4, text: 'jumps', start: 20, end: 25, element: spans[4] },
      { index: 5, text: 'over', start: 26, end: 30, element: spans[5] },
      { index: 6, text: 'the', start: 31, end: 34, element: spans[6] },
      { index: 7, text: 'lazy', start: 35, end: 39, element: spans[7] },
      { index: 8, text: 'dog', start: 40, end: 43, element: spans[8] }
    ];
    session.fullSpokenText = 'The quick brown fox jumps over the lazy dog';
    const ui = { showStatus() {}, announceLive() {} };
    const controller = createTTS(context, { ui });
    return { controller, session, synth };
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
  const latestSpeech = mobile.synth.history.filter(entry => entry.action === 'speak').at(-1);
  assert(latestSpeech.text.startsWith('brown'));
  mobile.controller.stopTTS();
  assert.strictEqual(mobile.session.state, 'idle');

  console.log('Production TTS controller state-machine tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
