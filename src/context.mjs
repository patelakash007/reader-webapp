import { STATE_IDLE } from './constants.mjs';
import { isMobileDevice } from './utils.mjs';

export function createAppContext(els) {
  return {
    els,
    state: {
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
      wordCountTimer: null,
      lastCarouselDragDistance: 0
    },
    runtime: {
      autoScroll: {
        active: false,
        speed: 0.04,
        lastScrollTime: 0,
        accumulator: 0
      },
      reader: {
        activeRenderId: 0,
        isRulerActive: false,
        editDebounceTimer: null,
        lastActiveElement: null
      },
      file: {
        activeReadToken: 0,
        loadedLibraries: new Map()
      },
      fonts: {
        loaded: new Set(['sans', 'serif'])
      },
      tts: {
        voices: [],
        wordMeta: [],
        wordSpans: [],
        fullSpokenText: '',
        chunks: [],
        chunkIndex: 0,
        currentUtterance: null,
        currentWordIndex: -1,
        state: STATE_IDLE,
        finishing: false,
        chunkHasBoundary: false,
        estimateTimer: null,
        keepAliveTimer: null,
        pageHideTimer: null,
        speechGeneration: 0,
        visibilityInterrupted: false,
        speechCanceledWhileHidden: false,
        pausedAt: 0,
        isSpeaking: false,
        supported: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
        synth: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
          ? window.speechSynthesis
          : null,
        isMobile: isMobileDevice()
      }
    }
  };
}
