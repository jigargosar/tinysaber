const BPM      = 124;
const STEP_SEC = (60 / BPM) / 2; // 8th note
const LOOKAHEAD = 0.12;
const SCHED_MS  = 40;

const STAGES = [
  // Intro — kick + bass only
  {
    bars: 4,
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0],
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hat:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hatAcc:[0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    bass:  [130.8,0, 130.8,0, 196,0, 130.8,0,
            130.8,0, 155.6,0, 174.6,0, 130.8,0],
    arp:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  // Main — full drums, bass, sparse arp
  {
    bars: 4,
    kick:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hat:   [1,1,1,1, 1,1,1,0, 1,1,1,1, 1,1,1,0],
    hatAcc:[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    bass:  [130.8,0, 130.8,0, 196,0,   155.6,0,
            130.8,0, 174.6,0, 155.6,0, 196,  0],
    arp:   [392,0, 0,466, 0,0, 523,0,
            0,  0, 0,466, 0,0, 392,0],
  },
  // Peak — busier kick, doubled arp density, open hats
  {
    bars: 4,
    kick:  [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,1, 1,0,0,0],
    hat:   [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1],
    hatAcc:[1,0,1,0, 0,0,0,0, 1,0,1,0, 0,0,0,0],
    bass:  [130.8,0, 130.8,196, 155.6,0, 174.6,0,
            130.8,0, 130.8,196, 155.6,0, 130.8,0],
    arp:   [392,523, 466,0, 523,466, 392,0,
            622,0,   523,466, 0,392, 466,523],
  },
  // Break — snare every beat, stripped hat, wandering bass, no arp
  {
    bars: 4,
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    snare: [0,0,1,0, 1,0,1,0, 0,0,1,0, 1,0,0,0],
    hat:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hatAcc:[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    bass:  [130.8,0, 155.6,0, 174.6,0, 196,0,
            155.6,0, 130.8,0, 174.6,0, 155.6,0],
    arp:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
];

function getStage(globalStep) {
  const STEPS_PER_BAR = 16;
  const cycleLen = STAGES.reduce((s, st) => s + st.bars * STEPS_PER_BAR, 0);
  let remaining = globalStep % cycleLen;
  for (const stage of STAGES) {
    const stageSteps = stage.bars * STEPS_PER_BAR;
    if (remaining < stageSteps) return { stage, step: remaining % STEPS_PER_BAR };
    remaining -= stageSteps;
  }
  return { stage: STAGES[0], step: 0 };
}

export function createMusic() {
  const audioCtx   = new AudioContext();
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value      = 6;
  compressor.ratio.value     = 4;
  compressor.attack.value    = 0.003;
  compressor.release.value   = 0.25;
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.75;
  compressor.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  // Pre-baked noise buffers — allocated once, reused every note
  const SNARE_BUF = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * 0.15), audioCtx.sampleRate);
  (function(){ const d = SNARE_BUF.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();
  const HAT_BUF = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * 0.06), audioCtx.sampleRate);
  (function(){ const d = HAT_BUF.getChannelData(0);   for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; })();

  function playKick(t) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.connect(g); g.connect(compressor);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.01, t + 0.45);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  }

  function playSnare(t) {
    const noise = audioCtx.createBufferSource();
    const nGain = audioCtx.createGain();
    const nHp   = audioCtx.createBiquadFilter();
    nHp.type = 'highpass'; nHp.frequency.value = 1000;
    noise.buffer = SNARE_BUF;
    noise.connect(nHp); nHp.connect(nGain); nGain.connect(compressor);
    nGain.gain.setValueAtTime(0.3, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.start(t);
    const t1 = audioCtx.createOscillator();
    const g1 = audioCtx.createGain();
    t1.type = 'triangle'; t1.frequency.value = 185;
    t1.connect(g1); g1.connect(compressor);
    g1.gain.setValueAtTime(0.2, t);
    g1.gain.linearRampToValueAtTime(0.001, t + 0.08);
    t1.start(t); t1.stop(t + 0.08);
    const t2 = audioCtx.createOscillator();
    const g2 = audioCtx.createGain();
    t2.type = 'triangle'; t2.frequency.value = 349;
    t2.connect(g2); g2.connect(compressor);
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.linearRampToValueAtTime(0.001, t + 0.06);
    t2.start(t); t2.stop(t + 0.06);
  }

  function playHat(t, accent) {
    const dur = accent ? 0.055 : 0.035;
    const src = audioCtx.createBufferSource();
    const hp  = audioCtx.createBiquadFilter();
    const g   = audioCtx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    src.buffer = HAT_BUF;
    src.connect(hp); hp.connect(g); g.connect(compressor);
    g.gain.setValueAtTime(accent ? 0.14 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t);
  }

  function playBass(t, freq) {
    if (!freq) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(compressor);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_SEC * 1.6);
    o.start(t); o.stop(t + STEP_SEC * 1.7);
  }

  function playArp(t, freq) {
    if (!freq) return;
    const o  = audioCtx.createOscillator();
    const g  = audioCtx.createGain();
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(lp); lp.connect(g); g.connect(compressor);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_SEC * 0.6);
    o.start(t); o.stop(t + STEP_SEC * 0.7);
  }

  function scheduleStep(globalStep, t) {
    const { stage, step } = getStage(globalStep);
    if (stage.kick[step])  playKick(t);
    if (stage.snare[step]) playSnare(t);
    if (stage.hat[step])   playHat(t, stage.hatAcc[step]);
    playBass(t, stage.bass[step]);
    playArp(t,  stage.arp[step]);
  }

  let musicOn      = false;
  let schedStep    = 0;
  let nextStepTime = 0;

  setInterval(() => {
    if (!musicOn) return;
    while (nextStepTime < audioCtx.currentTime + LOOKAHEAD) {
      scheduleStep(schedStep++, nextStepTime);
      nextStepTime += STEP_SEC;
    }
  }, SCHED_MS);

  return {
    toggle() {
      musicOn = !musicOn;
      if (musicOn) {
        audioCtx.resume();
        nextStepTime = audioCtx.currentTime + 0.05;
        schedStep = 0;
      }
    },
  };
}
