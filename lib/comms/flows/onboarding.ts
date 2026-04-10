import type { CommsAgentContext, CommsAgentResponse, FlowState, OnboardingFlowState } from "../types"
import { finalizePatientFromOnboarding } from "../tools"
import { processMediaOCR } from "../media-pipeline"

export async function runOnboardingFlow(
  ctx: CommsAgentContext,
  message: string,
  state: FlowState,
  media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  const os = state as OnboardingFlowState
  const step = os.step || "welcome"
  const collected = os.collected || {}

  switch (step) {
    case "welcome":
      return handleWelcome(ctx)
    case "collect_name":
      return handleCollectName(ctx, message, collected)
    case "collect_id":
      return handleCollectId(ctx, message, collected, media)
    case "collect_contact":
      return handleCollectContact(ctx, message, collected)
    case "collect_medical_aid":
      return handleCollectMedicalAid(ctx, message, collected)
    case "collect_aid_details":
      return handleCollectAidDetails(ctx, message, collected, media)
    case "collect_allergies":
      return handleCollectAllergies(ctx, message, collected)
    case "collect_chronic":
      return handleCollectChronic(ctx, message, collected)
    case "confirm":
      return handleConfirm(ctx, message, collected)
    default:
      return handleWelcome(ctx)
  }
}

function handleWelcome(ctx: CommsAgentContext): CommsAgentResponse {
  return {
    text: `Welcome to *${ctx.practiceName}*! 👋\n\nI'll help you register as a new patient. This takes about 2 minutes.\n\nYou can type your details or send *photos of your ID and medical aid card* — I'll extract the information automatically.\n\nLet's start: What is your *full name*?`,
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: { step: "collect_name", collected: {} },
    },
  }
}

function handleCollectName(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): CommsAgentResponse {
  const trimmed = message.trim()
  if (trimmed.toUpperCase() === "START") {
    return {
      text: "Great. What is your *full name*?",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "collect_name", collected: {} },
      },
    }
  }
  const name = trimmed
  if (name.length < 2) {
    return {
      text: "Please enter your full name (first and last name).",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "collect_name", collected },
      },
    }
  }

  return {
    text: `Thanks, *${name}*! What is your *SA ID number*? This is kept secure and encrypted.\n\n_(Reply SKIP if you don't have it handy)_`,
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: { step: "collect_id", collected: { ...collected, name } },
    },
  }
}

async function handleCollectId(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"],
  media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  // Photo of ID document sent — run OCR
  if (media && media.mimeType.startsWith("image/")) {
    try {
      const result = await processMediaOCR({
        storagePath: media.storagePath,
        mimeType: media.mimeType,
        documentType: "id_document",
      })

      if (result.structured?.idNumber) {
        const idNum = result.structured.idNumber as string
        const dob = result.structured.dateOfBirth as string
        const sex = result.structured.sex as string

        return {
          text: `I extracted your ID number from the photo: *${idNum.slice(0, 6)}****${idNum.slice(-2)}*\n\nWhat is your *email address*?\n\n_(Reply SKIP if you'd rather not provide one)_`,
          flowUpdate: {
            currentFlow: "onboarding",
            flowState: {
              step: "collect_contact",
              collected: { ...collected, idNumber: idNum, dateOfBirth: dob, sex, idDocumentPath: media.storagePath },
            },
          },
        }
      }
    } catch (err) {
      console.error("[onboarding] ID OCR failed:", err)
    }

    return {
      text: "I couldn't read the ID from that photo clearly. Could you type your *13-digit SA ID number* instead?\n\n_(Reply SKIP if you don't have it handy)_",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "collect_id", collected: { ...collected, idDocumentPath: media.storagePath } },
      },
    }
  }

  const upper = message.trim().toUpperCase()

  if (upper === "SKIP") {
    return {
      text: "No problem! What is your *email address*?\n\n_(Reply SKIP if you'd rather not provide one)_",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "collect_contact", collected },
      },
    }
  }

  const idNum = message.replace(/\s/g, "")
  if (!/^\d{13}$/.test(idNum)) {
    return {
      text: "That doesn't look like a valid SA ID number (13 digits). Please try again, send a *photo of your ID*, or reply *SKIP*.",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "collect_id", collected },
      },
    }
  }

  const yy = parseInt(idNum.slice(0, 2))
  const mm = idNum.slice(2, 4)
  const dd = idNum.slice(4, 6)
  const year = yy <= 26 ? 2000 + yy : 1900 + yy
  const dob = `${year}-${mm}-${dd}`
  const sex = parseInt(idNum.charAt(6)) >= 5 ? "M" : "F"

  return {
    text: `Got it! What is your *email address*?\n\n_(Reply SKIP if you'd rather not provide one)_`,
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: {
        step: "collect_contact",
        collected: { ...collected, idNumber: idNum, dateOfBirth: dob, sex },
      },
    },
  }
}

function handleCollectContact(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): CommsAgentResponse {
  const email = message.trim().toUpperCase() === "SKIP" ? undefined : message.trim()

  return {
    text: "Are you on *medical aid*?",
    interactive: {
      type: "buttons",
      buttons: [
        { id: "aid_yes", title: "Yes" },
        { id: "aid_no", title: "No, cash" },
      ],
    },
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: {
        step: "collect_medical_aid",
        collected: { ...collected, email },
      },
    },
  }
}

function handleCollectMedicalAid(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): CommsAgentResponse {
  const lower = message.toLowerCase()
  const hasAid = lower.includes("yes") || message === "aid_yes"

  if (!hasAid) {
    return {
      text: "Do you have any *known allergies*? (medications, foods, latex, etc.)\n\n_(Reply NONE if not)_",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: {
          step: "collect_allergies",
          collected: { ...collected, hasMedicalAid: false },
        },
      },
    }
  }

  return {
    text: "Which *medical aid scheme* are you on? (e.g. Discovery, Bonitas, GEMS, Momentum)\n\nYou can also send a *photo of your medical aid card* and I'll extract the details.",
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: {
        step: "collect_aid_details",
        collected: { ...collected, hasMedicalAid: true },
      },
    },
  }
}

async function handleCollectAidDetails(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"],
  media?: { storagePath: string; mimeType: string }
): Promise<CommsAgentResponse> {
  if (media && media.mimeType.startsWith("image/")) {
    let scheme = "From card"
    let memberNumber: string | undefined

    try {
      const result = await processMediaOCR({
        storagePath: media.storagePath,
        mimeType: media.mimeType,
        documentType: "medical_aid_card",
      })

      if (result.structured) {
        if (result.structured.possibleScheme) scheme = result.structured.possibleScheme as string
        if (result.structured.possibleMemberNumber) memberNumber = result.structured.possibleMemberNumber as string
      }
    } catch (err) {
      console.error("[onboarding] Medical aid card OCR failed:", err)
    }

    const detailsLine = memberNumber
      ? `I found: *${scheme}* — member number *${memberNumber}*. I'll save these.\n\n`
      : "Thanks for the photo! I've saved your medical aid card.\n\n"

    return {
      text: `${detailsLine}Do you have any *known allergies*? (medications, foods, latex, etc.)\n\n_(Reply NONE if not)_`,
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: {
          step: "collect_allergies",
          collected: { ...collected, medicalAidCardPath: media.storagePath, medicalAidScheme: scheme, memberNumber },
        },
      },
    }
  }

  // Text response — extract scheme and ask for member number
  const scheme = message.trim()
  if (!collected?.memberNumber) {
    return {
      text: `Got it — *${scheme}*. What is your *member number*?`,
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: {
          step: "collect_aid_details",
          collected: { ...collected, medicalAidScheme: scheme },
        },
      },
    }
  }

  return {
    text: "Do you have any *known allergies*? (medications, foods, latex, etc.)\n\n_(Reply NONE if not)_",
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: {
        step: "collect_allergies",
        collected: { ...collected, medicalAidScheme: scheme, memberNumber: message.trim() },
      },
    },
  }
}

function handleCollectAllergies(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): CommsAgentResponse {
  const allergies = message.trim().toUpperCase() === "NONE"
    ? []
    : message.split(",").map((a) => a.trim()).filter(Boolean)

  return {
    text: "Do you have any *chronic conditions*? (e.g. diabetes, hypertension, asthma)\n\n_(Reply NONE if not)_",
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: {
        step: "collect_chronic",
        collected: { ...collected, allergies },
      },
    },
  }
}

function handleCollectChronic(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): CommsAgentResponse {
  const conditions = message.trim().toUpperCase() === "NONE"
    ? []
    : message.split(",").map((c) => c.trim()).filter(Boolean)

  const updated = { ...collected, chronicConditions: conditions }

  // Build summary
  const lines = [
    `*Name:* ${updated?.name || "—"}`,
    updated?.idNumber ? `*ID:* ${updated.idNumber.slice(0, 6)}*****${updated.idNumber.slice(-2)}` : null,
    updated?.email ? `*Email:* ${updated.email}` : null,
    updated?.hasMedicalAid ? `*Medical Aid:* ${updated.medicalAidScheme || "Yes"}${updated.memberNumber ? ` (${updated.memberNumber})` : ""}` : "*Medical Aid:* Cash patient",
    updated?.allergies?.length ? `*Allergies:* ${updated.allergies.join(", ")}` : "*Allergies:* None",
    updated?.chronicConditions?.length ? `*Chronic:* ${updated.chronicConditions.join(", ")}` : "*Chronic:* None",
  ].filter(Boolean)

  return {
    text: `Here's a summary of your details:\n\n${lines.join("\n")}\n\nIs everything correct?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "confirm_yes", title: "Confirm" },
        { id: "confirm_edit", title: "Edit something" },
      ],
    },
    flowUpdate: {
      currentFlow: "onboarding",
      flowState: { step: "confirm", collected: updated },
    },
  }
}

async function handleConfirm(
  ctx: CommsAgentContext,
  message: string,
  collected: OnboardingFlowState["collected"]
): Promise<CommsAgentResponse> {
  if (message === "confirm_edit" || message.toLowerCase().includes("edit")) {
    return {
      text: "What would you like to change? You can say things like 'change my name' or 'update allergies'.",
      flowUpdate: {
        currentFlow: "onboarding",
        flowState: { step: "welcome", collected },
      },
    }
  }

  const patientId = await finalizePatientFromOnboarding({
    practiceId: ctx.practiceId,
    existingPatientId: ctx.thread.patientId,
    displayNameHint: collected?.name || "Unknown",
    phone: ctx.thread.externalParty,
  })

  return {
    text: `✅ *You're registered at ${ctx.practiceName}!*\n\nYou can now book appointments anytime by messaging us here.\n\nWould you like to *book your first appointment*?`,
    interactive: {
      type: "buttons",
      buttons: [
        { id: "book_yes", title: "Yes, book now" },
        { id: "book_no", title: "Not yet" },
      ],
    },
    toolCalls: [{
      tool: "createPatient",
      args: { name: collected?.name, phone: ctx.thread.externalParty },
      result: { patientId },
      timestamp: new Date().toISOString(),
    }],
    flowUpdate: { currentFlow: "none", flowState: {} },
    threadUpdate: { patientId },
  }
}
