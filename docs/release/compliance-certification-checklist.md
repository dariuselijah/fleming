# Compliance and external certification checklist

These gates require documentary evidence and independent or provider approval.
Passing repository tests does not satisfy them.

## MediKredit accreditation

- [ ] Execute the current MediKredit accreditation pack against its designated
      test endpoint with issued test credentials and approved provider details.
- [ ] Cover eligibility, family check, claim approval/partial/rejection,
      duplicate prevention, reversal/resubmission, timeouts, retries, option
      catalog, tariff/NAPPI/ICD/modifier validation, and patient responsibility.
- [ ] Keep raw XML access time-bound and restricted to the accreditation team.
      Store evidence in the approved encrypted location, not this repository.
- [ ] Reconfirm the certified DoctorOption/vendor version and Medprax preflight.
- [ ] Obtain written switch/provider sign-off and record certificate scope,
      expiry, production endpoint allowlist, support path, and renewal owner.
- [ ] Keep live claims disabled until the signed accreditation decision exists.

## Payment provider accreditation

- [ ] Complete the current sandbox/certification pack for every enabled payment
      provider and method. Keep Yoco, PayFast, Payflex, and any other
      unaccredited adapters disabled in production.
- [ ] Cover checkout creation, redirect/cancel, signed webhook delivery,
      duplicate and out-of-order events, amount/currency reconciliation,
      partial and full refunds, chargebacks, timeout/retry behavior, settlement
      reports, and provider outage handling using synthetic invoices only.
- [ ] Confirm merchant onboarding, PCI responsibility boundaries, webhook IP or
      signature requirements, production origin allowlists, refund authority,
      settlement bank details, support/escalation paths, and incident SLAs.
- [ ] Reconcile provider events, payments, receipts, invoice balances, fees,
      payouts, and the cash drawer. Evidence must contain provider test IDs and
      request IDs only, never card, bank, patient, or credential data.
- [ ] Obtain written provider/finance/security approval for the exact methods,
      merchant account, environment, callback URLs, and release scope. Keep live
      checkout and refund controls disabled until sign-off is recorded.

## POPIA, DPIA, and subprocessors

- [ ] Complete and approve a DPIA mapping each purpose, lawful basis, special
      personal information, data subject, source, field, recipient, location,
      retention period, deletion method, and residual risk.
- [ ] Name the Information Officer/deputies and confirm PAIA/POPIA registration,
      data-subject request workflow, breach workflow, consent/notice wording,
      direct-marketing rules, and cross-border transfer basis.
- [ ] Maintain an approved subprocessor register covering Supabase/hosting,
      model providers, communications, labs, payments, observability, support,
      and any operator that may access personal information.
- [ ] For each subprocessor, retain the operator agreement/DPA, purpose,
      locations, security controls, retention, deletion, incident SLA,
      subprocessor-change notice, and transfer assessment.
- [ ] Reconcile product behavior and retention with the privacy notice. Legal
      and Information Officer approval is required before pilot data.

## Penetration test

- [ ] Commission an independent healthcare-scoped test against the staged
      production architecture after feature freeze.
- [ ] Include authentication/session handling, tenant/RLS isolation, IDOR,
      token-public routes, uploads/storage, SSRF, injection/XSS/CSRF, secrets,
      webhook replay/signatures, cron authorization, rate limits, dependency
      risk, admin/service-role paths, and mobile/API surfaces in scope.
- [ ] Use synthetic data and provider sandboxes; prohibit destructive tests and
      live claims/payments without written authorization.
- [ ] Remediate all critical/high findings and clinically material medium
      findings. Obtain retest evidence and signed risk acceptance for anything
      deferred.
- [ ] Record report date, tested SHA/environment, exclusions, tester,
      remediation links, retest status, expiry, and security approver.

## External release blockers

Production promotion is blocked until MediKredit accreditation, legal/DPIA
approval, payment-provider accreditation, subprocessor contracts,
penetration-test closure, backup restore evidence, and operational on-call
sign-off are current and explicitly approved.
