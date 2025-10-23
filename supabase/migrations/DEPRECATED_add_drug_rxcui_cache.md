# DEPRECATED: RxCUI Cache Migration

**Status**: Deprecated as of October 23, 2025

## Reason for Deprecation

The RxNorm Drug-Drug Interaction API was discontinued by the National Library of Medicine on **January 2, 2024**. This migration created a cache for RxCUI (RxNorm Concept Unique Identifiers) which is no longer needed since we've switched to the FDA openFDA API.

## Alternative Implementation

Fleming now uses the **FDA openFDA Drug Label API** for drug interaction checking:
- **Endpoint**: `https://api.fda.gov/drug/label.json`
- **Method**: Direct drug name searches (no RxCUI needed)
- **Status**: Active and maintained by the FDA
- **API Key**: Not required (free API)

## Migration File

The original migration file has been renamed to:
- `add_drug_rxcui_cache.sql.deprecated`

If you've already run this migration, the table is harmless and can be safely ignored or dropped:

```sql
-- Optional: Drop the table if it exists
DROP TABLE IF EXISTS public.drug_rxcui_cache CASCADE;
```

## See Also

- Updated implementation: `lib/models/medical-knowledge.ts`
- Documentation: `HEALTH_CONTEXT_INTEGRATION_GUIDE.md`
