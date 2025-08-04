import {
  BookOpenText,
  Brain,
  Code,
  Lightbulb,
  Notepad,
  PaintBrush,
  Sparkle,
  HeartIcon,
  StethoscopeIcon,
  PillIcon,
  UserIcon,
  MicroscopeIcon,
} from "@phosphor-icons/react/dist/ssr"

export const NON_AUTH_DAILY_MESSAGE_LIMIT = 5
export const AUTH_DAILY_MESSAGE_LIMIT = 1000
export const REMAINING_QUERY_ALERT_THRESHOLD = 2
export const DAILY_FILE_UPLOAD_LIMIT = 25
export const DAILY_LIMIT_PRO_MODELS = 500

export const NON_AUTH_ALLOWED_MODELS = ["grok-4", "grok-3", "o3", "gpt-4o"]

export const FREE_MODELS_IDS = [
  "openrouter:deepseek/deepseek-r1:free",
  "openrouter:meta-llama/llama-3.3-8b-instruct:free",
  "pixtral-large-latest",
  "mistral-large-latest",
  "grok-4",
  "grok-3",
  "o3",
  "gpt-4o",
]

export const MODEL_DEFAULT = "grok-4"

export const APP_NAME = "Fleming"
export const APP_DOMAIN = "https://fleming.chat"

// General user suggestions - what people actually ask about health
export const GENERAL_USER_SUGGESTIONS = [
  {
    label: "Common Symptoms",
    highlight: "Symptoms",
    prompt: `Symptoms`,
    items: [
      "I have a headache that won't go away, what could it be?",
      "My stomach hurts after eating, is this normal?",
      "I'm feeling dizzy and tired all the time",
      "My joints are stiff in the morning, should I worry?",
    ],
    icon: StethoscopeIcon,
  },
  {
    label: "Medication Questions",
    highlight: "Medication",
    prompt: `Medication`,
    items: [
      "I forgot to take my blood pressure medicine, what should I do?",
      "Can I take ibuprofen with my other medications?",
      "My medication is making me feel sick, is this normal?",
      "How do I know if my medication is working?",
    ],
    icon: PillIcon,
  },
  {
    label: "Lifestyle & Prevention",
    highlight: "Lifestyle",
    prompt: `Lifestyle`,
    items: [
      "How can I lower my blood pressure naturally?",
      "What exercises are safe for someone with back pain?",
      "I want to quit smoking, what's the best way?",
      "How much water should I drink each day?",
    ],
    icon: HeartIcon,
  },
  {
    label: "When to See a Doctor",
    highlight: "Doctor",
    prompt: `Doctor`,
    items: [
      "When should I go to the emergency room?",
      "How do I know if my chest pain is serious?",
      "My fever won't go down, when should I call the doctor?",
      "What symptoms mean I need immediate medical attention?",
    ],
    icon: UserIcon,
  },
  {
    label: "Health Concerns",
    highlight: "Health",
    prompt: `Health`,
    items: [
      "I'm worried about my weight, what's a healthy BMI?",
      "My sleep has been terrible lately, how can I fix it?",
      "I'm always stressed, how does this affect my health?",
      "What are the warning signs of diabetes?",
    ],
    icon: Lightbulb,
  },
  {
    label: "Family Health",
    highlight: "Family",
    prompt: `Family`,
    items: [
      "My child has a fever, when should I be concerned?",
      "How do I talk to my parents about their health?",
      "My partner snores loudly, is this a health problem?",
      "What vaccines do adults need?",
    ],
    icon: UserIcon,
  },
]

// Specialty-specific suggestions for healthcare professionals
export const HEALTHCARE_PROFESSIONAL_SUGGESTIONS = [
  {
    label: "Clinical Decision Making",
    highlight: "Clinical",
    prompt: `Clinical`,
    items: [
      "How do I approach a patient with multiple comorbidities and conflicting guidelines?",
      "What's the latest evidence for managing hypertension in elderly patients?",
      "How do I handle a patient who refuses recommended treatment?",
      "What are the red flags for chest pain that I shouldn't miss?",
      "How do I manage a patient with suspected sepsis in the outpatient setting?",
    ],
    icon: StethoscopeIcon,
  },
  {
    label: "Medical Guidelines & Protocols",
    highlight: "Guidelines",
    prompt: `Guidelines`,
    items: [
      "What are the current ADA guidelines for diabetes management?",
      "Latest AHA/ACC guidelines for cardiovascular disease prevention",
      "Updated antibiotic stewardship protocols for common infections",
      "Current protocols for stroke management and prevention",
      "Best practices for pain management in the opioid crisis era",
    ],
    icon: MicroscopeIcon,
  },
  {
    label: "Patient Communication",
    highlight: "Communication",
    prompt: `Communication`,
    items: [
      "How do I explain a complex diagnosis to a patient with limited health literacy?",
      "Breaking bad news to patients and families with compassion",
      "Discussing end-of-life care and advance directives",
      "How to handle patient complaints and dissatisfaction effectively",
      "Communicating with patients from different cultural backgrounds",
    ],
    icon: UserIcon,
  },
  {
    label: "Diagnostic Challenges",
    highlight: "Diagnostic",
    prompt: `Diagnostic`,
    items: [
      "How do I work up unexplained weight loss in an elderly patient?",
      "Approach to chronic fatigue with normal basic labs",
      "Differential diagnosis for recurrent abdominal pain",
      "How to evaluate syncope in different age groups",
      "Workup for unexplained elevated liver enzymes",
    ],
    icon: StethoscopeIcon,
  },
  {
    label: "Treatment & Management",
    highlight: "Treatment",
    prompt: `Treatment`,
    items: [
      "Managing polypharmacy and drug interactions in elderly patients",
      "How to titrate medications for optimal blood pressure control",
      "Treatment strategies for resistant hypertension",
      "Managing diabetes in patients with renal insufficiency",
      "Approach to chronic pain management in patients with substance use history",
    ],
    icon: PillIcon,
  },
  {
    label: "Professional Development",
    highlight: "Professional",
    prompt: `Professional`,
    items: [
      "How to stay current with rapidly changing medical literature",
      "Best practices for clinical documentation and coding",
      "Continuing medical education opportunities and requirements",
      "Building a professional network and finding mentors",
      "Balancing clinical practice with research and teaching",
    ],
    icon: UserIcon,
  },
  {
    label: "Clinical Research & Evidence",
    highlight: "Research",
    prompt: `Research`,
    items: [
      "Latest studies on COVID-19 long-term effects and management",
      "Recent advances in immunotherapy for various cancers",
      "New developments in telemedicine and digital health",
      "Evidence-based approaches to mental health treatment",
      "Latest research on precision medicine and personalized care",
    ],
    icon: MicroscopeIcon,
  },
  {
    label: "Practice Management",
    highlight: "Practice",
    prompt: `Practice`,
    items: [
      "How to improve patient satisfaction scores and experience",
      "Managing electronic health records efficiently and accurately",
      "Quality improvement strategies for clinical practice",
      "Best practices for team-based care and collaboration",
      "Managing workflow and preventing physician burnout",
    ],
    icon: StethoscopeIcon,
  },
  {
    label: "Emergency & Urgent Care",
    highlight: "Emergency",
    prompt: `Emergency`,
    items: [
      "How to handle medical emergencies in the outpatient setting",
      "When to transfer patients to emergency care",
      "Managing acute exacerbations of chronic conditions",
      "Handling psychiatric emergencies and crisis intervention",
      "Preparing for and responding to mass casualty events",
    ],
    icon: HeartIcon,
  },
  {
    label: "Preventive Care",
    highlight: "Preventive",
    prompt: `Preventive`,
    items: [
      "Evidence-based cancer screening recommendations by age and risk",
      "Vaccination schedules and catch-up protocols for adults",
      "Cardiovascular risk assessment and prevention strategies",
      "Screening for depression, anxiety, and substance use",
      "Preventive care for special populations (pregnant, elderly, immunocompromised)",
    ],
    icon: Lightbulb,
  },
  {
    label: "Ethics & Legal Issues",
    highlight: "Ethics",
    prompt: `Ethics`,
    items: [
      "How to handle conflicts between patient autonomy and medical recommendations",
      "Managing patient confidentiality in the digital age",
      "Ethical considerations in end-of-life care decisions",
      "Legal implications of telemedicine and digital health",
      "Handling medical errors and disclosure to patients",
    ],
    icon: UserIcon,
  },
  {
    label: "Technology & Innovation",
    highlight: "Technology",
    prompt: `Technology`,
    items: [
      "How to integrate AI and machine learning into clinical practice",
      "Best practices for telemedicine consultations",
      "Using wearable devices and remote monitoring in patient care",
      "Implementing electronic health records effectively",
      "Digital health tools for patient engagement and education",
    ],
    icon: MicroscopeIcon,
  },
]

// Specialty-specific suggestions based on medical specialty
export const SPECIALTY_SUGGESTIONS = {
  cardiology: [
    {
      label: "Cardiac Assessment",
      highlight: "Cardiac",
      prompt: `Cardiac`,
      items: [
        "Latest guidelines for heart failure management",
        "How to interpret ECG findings in chest pain",
        "Best practices for cardiac rehabilitation",
        "Managing patients with atrial fibrillation",
      ],
      icon: HeartIcon,
    },
    {
      label: "Cardiovascular Procedures",
      highlight: "Procedures",
      prompt: `Procedures`,
      items: [
        "Pre-procedure assessment for cardiac catheterization",
        "Post-stent care and medication management",
        "Managing complications after cardiac surgery",
        "Follow-up protocols for pacemaker patients",
      ],
      icon: StethoscopeIcon,
    },
  ],
  pediatrics: [
    {
      label: "Child Development",
      highlight: "Development",
      prompt: `Development`,
      items: [
        "Developmental milestones for different ages",
        "How to assess growth and nutrition in children",
        "Behavioral concerns in toddlers and preschoolers",
        "Managing common childhood illnesses",
      ],
      icon: UserIcon,
    },
    {
      label: "Pediatric Care",
      highlight: "Pediatric",
      prompt: `Pediatric`,
      items: [
        "Vaccination schedules and catch-up protocols",
        "Managing fever in children of different ages",
        "Common pediatric emergencies and responses",
        "Adolescent health and development issues",
      ],
      icon: StethoscopeIcon,
    },
  ],
  oncology: [
    {
      label: "Cancer Treatment",
      highlight: "Treatment",
      prompt: `Treatment`,
      items: [
        "Latest immunotherapy options for different cancers",
        "Managing chemotherapy side effects",
        "Palliative care approaches for cancer patients",
        "Survivorship care planning",
      ],
      icon: MicroscopeIcon,
    },
    {
      label: "Oncological Care",
      highlight: "Oncology",
      prompt: `Oncology`,
      items: [
        "Breaking cancer diagnosis to patients",
        "Managing pain in cancer patients",
        "Nutrition support during cancer treatment",
        "Psychosocial support for cancer families",
      ],
      icon: StethoscopeIcon,
    },
  ],
  psychiatry: [
    {
      label: "Mental Health Assessment",
      highlight: "Assessment",
      prompt: `Assessment`,
      items: [
        "Screening tools for depression and anxiety",
        "Risk assessment for suicidal patients",
        "Evaluating psychosis and schizophrenia",
        "Assessment of substance use disorders",
      ],
      icon: Brain,
    },
    {
      label: "Psychiatric Treatment",
      highlight: "Treatment",
      prompt: `Treatment`,
      items: [
        "Medication management for bipolar disorder",
        "Psychotherapy approaches for PTSD",
        "Managing medication side effects in psychiatry",
        "Crisis intervention strategies",
      ],
      icon: StethoscopeIcon,
    },
  ],
  emergency_medicine: [
    {
      label: "Emergency Assessment",
      highlight: "Emergency",
      prompt: `Emergency`,
      items: [
        "Rapid assessment of chest pain patients",
        "Managing trauma patients in the ED",
        "Toxicology emergencies and treatments",
        "Pediatric emergency protocols",
      ],
      icon: StethoscopeIcon,
    },
    {
      label: "Critical Care",
      highlight: "Critical",
      prompt: `Critical`,
      items: [
        "Managing septic shock in the ED",
        "Airway management in emergency situations",
        "Cardiac arrest protocols and post-resuscitation care",
        "Transfer criteria for critical patients",
      ],
      icon: HeartIcon,
    },
  ],
  internal_medicine: [
    {
      label: "Internal Medicine",
      highlight: "Internal",
      prompt: `Internal`,
      items: [
        "Managing complex patients with multiple conditions",
        "Preventive care guidelines for adults",
        "Chronic disease management strategies",
        "Hospital medicine and inpatient care",
      ],
      icon: StethoscopeIcon,
    },
    {
      label: "General Medicine",
      highlight: "General",
      prompt: `General`,
      items: [
        "Evidence-based approaches to common conditions",
        "Managing polypharmacy in elderly patients",
        "Pre-operative medical clearance",
        "Long-term care and geriatric medicine",
      ],
      icon: UserIcon,
    },
  ],
}

// Default suggestions (fallback)
export const SUGGESTIONS = GENERAL_USER_SUGGESTIONS

// Function to get appropriate suggestions based on user role and specialty
export function getSuggestionsByRole(userRole?: "general" | "doctor", medicalSpecialty?: string) {
  if (userRole === "doctor") {
    // If we have specialty-specific suggestions, use them
    if (medicalSpecialty && medicalSpecialty !== "general" && SPECIALTY_SUGGESTIONS[medicalSpecialty as keyof typeof SPECIALTY_SUGGESTIONS]) {
      return SPECIALTY_SUGGESTIONS[medicalSpecialty as keyof typeof SPECIALTY_SUGGESTIONS]
    }
    // Otherwise use general healthcare professional suggestions
    return HEALTHCARE_PROFESSIONAL_SUGGESTIONS
  }
  return GENERAL_USER_SUGGESTIONS
}


export const SYSTEM_PROMPT_DEFAULT = `
You are Fleming. Your core identity is that of a thoughtful, clear, and deeply empathetic AI assistant. Your purpose is to help users navigate the full spectrum of health and wellness with clarity and grounded support.

**Your Foundational Persona:**
- **Tone:** You are calm, minimal, and human. Your presence is reassuring, never clinical or cold. You validate the user's feelings and concerns as a starting point for any discussion.
- **Intellect:** You are a powerful analytical thinker, capable of processing complex information. However, you communicate with profound simplicity. You use analogies and metaphors not to be clever, but to make the complex understandable.
- **Intent:** You write with intention—never too much, never too little. You don't try to impress; you aim to clarify. Your ultimate goal is to help the user think clearly and move forward with confidence.

**Your Core Operational Directive: Adaptive Reasoning**
You do not use a one-size-fits-all approach. Your first step in any interaction is to discern the user's primary need. You will then adapt your internal thinking model accordingly. Your goal is to show your reasoning, not just state a conclusion.

**1. The Analyst Mode (For Symptoms & Conditions)**
- **Trigger:** When the user describes physical symptoms, asks "what could this be?", or discusses a specific medical condition.
- **Your Thought Process:**
    - **a. Contextual Inquiry:** Emulate a clinician's curiosity. Ask clarifying, open-ended questions to understand the full picture. Think in terms of onset, quality, duration, and associated factors, but phrase it naturally ("How has this been changing since it started?").
    - **b. Pattern Recognition & Possibilities:** Internally, construct a mental map of potential explanations. In your response, explain these possibilities by connecting them to the user's specific information. Frame this as an exploration of patterns. For example: "The pattern you're describing—headaches that are worse in the morning and accompanied by neck stiffness—often points in a couple of potential directions. One area to consider is..."
    - **c. Explaining the "Why":** Demystify the medical process. Explain *why* certain factors are important or why a doctor might order a specific test. Your goal is to educate the user on the logic of healthcare, empowering them for their real-world interactions.

**2. The Guide Mode (For Mental & Emotional Health)**
- **Trigger:** When the user expresses feelings of stress, anxiety, burnout, sadness, or asks for advice on navigating difficult emotions or relationships.
- **Your Thought Process:**
    - **a. Empathetic Listening & Validation:** Your first priority is to create a safe space. Acknowledge and validate their feelings without judgment. ("That sounds incredibly stressful. It makes perfect sense that you'd feel overwhelmed.")
    - **b. Gentle Exploration:** Use reflective questioning to help the user explore their own thoughts. Introduce concepts from established therapeutic frameworks (like CBT's thought-feeling-action link or mindfulness principles) in a simple, jargon-free way. For instance: "Sometimes, there's a strong link between a thought we have and the feeling that follows. I wonder, what thoughts are present when you start to feel that anxiety?"
    - **c. Co-creating Strategies:** Work *with* the user. Instead of prescribing solutions, offer a menu of evidence-based techniques (e.g., grounding exercises, journaling prompts, reframing negative thoughts) as experiments they could try. The focus is on self-discovery and empowerment.

**3. The Advisor Mode (For Lifestyle, Prevention & Wellness)**
- **Trigger:** When the user asks about diet, exercise, sleep, quitting a habit, or general preventative health.
- **Your Thought Process:**
    - **a. Understanding the Goal Behind the Goal:** Look past the surface question. A user asking "How do I lose weight?" might really be asking "How can I feel more energetic and confident?" Address the deeper motivation.
    - **b. Behavioral Science Lens:** Your advice should be grounded in the reality of human behavior. Emphasize consistency over intensity, small wins, and building sustainable systems rather than relying on willpower. Break down large goals into small, actionable first steps.
    - **c. Presenting Options, Not Edicts:** Offer a balanced view of different approaches, explaining the pros and cons of each. You are a collaborator in their wellness journey, not a drill sergeant.

**Unyielding Safety Guardrails (Internal Directives):**
- **You Are Not a Doctor:** This is your unshakeable reality. You provide information and frameworks for thinking, not diagnoses or prescriptions. Your entire persona is built around empowering the user for their interactions with *real* medical professionals.
- **Emergency Recognition:** If a user's description suggests a potential medical emergency (e.g., sudden severe pain, difficulty breathing, signs of a stroke), you will immediately and calmly pivot. Your only goal becomes guiding them to seek immediate, professional medical help.
- **Medication:** You can provide general, encyclopedic information about a medication's purpose or common side effects. You will never advise on dosage, or on starting, stopping, or mixing medications. You will always state this is a decision for a doctor or pharmacist.
`

export const MESSAGE_MAX_LENGTH = 10000
