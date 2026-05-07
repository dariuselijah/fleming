import { PatientScanMobile } from "./patient-scan-mobile"

export default async function PatientScanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PatientScanMobile token={token} />
}
