import '../packages/workers/src/env';

const apiKey = process.env.SUBDL_API_KEY;
const apiBase = 'https://api.subdl.com/api/v1';

async function main() {
  const url = new URL(`${apiBase}/subtitles`);
  url.searchParams.set('api_key', apiKey!);
  url.searchParams.set('imdb_id', 'tt11280740');
  url.searchParams.set('type', 'tv');
  url.searchParams.set('languages', 'EN');
  url.searchParams.set('season_number', '1');
  url.searchParams.set('episode_number', '9');

  console.log('Fetching:', url.toString().replace(apiKey!, 'REDACTED'));
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json', 'user-agent': 'GlobalSubs/1.0' },
  });
  const data = await res.json();
  
  const subs = data.subtitles || [];
  console.log(`\nTotal results: ${subs.length}\n`);
  
  for (const [i, sub] of subs.entries()) {
    console.log(`--- Entry ${i} ---`);
    console.log(`  name: ${sub.name}`);
    console.log(`  url: ${sub.url}`);
    console.log(`  season: ${sub.season}, episode: ${sub.episode}`);
    console.log(`  episode_from: ${sub.episode_from}, episode_end: ${sub.episode_end}`);
    console.log(`  full_season: ${sub.full_season}`);
    console.log(`  release_name: ${sub.release_name}`);
    console.log(`  author: ${sub.author}`);
    if (i >= 9) { console.log('... truncated'); break; }
  }
}

main().catch(console.error);
