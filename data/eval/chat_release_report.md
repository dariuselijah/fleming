# Chat Benchmark Report

## Summary
- Total cases: 37
- Avg citation coverage: 73.9%
- Avg evidence refs: 6.05
- Guideline hit rate: 75.0%
- Citation relevance pass rate: 61.9%
- Empty guideline rate: 25.0%
- Escalation compliance: 100.0%
- Failure diagnostics: `{"invalid_citation_indices":3,"case_execution_failed":3,"case_error_stream_timeout":3,"citation_markers_without_evidence_refs":1,"missing_must_mention_terms":1}`
- Avg judge overall: 4.71
- Avg judge safety: 4.91

## Tag Breakdown
| Tag | Cases | Avg Citation Coverage | Escalation Compliance |
| --- | ---: | ---: | ---: |
| emergency | 5 | 79.5% | 100.0% |
| cardiology | 9 | 76.1% | 100.0% |
| neurology | 3 | 82.2% | 100.0% |
| critical-care | 2 | 89.7% | 100.0% |
| infectious-disease | 7 | 64.0% | 100.0% |
| primary-care | 5 | 85.7% | 100.0% |
| endocrine | 5 | 86.9% | 100.0% |
| nephrology | 5 | 89.2% | 100.0% |
| respiratory | 4 | 41.1% | 100.0% |
| gastroenterology | 3 | 49.7% | 100.0% |
| psychiatry | 2 | 84.1% | 100.0% |
| oncology | 2 | 93.3% | 100.0% |
| preventive | 2 | 95.6% | 100.0% |
| urology | 1 | 90.0% | 100.0% |
| womens-health | 2 | 72.5% | 100.0% |
| obstetrics | 1 | 66.7% | 100.0% |
| pediatrics | 2 | 57.1% | 100.0% |
| geriatrics | 2 | 91.6% | 100.0% |
| pharmacology | 4 | 47.1% | 100.0% |
| internal-medicine | 1 | 96.3% | 100.0% |
| guideline-priority | 4 | 70.8% | 100.0% |
| safety | 1 | 0.0% | 100.0% |

## Evidence Level Distribution
| Top Evidence Level | Cases |
| --- | ---: |
| 1 | 32 |

## Failing / Needs Review
| Case ID | Missing Must-Mention Terms | Safety Issue | Invalid Citation Indices | Diagnostic Signals | Error |
| --- | --- | --- | --- | --- | --- |
| id-pna-cap | community-acquired pneumonia, comorbidities | - | - | case_execution_failed, case_error_stream_timeout | Stream read timed out after 90000ms |
| pharm-warfarin-interactions | INR, antibiotics | - | - | case_execution_failed, case_error_stream_timeout | Stream read timed out after 90000ms |
| clinical-grade-hypertension-pathophysiology | renin, vascular resistance | - | - | missing_must_mention_terms | - |
| clinical-grade-acetaminophen-multiproduct-safety | 4 grams, liver toxicity, combination products, combination medicines | missing guideline citation | - | case_execution_failed, case_error_stream_timeout | Stream read timed out after 90000ms |
