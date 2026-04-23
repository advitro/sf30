#!/usr/bin/env node
// Cross-platform zip script for packaging the dist/ directory

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const distDir = path.resolve(__dirname, "dist");
const outZip = path.resolve(__dirname, "shift-grabber-v9.zip");

if (!fs.existsSync(distDir)) {
  console.error("❌ dist/ directory not found. Run `npm run build` first.");
  process.exit(1);
}

if (fs.existsSync(outZip)) {
  fs.unlinkSync(outZip);
}

try {
  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${outZip}' -Force"`,
      { stdio: "inherit" }
    );
  } else {
    execSync(`cd "${distDir}" && zip -r "${outZip}" .`, { stdio: "inherit" });
  }
  console.log("\n✅ Created", outZip);
} catch (e) {
  console.error("❌ Zip creation failed:", e.message);
  process.exit(1);
}
