# SA Health Codes — Commercial API Licence (Draft)

**Status:** Draft for legal review. Not executed.

**Licensor:** [Company Name] (Pty) Ltd (“Licensor”)  
**Licensee:** [Customer legal name] (“Licensee”)

## 1. Grant

Licensor grants Licensee a non-exclusive, non-transferable, worldwide (South Africa primary) licence to access the Reference Data APIs (Schemes, Plan Options, Tariff Rates, Products / NAPPI identifiers, ICD-10 MIT lookup) solely for Licensee’s internal product features serving end users.

## 2. Permitted use

- Real-time lookup, validation, and suggestion inside Licensee applications.
- Caching responses for up to **24 hours** for performance, provided caches are invalidated on dataset version change.
- Attribution in UI where Licensee displays code descriptions: `Source: SA Health Codes · effective {date}`.

## 3. Prohibited use

- Bulk download, scrape, or mirror of the catalogue for offline AI training or competing data products.
- Redistribution of Licensor datasets as a standalone feed, dump, or API to third parties.
- Training foundation or fine-tuned models on Licensor responses without a separate written AI addendum.
- Use of “NAPPI®” as a product brand; NAPPI is a MediKredit trademark — Licensee may display NAPPI *codes* as industry identifiers only.
- Representation that Licensor adjudicates benefits, eligibility, or payment.

## 4. Freshness and versions

Each dataset row carries `effective_from` / `effective_to` and an `ingest_batch_id`. Licensee must not treat stale cached copies as authoritative after Licensor publishes a newer effective version for the same key.

## 5. Quotas and telemetry

API keys are per-tenant. Unusual bulk-enumeration patterns may result in throttling or suspension. Licensor may retain anonymised request metrics (endpoint, counts, latency) for abuse detection and billing.

## 6. Third-party content

Some fields originate from third parties (NDoH MIT/SEP, scheme tariff files, MediKredit NAPPI files, SAMA procedure coding). Those rights remain with the originators. Licensor’s licence to Licensee is subject to Licensor’s upstream licences; Licensor will notify Licensee if an upstream right is withdrawn.

## 7. No clinical decision support warranty

Reference data is provided “as is”. Licensee remains responsible for clinical and billing decisions. Licensor does not provide medical advice.

## 8. Fees, term, termination

Fees and SLA are set in the Order Form. Either party may terminate for material breach uncured within 30 days. On termination, Licensee deletes offline caches within 14 days except records required by law.

## 9. Liability

Liability is limited to fees paid in the 12 months preceding the claim, excluding death/personal injury and fraud as required by law.

## 10. Governing law

Republic of South Africa. POPIA applies to any personal information processed; this product is designed as a reference catalogue and does not require special personal information.
