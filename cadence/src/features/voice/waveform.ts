// The waveform arithmetic. P06. Pure — no React, no native modules — so it is unit-tested.
//
// doc/06 §3: sample metering at ~10 Hz while recording, then downsample to a fixed
// sixty points and store those in voice_notes.waveform. Sixty is enough for a
// recognisable WhatsApp-style bubble at any width and small enough to sit in a row.
// The raw envelope is never stored.
//
// The acceptance test that matters: loud parts must be visibly taller. Averaging a
// bucket flattens a shout into a murmur, so buckets keep their peak.

/** How many amplitude points are stored per recording. Matches the column comment. */
export const WAVEFORM_POINTS = 60;

/** How often metering is sampled while recording, in milliseconds. ~10 Hz. */
export const METER_INTERVAL_MS = 100;

/** A metering reading at or below this many dBFS is drawn as silence. */
export const METER_FLOOR_DB = -60;

/** Full scale. Metering never exceeds this. */
export const METER_CEILING_DB = 0;

/** Anything shorter is a tap, not a note. doc/06 §4 step 6. */
export const MIN_RECORDING_MS = 1000;

/**
 * A metering reading (dBFS, roughly -160 for digital silence up to 0 for full
 * scale) mapped onto 0..100, which is what the `smallint[]` column holds.
 *
 * The floor is -60 rather than -160 because a quiet room meters around -50 and
 * speech around -30 to -10; with a -160 floor every bar would sit in the top
 * third and the waveform would read as flat. `undefined` — metering disabled,
 * or a platform that has not reported yet — is treated as silence.
 */
export function meteringToLevel(db: number | null | undefined): number {
  if (db == null || !Number.isFinite(db)) return 0;
  const clamped = Math.min(METER_CEILING_DB, Math.max(METER_FLOOR_DB, db));
  const fraction = (clamped - METER_FLOOR_DB) / (METER_CEILING_DB - METER_FLOOR_DB);
  return Math.round(fraction * 100);
}

/**
 * Resample an arbitrary-length series of 0..100 levels to exactly `points` values.
 *
 * More samples than points: each output is the peak of its bucket. Fewer samples
 * than points (a short note): nearest-neighbour stretch, so a two-second note still
 * fills the bubble rather than showing twenty bars and forty gaps. Empty input gives
 * all zeros, which draws as a flat line rather than crashing the bubble.
 */
export function downsample(samples: readonly number[], points: number = WAVEFORM_POINTS): number[] {
  if (points <= 0) return [];
  const n = samples.length;
  if (n === 0) return new Array<number>(points).fill(0);

  const out = new Array<number>(points);
  for (let i = 0; i < points; i++) {
    // Bucket [start, end) in sample space. When n < points the bucket is narrower
    // than one sample and start === end, which the max() below handles by taking
    // the one sample at `start`.
    const start = Math.floor((i * n) / points);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / points));
    let peak = 0;
    for (let j = start; j < end && j < n; j++) {
      const v = samples[j] ?? 0;
      if (v > peak) peak = v;
    }
    out[i] = clampLevel(peak);
  }
  return out;
}

/**
 * The stored column, made safe to draw. A null column (an old row, or a platform
 * that never reported metering) becomes a flat line of the right length, and any
 * out-of-range value from a future writer is clamped rather than trusted.
 */
export function waveformForDisplay(
  waveform: readonly number[] | null | undefined,
  points: number = WAVEFORM_POINTS,
): number[] {
  if (!waveform || waveform.length === 0) return new Array<number>(points).fill(0);
  if (waveform.length === points) return waveform.map(clampLevel);
  return downsample(waveform.map(clampLevel), points);
}

/** The most recent `count` levels, left-padded with silence. For the live meter. */
export function trailingWindow(samples: readonly number[], count: number): number[] {
  if (count <= 0) return [];
  const tail = samples.slice(Math.max(0, samples.length - count));
  if (tail.length === count) return tail.map(clampLevel);
  return [...new Array<number>(count - tail.length).fill(0), ...tail.map(clampLevel)];
}

/** "0:07", "1:30", "12:05". Whole seconds; nobody times a voice note to the tenth. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function clampLevel(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, v)));
}
