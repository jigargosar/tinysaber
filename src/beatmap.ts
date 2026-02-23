import type { SongData, DrumEvent } from './songGen';
import { LANES_X, LANES_Y } from './blocks';

type Seconds = number;

const SPAWN_Z    = -14;
const CUBE_SPEED = 4;
export const TRAVEL_TIME: Seconds = Math.abs(SPAWN_Z) / CUBE_SPEED; // 3.5s

const MIN_VEL      = 0.4;   // skip ghost notes / weak hits
const MIN_GAP: Seconds = 0.3;  // minimum time between spawns per drum type

// Red (kick) → left two columns, Blue (snare) → right two columns
const RED_LANES_X  = LANES_X.slice(0, 2);
const BLUE_LANES_X = LANES_X.slice(2);

export interface SpawnCommand {
  x: number;
  y: number;
  isRed: boolean;
}

export interface Beatmap {
  tick: (audioTime: Seconds) => readonly SpawnCommand[];
  loadSong: (song: SongData) => void;
}

export function createBeatmap(): Beatmap {
  let kickEvents: DrumEvent[] = [];
  let snareEvents: DrumEvent[] = [];
  let kickCursor  = 0;
  let snareCursor = 0;
  let lastKickTime: Seconds  = -Infinity;
  let lastSnareTime: Seconds = -Infinity;

  // Row cycling indices — each color cycles through LANES_Y independently
  let redRowIdx  = 0;
  let blueRowIdx = 0;

  // Seeded column picker within the 2-column set
  let _rngState = 42;
  function rng(): number { _rngState = (_rngState * 16807) % 2147483647; return (_rngState - 1) / 2147483646; }
  function pickCol(cols: readonly number[]): number { return cols[Math.floor(rng() * cols.length)]; }

  // Pre-allocated result buffer — reused every frame
  const result: SpawnCommand[] = [];

  function loadSong(song: SongData): void {
    kickEvents  = song.kickEvents;
    snareEvents = song.snareEvents;
    kickCursor  = 0;
    snareCursor = 0;
    lastKickTime  = -Infinity;
    lastSnareTime = -Infinity;
    redRowIdx  = 0;
    blueRowIdx = 0;
    _rngState = song.seed;
  }

  function tick(audioTime: Seconds): readonly SpawnCommand[] {
    result.length = 0;
    const horizon = audioTime + TRAVEL_TIME;

    // Advance kick cursor → red blocks (left columns)
    while (kickCursor < kickEvents.length && kickEvents[kickCursor].time <= horizon) {
      const ev = kickEvents[kickCursor];
      kickCursor++;
      if (ev.vel < MIN_VEL) continue;
      if (ev.time - lastKickTime < MIN_GAP) continue;
      lastKickTime = ev.time;
      const x = pickCol(RED_LANES_X);
      const y = LANES_Y[redRowIdx % LANES_Y.length];
      redRowIdx++;
      result.push({ x, y, isRed: true });
    }

    // Advance snare cursor → blue blocks (right columns)
    while (snareCursor < snareEvents.length && snareEvents[snareCursor].time <= horizon) {
      const ev = snareEvents[snareCursor];
      snareCursor++;
      if (ev.vel < MIN_VEL) continue;
      if (ev.time - lastSnareTime < MIN_GAP) continue;
      lastSnareTime = ev.time;
      const x = pickCol(BLUE_LANES_X);
      const y = LANES_Y[blueRowIdx % LANES_Y.length];
      blueRowIdx++;
      result.push({ x, y, isRed: false });
    }

    return result;
  }

  return { tick, loadSong };
}
