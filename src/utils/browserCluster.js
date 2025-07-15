// browserCluster.js
import { Cluster } from 'puppeteer-cluster';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getPuppeteerLaunchOptions } from './puppeteerConfig.js';

puppeteerExtra.use(StealthPlugin());

let cluster = null;

/**
 * Lazily initialize (or return) the puppeteer‑cluster singleton.
 */
export async function initBrowserCluster() {
  if (cluster) return cluster;

  const launchOptions = await getPuppeteerLaunchOptions();
  cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: process.env.NODE_ENV === 'production' ? 3 : 5,
    timeout: 15 * 60 * 1000,            // 15m per task
    puppeteerOptions: {
      ...launchOptions,
      args: [
        ...launchOptions.args,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
      headless: process.env.NODE_ENV === 'production' ? 'new' : 'false',
      ignoreHTTPSErrors: true,
    },
  });

  cluster.on('taskerror', (err, data) => {
    console.error(`[BrowserCluster] Task error on ${data.taskId}/${data.userId}:`, err);
  });

  return cluster;
}

/**
 * Gracefully close the cluster and all its contexts.
 */
export async function closeBrowserCluster() {
  if (!cluster) return;
  await cluster.close();
  cluster = null;
}

/**
 * Run your `taskFn(page, taskId, userId)` inside a cluster‑managed page.
 * The cluster auto‑releases its incognito context when this promise settles.
 *
 * @param {string} taskId
 * @param {string} userId
 * @param {(page: import('puppeteer').Page, taskId: string, userId: string) => Promise<any>} taskFn
 * @returns {Promise<any>} whatever your taskFn returns
 */
export async function executeWithBrowser(taskId, userId, taskFn) {
  const c = await initBrowserCluster();

  return c.execute(
    { taskId, userId },
    async ({ page, data }) => {
      // keep a stable UA
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/120.0.0.0 Safari/537.36'
      );

      try {
        return await taskFn(page, data.taskId, data.userId);
      } catch (err) {
        console.error(`[BrowserCluster] Task ${data.taskId} threw:`, err);
        throw err;
      }
    }
  );
}
