/**
 * Smoke test for MediKredit XML parsers (no network).
 * Run: npm run test:medikredit
 */
import { parseClaimXml, parseEligibilityXml, parseFamilyEligibilityXml } from "../lib/medikredit/parse-response"

const eligXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="20" res="A" tx_nbr="T1"><AUTHS hnet="HN1" auth_nbr="A1"/><MEM/><PAT/></TX></DOCUMENT>`
const e = parseEligibilityXml(eligXml)
if (e.status !== "eligible") throw new Error("expected eligible")
console.log("eligibility:", e.status, e.txNbr)

const famXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="30" res="A"><PAT dep_cd="01"/><PAT dep_cd="02"/></TX></DOCUMENT>`
const f = parseFamilyEligibilityXml(famXml)
if (f.dependents.length !== 2) throw new Error("expected 2 PAT")
console.log("family PAT count:", f.dependents.length)

const claimXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="21" res="A" tx_nbr="C1"><FIN gross="100" net="100"/><ITEM lin_num="1" status="A"><TAR><PROC tar_cd="0190"><TRMNT dt="20260409"/></PROC></TAR><FIN gross="100" net="100"/></ITEM></TX></DOCUMENT>`
const c = parseClaimXml(claimXml)
if (c.outcome !== "approved") throw new Error("expected approved")
console.log("claim:", c.outcome, c.itemStatuses.length, "items")

console.log("medikredit parse OK")
