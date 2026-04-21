/**
 * Client-safe metadata for admin “test send” UI. Keep in sync with BUILTIN_TEMPLATES in templates.ts.
 */
export type TemplateTestKey =
  | "appointment_reminder_24h"
  | "appointment_reminder_1h"
  | "appointment_confirmation"
  | "welcome_onboarding"
  | "payment_reminder"
  | "post_visit_followup"
  | "lab_results_ready"

export type TemplateTestDef = {
  key: TemplateTestKey
  title: string
  description: string
  /** Labels for {{1}}… in order */
  fieldLabels: string[]
  /** Default values for {{1}}…{{n}} (keys as "1","2",…) */
  defaults: Record<string, string>
}

export const TEMPLATE_TEST_DEFINITIONS: TemplateTestDef[] = [
  {
    key: "appointment_reminder_24h",
    title: "24h appointment reminder",
    description: "Utility template — three variables.",
    fieldLabels: ["Time", "Doctor", "Practice name"],
    defaults: { "1": "09:00 tomorrow", "2": "Dr. Patel", "3": "Demo Practice" },
  },
  {
    key: "appointment_reminder_1h",
    title: "1h appointment reminder",
    description: "Short reminder with practice name.",
    fieldLabels: ["Practice name"],
    defaults: { "1": "Demo Practice" },
  },
  {
    key: "appointment_confirmation",
    title: "Appointment confirmation",
    description: "Service, date, time, doctor.",
    fieldLabels: ["Service", "Date", "Time", "Doctor"],
    defaults: {
      "1": "Consultation",
      "2": "Mon 14 Apr 2026",
      "3": "10:00",
      "4": "Dr. Patel",
    },
  },
  {
    key: "welcome_onboarding",
    title: "Welcome / onboarding",
    description: "Patient name and practice.",
    fieldLabels: ["Patient name", "Practice name"],
    defaults: { "1": "Alex", "2": "Demo Practice" },
  },
  {
    key: "payment_reminder",
    title: "Payment reminder",
    description: "Name, amount (rand), visit date.",
    fieldLabels: ["Patient name", "Amount (R)", "Visit date"],
    defaults: { "1": "Alex", "2": "450", "3": "1 Apr 2026" },
  },
  {
    key: "post_visit_followup",
    title: "Post-visit follow-up",
    description: "Check-in after a visit.",
    fieldLabels: ["Patient name", "Practice name"],
    defaults: { "1": "Alex", "2": "Demo Practice" },
  },
  {
    key: "lab_results_ready",
    title: "Lab results ready",
    description: "Notify patient results are available.",
    fieldLabels: ["Patient name", "Practice name"],
    defaults: { "1": "Alex", "2": "Demo Practice" },
  },
]
