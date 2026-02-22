import * as Tone from 'tone';
import { generateSong } from './songGen';
import type { SongData, DrumEvent, NoteEvent, ChordEvent } from './songGen';
import { TRAVEL_TIME } from './beatmap';

type Seconds = number;

export type { SongData };

export interface Music {
  start: () => void;
  stop: () => void;
  pauseResumeToggle: () => void;
  currentTime: () => Seconds;
  songData: () => SongData | null;
  onSongEnd: (cb: (song: SongData) => void) => void;
}

export function createMusic(): Music {
  let currentSong: SongData | null = null;
  let currentSeed = Date.now() % 100000;
  let songEndCallback: ((song: SongData) => void) | null = null;

  // Disposable audio nodes — collected for cleanup
  let disposables: Tone.ToneAudioNode[] = [];
  let parts: Tone.Part[] = [];
  let isPlaying = false;
  let isPaused  = false;

  function disposeAll(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();

    for (const p of parts) p.dispose();
    parts = [];

    for (const n of disposables) n.dispose();
    disposables = [];

    isPlaying = false;
    isPaused  = false;
  }

  function scheduleSong(song: SongData): void {
    const transport = Tone.getTransport();

    // Master gain for fade-out
    const masterGain = new Tone.Gain(1).toDestination();
    disposables.push(masterGain);

    // ── Pad ──
    const padChorus = new Tone.Chorus({ frequency: 0.4, delayTime: 3.5, depth: 0.5, wet: 0.3 }).start();
    const padFilter = new Tone.Filter({ frequency: 1200, type: 'lowpass', rolloff: -12 });
    const padReverb = new Tone.Reverb({ decay: 3, wet: 0.25 });
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 15 },
      envelope: { attack: 0.3, decay: 0.2, sustain: 0.4, release: 0.8 },
      volume: -10,
    });
    pad.chain(padChorus, padFilter, padReverb, masterGain);
    disposables.push(pad, padChorus, padFilter, padReverb);

    // ── Bass ──
    const bassFilter = new Tone.Filter({ frequency: 800, type: 'lowpass', rolloff: -12 });
    const bass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.3 },
      filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.4, release: 0.2, baseFrequency: 150, octaves: 2.5 },
      volume: -4,
    });
    bass.chain(bassFilter, masterGain);
    disposables.push(bass, bassFilter);

    // ── Kick ──
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 6,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.3 },
      volume: -2,
    });
    kick.connect(masterGain);
    disposables.push(kick);

    // ── Snare ──
    const snareFilter = new Tone.Filter({ frequency: 1200, type: 'highpass' });
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -6,
    });
    snare.chain(snareFilter, masterGain);
    disposables.push(snare, snareFilter);

    // ── Hat ──
    const hatFilter = new Tone.Filter({ frequency: 8000, type: 'highpass' });
    const hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
      volume: -10,
    });
    hat.chain(hatFilter, masterGain);
    disposables.push(hat, hatFilter);

    // ── Arp ──
    const arpFilter = new Tone.Filter({ frequency: 3000, type: 'lowpass' });
    const arpReverb = new Tone.Reverb({ decay: 1, wet: 0.2 });
    const arp = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'square' },
      envelope: { attack: 0.003, decay: 0.1, sustain: 0.05, release: 0.15 },
      volume: -8,
    });
    arp.chain(arpFilter, arpReverb, masterGain);
    disposables.push(arp, arpFilter, arpReverb);

    // ── Melody ──
    const melodyFilter = new Tone.Filter({ frequency: 2200, type: 'lowpass' });
    const melodyReverb = new Tone.Reverb({ decay: 1.5, wet: 0.3 });
    const melody = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.15, sustain: 0.25, release: 0.3 },
      volume: -6,
    });
    melody.chain(melodyFilter, melodyReverb, masterGain);
    disposables.push(melody, melodyFilter, melodyReverb);

    // ── Schedule Parts ──

    if (song.padEvents.length > 0) {
      const p = new Tone.Part((time, e: ChordEvent) => {
        pad.triggerAttackRelease(e.notes, e.duration, time, e.vel);
      }, song.padEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.bassEvents.length > 0) {
      const p = new Tone.Part((time, e: NoteEvent) => {
        bass.triggerAttackRelease(e.note, e.duration, time, e.vel);
      }, song.bassEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.kickEvents.length > 0) {
      const p = new Tone.Part((time, e: DrumEvent) => {
        kick.triggerAttackRelease('C1', '8n', time, e.vel);
      }, song.kickEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.snareEvents.length > 0) {
      const p = new Tone.Part((time, e: DrumEvent) => {
        snare.triggerAttackRelease('16n', time, e.vel);
      }, song.snareEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.hatEvents.length > 0) {
      const p = new Tone.Part((time, e: DrumEvent) => {
        hat.triggerAttackRelease('32n', time, e.vel);
      }, song.hatEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.arpEvents.length > 0) {
      const p = new Tone.Part((time, e: NoteEvent) => {
        arp.triggerAttackRelease(e.note, e.duration, time, e.vel);
      }, song.arpEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    if (song.melodyEvents.length > 0) {
      const p = new Tone.Part((time, e: NoteEvent) => {
        melody.triggerAttackRelease(e.note, e.duration, time, e.vel);
      }, song.melodyEvents.map(e => ({ ...e })));
      p.start(0);
      parts.push(p);
    }

    // Master fade on last bar
    const totalBars = song.barDurations.length;
    const lastBarDur = song.barDurations[totalBars - 1];
    transport.schedule((time) => {
      masterGain.gain.setValueAtTime(1, time);
      masterGain.gain.linearRampToValueAtTime(0, time + lastBarDur);
    }, song.totalTime - lastBarDur);

    // Song end → generate next
    transport.schedule(() => {
      startNextSong();
    }, song.totalTime + 0.5);
  }

  function startNextSong(): void {
    disposeAll();
    currentSeed++;
    const song = generateSong(currentSeed);
    currentSong = song;

    scheduleSong(song);

    const transport = Tone.getTransport();
    transport.seconds = -TRAVEL_TIME;
    transport.start();
    isPlaying = true;

    if (songEndCallback) songEndCallback(song);
  }

  function prepareNextSong(): SongData {
    currentSeed = Date.now() % 100000;
    const song = generateSong(currentSeed);
    currentSong = song;
    return song;
  }

  async function startAsync(song: SongData): Promise<void> {
    await Tone.start();

    scheduleSong(song);

    const transport = Tone.getTransport();
    transport.seconds = -TRAVEL_TIME;
    transport.start();
    isPlaying = true;
  }

  function stop(): void {
    disposeAll();
    currentSong = null;
  }

  function pauseResumeToggle(): void {
    if (!isPlaying) return;
    const transport = Tone.getTransport();
    if (isPaused) {
      transport.start();
      isPaused = false;
    } else {
      transport.pause();
      isPaused = true;
    }
  }

  function currentTime(): Seconds {
    if (!isPlaying) return -TRAVEL_TIME * 2;
    return Tone.getTransport().seconds;
  }

  return {
    start: () => { disposeAll(); const song = prepareNextSong(); startAsync(song).catch(console.error); },
    stop,
    pauseResumeToggle,
    currentTime,
    songData: () => currentSong,
    onSongEnd: (cb) => { songEndCallback = cb; },
  };
}
