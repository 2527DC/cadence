// The waveform is the one part of a voice note that is derived rather than recorded,
// so it is the part that can quietly be wrong. P06's acceptance criterion is blunt:
// "loud parts are visibly taller". These tests hold that line at the arithmetic
// level, before any View is involved.

import {
  METER_FLOOR_DB,
  WAVEFORM_POINTS,
  downsample,
  formatDuration,
  meteringToLevel,
  trailingWindow,
  waveformForDisplay,
} from './waveform';

describe('meteringToLevel', () => {
  it('treats a missing reading as silence', () => {
    expect(meteringToLevel(undefined)).toBe(0);
    expect(meteringToLevel(null)).toBe(0);
    expect(meteringToLevel(Number.NaN)).toBe(0);
  });

  it('clamps digital silence and anything below the floor to zero', () => {
    expect(meteringToLevel(-160)).toBe(0);
    expect(meteringToLevel(METER_FLOOR_DB)).toBe(0);
    expect(meteringToLevel(METER_FLOOR_DB - 1)).toBe(0);
  });

  it('maps full scale to 100 and never exceeds it', () => {
    expect(meteringToLevel(0)).toBe(100);
    expect(meteringToLevel(3)).toBe(100);
  });

  it('is linear between the floor and the ceiling', () => {
    expect(meteringToLevel(-30)).toBe(50);
    expect(meteringToLevel(-45)).toBe(25);
  });

  it('orders readings the way the ear does', () => {
    expect(meteringToLevel(-10)).toBeGreaterThan(meteringToLevel(-25));
    expect(meteringToLevel(-25)).toBeGreaterThan(meteringToLevel(-50));
  });
});

describe('downsample', () => {
  it('always returns exactly WAVEFORM_POINTS values', () => {
    expect(downsample([])).toHaveLength(WAVEFORM_POINTS);
    expect(downsample([50])).toHaveLength(WAVEFORM_POINTS);
    expect(downsample(new Array<number>(37).fill(40))).toHaveLength(WAVEFORM_POINTS);
    expect(downsample(new Array<number>(1000).fill(40))).toHaveLength(WAVEFORM_POINTS);
  });

  it('gives a flat line for no samples rather than throwing', () => {
    expect(downsample([])).toEqual(new Array<number>(WAVEFORM_POINTS).fill(0));
  });

  it('keeps the peak of each bucket, so a shout is not averaged away', () => {
    // 120 samples into 60 points: each point covers two samples. A single loud
    // sample in an otherwise quiet pair must survive.
    const samples = new Array<number>(120).fill(10);
    samples[41] = 95;
    const out = downsample(samples);
    expect(out[20]).toBe(95);
    expect(out[19]).toBe(10);
    expect(out[21]).toBe(10);
  });

  it('draws the loud half taller than the quiet half', () => {
    const quiet = new Array<number>(100).fill(12);
    const loud = new Array<number>(100).fill(88);
    const out = downsample([...quiet, ...loud]);
    const firstHalf = out.slice(0, 30);
    const secondHalf = out.slice(30);
    expect(Math.max(...firstHalf)).toBeLessThan(Math.min(...secondHalf));
  });

  it('stretches a short recording to fill the bubble', () => {
    // A two-second note has ~20 samples. Every output point still gets a value.
    const short = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
    const out = downsample(short);
    expect(out).toHaveLength(WAVEFORM_POINTS);
    expect(out[0]).toBe(0);
    expect(out[WAVEFORM_POINTS - 1]).toBe(90);
    expect(out.every((v) => short.includes(v))).toBe(true);
  });

  it('clamps values into the smallint range the column expects', () => {
    const out = downsample([150, -20, 50.6]);
    expect(Math.max(...out)).toBe(100);
    expect(Math.min(...out)).toBe(0);
    expect(out.every((v) => Number.isInteger(v))).toBe(true);
  });

  it('honours a custom point count', () => {
    expect(downsample([1, 2, 3, 4], 2)).toEqual([2, 4]);
    expect(downsample([1, 2, 3, 4], 0)).toEqual([]);
  });
});

describe('waveformForDisplay', () => {
  it('turns a null column into a flat line of the right length', () => {
    expect(waveformForDisplay(null)).toEqual(new Array<number>(WAVEFORM_POINTS).fill(0));
    expect(waveformForDisplay(undefined)).toHaveLength(WAVEFORM_POINTS);
    expect(waveformForDisplay([])).toHaveLength(WAVEFORM_POINTS);
  });

  it('passes a well-formed column through unchanged', () => {
    const stored = Array.from({ length: WAVEFORM_POINTS }, (_, i) => i % 100);
    expect(waveformForDisplay(stored)).toEqual(stored);
  });

  it('resamples a column of the wrong length instead of misdrawing it', () => {
    expect(waveformForDisplay([10, 20, 30])).toHaveLength(WAVEFORM_POINTS);
    expect(waveformForDisplay(new Array<number>(200).fill(7))).toHaveLength(WAVEFORM_POINTS);
  });

  it('does not trust out-of-range values from a future writer', () => {
    const stored = new Array<number>(WAVEFORM_POINTS).fill(300);
    expect(Math.max(...waveformForDisplay(stored))).toBe(100);
  });
});

describe('trailingWindow', () => {
  it('pads on the left while the recording is young', () => {
    expect(trailingWindow([40, 50], 5)).toEqual([0, 0, 0, 40, 50]);
  });

  it('keeps only the newest samples once there are more than fit', () => {
    expect(trailingWindow([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([5, 6, 7]);
  });

  it('handles the degenerate sizes', () => {
    expect(trailingWindow([], 3)).toEqual([0, 0, 0]);
    expect(trailingWindow([1, 2], 0)).toEqual([]);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [7000, '0:07'],
    [59_499, '0:59'],
    [59_500, '1:00'],
    [90_000, '1:30'],
    [725_400, '12:05'],
  ])('formats %d ms as %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('never shows a negative or non-finite time', () => {
    expect(formatDuration(-5000)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});
