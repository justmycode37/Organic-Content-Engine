// Captures real, unedited crops of public source pages for PROOF ROOM exhibits.
// Usage: node scripts/styles/proof-capture.mjs <url> <out.png> <selector> [text-filter]
// A phone-width viewport makes the crop wrap into a tall, readable block. Cookie banners, pop-ups and sticky
// bars are hidden before the capture; the captured element itself is not altered. Prints the URL, the capture time (UTC) and the captured text so they can go into SOURCES.md.
import { chromium } from 'playwright-core';

const [url, out, selector, filter] = process.argv.slice(2);
if (!url || !out || !selector) {
  console.error('usage: proof-capture.mjs <url> <out.png> <selector> [text-filter]');
  process.exit(1);
}
const executablePath = process.env.CHROME_PATH?.trim() || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium');
const browser = await chromium.launch({ headless: true, executablePath });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 1400 }, deviceScaleFactor: 3, locale: 'en-US' });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || style.position === 'sticky') element.style.setProperty('display', 'none', 'important');
      if (style.filter !== 'none') element.style.setProperty('filter', 'none', 'important');
    }
    document.documentElement.style.setProperty('overflow', 'auto', 'important');
    document.body.style.setProperty('overflow', 'auto', 'important');
  });
  let target = page.locator(selector);
  if (filter) target = target.filter({ hasText: filter });
  target = target.first();
  await target.scrollIntoViewIfNeeded();
  await target.screenshot({ path: out });
  console.log(JSON.stringify({ url, capturedAt: new Date().toISOString(), selector, text: (await target.innerText()).slice(0, 600) }, null, 2));
} finally {
  await browser.close();
}
