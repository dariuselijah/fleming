type Environment = Record<string, string | undefined>

const REQUIRED_PRODUCTION_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CSRF_SECRET",
  "ENCRYPTION_KEY",
  "CRON_SECRET",
] as const

const PRODUCTION_ONLY_DISABLED_FLAGS = [
  "E2E_DISABLE_EXTERNAL_SERVICES",
  "MEDIKREDIT_DRY_RUN",
  "POLAR_SH_DRY_RUN",
  "STITCH_DRY_RUN",
] as const

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true"
}

export function validateProductionConfig(env: Environment): string[] {
  const errors: string[] = []

  for (const name of REQUIRED_PRODUCTION_VARS) {
    if (!env[name]?.trim()) errors.push(`${name} is required`)
  }

  for (const name of PRODUCTION_ONLY_DISABLED_FLAGS) {
    if (enabled(env[name])) errors.push(`${name} must be disabled in production`)
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (supabaseUrl) {
    try {
      if (new URL(supabaseUrl).protocol !== "https:") {
        errors.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS")
      }
    } catch {
      errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL")
    }
  }

  if ((env.CSRF_SECRET?.trim().length ?? 0) < 32) {
    errors.push("CSRF_SECRET must contain at least 32 characters")
  }

  if (env.MEDIKREDIT_ENABLE_XML_PREVIEW === "1") {
    errors.push("MEDIKREDIT_ENABLE_XML_PREVIEW must be disabled outside an approved accreditation session")
  }
  if (env.MEDIKREDIT_STORE_RAW_XML === "1") {
    errors.push("MEDIKREDIT_STORE_RAW_XML must be disabled outside an approved accreditation session")
  }
  if (
    env.MEDPRAX_CLAIM_PREFLIGHT_MODE !== "required" ||
    env.MEDPRAX_ALLOW_UNVERIFIED_CLAIMS === "1"
  ) {
    errors.push("MediKredit production claims require the Medprax preflight")
  }

  return errors
}

export function assertProductionConfig(env: Environment = process.env): void {
  const errors = validateProductionConfig(env)
  if (errors.length > 0) {
    throw new Error(`Unsafe production configuration:\n- ${errors.join("\n- ")}`)
  }
}

export function productionDryRunsDisabled(env: Environment = process.env): boolean {
  return (
    env.NODE_ENV === "production" &&
    PRODUCTION_ONLY_DISABLED_FLAGS.every((name) => !enabled(env[name]))
  )
}
