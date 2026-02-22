import type { SongData, DrumEvent } from './songGen';
import { LANES_X, LANES_Y } from './blocks';

type Seconds = number;

const SPAWN_Z    = -14;
const CUBE_SPEED = 4;
export const TRAVEL_TIME: Seconds = Math.abs(SPAWN_Z) / CUBE_SPEED; // 3.5s

export interface SpawnCommand {
  x: number;
  y: number;
  isRed: boolean;
}

export interface Beatmap {
  tick: (audioTime: Seconds) => readonly SpawnCommand[];
  loadSong: (song: SongData) => void;
}

// Build a shuffled cycling sequence of all grid positions, seeded
function buildLaneSequence(seed: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (const x of LANES_X)
    for (const y of LANES_Y)
      positions.push({ x, y });

  // Fisher-Yates shuffle with simple seeded RNG
  let s = seed;
  function rng(): number { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions;
}

export function createBeatmap(): Beatmap {
  let kickEvents: DrumEvent[] = [];
  let snareEvents: DrumEvent[] = [];
  let kickCursor  = 0;
  let snareCursor = 0;
  let laneSeq: { x: number; y: number }[] = [];
  let laneIdx = 0;

  // Pre-allocated result buffer — reused every frame
  const result: SpawnCommand[] = [];

  function nextLane(): { x: number; y: number } {
    const pos = laneSeq[laneIdx % laneSeq.length];
    laneIdx++;
    return pos;
  }

  function loadSong(song: SongData): void {
    kickEvents  = song.kickEvents;
    snareEvents = song.snareEvents;
    kickCursor  = 0;
    snareCursor = 0;
    laneSeq     = buildLaneSequence(song.seed);
    laneIdx     = 0;
  }

  function tick(audioTime: Seconds): readonly SpawnCommand[] {
    result.length = 0;
    const horizon = audioTime + TRAVEL_TIME;

    // Advance kick cursor → red blocks
    while (kickCursor < kickEvents.length && kickEvents[kickCursor].time <= horizon) {
      const lane = nextLane();
      result.push({ x: lane.x, y: lane.y, isRed: true });
      kickCursor++;
    }

    // Advance snare cursor → blue blocks
    while (snareCursor < snareEvents.length && snareEvents[snareCursor].time <= horizon) {
      const lane = nextLane();
      result.push({ x: lane.x, y: lane.y, isRed: false });
      snareCursor++;
    }

    return result;
  }

  return { tick, loadSong };
}
