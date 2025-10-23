import { AgentSelection, MedicalContext } from "./healthcare-agents"

export type MedicalDataSource = {
  id: string
  name: string
  type: 'database' | 'textbook' | 'guidelines' | 'research' | 'drug_database'
  apiEndpoint: string
  authentication: AuthenticationConfig
  capabilities: string[]
  specialties: string[]
}

export type AuthenticationConfig = {
  type: 'api_key' | 'oauth' | 'basic'
  key?: string
  username?: string
  password?: string
}

export type MedicalKnowledgeResult = {
  source: string
  title: string
  content: string
  evidenceLevel: 'A' | 'B' | 'C' | 'D'
  publicationDate?: string
  specialties: string[]
  capabilities: string[]
  url?: string
}

export type MedicalKnowledgeQuery = {
  query: string
  specialties: string[]
  capabilities: string[]
  evidenceLevel?: 'A' | 'B' | 'C' | 'D'
  maxResults?: number
}

// Medical Database Sources
export const MEDICAL_DATA_SOURCES: MedicalDataSource[] = [
  // Clinical Guidelines
  {
    id: 'uptodate',
    name: 'UpToDate',
    type: 'guidelines',
    apiEndpoint: 'https://api.uptodate.com/v1',
    authentication: { type: 'api_key', key: process.env.UPTODATE_API_KEY },
    capabilities: ['clinical_guidelines', 'treatment_protocols', 'diagnosis_algorithms'],
    specialties: ['all']
  },
  
  // Drug Information
  {
    id: 'micromedex',
    name: 'Micromedex',
    type: 'drug_database',
    apiEndpoint: 'https://api.micromedex.com/v1',
    authentication: { type: 'api_key', key: process.env.MICROMEDEX_API_KEY },
    capabilities: ['drug_interactions', 'dosing', 'adverse_effects', 'pharmacokinetics'],
    specialties: ['pharmacology', 'all']
  },
  
  // Medical Literature
  {
    id: 'pubmed',
    name: 'PubMed',
    type: 'research',
    apiEndpoint: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    authentication: { type: 'api_key', key: process.env.PUBMED_API_KEY },
    capabilities: ['medical_literature', 'clinical_trials', 'systematic_reviews'],
    specialties: ['all']
  },
  
  // Medical Textbooks
  {
    id: 'harrison_internal_medicine',
    name: 'Harrison\'s Principles of Internal Medicine',
    type: 'textbook',
    apiEndpoint: 'https://api.accessmedicine.com/v1',
    authentication: { type: 'api_key', key: process.env.ACCESSMEDICINE_API_KEY },
    capabilities: ['comprehensive_medical_knowledge', 'diagnosis', 'treatment'],
    specialties: ['internal_medicine', 'all']
  },
  
  // Specialty-specific databases
  {
    id: 'cardiology_guidelines',
    name: 'ACC/AHA Guidelines',
    type: 'guidelines',
    apiEndpoint: 'https://api.acc.org/v1',
    authentication: { type: 'api_key', key: process.env.ACC_API_KEY },
    capabilities: ['cardiology_guidelines', 'treatment_protocols'],
    specialties: ['cardiology']
  },
  
  {
    id: 'oncology_guidelines',
    name: 'NCCN Guidelines',
    type: 'guidelines',
    apiEndpoint: 'https://api.nccn.org/v1',
    authentication: { type: 'api_key', key: process.env.NCCN_API_KEY },
    capabilities: ['oncology_guidelines', 'cancer_treatment_protocols'],
    specialties: ['oncology']
  },
  
  {
    id: 'pediatrics_guidelines',
    name: 'AAP Guidelines',
    type: 'guidelines',
    apiEndpoint: 'https://api.aap.org/v1',
    authentication: { type: 'api_key', key: process.env.AAP_API_KEY },
    capabilities: ['pediatric_guidelines', 'child_health_protocols'],
    specialties: ['pediatrics']
  },
  
  {
    id: 'psychiatry_guidelines',
    name: 'APA Guidelines',
    type: 'guidelines',
    apiEndpoint: 'https://api.psychiatry.org/v1',
    authentication: { type: 'api_key', key: process.env.APA_API_KEY },
    capabilities: ['psychiatry_guidelines', 'mental_health_protocols'],
    specialties: ['psychiatry']
  }
]

export class MedicalKnowledgeConnector {
  private sources: Map<string, MedicalDataSource> = new Map()
  
  constructor() {
    MEDICAL_DATA_SOURCES.forEach(source => {
      this.sources.set(source.id, source)
    })
  }
  
  async queryMedicalKnowledge(
    query: MedicalKnowledgeQuery
  ): Promise<MedicalKnowledgeResult[]> {
    const relevantSources = this.findRelevantSources(query.specialties, query.capabilities)
    
    const results = await Promise.all(
      relevantSources.map(source => 
        this.querySource(source, query)
      )
    )
    
    return this.synthesizeResults(results.flat())
  }
  
  private findRelevantSources(specialties: string[], capabilities: string[]): MedicalDataSource[] {
    return Array.from(this.sources.values()).filter(source => {
      const specialtyMatch = source.specialties.includes('all') || 
        source.specialties.some(s => specialties.includes(s))
      const capabilityMatch = source.capabilities.some(c => capabilities.includes(c))
      return specialtyMatch && capabilityMatch
    })
  }
  
  private async querySource(source: MedicalDataSource, query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    // Implement specific API calls for each source
    switch (source.id) {
      case 'uptodate':
        return this.queryUpToDate(query)
      case 'micromedex':
        return this.queryMicromedex(query)
      case 'pubmed':
        return this.queryPubMed(query)
      case 'harrison_internal_medicine':
        return this.queryHarrison(query)
      case 'cardiology_guidelines':
        return this.queryCardiologyGuidelines(query)
      case 'oncology_guidelines':
        return this.queryOncologyGuidelines(query)
      case 'pediatrics_guidelines':
        return this.queryPediatricsGuidelines(query)
      case 'psychiatry_guidelines':
        return this.queryPsychiatryGuidelines(query)
      default:
        return this.queryGeneric(source, query)
    }
  }
  
  private async queryUpToDate(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    // Mock implementation - in real implementation, this would call UpToDate API
    return [{
      source: 'UpToDate',
      title: 'Clinical Guidelines for ' + query.query,
      content: 'Evidence-based clinical guidelines and treatment protocols.',
      evidenceLevel: 'A',
      specialties: query.specialties,
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryMicromedex(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    // Mock implementation - in real implementation, this would call Micromedex API
    return [{
      source: 'Micromedex',
      title: 'Drug Information for ' + query.query,
      content: 'Comprehensive drug information including interactions, dosing, and safety.',
      evidenceLevel: 'A',
      specialties: query.specialties,
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryPubMed(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    // Mock implementation - in real implementation, this would call PubMed API
    return [{
      source: 'PubMed',
      title: 'Latest Research on ' + query.query,
      content: 'Recent medical literature and clinical research findings.',
      evidenceLevel: 'B',
      specialties: query.specialties,
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryHarrison(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    // Mock implementation - in real implementation, this would call Harrison's API
    return [{
      source: 'Harrison\'s Internal Medicine',
      title: 'Comprehensive Medical Knowledge for ' + query.query,
      content: 'Comprehensive medical textbook information and clinical knowledge.',
      evidenceLevel: 'A',
      specialties: query.specialties,
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryCardiologyGuidelines(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    return [{
      source: 'ACC/AHA Guidelines',
      title: 'Cardiology Guidelines for ' + query.query,
      content: 'Latest cardiology guidelines and treatment protocols.',
      evidenceLevel: 'A',
      specialties: ['cardiology'],
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryOncologyGuidelines(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    return [{
      source: 'NCCN Guidelines',
      title: 'Oncology Guidelines for ' + query.query,
      content: 'Latest oncology guidelines and cancer treatment protocols.',
      evidenceLevel: 'A',
      specialties: ['oncology'],
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryPediatricsGuidelines(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    return [{
      source: 'AAP Guidelines',
      title: 'Pediatrics Guidelines for ' + query.query,
      content: 'Latest pediatrics guidelines and child health protocols.',
      evidenceLevel: 'A',
      specialties: ['pediatrics'],
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryPsychiatryGuidelines(query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    return [{
      source: 'APA Guidelines',
      title: 'Psychiatry Guidelines for ' + query.query,
      content: 'Latest psychiatry guidelines and mental health protocols.',
      evidenceLevel: 'A',
      specialties: ['psychiatry'],
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private async queryGeneric(source: MedicalDataSource, query: MedicalKnowledgeQuery): Promise<MedicalKnowledgeResult[]> {
    return [{
      source: source.name,
      title: 'Medical Information from ' + source.name,
      content: 'Medical information and guidelines from ' + source.name,
      evidenceLevel: 'B',
      specialties: query.specialties,
      capabilities: query.capabilities,
      publicationDate: new Date().toISOString()
    }]
  }
  
  private synthesizeResults(results: MedicalKnowledgeResult[]): MedicalKnowledgeResult[] {
    // Remove duplicates and sort by evidence level
    const uniqueResults = results.filter((result, index, self) => 
      index === self.findIndex(r => r.source === result.source && r.title === result.title)
    )
    
    return uniqueResults.sort((a, b) => {
      const evidenceLevelOrder = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 }
      return evidenceLevelOrder[b.evidenceLevel] - evidenceLevelOrder[a.evidenceLevel]
    })
  }
}

// Function to integrate medical knowledge with healthcare agents
export async function integrateMedicalKnowledge(
  query: string,
  context: MedicalContext,
  agentSelections: AgentSelection[]
): Promise<MedicalKnowledgeResult[]> {
  const knowledgeConnector = new MedicalKnowledgeConnector()
  
  const knowledgeQuery: MedicalKnowledgeQuery = {
    query,
    specialties: context.specialties,
    capabilities: context.requiredCapabilities,
    maxResults: 10
  }
  
  return await knowledgeConnector.queryMedicalKnowledge(knowledgeQuery)
}

export interface DrugInteraction {
  drug1: string
  drug2: string
  severity: 'minor' | 'moderate' | 'major' | 'contraindicated'
  description: string
  recommendation: string
  source?: string
}

/**
 * Drug Interaction API Connector
 * Supports multiple drug interaction databases via API
 */
class DrugInteractionChecker {
  private apiKey?: string
  private apiType: 'drugbank' | 'rxnorm' | 'fda'

  constructor(apiType: 'drugbank' | 'rxnorm' | 'fda' = 'rxnorm') {
    this.apiType = apiType
    // Get API key from environment based on type
    switch (apiType) {
      case 'drugbank':
        this.apiKey = process.env.DRUGBANK_API_KEY
        break
      case 'rxnorm':
        // RxNorm/RxNav is free and doesn't require API key
        this.apiKey = undefined
        break
      case 'fda':
        // FDA openFDA API is free
        this.apiKey = process.env.FDA_API_KEY
        break
    }
  }

  /**
   * Check for drug interactions using RxNorm Interaction API
   * NOTE: RxNorm Drug Interaction API was DISCONTINUED on January 2, 2024
   * This method now falls back to FDA openFDA API
   * https://lhncbc.nlm.nih.gov/RxNav/APIs/InteractionAPIs.html
   */
  private async checkInteractionsRxNorm(medications: string[]): Promise<DrugInteraction[]> {
    console.warn('⚠️ RxNorm Drug Interaction API was discontinued on January 2, 2024')
    console.log('→ Falling back to FDA openFDA API for drug interactions')

    // Fallback to FDA API
    return this.checkInteractionsFDA(medications)
  }

  /**
   * Get RxCUI for a medication name with database caching
   */
  private async getRxCUI(medicationName: string): Promise<{ name: string; rxcui: string | null }> {
    const normalized = medicationName.toLowerCase().trim()

    try {
      // Try cache first (if in browser/edge runtime, skip cache)
      if (typeof window === 'undefined') {
        const cached = await this.getRxCUIFromCache(normalized)
        if (cached) {
          console.log(`✓ RxCUI cache hit for: ${medicationName}`)
          return { name: medicationName, rxcui: cached }
        }
      }

      // Cache miss - call API
      console.log(`⊗ RxCUI cache miss for: ${medicationName}, calling API...`)
      const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(medicationName)}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.idGroup?.rxnormId?.[0]) {
        const rxcui = data.idGroup.rxnormId[0]

        // Save to cache for next time
        if (typeof window === 'undefined') {
          await this.saveRxCUIToCache(medicationName, normalized, rxcui)
        }

        return { name: medicationName, rxcui }
      }

      return { name: medicationName, rxcui: null }
    } catch (error) {
      console.error(`Error getting RxCUI for ${medicationName}:`, error)
      return { name: medicationName, rxcui: null }
    }
  }

  /**
   * Get RxCUI from database cache
   */
  private async getRxCUIFromCache(normalizedName: string): Promise<string | null> {
    try {
      // Import Supabase client
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data, error } = await supabase
        .from('drug_rxcui_cache')
        .select('rxcui')
        .eq('drug_name_normalized', normalizedName)
        .eq('source', 'rxnorm')
        .single()

      if (error || !data) {
        return null
      }

      return data.rxcui
    } catch (error) {
      console.error('Error reading from RxCUI cache:', error)
      return null
    }
  }

  /**
   * Save RxCUI to database cache
   */
  private async saveRxCUIToCache(
    drugName: string,
    normalizedName: string,
    rxcui: string
  ): Promise<void> {
    try {
      // Import Supabase client
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const supabase = createClient(supabaseUrl, supabaseKey)

      const { error } = await supabase
        .from('drug_rxcui_cache')
        .upsert({
          drug_name: drugName,
          drug_name_normalized: normalizedName,
          rxcui,
          source: 'rxnorm',
          last_verified_at: new Date().toISOString()
        }, {
          onConflict: 'drug_name_normalized,source'
        })

      if (error) {
        console.error('Error saving to RxCUI cache:', error)
      } else {
        console.log(`✓ Saved RxCUI to cache: ${drugName} → ${rxcui}`)
      }
    } catch (error) {
      console.error('Error saving to RxCUI cache:', error)
    }
  }

  /**
   * Check for drug interactions using DrugBank API
   * https://docs.drugbank.com/v1/
   * Requires API key (paid service)
   */
  private async checkInteractionsDrugBank(medications: string[]): Promise<DrugInteraction[]> {
    if (!this.apiKey) {
      console.warn('DrugBank API key not configured. Falling back to RxNorm.')
      return this.checkInteractionsRxNorm(medications)
    }

    try {
      // DrugBank API implementation would go here
      // This requires a paid subscription
      const interactions: DrugInteraction[] = []

      for (let i = 0; i < medications.length; i++) {
        for (let j = i + 1; j < medications.length; j++) {
          const url = `https://api.drugbank.com/v1/ddi?drug1=${encodeURIComponent(medications[i])}&drug2=${encodeURIComponent(medications[j])}`

          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Accept': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()

            if (data.interactions && data.interactions.length > 0) {
              for (const interaction of data.interactions) {
                interactions.push({
                  drug1: medications[i],
                  drug2: medications[j],
                  severity: interaction.severity?.toLowerCase() || 'moderate',
                  description: interaction.description || '',
                  recommendation: interaction.recommendation || '',
                  source: 'DrugBank'
                })
              }
            }
          }
        }
      }

      return interactions
    } catch (error) {
      console.error('Error checking DrugBank interactions:', error)
      return []
    }
  }

  /**
   * Check for drug interactions using FDA openFDA API
   * https://open.fda.gov/apis/drug/
   * Free API, no key required
   */
  private async checkInteractionsFDA(medications: string[]): Promise<DrugInteraction[]> {
    if (medications.length < 2) return []

    try {
      const interactions: DrugInteraction[] = []
      console.log(`🔍 Checking FDA drug labels for ${medications.length} medications`)

      for (const med of medications) {
        const url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(med)}"&limit=1`
        console.log(`  → Fetching FDA label for: ${med}`)

        const response = await fetch(url)
        if (!response.ok) {
          console.warn(`    FDA API returned ${response.status} for ${med}`)
          continue
        }

        const data = await response.json()

        if (data.results?.[0]?.drug_interactions) {
          const interactionTexts = data.results[0].drug_interactions
          const fullInteractionText = Array.isArray(interactionTexts)
            ? interactionTexts.join(' ').toLowerCase()
            : String(interactionTexts).toLowerCase()

          // Parse interaction text to find mentions of other medications
          const otherMeds = medications.filter(m => m !== med)
          for (const otherMed of otherMeds) {
            const otherMedLower = otherMed.toLowerCase()

            if (fullInteractionText.includes(otherMedLower)) {
              // Try to extract relevant context around the mention
              const contextStart = Math.max(0, fullInteractionText.indexOf(otherMedLower) - 100)
              const contextEnd = Math.min(fullInteractionText.length, fullInteractionText.indexOf(otherMedLower) + otherMedLower.length + 200)
              const context = fullInteractionText.substring(contextStart, contextEnd).trim()

              // Determine severity from keywords
              let severity: 'minor' | 'moderate' | 'major' | 'contraindicated' = 'moderate'
              if (context.includes('contraindicated') || context.includes('should not')) {
                severity = 'contraindicated'
              } else if (context.includes('serious') || context.includes('severe') || context.includes('major')) {
                severity = 'major'
              } else if (context.includes('minor') || context.includes('may')) {
                severity = 'minor'
              }

              console.log(`    ⚠️ Interaction found: ${med} + ${otherMed} (${severity})`)

              // Avoid duplicate interactions (A+B is same as B+A)
              const alreadyExists = interactions.some(i =>
                (i.drug1 === med && i.drug2 === otherMed) ||
                (i.drug1 === otherMed && i.drug2 === med)
              )

              if (!alreadyExists) {
                interactions.push({
                  drug1: med,
                  drug2: otherMed,
                  severity,
                  description: context || `Interaction found in FDA label for ${med}`,
                  recommendation: 'Review complete drug label and consult healthcare provider. Consider alternative therapy if interaction is significant.',
                  source: 'FDA openFDA'
                })
              }
            }
          }
        } else {
          console.log(`    ℹ️ No interaction data found in FDA label for ${med}`)
        }
      }

      if (interactions.length === 0) {
        console.log(`✅ No interactions found between these medications in FDA labels`)
      } else {
        console.log(`✅ Found ${interactions.length} interaction(s) in FDA labels`)
      }

      return interactions
    } catch (error) {
      console.error('Error checking FDA interactions:', error)
      return []
    }
  }

  /**
   * Map various severity formats to standard levels
   */
  private mapSeverity(severity?: string): 'minor' | 'moderate' | 'major' | 'contraindicated' {
    if (!severity) return 'moderate'

    const severityLower = severity.toLowerCase()

    if (severityLower.includes('contraindicated') || severityLower.includes('high')) {
      return 'contraindicated'
    }
    if (severityLower.includes('major') || severityLower.includes('severe')) {
      return 'major'
    }
    if (severityLower.includes('minor') || severityLower.includes('low')) {
      return 'minor'
    }
    return 'moderate'
  }

  /**
   * Main method to check drug interactions
   */
  async checkInteractions(medications: string[]): Promise<DrugInteraction[]> {
    if (!medications || medications.length < 2) {
      return []
    }

    // Route to appropriate API based on configuration
    switch (this.apiType) {
      case 'drugbank':
        return this.checkInteractionsDrugBank(medications)
      case 'fda':
        return this.checkInteractionsFDA(medications)
      case 'rxnorm':
      default:
        return this.checkInteractionsRxNorm(medications)
    }
  }
}

/**
 * Check for potential drug interactions in patient's medication list
 * Uses FDA openFDA API by default (free, no API key required)
 * NOTE: RxNorm Drug Interaction API was discontinued on January 2, 2024
 */
export async function checkDrugInteractions(medications: string[]): Promise<DrugInteraction[]> {
  if (!medications || medications.length < 2) {
    return []
  }

  // Use FDA openFDA API by default (free, maintained by FDA)
  const checker = new DrugInteractionChecker('fda')
  return await checker.checkInteractions(medications)
}

/**
 * Check if a proposed new medication would interact with patient's current medications
 */
export async function checkNewMedicationInteractions(
  currentMedications: string[],
  proposedMedication: string
): Promise<DrugInteraction[]> {
  const allMedications = [...currentMedications, proposedMedication]
  return checkDrugInteractions(allMedications)
} 