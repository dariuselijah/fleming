/**
 * Live claim smoke test via CLINICAL_PROXY_URL (curl-equivalent fetch).
 * Run: CLINICAL_PROXY_URL=http://localhost:3001 npx ts-node --compiler-options '{"module":"commonjs"}' -r tsconfig-paths/register scripts/test-medikredit-claim-live.ts
 */
import { buildClaimDocument } from "../lib/medikredit/build-document"
import { parseClaimXml } from "../lib/medikredit/parse-response"

async function main() {
  const base = process.env.CLINICAL_PROXY_URL?.trim()?.replace(/\/$/, "")
  if (!base) {
    console.log("test-medikredit-claim-live: CLINICAL_PROXY_URL not set — skipping.")
    process.exit(0)
  }

  const xml = buildClaimDocument(
    {
      id: "live-test",
      name: "Rogers Naidoo",
      memberNumber: process.env.MEDIKREDIT_TEST_MEMBER ?? "123456789",
      idNumber: process.env.MEDIKREDIT_TEST_ID ?? "7207315800080",
      dependentCode: "00",
      medicalAidSchemeCode: process.env.MEDIKREDIT_TEST_PLAN ?? "631372",
      dateOfBirth: "1972-07-31",
      sex: "M",
    },
    {
      vendorId: process.env.MEDIKREDIT_TEST_VEND_ID ?? "PERKILY",
      bhfNumber: process.env.MEDIKREDIT_TEST_BHF ?? "1548972",
      hpcNumber: process.env.MEDIKREDIT_TEST_HPC ?? "1234567",
      groupPracticeNumber: process.env.MEDIKREDIT_TEST_GRP ?? "1234567",
      pcNumber: "01",
      worksNumber: "001",
      useTestProvider: true,
      extraSettings: {},
    },
    [
      {
        lineNumber: 1,
        tp: 2,
        tariffCode: "0190",
        icdCodes: ["J06.9"],
        grossAmount: 350,
        treatmentDate: new Date().toISOString().slice(0, 10),
        quantity: 1,
      },
    ]
  )

  if (/<TAR\b/i.test(xml)) {
    throw new Error("claim request must not include <TAR> wrapper (switch returns INVALID XML TAG)")
  }

  const res = await fetch(`${base}/api/medikredit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "claim", xmlData: xml }),
  })
  const body = (await res.json()) as { response?: string; error?: string; status?: string }
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  const raw = body.response ?? ""
  const parsed = parseClaimXml(raw)
  console.log("outcome:", parsed.outcome, "res:", parsed.res)
  console.log("RJ:", parsed.rejectionCode, parsed.rejectionDescription)
  console.log("hnet:", parsed.healthNetworkId, "tx:", parsed.txNbr)
  if (parsed.rejectionCode === "5337") {
    throw new Error(`still getting INVALID XML TAG — inspect generated XML:\n${xml}`)
  }
  console.log("medikredit claim live OK (structure accepted by switch)")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
