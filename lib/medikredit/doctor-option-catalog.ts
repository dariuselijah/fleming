/**
 * MediKredit Doctor Option List — April 2026.
 * Source: "April 2026 Detailed DOCTOR Option List.xlsx"
 * 441 option rows across 147 unique scheme/plan codes.
 *
 * IMPORTANT: 27 scheme codes use different MAS-codes and/or option codes
 * for Dispensing (DD) vs Procedures & Consults (P&C). Always look up by
 * (schemeCode, claimType), never by schemeCode alone.
 */

export type DoctorOptionType = "HL" | "P"
export type DoctorClaimType = "DD" | "P&C"

export interface DoctorOption {
  /** Full scheme/plan/option name */
  name: string
  /** Third-party administrator */
  administrator: string
  /** HL = Health Level, P = Pharmacy (dispensing-specific routing) */
  optionType: DoctorOptionType
  /** DD = Dispensing Doctor, P&C = Procedures & Consults */
  claimType: DoctorClaimType
  /** Family check required */
  famcheck: boolean
  /** Authorisation check required (pre-auth number needed) */
  authcheck: boolean
  /** Claims House Format checks enabled */
  chfChecks: boolean | null
  /** Switch-out enabled */
  switchout: boolean | null
  /** Expected membership number format (free-text) */
  membershipFormat: string
  /** Reversal window in days. 0 = same day, -1 = unlimited */
  reversalPeriodDays: number
  /** 5-digit scheme/plan code for claim header */
  schemeCode: string
  /** 5-char MediKredit Administration System routing code */
  masCode: string
  /** 6-digit option code for claim body (maps to MEM@scheme_opt) */
  optionCode: string
  /** Whether pricing/markup applies */
  pricing: boolean
  /** Markup rule text for SEP products */
  markupSep: string
  /** Markup rule text for non-SEP products */
  markupNonSep: string
  /** MMAP/REF/URP applies */
  mmapRefUrp: boolean | null
  /** Electronic Remittance Advice supported */
  era: boolean
  /** Changed since previous option list */
  changed: boolean
}

interface _R {
  n: string; a: string; ot: string; ct: string
  fam: boolean; auth: boolean; chf: boolean | null; so: boolean | null
  mf: string; rev: number
  sc: string; mc: string; oc: string
  pr: boolean; ms: string; mn: string
  mm: boolean | null; era: boolean; ch: boolean
}

// prettier-ignore
const _DATA: _R[] = [
{"n":"ACUMEN DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"10032","mc":"AHLDP","oc":"600252","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ACUMEN P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"10032","mc":"AHLDP","oc":"600252","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"AECI DD  (Including Value Plan & Comprehensive Plan)","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64114","mc":"AHDPC","oc":"664122","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"AECI P&C (Including Value Plan & Comprehensive Plan)","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64114","mc":"AHDPC","oc":"664122","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"AFFINITY HEALTH P&C","a":"Affinity Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01322","mc":"AHMIO","oc":"601328","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"AGS HEALTH DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"AGS/9 DIGITS","rev":0,"sc":"00699","mc":"AGHDP","oc":"600718","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"AGS HEALTH P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"AGS/9 DIGITS","rev":0,"sc":"00699","mc":"AGHDP","oc":"600718","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ALLIANCE MIDMED P&C","a":"Private Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":2,"sc":"00078","mc":"IAMPC","oc":"600124","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ANGLO AMS ACUTE DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"18236","mc":"DAMDA","oc":"618279","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"18.24% - Max R18.24","mm":false,"era":true,"ch":false},
{"n":"ANGLO AMS CHRONIC DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"18236","mc":"DADCH","oc":"618325","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"18.24% - Max R18.24","mm":true,"era":true,"ch":false},
{"n":"ANGLO AMS P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"18236","mc":"DASDS","oc":"618384","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ANGLO VALUE CARE GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ANGLO VALUE CARE SPECIALIST P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHS","oc":"605401","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ANGLOVAAL DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15407","mc":"AMSDP","oc":"614141","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ANGLOVAAL P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15407","mc":"AMSDP","oc":"614141","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ANGLOGOLD ASHANTI  DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"26603","mc":"ASHPC","oc":"627375","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ANGLOGOLD ASHANTI P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"26603","mc":"ASHPC","oc":"627375","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ASTERIO HEALTH DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00610","mc":"AFDPC","oc":"600613","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ASTERIO HEALTH P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00610","mc":"AFDPC","oc":"600613","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BANKMED ACUTE DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"23795","mc":"BANDD","oc":"623884","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":false,"era":true,"ch":false},
{"n":"BANKMED CHRONIC DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"23795","mc":"BANDD","oc":"623884","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":true,"ch":false},
{"n":"BANKMED GP & SPECIALIST P&C (ALL PLANS)","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"23795","mc":"BANHL","oc":"623922","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BANKMED ESSENTIAL & BASIC DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"08109","mc":"BANHL","oc":"623922","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BARLOWORLD DD","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64157","mc":"BHDPC","oc":"664165","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BARLOWORLD P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64157","mc":"BHDPC","oc":"664165","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BESTMED DD","a":"Bestmed","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"65285","mc":"BESPC","oc":"665625","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BESTMED P&C","a":"Bestmed","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"65285","mc":"BESPC","oc":"665625","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BEWELL DD","a":"NATIONAL HEALTH CARE","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00785","mc":"BNHDP","oc":"600790","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BEWELL P&C","a":"NATIONAL HEALTH CARE","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00785","mc":"BNHDP","oc":"600790","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BCIMA BASIC (Building & Construction Industry) DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 - 7 numeric digits","rev":120,"sc":"12092","mc":"BCIDD","oc":"600201","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R137.99: 34.50%, Max R47.61","mm":true,"era":false,"ch":false},
{"n":"BCIMA Basic (Building & Construction Industry) P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 - 7 numeric digits","rev":0,"sc":"12092","mc":"BCDPC","oc":"612122","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BIMAF (BUILDING INDUSTRY) DD","a":"Building Industries","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"68918","mc":"BIMDA","oc":"668896","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":false,"era":false,"ch":false},
{"n":"BIMAF GP & SPECIALIST P&C","a":"Building Industries","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":120,"sc":"68918","mc":"BIMPC","oc":"686622","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"","mm":null,"era":false,"ch":false},
{"n":"BMW DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"18759","mc":"BMDOP","oc":"618767","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BMW P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"18759","mc":"BMDOP","oc":"618767","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BOMAID HL DD","a":"BOMAID Administrator","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"12998","mc":"BHSMP","oc":"600455","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"BOMAID HL P&C","a":"BOMAID Administrator","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"12998","mc":"BHSMP","oc":"600455","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"BOPHELO LESOTHO PROCEDURE AND CONSULTS","a":"Bophelo Lesotho","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"up to 8 digits","rev":120,"sc":"00072","mc":"BBLPC","oc":"600323","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BONITAS DD","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"Up to 11 digits","rev":0,"sc":"64815","mc":"BODPC","oc":"664823","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BONITAS P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"Up to 11 digits","rev":0,"sc":"64815","mc":"BODPC","oc":"664823","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BONCAP PHA (Limited Primary Care) DD","a":"Private Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"Up to 11 digits","rev":0,"sc":"00836","mc":"BONPC","oc":"600837","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BONCAP PHA (Limited Primary Care) P&C","a":"Private Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"Up to 11 digits","rev":0,"sc":"00836","mc":"BONPC","oc":"600837","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BONVIE GENRIC","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01469","mc":"GHPHO","oc":"601475","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BONVIE GENRIC","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01469","mc":"GHPHO","oc":"601475","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BP DD","a":"Momentum TYB","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01505","mc":"MBHDP","oc":"601464","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BP P&C","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01505","mc":"MBHDP","oc":"601464","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"BPOMAS HL DD","a":"PPSHA","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"7 numerics","rev":0,"sc":"10324","mc":"ABPDP","oc":"613820","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"BPOMAS HL P&C","a":"PPSHA","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"7 Numerics","rev":0,"sc":"10324","mc":"ABPDP","oc":"613820","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CAMAF ALLIANCE PLUS/NETWORK ACUTE DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDA","oc":"682538","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF ALLIANCE PLUS/NETWORK CHRONIC DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF VITAL PLUS/NETWORK  CHRONIC (PMB ONLY) DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF FIRST CHOICE ACUTE DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDA","oc":"682538","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF FIRST CHOICE  CHRONIC DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF ESSENTIAL PLUS/NETWORK ACUTE DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDA","oc":"682538","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":false,"era":true,"ch":false},
{"n":"CAMAF ESSENTIAL PLUS/NETWORK CHRONIC DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF NETWORK CHOICE ACUTE DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDA","oc":"682538","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF NETWORK CHOICE CHRONIC DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF DOUBLE PLUS/NETWORK ACUTE DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDA","oc":"682538","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF DOUBLE PLUS/NETWORK CHRONIC DD","a":"CAMAF Administrators","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"6 - 8 digits","rev":120,"sc":"72753","mc":"CGDDC","oc":"682546","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"CAMAF HL P&C","a":"CAMAF Administrators","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"6 - 8 digits","rev":0,"sc":"72753","mc":"ECHLP","oc":"613730","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"CAPE MEDICAL PLAN DD","a":"Cape Medical Plan","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"75124","mc":"CMHLP","oc":"699740","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"CAPE MEDICAL PLAN P&C","a":"Cape Medical Plan","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"75124","mc":"CMHLP","oc":"699740","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"CARECROSS ALL PLANS P&C (CAPITATION ONLY)","a":"MMI","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"various","mc":"CCDGP","oc":"673016","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"CDE PRIMARY DD(AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE PRIMARY P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CDE PRINCIPAL DD (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE PRINCIPAL P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CDE TRADITIONAL DD (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE TRADITIONAL P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CDE STANDARD DD (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE STANDARD P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CDE STANDARD PLUS DD(AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE STANDARD PLUS P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CDE EXPRESS DD (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"00031","mc":"CDEDD","oc":"600138","pr":true,"ms":"R0-R60.00: 17.25%, Max R17.25","mn":"R0-R60.00: 17.25%, Max R17.25","mm":null,"era":false,"ch":false},
{"n":"CDE EXPRESS P&C (AUTHORISED PMB ONLY)","a":"CDE","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"00031","mc":"CDEDP","oc":"600139","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CIGNA INTER FUND FOR AGRICULTURAL DEV DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 476/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.5044","mm":false,"era":false,"ch":false},
{"n":"CIGNA INTER FUND FOR AGRICULTURAL DEV P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 476/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA FOOD PROGRAM BMIP DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 477/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA FOOD PROGRAM BMIP P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 477/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD FOOD PROGRAM MCS DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 478/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD FOOD PROGRAM MCS P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 478/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD FOOD PROGRAM MICS DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with479/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD FOOD PROGRAM MICS P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 479/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA FOOD AND AGRICULTURAL ORGANISATION DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 480/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA FOOD AND AGRICULTURAL ORGANISATION P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 480/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA INTERNATIONAL MONETARY FUND DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 337/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA INTERNATIONAL MONETARY FUND P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 337/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA JESUIT REFUGEE SERVICES DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 467/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA JESUIT REFUGEE SERVICES P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 467/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA MTN DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 447/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA MTN P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 447/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA SASOL MOZAMBIQUE DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 451/","rev":120,"sc":"00680","mc":"CSMDD","oc":"600685","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA SASOL MOZAMBIQUE P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 451/","rev":120,"sc":"00680","mc":"CSMPC","oc":"600684","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 244/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 244/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 244/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 244/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP MIP DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 415/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNDP MIP P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 415/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UN MIP  DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 414/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UN MIP P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 414/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNICEF DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 270/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNICEF P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 270/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNOPS DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 243/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNOPS P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 243/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNV INTERNATIONAL VOLUNTEERS DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 002/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNV INTERNATIONAL VOLUNTEERS P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 002/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNV NATIONAL VOLUNTEERS DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 247/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA UNV NATIONAL VOLUNTEERS P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 247/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD BANK INTERNATIONAL ACTIVE & RETIRED ACUTE & CHRONIC DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 200/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD BANK INTERNATIONAL ACTIVE & RETIRED P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 200/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD BANK LOCAL ACTIVE & RETIRED DD","a":"Cigna","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 357/","rev":120,"sc":"00546","mc":"CIGDD","oc":"600594","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CIGNA WORLD BANK LOCAL ACTIVE & RETIRED P&C","a":"Cigna","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"Starts with 357/","rev":120,"sc":"00546","mc":"CIGDP","oc":"600595","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"50.44%","mm":false,"era":false,"ch":false},
{"n":"CITY OF JOHANNESBURG HL DD","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":false,"so":null,"mf":"","rev":-1,"sc":"","mc":"","oc":"","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CITY OF JOHANNESBURG HL P&C","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":false,"so":null,"mf":"","rev":-1,"sc":"","mc":"","oc":"","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CITY OF TSHWANE HL DD","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":false,"so":null,"mf":"","rev":-1,"sc":"","mc":"","oc":"","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CITY OF TSHWANE HL P&C","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":false,"so":null,"mf":"","rev":-1,"sc":"","mc":"","oc":"","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"COMPCARE DIGICARE","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE EXECUCARE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE EXECUCARE PLUS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE EXTRACARE","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE HOSPICARE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE MASSMART UMBONO DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE SAVERCARE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE SAVERCARE PLUS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE SELFCARE","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE SELFCARE PLUS","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE SUPERCARE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE ULTRACARE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE ULTRACARE PLUS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE UMBONO PLUS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE UMBONO DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"66370","mc":"COMDD","oc":"620699","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"COMPCARE P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":0,"sc":"66370","mc":"COMHL","oc":"675973","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"COMPCARE RADIOLOGY & PATHOLOGY","a":"Universal Health Insurance","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"3 alpha, 9 numerics","rev":120,"sc":"10462","mc":"CRPSO","oc":"610463","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"COMPENSATION FUND","a":"Compensation Fund","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":-1,"sc":"19658","mc":"CFHGP","oc":"619682","pr":false,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":false,"era":false,"ch":false},
{"n":"COMPENSATION FUND","a":"Compensation Fund","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":-1,"sc":"19658","mc":"CFHGP","oc":"619682","pr":false,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":false,"era":false,"ch":false},
{"n":"COMPSOL DD","a":"Compsol","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":-1,"sc":"13862","mc":"COHLP","oc":"613870","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"COMPSOL P&C","a":"Compsol","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":-1,"sc":"13862","mc":"COHLP","oc":"613870","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"CONSUMER GOODS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"7 numeric digits","rev":120,"sc":"66451","mc":"UTBDP","oc":"620621","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"CONSUMER GOODS P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"7 numeric digits","rev":0,"sc":"66451","mc":"TBRHL","oc":"678077","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"DE BEERS DD","a":"De Beers","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"34509","mc":"DBDHL","oc":"601112","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DE BEERS P&C","a":"De Beers","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"34509","mc":"DBDHL","oc":"601112","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DISCOVERY DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DISCOVERY P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DISCOVERY KEYCARE DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DISCOVERY KEYCARE P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"DRUM MED HL DD","a":"Affinity Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00145","mc":"DRHLD","oc":"600241","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"DRUM MED HL P&C","a":"Affinity Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00145","mc":"DRHLD","oc":"600241","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EEB (Essential Employee Benefits) NHC HL DD","a":"Medicall Healthcare","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"01265","mc":"EMHDO","oc":"601273","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EEB (Essential Employee Benefits) NHC HL P&C","a":"Medicall Healthcare","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"01265","mc":"EMHDO","oc":"601273","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"ELLERINE HOLDINGS DD","a":"MedScheme","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":false,"mf":"11 digits","rev":0,"sc":"64297","mc":"EHDPC","oc":"664300","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ELLERINE HOLDINGS P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":false,"mf":"11 digits","rev":0,"sc":"64297","mc":"EHDPC","oc":"664300","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMASWATI HEALTHCARE DD","a":"EMASWATI CARE","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00780","mc":"EMADP","oc":"600781","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMASWATI HEALTHE P&C","a":"EMASWATI CARE","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00780","mc":"EMADP","oc":"600781","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMASWATI HEALTHE P&C","a":"EMASWATI CARE","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00780","mc":"EMADP","oc":"600781","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMASWATI HEALTHE P&C","a":"EMASWATI CARE","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00780","mc":"EMADP","oc":"600781","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMINENT GENRIC","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01469","mc":"GHPHO","oc":"601475","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EMINENT GENRIC","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01469","mc":"GHPHO","oc":"601475","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ENGEN DISCOVERY DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"9 numerics","rev":120,"sc":"10001","mc":"DEDPC","oc":"600110","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ENGEN DISCOVERY P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"9 numerics","rev":120,"sc":"10001","mc":"DEDPC","oc":"600110","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ESSENTIAL MED DD","a":"Essential Med","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":0,"sc":"08540","mc":"ESSPC","oc":"608559","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ESSENTIAL MED P&C","a":"Essential Med","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":0,"sc":"08540","mc":"ESSPC","oc":"608559","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ESSENTIAL MED CORPORATE DD","a":"Essential Med Corporate","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"8 Numerics","rev":120,"sc":"00482","mc":"ESMCP","oc":"600489","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ESSENTIAL MED CORPORATE P&C","a":"Essential Med Corporate","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"8 Numerics","rev":120,"sc":"00482","mc":"ESMCP","oc":"600489","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EssentialMED Health Plan DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00722","mc":"NIHDP","oc":"600726","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"EssentialMED Health Plan P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00722","mc":"NIHDP","oc":"600726","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FEDHEALTH DD","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64866","mc":"FHDPC","oc":"664874","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FEDHEALTH P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64866","mc":"FHDPC","oc":"664874","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FISHMED DD","a":"Momentum TYB","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01504","mc":"MFHDP","oc":"601461","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FISHMED P&C","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01504","mc":"MFHDP","oc":"601461","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FLEXICARE DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FLEXICARE P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"FLEXICARE GOLD 129","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FLEXICARE GUARDIAN 130","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FOODMED PPO HL DD","a":"Universal Healthcare","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00903","mc":"FDHPC","oc":"600909","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FOODMED PPO HL P&C","a":"Universal Healthcare","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00903","mc":"FDHPC","oc":"600909","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FURNMED DD","a":"Eminent Wealth","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"23000","mc":"FURHD","oc":"623027","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"FURNMED P&C","a":"Eminent Wealth","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"23000","mc":"FURHD","oc":"623027","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B TOP UP DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B TOP UP P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B PLUS DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B PLUS P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B PLUS TOP UP DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE B PLUS TOP UP P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE C DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE C P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE C TOP UP DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETARE C TOP UP P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE E DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETCARE E P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"GS/8numerics","rev":0,"sc":"23604","mc":"BLAID","oc":"623698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GEMS DISP DR ACUTE  (includes new Tanzanite One Plan)","a":"multi-managed gems","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"50318","mc":"GEMDD","oc":"623973","pr":true,"ms":"R0-R160.00: 34.50%, Max R55.20","mn":"R0-R129.99: 34.50%, Max R44.85","mm":true,"era":true,"ch":false},
{"n":"GEMS DISP DR CHRONIC  (Includes New Tanzanite One Plan)","a":"multi-managed gems","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"50318","mc":"GMDDC","oc":"696628","pr":true,"ms":"R0-R160.00: 34.50%, Max R55.20","mn":"R0-R129.99: 34.50%, Max R44.85","mm":true,"era":true,"ch":false},
{"n":"GEMS  BERYL & TANZANITE P&C","a":"multi-managed gems","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":true,"mf":"","rev":120,"sc":"82910","mc":"GESHL","oc":"689702","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GEMS EMERALD, ONYX & RUBY P&C","a":"MHG","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":true,"mf":"","rev":120,"sc":"50318","mc":"GEOHL","oc":"683488","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GENESIS HL P&C","a":"GENESIS","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"66508","mc":"GHLPC","oc":"619593","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GENRIC MEDICAL INSURANCE SCHEME DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01211","mc":"GHNPC","oc":"601212","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GENRIC MEDICAL INSURANCE SCHEME P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"01211","mc":"GHNPC","oc":"601212","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETSURE HL DD","a":"Asterio Medical Insurance","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"08354","mc":"EGHDP","oc":"608443","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GETSURE HL P&C","a":"Asterio Medical Insurance","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"08354","mc":"EGHDP","oc":"608443","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"GLENCORE  DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"11 digits","rev":120,"sc":"32530","mc":"GLEND","oc":"632603","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GLENCORE P&C","a":"Discovery Health","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"11 digits","rev":120,"sc":"32530","mc":"GLEND","oc":"632603","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOLDEN ARROW DD","a":"Momentum TYB","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01502","mc":"MGADC","oc":"601458","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOLDEN ARROW P&C","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"01502","mc":"MGADC","oc":"601458","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOLD FIELDS SOUTH DEEP GOLD MINE DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"19283","mc":"GFSDP","oc":"619305","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOLD FIELDS SOUTH DEEP GOLD MINE P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"19283","mc":"GFSDP","oc":"619305","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOMOMO CARE HL DD (outpatient treatment only)","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"08257","mc":"GOMPC","oc":"608265","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"GOMOMO CARE HL P&C (outpatient treatment only)","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"08257","mc":"GOMPC","oc":"608265","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"HARMONY GOLD MINES DD","a":"Sanlam Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"10197","mc":"HGMHL","oc":"613463","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":null,"era":false,"ch":false},
{"n":"HARMONY GOLD MINES P&C","a":"Sanlam Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"10197","mc":"HGMHL","oc":"613463","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HARMONY HEALTH P&C","a":"providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"13714","mc":"PHHLD","oc":"613676","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HARMONY HEALTH P&C","a":"providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"13714","mc":"PHHLD","oc":"613676","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HEALTH4ME DD","a":"Momentum Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"18058","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HEALTH4ME P&C","a":"Momentum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"18058","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HERITAGE HEALTH P&C","a":"Clinico Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00642","mc":"HRHPC","oc":"600674","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HERITAGE HEALTH DD","a":"Clinico Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00642","mc":"HRHPC","oc":"600674","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"HORIZON DD","a":"Medscheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"11568","mc":"LMHDP","oc":"604448","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"HORIZON P&C","a":"Medscheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"11568","mc":"LMHDP","oc":"604448","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"IMPALA DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"06564","mc":"PIMHL","oc":"606521","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"IMPALA P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"06564","mc":"PIMHL","oc":"606521","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"IMPERIAL MOTUS MHS DD","a":"MMI","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"00804","mc":"IMDPC","oc":"600810","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"IMPERIAL MOTUS MHS P&C","a":"MMI","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"00804","mc":"IMDPC","oc":"600810","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"IMPROVED CLINICAL PATHWAY SERVICES (ICPS)","a":"ICPS","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"10277","mc":"ICPSP","oc":"610279","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"IMPROVED CLINICAL PATHWAY SERVICES (ICPS)","a":"ICPS","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"10277","mc":"ICPSP","oc":"610279","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"JOINT CARE DD","a":"JOINT CARE","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"00694","mc":"JCLDP","oc":"600695","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"JOINT CARE P&C","a":"JOINT CARE","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"00694","mc":"JCLDP","oc":"600695","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"KEYHEALTH  ACUTE DD","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"87807","mc":"KEYDD","oc":"687130","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"KEYHEALTH CHRONIC DD","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"87807","mc":"KEYDC","oc":"687149","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"KEYHEALTH GP & SPECIALIST  P&C","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"Up to 9 digits","rev":0,"sc":"87807","mc":"KEHPC","oc":"687173","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":true,"ch":false},
{"n":"LA HEALTH DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"15377","mc":"LAHDP","oc":"614133","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LA HEALTH P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"15377","mc":"LAHDP","oc":"614133","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LA HEALTH KEYCARE DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"15377","mc":"LAHDP","oc":"614133","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LA HEALTH KEYCARE P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"Up to 9 digits","rev":120,"sc":"15377","mc":"LAHDP","oc":"614133","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LIBCARE DD","a":"Discovery Health","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"66958","mc":"DSGHL","oc":"604944","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LIBCARE P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"66958","mc":"DSGHL","oc":"604944","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LIBERTY HEALTH LESOTHO","a":"Liberty Health","ot":"P","ct":"DD","fam":true,"auth":false,"chf":null,"so":true,"mf":"","rev":120,"sc":"00103","mc":"LIBDD","oc":"600563","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"LIBERTY HEALTH LESOTHO","a":"Liberty Health","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"00103","mc":"LIBDP","oc":"600561","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"LION HEALTH INSURANCE PLAN","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":90,"sc":"01339","mc":"LIHEO","oc":"601344","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"LION HEALTH INSURANCE PLAN","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":90,"sc":"01339","mc":"LIHEO","oc":"601344","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"LONMIN DD","a":"Momentum TYB","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"69191","mc":"MSDDP","oc":"669221","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"LONMIN P&C","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":1,"sc":"69191","mc":"MSDDP","oc":"669221","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MAKOTI  HL DD","a":"Makoti","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"01565","mc":"MAKPD","oc":"601559","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MAKOTI HL P&C","a":"Makoti","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"01565","mc":"MAKPD","oc":"601559","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MALCOR D ENABLEMED DD","a":"Enablemed","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00541","mc":"MADPC","oc":"600572","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MALCOR D ENABLEMED P&C","a":"Enablemed","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00541","mc":"MADPC","oc":"600572","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MALCOR DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"09970","mc":"MLCDO","oc":"609989","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MALCOR P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"09970","mc":"MLCDO","oc":"609989","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MASSMART DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"11 numeric digits","rev":120,"sc":"18732","mc":"MASSD","oc":"621059","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"MASSMART P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"11 numeric digits","rev":0,"sc":"18732","mc":"MTHLP","oc":"618686","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MASSMART RADIOLOGY & PATHOLOGY","a":"Universal Health","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"11 numeric digits","rev":120,"sc":"10374","mc":"UTRPS","oc":"610372","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MASSMART TRUCARE DISP DOCTOR (Part of Workplace Health Plan)","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"24236","mc":"WKTRD","oc":"624090","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":true,"era":false,"ch":false},
{"n":"MASSMART TRUCARE P&C (Part of Workplace Health Plan)","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"24236","mc":"WTCHL","oc":"624228","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MBMED DD","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64254","mc":"DHDPC","oc":"664262","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MBMED P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64254","mc":"DHDPC","oc":"664262","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDIBUCKS SAVINGS ACCOUNT DD","a":"mediBucks","ot":"P","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"22608","mc":"MDBSA","oc":"622616","pr":false,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":null,"era":false,"ch":false},
{"n":"MEDIBUCKS SAVINGS ACCOUNT P&C","a":"mediBucks","ot":"P","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"22608","mc":"MDBSA","oc":"622616","pr":false,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":null,"era":false,"ch":false},
{"n":"MEDICALL HEALTHCARE DD","a":"Medicall Healthcare","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":null,"so":false,"mf":"11 digits","rev":120,"sc":"00137","mc":"MHSDP","oc":"600425","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDICALL HEALTHCARE P&C","a":"Medicall Healthcare","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":false,"mf":"11 digits","rev":120,"sc":"00137","mc":"MHSDP","oc":"600425","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDIHELP DD","a":"Medihelp","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"53082","mc":"MMMMP","oc":"653104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDIHELP P&C","a":"Medihelp","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"53082","mc":"MMMMP","oc":"653104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDIMED DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"71862","mc":"MDDDP","oc":"672230","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDIMED P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"71862","mc":"MDDDP","oc":"672230","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDIPOS DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDIPOS P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDICLINIC MEDSCHEME DOH COV19 DD","a":"Medscheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00538","mc":"MMDDP","oc":"600546","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDICLINIC MEDSCHEME DOH COV 19 P&C","a":"Medscheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00538","mc":"MMDDP","oc":"600546","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MEDICLUB LION Day to Day Health Plan HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numeric digits","rev":0,"sc":"01394","mc":"MLNHD","oc":"601397","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"MEDICLUB LION Day to Day Health Plan HNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7numeric digits","rev":0,"sc":"01394","mc":"MLNHD","oc":"601397","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"MEDICLUB LION AGRIHEALTH HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numeric digits","rev":0,"sc":"01394","mc":"MLNHD","oc":"601397","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"MEDICLUB LION AGRIHEALTH HNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numeric digits","rev":0,"sc":"01394","mc":"MLNHD","oc":"601397","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":true},
{"n":"MEDSHIELD DD","a":"Medshield","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"92460","mc":"MSOHL","oc":"692479","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MEDSHIELD P&C","a":"Medshield","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":0,"sc":"92460","mc":"MSOHL","oc":"692479","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"MOMENTUM DD","a":"Momentum Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"27219","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MOMENTUM P&C","a":"Momentum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"27219","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MOMENTUM MOZAMBIQUE PLA SAUDE DD","a":"Momentum Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"10018","mc":"MMPDP","oc":"610028","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MOMENTUM MOZAMBIQUE PLA SAUDE P&C","a":"Momentum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"10018","mc":"MMPDP","oc":"610028","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MOTO HEALTHCARE DD","a":"Momentum Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"27219","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MOTO HEALTHCARE P&C","a":"Momentum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"27219","mc":"SOVGP","oc":"639802","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"MYHEALTH VITAL BASE GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NAMIBIA HEALTH PLAN","a":"Medscheme","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"00107","mc":"MNHPC","oc":"600395","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NAMIBIA HEALTH PLAN","a":"Medscheme","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"00107","mc":"MNHPC","oc":"600395","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NASPERS - MMED DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15466","mc":"MMMDP","oc":"614206","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NASPERS - MMED P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15466","mc":"MMMDP","oc":"614206","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NATIONAL BARGAINING COUNCIL FOR THE ROAD FREIGHT AND LOGISTICS INDUSTRY (NBCRFLI) DD","a":"Affinity Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"01320","mc":"NBCRO","oc":"601323","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL BARGAINING COUNCIL FOR THE ROAD FREIGHT AND LOGISTICS INDUSTRY (NBCRFLI) P&C","a":"Affinity Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"01320","mc":"NBCRO","oc":"601323","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL BARGAINING COUNCIL PRIVATE SECURITY SECTOR (NBCPSS)","a":"Affinity Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"01321","mc":"NBSSO","oc":"601326","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL BARGAINING COUNCIL PRIVATE SECURITY SECTOR (NBCPSS)","a":"Affinity Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":null,"so":false,"mf":"","rev":0,"sc":"01321","mc":"NBSSO","oc":"601326","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB ELITE HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB ELITE HNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB CONNECT HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB CONNECT HNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB PLUS HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB PLUS HNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB PREMIER HNL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NATIONAL HEALTHCARE MEDICLUB PREMIERHNL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"7 numerics","rev":120,"sc":"00015","mc":"NHHPC","oc":"600104","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCARE (DISCOVERY) DOCTOR DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":true,"chf":null,"so":true,"mf":"9 digits","rev":120,"sc":"37915","mc":"DCNDR","oc":"600558","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NETCARE (DISCOVERY) DOCTOR P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":null,"so":true,"mf":"9 digits","rev":120,"sc":"37915","mc":"DCNDR","oc":"600558","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"NETCARE MMI DOH COV19 HL DD","a":"Momentum Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":120,"sc":"00537","mc":"NMDOH","oc":"600545","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCARE MMI DOH COV19 HL P&C","a":"Momentum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":120,"sc":"00537","mc":"NMDOH","oc":"600545","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCAREPLUS PREPAID PROCEDURES HL DD","a":"NetcarePlus","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00542","mc":"NPHLP","oc":"600578","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCAREPLUS PREPAID PROCEDURES HL P&C","a":"NetcarePlus","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00542","mc":"NPHLP","oc":"600578","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCAREPLUS VOUCHER HL DD","a":"NetcarePlus","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00536","mc":"NPHLD","oc":"600543","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NETCAREPLUS VOUCHER HL P&C","a":"NetcarePlus","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00536","mc":"NPHLD","oc":"600543","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NUFAWSA DD","a":"Eminent Wealth","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"23019","mc":"NUFHD","oc":"623019","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"NUFAWSA P&C","a":"Eminent Wealth","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":0,"sc":"23019","mc":"NUFHD","oc":"623019","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"OLD MUTUAL HEALTH","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":120,"sc":"00890","mc":"OMHPC","oc":"600891","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"OLD MUTUAL STAFF (OMSMAF) DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"91/ 11 numerics","rev":120,"sc":"00024","mc":"OMADD","oc":"600083","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R137.99: 34.50%, Max R47.61","mm":true,"era":true,"ch":false},
{"n":"OLD MUTUAL STAFF (OMSMAF) P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"91/ 11 numerics","rev":0,"sc":"00024","mc":"OMHLP","oc":"600079","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"ORACLE HEALTH DD","a":"Oracle Health","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00775","mc":"OHCDD","oc":"600898","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"ORACLE HEALTH P&C","a":"Oracle Health","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"","rev":120,"sc":"00775","mc":"OHCDD","oc":"600898","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PARMED DD","a":"Medscheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64505","mc":"PHDPC","oc":"664513","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"PARMED P&C","a":"Medscheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64505","mc":"PHDPC","oc":"664513","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"PEP EXECUTIVE HL DD","a":"Medicall Healthcare","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"13 Numerics","rev":120,"sc":"01264","mc":"PEMDO","oc":"601267","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PEP EXECUTIVE HL P&C","a":"Medicall Healthcare","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"13 Numerics","rev":120,"sc":"01264","mc":"PEMDO","oc":"601267","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PG GROUP MHS DD","a":"MMI","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"00812","mc":"PGLDP","oc":"600814","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"PG GROUP MHS P&C","a":"MMI","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"00812","mc":"PGLDP","oc":"600814","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"PICK N  PAY DD","a":"MHS","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":120,"sc":"01047","mc":"PNPHD","oc":"601053","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PICK N  PAY P&C","a":"MHS","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":120,"sc":"01047","mc":"PNPHD","oc":"601053","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"PLATINUM HEALTH DD (Includes PlatFreedom)","a":"Platinum Health","ot":"HL","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"10 digits","rev":0,"sc":"06394","mc":"PHHLP","oc":"614109","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":null,"era":true,"ch":false},
{"n":"PLATINUM HEALTH P&C (Includes PlatFreedom)","a":"Platinum Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"10 digits","rev":0,"sc":"06394","mc":"PHHLP","oc":"614109","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"POLMED  DD","a":"MEDSCHEME","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 characters","rev":0,"sc":"24120","mc":"PLMHL","oc":"624139","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"POLMED P&C","a":"MEDSCHEME","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 characters","rev":0,"sc":"24120","mc":"PLMHL","oc":"624139","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PRIMECURE DISCHEM CORE PHI, CORE, PLUS & PLUS PHI","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PROFMED PROSELECT GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"76589","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSELECT SAVVY GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"76589","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSELECT PMB CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"76589","mc":"PRHDC","oc":"676570","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSELECT SAVVY PMB CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"76589","mc":"PRHDC","oc":"676570","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROACTIVE PLUS ACUTE (SUBJECT TO DAY TO DAY BENEFITS)","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"76589","mc":"PRFDA","oc":"621067","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROACTIVE PLUS SAVVY ACUTE (SUBJECT TO DAY TO DAY BENEFITS)","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"76589","mc":"PRFDA","oc":"621067","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROACTIVE PLUS GP & SPECIALIST (SUBJECT TO DAY TO DAY BENEFITS)","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"76589","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROACTIVE PLUS SAVVY GP & SPECIALIST (SUBJECT TO DAY TO DAY BENEFITS)","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"76589","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROPINACCLE CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44660","mc":"PDDCC","oc":"644784","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROPINACCLE SAVVY CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44660","mc":"PDDCC","oc":"644784","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROPINNACLE ACUTE","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44660","mc":"PFDCA","oc":"644776","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROPINNACLE SAVVY ACUTE","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44660","mc":"PFDCA","oc":"644776","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED  PROPINNACLE GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"44660","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED  PROPINNACLE SAVVY GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"44660","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSECURE & PROSECURE PLUS ACUTE","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44636","mc":"PSDDA","oc":"644733","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY ACUTE","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44636","mc":"PSDDA","oc":"644733","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSECURE & PROSECURE PLUS CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44636","mc":"PSDDC","oc":"644741","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY CHRONIC","a":"PPSHA","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"4 to 9 digits","rev":120,"sc":"44636","mc":"PSDDC","oc":"644741","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED PROSECURE SAVVY & PROSECURE PLUS SAVVY GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"44636","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED  PROSECURE GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"44636","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PROFMED  PROSECURE SAVVY GP & SPECIALIST","a":"PPSHA","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"4 to 9 digits","rev":0,"sc":"44636","mc":"PPMGP","oc":"634487","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":true,"ch":false},
{"n":"PULA HL DD","a":"Associated Fund Administrators","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"8 numerics","rev":0,"sc":"10251","mc":"APHDP","oc":"613803","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"PULA HL P&C","a":"Associated Fund Administrators","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"8 Numerics","rev":0,"sc":"10251","mc":"APHDP","oc":"613803","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"RAND MUTUAL DD ACUTE","a":"Rand Mutual","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"Alphanumeric with maximum of 2 slashes (/)","rev":0,"sc":"67288","mc":"RANDJ","oc":"646906","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":false,"ch":false},
{"n":"RAND MUTUAL DD CHRONIC","a":"Rand Mutual","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"Alphanumeric with maximum of 2 slashes (/)","rev":0,"sc":"67288","mc":"RANDJ","oc":"646906","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"0.3632","mm":true,"era":false,"ch":false},
{"n":"RAND MUTUAL P&C","a":"Rand Mutual","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"Alphanumeric with maximum of 2 slashes (/)","rev":0,"sc":"67288","mc":"RANPC","oc":"617698","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"RAND WATER MS DRC DENTAL HNL P&C","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"01427","mc":"RWDHO","oc":"601428","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"RAND WATER MS DISP DOCT ACUTE","a":"Momentum TYB","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"01412","mc":"RWDDO","oc":"601416","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":null,"era":false,"ch":false},
{"n":"RAND WATER MS DISP DOCT CHRONIC","a":"Momentum TYB","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"","rev":120,"sc":"01412","mc":"RWMDO","oc":"601417","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":null,"era":false,"ch":false},
{"n":"RAND WATER MS HL PROCEDURES & CONSULTS","a":"Momentum TYB","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"","rev":0,"sc":"01412","mc":"RWMHO","oc":"601426","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"REMEDI DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15512","mc":"REMDP","oc":"614257","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"REMEDI P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15512","mc":"REMDP","oc":"614257","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"RETAIL DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15369","mc":"RMSDP","oc":"614125","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"RETAIL P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15369","mc":"RMSDP","oc":"614125","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"RETAIL CORE, RETAIL CORE PHI PLUS & PLUS PHI","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"RFMCF DISP DOCT (ACUTE & CHRONIC)","a":"RFMCF","ot":"P","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"8 digits","rev":120,"sc":"21970","mc":"RFDSD","oc":"624031","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"RFMCF GP P&C'S (Includes Specialists)","a":"RFMCF","ot":"P","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"8 digits","rev":0,"sc":"21970","mc":"RMFPC","oc":"600136","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"RUMED DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"72265","mc":"RUDDP","oc":"672281","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"RUMED P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"72265","mc":"RUDDP","oc":"672281","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SABMAS DD  ACUTE","a":"3Sixty Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"00823","mc":"SADDD","oc":"600826","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":true,"ch":false},
{"n":"SABMAS DD CHRONIC","a":"3Sixty Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":120,"sc":"00823","mc":"SADDD","oc":"600826","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":true,"ch":false},
{"n":"SABMAS ESSENTIAL GP  & SPECIALIST","a":"3Sixty Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"00823","mc":"SAHPC","oc":"600830","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SABMAS COMPREHENSIVE GP & SPECIALIST","a":"3Sixty Health","ot":"HL","ct":"P&C","fam":true,"auth":true,"chf":true,"so":true,"mf":"9 digits","rev":152,"sc":"00823","mc":"SAHPC","oc":"600830","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SABC DD","a":"MedScheme","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64556","mc":"SHDPC","oc":"664564","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SABC P&C","a":"MedScheme","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"11 digits","rev":0,"sc":"64556","mc":"SHDPC","oc":"664564","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SAMWUMED DD","a":"SAMWUMED","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"87335","mc":"SADPC","oc":"612270","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SAMWUMED P&C","a":"SAMWUMED","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"87335","mc":"SADPC","oc":"612270","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SASOLMED DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":true,"so":null,"mf":"11 digits","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SASOLMED P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":true,"so":null,"mf":"11 digits","rev":120,"sc":"15350","mc":"DMSDP","oc":"614117","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SEDMED DD","a":"Sedmed","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"06017","mc":"SHLDP","oc":"622950","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"SEDMED P&C","a":"Sedmed","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"06017","mc":"SHLDP","oc":"622950","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"SIBANYE GOLD DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00299","mc":"SBYHL","oc":"600302","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SIBANYE GOLD P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00299","mc":"SBYHL","oc":"600302","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SISONKE DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"69191","mc":"MSDDP","oc":"669221","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SISONKE P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"69191","mc":"MSDDP","oc":"669221","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SIZWE HOSMED DD","a":"3Sixty Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"10210","mc":"THLDP","oc":"610224","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SIZWE HOSMED P&C","a":"3Sixty Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"10210","mc":"THLDP","oc":"610224","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SUREMED HEALTH DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"75248","mc":"SRHLO","oc":"675604","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SUREMED HEALTH P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"75248","mc":"SRHLO","oc":"675604","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"SWAZIMED DD","a":"Swazimed","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":true,"so":null,"mf":"up to 9 numerics","rev":120,"sc":"00213","mc":"SZMPC","oc":"600825","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"SWAZIMED P&C","a":"Swazimed","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":true,"so":null,"mf":"up to 9 numerics","rev":120,"sc":"00213","mc":"SZMPC","oc":"600825","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"TFG DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15520","mc":"TFGDP","oc":"614265","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"TFG P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15520","mc":"TFGDP","oc":"614265","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"THEBEMED DD","a":"Providence","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"up to 9 numerics","rev":0,"sc":"00016","mc":"PTHPC","oc":"600028","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"THEBEMED P&C","a":"Providence","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"up to 9 numerics","rev":0,"sc":"00016","mc":"PTHPC","oc":"600028","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"THLAKANO CORE 123 GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO ELITE 122 GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO PLUS GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO BASE GP  P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO BASIC GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO COMPREHENSIVE GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO LEGALWISE GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO MCKENZIE GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO MDB-HEALTH GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO TRANSNET","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"THLAKANO VITAL GP P&C","a":"Prime Cure","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"05371","mc":"MPCHG","oc":"605398","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"TRANSMED DD","a":"MMI","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"68446","mc":"TRDPC","oc":"668470","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":null,"era":false,"ch":false},
{"n":"TRANSMED P&C","a":"MMI","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"68446","mc":"TRDPC","oc":"668470","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"TRANSMED LINK","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 digits","rev":120,"sc":"20524","mc":"UTRDD","oc":"620729","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":true,"era":false,"ch":false},
{"n":"TRANSMED LINK P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 digits","rev":0,"sc":"20524","mc":"TSHPC","oc":"616705","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"TSOGO DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15431","mc":"TSMDP","oc":"614184","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"TSOGO P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15431","mc":"TSMDP","oc":"614184","pr":false,"ms":"","mn":"","mm":null,"era":true,"ch":false},
{"n":"TYMEHEALTH NHC HL DD","a":"National Health Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"13 Numerics","rev":120,"sc":"10447","mc":"NTDDP","oc":"610452","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"TYMEHEALTH NHC HL P&C","a":"National Health Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"13 Numerics","rev":120,"sc":"10447","mc":"NTDDP","oc":"610452","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"UMVUZO HL DD (All Plans in hosp & Out of hosp certain disciplines)","a":"Umvuzo","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"06076","mc":"UMSHL","oc":"618619","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"UMVUZO HL P&C (All Plans in hosp & out of hosp certain disciplines)","a":"Umvuzo","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"06076","mc":"UMSHL","oc":"618619","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"UNITY HEALTH P&C (refer to summary list for plans/options)","a":"Unity Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"19569","mc":"AUHID","oc":"619577","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"Universal Health Insurance Plan DD","a":"Universal Health Insurance","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"11 Digits","rev":0,"sc":"21342","mc":"UNIDD","oc":"621261","pr":false,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R129.99: 34.50%, Max R44.85","mm":false,"era":false,"ch":false},
{"n":"Universal Health Insurance Plan P&C","a":"Universal Health Insurance","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"11 digits","rev":0,"sc":"21342","mc":"UHLDP","oc":"623124","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"UNIVERSITY OF KWA-ZULU NATAL DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15458","mc":"UKMDP","oc":"614192","pr":false,"ms":"","mn":"","mm":false,"era":true,"ch":false},
{"n":"UNIVERSITY OF KWA-ZULU NATAL P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"15458","mc":"UKMDP","oc":"614192","pr":false,"ms":"","mn":"","mm":false,"era":true,"ch":false},
{"n":"WATCH TOWER DISPENSING DOCTOR","a":"Universal Health","ot":"P","ct":"DD","fam":false,"auth":false,"chf":true,"so":null,"mf":"13 Numerics","rev":120,"sc":"00064","mc":"WTDID","oc":"600312","pr":false,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"R0-R160.00 : 30.00%, Max R48.00","mm":false,"era":false,"ch":false},
{"n":"WATCH TOWER P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":true,"so":null,"mf":"","rev":0,"sc":"00064","mc":"WTHPC","oc":"600461","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WESMART HEALTH INSURANCE HNL DD","a":"Pan-African Managed Care","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00483","mc":"WADPC","oc":"600510","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WESMART HEALTH INSURANCE HNL P&C","a":"Pan-African Managed Care","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":false,"mf":"","rev":0,"sc":"00483","mc":"WADPC","oc":"600510","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS COMPREHENSIVE  ACUTE","a":"Witbank Coalfields","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 Digits","rev":30,"sc":"19992","mc":"WCDDA","oc":"636269","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS COMPREHENSIVE GP & SPECIALIST","a":"Witbank Coalfields","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 digits","rev":0,"sc":"19992","mc":"MGGPS","oc":"680179","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS MIDMAS ACUTE","a":"Witbank Coalfields","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 Digits","rev":30,"sc":"19992","mc":"WCDDA","oc":"636269","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS MIDMAS GP & SPECIALIST","a":"Witbank Coalfields","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 digits","rev":0,"sc":"19992","mc":"MGGPS","oc":"680179","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS NTSIKA ACUTE","a":"Witbank Coalfields","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 Digits","rev":30,"sc":"19992","mc":"WCDDA","oc":"636269","pr":true,"ms":"R0-R160.00 : 30.00%, Max R48.00","mn":"36","mm":true,"era":false,"ch":false},
{"n":"WITBANK COALFIELDS NTSIKA GP & SPECIALIST","a":"Witbank Coalfields","ot":"P","ct":"P&C","fam":true,"auth":true,"chf":true,"so":null,"mf":"53/ 8 digits","rev":0,"sc":"19992","mc":"MGGPS","oc":"680179","pr":true,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WITSMED (UNIVERSITY OF WITWATERSRAND) DD","a":"Discovery Health","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"09997","mc":"WTMDO","oc":"600159","pr":false,"ms":"","mn":"","mm":false,"era":true,"ch":false},
{"n":"WITSMED (UNIVERSITY OF WITWATERSRAND) P&C","a":"Discovery Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":true,"mf":"","rev":120,"sc":"09997","mc":"WTMDO","oc":"600159","pr":false,"ms":"","mn":"","mm":false,"era":true,"ch":false},
{"n":"WOOLTRU DD","a":"MMI","ot":"HL","ct":"DD","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"37826","mc":"WLTHP","oc":"688498","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WOOLTRU P&C","a":"MMI","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"3 to 7 digits","rev":0,"sc":"37826","mc":"WLTHP","oc":"688498","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKERS COMPENSATION ASSISTANCE (GAUTENG EMPLOYEES)","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"DD","fam":false,"auth":false,"chf":null,"so":null,"mf":"MEMBER SA ID NUMBER","rev":-1,"sc":"10285","mc":"WOADP","oc":"610282","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKERS COMPENSATION ASSISTANCE (GAUTENG EMPLOYEES)","a":"WORKERS COMPENSATION ASSISTANCE GP","ot":"HL","ct":"P&C","fam":false,"auth":false,"chf":null,"so":null,"mf":"MEMBER SA ID NUMBER","rev":-1,"sc":"10285","mc":"WOADP","oc":"610282","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN TRUHEALTH DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"11193","mc":"WPDAC","oc":"620141","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN TRUVALUE DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"11193","mc":"WPDAC","oc":"620141","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"WORKPLACE  HEALTH PLAN TRUWELLNESS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"11193","mc":"WPDAC","oc":"620141","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN REBOKRANT DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"11193","mc":"WPDAC","oc":"620141","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN UNEQUALLED SOLUTIONS DD","a":"Universal Health","ot":"P","ct":"DD","fam":true,"auth":true,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":120,"sc":"11193","mc":"WPDAC","oc":"620141","pr":true,"ms":"R0-R149.99: 34.50%, Max R51.75","mn":"R0-R149.99: 34.50%, Max R51.75","mm":true,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN TRUHEALTH HL P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"11193","mc":"WPHPC","oc":"611207","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN TRUVALUE HL P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"11193","mc":"WPHPC","oc":"611207","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN TRUWELLNESS HL P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"11193","mc":"WPHPC","oc":"611207","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN REBOKRANT HL P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"11193","mc":"WPHPC","oc":"611207","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
{"n":"WORKPLACE HEALTH PLAN UNEQUALLED SOLUTIONS P&C","a":"Universal Health","ot":"HL","ct":"P&C","fam":true,"auth":false,"chf":true,"so":null,"mf":"9 - 13  numeric digits","rev":0,"sc":"11193","mc":"WPHPC","oc":"611207","pr":false,"ms":"","mn":"","mm":null,"era":false,"ch":false},
]

function expand(r: _R): DoctorOption {
  return {
    name: r.n, administrator: r.a,
    optionType: r.ot as DoctorOptionType, claimType: r.ct as DoctorClaimType,
    famcheck: r.fam, authcheck: r.auth, chfChecks: r.chf, switchout: r.so,
    membershipFormat: r.mf, reversalPeriodDays: r.rev,
    schemeCode: r.sc, masCode: r.mc, optionCode: r.oc,
    pricing: r.pr, markupSep: r.ms, markupNonSep: r.mn,
    mmapRefUrp: r.mm, era: r.era, changed: r.ch,
  }
}

let _bySchemeCode: Map<string, DoctorOption[]> | null = null
let _allExpanded: DoctorOption[] | null = null

function ensureIndex() {
  if (_bySchemeCode) return
  _allExpanded = _DATA.map(expand)
  _bySchemeCode = new Map()
  for (const o of _allExpanded) {
    const key = o.schemeCode
    const arr = _bySchemeCode.get(key)
    if (arr) arr.push(o)
    else _bySchemeCode.set(key, [o])
  }
}

/** All 441 doctor options. */
export function getAllDoctorOptions(): DoctorOption[] {
  ensureIndex()
  return _allExpanded!
}

/** All unique scheme codes (147). */
export function getAllSchemeCodes(): string[] {
  ensureIndex()
  return Array.from(_bySchemeCode!.keys())
}

/** Look up option(s) by scheme code. Returns both DD and P&C entries. */
export function getOptionsBySchemeCode(schemeCode: string): DoctorOption[] {
  ensureIndex()
  return _bySchemeCode!.get(schemeCode) ?? []
}

/**
 * Primary lookup: resolve the exact option for a given (schemeCode, claimType).
 * For schemes with acute/chronic split, pass the optional flag to narrow further.
 */
export function resolveOption(
  schemeCode: string,
  claimType: DoctorClaimType,
  acuteChronic?: "acute" | "chronic"
): DoctorOption | null {
  const opts = getOptionsBySchemeCode(schemeCode).filter(o => o.claimType === claimType)
  if (opts.length === 0) return null
  if (opts.length === 1) return opts[0]
  if (acuteChronic) {
    const needle = acuteChronic.toUpperCase()
    const match = opts.find(o => o.name.toUpperCase().includes(needle))
    if (match) return match
  }
  return opts[0]
}

/**
 * Resolve the MEM@scheme_opt value for a claim submission.
 * Returns the 6-digit option code or null if scheme not found.
 */
export function resolveSchemeOptionCode(
  schemeCode: string,
  claimType: DoctorClaimType,
  acuteChronic?: "acute" | "chronic"
): string | null {
  return resolveOption(schemeCode, claimType, acuteChronic)?.optionCode ?? null
}

/**
 * Fuzzy search: find options whose name matches a search term.
 * Used for scheme selection UI lookups.
 */
export function searchDoctorOptions(query: string): DoctorOption[] {
  if (!query.trim()) return []
  ensureIndex()
  const q = query.toUpperCase()
  return _allExpanded!.filter(o => o.name.toUpperCase().includes(q))
}

/**
 * Get unique scheme entries (one per scheme code, deduplicated).
 * Useful for populating a scheme picker dropdown.
 */
export function getUniqueSchemes(): Array<{ schemeCode: string; name: string; administrator: string }> {
  ensureIndex()
  const seen = new Set<string>()
  const result: Array<{ schemeCode: string; name: string; administrator: string }> = []
  for (const o of _allExpanded!) {
    if (seen.has(o.schemeCode)) continue
    seen.add(o.schemeCode)
    const baseName = o.name
      .replace(/\s*(ACUTE|CHRONIC|DD|P&C|GP|SPECIALIST|GP & SPECIALIST|ALL PLANS|GENERAL|ALL OPTIONS|HL|DISP DOCT?O?R?)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
    result.push({ schemeCode: o.schemeCode, name: baseName || o.name, administrator: o.administrator })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Validate a membership number against the scheme's expected format.
 * Returns null if valid or no format specified, or an error message.
 */
export function validateMembershipFormat(schemeCode: string, memberNumber: string): string | null {
  const opts = getOptionsBySchemeCode(schemeCode)
  if (opts.length === 0) return null
  const fmt = opts[0].membershipFormat
  if (!fmt) return null
  const upper = fmt.toUpperCase()
  const num = memberNumber.trim()
  if (!num) return `Membership number is required for ${opts[0].name}`
  const digitMatch = upper.match(/^(\d+)\s*DIGITS?$/)
  if (digitMatch) {
    const len = parseInt(digitMatch[1])
    if (!/^\d+$/.test(num)) return `Membership number must be numeric (${fmt})`
    if (num.length !== len) return `Membership number must be exactly ${len} digits (${fmt})`
    return null
  }
  const upToMatch = upper.match(/^UP TO (\d+)\s*DIGITS?$/)
  if (upToMatch) {
    const max = parseInt(upToMatch[1])
    if (!/^\d+$/.test(num)) return `Membership number must be numeric (${fmt})`
    if (num.length > max) return `Membership number must be at most ${max} digits (${fmt})`
    return null
  }
  return null
}
