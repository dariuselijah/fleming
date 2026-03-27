import type { StudentPluginDefinition, StudentPluginId } from "./types"

const STUDENT_PLUGIN_DEFINITIONS: StudentPluginDefinition[] = [
  {
    id: "lms_canvas",
    name: "Canvas LMS",
    category: "lms",
    availability: "beta",
    description: "Import course files, modules, and syllabus documents from Canvas.",
    syncDescription: "One-way import of modules, files, and assignment deadlines into workspace.",
    requiredCredentials: [],
    connectionFields: [
      {
        key: "baseUrl",
        label: "Canvas Base URL",
        required: true,
        placeholder: "https://your-school.instructure.com",
      },
      {
        key: "accessToken",
        label: "Canvas Access Token",
        required: true,
        secret: true,
      },
      {
        key: "courseIds",
        label: "Course IDs (comma separated, optional)",
        placeholder: "12345,67890",
      },
    ],
  },
  {
    id: "lms_moodle",
    name: "Moodle LMS",
    category: "lms",
    availability: "beta",
    description: "Sync Moodle course resources and assignment windows.",
    syncDescription: "Pull Moodle files and timetable-like deadlines into student collections.",
    requiredCredentials: [],
    connectionFields: [
      {
        key: "baseUrl",
        label: "Moodle Base URL",
        required: true,
        placeholder: "https://moodle.your-school.edu",
      },
      {
        key: "accessToken",
        label: "Moodle Web Service Token",
        required: true,
        secret: true,
      },
      {
        key: "courseIds",
        label: "Course IDs (comma separated, optional)",
        placeholder: "12,34",
      },
    ],
  },
  {
    id: "calendar_google",
    name: "Google Calendar",
    category: "calendar",
    availability: "live",
    description: "Push generated study plan blocks into Google Calendar.",
    syncDescription: "One-way export of planner sessions and review blocks.",
    requiredCredentials: [{ env: "GOOGLE_CALENDAR_CLIENT_ID", label: "Google Calendar Client ID" }],
  },
  {
    id: "literature_pubmed",
    name: "PubMed Literature",
    category: "literature",
    availability: "live",
    description: "Retrieve supporting literature for uploaded topics.",
    syncDescription: "Query PubMed by study graph topics and attach evidence references.",
    requiredCredentials: [],
  },
  {
    id: "speech_ocr_pipeline",
    name: "Speech + OCR Pipeline",
    category: "speech_ocr",
    availability: "beta",
    description: "Process lecture recordings and image-heavy slides into searchable text.",
    syncDescription: "Upload transcript/OCR artifacts and feed parser metadata back into StudyGraph.",
    requiredCredentials: [
      {
        env: "OPENAI_API_KEY",
        label: "OpenAI API Key",
        secret: true,
      },
      {
        env: "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
        label: "Azure Document Intelligence API Key",
        secret: true,
      },
    ],
  },
]

export function getStudentPluginCatalog(): StudentPluginDefinition[] {
  return STUDENT_PLUGIN_DEFINITIONS
}

export function getStudentPluginById(pluginId: string): StudentPluginDefinition | undefined {
  return STUDENT_PLUGIN_DEFINITIONS.find((plugin) => plugin.id === pluginId)
}

export function isStudentPluginId(value: string): value is StudentPluginId {
  return STUDENT_PLUGIN_DEFINITIONS.some((plugin) => plugin.id === value)
}
