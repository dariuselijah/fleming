# Medical Tool Calls for Fleming

This document provides examples of medical tool functions that could enhance Fleming's healthcare AI capabilities. These examples show how tool calls can transform Fleming from a chat interface into an interactive medical assistant.

## Core Medical Tools

### 1. Drug Information Lookup

```typescript
const drugLookup = {
  name: 'drug_lookup',
  description: 'Get comprehensive drug information including dosing, contraindications, and interactions',
  parameters: {
    type: 'object',
    properties: {
      drug_name: {
        type: 'string',
        description: 'Name of the medication (generic or brand name)'
      },
      info_type: {
        type: 'string',
        enum: ['dosing', 'contraindications', 'interactions', 'side_effects', 'all'],
        description: 'Type of information requested'
      }
    },
    required: ['drug_name']
  }
}
```

**Example Scenario:**
```
User: "What's the standard dosing for metformin in type 2 diabetes?"

AI calls: drug_lookup({ drug_name: "metformin", info_type: "dosing" })

Tool returns: {
  drug: "Metformin",
  dosing: {
    initial: "500mg twice daily with meals",
    maximum: "2000-2550mg daily divided",
    titration: "Increase by 500mg weekly as tolerated"
  },
  indications: ["Type 2 diabetes mellitus"],
  renal_adjustment: "Avoid if eGFR <30 mL/min/1.73m²"
}

AI Response: "For metformin in type 2 diabetes, start with 500mg twice daily with meals. You can titrate up by 500mg weekly as tolerated, up to a maximum of 2000-2550mg daily. Important: Avoid in patients with eGFR <30 mL/min/1.73m²."
```

### 2. Clinical Calculators

```typescript
const clinicalCalculator = {
  name: 'clinical_calculator',
  description: 'Calculate clinical scores, indices, and medical formulas',
  parameters: {
    type: 'object',
    properties: {
      calculator_type: {
        type: 'string',
        enum: ['bmi', 'bsa', 'gfr', 'wells_score', 'chads2_vasc', 'apache_ii'],
        description: 'Type of clinical calculation'
      },
      parameters: {
        type: 'object',
        description: 'Calculation-specific parameters',
        additionalProperties: true
      }
    },
    required: ['calculator_type', 'parameters']
  }
}
```

**Example Scenario:**
```
User: "Calculate CHA2DS2-VASc score for a 68-year-old female with hypertension and diabetes"

AI calls: clinical_calculator({
  calculator_type: "chads2_vasc",
  parameters: {
    age: 68,
    sex: "female",
    hypertension: true,
    diabetes: true,
    heart_failure: false,
    stroke_history: false,
    vascular_disease: false
  }
})

Tool returns: {
  score: 4,
  risk_category: "high",
  annual_stroke_risk: "4.0%",
  recommendation: "Anticoagulation recommended (Class I)"
}

AI Response: "CHA2DS2-VASc score: 4 (high risk)
- Age 65-74: 1 point
- Female: 1 point  
- Hypertension: 1 point
- Diabetes: 1 point

Annual stroke risk: 4.0%. Anticoagulation is recommended (Class I indication)."
```

### 3. Lab Value Interpretation

```typescript
const labInterpreter = {
  name: 'interpret_labs',
  description: 'Interpret laboratory values with reference ranges and clinical significance',
  parameters: {
    type: 'object',
    properties: {
      lab_values: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            test_name: { type: 'string' },
            value: { type: 'number' },
            unit: { type: 'string' },
            reference_range: { type: 'string', description: 'Optional if unknown' }
          },
          required: ['test_name', 'value', 'unit']
        }
      },
      patient_context: {
        type: 'object',
        properties: {
          age: { type: 'number' },
          sex: { type: 'string' },
          clinical_context: { type: 'string' }
        }
      }
    },
    required: ['lab_values']
  }
}
```

**Example Scenario:**
```
User: "Interpret these labs: Hemoglobin 8.2 g/dL, MCV 68 fL, Ferritin 15 ng/mL"

AI calls: interpret_labs({
  lab_values: [
    { test_name: "Hemoglobin", value: 8.2, unit: "g/dL" },
    { test_name: "MCV", value: 68, unit: "fL" },
    { test_name: "Ferritin", value: 15, unit: "ng/mL" }
  ]
})

Tool returns: {
  interpretations: [
    {
      test: "Hemoglobin",
      status: "low",
      reference_range: "12-15.5 g/dL (female), 14-17.5 g/dL (male)",
      clinical_significance: "Anemia"
    },
    {
      test: "MCV",
      status: "low", 
      reference_range: "80-100 fL",
      clinical_significance: "Microcytic anemia"
    },
    {
      test: "Ferritin",
      status: "low",
      reference_range: "15-150 ng/mL (female), 15-400 ng/mL (male)",
      clinical_significance: "Iron deficiency"
    }
  ],
  pattern_recognition: "Iron deficiency anemia",
  recommendations: ["Iron studies", "Source of blood loss evaluation", "Iron supplementation"]
}

AI Response: "These labs show iron deficiency anemia:
- Hemoglobin 8.2 g/dL (low) - indicates anemia
- MCV 68 fL (low) - microcytic pattern  
- Ferritin 15 ng/mL (low) - iron deficiency

Recommendations: Complete iron studies, evaluate for source of blood loss, consider iron supplementation."
```

### 4. Medical Knowledge Search

```typescript
const medicalKnowledgeSearch = {
  name: 'medical_search',
  description: 'Search evidence-based medical literature and guidelines',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Medical search query'
      },
      source_types: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['guidelines', 'research', 'drug_info', 'differential_diagnosis']
        },
        description: 'Types of sources to search'
      },
      specialty: {
        type: 'string',
        description: 'Medical specialty to focus search'
      }
    },
    required: ['query']
  }
}
```

**Example Scenario:**
```
User: "What are the latest guidelines for managing acute coronary syndrome?"

AI calls: medical_search({
  query: "acute coronary syndrome management guidelines",
  source_types: ["guidelines"],
  specialty: "cardiology"
})

Tool returns: {
  results: [
    {
      title: "2023 ESC Guidelines for Acute Coronary Syndromes",
      summary: "Updated recommendations for NSTEMI/STEMI management",
      key_points: [
        "Dual antiplatelet therapy recommendations",
        "Risk stratification using GRACE score",
        "Invasive strategy timing"
      ],
      evidence_level: "Class I, Level A"
    }
  ]
}

AI Response: "Latest ACS guidelines (2023 ESC) recommend:
1. Risk stratification using GRACE score
2. Dual antiplatelet therapy (P2Y12 inhibitor + aspirin)
3. Early invasive strategy for high-risk NSTEMI (<24 hours)
4. Primary PCI within 90 minutes for STEMI

These are Class I, Level A recommendations."
```

### 5. Emergency Protocol Assistant

```typescript
const emergencyProtocol = {
  name: 'emergency_protocol',
  description: 'Get step-by-step emergency medical protocols',
  parameters: {
    type: 'object',
    properties: {
      emergency_type: {
        type: 'string',
        enum: ['cardiac_arrest', 'anaphylaxis', 'stroke', 'sepsis', 'trauma'],
        description: 'Type of medical emergency'
      },
      patient_details: {
        type: 'object',
        properties: {
          age: { type: 'number' },
          weight: { type: 'number' },
          allergies: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    required: ['emergency_type']
  }
}
```

**Example Scenario:**
```
User: "Patient presenting with anaphylaxis, 70kg adult, no known allergies to epinephrine"

AI calls: emergency_protocol({
  emergency_type: "anaphylaxis",
  patient_details: { age: 45, weight: 70 }
})

Tool returns: {
  protocol: "Anaphylaxis Management",
  immediate_actions: [
    "Remove/discontinue trigger if identified",
    "Call for help/activate emergency response",
    "Assess airway, breathing, circulation"
  ],
  medications: [
    {
      drug: "Epinephrine",
      dose: "0.3-0.5mg IM (0.3-0.5mL of 1:1000)",
      route: "Intramuscular, vastus lateralis",
      repeat: "Every 5-15 minutes as needed"
    }
  ],
  monitoring: ["BP", "O2 sat", "ECG", "Mental status"]
}

AI Response: "ANAPHYLAXIS PROTOCOL:

Immediate Actions:
1. Remove trigger, call for help
2. Assess ABCs (airway/breathing/circulation)

First-line Treatment:
- Epinephrine 0.3-0.5mg IM (vastus lateralis)
- Can repeat every 5-15 minutes
- For 70kg patient: 0.5mg dose appropriate

Continue monitoring: BP, O2 sat, ECG, mental status
Prepare for potential airway management."
```

## Integration with Fleming's Architecture

### Tool Registration in Provider System

```typescript
// lib/openproviders/medical-tools.ts
export const medicalTools = {
  drug_lookup: drugLookup,
  clinical_calculator: clinicalCalculator,
  interpret_labs: labInterpreter,
  medical_search: medicalKnowledgeSearch,
  emergency_protocol: emergencyProtocol
}

// Integration with existing AI providers
export function createMedicalToolsConfig(userRole: 'general' | 'medical_student' | 'healthcare_professional') {
  // Limit tool access based on user role
  const availableTools = userRole === 'general' 
    ? ['drug_lookup', 'clinical_calculator'] 
    : Object.keys(medicalTools)
    
  return {
    tools: pick(medicalTools, availableTools),
    toolChoice: 'auto'
  }
}
```

### Role-Based Tool Access

```typescript
// Different tool sets for different user roles
const toolsByRole = {
  general: ['drug_lookup', 'clinical_calculator'],
  medical_student: ['drug_lookup', 'clinical_calculator', 'interpret_labs', 'medical_search'],
  healthcare_professional: ['drug_lookup', 'clinical_calculator', 'interpret_labs', 'medical_search', 'emergency_protocol']
}
```

## Benefits for Fleming

1. **Enhanced Clinical Utility**: Transform from chat to interactive medical assistant
2. **Evidence-Based Responses**: Real-time access to medical databases and guidelines
3. **Role-Appropriate Features**: Different tool access based on user credentials
4. **Improved Accuracy**: Structured data instead of AI hallucinations for medical facts
5. **Emergency Support**: Quick access to critical protocols when needed

## Implementation Guide

### File Structure and Locations

#### 1. Tool Definitions
**File**: `lib/openproviders/medical-tools.ts`
- Define all medical tool schemas (`drugLookup`, `clinicalCalculator`, etc.)
- Export the `medicalTools` object
- Implement `createMedicalToolsConfig()` function for role-based access

#### 2. Tool Handler Functions
**File**: `lib/medical/tool-handlers.ts` (new)
- Implement actual tool execution logic
- Handle API calls to medical databases
- Process and format medical data responses

#### 3. API Routes for Tool Execution
**File**: `app/api/medical-tools/route.ts` (new)
- Handle tool execution requests from the frontend
- Validate user permissions based on role
- Execute appropriate tool handlers

#### 4. Role-Based Access Control
**File**: `lib/auth/medical-permissions.ts` (new)
- Implement role checking (`general`, `medical_student`, `healthcare_professional`)
- Filter available tools based on user role
- Integrate with existing auth system in `lib/auth/`

#### 5. Integration with AI Providers
**Files**: `lib/openproviders/[provider].ts` (modify existing files like `openai.ts`, `anthropic.ts`)
- Add medical tools to provider configurations
- Integrate with existing tool choice logic

#### 6. Integration with Chat System
**File**: `lib/chat/tool-processor.ts` (modify existing)
- Add medical tool processing to existing chat flow
- Handle tool responses in chat messages
- Maintain chat history with tool interactions

### Implementation Steps

1. **Create tool definitions** in `lib/openproviders/medical-tools.ts`
2. **Implement tool handlers** in `lib/medical/tool-handlers.ts`
3. **Add API routes** for tool execution
4. **Set up role-based permissions** system
5. **Integrate with existing providers** and chat system
6. **Add comprehensive testing** for medical accuracy

## Implementation Considerations

- **Data Sources**: Integrate with medical databases (FDA Orange Book, clinical guidelines)
- **Validation**: All medical calculations should be validated against established formulas
- **Disclaimers**: Maintain clear AI assistant limitations in medical contexts
- **Compliance**: Ensure tools meet healthcare data handling requirements
- **Testing**: Comprehensive testing with medical professionals for accuracy

These tool calls would significantly enhance Fleming's value proposition as a healthcare-focused AI assistant while maintaining appropriate medical boundaries and disclaimers.
