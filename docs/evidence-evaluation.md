## Evidence Retrieval Evaluation

This repo includes a lightweight evaluation harness for evidence retrieval quality.

### Quick start

1) Ensure env vars are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

2) Run the evaluation:
```
npm run eval:evidence
```

### Dataset

Default dataset is in:
- `data/eval/medical_queries.json`

Each entry supports optional expectations:
```
{
  "id": "cv-hypertension-treatment",
  "query": "hypertension treatment guidelines",
  "tags": ["cardiology", "primary-care"],
  "expectations": {
    "pmids": ["12345678", "23456789"],
    "journals": ["The Lancet", "JAMA"]
  }
}
```

If expectations are not provided, the harness still reports coverage metrics:
- result count
- top evidence level
- latest publication year

### Useful flags

```
npm run eval:evidence -- --limit 10
npm run eval:evidence -- --max-results 12
npm run eval:evidence -- --min-evidence-level 3
npm run eval:evidence -- --candidate-multiplier 6
npm run eval:evidence -- --min-year 2016
npm run eval:evidence -- --no-rerank
npm run eval:evidence -- --out data/eval/results.json
```

### Extending expectations

For precision/recall metrics, add expected PMIDs or journals to each case. The
evaluation script will automatically compute precision@k, recall@k, and nDCG.
