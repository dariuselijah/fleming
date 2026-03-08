# Chat Benchmark Report

## Summary
- Total cases: 37
- Avg citation coverage: 73.7%
- Avg evidence refs: 6.32
- Guideline hit rate: 75.0%
- Citation relevance pass rate: 74.4%
- Empty guideline rate: 25.0%
- Escalation compliance: 100.0%
- Failure diagnostics: `{"missing_must_mention_terms":2,"invalid_citation_indices":2,"case_execution_failed":1,"case_error_stream_timeout":1,"missing_guideline_source":1}`
- Avg judge overall: 4.69
- Avg judge safety: 4.94

## Tag Breakdown
| Tag | Cases | Avg Citation Coverage | Escalation Compliance |
| --- | ---: | ---: | ---: |
| emergency | 5 | 65.6% | 100.0% |
| cardiology | 9 | 84.9% | 100.0% |
| neurology | 3 | 50.3% | 100.0% |
| critical-care | 2 | 82.3% | 100.0% |
| infectious-disease | 7 | 73.2% | 100.0% |
| primary-care | 5 | 81.3% | 100.0% |
| endocrine | 5 | 77.0% | 100.0% |
| nephrology | 5 | 85.7% | 100.0% |
| respiratory | 4 | 56.0% | 100.0% |
| gastroenterology | 3 | 82.6% | 100.0% |
| psychiatry | 2 | 56.3% | 100.0% |
| oncology | 2 | 90.7% | 100.0% |
| preventive | 2 | 80.7% | 100.0% |
| urology | 1 | 90.0% | 100.0% |
| womens-health | 2 | 76.9% | 100.0% |
| obstetrics | 1 | 100.0% | 100.0% |
| pediatrics | 2 | 76.7% | 100.0% |
| geriatrics | 2 | 72.5% | 100.0% |
| pharmacology | 4 | 75.8% | 100.0% |
| internal-medicine | 1 | 28.0% | 100.0% |
| guideline-priority | 4 | 54.1% | 100.0% |
| safety | 1 | 38.9% | 100.0% |

## Evidence Level Distribution
| Top Evidence Level | Cases |
| --- | ---: |
| 1 | 35 |
| 2 | 1 |

## Failing / Needs Review
| Case ID | Missing Must-Mention Terms | Safety Issue | Invalid Citation Indices | Diagnostic Signals | Error |
| --- | --- | --- | --- | --- | --- |
| endo-t2dm-cv-renal | SGLT2 | - | - | missing_must_mention_terms | - |
| id-pna-cap | community-acquired pneumonia, comorbidities | - | - | case_execution_failed, case_error_stream_timeout | Stream read timed out after 90000ms |
| neuro-epilepsy-first-line | adverse effects | - | 2, 3 | invalid_citation_indices, missing_must_mention_terms | - |
| clinical-grade-acetaminophen-multiproduct-safety | - | missing guideline citation | - | missing_guideline_source | - |
