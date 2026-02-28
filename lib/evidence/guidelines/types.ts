export type GuidelineAdapterTier = "public" | "licensed"
export type GuidelineRegion = "US" | "UK" | "EU" | "GLOBAL"

export type GuidelineResult = {
  source: string
  sourceId: string
  title: string
  url?: string
  date?: string
  summary?: string
  region?: GuidelineRegion
  organization?: string
  studyType?: string
  evidenceLevel?: number
}

export type GuidelineSearchContext = {
  query: string
  maxResults: number
  regionPriority: GuidelineRegion
}

export interface GuidelineSourceAdapter {
  id: string
  name: string
  tier: GuidelineAdapterTier
  region: GuidelineRegion
  enabled(): boolean
  search(context: GuidelineSearchContext): Promise<GuidelineResult[]>
}
