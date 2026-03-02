# External Healthcare Benchmarks

This folder stores external benchmark datasets and normalized derivatives used for release-note quality evaluation.

## Layout

- `raw/` — source files imported from external benchmark providers.
- `normalized/` — standardized records consumed by benchmark runners.

## Normalized Schema

Each normalized file is a JSON array of records with fields:

- `id` (string)
- `suite` (`medqa_usmle` | `pubmedqa` | `mmlu_clinical`)
- `question` (string)
- `options` (optional map of answer label to text)
- `correctAnswer` (string)
- `category` (string)
- `context` (optional string, used by PubMedQA)
- `metadata` (optional object)

## Generate Normalized Data

Use:

`npm run benchmark:external:prepare -- --suite <suite> --input <path> --out <path>`
