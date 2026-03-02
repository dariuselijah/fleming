import { execSync } from 'node:child_process';

function run(command: string) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    stdio: 'inherit',
    env: process.env,
  });
}

async function main() {
  run('npm run eval:evidence -- --input data/eval/healthcare_retrieval_queries.json --out data/eval/retrieval_release_results.json');
  run(
    'npm run benchmark:chat -- --input data/eval/healthcare_clinical_benchmarks.json --out data/eval/chat_release_results.json --base-url http://127.0.0.1:3000 --user-role doctor --bench-strict true --retries 2 --timeout-ms 90000'
  );
  run('npm run benchmark:report -- --input data/eval/chat_release_results.json --out data/eval/chat_release_report.md');
  run('npx ts-node --compiler-options \'{"module":"commonjs"}\' scripts/check-release-benchmarks.ts');
}

main().catch(error => {
  console.error('Release benchmark run failed:', error);
  process.exit(1);
});
