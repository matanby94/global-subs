import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as readline from 'node:readline';

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const outPath =
    process.argv[2] ||
    process.env.OPENSUBTITLES_ORG_STORAGE_STATE_PATH ||
    path.join(process.cwd(), '.cache', 'opensubtitles-org.storage-state.json');

  await mkdir(path.dirname(outPath), { recursive: true });

  const userAgent =
    process.env.OPENSUBTITLES_USER_AGENT ||
    process.env.OPENSUBTITLES_ORG_USER_AGENT ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      userAgent,
      locale: 'en-US',
      acceptDownloads: true,
    });

    const page = await context.newPage();
    await page.goto('https://www.opensubtitles.org/en', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    // User must complete any challenge/login in the visible window.
    await waitForEnter(
      `\nOpenSubtitles.org window opened.\n` +
        `- If you see a challenge or consent screen, complete it now.\n` +
        `- If you normally login in your browser to download, login here too.\n` +
        `\nPress Enter here when done to save storage state to:\n${outPath}\n\n`
    );

    await context.storageState({ path: outPath });
    const abs = path.resolve(outPath);
    console.log(`[opensubtitles_org] Saved storage state: ${abs}`);
    console.log(
      `[opensubtitles_org] Use: OPENSUBTITLES_ORG_STORAGE_STATE_PATH="${abs}" DEBUG_OPENSUBTITLES_ORG=1 pnpm --filter @stremio-ai-subs/scrapers dev`
    );
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
