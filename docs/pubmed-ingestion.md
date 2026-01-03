# PubMed Medical Evidence Ingestion Guide

This guide explains how to ingest medical evidence from PubMed into Fleming's hybrid RAG system.

## Overview

The ingestion pipeline:
1. **Searches PubMed** for articles matching clinical topics
2. **Parses full metadata** (MeSH terms, publication types, structured abstracts)
3. **Classifies evidence level** (1-5 based on Oxford CEBM)
4. **Chunks with medical context** preservation
5. **Generates embeddings** using OpenAI
6. **Stores in Supabase** `medical_evidence` table with hybrid search support

## Prerequisites

### 1. Environment Variables

Add these to your `.env` or `.env.local` file:

```env
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your_openai_key

# Optional (for higher rate limits)
NCBI_API_KEY=your_ncbi_api_key
```

**Where to get these:**
- **Supabase URL/Key**: Project Settings → API in your Supabase dashboard
- **OpenAI Key**: https://platform.openai.com/api-keys
- **NCBI Key**: https://www.ncbi.nlm.nih.gov/account/settings/ (optional, increases rate limit from 3/sec to 10/sec)

### 2. Database Setup

Run the migration in your Supabase SQL Editor:

```bash
# The migration file is at:
# migrate-medical-evidence.sql
```

This creates:
- `medical_evidence` table with vector embeddings
- `hybrid_medical_search` RPC function (Reciprocal Rank Fusion)
- Full-text search indexes
- Evidence level filtering

---

## Usage

### Quick Start

```bash
# Install dependencies (first time only)
npm install

# Dry run - see what would be ingested
npm run ingest:dry-run

# Ingest recommended clinical topics (high-evidence only)
npm run ingest:recommended

# Ingest a single topic
npm run ingest -- --topic "hypertension treatment"
```

### CLI Options

```bash
npm run ingest -- [options]

Options:
  -t, --topic <topic>      Single topic to ingest
  -f, --topics-file <file> File with topics (one per line)
  -r, --recommended        Use 30+ recommended clinical topics
  -m, --max <number>       Max articles per topic (default: 100)
  --from-year <year>       Start year (default: 2015)
  --to-year <year>         End year (default: current)
  -h, --high-evidence      Filter to Meta-analyses, RCTs, Guidelines only
  -d, --dry-run            Preview without ingesting
  --ncbi-key <key>         NCBI API key override
  --help                   Show help
```

---

## Ingestion Plans

### Plan A: Starter (~$5, ~30 min)

Best for: Testing the system

```bash
npm run ingest -- --topic "hypertension treatment" --high-evidence --max 50
```

- ~50 articles
- ~150 chunks
- Cost: ~$0.50

### Plan B: Core Clinical (~$15, ~2 hours)

Best for: Production MVP

```bash
npm run ingest -- --recommended --high-evidence --max 100 --from-year 2018
```

Covers 30+ topics:
- Cardiovascular (hypertension, heart failure, AFib)
- Metabolic (diabetes, obesity, thyroid)
- Respiratory (asthma, COPD, pneumonia)
- Infectious (COVID-19, UTI, skin infections)
- Mental health (depression, anxiety, insomnia)
- Pain (chronic pain, migraine, neuropathy)
- GI (GERD, IBD, IBS)
- MSK (osteoarthritis, RA, osteoporosis)
- Oncology screening

Estimate:
- ~3,000 articles
- ~9,000 chunks
- Cost: ~$15

### Plan C: Comprehensive (~$50, ~6 hours)

Best for: Full clinical coverage

```bash
npm run ingest -- --recommended --max 500 --from-year 2015
```

Includes all publication types:
- ~15,000 articles
- ~45,000 chunks
- Cost: ~$50

### Plan D: Specialty Deep Dive

Create a `topics.txt` file:

```text
acute coronary syndrome treatment
STEMI management
NSTEMI antiplatelet therapy
heart failure with reduced ejection fraction
heart failure preserved ejection fraction
cardiogenic shock management
```

Then run:

```bash
npm run ingest -- --topics-file topics.txt --max 300 --from-year 2018
```

---

## Recommended Topics List

The `--recommended` flag includes these 30+ clinical topics:

### Cardiovascular
- hypertension treatment
- atrial fibrillation management
- heart failure therapy
- coronary artery disease
- hyperlipidemia statin therapy

### Metabolic
- type 2 diabetes management
- obesity pharmacotherapy
- thyroid disorder treatment

### Respiratory
- asthma treatment guidelines
- COPD exacerbation management
- pneumonia antibiotic therapy

### Infectious Disease
- COVID-19 treatment
- urinary tract infection antibiotic
- skin soft tissue infection

### Mental Health
- major depressive disorder treatment
- generalized anxiety disorder therapy
- insomnia pharmacotherapy

### Pain Management
- chronic pain management
- migraine acute treatment
- neuropathic pain therapy

### Gastroenterology
- GERD treatment
- inflammatory bowel disease therapy
- irritable bowel syndrome management

### Musculoskeletal
- osteoarthritis treatment
- rheumatoid arthritis therapy
- osteoporosis prevention treatment

### Oncology Screening
- breast cancer screening
- colorectal cancer screening
- lung cancer screening

### Preventive Medicine
- vaccination adult immunization
- preventive cardiovascular aspirin

---

## Evidence Levels

Articles are classified using the Oxford CEBM hierarchy:

| Level | Study Type | Color |
|-------|------------|-------|
| 1 | Meta-analysis, Systematic Review | 🟢 Green |
| 2 | Randomized Controlled Trial | 🔵 Blue |
| 3 | Cohort/Case-Control Study | 🟡 Yellow |
| 4 | Case Report/Series | 🟠 Orange |
| 5 | Expert Opinion, Review | ⚪ Gray |

Use `--high-evidence` to filter to Levels 1-2 only.

---

## Monitoring Progress

The CLI shows real-time progress:

```
[hypertension treatment] 45/100 articles (45%) | 127 chunks | 127 embeddings
```

After completion:

```
============================================================
  Ingestion Complete
============================================================
  Total topics: 30
  Total articles: 2,847
  Total chunks: 8,541
  Total errors: 0
  Duration: 47m 23s
```

---

## Incremental Updates

The system supports incremental ingestion:

```bash
# Re-run same topic - only new articles are added (deduplication by PMID)
npm run ingest -- --topic "hypertension treatment" --from-year 2024
```

The upsert operation ensures:
- Existing articles are updated (if changed)
- New articles are added
- No duplicates

---

## Troubleshooting

### "Missing environment variables"

Ensure your `.env` or `.env.local` file has:
```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
```

### "Failed to create Supabase client"

Run `npm install` to ensure `@supabase/supabase-js` is installed.

### Rate limiting errors

- Without NCBI API key: 3 requests/second
- With NCBI API key: 10 requests/second

Get a free key at: https://www.ncbi.nlm.nih.gov/account/settings/

### Embedding errors

- Check OpenAI API key is valid
- Ensure you have credits in your OpenAI account
- The script retries failed batches automatically

### Database errors

1. Ensure the migration has been run
2. Check Supabase service role key has insert permissions
3. Verify the `medical_evidence` table exists

---

## Cost Estimation

| Articles | Chunks (est.) | Embedding Cost | Time (est.) |
|----------|---------------|----------------|-------------|
| 100 | 300 | ~$0.50 | ~5 min |
| 500 | 1,500 | ~$2.50 | ~20 min |
| 1,000 | 3,000 | ~$5 | ~40 min |
| 5,000 | 15,000 | ~$25 | ~3 hours |
| 10,000 | 30,000 | ~$50 | ~6 hours |

Formula:
- ~3 chunks per article (average)
- ~500 tokens per chunk
- OpenAI embedding: $0.00002 per 1K tokens

---

## Next Steps After Ingestion

1. **Test hybrid search**: Use the `hybrid_medical_search` RPC in Supabase
2. **Integrate with chat**: Connect to your chat API route
3. **Add evidence badges**: Display evidence level in citation pills
4. **Set up scheduled updates**: Cron job for weekly ingestion of new articles

