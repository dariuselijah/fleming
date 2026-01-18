# Bulk Import & Monitoring Guide

This guide covers the three new tools for ingesting millions of articles efficiently.

## 🚀 Quick Start

### 1. Bulk Import from XML Dumps (Fastest)

For when you have PubMed XML files directly:

```bash
# Process a single XML file
npm run ingest:bulk -- --file pubmed_data.xml

# Process a directory of XML files with 10 workers
npm run ingest:bulk -- --dir ./pubmed-dumps --workers 10

# Filter by year and evidence level
npm run ingest:bulk -- --file data.xml --from-year 2020 --high-evidence
```

**Advantages:**
- ⚡ **Much faster** than API calls (no rate limits)
- 📦 Processes large files efficiently (streaming for files > 100MB)
- 🔄 Automatic deduplication
- ✅ Checkpoint/resume support

**When to use:**
- You have PubMed XML dumps
- You want maximum speed
- You're processing millions of articles

### 2. Optimized Scale Ingestion (API-based)

For ingesting via PubMed API with optimizations:

```bash
# Ingest 2M articles with 20 workers
npm run ingest:scale -- \
  --workers 20 \
  --max-per-topic 10000 \
  --ncbi-key YOUR_KEY \
  --checkpoint 2m-checkpoint.json
```

**New Optimizations:**
- ✅ **Adaptive batch sizing** - Scales with worker count
- ✅ **Dynamic embedding batches** - Adjusts based on chunk count
- ✅ **Smart delays** - Reduces delays with more workers
- ✅ **Jitter** - Prevents thundering herd problems
- ✅ **Better error handling** - More resilient to failures

**When to use:**
- You don't have XML dumps
- You want to search specific topics
- You need filtering by date/evidence level

### 3. Real-Time Monitoring

Monitor ingestion progress in real-time:

```bash
# Monitor default checkpoint
npm run monitor

# Monitor specific checkpoint with database stats
npm run monitor -- --checkpoint my-checkpoint.json --watch-db

# Update every 10 seconds
npm run monitor -- --interval 10
```

**Features:**
- 📊 Real-time progress display
- 📈 Statistics (articles/min, chunks/min)
- ⏱️ ETA calculation
- 💾 Database stats (optional)
- 🔄 Auto-refresh
- ✅ Shows currently processing items
- ❌ Highlights failed items

## 📋 Comparison

| Feature | Bulk Import | Scale Ingestion |
|---------|------------|----------------|
| **Speed** | ⚡⚡⚡ Very Fast | ⚡⚡ Fast |
| **Source** | XML files | PubMed API |
| **Rate Limits** | None | 3-10 req/sec |
| **Setup** | Need XML files | Just API key |
| **Filtering** | ✅ Yes | ✅ Yes |
| **Checkpoint** | ✅ Yes | ✅ Yes |
| **Best For** | Millions of articles | Topic-based search |

## 🎯 Recommended Workflow

### For 2M+ Articles:

**Option A: If you have XML dumps**
```bash
# 1. Download PubMed XML dumps
# 2. Process with bulk import
npm run ingest:bulk -- --dir ./pubmed-dumps --workers 20 --from-year 2010

# 3. Monitor progress (in another terminal)
npm run monitor -- --checkpoint bulk-import-checkpoint.json --watch-db
```

**Option B: If using API**
```bash
# 1. Start scale ingestion
npm run ingest:scale -- \
  --workers 20 \
  --max-per-topic 10000 \
  --ncbi-key YOUR_KEY \
  --checkpoint 2m-checkpoint.json

# 2. Monitor progress (in another terminal)
npm run monitor -- --checkpoint 2m-checkpoint.json --watch-db
```

## 📊 Performance Expectations

### Bulk Import (XML)
- **Speed**: 5,000-10,000 articles/minute
- **2M articles**: ~3-7 hours
- **Bottleneck**: Embedding generation

### Scale Ingestion (API)
- **Speed**: 100-200 articles/minute (with 20 workers)
- **2M articles**: ~5-7 days
- **Bottleneck**: API rate limits

## 🔧 Advanced Options

### Bulk Import Options

```bash
npm run ingest:bulk -- \
  --file data.xml \
  --workers 15 \
  --from-year 2015 \
  --to-year 2024 \
  --high-evidence \
  --batch-size 1000 \
  --embedding-batch-size 300 \
  --checkpoint bulk-checkpoint.json
```

### Scale Ingestion Options

```bash
npm run ingest:scale -- \
  --workers 25 \
  --max-per-topic 15000 \
  --from-year 2010 \
  --to-year 2024 \
  --high-evidence \
  --ncbi-key YOUR_KEY \
  --checkpoint scale-checkpoint.json \
  --topics-file custom-topics.txt
```

### Monitor Options

```bash
npm run monitor -- \
  --checkpoint checkpoint.json \
  --interval 5 \
  --watch-db
```

## 💡 Tips

1. **Use NCBI API Key**: Increases rate limit from 3/sec to 10/sec
2. **Monitor in Separate Terminal**: Keep monitoring running while ingestion runs
3. **Start Small**: Test with 1K articles first
4. **Use Checkpoints**: Always use checkpoint files for long runs
5. **Watch Database**: Use `--watch-db` to see actual database growth
6. **Resume Anytime**: Use `--resume` flag to continue from checkpoint

## 🐛 Troubleshooting

### Bulk Import Issues

**Problem**: "File too large"
- **Solution**: Script automatically uses streaming for files > 100MB

**Problem**: "Out of memory"
- **Solution**: Reduce `--batch-size` or `--workers`

### Scale Ingestion Issues

**Problem**: Rate limit errors
- **Solution**: Add `--ncbi-key` or reduce `--workers`

**Problem**: Database connection errors
- **Solution**: Reduce `--workers` or increase delays

### Monitor Issues

**Problem**: "Checkpoint file not found"
- **Solution**: Make sure ingestion is running and checkpoint file exists

**Problem**: Stats not updating
- **Solution**: Check that checkpoint file is being written (check file permissions)

## 📚 Additional Resources

- **Scale Ingestion Guide**: `docs/scale-ingestion-guide.md`
- **PubMed Ingestion Guide**: `docs/pubmed-ingestion.md`
- **Evidence System**: `docs/mobile-evidence-citations.md`

