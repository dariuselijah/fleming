/**
 * Workflow Registry for slash commands.
 *
 * Each command maps to a workflow that defines how the response should be
 * structured, what tools are needed, and what clinical block type to render.
 */

import type { MedicalBlockType } from "@/lib/clinical-workspace/types"

export interface CommandWorkflow {
  commandId: string
  blockType: MedicalBlockType | null
  systemPromptSuffix: string
  requiredTools: string[]
  responseFormat: "structured_block" | "free_text" | "overlay_action"
}

const CONCISE_RULE =
  "Be concise and clinically precise. No filler or introductory preamble. Use bullet points and short sentences. Only include clinically relevant information."

export const WORKFLOW_REGISTRY: Record<string, CommandWorkflow> = {
  summary: {
    commandId: "summary",
    blockType: "SOAP",
    systemPromptSuffix: `Generate a clinical summary. Sections: Presenting Complaint, Examination Findings, Assessment, Plan. ${CONCISE_RULE} Max 250 words.`,
    requiredTools: ["askFleming"],
    responseFormat: "structured_block",
  },
  interactions: {
    commandId: "interactions",
    blockType: "ALERT",
    systemPromptSuffix: `Check drug interactions. For each: severity (Major/Moderate/Minor), mechanism, clinical recommendation. ${CONCISE_RULE}`,
    requiredTools: ["drugInteractionChecker"],
    responseFormat: "structured_block",
  },
  evidence: {
    commandId: "evidence",
    blockType: "NOTE",
    systemPromptSuffix: `Search medical evidence. Provide synthesized answers with numbered citations [1][2]. Each citation: Journal, Year, Evidence Level, PMID/URL. ${CONCISE_RULE} Max 300 words excluding citations.`,
    requiredTools: ["askFleming", "webSearch"],
    responseFormat: "structured_block",
  },
  drug: {
    commandId: "drug",
    blockType: "PRESCRIPTION",
    systemPromptSuffix: `Provide drug information: Generic name, class, dosing, route, frequency, key side effects, contraindications, interactions. ${CONCISE_RULE} Max 200 words.`,
    requiredTools: ["askFleming"],
    responseFormat: "structured_block",
  },
  icd: {
    commandId: "icd",
    blockType: "BILLING",
    systemPromptSuffix: `Suggest ICD-10 codes. For each: code, description, confidence (High/Medium/Low). Primary diagnosis first. ${CONCISE_RULE}`,
    requiredTools: ["askFleming"],
    responseFormat: "structured_block",
  },
  prescribe: {
    commandId: "prescribe",
    blockType: "PRESCRIPTION",
    systemPromptSuffix: `Help prescribe: Drug, strength, form, route, frequency, duration, quantity, repeats. Check interactions and allergies. ${CONCISE_RULE}`,
    requiredTools: ["drugInteractionChecker", "askFleming"],
    responseFormat: "structured_block",
  },
  refer: {
    commandId: "refer",
    blockType: "REFERRAL",
    systemPromptSuffix: `Generate a referral letter. Include: Reason, clinical summary, investigations, current medications, specific questions for specialist. ${CONCISE_RULE} Max 300 words.`,
    requiredTools: ["askFleming"],
    responseFormat: "structured_block",
  },
  soap: {
    commandId: "soap",
    blockType: "SOAP",
    systemPromptSuffix: `Format a SOAP note from the consult context only (no literature retrieval). S: CC, HPI, PMH, Meds, Allergies, ROS. O: Vitals, PE, Labs. A: Diagnoses + ICD-10. P: Per diagnosis. Do not use [T], [E], or [H] source tags. ${CONCISE_RULE}`,
    requiredTools: [],
    responseFormat: "structured_block",
  },
  vitals: {
    commandId: "vitals",
    blockType: "VITAL",
    systemPromptSuffix: `Document vital signs: BP (arm/position/cuff/repeat), HR, RR, Temp, SpO2, Weight, Height, BMI, Pain. Interpret abnormalities. ${CONCISE_RULE}`,
    requiredTools: [],
    responseFormat: "structured_block",
  },
  verify: {
    commandId: "verify",
    blockType: "CLAIM",
    systemPromptSuffix: `Verify medical aid eligibility: Member status, benefit limits, pre-auth requirements, chronic coverage. ${CONCISE_RULE}`,
    requiredTools: [],
    responseFormat: "structured_block",
  },
  claim: {
    commandId: "claim",
    blockType: "CLAIM",
    systemPromptSuffix: `Prepare a billing claim: ICD-10 codes (primary + secondary), tariff codes, line items, clinical motivation if required. ${CONCISE_RULE}`,
    requiredTools: [],
    responseFormat: "structured_block",
  },
}

export function getWorkflow(commandId: string): CommandWorkflow | null {
  return WORKFLOW_REGISTRY[commandId] ?? null
}

export function getBlockTypeForCommand(commandId: string): MedicalBlockType | null {
  return WORKFLOW_REGISTRY[commandId]?.blockType ?? null
}
