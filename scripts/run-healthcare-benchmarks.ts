import { execSync } from "node:child_process";

function run(command: string) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  const externalInput =
    process.env.EXTERNAL_BENCH_INPUT ||
    "data/eval/external/normalized/healthcare_external_release.json";
  const externalOutput = process.env.EXTERNAL_BENCH_OUTPUT || "data/eval/external_results.json";
  const externalThresholds =
    process.env.EXTERNAL_BENCH_THRESHOLDS || "data/eval/external_benchmark_thresholds.json";

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
