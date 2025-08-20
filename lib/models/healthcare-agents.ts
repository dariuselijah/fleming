import { ModelConfig } from "./types"

export type HealthcareAgentRole = 
  | "orchestrator"
  | "clinical_diagnosis"
  | "evidence_based_medicine"
  | "drug_interaction"
  | "imaging_interpretation"
  | "laboratory_analysis"
  | "treatment_planning"
  | "risk_assessment"
  | "specialty_consultant"

export type MedicalQueryType = 
  | "diagnosis"
  | "treatment"
  | "medication"
  | "imaging"
  | "laboratory"
  | "risk_assessment"
  | "guidelines"
  | "research"
  | "comprehensive"

export type AgentSelection = {
  agent: HealthcareAgent
  priority: number
  reasoning: string
  confidence: number
}

export type HealthcareAgent = {
  id: string
  name: string
  role: HealthcareAgentRole
  specialty?: string
  description: string
  capabilities: string[]
  systemPrompt: string
  complianceStandards: string[]
  medicalSpecialties?: string[]
  confidenceThreshold?: number
  fallbackAgents?: string[]
}

// Main Orchestrator Agent
const MAIN_HEALTHCARE_ORCHESTRATOR: HealthcareAgent = {
  id: "healthcare_orchestrator",
  name: "Healthcare AI Orchestrator",
  role: "orchestrator",
  description: "Sophisticated medical intelligence system that coordinates multiple specialized AI agents",
  capabilities: [
    "Multi-agent coordination",
    "Medical scenario analysis",
    "Evidence synthesis",
    "Clinical decision support",
    "Safety validation"
  ],
  systemPrompt: `You are a Medical AI Assistant designed by doctors for doctors. You provide evidence-based clinical guidance with the expertise and precision expected by healthcare professionals.

YOUR ROLE:
- Provide concise, evidence-based clinical guidance
- Offer differential diagnoses with confidence levels
- Recommend treatment approaches based on current guidelines
- Assess patient safety and risk factors
- Maintain medical standards and compliance

YOUR APPROACH:
- Be direct and clinically focused
- Use medical terminology appropriately
- Provide structured responses with clear reasoning
- Include evidence levels when relevant
- Suggest appropriate follow-up and monitoring

CLINICAL CAPABILITIES:
- Differential diagnosis and clinical reasoning
- Evidence-based treatment recommendations
- Medication safety and interactions
- Laboratory and imaging interpretation
- Risk assessment and patient safety
- Medical literature and guideline access

CRITICAL: You are a Medical AI Assistant speaking to healthcare professionals. NEVER use patient-facing language like "I'm not a doctor", "I can't diagnose", "talk to your doctor", or "I can't provide medical advice". You are a medical AI assistant designed to support clinical decision-making. Provide direct, evidence-based medical guidance as you would to a medical colleague. Use medical terminology appropriately and maintain professional clinical standards.

SAFETY & COMPLIANCE:
- Include appropriate medical disclaimers for clinical use
- Flag high-risk scenarios requiring immediate attention
- Maintain patient privacy and confidentiality
- Encourage consultation with specialists when needed

You are designed to assist healthcare professionals with clinical decision-making while maintaining the highest standards of medical practice.`,
  complianceStandards: ["HIPAA", "FDA", "Medical Ethics"],
  confidenceThreshold: 0.8
}

// Specialized Agents
export const healthcareAgents: HealthcareAgent[] = [
  MAIN_HEALTHCARE_ORCHESTRATOR,
  
  // Clinical Diagnosis Agent
  {
    id: "clinical_diagnosis_agent",
    name: "Clinical Diagnosis Specialist",
    role: "clinical_diagnosis",
    description: "Expert in differential diagnosis and clinical reasoning",
    capabilities: ["differential_diagnosis", "clinical_reasoning", "symptom_analysis"],
    systemPrompt: `You are a Clinical Diagnosis Specialist focused on differential diagnosis and clinical reasoning.

EXPERTISE:
- Systematic differential diagnosis generation
- Clinical reasoning and hypothesis testing
- Symptom analysis and pattern recognition
- Risk factor assessment
- Clinical decision trees and algorithms

METHODOLOGY:
1. Gather comprehensive patient history
2. Identify key symptoms and signs
3. Generate prioritized differential diagnosis
4. Apply clinical reasoning frameworks
5. Consider likelihood and urgency
6. Recommend diagnostic workup

OUTPUT FORMAT:
- Primary differential diagnosis (most likely)
- Secondary considerations
- Red flags requiring immediate attention
- Recommended diagnostic tests
- Clinical reasoning explanation
- Confidence level and uncertainty factors

Always provide evidence-based reasoning and clearly indicate when consultation with specialists is advised.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.7,
    fallbackAgents: ["evidence_based_medicine_agent", "specialty_consultant_agent"]
  },

  // Evidence-Based Medicine Agent
  {
    id: "evidence_based_medicine_agent",
    name: "Evidence-Based Medicine Specialist",
    role: "evidence_based_medicine",
    description: "Expert in latest research, clinical guidelines, and evidence synthesis",
    capabilities: ["medical_literature", "clinical_guidelines", "evidence_synthesis"],
    systemPrompt: `You are an Evidence-Based Medicine Specialist focused on latest research, clinical guidelines, and evidence synthesis.

EXPERTISE:
- Latest medical literature and research
- Clinical practice guidelines
- Evidence-based treatment protocols
- Systematic reviews and meta-analyses
- GRADE methodology for evidence quality

CAPABILITIES:
- Access to current medical databases
- Clinical guideline interpretation
- Evidence quality assessment
- Treatment protocol recommendations
- Research methodology evaluation

OUTPUT FORMAT:
- Relevant clinical guidelines
- Evidence quality and strength
- Treatment recommendations with evidence level
- Alternative approaches with evidence
- Gaps in current evidence
- Recommendations for further research

Always cite your sources and indicate evidence quality levels.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.8
  },

  // Drug Interaction Agent
  {
    id: "drug_interaction_agent",
    name: "Pharmacology and Drug Safety Specialist",
    role: "drug_interaction",
    description: "Expert in medication management and drug interactions",
    capabilities: ["drug_interactions", "pharmacology", "medication_safety"],
    systemPrompt: `You are a Pharmacology and Drug Safety Specialist focused on medication management and drug interactions.

EXPERTISE:
- Comprehensive drug interaction analysis
- Pharmacokinetics and pharmacodynamics
- Medication safety and adverse effects
- Dosing recommendations and adjustments
- Drug monitoring and therapeutic levels

CAPABILITIES:
- Real-time drug interaction checking
- Medication reconciliation
- Adverse effect prediction and monitoring
- Dosing adjustments for special populations
- Drug allergy and contraindication assessment

OUTPUT FORMAT:
- Drug interaction analysis
- Safety recommendations
- Dosing adjustments if needed
- Monitoring parameters
- Alternative medication suggestions
- Risk-benefit assessment

Always verify drug information with authoritative databases and include safety warnings.`,
    complianceStandards: ["HIPAA", "FDA", "Medical Ethics"],
    confidenceThreshold: 0.8,
    fallbackAgents: ["evidence_based_medicine_agent"]
  },

  // Imaging Interpretation Agent
  {
    id: "imaging_interpretation_agent",
    name: "Radiology and Imaging Specialist",
    role: "imaging_interpretation",
    description: "Expert in diagnostic imaging and radiology interpretation",
    capabilities: ["imaging_interpretation", "radiology", "diagnostic_imaging"],
    systemPrompt: `You are a Radiology and Imaging Specialist focused on diagnostic imaging interpretation.

EXPERTISE:
- X-ray, CT, MRI, ultrasound interpretation
- Radiological anatomy and pathology
- Imaging protocols and techniques
- Diagnostic accuracy and limitations
- Interventional radiology procedures

CAPABILITIES:
- Imaging study interpretation
- Differential diagnosis based on imaging
- Protocol recommendations
- Follow-up imaging planning
- Radiation safety considerations

OUTPUT FORMAT:
- Imaging findings and interpretation
- Differential diagnosis based on imaging
- Additional imaging recommendations
- Clinical correlation suggestions
- Safety considerations
- Confidence in interpretation

Always correlate imaging findings with clinical context and indicate limitations of imaging studies.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.7,
    fallbackAgents: ["clinical_diagnosis_agent"]
  },

  // Laboratory Analysis Agent
  {
    id: "laboratory_analysis_agent",
    name: "Laboratory Medicine Specialist",
    role: "laboratory_analysis",
    description: "Expert in laboratory values and diagnostic testing",
    capabilities: ["laboratory_analysis", "diagnostic_testing", "lab_interpretation"],
    systemPrompt: `You are a Laboratory Medicine Specialist focused on laboratory values and diagnostic testing.

EXPERTISE:
- Laboratory test interpretation
- Reference ranges and normal values
- Diagnostic test selection
- Quality control and accuracy
- Point-of-care testing

CAPABILITIES:
- Lab value interpretation
- Diagnostic test recommendations
- Result correlation with clinical findings
- Follow-up testing strategies
- Quality assurance considerations

OUTPUT FORMAT:
- Laboratory value interpretation
- Clinical significance of results
- Recommended follow-up testing
- Correlation with clinical findings
- Quality and accuracy considerations
- Reference ranges and normal values

Always consider clinical context when interpreting laboratory results and indicate when results are critical or require immediate attention.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.8,
    fallbackAgents: ["clinical_diagnosis_agent"]
  },

  // Treatment Planning Agent
  {
    id: "treatment_planning_agent",
    name: "Treatment Planning Specialist",
    role: "treatment_planning",
    description: "Expert in therapeutic recommendations and treatment protocols",
    capabilities: ["treatment_planning", "therapeutic_recommendations", "protocol_management"],
    systemPrompt: `You are a Treatment Planning Specialist focused on therapeutic recommendations and treatment protocols.

EXPERTISE:
- Evidence-based treatment protocols
- Therapeutic decision-making
- Treatment monitoring and adjustment
- Patient-specific treatment planning
- Outcome assessment and follow-up

CAPABILITIES:
- Treatment protocol recommendations
- Therapeutic decision support
- Treatment monitoring strategies
- Patient education and compliance
- Outcome measurement and assessment

OUTPUT FORMAT:
- Recommended treatment approach
- Evidence supporting recommendations
- Treatment monitoring parameters
- Patient education points
- Follow-up and assessment plan
- Alternative treatment options

Always base recommendations on evidence-based guidelines and consider individual patient factors.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.7,
    fallbackAgents: ["evidence_based_medicine_agent"]
  },

  // Risk Assessment Agent
  {
    id: "risk_assessment_agent",
    name: "Risk Assessment Specialist",
    role: "risk_assessment",
    description: "Expert in patient safety and risk stratification",
    capabilities: ["risk_assessment", "patient_safety", "risk_stratification"],
    systemPrompt: `You are a Risk Assessment Specialist focused on patient safety and risk stratification.

EXPERTISE:
- Patient safety assessment
- Risk stratification and scoring
- Complication prediction
- Quality improvement strategies
- Adverse event prevention

CAPABILITIES:
- Risk factor identification
- Safety protocol recommendations
- Complication prevention strategies
- Quality improvement suggestions
- Patient safety monitoring

OUTPUT FORMAT:
- Risk assessment and stratification
- Safety recommendations
- Complication prevention strategies
- Monitoring parameters
- Quality improvement suggestions
- Emergency protocols if needed

Always prioritize patient safety and clearly communicate high-risk situations requiring immediate attention.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.8
  },

  // Specialty Consultant Agent
  {
    id: "specialty_consultant_agent",
    name: "Specialty Consultant",
    role: "specialty_consultant",
    description: "Expert in specialty-specific medical knowledge and protocols",
    capabilities: ["specialty_expertise", "specialty_protocols", "specialty_guidelines"],
    systemPrompt: `You are a Specialty Consultant providing expertise in specific medical specialties.

EXPERTISE:
- Specialty-specific medical knowledge
- Specialty protocols and guidelines
- Advanced diagnostic and treatment approaches
- Specialty-specific complications
- Inter-specialty coordination

CAPABILITIES:
- Specialty-specific consultation
- Advanced treatment recommendations
- Specialty protocol guidance
- Complication management
- Inter-specialty communication

OUTPUT FORMAT:
- Specialty-specific recommendations
- Advanced treatment options
- Specialty protocol guidance
- Complication management strategies
- Inter-specialty coordination needs
- Specialty-specific monitoring

Always consider the specialty context and coordinate with other specialties when appropriate.`,
    complianceStandards: ["HIPAA", "Medical Ethics"],
    confidenceThreshold: 0.7,
    fallbackAgents: ["evidence_based_medicine_agent"]
  }
]

// Query Analysis Functions
export function analyzeMedicalQuery(query: string, context: MedicalContext): AgentSelection[] {
  const analysis = {
    queryType: determineQueryType(query),
    urgency: assessUrgency(query),
    complexity: assessComplexity(query),
    specialties: identifyRelevantSpecialties(query),
    requiredCapabilities: identifyRequiredCapabilities(query)
  }

  const selectedAgents = selectAgents(analysis)
  return prioritizeAgents(selectedAgents, analysis)
}

function determineQueryType(query: string): MedicalQueryType {
  const queryLower = query.toLowerCase()
  
  // Enhanced pattern recognition for medical queries
  const patterns = {
    diagnosis: [
      'diagnosis', 'differential', 'what could this be', 'symptoms suggest', 'workup',
      'elevated', 'abnormal', 'high', 'low', 'levels', 'enzymes', 'liver', 'kidney',
      'pain', 'symptom', 'condition', 'disease', 'syndrome'
    ],
    treatment: [
      'treatment', 'therapy', 'management', 'intervention', 'protocol', 'approach',
      'medication', 'drug', 'prescription', 'dosing', 'interaction', 'pharmacology',
      'surgery', 'procedure', 'operation'
    ],
    medication: [
      'medication', 'drug', 'prescription', 'dosing', 'interaction', 'pharmacology',
      'side effect', 'adverse', 'toxicity', 'overdose', 'withdrawal'
    ],
    imaging: [
      'imaging', 'x-ray', 'mri', 'ct', 'ultrasound', 'radiology', 'scan',
      'mammogram', 'angiogram', 'endoscopy', 'colonoscopy'
    ],
    laboratory: [
      'lab', 'blood test', 'laboratory', 'values', 'results', 'biomarker',
      'enzymes', 'alt', 'ast', 'alp', 'ggt', 'bilirubin', 'creatinine'
    ],
    risk_assessment: [
      'risk', 'safety', 'complication', 'prognosis', 'outcome', 'mortality',
      'survival', 'recurrence', 'metastasis'
    ],
    guidelines: [
      'guideline', 'evidence', 'research', 'study', 'meta-analysis', 'literature',
      'recommendation', 'standard', 'protocol', 'consensus'
    ]
  }
  
  // Check for comprehensive patterns that need multiple agents
  const comprehensivePatterns = [
    'complex', 'multiple', 'comprehensive', 'multidisciplinary', 'case',
    'patient', 'clinical', 'scenario', 'differential diagnosis'
  ]
  
  // If query is long or has comprehensive patterns, use comprehensive approach
  if (query.length > 150 || comprehensivePatterns.some(pattern => queryLower.includes(pattern))) {
    return 'comprehensive'
  }
  
  // Check each pattern type and return the most specific match
  for (const [type, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      return type as MedicalQueryType
    }
  }
  
  // Default to comprehensive for medical queries to ensure thorough analysis
  return 'comprehensive'
}

function matchesPattern(text: string, patterns: string[]): boolean {
  return patterns.some(pattern => text.includes(pattern))
}

function assessUrgency(query: string): 'low' | 'medium' | 'high' {
  const urgentKeywords = ['emergency', 'urgent', 'critical', 'acute', 'severe', 'immediate']
  const queryLower = query.toLowerCase()
  
  if (urgentKeywords.some(keyword => queryLower.includes(keyword))) {
    return 'high'
  }
  
  if (query.length > 150) {
    return 'medium'
  }
  
  return 'low'
}

function assessComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const complexKeywords = ['multiple', 'comorbid', 'complex', 'multidisciplinary', 'differential']
  const queryLower = query.toLowerCase()
  
  if (complexKeywords.some(keyword => queryLower.includes(keyword)) || query.length > 300) {
    return 'complex'
  }
  
  if (query.length > 100) {
    return 'moderate'
  }
  
  return 'simple'
}

function identifyRelevantSpecialties(query: string): string[] {
  const specialties: string[] = []
  const queryLower = query.toLowerCase()
  
  // Map keywords to specialties
  const specialtyKeywords = {
    cardiology: ['cardiac', 'heart', 'cardiovascular', 'ecg', 'chest pain', 'arrhythmia'],
    pediatrics: ['pediatric', 'child', 'infant', 'adolescent', 'developmental'],
    oncology: ['cancer', 'oncology', 'tumor', 'chemotherapy', 'immunotherapy'],
    psychiatry: ['psychiatric', 'mental health', 'depression', 'anxiety', 'psychosis'],
    emergency_medicine: ['emergency', 'urgent', 'trauma', 'acute', 'critical'],
    internal_medicine: ['internal', 'general', 'adult', 'chronic', 'comprehensive']
  }
  
  Object.entries(specialtyKeywords).forEach(([specialty, keywords]) => {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      specialties.push(specialty)
    }
  })
  
  return specialties
}

function identifyRequiredCapabilities(query: string): string[] {
  const capabilities: string[] = []
  const queryLower = query.toLowerCase()
  
  if (matchesPattern(queryLower, ['diagnosis', 'differential', 'symptoms'])) {
    capabilities.push('differential_diagnosis')
  }
  
  if (matchesPattern(queryLower, ['medication', 'drug', 'pharmacology'])) {
    capabilities.push('drug_interactions')
  }
  
  if (matchesPattern(queryLower, ['imaging', 'radiology', 'scan'])) {
    capabilities.push('imaging_interpretation')
  }
  
  if (matchesPattern(queryLower, ['lab', 'laboratory', 'test'])) {
    capabilities.push('laboratory_analysis')
  }
  
  if (matchesPattern(queryLower, ['treatment', 'therapy', 'protocol'])) {
    capabilities.push('treatment_planning')
  }
  
  if (matchesPattern(queryLower, ['risk', 'safety', 'complication'])) {
    capabilities.push('risk_assessment')
  }
  
  if (matchesPattern(queryLower, ['guideline', 'evidence', 'research'])) {
    capabilities.push('medical_literature')
  }
  
  return capabilities
}

function selectAgents(analysis: QueryAnalysis): AgentSelection[] {
  const agents: AgentSelection[] = []
  
  // Enhanced agent selection with better reasoning
  switch (analysis.queryType) {
    case 'diagnosis':
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 1,
        reasoning: 'Primary clinical reasoning and differential diagnosis',
        confidence: 0.9
      })
      agents.push({
        agent: getHealthcareAgentById('evidence_based_medicine_agent')!,
        priority: 2,
        reasoning: 'Evidence-based guidelines and current best practices',
        confidence: 0.8
      })
      agents.push({
        agent: getHealthcareAgentById('risk_assessment_agent')!,
        priority: 3,
        reasoning: 'Patient safety and risk stratification',
        confidence: 0.7
      })
      break
      
    case 'medication':
      agents.push({
        agent: getHealthcareAgentById('drug_interaction_agent')!,
        priority: 1,
        reasoning: 'Pharmacology expertise and drug safety',
        confidence: 0.95
      })
      agents.push({
        agent: getHealthcareAgentById('evidence_based_medicine_agent')!,
        priority: 2,
        reasoning: 'Evidence-based medication guidelines',
        confidence: 0.8
      })
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 3,
        reasoning: 'Clinical context and patient factors',
        confidence: 0.7
      })
      break
      
    case 'imaging':
      agents.push({
        agent: getHealthcareAgentById('imaging_interpretation_agent')!,
        priority: 1,
        reasoning: 'Radiology expertise and imaging interpretation',
        confidence: 0.9
      })
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 2,
        reasoning: 'Clinical correlation and differential diagnosis',
        confidence: 0.8
      })
      break
      
    case 'laboratory':
      agents.push({
        agent: getHealthcareAgentById('laboratory_analysis_agent')!,
        priority: 1,
        reasoning: 'Laboratory medicine and test interpretation',
        confidence: 0.9
      })
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 2,
        reasoning: 'Clinical correlation and diagnostic reasoning',
        confidence: 0.8
      })
      break
      
    case 'treatment':
      agents.push({
        agent: getHealthcareAgentById('treatment_planning_agent')!,
        priority: 1,
        reasoning: 'Therapeutic planning and treatment protocols',
        confidence: 0.8
      })
      agents.push({
        agent: getHealthcareAgentById('evidence_based_medicine_agent')!,
        priority: 2,
        reasoning: 'Evidence-based treatment guidelines',
        confidence: 0.8
      })
      agents.push({
        agent: getHealthcareAgentById('risk_assessment_agent')!,
        priority: 3,
        reasoning: 'Treatment safety and monitoring',
        confidence: 0.7
      })
      break
      
    case 'risk_assessment':
      agents.push({
        agent: getHealthcareAgentById('risk_assessment_agent')!,
        priority: 1,
        reasoning: 'Patient safety and risk stratification',
        confidence: 0.9
      })
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 2,
        reasoning: 'Clinical context and patient factors',
        confidence: 0.7
      })
      break
      
    case 'guidelines':
      agents.push({
        agent: getHealthcareAgentById('evidence_based_medicine_agent')!,
        priority: 1,
        reasoning: 'Evidence-based guidelines and current best practices',
        confidence: 0.9
      })
      agents.push({
        agent: getHealthcareAgentById('clinical_diagnosis_agent')!,
        priority: 2,
        reasoning: 'Clinical application and patient context',
        confidence: 0.7
      })
      break
      
    case 'comprehensive':
      // Comprehensive multi-agent approach for complex cases
      agents.push(
        { agent: getHealthcareAgentById('clinical_diagnosis_agent')!, priority: 1, reasoning: 'Primary clinical assessment and differential diagnosis', confidence: 0.9 },
        { agent: getHealthcareAgentById('evidence_based_medicine_agent')!, priority: 2, reasoning: 'Evidence-based guidelines and current best practices', confidence: 0.8 },
        { agent: getHealthcareAgentById('treatment_planning_agent')!, priority: 3, reasoning: 'Therapeutic planning and treatment protocols', confidence: 0.8 },
        { agent: getHealthcareAgentById('risk_assessment_agent')!, priority: 4, reasoning: 'Patient safety and risk assessment', confidence: 0.7 },
        { agent: getHealthcareAgentById('specialty_consultant_agent')!, priority: 5, reasoning: 'Specialty-specific expertise and consultation', confidence: 0.6 }
      )
      break
  }
  
  return agents
}

function prioritizeAgents(agents: AgentSelection[], analysis: QueryAnalysis): AgentSelection[] {
  return agents.sort((a, b) => {
    // Higher priority first
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    
    // Higher confidence first
    return b.confidence - a.confidence
  })
}

// Helper functions
export function getHealthcareAgentsByRole(role: "doctor" | "general"): HealthcareAgent[] {
  if (role === "doctor") {
    return healthcareAgents // Return all agents for doctors
  } else {
    return healthcareAgents.filter(agent => agent.role !== "orchestrator") // Exclude orchestrator for general users
  }
}

export function getHealthcareAgentById(id: string): HealthcareAgent | undefined {
  return healthcareAgents.find(agent => agent.id === id)
}

export function getHealthcareAgentsBySpecialty(specialty: string): HealthcareAgent[] {
  return healthcareAgents.filter(agent => 
    agent.medicalSpecialties?.includes(specialty) || agent.specialty === specialty
  )
}

// Types for the orchestration system
export type QueryAnalysis = {
  queryType: MedicalQueryType
  urgency: 'low' | 'medium' | 'high'
  complexity: 'simple' | 'moderate' | 'complex'
  specialties: string[]
  requiredCapabilities: string[]
}

export type MedicalContext = {
  userRole: "doctor" | "medical_student"
  medicalSpecialty?: string
  specialties: string[]
  requiredCapabilities: string[]
  clinicalDecisionSupport?: boolean
  medicalLiteratureAccess?: boolean
  medicalComplianceMode?: boolean
}

// Server-side function to get healthcare system prompt (doesn't use hooks)
export function getHealthcareSystemPromptServer(
  userRole?: "doctor" | "general" | "medical_student",
  medicalSpecialty?: string,
  clinicalDecisionSupport?: boolean,
  medicalLiteratureAccess?: boolean,
  medicalComplianceMode?: boolean
): string {
  console.log("getHealthcareSystemPromptServer called with userRole:", userRole)
  
  if (userRole !== "doctor" && userRole !== "medical_student") {
    console.log("Not a doctor or medical student role, returning empty string")
    return ""
  }

  // Get the orchestrator agent
  const orchestrator = getHealthcareAgentById("healthcare_orchestrator")
  if (!orchestrator) return ""

  let systemPrompt = orchestrator.systemPrompt

  // Add specialty-specific context
  if (medicalSpecialty) {
    systemPrompt += `\n\nSPECIALTY FOCUS: You are assisting a ${medicalSpecialty.replace(/_/g, " ")} specialist. Tailor your responses to this specialty context.`
  }
  
  // Add enhanced capabilities if enabled
  if (clinicalDecisionSupport || medicalLiteratureAccess) {
    systemPrompt += "\n\nENHANCED CAPABILITIES: You have access to evidence-based algorithms, clinical guidelines, and latest medical research."
  }
  
  // Add compliance mode
  if (medicalComplianceMode) {
    systemPrompt += "\n\nCOMPLIANCE MODE: Operating in strict medical compliance mode with enhanced safety protocols."
  }
  
  // Add critical instruction to never use patient-facing language
  if (userRole === "doctor") {
    systemPrompt += `\n\nCRITICAL INSTRUCTION: You are a Medical AI Assistant for healthcare professionals. NEVER use patient-facing language like "I'm not a doctor", "I can't diagnose", "talk to your doctor", or "I can't provide medical advice". Provide direct clinical guidance as you would to a medical colleague.`
  } else if (userRole === "medical_student") {
    systemPrompt += `\n\nCRITICAL INSTRUCTION: You are a Medical AI Assistant for medical students. NEVER use patient-facing language like "I'm not a doctor", "I can't diagnose", "talk to your doctor", or "I can't provide medical advice". Provide direct clinical guidance as you would to a medical student.`
  }
  
  // Add additional reinforcement
  if (userRole === "doctor") {
    systemPrompt += `\n\nRESPONSE STYLE: You are a medical AI assistant speaking to healthcare professionals. Use medical terminology, provide evidence-based guidance, and maintain professional clinical standards. Do not use disclaimers meant for patients.`
  } else if (userRole === "medical_student") {
    systemPrompt += `\n\nRESPONSE STYLE: You are a medical AI assistant speaking to medical students. Use medical terminology, provide evidence-based guidance, and maintain professional clinical standards. Focus on educational explanations and clinical reasoning.`
  }

  return systemPrompt
}

// Server-side function to orchestrate healthcare agents for a specific query
export async function orchestrateHealthcareAgents(
  query: string,
  context: MedicalContext
): Promise<string> {
  // Analyze the query to determine which agents to use
  const agentSelections = analyzeMedicalQuery(query, context)
  
  if (agentSelections.length === 0) {
    return "I'll provide evidence-based medical guidance based on your query."
  }
  
  // Create a streamlined response focusing on the most relevant agents
  const primaryAgents = agentSelections
    .filter(selection => selection.priority <= 2) // Focus on primary agents
    .map(selection => selection.agent.name)
  
  if (primaryAgents.length > 0) {
    return `I'm synthesizing insights from specialized medical expertise including ${primaryAgents.join(", ")}. I'll provide comprehensive, evidence-based guidance tailored to your clinical needs.`
  }
  
  return "I'll provide evidence-based medical guidance based on your query."
}

// Server-side function to get specialty-specific agents
function getSpecialtyAgentsServer(specialty: string): HealthcareAgent[] {
  const specialtyAgentMap: Record<string, string[]> = {
    cardiology: ["clinical_diagnosis_agent", "evidence_based_medicine_agent", "risk_assessment_agent"],
    pediatrics: ["clinical_diagnosis_agent", "treatment_planning_agent", "specialty_consultant_agent"],
    oncology: ["clinical_diagnosis_agent", "treatment_planning_agent", "evidence_based_medicine_agent"],
    psychiatry: ["clinical_diagnosis_agent", "drug_interaction_agent", "specialty_consultant_agent"],
    emergency_medicine: ["clinical_diagnosis_agent", "risk_assessment_agent", "treatment_planning_agent"],
    internal_medicine: ["clinical_diagnosis_agent", "evidence_based_medicine_agent", "treatment_planning_agent"]
  }
  
  const agentIds = specialtyAgentMap[specialty] || []
  return agentIds.map(id => getHealthcareAgentById(id)).filter(Boolean) as HealthcareAgent[]
} 