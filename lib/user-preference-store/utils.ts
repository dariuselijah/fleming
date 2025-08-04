export type LayoutType = "sidebar" | "fullscreen"

export type UserRole = "general" | "doctor"

export type MedicalSpecialty = 
  | "cardiology" 
  | "oncology" 
  | "pediatrics" 
  | "neurology" 
  | "orthopedics" 
  | "dermatology" 
  | "psychiatry" 
  | "emergency-medicine" 
  | "internal-medicine" 
  | "surgery" 
  | "radiology" 
  | "pathology" 
  | "anesthesiology" 
  | "obstetrics-gynecology" 
  | "family-medicine" 
  | "general"

export type UserPreferences = {
  layout: LayoutType
  promptSuggestions: boolean
  showToolInvocations: boolean
  showConversationPreviews: boolean
  hiddenModels: string[]
  
  // Healthcare-specific preferences
  userRole: UserRole
  medicalSpecialty?: MedicalSpecialty
  healthcareAgentEnabled: boolean
  medicalComplianceMode: boolean
  clinicalDecisionSupport: boolean
  medicalLiteratureAccess: boolean
  
  // General user health context
  healthContext?: string
  healthConditions?: string[]
  medications?: string[]
  allergies?: string[]
  familyHistory?: string
  lifestyleFactors?: string
}

export const defaultPreferences: UserPreferences = {
  layout: "fullscreen",
  promptSuggestions: true,
  showToolInvocations: true,
  showConversationPreviews: true,
  hiddenModels: [],
  
  // Healthcare defaults
  userRole: "general",
  medicalSpecialty: "general",
  healthcareAgentEnabled: false,
  medicalComplianceMode: false,
  clinicalDecisionSupport: false,
  medicalLiteratureAccess: false,
  
  // General user health context defaults
  healthContext: "",
  healthConditions: [],
  medications: [],
  allergies: [],
  familyHistory: "",
  lifestyleFactors: "",
}

// Helper functions to convert between API format (snake_case) and frontend format (camelCase)
export function convertFromApiFormat(apiData: any): UserPreferences {
  return {
    layout: apiData.layout || "fullscreen",
    promptSuggestions: apiData.prompt_suggestions ?? true,
    showToolInvocations: apiData.show_tool_invocations ?? true,
    showConversationPreviews: apiData.show_conversation_previews ?? true,
    hiddenModels: apiData.hidden_models || [],
    
    // Healthcare preferences
    userRole: apiData.user_role || "general",
    medicalSpecialty: apiData.medical_specialty || "general",
    healthcareAgentEnabled: apiData.healthcare_agent_enabled ?? false,
    medicalComplianceMode: apiData.medical_compliance_mode ?? false,
    clinicalDecisionSupport: apiData.clinical_decision_support ?? false,
    medicalLiteratureAccess: apiData.medical_literature_access ?? false,
    
    // General user health context
    healthContext: apiData.health_context || "",
    healthConditions: apiData.health_conditions || [],
    medications: apiData.medications || [],
    allergies: apiData.allergies || [],
    familyHistory: apiData.family_history || "",
    lifestyleFactors: apiData.lifestyle_factors || "",
  }
}

export function convertToApiFormat(preferences: Partial<UserPreferences>) {
  const apiData: any = {}
  if (preferences.layout !== undefined) apiData.layout = preferences.layout
  if (preferences.promptSuggestions !== undefined)
    apiData.prompt_suggestions = preferences.promptSuggestions
  if (preferences.showToolInvocations !== undefined)
    apiData.show_tool_invocations = preferences.showToolInvocations
  if (preferences.showConversationPreviews !== undefined)
    apiData.show_conversation_previews = preferences.showConversationPreviews
  if (preferences.hiddenModels !== undefined)
    apiData.hidden_models = preferences.hiddenModels
  
  // Healthcare preferences
  if (preferences.userRole !== undefined)
    apiData.user_role = preferences.userRole
  if (preferences.medicalSpecialty !== undefined)
    apiData.medical_specialty = preferences.medicalSpecialty
  if (preferences.healthcareAgentEnabled !== undefined)
    apiData.healthcare_agent_enabled = preferences.healthcareAgentEnabled
  if (preferences.medicalComplianceMode !== undefined)
    apiData.medical_compliance_mode = preferences.medicalComplianceMode
  if (preferences.clinicalDecisionSupport !== undefined)
    apiData.clinical_decision_support = preferences.clinicalDecisionSupport
  if (preferences.medicalLiteratureAccess !== undefined)
    apiData.medical_literature_access = preferences.medicalLiteratureAccess
  
  // General user health context
  if (preferences.healthContext !== undefined)
    apiData.health_context = preferences.healthContext
  if (preferences.healthConditions !== undefined)
    apiData.health_conditions = preferences.healthConditions
  if (preferences.medications !== undefined)
    apiData.medications = preferences.medications
  if (preferences.allergies !== undefined)
    apiData.allergies = preferences.allergies
  if (preferences.familyHistory !== undefined)
    apiData.family_history = preferences.familyHistory
  if (preferences.lifestyleFactors !== undefined)
    apiData.lifestyle_factors = preferences.lifestyleFactors
  
  return apiData
}
