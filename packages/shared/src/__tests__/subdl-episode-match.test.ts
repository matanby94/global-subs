import { describe, it, expect } from 'vitest';

// Test the episode matching logic directly
function entryMatchesEpisode(entryName: string, episode: number): boolean {
  const name = entryName.toLowerCase();
  const seMatch = name.match(/s\d{1,2}e(\d{1,3})/i);
  if (seMatch) return parseInt(seMatch[1], 10) === episode;
  const eMatch = name.match(/\be(\d{1,3})\b/i);
  if (eMatch) return parseInt(eMatch[1], 10) === episode;
  return false;
}

describe('entryMatchesEpisode', () => {
  it('matches S01E07 format', () => {
    expect(entryMatchesEpisode('Severance.S01E07.Defiant.Jazz.srt', 7)).toBe(true);
    expect(entryMatchesEpisode('Severance.S01E07.Defiant.Jazz.srt', 3)).toBe(false);
  });

  it('matches S01E09 with zero-padded episode', () => {
    expect(entryMatchesEpisode('Severance.S01E09.The.We.We.Are.srt', 9)).toBe(true);
  });

  it('matches S1E3 without zero padding', () => {
    expect(entryMatchesEpisode('Show.S1E3.srt', 3)).toBe(true);
    expect(entryMatchesEpisode('Show.S1E3.srt', 13)).toBe(false);
  });

  it('matches S02E01 for season 2', () => {
    expect(entryMatchesEpisode('Severance.S02E01.1080p.WEB.srt', 1)).toBe(true);
    expect(entryMatchesEpisode('Severance.S02E10.1080p.WEB.srt', 10)).toBe(true);
  });

  it('matches nested paths', () => {
    expect(entryMatchesEpisode('subs/Severance.S01E03.srt', 3)).toBe(true);
  });

  it('does not match unrelated numbers', () => {
    expect(entryMatchesEpisode('Severance.2160p.srt', 2)).toBe(false);
  });

  it('handles case insensitivity', () => {
    expect(entryMatchesEpisode('show.s01e05.SRT', 5)).toBe(true);
  });
});
