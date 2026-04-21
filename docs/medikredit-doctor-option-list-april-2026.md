# MediKredit Doctor Option List — April 2026

> **Source:** `April 2026 Detailed DOCTOR Option List.xlsx`
> **Effective:** April 2026
> **Total Options:** 441 rows across 147 unique scheme/plan codes

---

## Important: Scheme/Plan Code Behaviour

**The majority of schemes use the same scheme/plan code for both Dispensing (DD) and Procedures & Consults (P&C).**
However, **27 scheme codes use different MAS-codes and/or option codes** when the claim type changes between DD and P&C.
Your code must look up the correct `mas_code` and `option_code` based on the `(scheme_code, claim_type)` tuple, not just `scheme_code` alone.

### Schemes with Different Codes for DD vs P&C

| Scheme Code | Scheme Name | DD MAS | DD Option | P&C MAS | P&C Option |
|-------------|-------------|--------|-----------|---------|------------|
| 00024 | OLD MUTUAL STAFF (OMSMAF) | OMADD | 600083 | OMHLP | 600079 |
| 00031 | CDE PRIMARY | CDEDD | 600138 | CDEDP | 600139 |
| 00064 | WATCH TOWER | WTDID | 600312 | WTHPC | 600461 |
| 00103 | LIBERTY HEALTH LESOTHO | LIBDD | 600563 | LIBDP | 600561 |
| 00546 | CIGNA INTER FUND FOR AGRICULTURAL DEV | CIGDD | 600594 | CIGDP | 600595 |
| 00680 | CIGNA SASOL MOZAMBIQUE | CSMDD | 600685 | CSMPC | 600684 |
| 00823 | SABMAS | SADDD | 600826 | SAHPC | 600830 |
| 01412 | RAND WATER MS | RWDDO, RWMDO | 601416, 601417 | RWMHO | 601426 |
| 11193 | WORKPLACE HEALTH PLAN TRUHEALTH | WPDAC | 620141 | WPHPC | 611207 |
| 12092 | BCIMA BASIC (Building & Construction Industry) | BCIDD | 600201 | BCDPC | 612122 |
| 18236 | ANGLO AMS | DADCH, DAMDA | 618279, 618325 | DASDS | 618384 |
| 18732 | MASSMART | MASSD | 621059 | MTHLP | 618686 |
| 19992 | WITBANK COALFIELDS COMPREHENSIVE | WCDDA | 636269 | MGGPS | 680179 |
| 20524 | TRANSMED LINK | UTRDD | 620729 | TSHPC | 616705 |
| 21970 | RFMCF | RFDSD | 624031 | RMFPC | 600136 |
| 23795 | BANKMED | BANDD | 623884 | BANHL | 623922 |
| 24236 | MASSMART TRUCARE | WKTRD | 624090 | WTCHL | 624228 |
| 44636 | PROFMED PROSECURE & PROSECURE PLUS | PSDDA, PSDDC | 644733, 644741 | PPMGP | 634487 |
| 44660 | PROFMED PROPINACCLE | PDDCC, PFDCA | 644776, 644784 | PPMGP | 634487 |
| 50318 | GEMS | GEMDD, GMDDC | 623973, 696628 | GEOHL | 683488 |
| 66370 | COMPCARE DIGICARE | COMDD | 620699 | COMHL | 675973 |
| 66451 | CONSUMER GOODS | UTBDP | 620621 | TBRHL | 678077 |
| 67288 | RAND MUTUAL | RANDJ | 646906 | RANPC | 617698 |
| 68918 | BIMAF (BUILDING INDUSTRY) | BIMDA | 668896 | BIMPC | 686622 |
| 72753 | CAMAF ALLIANCE PLUS/NETWORK | CGDDA, CGDDC | 682538, 682546 | ECHLP | 613730 |
| 76589 | PROFMED PROSELECT PMB | PRFDA, PRHDC | 621067, 676570 | PPMGP | 634487 |
| 87807 | KEYHEALTH | KEYDC, KEYDD | 687130, 687149 | KEHPC | 687173 |

---

## Column Definitions & Logic

### 1. SCHEME / PLAN / OPTIONS (`name`)
The full name of the medical scheme option. Each row represents a unique (scheme, claim_type) combination.
Many schemes appear twice — once for DD (dispensing) and once for P&C (procedures & consults).
Some schemes have separate ACUTE and CHRONIC DD entries with different MAS/option codes.

### 2. ADMINISTRATOR (`administrator`)
The third-party administrator that manages the scheme.
Used for routing and correspondence. 64 unique administrators.

### 3. OPTION TYPE (`option_type`)

| Value | Meaning |
|-------|---------|
| `HL`  | Health Level — standard claim routing |
| `P`   | Pharmacy — dispensing-specific routing, typically used for DD claim types that require pricing/markup |

**Rule:** When `option_type = 'P'`, the `pricing` field is almost always `'Y'` and markup fees apply.
When `option_type = 'HL'`, pricing is typically `'N'` or empty (no markup applies).

### 4. CLAIM TYPE (`claim_type`)

| Value | Meaning |
|-------|---------|
| `DD`  | Dispensing Doctor — medicine dispensed at point of care |
| `P&C` | Procedures & Consults — consultation fees, procedures, no dispensing |

**Rule:** This is the primary discriminator for code lookups. Many schemes share the same `scheme_code` but
use different `mas_code` and `option_code` per claim type. Always filter by `(scheme_code, claim_type)`.

### 5. FAMCHECK (`famcheck`)

| Value | Meaning |
|-------|---------|
| `F`   | Family check required — validate member against family/dependant records |
| _(empty)_ | No family check required |

**Rule:** When `F`, the claim must include valid family member details and pass a dependant validation check.

### 6. AUTHCHECK (`authcheck`)

| Value | Meaning |
|-------|---------|
| `A`   | Authorisation check required — pre-auth number needed |
| _(empty)_ | No auth check |

**Rule:** When `A`, the claim must carry a valid pre-authorisation number. Typically seen on `option_type = 'P'` rows.

### 7. CHF CHECKS (`chf_checks`)

| Value | Meaning |
|-------|---------|
| `Y`   | Claims House Format checks enabled |
| `N`   | CHF checks disabled |
| _(empty)_ | Not specified / not applicable |

**Rule:** When `Y`, the claim is routed through MediKredit's CHF validation layer before reaching the scheme.

### 8. SWITCH-OUT (`switchout`)

| Value | Meaning |
|-------|---------|
| `Y`   | Switch-out enabled — claim may be re-routed to another switch |
| `N`   | No switch-out |
| _(empty)_ | Not specified |

### 9. MEMBERSHIP NUMBER PREFIX / NO LENGTH / SUFFIX (`membership_format`)
Free-text field describing the expected format of membership numbers for the scheme.
Examples:
- `9 digits` — exactly 9 numeric digits
- `11 digits` — exactly 11 numeric digits
- `AGS/9 DIGITS` — prefix "AGS" followed by 9 digits
- `Starts with 476/` — must begin with the prefix 476
- `3 alpha, 9 numerics` — 3 letters then 9 digits
- `MEMBER SA ID NUMBER` — use the member's SA ID
- `53/ 8 Digits` — prefix 53 then 8 digits
- _(empty)_ — no specific format documented

**Rule:** Use for pre-submission membership number validation. Parse the text to build validation regex.

### 10. REVERSAL PERIOD (`reversal_period`)

| Value | Meaning |
|-------|---------|
| `Same Day` | Reversals must be submitted on the same day |
| `120` | 120-day reversal window |
| `120 days` | Same as 120 (variant text) |
| `152` | 152-day reversal window |
| `90` | 90-day reversal window |
| `30` | 30-day reversal window |
| `2 days` | 2-day reversal window |
| `1` | 1-day reversal window |
| `Unlimited` | No time limit on reversals |

**Rule:** Normalise to integer days in code: `Same Day → 0`, `2 days → 2`, `120 days → 120`, `Unlimited → -1`.

### 11. SCHEME / PLAN CODE (`scheme_code`)
The 5-digit scheme/plan code used in the MediKredit claim header.
This is the primary lookup key but is **not** sufficient alone — must be paired with `claim_type`.
One scheme code (e.g. `08109` for BANKMED ESSENTIAL) can exist independently of the primary BANKMED code (`23795`).

### 12. MAS-CODE (`mas_code`)
The 5-character MediKredit Administration System code. Unique per (scheme, claim_type, acute/chronic) combination.
This is the routing identifier used in the claim XML envelope.

### 13. OPTION CODE (`option_code`)
The 6-digit option code used in the claim body. Like `mas_code`, it varies by claim type for 27 schemes.

### 14. PRICING (`pricing`)

| Value | Meaning |
|-------|---------|
| `Y`   | Pricing applies — the claim includes pricing/cost information and markup |
| `N`   | No pricing — flat fee or capitation |
| _(empty)_ | Not specified (treat as N) |

### 15. MARK-UP / DISPENSING FEE % (Incl. VAT)
Split into two sub-columns:

#### SEP PRODUCTS (`markup_sep`)
Markup for Single Exit Price products. Common patterns:
- `R0-R160.00 : 30.00%, Max R48.00` — 30% of SEP up to R160, capped at R48
- `R0-R149.99: 34.50%, Max R51.75` — 34.5% of SEP up to R150, capped at R51.75
- `R0-R160.00: 34.50%, Max R55.20` — 34.5% of SEP up to R160, capped at R55.20
- `R0-R60.00: 17.25%, Max R17.25` — 17.25% of SEP up to R60, capped at R17.25

#### NON-SEP PRODUCTS (`markup_nonsep`)
Markup for non-SEP products. Patterns:
- Same format as above (e.g. `R0-R160.00 : 30.00%, Max R48.00`)
- Fixed percentage: `36` → 36%, `50.44%`, `0.3632` → 36.32%, `18.24% - Max R18.24`
- _(empty)_ — no non-SEP markup specified

**Rule:** Parse the string to extract `(threshold, percentage, max_fee)` tuples for the dispensing fee calculator.

### 16. MMAP, REF or URP (`mmap_ref_urp`)

| Value | Meaning |
|-------|---------|
| `Y`   | One or more of MMAP (Maximum Medical Aid Price), REF (Reference Pricing), or URP (Unit Reference Pricing) applies |
| `N` / `No` | None apply |
| _(empty)_ | Not specified (treat as not applicable) |

### 17. ERA (`era`)

| Value | Meaning |
|-------|---------|
| `Yes` | Electronic Remittance Advice supported — scheme sends ERA |
| _(empty)_ | ERA not supported / not specified |

### 18. Change Markers (Column A)

| Value | Meaning |
|-------|---------|
| `#`   | Changed since last list (highlighted bold in source) |
| `A`-`Z` | Alphabetical section header |
| _(empty)_ | No change |

---

## Code Mapping: Lookup Logic

```typescript
interface DoctorOption {
  name: string;
  administrator: string;
  optionType: 'HL' | 'P';
  claimType: 'DD' | 'P&C';
  famcheck: boolean;
  authcheck: boolean;
  chfChecks: boolean | null;
  switchout: boolean | null;
  membershipFormat: string | null;
  reversalPeriodDays: number;  // 0 = same day, -1 = unlimited
  schemeCode: string;
  masCode: string;
  optionCode: string;
  pricing: boolean;
  markupSep: MarkupRule | null;
  markupNonSep: MarkupRule | null;
  mmapRefUrp: boolean | null;
  era: boolean;
}

interface MarkupRule {
  thresholdRands: number;
  percentage: number;
  maxFeeRands: number;
}

// Lookup: given (schemeCode, claimType), return the correct option row(s).
// For schemes with acute/chronic split, further filter by acuteChronic flag.
function lookupOption(schemeCode: string, claimType: 'DD' | 'P&C', acuteChronic?: 'ACUTE' | 'CHRONIC'): DoctorOption[]
```

---

## Full Option Table

| Scheme / Plan / Option | Administrator | Type | Claim | Fam | Auth | CHF | SwitchOut | Membership Format | Reversal | Scheme Code | MAS Code | Option Code | Pricing | Markup SEP | Markup Non-SEP | MMAP | ERA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ACUMEN DD | Pan-African Managed Care | HL | DD | F |  | Y | N |  | Same Day | 10032 | AHLDP | 600252 |  |  |  |  |  |
| ACUMEN P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | Same Day | 10032 | AHLDP | 600252 |  |  |  |  |  |
| AECI DD  (Including Value Plan & Comprehensive Plan) | MedScheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64114 | AHDPC | 664122 |  |  |  |  | Yes |
| AECI P&C (Including Value Plan & Comprehensive Plan) | MedScheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64114 | AHDPC | 664122 |  |  |  |  | Yes |
| AFFINITY HEALTH P&C | Affinity Health | HL | P&C | F |  | Y | N |  | Same Day | 01322 | AHMIO | 601328 |  |  |  |  |  |
| AGS HEALTH DD | Pan-African Managed Care | HL | DD | F |  | Y | Y | AGS/9 DIGITS | Same Day | 00699 | AGHDP | 600718 |  |  |  |  |  |
| AGS HEALTH P&C | Pan-African Managed Care | HL | P&C | F |  | Y | Y | AGS/9 DIGITS | Same Day | 00699 | AGHDP | 600718 |  |  |  |  |  |
| ALLIANCE MIDMED P&C | Private Health | HL | P&C | F |  | Y |  |  | 2 days | 00078 | IAMPC | 600124 |  |  |  |  |  |
| ANGLO AMS ACUTE DD | Discovery Health | P | DD | F | A | Y | Y | 9 digits | 120 | 18236 | DAMDA | 618279 | Y | R0-R160.00 : 30.00%, Max R48.00 | 18.24% - Max R18.24 | N | Yes |
| ANGLO AMS CHRONIC DD | Discovery Health | P | DD | F | A | Y | Y | 9 digits | 120 | 18236 | DADCH | 618325 | Y | R0-R160.00 : 30.00%, Max R48.00 | 18.24% - Max R18.24 | Y | Yes |
| ANGLO AMS P&C | Discovery Health | HL | P&C | F | A | Y | Y | 9 digits | 120 | 18236 | DASDS | 618384 |  |  |  |  | Yes |
| ANGLO VALUE CARE GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| ANGLO VALUE CARE SPECIALIST P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHS | 605401 |  |  |  |  |  |
| ANGLOVAAL DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15407 | AMSDP | 614141 |  |  |  |  | Yes |
| ANGLOVAAL P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15407 | AMSDP | 614141 |  |  |  |  | Yes |
| ANGLOGOLD ASHANTI  DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 26603 | ASHPC | 627375 |  |  |  |  | Yes |
| ANGLOGOLD ASHANTI P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 26603 | ASHPC | 627375 |  |  |  |  | Yes |
| ASTERIO HEALTH DD | Pan-African Managed Care | HL | DD | F |  | Y | N |  | Same Day | 00610 | AFDPC | 600613 |  |  |  |  |  |
| ASTERIO HEALTH P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | Same Day | 00610 | AFDPC | 600613 |  |  |  |  |  |
| BANKMED ACUTE DD | Discovery Health | P | DD | F | A | Y | Y | 9 digits | 152 | 23795 | BANDD | 623884 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | N | Yes |
| BANKMED CHRONIC DD | Discovery Health | P | DD | F | A | Y | Y | 9 digits | 152 | 23795 | BANDD | 623884 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y | Yes |
| BANKMED GP & SPECIALIST P&C (ALL PLANS) | Discovery Health | HL | P&C | F | A | Y | Y | 9 digits | 152 | 23795 | BANHL | 623922 | N |  |  |  | Yes |
| BANKMED ESSENTIAL & BASIC DD | Discovery Health | HL | DD | F | A | Y | Y | 9 digits | 152 | 08109 | BANHL | 623922 | N |  |  |  | Yes |
| BARLOWORLD DD | MedScheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64157 | BHDPC | 664165 |  |  |  |  | Yes |
| BARLOWORLD P&C | MedScheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64157 | BHDPC | 664165 |  |  |  |  | Yes |
| BESTMED DD | Bestmed | HL | DD | F |  | Y | N |  | Same Day | 65285 | BESPC | 665625 |  |  |  |  |  |
| BESTMED P&C | Bestmed | HL | P&C | F |  | Y | N |  | Same Day | 65285 | BESPC | 665625 |  |  |  |  |  |
| BEWELL DD | NATIONAL HEALTH CARE | HL | DD | F |  | Y | N |  | 120 | 00785 | BNHDP | 600790 |  |  |  |  |  |
| BEWELL P&C | NATIONAL HEALTH CARE | HL | P&C | F |  | Y | N |  | 120 | 00785 | BNHDP | 600790 |  |  |  |  |  |
| BCIMA BASIC (Building & Construction Industry) DD | Universal Health | P | DD | F |  | Y |  | 4 - 7 numeric digits | 120 | 12092 | BCIDD | 600201 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R137.99: 34.50%, Max R47.61 | Y |  |
| BCIMA Basic (Building & Construction Industry) P&C | Universal Health | HL | P&C | F |  | Y |  | 4 - 7 numeric digits | Same Day | 12092 | BCDPC | 612122 |  |  |  |  |  |
| BIMAF (BUILDING INDUSTRY) DD | Building Industries | P | DD | F |  | Y |  |  | Same Day | 68918 | BIMDA | 668896 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | N |  |
| BIMAF GP & SPECIALIST P&C | Building Industries | P | P&C | F |  | Y |  |  | 120 | 68918 | BIMPC | 686622 | Y | R0-R160.00 : 30.00%, Max R48.00 |  |  |  |
| BMW DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 18759 | BMDOP | 618767 |  |  |  |  | Yes |
| BMW P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 18759 | BMDOP | 618767 |  |  |  |  | Yes |
| BOMAID HL DD | BOMAID Administrator | HL | DD | F |  | Y |  |  | Same Day | 12998 | BHSMP | 600455 |  |  |  |  |  |
| BOMAID HL P&C | BOMAID Administrator | HL | P&C | F |  | Y |  |  | Same Day | 12998 | BHSMP | 600455 |  |  |  |  |  |
| BOPHELO LESOTHO PROCEDURE AND CONSULTS | Bophelo Lesotho | HL | P&C | F |  | Y |  | up to 8 digits | 120 | 00072 | BBLPC | 600323 |  |  |  |  |  |
| BONITAS DD | MedScheme | HL | DD | F |  | Y | N | Up to 11 digits | Same Day | 64815 | BODPC | 664823 |  |  |  |  | Yes |
| BONITAS P&C | MedScheme | HL | P&C | F |  | Y | N | Up to 11 digits | Same Day | 64815 | BODPC | 664823 |  |  |  |  | Yes |
| BONCAP PHA (Limited Primary Care) DD | Private Health | HL | DD | F |  | Y | N | Up to 11 digits | Same Day | 00836 | BONPC | 600837 |  |  |  |  |  |
| BONCAP PHA (Limited Primary Care) P&C | Private Health | HL | P&C | F |  | Y | N | Up to 11 digits | Same Day | 00836 | BONPC | 600837 |  |  |  |  |  |
| BONVIE GENRIC | Pan-African Managed Care | HL | DD | F |  | Y | N |  | Same Day | 01469 | GHPHO | 601475 |  |  |  |  |  |
| BONVIE GENRIC | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | Same Day | 01469 | GHPHO | 601475 |  |  |  |  |  |
| BP DD | Momentum TYB | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 01505 | MBHDP | 601464 |  |  |  |  | Yes |
| BP P&C | Momentum TYB | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 01505 | MBHDP | 601464 |  |  |  |  | Yes |
| BPOMAS HL DD | PPSHA | HL | DD | F |  | Y |  | 7 numerics | Same Day | 10324 | ABPDP | 613820 |  |  |  |  |  |
| BPOMAS HL P&C | PPSHA | HL | P&C | F |  | Y |  | 7 Numerics | Same Day | 10324 | ABPDP | 613820 |  |  |  |  |  |
| CAMAF ALLIANCE PLUS/NETWORK ACUTE DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDA | 682538 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF ALLIANCE PLUS/NETWORK CHRONIC DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF VITAL PLUS/NETWORK  CHRONIC (PMB ONLY) DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF FIRST CHOICE ACUTE DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDA | 682538 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF FIRST CHOICE  CHRONIC DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF ESSENTIAL PLUS/NETWORK ACUTE DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDA | 682538 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | N | Yes |
| CAMAF ESSENTIAL PLUS/NETWORK CHRONIC DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF NETWORK CHOICE ACUTE DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDA | 682538 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF NETWORK CHOICE CHRONIC DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF DOUBLE PLUS/NETWORK ACUTE DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDA | 682538 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF DOUBLE PLUS/NETWORK CHRONIC DD | CAMAF Administrators | P | DD | F | A | Y |  | 6 - 8 digits | 120 | 72753 | CGDDC | 682546 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| CAMAF HL P&C | CAMAF Administrators | HL | P&C | F |  | Y |  | 6 - 8 digits | Same Day | 72753 | ECHLP | 613730 |  |  |  |  | Yes |
| CAPE MEDICAL PLAN DD | Cape Medical Plan | HL | DD |  |  | Y |  |  | Same Day | 75124 | CMHLP | 699740 |  |  |  |  | Yes |
| CAPE MEDICAL PLAN P&C | Cape Medical Plan | HL | P&C |  |  | Y |  |  | Same Day | 75124 | CMHLP | 699740 |  |  |  |  | Yes |
| CARECROSS ALL PLANS P&C (CAPITATION ONLY) | MMI | HL | P&C |  |  | Y |  |  | Same Day | various | CCDGP | 673016 |  |  |  |  | Yes |
| CDE PRIMARY DD(AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE PRIMARY P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CDE PRINCIPAL DD (AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE PRINCIPAL P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CDE TRADITIONAL DD (AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE TRADITIONAL P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CDE STANDARD DD (AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE STANDARD P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CDE STANDARD PLUS DD(AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE STANDARD PLUS P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CDE EXPRESS DD (AUTHORISED PMB ONLY) | CDE | P | DD | F | A | Y | Y |  | 120 | 00031 | CDEDD | 600138 | Y | R0-R60.00: 17.25%, Max R17.25 | R0-R60.00: 17.25%, Max R17.25 |  |  |
| CDE EXPRESS P&C (AUTHORISED PMB ONLY) | CDE | P | P&C | F | A | Y |  |  | Same Day | 00031 | CDEDP | 600139 | Y |  |  |  |  |
| CIGNA INTER FUND FOR AGRICULTURAL DEV DD | Cigna | P | DD | F |  | Y |  | Starts with 476/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.5044 | No |  |
| CIGNA INTER FUND FOR AGRICULTURAL DEV P&C | Cigna | P | P&C | F |  | Y |  | Starts with 476/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA FOOD PROGRAM BMIP DD | Cigna | P | DD | F |  | Y |  | Starts with 477/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA FOOD PROGRAM BMIP P&C | Cigna | P | P&C | F |  | Y |  | Starts with 477/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD FOOD PROGRAM MCS DD | Cigna | P | DD | F |  | Y |  | Starts with 478/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD FOOD PROGRAM MCS P&C | Cigna | P | P&C | F |  | Y |  | Starts with 478/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD FOOD PROGRAM MICS DD | Cigna | P | DD | F |  | Y |  | Starts with479/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD FOOD PROGRAM MICS P&C | Cigna | P | P&C | F |  | Y |  | Starts with 479/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA FOOD AND AGRICULTURAL ORGANISATION DD | Cigna | P | DD | F |  | Y |  | Starts with 480/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA FOOD AND AGRICULTURAL ORGANISATION P&C | Cigna | P | P&C | F |  | Y |  | Starts with 480/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA INTERNATIONAL MONETARY FUND DD | Cigna | P | DD | F |  | Y |  | Starts with 337/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA INTERNATIONAL MONETARY FUND P&C | Cigna | P | P&C | F |  | Y |  | Starts with 337/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA JESUIT REFUGEE SERVICES DD | Cigna | P | DD | F |  | Y |  | Starts with 467/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA JESUIT REFUGEE SERVICES P&C | Cigna | P | P&C | F |  | Y |  | Starts with 467/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA MTN DD | Cigna | P | DD | F |  | Y |  | Starts with 447/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA MTN P&C | Cigna | P | P&C | F |  | Y |  | Starts with 447/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA SASOL MOZAMBIQUE DD | Cigna | P | DD | F |  | Y |  | Starts with 451/ | 120 | 00680 | CSMDD | 600685 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA SASOL MOZAMBIQUE P&C | Cigna | P | P&C | F |  | Y |  | Starts with 451/ | 120 | 00680 | CSMPC | 600684 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP DD | Cigna | P | DD | F |  | Y |  | Starts with 244/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP P&C | Cigna | P | P&C | F |  | Y |  | Starts with 244/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP DD | Cigna | P | DD | F |  | Y |  | Starts with 244/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP P&C | Cigna | P | P&C | F |  | Y |  | Starts with 244/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP MIP DD | Cigna | P | DD | F |  | Y |  | Starts with 415/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNDP MIP P&C | Cigna | P | P&C | F |  | Y |  | Starts with 415/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UN MIP  DD | Cigna | P | DD | F |  | Y |  | Starts with 414/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UN MIP P&C | Cigna | P | P&C | F |  | Y |  | Starts with 414/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNICEF DD | Cigna | P | DD | F |  | Y |  | Starts with 270/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNICEF P&C | Cigna | P | P&C | F |  | Y |  | Starts with 270/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNOPS DD | Cigna | P | DD | F |  | Y |  | Starts with 243/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNOPS P&C | Cigna | P | P&C | F |  | Y |  | Starts with 243/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNV INTERNATIONAL VOLUNTEERS DD | Cigna | P | DD | F |  | Y |  | Starts with 002/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNV INTERNATIONAL VOLUNTEERS P&C | Cigna | P | P&C | F |  | Y |  | Starts with 002/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNV NATIONAL VOLUNTEERS DD | Cigna | P | DD | F |  | Y |  | Starts with 247/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA UNV NATIONAL VOLUNTEERS P&C | Cigna | P | P&C | F |  | Y |  | Starts with 247/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD BANK INTERNATIONAL ACTIVE & RETIRED ACUTE & CHRONIC DD | Cigna | P | DD | F |  | Y |  | Starts with 200/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD BANK INTERNATIONAL ACTIVE & RETIRED P&C | Cigna | P | P&C | F |  | Y |  | Starts with 200/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD BANK LOCAL ACTIVE & RETIRED DD | Cigna | P | DD | F |  | Y |  | Starts with 357/ | 120 | 00546 | CIGDD | 600594 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CIGNA WORLD BANK LOCAL ACTIVE & RETIRED P&C | Cigna | P | P&C | F |  | Y |  | Starts with 357/ | 120 | 00546 | CIGDP | 600595 | Y | R0-R160.00 : 30.00%, Max R48.00 | 50.44% | No |  |
| CITY OF JOHANNESBURG HL DD | WORKERS COMPENSATION ASSISTANCE GP | HL | DD | F |  | N |  |  | Unlimited |  |  |  |  |  |  |  |  |
| CITY OF JOHANNESBURG HL P&C | WORKERS COMPENSATION ASSISTANCE GP | HL | P&C | F |  | N |  |  | Unlimited |  |  |  |  |  |  |  |  |
| CITY OF TSHWANE HL DD | WORKERS COMPENSATION ASSISTANCE GP | HL | DD | F |  | N |  |  | Unlimited |  |  |  |  |  |  |  |  |
| CITY OF TSHWANE HL P&C | WORKERS COMPENSATION ASSISTANCE GP | HL | P&C | F |  | N |  |  | Unlimited |  |  |  |  |  |  |  |  |
| COMPCARE DIGICARE | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE EXECUCARE DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE EXECUCARE PLUS DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE EXTRACARE | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE HOSPICARE DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE MASSMART UMBONO DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE SAVERCARE DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE SAVERCARE PLUS DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE SELFCARE | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE SELFCARE PLUS | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE SUPERCARE DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE ULTRACARE DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE ULTRACARE PLUS DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE UMBONO PLUS DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE UMBONO DD | Universal Health | P | DD | F | A | Y | N | 3 alpha, 9 numerics | 120 | 66370 | COMDD | 620699 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| COMPCARE P&C | Universal Health | HL | P&C | F |  | Y | N | 3 alpha, 9 numerics | Same Day | 66370 | COMHL | 675973 |  |  |  |  |  |
| COMPCARE RADIOLOGY & PATHOLOGY | Universal Health Insurance | P | P&C | F |  | Y | N | 3 alpha, 9 numerics | 120 | 10462 | CRPSO | 610463 |  |  |  |  |  |
| COMPENSATION FUND | Compensation Fund | HL | DD |  |  |  | N |  | Unlimited | 19658 | CFHGP | 619682 |  | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 | N |  |
| COMPENSATION FUND | Compensation Fund | HL | P&C |  |  |  | N |  | Unlimited | 19658 | CFHGP | 619682 |  | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 | N |  |
| COMPSOL DD | Compsol | HL | DD |  |  |  | N |  | Unlimited | 13862 | COHLP | 613870 |  |  |  |  |  |
| COMPSOL P&C | Compsol | HL | P&C |  |  |  | N |  | Unlimited | 13862 | COHLP | 613870 |  |  |  |  |  |
| CONSUMER GOODS DD | Universal Health | P | DD | F | A | Y |  | 7 numeric digits | 120 | 66451 | UTBDP | 620621 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| CONSUMER GOODS P&C | Universal Health | HL | P&C | F |  | Y |  | 7 numeric digits | Same Day | 66451 | TBRHL | 678077 |  |  |  |  |  |
| DE BEERS DD | De Beers | HL | DD | F |  | Y |  |  | Same Day | 34509 | DBDHL | 601112 |  |  |  |  | Yes |
| DE BEERS P&C | De Beers | HL | P&C | F |  | Y |  |  | Same Day | 34509 | DBDHL | 601112 |  |  |  |  | Yes |
| DISCOVERY DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| DISCOVERY P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| DISCOVERY KEYCARE DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| DISCOVERY KEYCARE P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| DRUM MED HL DD | Affinity Health | HL | DD | F |  | Y | N |  | Same Day | 00145 | DRHLD | 600241 |  |  |  |  |  |
| DRUM MED HL P&C | Affinity Health | HL | P&C | F |  | Y | N |  | Same Day | 00145 | DRHLD | 600241 |  |  |  |  |  |
| EEB (Essential Employee Benefits) NHC HL DD | Medicall Healthcare | HL | DD | F |  | Y | N |  | 120 | 01265 | EMHDO | 601273 |  |  |  |  |  |
| EEB (Essential Employee Benefits) NHC HL P&C | Medicall Healthcare | HL | P&C | F |  | Y | N |  | 120 | 01265 | EMHDO | 601273 |  |  |  |  |  |
| ELLERINE HOLDINGS DD | MedScheme | HL | DD |  |  |  | N | 11 digits | Same Day | 64297 | EHDPC | 664300 |  |  |  |  |  |
| ELLERINE HOLDINGS P&C | MedScheme | HL | P&C |  |  |  | N | 11 digits | Same Day | 64297 | EHDPC | 664300 |  |  |  |  |  |
| EMASWATI HEALTHCARE DD | EMASWATI CARE | HL | DD |  |  |  |  |  | 120 | 00780 | EMADP | 600781 |  |  |  |  |  |
| EMASWATI HEALTHE P&C | EMASWATI CARE | HL | P&C |  |  |  |  |  | 120 | 00780 | EMADP | 600781 |  |  |  |  |  |
| EMASWATI HEALTHE P&C | EMASWATI CARE | HL | DD |  |  |  |  |  | 120 | 00780 | EMADP | 600781 |  |  |  |  |  |
| EMASWATI HEALTHE P&C | EMASWATI CARE | HL | P&C |  |  |  |  |  | 120 | 00780 | EMADP | 600781 |  |  |  |  |  |
| EMINENT GENRIC | Pan-African Managed Care | HL | DD | F |  | Y | N |  | Same Day | 01469 | GHPHO | 601475 |  |  |  |  |  |
| EMINENT GENRIC | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | Same Day | 01469 | GHPHO | 601475 |  |  |  |  |  |
| ENGEN DISCOVERY DD | Discovery Health | HL | DD | F |  | Y | Y | 9 numerics | 120 | 10001 | DEDPC | 600110 |  |  |  |  | Yes |
| ENGEN DISCOVERY P&C | Discovery Health | HL | P&C | F |  | Y | Y | 9 numerics | 120 | 10001 | DEDPC | 600110 |  |  |  |  | Yes |
| ESSENTIAL MED DD | Essential Med | HL | DD | F |  | Y | N | 7 numerics | Same Day | 08540 | ESSPC | 608559 |  |  |  |  |  |
| ESSENTIAL MED P&C | Essential Med | HL | DD | F |  | Y | N | 7 numerics | Same Day | 08540 | ESSPC | 608559 |  |  |  |  |  |
| ESSENTIAL MED CORPORATE DD | Essential Med Corporate | HL | DD | F |  | Y | N | 8 Numerics | 120 | 00482 | ESMCP | 600489 |  |  |  |  |  |
| ESSENTIAL MED CORPORATE P&C | Essential Med Corporate | HL | P&C | F |  | Y | N | 8 Numerics | 120 | 00482 | ESMCP | 600489 |  |  |  |  |  |
| EssentialMED Health Plan DD | National Health Care | HL | DD | F |  | Y | N |  | 120 | 00722 | NIHDP | 600726 |  |  |  |  |  |
| EssentialMED Health Plan P&C | National Health Care | HL | P&C | F |  | Y | N |  | 120 | 00722 | NIHDP | 600726 |  |  |  |  |  |
| FEDHEALTH DD | MedScheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64866 | FHDPC | 664874 |  |  |  |  | Yes |
| FEDHEALTH P&C | MedScheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64866 | FHDPC | 664874 |  |  |  |  | Yes |
| FISHMED DD | Momentum TYB | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 01504 | MFHDP | 601461 |  |  |  |  | Yes |
| FISHMED P&C | Momentum TYB | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 01504 | MFHDP | 601461 |  |  |  |  | Yes |
| FLEXICARE DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| FLEXICARE P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| FLEXICARE GOLD 129 | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| FLEXICARE GUARDIAN 130 | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| FOODMED PPO HL DD | Universal Healthcare | HL | DD | F |  | Y |  |  | Same Day | 00903 | FDHPC | 600909 |  |  |  |  |  |
| FOODMED PPO HL P&C | Universal Healthcare | HL | P&C | F |  | Y |  |  | Same Day | 00903 | FDHPC | 600909 |  |  |  |  |  |
| FURNMED DD | Eminent Wealth | HL | DD |  |  |  |  |  | Same Day | 23000 | FURHD | 623027 |  |  |  |  |  |
| FURNMED P&C | Eminent Wealth | HL | P&C |  |  |  |  |  | Same Day | 23000 | FURHD | 623027 |  |  |  |  |  |
| GETCARE B DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B TOP UP DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B TOP UP P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B PLUS DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B PLUS P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B PLUS TOP UP DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE B PLUS TOP UP P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE C DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE C P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE C TOP UP DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETARE C TOP UP P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE E DD | Pan-African Managed Care | HL | DD | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GETCARE E P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N | GS/8numerics | Same Day | 23604 | BLAID | 623698 |  |  |  |  |  |
| GEMS DISP DR ACUTE  (includes new Tanzanite One Plan) | multi-managed gems | P | DD | F | A | Y | Y | 9 digits | 120 | 50318 | GEMDD | 623973 | Y | R0-R160.00: 34.50%, Max R55.20 | R0-R129.99: 34.50%, Max R44.85 | Y | Yes |
| GEMS DISP DR CHRONIC  (Includes New Tanzanite One Plan) | multi-managed gems | P | DD | F | A | Y | Y | 9 digits | 120 | 50318 | GMDDC | 696628 | Y | R0-R160.00: 34.50%, Max R55.20 | R0-R129.99: 34.50%, Max R44.85 | Y | Yes |
| GEMS  BERYL & TANZANITE P&C | multi-managed gems | HL | P&C | F |  |  | Y |  | 120 | 82910 | GESHL | 689702 |  |  |  |  | Yes |
| GEMS EMERALD, ONYX & RUBY P&C | MHG | HL | P&C | F |  |  | Y |  | 120 | 50318 | GEOHL | 683488 |  |  |  |  | Yes |
| GENESIS HL P&C | GENESIS | HL | P&C | F |  | Y |  |  | Same Day | 66508 | GHLPC | 619593 |  |  |  |  |  |
| GENRIC MEDICAL INSURANCE SCHEME DD | National Health Care | HL | DD | F |  | Y | N |  | Same Day | 01211 | GHNPC | 601212 |  |  |  |  |  |
| GENRIC MEDICAL INSURANCE SCHEME P&C | National Health Care | HL | P&C | F |  | Y | N |  | Same Day | 01211 | GHNPC | 601212 |  |  |  |  |  |
| GETSURE HL DD | Asterio Medical Insurance | HL | DD |  |  |  | N |  | Same Day | 08354 | EGHDP | 608443 |  |  |  |  |  |
| GETSURE HL P&C | Asterio Medical Insurance | HL | P&C |  |  |  | N |  | Same Day | 08354 | EGHDP | 608443 |  |  |  |  |  |
| GLENCORE  DD | Discovery Health | P | DD | F | A | Y | Y | 11 digits | 120 | 32530 | GLEND | 632603 |  |  |  |  | Yes |
| GLENCORE P&C | Discovery Health | P | P&C | F | A | Y | Y | 11 digits | 120 | 32530 | GLEND | 632603 |  |  |  |  | Yes |
| GOLDEN ARROW DD | Momentum TYB | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 01502 | MGADC | 601458 |  |  |  |  | Yes |
| GOLDEN ARROW P&C | Momentum TYB | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 01502 | MGADC | 601458 |  |  |  |  | Yes |
| GOLD FIELDS SOUTH DEEP GOLD MINE DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 19283 | GFSDP | 619305 |  |  |  |  | Yes |
| GOLD FIELDS SOUTH DEEP GOLD MINE P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 19283 | GFSDP | 619305 |  |  |  |  | Yes |
| GOMOMO CARE HL DD (outpatient treatment only) | Providence | HL | DD | F |  | Y |  |  | Same Day | 08257 | GOMPC | 608265 |  |  |  |  | Yes |
| GOMOMO CARE HL P&C (outpatient treatment only) | Providence | HL | P&C | F |  | Y |  |  | Same Day | 08257 | GOMPC | 608265 |  |  |  |  | Yes |
| HARMONY GOLD MINES DD | Sanlam Health | HL | DD | F |  | Y |  |  | Same Day | 10197 | HGMHL | 613463 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 |  |  |
| HARMONY GOLD MINES P&C | Sanlam Health | HL | P&C | F |  | Y |  |  | Same Day | 10197 | HGMHL | 613463 |  |  |  |  |  |
| HARMONY HEALTH P&C | providence | HL | DD | F |  | Y |  |  | Same Day | 13714 | PHHLD | 613676 |  |  |  |  |  |
| HARMONY HEALTH P&C | providence | HL | P&C | F |  | Y |  |  | Same Day | 13714 | PHHLD | 613676 |  |  |  |  |  |
| HEALTH4ME DD | Momentum Health | HL | DD | F |  | Y |  |  | Same Day | 18058 | SOVGP | 639802 |  |  |  |  |  |
| HEALTH4ME P&C | Momentum Health | HL | P&C | F |  | Y |  |  | Same Day | 18058 | SOVGP | 639802 |  |  |  |  |  |
| HERITAGE HEALTH P&C | Clinico Health | HL | P&C | F |  | Y |  |  | Same Day | 00642 | HRHPC | 600674 |  |  |  |  |  |
| HERITAGE HEALTH DD | Clinico Health | HL | DD | F |  | Y |  |  | Same Day | 00642 | HRHPC | 600674 |  |  |  |  |  |
| HORIZON DD | Medscheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 11568 | LMHDP | 604448 |  |  |  |  | Yes |
| HORIZON P&C | Medscheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 11568 | LMHDP | 604448 |  |  |  |  | Yes |
| IMPALA DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 06564 | PIMHL | 606521 |  |  |  |  | Yes |
| IMPALA P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 06564 | PIMHL | 606521 |  |  |  |  | Yes |
| IMPERIAL MOTUS MHS DD | MMI | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 00804 | IMDPC | 600810 |  |  |  |  | Yes |
| IMPERIAL MOTUS MHS P&C | MMI | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 00804 | IMDPC | 600810 |  |  |  |  | Yes |
| IMPROVED CLINICAL PATHWAY SERVICES (ICPS) | ICPS | HL | DD |  |  |  |  |  | Same Day | 10277 | ICPSP | 610279 |  |  |  |  |  |
| IMPROVED CLINICAL PATHWAY SERVICES (ICPS) | ICPS | HL | P&C |  |  |  |  |  | Same Day | 10277 | ICPSP | 610279 |  |  |  |  |  |
| JOINT CARE DD | JOINT CARE | HL | DD |  |  |  |  |  | Same Day | 00694 | JCLDP | 600695 |  |  |  |  |  |
| JOINT CARE P&C | JOINT CARE | HL | P&C |  |  |  |  |  | Same Day | 00694 | JCLDP | 600695 |  |  |  |  |  |
| KEYHEALTH  ACUTE DD | PPSHA | P | DD | F | A | Y | Y | Up to 9 digits | 120 | 87807 | KEYDD | 687130 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| KEYHEALTH CHRONIC DD | PPSHA | P | DD | F | A | Y | Y | Up to 9 digits | 120 | 87807 | KEYDC | 687149 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| KEYHEALTH GP & SPECIALIST  P&C | PPSHA | P | P&C | F | A | Y |  | Up to 9 digits | Same Day | 87807 | KEHPC | 687173 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y | Yes |
| LA HEALTH DD | Discovery Health | HL | DD | F |  | Y | Y | Up to 9 digits | 120 | 15377 | LAHDP | 614133 |  |  |  |  | Yes |
| LA HEALTH P&C | Discovery Health | HL | P&C | F |  | Y | Y | Up to 9 digits | 120 | 15377 | LAHDP | 614133 |  |  |  |  | Yes |
| LA HEALTH KEYCARE DD | Discovery Health | HL | DD | F |  | Y | Y | Up to 9 digits | 120 | 15377 | LAHDP | 614133 |  |  |  |  | Yes |
| LA HEALTH KEYCARE P&C | Discovery Health | HL | P&C | F |  | Y | Y | Up to 9 digits | 120 | 15377 | LAHDP | 614133 |  |  |  |  | Yes |
| LIBCARE DD | Discovery Health | P | DD | F |  | Y | Y |  | Same Day | 66958 | DSGHL | 604944 |  |  |  |  | Yes |
| LIBCARE P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | Same Day | 66958 | DSGHL | 604944 |  |  |  |  | Yes |
| LIBERTY HEALTH LESOTHO | Liberty Health | P | DD | F |  |  | Y |  | 120 | 00103 | LIBDD | 600563 |  |  |  |  |  |
| LIBERTY HEALTH LESOTHO | Liberty Health | HL | P&C |  |  |  |  |  | Same Day | 00103 | LIBDP | 600561 |  |  |  |  |  |
| LION HEALTH INSURANCE PLAN | Pan-African Managed Care | HL | DD | F |  | Y | N |  | 90 | 01339 | LIHEO | 601344 |  |  |  |  |  |
| LION HEALTH INSURANCE PLAN | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | 90 | 01339 | LIHEO | 601344 |  |  |  |  |  |
| LONMIN DD | Momentum TYB | HL | DD | F |  | Y | Y |  | 120 | 69191 | MSDDP | 669221 |  |  |  |  | Yes |
| LONMIN P&C | Momentum TYB | HL | P&C | F |  | Y | N |  | 1 | 69191 | MSDDP | 669221 |  |  |  |  | Yes |
| MAKOTI  HL DD | Makoti | HL | DD | F |  | Y | N |  | 120 | 01565 | MAKPD | 601559 |  |  |  |  |  |
| MAKOTI HL P&C | Makoti | HL | P&C | F |  | Y | N |  | 120 | 01565 | MAKPD | 601559 |  |  |  |  |  |
| MALCOR D ENABLEMED DD | Enablemed | HL | DD | F |  | Y | N |  | 120 | 00541 | MADPC | 600572 |  |  |  |  |  |
| MALCOR D ENABLEMED P&C | Enablemed | HL | P&C | F |  | Y | N |  | 120 | 00541 | MADPC | 600572 |  |  |  |  |  |
| MALCOR DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 09970 | MLCDO | 609989 |  |  |  |  | Yes |
| MALCOR P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 09970 | MLCDO | 609989 |  |  |  |  | Yes |
| MASSMART DD | Universal Health | P | DD | F | A | Y |  | 11 numeric digits | 120 | 18732 | MASSD | 621059 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| MASSMART P&C | Universal Health | HL | P&C | F |  | Y |  | 11 numeric digits | Same Day | 18732 | MTHLP | 618686 |  |  |  |  |  |
| MASSMART RADIOLOGY & PATHOLOGY | Universal Health | P | P&C | F |  | Y |  | 11 numeric digits | 120 | 10374 | UTRPS | 610372 |  |  |  |  |  |
| MASSMART TRUCARE DISP DOCTOR (Part of Workplace Health Plan) | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 24236 | WKTRD | 624090 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 | Y |  |
| MASSMART TRUCARE P&C (Part of Workplace Health Plan) | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 24236 | WTCHL | 624228 |  |  |  |  |  |
| MBMED DD | MedScheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64254 | DHDPC | 664262 |  |  |  |  | Yes |
| MBMED P&C | MedScheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64254 | DHDPC | 664262 |  |  |  |  | Yes |
| MEDIBUCKS SAVINGS ACCOUNT DD | mediBucks | P | DD |  |  |  |  |  | Same Day | 22608 | MDBSA | 622616 |  | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 |  |  |
| MEDIBUCKS SAVINGS ACCOUNT P&C | mediBucks | P | P&C |  |  |  |  |  | Same Day | 22608 | MDBSA | 622616 |  | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 |  |  |
| MEDICALL HEALTHCARE DD | Medicall Healthcare | HL | DD | F |  |  | N | 11 digits | 120 days | 00137 | MHSDP | 600425 |  |  |  |  |  |
| MEDICALL HEALTHCARE P&C | Medicall Healthcare | HL | P&C | F |  |  | N | 11 digits | 120 days | 00137 | MHSDP | 600425 |  |  |  |  |  |
| MEDIHELP DD | Medihelp | HL | DD | F |  | Y | Y |  | Same Day | 53082 | MMMMP | 653104 |  |  |  |  |  |
| MEDIHELP P&C | Medihelp | HL | P&C | F |  | Y | Y |  | Same Day | 53082 | MMMMP | 653104 |  |  |  |  |  |
| MEDIMED DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 71862 | MDDDP | 672230 |  |  |  |  | Yes |
| MEDIMED P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 71862 | MDDDP | 672230 |  |  |  |  | Yes |
| MEDIPOS DD | Discovery Health | HL | DD | F | A | Y | Y | 9 digits | 120 days | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| MEDIPOS P&C | Discovery Health | HL | P&C | F | A | Y | Y | 9 digits | 120 days | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| MEDICLINIC MEDSCHEME DOH COV19 DD | Medscheme | HL | DD | F |  | Y | N |  | Same Day | 00538 | MMDDP | 600546 |  |  |  |  |  |
| MEDICLINIC MEDSCHEME DOH COV 19 P&C | Medscheme | HL | P&C | F |  | Y | N |  | Same Day | 00538 | MMDDP | 600546 |  |  |  |  |  |
| MEDICLUB LION Day to Day Health Plan HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numeric digits | Same Day | 01394 | MLNHD | 601397 |  |  |  |  |  |
| MEDICLUB LION Day to Day Health Plan HNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7numeric digits | Same Day | 01394 | MLNHD | 601397 |  |  |  |  |  |
| MEDICLUB LION AGRIHEALTH HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numeric digits | Same Day | 01394 | MLNHD | 601397 |  |  |  |  |  |
| MEDICLUB LION AGRIHEALTH HNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7 numeric digits | Same Day | 01394 | MLNHD | 601397 |  |  |  |  |  |
| MEDSHIELD DD | Medshield | HL | DD | F |  | Y | Y |  | Same Day | 92460 | MSOHL | 692479 |  |  |  |  | Yes |
| MEDSHIELD P&C | Medshield | HL | P&C | F |  | Y | Y |  | Same Day | 92460 | MSOHL | 692479 |  |  |  |  | Yes |
| MOMENTUM DD | Momentum Health | HL | DD | F |  | Y |  |  | Same Day | 27219 | SOVGP | 639802 |  |  |  |  |  |
| MOMENTUM P&C | Momentum Health | HL | P&C | F |  | Y |  |  | Same Day | 27219 | SOVGP | 639802 |  |  |  |  |  |
| MOMENTUM MOZAMBIQUE PLA SAUDE DD | Momentum Health | HL | DD | F |  |  |  |  | 120 days | 10018 | MMPDP | 610028 |  |  |  |  |  |
| MOMENTUM MOZAMBIQUE PLA SAUDE P&C | Momentum Health | HL | P&C | F |  |  |  |  | 120 days | 10018 | MMPDP | 610028 |  |  |  |  |  |
| MOTO HEALTHCARE DD | Momentum Health | HL | DD | F |  | Y |  |  | Same Day | 27219 | SOVGP | 639802 |  |  |  |  |  |
| MOTO HEALTHCARE P&C | Momentum Health | HL | P&C | F |  | Y |  |  | Same Day | 27219 | SOVGP | 639802 |  |  |  |  |  |
| MYHEALTH VITAL BASE GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| NAMIBIA HEALTH PLAN | Medscheme | HL | DD |  |  |  | N |  | Same Day | 00107 | MNHPC | 600395 |  |  |  |  | Yes |
| NAMIBIA HEALTH PLAN | Medscheme | HL | P&C |  |  |  | N |  | Same Day | 00107 | MNHPC | 600395 |  |  |  |  | Yes |
| NASPERS - MMED DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15466 | MMMDP | 614206 |  |  |  |  | Yes |
| NASPERS - MMED P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15466 | MMMDP | 614206 |  |  |  |  | Yes |
| NATIONAL BARGAINING COUNCIL FOR THE ROAD FREIGHT AND LOGISTICS INDUSTRY (NBCRFLI) DD | Affinity Health | HL | DD | F |  |  | N |  | Same Day | 01320 | NBCRO | 601323 |  |  |  |  |  |
| NATIONAL BARGAINING COUNCIL FOR THE ROAD FREIGHT AND LOGISTICS INDUSTRY (NBCRFLI) P&C | Affinity Health | HL | P&C | F |  |  | N |  | Same Day | 01320 | NBCRO | 601323 |  |  |  |  |  |
| NATIONAL BARGAINING COUNCIL PRIVATE SECURITY SECTOR (NBCPSS) | Affinity Health | HL | DD | F |  |  | N |  | Same Day | 01321 | NBSSO | 601326 |  |  |  |  |  |
| NATIONAL BARGAINING COUNCIL PRIVATE SECURITY SECTOR (NBCPSS) | Affinity Health | HL | P&C | F |  |  | N |  | Same Day | 01321 | NBSSO | 601326 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB ELITE HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB ELITE HNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB CONNECT HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB CONNECT HNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB PLUS HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB PLUS HNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB PREMIER HNL DD | National Health Care | HL | DD | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NATIONAL HEALTHCARE MEDICLUB PREMIERHNL P&C | National Health Care | HL | P&C | F |  | Y | N | 7 numerics | 120 | 00015 | NHHPC | 600104 |  |  |  |  |  |
| NETCARE (DISCOVERY) DOCTOR DD | Discovery Health | HL | DD | F | A |  | Y | 9 digits | 120 | 37915 | DCNDR | 600558 |  |  |  |  | Yes |
| NETCARE (DISCOVERY) DOCTOR P&C | Discovery Health | HL | P&C | F | A |  | Y | 9 digits | 120 | 37915 | DCNDR | 600558 |  |  |  |  | Yes |
| NETCARE MMI DOH COV19 HL DD | Momentum Health | HL | DD | F |  | Y |  |  | 120 | 00537 | NMDOH | 600545 |  |  |  |  |  |
| NETCARE MMI DOH COV19 HL P&C | Momentum Health | HL | P&C | F |  | Y |  |  | 120 | 00537 | NMDOH | 600545 |  |  |  |  |  |
| NETCAREPLUS PREPAID PROCEDURES HL DD | NetcarePlus | HL | DD |  |  |  |  |  | 120 | 00542 | NPHLP | 600578 |  |  |  |  |  |
| NETCAREPLUS PREPAID PROCEDURES HL P&C | NetcarePlus | HL | P&C |  |  |  |  |  | 120 | 00542 | NPHLP | 600578 |  |  |  |  |  |
| NETCAREPLUS VOUCHER HL DD | NetcarePlus | HL | DD |  |  |  |  |  | 120 | 00536 | NPHLD | 600543 |  |  |  |  |  |
| NETCAREPLUS VOUCHER HL P&C | NetcarePlus | HL | P&C |  |  |  |  |  | 120 | 00536 | NPHLD | 600543 |  |  |  |  |  |
| NUFAWSA DD | Eminent Wealth | HL | DD |  |  |  |  |  | Same Day | 23019 | NUFHD | 623019 |  |  |  |  |  |
| NUFAWSA P&C | Eminent Wealth | HL | P&C |  |  |  |  |  | Same Day | 23019 | NUFHD | 623019 |  |  |  |  |  |
| OLD MUTUAL HEALTH | National Health Care | HL | P&C | F |  | Y | N |  | 120 | 00890 | OMHPC | 600891 |  |  |  |  |  |
| OLD MUTUAL STAFF (OMSMAF) DD | Universal Health | P | DD | F | A | Y |  | 91/ 11 numerics | 120 | 00024 | OMADD | 600083 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R137.99: 34.50%, Max R47.61 | Y | Yes |
| OLD MUTUAL STAFF (OMSMAF) P&C | Universal Health | HL | P&C | F |  | Y |  | 91/ 11 numerics | Same Day | 00024 | OMHLP | 600079 |  |  |  |  | Yes |
| ORACLE HEALTH DD | Oracle Health | HL | DD |  |  |  |  |  | 120 | 00775 | OHCDD | 600898 |  |  |  |  |  |
| ORACLE HEALTH P&C | Oracle Health | HL | P&C |  |  |  |  |  | 120 | 00775 | OHCDD | 600898 |  |  |  |  |  |
| PARMED DD | Medscheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64505 | PHDPC | 664513 |  |  |  |  | Yes |
| PARMED P&C | Medscheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64505 | PHDPC | 664513 |  |  |  |  | Yes |
| PEP EXECUTIVE HL DD | Medicall Healthcare | HL | DD | F |  | Y | N | 13 Numerics | 120 | 01264 | PEMDO | 601267 |  |  |  |  |  |
| PEP EXECUTIVE HL P&C | Medicall Healthcare | HL | P&C | F |  | Y | N | 13 Numerics | 120 | 01264 | PEMDO | 601267 |  |  |  |  |  |
| PG GROUP MHS DD | MMI | HL | DD |  |  |  |  | 3 to 7 digits | Same Day | 00812 | PGLDP | 600814 |  |  |  |  | Yes |
| PG GROUP MHS P&C | MMI | HL | P&C |  |  |  |  | 3 to 7 digits | Same Day | 00812 | PGLDP | 600814 |  |  |  |  | Yes |
| PICK N  PAY DD | MHS | HL | DD | F |  | Y |  | 3 to 7 digits | 120 | 01047 | PNPHD | 601053 |  |  |  |  |  |
| PICK N  PAY P&C | MHS | HL | P&C | F |  | Y |  | 3 to 7 digits | 120 | 01047 | PNPHD | 601053 |  |  |  |  | Yes |
| PLATINUM HEALTH DD (Includes PlatFreedom) | Platinum Health | HL | DD | F | A | Y |  | 10 digits | Same Day | 06394 | PHHLP | 614109 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 |  | Yes |
| PLATINUM HEALTH P&C (Includes PlatFreedom) | Platinum Health | HL | P&C | F |  | Y |  | 10 digits | Same Day | 06394 | PHHLP | 614109 |  |  |  |  |  |
| POLMED  DD | MEDSCHEME | HL | DD | F |  | Y | N | 11 characters | Same Day | 24120 | PLMHL | 624139 |  |  |  |  |  |
| POLMED P&C | MEDSCHEME | HL | P&C | F |  | Y | N | 11 characters | Same Day | 24120 | PLMHL | 624139 |  |  |  |  |  |
| PRIMECURE DISCHEM CORE PHI, CORE, PLUS & PLUS PHI | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| PROFMED PROSELECT GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 76589 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSELECT SAVVY GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 76589 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSELECT PMB CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 76589 | PRHDC | 676570 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSELECT SAVVY PMB CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 76589 | PRHDC | 676570 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROACTIVE PLUS ACUTE (SUBJECT TO DAY TO DAY BENEFITS) | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 76589 | PRFDA | 621067 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROACTIVE PLUS SAVVY ACUTE (SUBJECT TO DAY TO DAY BENEFITS) | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 76589 | PRFDA | 621067 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROACTIVE PLUS GP & SPECIALIST (SUBJECT TO DAY TO DAY BENEFITS) | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 76589 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROACTIVE PLUS SAVVY GP & SPECIALIST (SUBJECT TO DAY TO DAY BENEFITS) | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 76589 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROPINACCLE CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44660 | PDDCC | 644784 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROPINACCLE SAVVY CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44660 | PDDCC | 644784 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROPINNACLE ACUTE | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44660 | PFDCA | 644776 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROPINNACLE SAVVY ACUTE | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44660 | PFDCA | 644776 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED  PROPINNACLE GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 44660 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED  PROPINNACLE SAVVY GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 44660 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSECURE & PROSECURE PLUS ACUTE | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44636 | PSDDA | 644733 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY ACUTE | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44636 | PSDDA | 644733 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSECURE & PROSECURE PLUS CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44636 | PSDDC | 644741 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY CHRONIC | PPSHA | P | DD | F |  | Y | Y | 4 to 9 digits | 120 | 44636 | PSDDC | 644741 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 44636 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED  PROSECURE GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 44636 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PROFMED  PROSECURE SAVVY GP & SPECIALIST | PPSHA | P | P&C | F |  | Y |  | 4 to 9 digits | Same Day | 44636 | PPMGP | 634487 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y | Yes |
| PULA HL DD | Associated Fund Administrators | HL | DD | F |  | Y |  | 8 numerics | Same Day | 10251 | APHDP | 613803 |  |  |  |  |  |
| PULA HL P&C | Associated Fund Administrators | HL | P&C | F |  | Y |  | 8 Numerics | Same Day | 10251 | APHDP | 613803 |  |  |  |  |  |
| RAND MUTUAL DD ACUTE | Rand Mutual | P | DD | F | A | Y |  | Alphanumeric with maximum of 2 slashes (/) | Same Day | 67288 | RANDJ | 646906 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y |  |
| RAND MUTUAL DD CHRONIC | Rand Mutual | P | DD | F | A | Y |  | Alphanumeric with maximum of 2 slashes (/) | Same Day | 67288 | RANDJ | 646906 | Y | R0-R160.00 : 30.00%, Max R48.00 | 0.3632 | Y |  |
| RAND MUTUAL P&C | Rand Mutual | HL | P&C | F |  | Y | Y | Alphanumeric with maximum of 2 slashes (/) | Same Day | 67288 | RANPC | 617698 |  |  |  |  |  |
| RAND WATER MS DRC DENTAL HNL P&C | Momentum TYB | HL | P&C | F |  | Y |  |  | Same Day | 01427 | RWDHO | 601428 |  |  |  |  |  |
| RAND WATER MS DISP DOCT ACUTE | Momentum TYB | P | DD | F | A | Y | Y |  | 120 | 01412 | RWDDO | 601416 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 |  |  |
| RAND WATER MS DISP DOCT CHRONIC | Momentum TYB | P | DD | F | A | Y | Y |  | 120 | 01412 | RWMDO | 601417 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 |  |  |
| RAND WATER MS HL PROCEDURES & CONSULTS | Momentum TYB | HL | P&C | F | A | Y |  |  | Same Day | 01412 | RWMHO | 601426 |  |  |  |  |  |
| REMEDI DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15512 | REMDP | 614257 |  |  |  |  | Yes |
| REMEDI P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15512 | REMDP | 614257 |  |  |  |  | Yes |
| RETAIL DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15369 | RMSDP | 614125 |  |  |  |  | Yes |
| RETAIL P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15369 | RMSDP | 614125 |  |  |  |  | Yes |
| RETAIL CORE, RETAIL CORE PHI PLUS & PLUS PHI | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| RFMCF DISP DOCT (ACUTE & CHRONIC) | RFMCF | P | DD | F |  | Y | Y | 8 digits | 120 | 21970 | RFDSD | 624031 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| RFMCF GP P&C'S (Includes Specialists) | RFMCF | P | P&C | F |  | Y |  | 8 digits | Same Day | 21970 | RMFPC | 600136 |  |  |  |  |  |
| RUMED DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 72265 | RUDDP | 672281 |  |  |  |  | Yes |
| RUMED P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 72265 | RUDDP | 672281 |  |  |  |  | Yes |
| SABMAS DD  ACUTE | 3Sixty Health | P | DD | F | A | Y | Y | 9 digits | 120 | 00823 | SADDD | 600826 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y | Yes |
| SABMAS DD CHRONIC | 3Sixty Health | P | DD | F | A | Y | Y | 9 digits | 120 | 00823 | SADDD | 600826 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y | Yes |
| SABMAS ESSENTIAL GP  & SPECIALIST | 3Sixty Health | HL | P&C | F | A | Y | Y | 9 digits | 152 | 00823 | SAHPC | 600830 |  |  |  |  | Yes |
| SABMAS COMPREHENSIVE GP & SPECIALIST | 3Sixty Health | HL | P&C | F | A | Y | Y | 9 digits | 152 | 00823 | SAHPC | 600830 |  |  |  |  | Yes |
| SABC DD | MedScheme | HL | DD | F |  | Y | N | 11 digits | Same Day | 64556 | SHDPC | 664564 |  |  |  |  | Yes |
| SABC P&C | MedScheme | HL | P&C | F |  | Y | N | 11 digits | Same Day | 64556 | SHDPC | 664564 |  |  |  |  | Yes |
| SAMWUMED DD | SAMWUMED | HL | DD | F |  | Y |  |  | Same Day | 87335 | SADPC | 612270 |  |  |  |  | Yes |
| SAMWUMED P&C | SAMWUMED | HL | P&C | F |  | Y |  |  | Same Day | 87335 | SADPC | 612270 |  |  |  |  | Yes |
| SASOLMED DD | Discovery Health | HL | DD |  |  | Y |  | 11 digits | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| SASOLMED P&C | Discovery Health | HL | P&C |  |  | Y |  | 11 digits | 120 | 15350 | DMSDP | 614117 |  |  |  |  | Yes |
| SEDMED DD | Sedmed | HL | P&C | F |  | Y | N |  | Same Day | 06017 | SHLDP | 622950 |  |  |  |  |  |
| SEDMED P&C | Sedmed | HL | DD | F |  | Y | N |  | Same Day | 06017 | SHLDP | 622950 |  |  |  |  |  |
| SIBANYE GOLD DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 00299 | SBYHL | 600302 |  |  |  |  | Yes |
| SIBANYE GOLD P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 00299 | SBYHL | 600302 |  |  |  |  | Yes |
| SISONKE DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 69191 | MSDDP | 669221 |  |  |  |  | Yes |
| SISONKE P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 69191 | MSDDP | 669221 |  |  |  |  | Yes |
| SIZWE HOSMED DD | 3Sixty Health | HL | DD | F |  | Y |  |  | Same Day | 10210 | THLDP | 610224 |  |  |  |  | Yes |
| SIZWE HOSMED P&C | 3Sixty Health | HL | P&C | F |  | Y |  |  | Same Day | 10210 | THLDP | 610224 |  |  |  |  | Yes |
| SUREMED HEALTH DD | Providence | HL | DD | F |  | Y |  |  | Same Day | 75248 | SRHLO | 675604 |  |  |  |  | Yes |
| SUREMED HEALTH P&C | Providence | HL | P&C | F |  | Y |  |  | Same Day | 75248 | SRHLO | 675604 |  |  |  |  | Yes |
| SWAZIMED DD | Swazimed | HL | DD |  |  | Y |  | up to 9 numerics | 120 | 00213 | SZMPC | 600825 |  |  |  |  |  |
| SWAZIMED P&C | Swazimed | HL | P&C |  |  | Y |  | up to 9 numerics | 120 | 00213 | SZMPC | 600825 |  |  |  |  |  |
| TFG DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15520 | TFGDP | 614265 |  |  |  |  | Yes |
| TFG P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15520 | TFGDP | 614265 |  |  |  |  | Yes |
| THEBEMED DD | Providence | HL | DD | F |  | Y |  | up to 9 numerics | Same Day | 00016 | PTHPC | 600028 |  |  |  |  | Yes |
| THEBEMED P&C | Providence | HL | P&C | F |  | Y |  | up to 9 numerics | Same Day | 00016 | PTHPC | 600028 |  |  |  |  | Yes |
| THLAKANO CORE 123 GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO ELITE 122 GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO PLUS GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO BASE GP  P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO BASIC GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO COMPREHENSIVE GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO LEGALWISE GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO MCKENZIE GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO MDB-HEALTH GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO TRANSNET | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| THLAKANO VITAL GP P&C | Prime Cure | HL | P&C | F |  | Y | N |  | Same Day | 05371 | MPCHG | 605398 |  |  |  |  |  |
| TRANSMED DD | MMI | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 68446 | TRDPC | 668470 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 |  |  |
| TRANSMED P&C | MMI | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 68446 | TRDPC | 668470 |  |  |  |  |  |
| TRANSMED LINK | Universal Health | P | DD | F | A | Y |  | 9 digits | 120 | 20524 | UTRDD | 620729 | Y | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | Y |  |
| TRANSMED LINK P&C | Universal Health | HL | P&C | F |  | Y |  | 9 digits | Same Day | 20524 | TSHPC | 616705 |  |  |  |  |  |
| TSOGO DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15431 | TSMDP | 614184 |  |  |  |  | Yes |
| TSOGO P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15431 | TSMDP | 614184 |  |  |  |  | Yes |
| TYMEHEALTH NHC HL DD | National Health Care | HL | DD | F |  | Y | N | 13 Numerics | 120 | 10447 | NTDDP | 610452 |  |  |  |  |  |
| TYMEHEALTH NHC HL P&C | National Health Care | HL | P&C | F |  | Y | N | 13 Numerics | 120 | 10447 | NTDDP | 610452 |  |  |  |  |  |
| UMVUZO HL DD (All Plans in hosp & Out of hosp certain disciplines) | Umvuzo | HL | DD | F |  | Y |  |  | Same Day | 06076 | UMSHL | 618619 |  |  |  |  |  |
| UMVUZO HL P&C (All Plans in hosp & out of hosp certain disciplines) | Umvuzo | HL | P&C | F |  | Y |  |  | Same Day | 06076 | UMSHL | 618619 |  |  |  |  |  |
| UNITY HEALTH P&C (refer to summary list for plans/options) | Unity Health | HL | P&C | F |  | Y |  |  | Same Day | 19569 | AUHID | 619577 |  |  |  |  |  |
| Universal Health Insurance Plan DD | Universal Health Insurance | P | P&C | F | A | Y |  | 11 Digits | Same Day | 21342 | UNIDD | 621261 |  | R0-R149.99: 34.50%, Max R51.75 | R0-R129.99: 34.50%, Max R44.85 | No |  |
| Universal Health Insurance Plan P&C | Universal Health Insurance | HL | P&C | F |  | Y |  | 11 digits | Same Day | 21342 | UHLDP | 623124 |  |  |  |  |  |
| UNIVERSITY OF KWA-ZULU NATAL DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 15458 | UKMDP | 614192 |  |  |  | No | Yes |
| UNIVERSITY OF KWA-ZULU NATAL P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 15458 | UKMDP | 614192 |  |  |  | No | Yes |
| WATCH TOWER DISPENSING DOCTOR | Universal Health | p | DD |  |  | Y |  | 13 Numerics | 120 | 00064 | WTDID | 600312 |  | R0-R160.00 : 30.00%, Max R48.00 | R0-R160.00 : 30.00%, Max R48.00 | No |  |
| WATCH TOWER P&C | Universal Health | HL | P&C |  |  | Y |  |  | Same Day | 00064 | WTHPC | 600461 |  |  |  |  |  |
| WESMART HEALTH INSURANCE HNL DD | Pan-African Managed Care | HL | DD | F |  | Y | N |  | Same Day | 00483 | WADPC | 600510 |  |  |  |  |  |
| WESMART HEALTH INSURANCE HNL P&C | Pan-African Managed Care | HL | P&C | F |  | Y | N |  | Same Day | 00483 | WADPC | 600510 |  |  |  |  |  |
| WITBANK COALFIELDS COMPREHENSIVE  ACUTE | Witbank Coalfields | P | DD | F | A | Y |  | 53/ 8 Digits | 30 | 19992 | WCDDA | 636269 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y |  |
| WITBANK COALFIELDS COMPREHENSIVE GP & SPECIALIST | Witbank Coalfields | P | P&C | F | A | Y |  | 53/ 8 digits | Same Day | 19992 | MGGPS | 680179 | Y |  |  |  |  |
| WITBANK COALFIELDS MIDMAS ACUTE | Witbank Coalfields | P | DD | F | A | Y |  | 53/ 8 Digits | 30 | 19992 | WCDDA | 636269 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y |  |
| WITBANK COALFIELDS MIDMAS GP & SPECIALIST | Witbank Coalfields | P | P&C | F | A | Y |  | 53/ 8 digits | Same Day | 19992 | MGGPS | 680179 | Y |  |  |  |  |
| WITBANK COALFIELDS NTSIKA ACUTE | Witbank Coalfields | P | DD | F | A | Y |  | 53/ 8 Digits | 30 | 19992 | WCDDA | 636269 | Y | R0-R160.00 : 30.00%, Max R48.00 | 36 | Y |  |
| WITBANK COALFIELDS NTSIKA GP & SPECIALIST | Witbank Coalfields | P | P&C | F | A | Y |  | 53/ 8 digits | Same Day | 19992 | MGGPS | 680179 | Y |  |  |  |  |
| WITSMED (UNIVERSITY OF WITWATERSRAND) DD | Discovery Health | HL | DD | F |  | Y | Y |  | 120 | 09997 | WTMDO | 600159 |  |  |  | No | Yes |
| WITSMED (UNIVERSITY OF WITWATERSRAND) P&C | Discovery Health | HL | P&C | F |  | Y | Y |  | 120 | 09997 | WTMDO | 600159 |  |  |  | No | Yes |
| WOOLTRU DD | MMI | HL | DD | F |  | Y |  | 3 to 7 digits | Same Day | 37826 | WLTHP | 688498 |  |  |  |  |  |
| WOOLTRU P&C | MMI | HL | P&C | F |  | Y |  | 3 to 7 digits | Same Day | 37826 | WLTHP | 688498 |  |  |  |  |  |
| WORKERS COMPENSATION ASSISTANCE (GAUTENG EMPLOYEES) | WORKERS COMPENSATION ASSISTANCE GP | HL | DD |  |  |  |  | MEMBER SA ID NUMBER | Unlimited | 10285 | WOADP | 610282 |  |  |  |  |  |
| WORKERS COMPENSATION ASSISTANCE (GAUTENG EMPLOYEES) | WORKERS COMPENSATION ASSISTANCE GP | HL | P&C |  |  |  |  | MEMBER SA ID NUMBER | Unlimited | 10285 | WOADP | 610282 |  |  |  |  |  |
| WORKPLACE HEALTH PLAN TRUHEALTH DD | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 11193 | WPDAC | 620141 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| WORKPLACE HEALTH PLAN TRUVALUE DD | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 11193 | WPDAC | 620141 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| WORKPLACE  HEALTH PLAN TRUWELLNESS DD | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 11193 | WPDAC | 620141 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| WORKPLACE HEALTH PLAN REBOKRANT DD | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 11193 | WPDAC | 620141 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| WORKPLACE HEALTH PLAN UNEQUALLED SOLUTIONS DD | Universal Health | P | DD | F | A | Y |  | 9 - 13  numeric digits | 120 | 11193 | WPDAC | 620141 | Y | R0-R149.99: 34.50%, Max R51.75 | R0-R149.99: 34.50%, Max R51.75 | Y |  |
| WORKPLACE HEALTH PLAN TRUHEALTH HL P&C | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 11193 | WPHPC | 611207 |  |  |  |  |  |
| WORKPLACE HEALTH PLAN TRUVALUE HL P&C | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 11193 | WPHPC | 611207 |  |  |  |  |  |
| WORKPLACE HEALTH PLAN TRUWELLNESS HL P&C | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 11193 | WPHPC | 611207 |  |  |  |  |  |
| WORKPLACE HEALTH PLAN REBOKRANT HL P&C | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 11193 | WPHPC | 611207 |  |  |  |  |  |
| WORKPLACE HEALTH PLAN UNEQUALLED SOLUTIONS P&C | Universal Health | HL | P&C | F |  | Y |  | 9 - 13  numeric digits | Same Day | 11193 | WPHPC | 611207 |  |  |  |  |  |

---

## Edge Cases & Notes

1. **BANKMED ESSENTIAL & BASIC DD** uses scheme code `08109` while the rest of BANKMED uses `23795`.
   This is the only instance in the list where the same logical scheme has a completely **different scheme/plan code** for a specific sub-option's dispensing line.

2. **GEMS** has two separate P&C entries under different scheme codes:
   - `50318` → GEMS Emerald, Onyx & Ruby P&C (admin: MHG)
   - `82910` → GEMS Beryl & Tanzanite P&C (admin: multi-managed gems)

3. **Acute vs Chronic split**: Some DD entries have separate rows for ACUTE and CHRONIC with different MAS-codes
   and option codes (e.g. CAMAF, KEYHEALTH, ANGLO AMS, PROFMED, GEMS, RAND WATER, SABMAS, WITBANK COALFIELDS).
   The `acuteChronic` flag in the lookup function handles this.

4. **COMPCARE** has 15 DD sub-options all mapping to the same MAS/option code (`COMDD`/`620699`),
   plus a single P&C entry with a different code (`COMHL`/`675973`).

5. **PROFMED** options across three scheme codes (`44636`, `44660`, `76589`) all share the **same P&C MAS-code**
   `PPMGP`/`634487`, but have distinct DD codes per scheme code.

6. **Terminated/Legend rows** in the source spreadsheet (column B) contain metadata like:
   - `MMAP = Maximum Medical Scheme Price`
   - `REF = Reference Pricing`
   - `URP = Unit Reference Pricing`
   These are not data rows and are excluded from the table above.

7. **Scheme code `various`** appears for CARECROSS (capitation-only P&C). This is the only scheme without a numeric code.

8. **Markup `0.3632`** and **`0.5044`** in the NON-SEP column are decimal representations of percentages (36.32% and 50.44%).
   Parse both `'36'` → 36%, `'0.3632'` → 36.32%, `'50.44%'` → 50.44%, and `'36.32%'` → 36.32%.

9. **`#` marked entries** (7 total) represent changes since the previous option list:
   BOMAID HL (DD+P&C), EEB (P&C), MEDICLUB LION Day to Day (DD+P&C), MEDICLUB LION AGRIHEALTH (DD+P&C).
