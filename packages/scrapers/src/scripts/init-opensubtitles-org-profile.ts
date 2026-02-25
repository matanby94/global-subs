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
  const userDataDir =
    process.argv[2] ||
    process.env.OPENSUBTITLES_ORG_USER_DATA_DIR ||
    path.join(process.cwd(), '.cache', 'opensubtitles-org.user-data');

  await mkdir(userDataDir, { recursive: true });

  const userAgent =
    process.env.OPENSUBTITLES_USER_AGENT ||
    process.env.OPENSUBTITLES_ORG_USER_AGENT ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    userAgent,
    locale: 'en-US',
    acceptDownloads: true,
  });

  try {
    const page = await context.newPage();
    await page.goto('https://www.opensubtitles.org/en', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await waitForEnter(
      `\nOpenSubtitles.org window opened with a persistent profile.\n` +
        `- Complete any challenge/consent screens.\n` +
        `- If you normally login to download, login now.\n` +
        `\nPress Enter here when done to close the browser and save the profile to:\n${userDataDir}\n\n`
    );

    const abs = path.resolve(userDataDir);
    console.log(`[opensubtitles_org] Saved user data dir: ${abs}`);
    console.log(
      `[opensubtitles_org] Use: OPENSUBTITLES_ORG_USER_DATA_DIR="${abs}" DEBUG_OPENSUBTITLES_ORG=1 pnpm --filter @stremio-ai-subs/scrapers dev`
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
