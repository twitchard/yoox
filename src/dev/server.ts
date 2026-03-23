// Simple dev server with file watching and auto-rebuild

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

export function startDevServer(
  inputPath: string,
  buildFn: (inputPath: string) => string,
  port: number
): void {
  let html = buildFn(inputPath);

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  // Watch for changes
  const watchPath = fs.statSync(inputPath).isDirectory() ? inputPath : path.dirname(inputPath);
  const watcher = fs.watch(watchPath, { recursive: true }, (eventType, filename) => {
    if (filename && (filename.endsWith(".ux") || filename === path.basename(inputPath))) {
      console.log(`\n  File changed: ${filename}. Rebuilding...`);
      try {
        html = buildFn(inputPath);
        console.log("  Rebuilt successfully.");
      } catch (err) {
        console.error("  Build error:", (err as Error).message);
      }
    }
  });

  server.listen(port, () => {
    console.log(`\n  Yoox dev server running at http://localhost:${port}`);
    console.log(`  Watching ${watchPath} for changes...\n`);
  });

  process.on("SIGINT", () => {
    watcher.close();
    server.close();
    process.exit(0);
  });
}
