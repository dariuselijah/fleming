export type HealthConnectorCategory =
  | "evidence"
  | "wearable"
  | "medical_records"
  | "native_mobile"

export type HealthConnectorAvailability = "live" | "beta" | "coming_soon"

export type HealthConnectorProtocol =
  | "http_api"
  | "oauth2"
  | "oauth1a"
  | "smart_on_fhir"
  | "aggregator"
  | "native_sdk"

export type HealthConnectorId =
  | "pubmed"
  | "guideline"
  | "clinical_trials"
  | "scholar_gateway"
  | "biorxiv"
  | "biorender"
  | "npi_registry"
  | "synapse"
  | "cms_coverage"
  | "chembl"
  | "openfda"
  | "benchling"
  | "fitbit"
  | "oura"
  | "whoop"
  | "withings"
  | "polar"
  | "garmin"
  | "apple_healthkit"
  | "android_health_connect"
  | "samsung_health"
  | "smart_epic"
  | "smart_cerner"
  | "smart_athena"
  | "aggregator_1uphealth"
  | "aggregator_health_gorilla"
  | "aggregator_redox"
  | "aggregator_particle"

export type ConnectorCredentialRequirement = {
  env: string
  label: string
  secret?: boolean
}

export type HealthConnectorDefinition = {
  id: HealthConnectorId
  name: string
  category: HealthConnectorCategory
  protocol: HealthConnectorProtocol
  availability: HealthConnectorAvailability
  description: string
  domain: string
  isFeatured: boolean
  comingSoonReason?: string
  requiredCredentials: ConnectorCredentialRequirement[]
  authorizationUrlEnv?: string
  tokenUrlEnv?: string
}

export type HealthConnectorRuntimeStatus =
  | "not_connected"
  | "connected"
  | "pending"
  | "error"
  | "coming_soon"

export type HealthConnectorStatusRecord = {
  connectorId: HealthConnectorId
  status: HealthConnectorRuntimeStatus
  updatedAt?: string | null
  lastError?: string | null
  lastSyncAt?: string | null
}

export type HealthConnectorConnectResponse = {
  connectorId: HealthConnectorId
  status: HealthConnectorRuntimeStatus
  message?: string
  redirectUrl?: string
}
