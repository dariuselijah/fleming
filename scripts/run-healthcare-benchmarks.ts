import { execSync } from "node:child_process";

function run(command: string) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: process.env,
  });
}

async function main() {
  run("npm run benchmark:release:strict");
  run(
    "npm run benchmark:external -- --input data/eval/external/normalized/sample_external_healthcare.json --out data/eval/external_results.json"
  );
  run("npm run benchmark:external:check -- --input data/eval/external_results.json");
  run(
    "npm run benchmark:healthcare:report -- --chat data/eval/chat_release_results.json --retrieval data/eval/retrieval_release_results.json --external data/eval/external_results.json --out data/eval/healthcare_benchmark_report.md"
  );
}

main().catch((error) => {
  console.error("Healthcare benchmark run failed:", error);
  process.exit(1);
});
