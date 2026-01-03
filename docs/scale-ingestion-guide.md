# High-Performance PubMed Ingestion Guide

## Overview

This guide covers how to ingest **1M+ articles** from PubMed efficiently using the optimized ingestion pipeline.

## Quick Start

### Basic Large-Scale Ingestion

```bash
# Start with 10 workers, 10K articles per topic
npm run ingest:scale -- --workers 10 --max-per-topic 10000
```

### Resume from Checkpoint

If ingestion is interrupted, resume from checkpoint:

```bash
npm run ingest:scale -- --resume --workers 10
```

## Configuration Options

### Workers (Parallel Processing)

- **Default**: 5 workers
- **Recommended for 1M+**: 10-20 workers
- **Maximum**: Limited by your system resources and API rate limits

```bash
npm run ingest:scale -- --workers 20 --max-per-topic 10000
```

### Articles Per Topic

- **Default**: 5,000 articles per topic
- **For 1M+ articles**: 10,000-50,000 per topic
- **Total topics**: ~200 comprehensive topics

```bash
# Target 1M articles: 200 topics × 5,000 articles = 1M
npm run ingest:scale -- --workers 10 --max-per-topic 5000

# Target 2M articles: 200 topics × 10,000 articles = 2M
npm run ingest:scale -- --workers 15 --max-per-topic 10000
```

### Date Range

```bash
# Recent articles only (2015-2025)
npm run ingest:scale -- --from-year 2015 --to-year 2025

# Comprehensive (2010-2025)
npm run ingest:scale -- --from-year 2010 --to-year 2025
```

### High-Evidence Filter

Filter to only high-quality evidence (Meta-Analysis, RCTs, Guidelines):

```bash
npm run ingest:scale -- --high-evidence --max-per-topic 10000
```

## Performance Optimizations

### 1. Batch Sizes

The system is optimized with:
- **Embedding batches**: 200 chunks (up from 50)
- **Storage batches**: 500 chunks (up from 100)
- **Parallel embedding**: 3 concurrent batches
- **PubMed fetch**: 500 PMIDs per request

### 2. Deduplication

- Automatically checks for existing articles before processing
- Skips articles already in database
- Saves time and API costs

### 3. Checkpoint System

- Saves progress after each topic batch
- Resume from any point if interrupted
- Tracks: topics completed, articles processed, errors

### 4. Rate Limiting

- **Without NCBI API key**: 3 requests/second
- **With NCBI API key**: 10 requests/second (recommended for scale)

Get your NCBI API key: https://www.ncbi.nlm.nih.gov/account/settings/

```bash
npm run ingest:scale -- --ncbi-key YOUR_KEY --workers 10
```

## Topic Coverage

The comprehensive topic list includes:

- **Cardiovascular** (100K+ articles): Hypertension, heart failure, arrhythmias, etc.
- **Metabolic/Endocrine** (80K+): Diabetes, obesity, thyroid, osteoporosis
- **Respiratory** (60K+): Asthma, COPD, pneumonia
- **Infectious Disease** (100K+): COVID-19, sepsis, UTIs, etc.
- **Mental Health** (80K+): Depression, anxiety, bipolar, etc.
- **Pain Management** (50K+): Chronic pain, migraines, neuropathic pain
- **Gastroenterology** (60K+): GERD, IBD, IBS, liver disease
- **Musculoskeletal** (50K+): Osteoarthritis, RA, gout
- **Oncology** (150K+): All major cancers, screening, treatment
- **Nephrology** (40K+): CKD, dialysis, transplantation
- **Neurology** (80K+): Alzheimer's, Parkinson's, stroke, epilepsy
- **And 10+ more specialties**

**Total**: ~200 topics covering all major medical specialties

## Custom Topics

Create your own topic file:

```bash
# topics.txt
hypertension treatment
diabetes management
heart failure therapy
...

# Use custom topics
npm run ingest:scale -- --topics-file topics.txt --workers 10
```

## Monitoring Progress

### Checkpoint File

The checkpoint file (`ingestion-checkpoint.json`) contains:

```json
{
  "version": "1.0",
  "startTime": "2025-01-01T00:00:00Z",
  "lastUpdate": "2025-01-01T12:00:00Z",
  "topics": [
    {
      "topic": "hypertension treatment",
      "status": "completed",
      "articlesProcessed": 5000,
      "chunksCreated": 15000,
      "errors": 0
    }
  ],
  "stats": {
    "totalTopics": 200,
    "completedTopics": 50,
    "totalArticles": 250000,
    "totalChunks": 750000,
    "totalErrors": 5
  }
}
```

### Real-Time Monitoring

Watch the checkpoint file:

```bash
# Terminal 1: Run ingestion
npm run ingest:scale -- --workers 10

# Terminal 2: Monitor progress
watch -n 5 'cat ingestion-checkpoint.json | jq .stats'
```

## Cost Estimation

### Embedding Costs (OpenAI)

- **Model**: `text-embedding-3-small`
- **Cost**: ~$0.00002 per 1K tokens
- **Average**: 500 tokens per chunk
- **1M chunks**: ~$10
- **10M chunks**: ~$100

### Storage Costs (Supabase)

- **Free tier**: 500MB database
- **1M chunks**: ~2-3GB (with embeddings)
- **10M chunks**: ~20-30GB

### Time Estimates

- **With 10 workers**: ~100-200 articles/minute
- **1M articles**: ~3-5 days continuous
- **10M articles**: ~30-50 days continuous

## Best Practices

### 1. Start Small, Scale Up

```bash
# Test with small batch first
npm run ingest:scale -- --workers 5 --max-per-topic 1000

# Then scale up
npm run ingest:scale -- --workers 20 --max-per-topic 10000
```

### 2. Use NCBI API Key

Significantly faster with API key:

```bash
export NCBI_API_KEY=your_key_here
npm run ingest:scale -- --workers 15
```

### 3. Monitor Resources

- **CPU**: High usage during parallel processing
- **Memory**: ~2-4GB per worker
- **Network**: Sustained API calls
- **Database**: Monitor connection pool

### 4. Error Handling

- Errors are logged but don't stop ingestion
- Failed topics can be retried
- Checkpoint tracks all errors

### 5. Resume Strategy

Always use checkpoints for long-running ingestions:

```bash
# Start with checkpoint
npm run ingest:scale -- --workers 10 --checkpoint my-checkpoint.json

# Resume if interrupted
npm run ingest:scale -- --resume --checkpoint my-checkpoint.json
```

## Troubleshooting

### Rate Limit Errors

If you see rate limit errors:

1. Reduce workers: `--workers 5`
2. Add NCBI API key: `--ncbi-key YOUR_KEY`
3. Increase delays in code (if needed)

### Memory Issues

If running out of memory:

1. Reduce workers: `--workers 5`
2. Reduce batch sizes in code
3. Process fewer topics at once

### Database Connection Errors

If database connections fail:

1. Check Supabase connection limits
2. Reduce batch sizes
3. Add connection pooling
4. Process in smaller chunks

## Example: Ingest 1M Articles

```bash
# Step 1: Start ingestion with checkpoint
npm run ingest:scale -- \
  --workers 15 \
  --max-per-topic 5000 \
  --from-year 2010 \
  --ncbi-key YOUR_KEY \
  --checkpoint 1m-ingestion.json

# Step 2: Monitor progress
tail -f ingestion.log  # if logging to file

# Step 3: Resume if needed
npm run ingest:scale -- --resume --checkpoint 1m-ingestion.json
```

**Expected Timeline**:
- **Topics**: 200
- **Articles per topic**: 5,000
- **Total articles**: 1,000,000
- **Workers**: 15
- **Time**: ~3-5 days continuous
- **Cost**: ~$10-20 (embeddings)

## Next Steps

1. **Start with recommended topics**: Test the system
2. **Scale up gradually**: Increase workers and articles per topic
3. **Monitor performance**: Watch checkpoint file and logs
4. **Optimize**: Adjust batch sizes based on your infrastructure
5. **Resume as needed**: Use checkpoints for reliability

## Support

For issues or questions:
- Check logs in terminal output
- Review checkpoint file for progress
- Check database for stored articles
- Verify environment variables

