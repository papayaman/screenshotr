import { createServer } from "node:net";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

// 1. Recursive function to find the next open port
const findAvailablePort = (startPort: number): Promise<number> => {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(startPort, () => {
      server.close(() => resolve(startPort));
    });
    server.on("error", () => {
      // If port is taken, add 1 and try again
      resolve(findAvailablePort(startPort + 1));
    });
  });
};

(async () => {
  try {
    // 2. Find an open port starting at 3000
    const port = await findAvailablePort(3000);
    console.log(`\n🔍 Found available backend port: ${port}`);

    // 3. Dynamically rewrite BOTH Angular environment files
    const envContent = `export const environment = {
  production: false,
  defaultFilename: 'project.json',
  apiUrl: 'http://localhost:${port}'
};\n`;
    
    const envPath = join(process.cwd(), "screenshot-ui", "src", "environments", "environment.ts");
    const envDevPath = join(process.cwd(), "screenshot-ui", "src", "environments", "environment.development.ts");
    
    await writeFile(envPath, envContent, "utf-8");
    await writeFile(envDevPath, envContent, "utf-8");
    console.log(`✅ Dynamically injected port ${port} into both Angular environment files!`);

    // 4. Inject the port into the backend process environment
    process.env.PORT = port.toString();

    // 5. Launch the exact same concurrently command
    console.log(`🚀 Launching full stack...\n`);
    const cmd = `bun run concurrently -c "cyan.bold,magenta.bold" -n "BACKEND,ANGULAR" "bun run start:backend" "bun run start:frontend"`;
    
    // Spawn the process and pass the terminal output directly to your screen
    spawn(cmd, { shell: true, stdio: 'inherit' });

  } catch (error) {
    console.error("❌ Failed to launch dynamically:", error);
    process.exit(1);
  }
})();