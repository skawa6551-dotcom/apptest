// ============================================================
// sound.js
// タップ音・成功音・エラー音の生成（Web Audio API, OscillatorNode）と
// バイブレーションのみを担当するモジュール。
// DOM操作・Storageアクセス・settings.jsへの依存は一切行わない。
// ============================================================

let audioContext = null;

const activeOscillators = new Set();

const TAP_SOUND = Object.freeze({
  waveform: 'sine',
  frequency: 880,
  duration: 0.04,
  peakGain: 0.15,
});

const SUCCESS_SOUND = Object.freeze({
  waveform: 'sine',
  peakGain: 0.18,
  notes: Object.freeze([
    Object.freeze({ frequency: 880, startOffset: 0, duration: 0.08 }),
    Object.freeze({ frequency: 1320, startOffset: 0.07, duration: 0.12 }),
  ]),
});

const ERROR_SOUND = Object.freeze({
  waveform: 'square',
  peakGain: 0.12,
  notes: Object.freeze([
    Object.freeze({ frequency: 220, startOffset: 0, duration: 0.12 }),
    Object.freeze({ frequency: 160, startOffset: 0.1, duration: 0.16 }),
  ]),
});

const ENVELOPE_RAMP_TIME = 0.01;

const VIBRATION_DURATION_MS = 15;

const RESUMABLE_STATES = new Set(['suspended', 'interrupted']);

function attachStateChangeListener(context) {
  context.addEventListener('statechange', () => {
    if (RESUMABLE_STATES.has(context.state)) {
      context.resume().catch(() => {});
    }
  });
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;

  if (audioContext) {
    if (RESUMABLE_STATES.has(audioContext.state)) {
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextClass !== 'function') return null;

  try {
    audioContext = new AudioContextClass();
    attachStateChangeListener(audioContext);
  } catch (error) {
    audioContext = null;
  }

  return audioContext;
}

function playTone(context, tone, startOffset = 0) {
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = tone.waveform;
  oscillator.frequency.value = tone.frequency;

  const startTime = context.currentTime + startOffset;
  const rampTime = Math.min(ENVELOPE_RAMP_TIME, tone.duration / 2);
  const stopTime = startTime + tone.duration;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(tone.peakGain, startTime + rampTime);
  gainNode.gain.linearRampToValueAtTime(0, stopTime);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  activeOscillators.add(oscillator);
  oscillator.addEventListener('ended', () => {
    oscillator.disconnect();
    gainNode.disconnect();
    activeOscillators.delete(oscillator);
  });

  oscillator.start(startTime);
  oscillator.stop(stopTime);
}

export function playTap() {
  const context = getAudioContext();
  if (!context) return;
  playTone(context, TAP_SOUND, 0);
}

export function playSuccess() {
  const context = getAudioContext();
  if (!context) return;

  SUCCESS_SOUND.notes.forEach((note) => {
    playTone(
      context,
      {
        waveform: SUCCESS_SOUND.waveform,
        frequency: note.frequency,
        duration: note.duration,
        peakGain: SUCCESS_SOUND.peakGain,
      },
      note.startOffset,
    );
  });
}

export function playError() {
  const context = getAudioContext();
  if (!context) return;

  ERROR_SOUND.notes.forEach((note) => {
    playTone(
      context,
      {
        waveform: ERROR_SOUND.waveform,
        frequency: note.frequency,
        duration: note.duration,
        peakGain: ERROR_SOUND.peakGain,
      },
      note.startOffset,
    );
  });
}

export function vibrate() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(VIBRATION_DURATION_MS);
}

export function stopAll() {
  activeOscillators.forEach((oscillator) => {
    try {
      oscillator.stop();
    } catch (error) {
      // 既に停止済みのOscillatorへのstop()呼び出しは例外になるため無視する
    }
  });
  activeOscillators.clear();

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(0);
  }
}

export async function destroy() {
  stopAll();

  if (audioContext && audioContext.state !== 'closed') {
    try {
      await audioContext.close();
    } catch (error) {
      // 既にclose済み、またはclose未対応の環境では無視する
    }
  }

  audioContext = null;
}

function handleVisibilityChange() {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'hidden') {
    stopAll();
  }
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

const Sound = Object.freeze({
  playTap,
  playSuccess,
  playError,
  vibrate,
  stopAll,
  destroy,
});

export default Sound;
