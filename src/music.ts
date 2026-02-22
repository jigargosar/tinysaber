import Mutex from 'p-mutex';

const BPM          = 124;
const STEP_SEC     = (60 / BPM) / 2; // 8th note
const LOOKAHEAD    = 0.12;
const SCHED_MS     = 40;
const STEPS_PER_BAR = 16;

interface Stage {
  bars: number;
  kick:   number[];
  snare:  number[];
  hat:    number[];
  hatAcc: number[];
  bass:   number[];
  arp:    number[];
}

const STAGES: Stage[] = [
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

interface SongSection {
  stage: Stage;
  step: number;
  extraKick: boolean;
}

function getSongSection(globalStep: number): SongSection {
  const cycleLen = STAGES.reduce((s, st) => s + st.bars * STEPS_PER_BAR, 0);
  let remaining = globalStep % cycleLen;
  for (const stage of STAGES) {
    const stageSteps = stage.bars * STEPS_PER_BAR;
    if (remaining < stageSteps) {
      const bar  = Math.floor(remaining / STEPS_PER_BAR);
      const step = remaining % STEPS_PER_BAR;
      // Intro only: on even bars (1, 3), add a kick hit on step 2
      const extraKick = stage === STAGES[0] && bar % 2 === 1 && step === 2;
      return { stage, step, extraKick };
    }
    remaining -= stageSteps;
  }
  return { stage: STAGES[0], step: 0, extraKick: false };
}

interface AudioGraph {
  audioCtx: AudioContext;
  compressor: DynamicsCompressorNode;
}

function createNoiseBuffer(audioCtx: AudioContext, duration: number): AudioBuffer {
  const buf = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * duration), audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function createGraph(audioCtx: AudioContext): AudioGraph {
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
  return { audioCtx, compressor };
}

function createKickPlayer(graph: AudioGraph): (t: number) => void {
  return function playKick(t: number): void {
    const o = graph.audioCtx.createOscillator();
    const g = graph.audioCtx.createGain();
    o.type = 'sine';
    o.connect(g); g.connect(graph.compressor);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(0.01, t + 0.45);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  };
}

function createSnarePlayer(graph: AudioGraph): (t: number) => void {
  const buffer = createNoiseBuffer(graph.audioCtx, 0.15);
  return function playSnare(t: number): void {
    const noise = graph.audioCtx.createBufferSource();
    const nGain = graph.audioCtx.createGain();
    const nHp   = graph.audioCtx.createBiquadFilter();
    nHp.type = 'highpass'; nHp.frequency.value = 1000;
    noise.buffer = buffer;
    noise.connect(nHp); nHp.connect(nGain); nGain.connect(graph.compressor);
    nGain.gain.setValueAtTime(0.3, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    noise.start(t);
    const t1 = graph.audioCtx.createOscillator();
    const g1 = graph.audioCtx.createGain();
    t1.type = 'triangle'; t1.frequency.value = 185;
    t1.connect(g1); g1.connect(graph.compressor);
    g1.gain.setValueAtTime(0.2, t);
    g1.gain.linearRampToValueAtTime(0.001, t + 0.08);
    t1.start(t); t1.stop(t + 0.08);
    const t2 = graph.audioCtx.createOscillator();
    const g2 = graph.audioCtx.createGain();
    t2.type = 'triangle'; t2.frequency.value = 349;
    t2.connect(g2); g2.connect(graph.compressor);
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.linearRampToValueAtTime(0.001, t + 0.06);
    t2.start(t); t2.stop(t + 0.06);
  };
}

function createHatPlayer(graph: AudioGraph): (t: number, accent: number) => void {
  const buffer = createNoiseBuffer(graph.audioCtx, 0.06);
  return function playHat(t: number, accent: number): void {
    const dur = accent ? 0.055 : 0.035;
    const src = graph.audioCtx.createBufferSource();
    const hp  = graph.audioCtx.createBiquadFilter();
    const g   = graph.audioCtx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    src.buffer = buffer;
    src.connect(hp); hp.connect(g); g.connect(graph.compressor);
    g.gain.setValueAtTime(accent ? 0.14 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t);
  };
}

function createBassPlayer(graph: AudioGraph): (t: number, freq: number) => void {
  return function playBass(t: number, freq: number): void {
    if (!freq) return;
    const o = graph.audioCtx.createOscillator();
    const g = graph.audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(g); g.connect(graph.compressor);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_SEC * 1.6);
    o.start(t); o.stop(t + STEP_SEC * 1.7);
  };
}

function createArpPlayer(graph: AudioGraph): (t: number, freq: number) => void {
  return function playArp(t: number, freq: number): void {
    if (!freq) return;
    const o  = graph.audioCtx.createOscillator();
    const g  = graph.audioCtx.createGain();
    const lp = graph.audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3000;
    o.type = 'triangle';
    o.frequency.value = freq;
    o.connect(lp); lp.connect(g); g.connect(graph.compressor);
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + STEP_SEC * 0.6);
    o.start(t); o.stop(t + STEP_SEC * 0.7);
  };
}

interface SchedulerState {
  step: number;
  nextTime: number;
}

async function resume(audioCtx: AudioContext, sched: SchedulerState): Promise<void> {
  await audioCtx.resume();
  sched.nextTime = audioCtx.currentTime + 0.05;
}

async function pause(audioCtx: AudioContext): Promise<void> {
  await audioCtx.suspend();
}

async function start(audioCtx: AudioContext, sched: SchedulerState): Promise<void> {
  sched.step = 0;
  await resume(audioCtx, sched);
}

async function stop(audioCtx: AudioContext): Promise<void> {
  await pause(audioCtx);
}

async function pauseResumeToggle(audioCtx: AudioContext, sched: SchedulerState): Promise<void> {
  if (audioCtx.state === 'running') {
    await pause(audioCtx);
  } else {
    await resume(audioCtx, sched);
  }
}

export interface Music {
  start: () => void;
  stop: () => void;
  pauseResumeToggle: () => void;
}

export function createMusic(): Music {
  const audioCtx = new AudioContext();
  const graph    = createGraph(audioCtx);
  const mutex    = new Mutex();
  const sched: SchedulerState = { step: 0, nextTime: 0 };

  const playKick  = createKickPlayer(graph);
  const playSnare = createSnarePlayer(graph);
  const playHat   = createHatPlayer(graph);
  const playBass  = createBassPlayer(graph);
  const playArp   = createArpPlayer(graph);

  function scheduleStep(globalStep: number, t: number): void {
    const { stage, step, extraKick } = getSongSection(globalStep);
    if (stage.kick[step] || extraKick) playKick(t);
    if (stage.snare[step]) playSnare(t);
    if (stage.hat[step])   playHat(t, stage.hatAcc[step]);
    playBass(t, stage.bass[step]);
    playArp(t,  stage.arp[step]);
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function startScheduler(): void {
    if (intervalId !== null) return;
    intervalId = setInterval(() => {
      if (audioCtx.state !== 'running') return;
      while (sched.nextTime < audioCtx.currentTime + LOOKAHEAD) {
        scheduleStep(sched.step++, sched.nextTime);
        sched.nextTime += STEP_SEC;
      }
    }, SCHED_MS);
  }

  function stopScheduler(): void {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
  }

  const locked = (task: () => Promise<void>) => () => { mutex.withLock(task).catch(console.error); };

  return {
    start:             locked(async () => { await start(audioCtx, sched); startScheduler(); }),
    stop:              locked(async () => { stopScheduler(); await stop(audioCtx); }),
    pauseResumeToggle: locked(() => pauseResumeToggle(audioCtx, sched)),
  };
}
