import { NextResponse } from "next/server"
import { getStudentPluginCatalog } from "@/lib/plugins/catalog"

export async function GET() {
  return NextResponse.json({
    plugins: getStudentPluginCatalog(),
    generatedAt: new Date().toISOString(),
  })
}
