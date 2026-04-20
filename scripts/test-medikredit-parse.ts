/**
 * Smoke test for MediKredit XML parsers (no network).
 * Run: npm run test:medikredit
 */
import { parseClaimXml, parseEligibilityXml, parseFamilyEligibilityXml } from "../lib/medikredit/parse-response"

const eligXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="20" res="A" tx_nbr="T1"><AUTHS hnet="HN1" auth_nbr="A1"/><MEM/><PAT/></TX></DOCUMENT>`
const e = parseEligibilityXml(eligXml)
if (e.status !== "eligible") throw new Error("expected eligible")
if (e.healthNetworkId !== "HN1") throw new Error("expected AUTHS hnet")
console.log("eligibility:", e.status, e.txNbr, e.healthNetworkId)

/** SOAP &lt;reply&gt; with entity-encoded inner DOCUMENT (production MediKredit shape). */
const soapEncoded = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns:submit-claimResponse><reply>&lt;?xml version = "1.0" standalone = "yes"?&gt;&lt;DOCUMENT version="r3.53"&gt;&lt;TX sp_bhf="1548972" tx_nbr="ELIG1" tx_cd="20" res="A" dt="20260413" tm="214539"&gt;&lt;NW pc_nbr="01" wks_nbr="001"/&gt;&lt;HB id="ELIG1"/&gt;&lt;AUTHS hnet="95720357176715"/&gt;&lt;MEM sname="Naidoo"&gt;&lt;PAT dep_cd="00" dob="19720731" fname="Rogers"/&gt;&lt;/MEM&gt;&lt;/TX&gt;&lt;/DOCUMENT&gt; </reply></ns:submit-claimResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`
const enc = parseEligibilityXml(soapEncoded)
if (enc.status !== "eligible" || enc.res !== "A") throw new Error(`encoded SOAP: expected eligible, got ${enc.status} res=${enc.res}`)
if (enc.healthNetworkId !== "95720357176715") throw new Error(`expected hnet, got ${enc.healthNetworkId}`)
console.log("encoded SOAP eligibility OK", enc.healthNetworkId)

const famXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="30" res="A"><PAT dep_cd="01"/><PAT dep_cd="02"/></TX></DOCUMENT>`
const f = parseFamilyEligibilityXml(famXml)
if (f.dependents.length !== 2) throw new Error("expected 2 PAT")
console.log("family PAT count:", f.dependents.length)

const claimXml = `<?xml version="1.0"?><DOCUMENT version="3.53"><TX tx_cd="21" res="A" tx_nbr="C1"><FIN gross="100" net="100"/><ITEM lin_num="1" status="A"><TAR><PROC tar_cd="0190"><TRMNT dt="20260409"/></PROC></TAR><FIN gross="100" net="100"/></ITEM></TX></DOCUMENT>`
const c = parseClaimXml(claimXml)
if (c.outcome !== "approved") throw new Error("expected approved")
console.log("claim:", c.outcome, c.itemStatuses.length, "items")

console.log("medikredit parse OK")
