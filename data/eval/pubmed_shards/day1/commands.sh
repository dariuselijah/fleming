#!/usr/bin/env bash
set -euo pipefail

# Generated PubMed shard command pack
# Launch each line in a separate terminal/session for maximum parallelism.

npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_01.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-01.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_02.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-02.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_03.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-03.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_04.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-04.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_05.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-05.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_06.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-06.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_07.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-07.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_08.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-08.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_09.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-09.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_10.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-10.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_11.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-11.json
npm run ingest:scale -- --topics-file data/eval/pubmed_shards/day1/pubmed_day1_shard_12.txt --workers 2 --max-per-topic 2000 --from-year 2018 --high-evidence --checkpoint ingestion-day1-checkpoint-12.json
