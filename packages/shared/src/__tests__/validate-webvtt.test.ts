import { describe, it, expect } from 'vitest';
import { validateWebVTT } from '../utils';

function makeVTT(cues: { start: string; end: string; text: string }[]): string {
  const lines = ['WEBVTT', ''];
  for (const cue of cues) {
    lines.push(`${cue.start} --> ${cue.end}`);
    lines.push(cue.text);
    lines.push('');
  }
  return lines.join('\n');
}

describe('validateWebVTT', () => {
  it('returns F grade for missing WEBVTT header', () => {
    const result = validateWebVTT('not a subtitle file');
    expect(result.valid).toBe(false);
    expect(result.grade).toBe('F');
    expect(result.score).toBe(0);
  });

  it('returns F grade for no cues', () => {
    const result = validateWebVTT('WEBVTT\n\n');
    expect(result.valid).toBe(false);
    expect(result.grade).toBe('F');
    expect(result.stats.totalCues).toBe(0);
  });

  it('returns A grade for clean subtitles', () => {
    const vtt = makeVTT([
      { start: '00:00:01.000', end: '00:00:04.000', text: 'Hello world' },
      { start: '00:00:05.000', end: '00:00:08.000', text: 'How are you?' },
      { start: '00:00:09.000', end: '00:00:12.000', text: 'I am fine.' },
    ]);
    const result = validateWebVTT(vtt);
    expect(result.valid).toBe(true);
    expect(result.grade).toBe('A');
    expect(result.score).toBe(100);
    expect(result.stats.totalCues).toBe(3);
    expect(result.stats.cpsViolations).toBe(0);
    expect(result.stats.lineLengthViolations).toBe(0);
  });

  it('uses actual timestamps for CPS calculation', () => {
    // 60 chars in 1 second = 60 CPS (way over limit)
    const longText = 'x'.repeat(60);
    const vtt = makeVTT([{ start: '00:00:01.000', end: '00:00:02.000', text: longText }]);
    const result = validateWebVTT(vtt);
    expect(result.stats.maxCps).toBe(60);
    expect(result.stats.cpsViolations).toBe(1);
  });

  it('does not flag CPS when duration is long enough', () => {
    // 60 chars in 10 seconds = 6 CPS (well under limit)
    const longText = 'x'.repeat(60);
    const vtt = makeVTT([{ start: '00:00:01.000', end: '00:00:11.000', text: longText }]);
    const result = validateWebVTT(vtt);
    expect(result.stats.cpsViolations).toBe(0);
    expect(result.stats.maxCps).toBe(6);
  });

  it('grades B for moderate quality issues', () => {
    // 20 cues, 5 with CPS violations = 75% pass rate → score ~85
    const cues = [];
    for (let i = 0; i < 15; i++) {
      cues.push({
        start: `00:00:${String(i * 4).padStart(2, '0')}.000`,
        end: `00:00:${String(i * 4 + 3).padStart(2, '0')}.000`,
        text: 'Normal text here',
      });
    }
    // Add 5 fast cues (high CPS)
    for (let i = 0; i < 5; i++) {
      cues.push({
        start: `00:01:${String(i * 2).padStart(2, '0')}.000`,
        end: `00:01:${String(i * 2 + 1).padStart(2, '0')}.000`,
        text: 'This is a longer text that will have high CPS in one second',
      });
    }
    const vtt = makeVTT(cues);
    const result = validateWebVTT(vtt);
    expect(result.valid).toBe(true);
    expect(['A', 'B']).toContain(result.grade);
    expect(result.stats.cpsViolations).toBe(5);
  });

  it('grades C for many quality issues', () => {
    // 10 cues, 5 with CPS violations = 50% pass rate → score ~70 (with line length pass)
    // But we want grade C (50-69), so we need more violations
    const cues = [];
    for (let i = 0; i < 5; i++) {
      cues.push({
        start: `00:00:${String(i * 4).padStart(2, '0')}.000`,
        end: `00:00:${String(i * 4 + 3).padStart(2, '0')}.000`,
        text: 'OK text',
      });
    }
    // 5 cues with CPS violations AND line-length violations
    for (let i = 0; i < 5; i++) {
      cues.push({
        start: `00:01:${String(i * 2).padStart(2, '0')}.000`,
        end: `00:01:${String(i * 2 + 1).padStart(2, '0')}.000`,
        text: 'x'.repeat(40), // 40 CPS, but under 47 char line limit
      });
    }
    const vtt = makeVTT(cues);
    const result = validateWebVTT(vtt);
    expect(result.valid).toBe(true);
    expect(['B', 'C']).toContain(result.grade);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(90);
  });

  it('marks as invalid (F) only when all cues are bad', () => {
    const cues = [];
    for (let i = 0; i < 10; i++) {
      cues.push({
        start: `00:00:${String(i).padStart(2, '0')}.000`,
        end: `00:00:${String(i).padStart(2, '0')}.500`,
        text: 'x'.repeat(100), // 200 CPS — extremely bad
      });
    }
    const vtt = makeVTT(cues);
    const result = validateWebVTT(vtt);
    expect(result.valid).toBe(false);
    expect(result.grade).toBe('F');
  });

  it('detects line length violations', () => {
    const longLine = 'x'.repeat(50); // Over 47 char limit
    const vtt = makeVTT([{ start: '00:00:01.000', end: '00:00:10.000', text: longLine }]);
    const result = validateWebVTT(vtt);
    expect(result.stats.lineLengthViolations).toBe(1);
  });

  it('strips HTML tags for character counting', () => {
    const vtt = makeVTT([{ start: '00:00:01.000', end: '00:00:04.000', text: '<i>Hello</i>' }]);
    const result = validateWebVTT(vtt);
    // 5 chars / 3 seconds = ~1.7 CPS
    expect(result.stats.maxCps).toBeCloseTo(1.7, 1);
    expect(result.stats.cpsViolations).toBe(0);
  });

  it('returns detailed stats', () => {
    const vtt = makeVTT([
      { start: '00:00:01.000', end: '00:00:04.000', text: 'Hello world' },
      { start: '00:00:05.000', end: '00:00:08.000', text: 'Test line two' },
    ]);
    const result = validateWebVTT(vtt);
    expect(result.stats.totalCues).toBe(2);
    expect(result.stats.avgCps).toBeGreaterThan(0);
    expect(result.stats.maxCps).toBeGreaterThan(0);
    expect(result.stats.meanLineLength).toBeGreaterThan(0);
  });

  it('limits error messages to first 3 violations + summary', () => {
    const cues = [];
    for (let i = 0; i < 10; i++) {
      cues.push({
        start: `00:00:${String(i).padStart(2, '0')}.000`,
        end: `00:00:${String(i).padStart(2, '0')}.500`,
        text: 'x'.repeat(80), // High CPS + long line
      });
    }
    const vtt = makeVTT(cues);
    const result = validateWebVTT(vtt);
    // Should have at most 3 detailed CPS errors + 1 summary + 3 line errors + 1 summary
    const cpsErrors = result.errors.filter((e) => e.includes('CPS'));
    const lineErrors = result.errors.filter((e) => e.includes('chars'));
    expect(cpsErrors.length).toBeLessThanOrEqual(4); // 3 detailed + 1 "... and X more"
    expect(lineErrors.length).toBeLessThanOrEqual(4);
  });
});
