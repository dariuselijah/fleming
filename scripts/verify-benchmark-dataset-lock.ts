import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parseArgs } from "node:util";

type DatasetLockEntry = {
  path: string;
  sha256: string;
  role?: string;
};

type DatasetLockManifest = {
  version: string;
  description?: string;
  files: DatasetLockEntry[];
};

function resolveProjectPath(relativePath: string): string {
  return path.resolve(process.cwd(), relativePath);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function hashFileSha256(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string", default: "data/eval/dataset-lock-manifest.json" },
    },
  });

  const manifestPath = resolveProjectPath(values.manifest || "data/eval/dataset-lock-manifest.json");
  const manifest = readJson<DatasetLockManifest>(manifestPath);

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("Dataset lock manifest has no files.");
  }

  const failures: string[] = [];

  manifest.files.forEach((entry) => {
    const targetPath = resolveProjectPath(entry.path);
    if (!fs.existsSync(targetPath)) {
      failures.push(`Missing locked file: ${entry.path}`);
      return;
    }

    const actual = hashFileSha256(targetPath);
    if (actual !== entry.sha256.toLowerCase()) {
      failures.push(
        `Hash mismatch for ${entry.path} (${entry.role || "untyped"}): expected ${entry.sha256}, got ${actual}`
      );
    }
  });

  if (failures.length > 0) {
    console.error("❌ Dataset lock verification failed:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log(`✅ Dataset lock verification passed (${manifest.files.length} files, version ${manifest.version})`);
}

main().catch((error) => {
  console.error("Dataset lock verification failed:", error);
  process.exit(1);
});

