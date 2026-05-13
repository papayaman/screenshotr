// screenshot-ui/index.ts
import puppeteer from "puppeteer";
import { readdir, stat, readFile, mkdir, rm } from "node:fs/promises";
import { join, basename } from "node:path";
import { createWriteStream } from 'node:fs';
import sharp from "sharp"; 
import AdmZip from "adm-zip";

export interface ScreenshotTask {
  name: string;
  url: string;
  width: number;
  height: number | "full";
  clickSelectors?: string[]; 
  scrollToSelector?: string; 
  waitDelay?: number;
  clearCache?: boolean;
  globalCss?: string;
}

export async function runSingleTask(task: ScreenshotTask, outputDir: string, globalWaitDelay: number = 2000): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const isFullPage = task.height === "full";
    const viewWidth = task.width;
    const viewHeight = isFullPage ? 800 : (task.height as number); 

    if (task.clearCache) {
      await page.setCacheEnabled(false);
      console.log(`  🧹 Cache disabled for: ${task.name}`);
    }

    await page.setViewport({ width: viewWidth, height: viewHeight });
    await page.goto(task.url, { waitUntil: "networkidle2", timeout: 30000 });

    if (task.globalCss && task.globalCss.trim() !== '') {
      try {
        await page.addStyleTag({ content: task.globalCss });
        console.log(`  🎨 Injected CSS for: ${task.name}`);
      } catch (e) {
        console.log(`  ⚠️ Failed to inject CSS for: ${task.name}`);
      }
    }

    if (task.clickSelectors && Array.isArray(task.clickSelectors)) {
      for (const selector of task.clickSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (e) { /* Ignore */ }
      }
    }

    // NEW: Scroll To Selector Logic
    if (task.scrollToSelector) {
      try {
        await page.waitForSelector(task.scrollToSelector, { timeout: 5000 });
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, task.scrollToSelector);
        
        console.log(`  📜 Scrolled to: ${task.scrollToSelector}`);
        // Give lazy-loaded images an extra second to load after scrolling
        await new Promise(r => setTimeout(r, 1000)); 
      } catch (e) {
        console.log(`  ⚠️ Could not scroll to: ${task.scrollToSelector}`);
      }
    }

    if (isFullPage) {
      const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ width: viewWidth, height: fullHeight });
    }

    const delay = task.waitDelay !== undefined ? task.waitDelay : globalWaitDelay;
    await new Promise(r => setTimeout(r, delay));

    const filename = `${task.name}.png`;
    const filepath = join(outputDir, filename);

    const imageBuffer = await page.screenshot({ fullPage: isFullPage });

    await sharp(imageBuffer)
      .png({ quality: 80, compressionLevel: 9, force: true })
      .toFile(filepath);

  } finally {
    await browser.close();
  }
}

export const createZip = async (folderToZip: string, exactZipPath: string): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      const zip = new AdmZip();
      
      // 1. Read the folder contents
      const files = await readdir(folderToZip);
      
      for (const file of files) {
        // 2. Ignore existing .zip files
        if (!file.endsWith('.zip')) {
          const fullPath = join(folderToZip, file);
          const fileStat = await stat(fullPath);
          
          // 3. Add files to the zip buffer
          if (fileStat.isFile()) {
            zip.addLocalFile(fullPath);
          }
        }
      }
      
      // 4. Write the zip to disk synchronously (no streams!)
      zip.writeZip(exactZipPath);
      resolve(exactZipPath);
    } catch (err) {
      reject(err);
    }
  });
};

export async function recordJourney(task: ScreenshotTask, onSelectorRecorded?: (selector: string) => void): Promise<string[]> {
  console.log(`\n🎬 Starting recording session for: ${task.url}`);
  
  const isFullPage = task.height === "full";
  const viewWidth = task.width || 1366;
  const viewHeight = isFullPage ? 900 : (task.height as number);

  const browser = await puppeteer.launch({
    headless: false, 
    defaultViewport: { width: viewWidth, height: viewHeight },
    args: [
      `--window-size=${viewWidth},${viewHeight + 130}`,
      '--no-sandbox', 
      '--disable-setuid-sandbox'
    ]
  });

  const page = await browser.newPage();
  const recordedSelectors: string[] = [];

  await page.exposeFunction('reportClickToNode', (selector: string) => {
    console.log(`  📍 Recorded: ${selector}`);
    recordedSelectors.push(selector);
    
    if (onSelectorRecorded) {
      onSelectorRecorded(selector);
    }
  });

  await page.evaluateOnNewDocument(() => {
    function getCssSelector(el: Element | null): string {
      if (!el) return "";
      if (el.tagName.toLowerCase() === "html") return "html";
      if (el.id) return `#${el.id}`;
      
      let selector = el.tagName.toLowerCase();
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          selector += `.${classes.join('.')}`;
        }
      }
      return selector;
    }

    document.addEventListener('click', (e) => {
      e.preventDefault(); 
      e.stopPropagation();

      const target = e.target as HTMLElement;
      const selector = getCssSelector(target);
      
      (window as any).reportClickToNode(selector);

      const originalOutline = target.style.outline;
      target.style.outline = '3px solid red';
      setTimeout(() => {
        target.style.outline = originalOutline;
      }, 400);

    }, true); 
  });

  await page.goto(task.url, { waitUntil: 'networkidle2' });

  return new Promise((resolve) => {
    let isResolved = false;

    const finishRecording = async () => {
      if (isResolved) return;
      isResolved = true;
      
      console.log(`🛑 Recording finished. Captured ${recordedSelectors.length} selectors.`);
      resolve(recordedSelectors);
      
      try {
        if (browser.connected) await browser.close();
      } catch (e) { }
    };

    page.on('close', finishRecording);
    browser.on('disconnected', finishRecording);
  });
}

export async function previewJourney(task: ScreenshotTask): Promise<void> {
  console.log(`\n👁️ Starting preview session for: ${task.url}`);
  
  const isFullPage = task.height === "full";
  const viewWidth = task.width || 1366;
  const viewHeight = isFullPage ? 900 : (task.height as number);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: viewWidth, height: viewHeight },
    args: [
      `--window-size=${viewWidth},${viewHeight + 130}`,
      '--no-sandbox', 
      '--disable-setuid-sandbox'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.goto(task.url, { waitUntil: 'networkidle2' });

    if (task.globalCss && task.globalCss.trim() !== '') {
      try {
        await page.addStyleTag({ content: task.globalCss });
        console.log(`  🎨 Injected CSS into Preview`);
      } catch (e) {
        console.log(`  ⚠️ Failed to inject CSS into Preview`);
      }
    }

    if (task.clickSelectors && task.clickSelectors.length > 0) {
      for (const selector of task.clickSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          
          await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLElement;
            if (el) {
              el.style.outline = '4px solid #00ff00';
              el.style.boxShadow = '0 0 15px #00ff00';
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, selector);

          await new Promise(r => setTimeout(r, 1000));

          const element = await page.$(selector);
          if (element) {
            await element.click();
            console.log(`  👁️ Preview Clicked: ${selector}`);
            await new Promise(r => setTimeout(r, 1000)); 
          }
        } catch (e) {
          console.log(`  ❌ Preview could not find/click: ${selector}`);
        }
      }
    }

    console.log(`  ✅ Preview ready! Window left open for inspection.`);
    return;

  } catch (error) {
    if (browser.connected) await browser.close();
    throw error;
  }
}

// ============================================================================
// 🖥️ CLI EXECUTOR (Only runs if executed directly via `bun run index.ts`)
// ============================================================================
if (import.meta.main) {
  (async () => {
    // 1. Parse the command line argument
    const args = process.argv.slice(2);
    if (args.length === 0) {
      console.error("\n❌ Error: Please provide a configuration file.");
      console.log("👉 Usage: bun run index.ts <project-name>\n");
      process.exit(1);
    }

    // 🌟 FIX 1: Use basename to strip out accidental folder paths from terminal auto-complete
    const { basename } = require('node:path');
    let filename = basename(args[0]);
    if (!filename.endsWith('.json')) filename += '.json';

    // 2. Setup Paths
    const repoPath = process.env.CONFIG_REPO_PATH || "./configs";
    const baseDir = process.env.SCREENSHOTS_DIR || "_screenshots";
    const projectName = filename.replace(/\.json$/i, '');
    
    const configPath = join(process.cwd(), repoPath, filename);
    const fullOutputDir = join(process.cwd(), baseDir, projectName);

    try {
      // 3. Read and parse the JSON file
      console.log(`\n📄 Loading configuration: ${filename}...`);
      const fileData = await readFile(configPath, "utf-8");
      const config = JSON.parse(fileData);

      if (!config.tasks || config.tasks.length === 0) {
        throw new Error("No tasks found in the configuration file.");
      }

      // 4. Wipe the slate clean
      console.log(`🧹 Cleaning output directory...`);
      await rm(fullOutputDir, { recursive: true, force: true });
      await mkdir(fullOutputDir, { recursive: true });

      // 5. Run the automation loop
      console.log(`🚀 Starting execution for ${config.tasks.length} tasks...\n`);
      const globalWaitDelay = config.globalWaitDelay || 2000;
      
      let count = 0;
      for (const task of config.tasks) {
        count++;
        
        // 🌟 FIX 2: Smartly combine Base URL and Task URL
        if (config.baseUrl && !task.url.startsWith('http')) {
          const base = config.baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
          const path = task.url.replace(/^\/+/, ''); // Remove leading slashes
          task.url = `${base}/${path}`;
        } else if (!task.url.startsWith('http')) {
          task.url = `https://${task.url}`; // Puppeteer requires a protocol
        }

        console.log(`📸 [${count}/${config.tasks.length}] Capturing: ${task.name}`);
        console.log(`   🔗 URL: ${task.url}`);
        
        // Inject global CSS into the task if it exists
        if (config.globalCss && !task.globalCss) {
          task.globalCss = config.globalCss;
        }

        await runSingleTask(task, fullOutputDir, globalWaitDelay);
      }

      // 6. Zip the final results
      console.log(`\n📦 Zipping files...`);
      const zipPath = join(fullOutputDir, `${projectName}-screenshots.zip`);
      await createZip(fullOutputDir, zipPath);
      
      console.log(`✅ Success! All files saved to:`);
      console.log(`📂 ${zipPath}\n`);
      
      process.exit(0);

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.error(`\n❌ Error: Could not find configuration file at ${configPath}\n`);
      } else {
        console.error(`\n❌ Fatal Error:`, error.message, "\n");
      }
      process.exit(1);
    }
  })();
}