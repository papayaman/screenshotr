// screenshot-engine.ts
import express from "express";
import cors from "cors";
import { runSingleTask, createZip, recordJourney, previewJourney } from "./index.ts"; 
import { mkdir, writeFile, readdir, stat, readFile, rm } from "node:fs/promises"; // 🌟 Added rm
import { join, isAbsolute } from "node:path";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Endpoint 1: Run a single screenshot
app.post("/api/run-task", async (req, res) => {
  try {
    const { task, outputDir, globalWaitDelay } = req.body;
    
    const baseDir = process.env.SCREENSHOTS_DIR || "_screenshots";
    const fullOutputDir = join(process.cwd(), baseDir, outputDir);
    
    await mkdir(fullOutputDir, { recursive: true });
    
    console.log(`📸 Processing: ${task.name} into ${fullOutputDir}`);
    await runSingleTask(task, fullOutputDir, globalWaitDelay);
    
    res.status(200).json({ success: true, name: task.name });
  } catch (error) {
    console.error(`❌ Error on ${req.body?.task?.name}:`, error);
    res.status(500).json({ error: "Task failed" });
  }
});

// Endpoint 2: Clean Folder
app.post("/api/clean-folder", async (req, res) => {
  try {
    const { outputDir } = req.body;
    
    const baseDir = process.env.SCREENSHOTS_DIR || "_screenshots";
    const fullOutputDir = join(process.cwd(), baseDir, outputDir);
    
    // 🌟 Safely delete the directory and everything inside it
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
    const { outputDir } = req.body; // e.g., "AUV_HCP"
    
    const baseDir = process.env.SCREENSHOTS_DIR || "_screenshots";
    const fullOutputDir = join(process.cwd(), baseDir, outputDir);
    const zipFileName = `${outputDir}-screenshots.zip`;
    const fullZipPath = join(fullOutputDir, zipFileName);

    console.log(`📦 Zipping folder: ${fullOutputDir}`);
    
    // Pass BOTH the folder to zip, and exactly where to save it
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
    if (!filename || !config) {
      return res.status(400).json({ error: "Filename and config required" });
    }

    const repoPath = process.env.CONFIG_REPO_PATH || "./configs";
    const configsDir = join(process.cwd(), repoPath);
    
    // Ensure the directory exists
    await mkdir(configsDir, { recursive: true });
    
    const filePath = join(configsDir, filename);

    await writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
    console.log(`💾 Saved configuration: ${repoPath}/${filename}`);
    
    res.status(200).json({ success: true, message: "Saved locally" });
  } catch (error) {
    console.error("Save failed:", error);
    res.status(500).json({ error: "Failed to save file" });
  }
});

// Endpoint 6: Download Zip File
app.get("/api/download", (req, res) => {
  try {
    const filename = req.query.file as string;
    
    if (!filename) {
      return res.status(400).send("No file specified.");
    }

    // SMART PATH RESOLUTION: Look in the root folder or use absolute path
    const filePath = isAbsolute(filename) 
      ? filename 
      : join(process.cwd(), filename);

    console.log(`📥 Client requested download. Looking for: ${filePath}`);

    res.download(filePath, (err) => {
      if (err) {
        console.error(`❌ Download failed. The file is not at: ${filePath}`);
        if (!res.headersSent) res.status(404).send("File not found on server.");
      } else {
        console.log(`✅ Download complete: ${filename}`);
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Download error" });
  }
});

// Endpoint 7: Get Recent Files (Local Only)
app.get("/api/recent-files", async (req, res) => {
  try {
    const repoPath = process.env.CONFIG_REPO_PATH || "./configs";
    const configsDir = join(process.cwd(), repoPath);

    // --- GET LOCAL RECENTS ---
    const files = await readdir(configsDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    // Get stats to sort by modified time
    const filesWithStats = await Promise.all(jsonFiles.map(async f => {
      const fileStat = await stat(join(configsDir, f));
      return { name: f, time: fileStat.mtimeMs };
    }));
    
    const localRecents = filesWithStats
      .sort((a, b) => b.time - a.time)
      .slice(0, 5)
      .map(f => f.name);

    // Return empty array for remote to satisfy any existing UI interfaces safely
    res.status(200).json({ local: localRecents, remote: [] });
  } catch (error) {
    console.error("Failed to fetch recents:", error);
    res.status(500).json({ error: "Failed to fetch recents" });
  }
});

// Endpoint 8: Load a Specific Config File
app.get("/api/load-config/:filename", async (req, res) => {
  try {
    const repoPath = process.env.CONFIG_REPO_PATH || "./configs";
    const filePath = join(process.cwd(), repoPath, req.params.filename);
    
    const fileData = await readFile(filePath, "utf-8");
    res.status(200).json(JSON.parse(fileData));
  } catch (error) {
    res.status(404).json({ error: "File not found locally." }); 
  }
});

// Endpoint 9: Preview Journey
app.post("/api/preview-journey", async (req, res) => {
  try {
    const { task } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: "No task provided" });
    }

    console.log(`👁️ Client requested preview for: ${task.name}`);
    
    // Call the function we built in index.ts
    await previewJourney(task);
    
    // Once the Puppeteer window closes, tell the UI it finished successfully
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({ error: "Preview failed to launch" });
  }
});

// Endpoint 10: Delete a Config File
app.post("/api/delete-config", async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "Filename required" });

    const repoPath = process.env.CONFIG_REPO_PATH || "./configs";
    const filePath = join(process.cwd(), repoPath, filename);

    // Use the 'rm' we imported at the top
    await rm(filePath, { force: true });
    
    console.log(`🗑️ Deleted config: ${filename}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

app.listen(PORT, () => console.log(`🤖 API listening at http://localhost:${PORT}`));