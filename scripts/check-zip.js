require('/home/matan/Projects/stremio-translations-ai/node_modules/.pnpm/dotenv@16.6.1/node_modules/dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const AdmZip = require('/home/matan/Projects/stremio-translations-ai/packages/shared/node_modules/adm-zip');

async function main() {
  const dlBase = 'https://dl.subdl.com/subtitle';
  const zipUrl = dlBase + '/3553019-8473710.zip'; // Full season pack (entry 0)

  console.log('Downloading:', zipUrl);
  const res = await fetch(zipUrl, {
    headers: { 'user-agent': 'GlobalSubs/1.0', accept: '*/*' },
  });

  if (!res.ok) {
    console.error('Download failed:', res.status);
    return;
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();

  console.log(`\nZIP entries (${entries.length}):`);
  entries.forEach((e) => {
    if (!e.isDirectory) {
      const data = e.getData().toString('utf8');
      const firstLine = data.split('\n').filter((l) => l.trim() && !/^\d/.test(l.trim()) && !l.includes('-->')).slice(0, 2).join(' | ');
      console.log(`  ${e.entryName} (${e.header.size} bytes) — "${firstLine.substring(0, 80)}"`);
    }
  });

  // Also try second pack
  const zipUrl2 = dlBase + '/3549830-8471743.zip'; // Second full season pack (entry 6)
  console.log('\n\nDownloading second pack:', zipUrl2);
  const res2 = await fetch(zipUrl2, {
    headers: { 'user-agent': 'GlobalSubs/1.0', accept: '*/*' },
  });
  const buf2 = Buffer.from(await res2.arrayBuffer());
  const zip2 = new AdmZip(buf2);
  const entries2 = zip2.getEntries();
  console.log(`\nZIP entries (${entries2.length}):`);
  entries2.forEach((e) => {
    if (!e.isDirectory) {
      const data = e.getData().toString('utf8');
      const firstLine = data.split('\n').filter((l) => l.trim() && !/^\d/.test(l.trim()) && !l.includes('-->')).slice(0, 2).join(' | ');
      console.log(`  ${e.entryName} (${e.header.size} bytes) — "${firstLine.substring(0, 80)}"`);
    }
  });
}

main().catch(console.error);
