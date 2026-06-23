// Random NPC dialogue-voice player ("Crazy Dave" babble style).
//
// Plays a rapid burst of very short pitched syllables whenever a character
// speaks, to create the feeling of "this character is talking" — it is NOT
// lip-sync, and deliberately produces NO intelligible human speech. Each
// syllable is a tiny 40–110ms slice cut from a random offset in a source
// clip, so no real word is recognizable; the source mp3s are used purely as
// raw timbre material.
//
// Liveliness comes from a bouncy pitch contour applied per-syllable via
// BufferSource.playbackRate: a per-character base pitch + a sine/zigzag swing
// across the syllable sequence + small random jitter + a subtle per-slice
// glide. Each character has its own voice color (grandpa lower/slower bounce,
// xiaoman higher/faster bounce).
//
// Reusable for any NPC: call play(speaker, text). Built on the Web Audio API;
// degrades silently when unavailable.

const VOICE_BASE = '/web/generated/voice';
const VOICE_SETS = {
  grandpa: [`${VOICE_BASE}/grandpa-1.mp3`, `${VOICE_BASE}/grandpa-2.mp3`],
  xiaoman: [`${VOICE_BASE}/xiaoman-1.mp3`, `${VOICE_BASE}/xiaoman-2.mp3`],
};

// Per-character voice color. basePitch sets the overall timbre; pitchSwing is
// the amplitude of the bouncy contour; swingSpeed controls how fast the bounce
// cycles across syllables (radians per syllable). Grandpa is clearly lower and
// bounces slower; xiaoman is higher and livelier.
const VOICE_COLORS = {
  grandpa: { basePitch: 0.72, pitchSwing: 0.34, swingSpeed: 1.55, filterHz: 1050 },
  xiaoman: { basePitch: 1.46, pitchSwing: 0.42, swingSpeed: 2.05, filterHz: 1800 },
  default: { basePitch: 1.08, pitchSwing: 0.38, swingSpeed: 1.8, filterHz: 1450 },
};

// Short syllable slices so no real word survives.
const SLICE_MIN_S = 0.022;
const SLICE_MAX_S = 0.07;
// Tight gaps -> rapid babble.
const GAP_MIN_S = 0.012;
const GAP_MAX_S = 0.045;
// Short envelope (attack === release) to keep crisp syllables without clicks.
const ENVELOPE_MIN_S = 0.006;
const ENVELOPE_MAX_S = 0.012;
// Syllable count scaling: clamp(round(textLength / 3.5), 3, 14).
const CHARS_PER_SYLLABLE = 3;
const MIN_SYLLABLES = 4;
const MAX_SYLLABLES = 18;
// Safety clamp for playbackRate so pitch jitter can never go silent/extreme.
const PLAYBACK_RATE_MIN = 0.5;
const PLAYBACK_RATE_MAX = 2.2;
// Per-syllable jitter & glide amounts (small, subtle).
const PITCH_JITTER = 0.12;
const PITCH_GLIDE = 0.18;
// Per-syllable peak gain bounce, kept below 1 to avoid clipping.
const GAIN_BASE = 0.82;
const GAIN_VARIATION = 0.14;

function speakerToSet(speaker) {
  if (speaker && speaker.includes('爷')) {
    return 'grandpa';
  }
  return 'xiaoman'; // 小满 / 小满（心里）/ fallback
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createDialogueVoicePlayer() {
  let ctx = null;
  const buffers = new Map(); // url -> AudioBuffer
  let activeSources = [];
  let token = 0; // bumped on stop() to cancel any in-flight scheduling
  let lastCombo = '';

  function ensureContext() {
    if (ctx) {
      return ctx;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
      return null;
    }
    try {
      ctx = new AudioCtor();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  async function loadBuffer(url) {
    if (buffers.has(url)) {
      return buffers.get(url);
    }
    const audioCtx = ensureContext();
    if (!audioCtx) {
      return null;
    }
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(data);
    buffers.set(url, buffer);
    return buffer;
  }

  // Resume the context and warm the buffer pool. Must be called from a user
  // gesture (browsers block AudioContext until then).
  function unlock() {
    const audioCtx = ensureContext();
    if (!audioCtx) {
      return;
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    Object.values(VOICE_SETS)
      .flat()
      .forEach((url) => {
        loadBuffer(url).catch(() => {});
      });
  }

  function stop() {
    token += 1;
    activeSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    activeSources = [];
  }

  function pickSyllableCount(text) {
    const length = text ? text.length : 0;
    const scaled = Math.round(length / CHARS_PER_SYLLABLE);
    return clamp(scaled, MIN_SYLLABLES, MAX_SYLLABLES);
  }

  function pickSequence(poolSize, count) {
    const sequence = [];
    let previous = -1;
    for (let i = 0; i < count; i += 1) {
      let index = Math.floor(Math.random() * poolSize);
      if (poolSize > 1 && index === previous) {
        index = (index + 1) % poolSize; // no immediate repeat of the same clip
      }
      sequence.push(index);
      previous = index;
    }
    return sequence;
  }

  function play(speaker, text) {
    const audioCtx = ensureContext();
    if (!audioCtx) {
      return;
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    stop();
    const myToken = token;

    const setName = speakerToSet(speaker);
    const pool = VOICE_SETS[setName];
    if (!pool || !pool.length) {
      return;
    }
    const color = VOICE_COLORS[setName] || VOICE_COLORS.default;

    const count = pickSyllableCount(text);
    let sequence = pickSequence(pool.length, count);
    if (sequence.join('-') === lastCombo && pool.length > 1) {
      sequence = pickSequence(pool.length, count); // try once more to vary the combo
    }
    lastCombo = sequence.join('-');

    // Random phase so the bouncy contour doesn't always start the same way.
    const swingPhase = Math.random() * Math.PI * 2;

    (async () => {
      const clips = await Promise.all(
        sequence.map((index) => loadBuffer(pool[index]).catch(() => null)),
      );
      if (myToken !== token) {
        return; // stop() was called while decoding
      }
      let when = audioCtx.currentTime + 0.02;
      clips.forEach((buffer, i) => {
        if (!buffer) {
          return;
        }
        const slice = Math.min(
          buffer.duration,
          SLICE_MIN_S + Math.random() * (SLICE_MAX_S - SLICE_MIN_S),
        );
        const maxOffset = Math.max(0, buffer.duration - slice);
        const offset = Math.random() * maxOffset;

        // Bouncy pitch contour: base + sine swing over the syllable index
        // (a couple of zigzag bounces) + a small random jitter. Clamp to a
        // safe positive range so playbackRate is always valid (no NaN/0).
        const swing = Math.sin(swingPhase + i * color.swingSpeed) * color.pitchSwing;
        const jitter = (Math.random() * 2 - 1) * PITCH_JITTER;
        const startRate = clamp(
          color.basePitch + swing + jitter,
          PLAYBACK_RATE_MIN,
          PLAYBACK_RATE_MAX,
        );
        // Subtle per-syllable glide up or down across the slice.
        const glide = (Math.random() * 2 - 1) * PITCH_GLIDE;
        const endRate = clamp(startRate + glide, PLAYBACK_RATE_MIN, PLAYBACK_RATE_MAX);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(startRate, when);
        source.playbackRate.linearRampToValueAtTime(endRate, when + slice);

        // Short envelope so each syllable has a crisp shape but no click.
        const env = ENVELOPE_MIN_S + Math.random() * (ENVELOPE_MAX_S - ENVELOPE_MIN_S);
        const fade = Math.min(env, slice / 2);
        const peak = clamp(GAIN_BASE + (Math.random() * 2 - 1) * GAIN_VARIATION, 0.4, 0.98);
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(color.filterHz + (Math.random() * 2 - 1) * 260, when);
        filter.Q.setValueAtTime(4.8 + Math.random() * 3.2, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(peak, when + fade);
        gain.gain.setValueAtTime(peak, when + slice - fade);
        gain.gain.linearRampToValueAtTime(0.0001, when + slice);

        source.connect(filter).connect(gain).connect(audioCtx.destination);
        source.start(when, offset, slice);
        activeSources.push(source);

        const gap = GAP_MIN_S + Math.random() * (GAP_MAX_S - GAP_MIN_S);
        when += slice + gap;
      });
    })();
  }

  return { play, stop, unlock };
}
