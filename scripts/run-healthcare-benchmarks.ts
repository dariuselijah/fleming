import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(command: string) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  const configuredExternalInput =
    process.env.EXTERNAL_BENCH_INPUT ||
    "data/eval/external/normalized/healthcare_external_release.json";
  const fallbackExternalInput =
    "data/eval/external/normalized/sample_external_healthcare.json";
  const resolvedConfiguredInput = path.resolve(process.cwd(), configuredExternalInput);
  const externalInput = fs.existsSync(resolvedConfiguredInput)
    ? configuredExternalInput
    : fallbackExternalInput;
  const externalOutput = process.env.EXTERNAL_BENCH_OUTPUT || "data/eval/external_results.json";
  const externalThresholds =
    process.env.EXTERNAL_BENCH_THRESHOLDS || "data/eval/external_benchmark_thresholds.json";

  if (!fs.existsSync(path.resolve(process.cwd(), externalInput))) {
    throw new Error(
      `External benchmark input not found: ${configuredExternalInput} (fallback also missing: ${fallbackExternalInput})`
    );
  }

  if (externalInput !== configuredExternalInput) {
    console.warn(
      `[benchmark:healthcare] External benchmark input not found at "${configuredExternalInput}". Falling back to "${fallbackExternalInput}".`
    );
  }

  run("npm run benchmark:release:strict");
  run(
    `npm run benchmark:external -- --input ${externalInput} --out ${externalOutput}`
  );
  run(
    `npm run benchmark:external:check -- --input ${externalOutput} --thresholds ${externalThresholds}`
  );
  run(
    `npm run benchmark:healthcare:report -- --chat data/eval/chat_release_results.json --retrieval data/eval/retrieval_release_results.json --external ${externalOutput} --out data/eval/healthcare_benchmark_report.md`
  );
}

main().catch((error) => {
  console.error("Healthcare benchmark run failed:", error);
  process.exit(1);
});
