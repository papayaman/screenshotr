// screenshot-engine.ts
import express from "express";
import cors from "cors";
import { runSingleTask, createZip, recordJourney, previewJourney } from "./index.ts"; 
import { mkdir, writeFile, readdir, stat, readFile, rm } from "node:fs/promises";
import { join, isAbsolute } from "node:path";

// 🌟 THE CLEAN CONSTANTS (Respecting your new .env naming)
const PORT = Bun.env.PORT || 3000;
const SCREENSHOTS_BASE = Bun.env.SCREENSHOTS_DIR || "_screenshots";
const CONFIGS_BASE = Bun.env.CONFIGS_DIR || "_screenshot-configs";

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use("/screenshots", express.static(join(process.cwd(), SCREENSHOTS_BASE)));

// Endpoint 1: Run a single screenshot
app.post("/api/run-task", async (req, res) => {
  try {
    const { task, outputDir, globalWaitDelay } = req.body;
    const fullOutputDir = join(process.cwd(), SCREENSHOTS_BASE, outputDir);
    
    await mkdir(fullOutputDir, { recursive: true });
    
    console.log(`📸 Processing: ${task.name} into ${fullOutputDir}`);
    await runSingleTask(task, fullOutputDir, globalWaitDelay);
    
    res.status(200).json({ success: true, name: task.name });
  } catch (error) {
    console.error(`❌ Error on task:`, error);
    res.status(500).json({ error: "Task failed" });
  }
});

// Endpoint 2: Clean Folder
app.post("/api/clean-folder", async (req, res) => {
  try {
    const { outputDir } = req.body;
    const fullOutputDir = join(process.cwd(), SCREENSHOTS_BASE, outputDir);
    
    await rm(fullOutputDir, { recursive: true, force: true });
    
    console.log(`🧹 Cleaned slate for: ${fullOutputDir}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Clean error:", error);
    res.status(500).json({ error: "Failed to clean directory" });
  }
});

// Endpoint 3: Zip the folder
app.post("/api/zip-folder", async (req, res) => {
  try {
    const { outputDir } = req.body; 
    const fullOutputDir = join(process.cwd(), SCREENSHOTS_BASE, outputDir);
    const zipFileName = `${outputDir}-screenshots.zip`;
    const fullZipPath = join(fullOutputDir, zipFileName);

    console.log(`📦 Zipping folder: ${fullOutputDir}`);
    const zipName = await createZip(fullOutputDir, fullZipPath); 
    
    res.status(200).json({ success: true, zipName });
  } catch (error) {
    console.error("Zip error:", error);
    res.status(500).json({ error: "Zip failed" });
  }
});

// Endpoint 4: Real-Time Click Streaming
app.get("/api/stream-journey", async (req, res) => {
  const url = req.query.url as string;
  const width = parseInt(req.query.width as string) || 1366;
  const height = req.query.height === 'full' ? 'full' : parseInt(req.query.height as string) || 900;

  if (!url) return res.status(400).json({ error: "URL is required" });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const dummyTask = { url, width, height } as any;
    await recordJourney(dummyTask, (newSelector) => {
      res.write(`data: ${JSON.stringify({ selector: newSelector })}\n\n`);
    });
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: "Recording failed" })}\n\n`);
    res.end();
  }
});

// Endpoint 5: Save Config Locally
app.post("/api/save-config", async (req, res) => {
  try {
    const { filename, config } = req.body;
    if (!filename || !config) return res.status(400).json({ error: "Missing data" });

    const configsDir = join(process.cwd(), CONFIGS_BASE);
    await mkdir(configsDir, { recursive: true });
    
    const filePath = join(configsDir, filename.endsWith('.json') ? filename : `${filename}.json`);

    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`💾 Saved configuration: ${CONFIGS_BASE}/${filename}`);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Save failed:", error);
    res.status(500).json({ error: "Failed to save file" });
  }
});

// Endpoint 6: Download Zip File
app.get("/api/download", (req, res) => {
  try {
    const filename = req.query.file as string;
    if (!filename) return res.status(400).send("No file specified.");

    const filePath = isAbsolute(filename) ? filename : join(process.cwd(), filename);
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: "Download error" });
  }
});

// Endpoint 7: Get Recent Files
app.get("/api/recent-files", async (req, res) => {
  try {
    const configsDir = join(process.cwd(), CONFIGS_BASE);
    await mkdir(configsDir, { recursive: true }); // Ensure dir exists so readdir doesn't crash

    const files = await readdir(configsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    const filesWithStats = await Promise.all(jsonFiles.map(async f => {
      const fileStat = await stat(join(configsDir, f));
      return { name: f, time: fileStat.mtimeMs };
    }));
    
    const localRecents = filesWithStats
      .sort((a, b) => b.time - a.time)
      .slice(0, 10) // Show up to 10
      .map(f => f.name);

    res.status(200).json({ local: localRecents });
  } catch (error) {
    console.error("Failed to fetch recents:", error);
    res.status(500).json({ error: "Failed to fetch recents" });
  }
});

// Endpoint 8: Load Config
app.get("/api/load-config/:filename", async (req, res) => {
  try {
    const filePath = join(process.cwd(), CONFIGS_BASE, req.params.filename);
    const fileData = await readFile(filePath, "utf-8");
    res.status(200).json(JSON.parse(fileData));
  } catch (error) {
    res.status(404).json({ error: "File not found." }); 
  }
});

// Endpoint 9: Preview Journey
app.post("/api/preview-journey", async (req, res) => {
  try {
    const { task } = req.body;
    console.log(`👁️ Launching preview for: ${task.name}`);
    await previewJourney(task);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Preview failed" });
  }
});

// Endpoint 10: Delete Config
app.post("/api/delete-config", async (req, res) => {
  try {
    const { filename } = req.body;
    const filePath = join(process.cwd(), CONFIGS_BASE, filename);
    await rm(filePath, { force: true });
    console.log(`🗑️ Deleted config: ${filename}`);
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// Endpoint 11: Get Image List for Gallery
app.get("/api/gallery/:folder", async (req, res) => {
  try {
    const { folder } = req.params;
    const folderPath = join(process.cwd(), SCREENSHOTS_BASE, folder);
    
    const files = await readdir(folderPath);
    // Only grab PNGs
    const images = files.filter(f => f.toLowerCase().endsWith('.png'));
    
    res.status(200).json({ images });
  } catch (error) {
    res.status(404).json({ images: [], error: "Folder not found" });
  }
});

app.listen(PORT, () => console.log(`🤖 API listening at http://localhost:${PORT}`));