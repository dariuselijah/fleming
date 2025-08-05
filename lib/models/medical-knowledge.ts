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