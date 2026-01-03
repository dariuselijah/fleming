## Suggestions UI Blueprint

This document collects every piece you need to recreate Fleming’s suggestions UI in another project: the component tree, prop contracts, motion/styling dependencies, and the exact suggestion copy grouped by audience.

### 1. Components & Data Flow

- **`PromptSystem`** (`app/components/suggestions/prompt-system.tsx`) wraps the chat input area and renders the animated suggestion rail just below the input on desktop (absolutely positioned) and inline on mobile.
- **`Suggestions`** (`app/components/chat-input/suggestions.tsx`) contains all UI logic:
  - Pulls the active user profile from `useUserPreferences()`.
  - Calls `getSuggestionsByRole(userRole, medicalSpecialty)` from `lib/config`.
  - Renders either a horizontal grid of category chips or a vertical list of prompts once a chip is selected.
  - Emits `onSuggestion(suggestion: string)` and clears the input via `onValueChange("")`.
- **`PromptSuggestion`** (`components/prompt-kit/prompt-suggestion.tsx`) is the base pill UI used for both category chips and concrete suggestion buttons.

```tsx
// Minimal integration (from PromptSystem)
<div className="relative order-1 w-full md:absolute md:bottom-[-70px] md:order-2 md:h-[70px]">
  <AnimatePresence mode="popLayout">
    <Suggestions
      onValueChange={handleInputChange}
      onSuggestion={handleSuggestion}
      value={inputValue}
    />
  </AnimatePresence>
</div>
```

### 2. Required Dependencies

- `motion/react` for `AnimatePresence`, `motion.div`, and `motion.create`.
- `TRANSITION_SUGGESTIONS` timing config from `lib/motion`.
- Icons from `@phosphor-icons/react/dist/ssr` for category glyphs.
- Tailwind (or an equivalent utility layer) for the provided class names. Recreate the classes if you are not using Tailwind.
- `useUserPreferences` context (`lib/user-preference-store/provider`) to access `preferences.userRole` and `preferences.medicalSpecialty`. If you do not have this provider, pass the role and specialty directly into the component and swap the hook for props.

### 3. Rebuild Checklist

1. Copy both React components and the prompt kit atom into your new project.
2. Ensure your build tooling supports `"use client"` components and the Motion One (`motion/react`) API.
3. Recreate the Tailwind classes or translate them into your styling solution.
4. Port the suggestion datasets and `getSuggestionsByRole` helper (Section 4).
5. Wire `onSuggestion` to whatever action should send a message, and `onValueChange` to your controlled input state.

### 4. Suggestion Datasets & Helper

All data lives in `lib/config.ts`. Below is the exact content needed elsewhere.

#### 4.1 `GENERAL_USER_SUGGESTIONS`

- **Common Symptoms** (`StethoscopeIcon`)
  - I have a headache that won't go away, what could it be?
  - My stomach hurts after eating, is this normal?
  - I'm feeling dizzy and tired all the time
  - My joints are stiff in the morning, should I worry?
- **Medication Questions** (`PillIcon`)
  - I forgot to take my blood pressure medicine, what should I do?
  - Can I take ibuprofen with my other medications?
  - My medication is making me feel sick, is this normal?
  - How do I know if my medication is working?
- **Lifestyle & Prevention** (`HeartIcon`)
  - How can I lower my blood pressure naturally?
  - What exercises are safe for someone with back pain?
  - I want to quit smoking, what's the best way?
  - How much water should I drink each day?
- **When to See a Doctor** (`UserIcon`)
  - When should I go to the emergency room?
  - How do I know if my chest pain is serious?
  - My fever won't go down, when should I call the doctor?
  - What symptoms mean I need immediate medical attention?
- **Health Concerns** (`Lightbulb`)
  - I'm worried about my weight, what's a healthy BMI?
  - My sleep has been terrible lately, how can I fix it?
  - I'm always stressed, how does this affect my health?
  - What are the warning signs of diabetes?
- **Family Health** (`UserIcon`)
  - My child has a fever, when should I be concerned?
  - How do I talk to my parents about their health?
  - My partner snores loudly, is this a health problem?
  - What vaccines do adults need?

#### 4.2 `HEALTHCARE_PROFESSIONAL_SUGGESTIONS`

- **Clinical Decision Making** (`StethoscopeIcon`)
  - How do I approach a patient with multiple comorbidities and conflicting guidelines?
  - What's the latest evidence for managing hypertension in elderly patients?
  - How do I handle a patient who refuses recommended treatment?
  - What are the red flags for chest pain that I shouldn't miss?
  - How do I manage a patient with suspected sepsis in the outpatient setting?
- **Medical Guidelines & Protocols** (`MicroscopeIcon`)
  - What are the current ADA guidelines for diabetes management?
  - Latest AHA/ACC guidelines for cardiovascular disease prevention
  - Updated antibiotic stewardship protocols for common infections
  - Current protocols for stroke management and prevention
  - Best practices for pain management in the opioid crisis era
- **Patient Communication** (`UserIcon`)
  - How do I explain a complex diagnosis to a patient with limited health literacy?
  - Breaking bad news to patients and families with compassion
  - Discussing end-of-life care and advance directives
  - How to handle patient complaints and dissatisfaction effectively?
  - Communicating with patients from different cultural backgrounds
- **Diagnostic Challenges** (`StethoscopeIcon`)
  - How do I work up unexplained weight loss in an elderly patient?
  - Approach to chronic fatigue with normal basic labs
  - Differential diagnosis for recurrent abdominal pain
  - How to evaluate syncope in different age groups
  - Workup for unexplained elevated liver enzymes
- **Treatment & Management** (`PillIcon`)
  - Managing polypharmacy and drug interactions in elderly patients
  - How to titrate medications for optimal blood pressure control
  - Treatment strategies for resistant hypertension
  - Managing diabetes in patients with renal insufficiency
  - Approach to chronic pain management in patients with substance use history
- **Professional Development** (`UserIcon`)
  - How to stay current with rapidly changing medical literature
  - Best practices for clinical documentation and coding
  - Continuing medical education opportunities and requirements
  - Building a professional network and finding mentors
  - Balancing clinical practice with research and teaching
- **Clinical Research & Evidence** (`MicroscopeIcon`)
  - Latest studies on COVID-19 long-term effects and management
  - Recent advances in immunotherapy for various cancers
  - New developments in telemedicine and digital health
  - Evidence-based approaches to mental health treatment
  - Latest research on precision medicine and personalized care
- **Practice Management** (`StethoscopeIcon`)
  - How to improve patient satisfaction scores and experience
  - Managing electronic health records efficiently and accurately
  - Quality improvement strategies for clinical practice
  - Best practices for team-based care and collaboration
  - Managing workflow and preventing physician burnout
- **Emergency & Urgent Care** (`HeartIcon`)
  - How to handle medical emergencies in the outpatient setting
  - When to transfer patients to emergency care
  - Managing acute exacerbations of chronic conditions
  - Handling psychiatric emergencies and crisis intervention
  - Preparing for and responding to mass casualty events
- **Preventive Care** (`Lightbulb`)
  - Evidence-based cancer screening recommendations by age and risk
  - Vaccination schedules and catch-up protocols for adults
  - Cardiovascular risk assessment and prevention strategies
  - Screening for depression, anxiety, and substance use
  - Preventive care for special populations (pregnant, elderly, immunocompromised)
- **Ethics & Legal Issues** (`UserIcon`)
  - How to handle conflicts between patient autonomy and medical recommendations
  - Managing patient confidentiality in the digital age
  - Ethical considerations in end-of-life care decisions
  - Legal implications of telemedicine and digital health
  - Handling medical errors and disclosure to patients
- **Technology & Innovation** (`MicroscopeIcon`)
  - How to integrate AI and machine learning into clinical practice
  - Best practices for telemedicine consultations
  - Using wearable devices and remote monitoring in patient care
  - Implementing electronic health records effectively
  - Digital health tools for patient engagement and education

#### 4.3 `MEDICAL_STUDENT_SUGGESTIONS`

- **Basic Sciences** (`MicroscopeIcon`)
  - Can you explain the pathophysiology of hypertension?
  - What are the key differences between type 1 and type 2 diabetes?
  - How does the renin-angiotensin system work?
  - What causes the symptoms of heart failure?
  - Explain the mechanism of action of common antibiotics.
- **Clinical Skills** (`StethoscopeIcon`)
  - How do I take a proper patient history?
  - What are the key components of a physical exam?
  - How do I present a patient case to my attending?
  - What's the SOAP note format and how do I use it?
  - How do I develop a differential diagnosis?
- **Study Strategies** (`BookOpenText`)
  - What's the best way to study for Step 1?
  - How do I memorize all the drug names and mechanisms?
  - What resources should I use for clinical rotations?
  - How do I prepare for shelf exams?
  - What's the most effective way to study anatomy?
- **Clinical Reasoning** (`Brain`)
  - How do I approach a patient with chest pain?
  - What's the workup for abdominal pain?
  - How do I think through a case of shortness of breath?
  - What causes altered mental status and how do I evaluate it?
  - How do I approach a patient with fever?
- **Medical Knowledge** (`Lightbulb`)
  - What are the most common causes of chest pain?
  - How do I interpret basic lab values?
  - What are the red flags I should never miss?
  - How do I read an ECG?
  - What are the signs of sepsis?
- **Professional Development** (`UserIcon`)
  - How do I choose a medical specialty?
  - What should I look for in a residency program?
  - How do I build relationships with faculty and mentors?
  - What extracurricular activities are important for residency?
  - How do I prepare for residency interviews?
- **Clinical Rotations** (`StethoscopeIcon`)
  - What should I expect on my internal medicine rotation?
  - How do I succeed on surgery rotation?
  - What's the best way to prepare for pediatrics?
  - How do I make the most of my OB/GYN rotation?
  - What should I focus on during emergency medicine?
- **Evidence-Based Medicine** (`MicroscopeIcon`)
  - How do I critically appraise a research paper?
  - What's the difference between relative and absolute risk?
  - How do I understand confidence intervals?
  - What makes a study valid and reliable?
  - How do I apply research findings to patient care?

#### 4.4 `SPECIALTY_SUGGESTIONS`

These override the general healthcare-professional set whenever `userRole === "doctor"` and `preferences.medicalSpecialty` matches a key below:

- **Cardiology**
  - *Cardiac Assessment* (`HeartIcon`): Latest guidelines for heart failure management · How to interpret ECG findings in chest pain · Best practices for cardiac rehabilitation · Managing patients with atrial fibrillation
  - *Cardiovascular Procedures* (`StethoscopeIcon`): Pre-procedure assessment for cardiac catheterization · Post-stent care and medication management · Managing complications after cardiac surgery · Follow-up protocols for pacemaker patients
- **Pediatrics**
  - *Child Development* (`UserIcon`): Developmental milestones for different ages · How to assess growth and nutrition in children · Behavioral concerns in toddlers and preschoolers · Managing common childhood illnesses
  - *Pediatric Care* (`StethoscopeIcon`): Vaccination schedules and catch-up protocols · Managing fever in children of different ages · Common pediatric emergencies and responses · Adolescent health and development issues
- **Oncology**
  - *Cancer Treatment* (`MicroscopeIcon`): Latest immunotherapy options for different cancers · Managing chemotherapy side effects · Palliative care approaches for cancer patients · Survivorship care planning
  - *Oncological Care* (`StethoscopeIcon`): Breaking cancer diagnosis to patients · Managing pain in cancer patients · Nutrition support during cancer treatment · Psychosocial support for cancer families
- **Psychiatry**
  - *Mental Health Assessment* (`Brain`): Screening tools for depression and anxiety · Risk assessment for suicidal patients · Evaluating psychosis and schizophrenia · Assessment of substance use disorders
  - *Psychiatric Treatment* (`StethoscopeIcon`): Medication management for bipolar disorder · Psychotherapy approaches for PTSD · Managing medication side effects in psychiatry · Crisis intervention strategies
- **Emergency Medicine**
  - *Emergency Assessment* (`StethoscopeIcon`): Rapid assessment of chest pain patients · Managing trauma patients in the ED · Toxicology emergencies and treatments · Pediatric emergency protocols
  - *Critical Care* (`HeartIcon`): Managing septic shock in the ED · Airway management in emergency situations · Cardiac arrest protocols and post-resuscitation care · Transfer criteria for critical patients
- **Internal Medicine**
  - *Internal Medicine* (`StethoscopeIcon`): Managing complex patients with multiple conditions · Preventive care guidelines for adults · Chronic disease management strategies · Hospital medicine and inpatient care
  - *General Medicine* (`UserIcon`): Evidence-based approaches to common conditions · Managing polypharmacy in elderly patients · Pre-operative medical clearance · Long-term care and geriatric medicine

```ts
export function getSuggestionsByRole(
  userRole?: "general" | "doctor" | "medical_student",
  medicalSpecialty?: string
) {
  if (userRole === "medical_student") {
    return MEDICAL_STUDENT_SUGGESTIONS
  }
  if (userRole === "doctor") {
    if (
      medicalSpecialty &&
      medicalSpecialty !== "general" &&
      SPECIALTY_SUGGESTIONS[medicalSpecialty as keyof typeof SPECIALTY_SUGGESTIONS]
    ) {
      return SPECIALTY_SUGGESTIONS[medicalSpecialty as keyof typeof SPECIALTY_SUGGESTIONS]
    }
    return HEALTHCARE_PROFESSIONAL_SUGGESTIONS
  }
  return GENERAL_USER_SUGGESTIONS
}
```

With the components, motion wiring, and datasets above, you can recreate the suggestions feature one-to-one in any React environment.


