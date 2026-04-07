import { Attachment as AISDKAttachment } from "@ai-sdk/ui-utils"

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Attachment = {
  name: string
  contentType: string
  url: string
  filePath?: string // Store file path for secure access
}

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string
          name: string
          user_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          chat_id: string
          created_at: string
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_chat"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string | null
          updated_at: string | null
          id: string
          model: string | null
          patient_id: string | null
          project_id: string | null
          title: string | null
          user_id: string
          public: boolean
        }
        Insert: {
          created_at?: string | null
          updated_at?: string | null
          id?: string
          model?: string | null
          patient_id?: string | null
          project_id?: string | null
          title?: string | null
          user_id: string
          public?: boolean
        }
        Update: {
          created_at?: string | null
          updated_at?: string | null
          id?: string
          model?: string | null
          patient_id?: string | null
          project_id?: string | null
          title?: string | null
          user_id?: string
          public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          experimental_attachments: AISDKAttachment[]
          chat_id: string
          content: string | null
          created_at: string | null
          id: number
          role: "system" | "user" | "assistant" | "data"
          parts: Json | null
          user_id?: string | null
          message_group_id: string | null
          model: string | null
        }
        Insert: {
          experimental_attachments?: AISDKAttachment[]
          chat_id: string
          content: string | null
          created_at?: string | null
          id?: number
          role: "system" | "user" | "assistant" | "data"
          parts?: Json
          user_id?: string | null
          message_group_id?: string | null
          model?: string | null
        }
        Update: {
          experimental_attachments?: AISDKAttachment[]
          chat_id?: string
          content?: string | null
          created_at?: string | null
          id?: number
          role?: "system" | "user" | "assistant" | "data"
          parts?: Json
          user_id?: string | null
          message_group_id?: string | null
          model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_ingestion_jobs: {
        Row: {
          id: string
          upload_id: string
          user_id: string
          status: string
          parser_version: string
          attempt_count: number
          retryable: boolean
          error_message: string | null
          started_at: string | null
          finished_at: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          upload_id: string
          user_id: string
          status?: string
          parser_version?: string
          attempt_count?: number
          retryable?: boolean
          error_message?: string | null
          started_at?: string | null
          finished_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          upload_id?: string
          user_id?: string
          status?: string
          parser_version?: string
          attempt_count?: number
          retryable?: boolean
          error_message?: string | null
          started_at?: string | null
          finished_at?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_ingestion_jobs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "user_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_ingestion_jobs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_upload_assets: {
        Row: {
          id: string
          upload_id: string
          user_id: string
          source_unit_id: string | null
          asset_type: string
          label: string | null
          caption: string | null
          storage_bucket: string
          file_path: string
          mime_type: string
          width: number | null
          height: number | null
          sort_order: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          upload_id: string
          user_id: string
          source_unit_id?: string | null
          asset_type: string
          label?: string | null
          caption?: string | null
          storage_bucket?: string
          file_path: string
          mime_type: string
          width?: number | null
          height?: number | null
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          upload_id?: string
          user_id?: string
          source_unit_id?: string | null
          asset_type?: string
          label?: string | null
          caption?: string | null
          storage_bucket?: string
          file_path?: string
          mime_type?: string
          width?: number | null
          height?: number | null
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_upload_assets_source_unit_id_fkey"
            columns: ["source_unit_id"]
            isOneToOne: false
            referencedRelation: "user_upload_source_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_assets_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "user_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_visual_assets: {
        Row: {
          id: string
          source_id: string
          pmid: string | null
          pmcid: string | null
          doi: string | null
          article_url: string | null
          source_page_url: string | null
          figure_key: string
          asset_type: string
          label: string | null
          caption: string | null
          license: string | null
          storage_bucket: string
          file_path: string
          mime_type: string
          width: number | null
          height: number | null
          sort_order: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          source_id: string
          pmid?: string | null
          pmcid?: string | null
          doi?: string | null
          article_url?: string | null
          source_page_url?: string | null
          figure_key: string
          asset_type?: string
          label?: string | null
          caption?: string | null
          license?: string | null
          storage_bucket?: string
          file_path: string
          mime_type: string
          width?: number | null
          height?: number | null
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          source_id?: string
          pmid?: string | null
          pmcid?: string | null
          doi?: string | null
          article_url?: string | null
          source_page_url?: string | null
          figure_key?: string
          asset_type?: string
          label?: string | null
          caption?: string | null
          license?: string | null
          storage_bucket?: string
          file_path?: string
          mime_type?: string
          width?: number | null
          height?: number | null
          sort_order?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_upload_chunk_assets: {
        Row: {
          chunk_id: string
          asset_id: string
          created_at: string
        }
        Insert: {
          chunk_id: string
          asset_id: string
          created_at?: string
        }
        Update: {
          chunk_id?: string
          asset_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_upload_chunk_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "user_upload_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_chunk_assets_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "user_upload_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_upload_chunks: {
        Row: {
          id: string
          upload_id: string
          user_id: string
          source_unit_id: string
          preview_asset_id: string | null
          chunk_index: number
          chunk_text: string
          source_offset_start: number | null
          source_offset_end: number | null
          embedding: Json | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          upload_id: string
          user_id: string
          source_unit_id: string
          preview_asset_id?: string | null
          chunk_index: number
          chunk_text: string
          source_offset_start?: number | null
          source_offset_end?: number | null
          embedding?: Json | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          upload_id?: string
          user_id?: string
          source_unit_id?: string
          preview_asset_id?: string | null
          chunk_index?: number
          chunk_text?: string
          source_offset_start?: number | null
          source_offset_end?: number | null
          embedding?: Json | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_upload_chunks_preview_asset_id_fkey"
            columns: ["preview_asset_id"]
            isOneToOne: false
            referencedRelation: "user_upload_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_chunks_source_unit_id_fkey"
            columns: ["source_unit_id"]
            isOneToOne: false
            referencedRelation: "user_upload_source_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_chunks_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "user_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_chunks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_upload_source_units: {
        Row: {
          id: string
          upload_id: string
          user_id: string
          unit_type: string
          unit_number: number
          title: string | null
          extracted_text: string
          preview_bucket: string | null
          preview_path: string | null
          preview_mime_type: string | null
          width: number | null
          height: number | null
          ocr_status: string
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          upload_id: string
          user_id: string
          unit_type: string
          unit_number: number
          title?: string | null
          extracted_text?: string
          preview_bucket?: string | null
          preview_path?: string | null
          preview_mime_type?: string | null
          width?: number | null
          height?: number | null
          ocr_status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          upload_id?: string
          user_id?: string
          unit_type?: string
          unit_number?: number
          title?: string | null
          extracted_text?: string
          preview_bucket?: string | null
          preview_path?: string | null
          preview_mime_type?: string | null
          width?: number | null
          height?: number | null
          ocr_status?: string
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_upload_source_units_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "user_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_upload_source_units_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_uploads: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          file_name: string
          mime_type: string
          file_size: number
          storage_bucket: string
          original_file_path: string
          upload_kind: string
          status: string
          parser_version: string
          last_error: string | null
          metadata: Json
          last_ingested_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          file_name: string
          mime_type: string
          file_size: number
          storage_bucket?: string
          original_file_path: string
          upload_kind: string
          status?: string
          parser_version?: string
          last_error?: string | null
          metadata?: Json
          last_ingested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          file_name?: string
          mime_type?: string
          file_size?: number
          storage_bucket?: string
          original_file_path?: string
          upload_kind?: string
          status?: string
          parser_version?: string
          last_error?: string | null
          metadata?: Json
          last_ingested_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          anonymous: boolean | null
          created_at: string | null
          daily_message_count: number | null
          daily_reset: string | null
          display_name: string | null
          email: string
          favorite_models: string[] | null
          id: string
          message_count: number | null
          premium: boolean | null
          profile_image: string | null
          last_active_at: string | null
          daily_pro_message_count: number | null
          daily_pro_reset: string | null
          system_prompt: string | null
        }
        Insert: {
          anonymous?: boolean | null
          created_at?: string | null
          daily_message_count?: number | null
          daily_reset?: string | null
          display_name?: string | null
          email: string
          favorite_models?: string[] | null
          id: string
          message_count?: number | null
          premium?: boolean | null
          profile_image?: string | null
          last_active_at?: string | null
          daily_pro_message_count?: number | null
          daily_pro_reset?: string | null
          system_prompt?: string | null
        }
        Update: {
          anonymous?: boolean | null
          created_at?: string | null
          daily_message_count?: number | null
          daily_reset?: string | null
          display_name?: string | null
          email?: string
          favorite_models?: string[] | null
          id?: string
          message_count?: number | null
          premium?: boolean | null
          profile_image?: string | null
          last_active_at?: string | null
          daily_pro_message_count?: number | null
          daily_pro_reset?: string | null
          system_prompt?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string | null
          id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_keys: {
        Row: {
          user_id: string
          provider: string
          encrypted_key: string
          iv: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          provider: string
          encrypted_key: string
          iv: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          provider?: string
          encrypted_key?: string
          iv?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          user_id: string
          layout: string | null
          prompt_suggestions: boolean | null
          show_tool_invocations: boolean | null
          show_conversation_previews: boolean | null
          hidden_models: string[] | null
          user_role: string | null
          medical_specialty: string | null
          healthcare_agent_enabled: boolean | null
          medical_compliance_mode: boolean | null
          clinical_decision_support: boolean | null
          medical_literature_access: boolean | null
          health_context: string | null
          health_conditions: string[] | null
          medications: string[] | null
          allergies: string[] | null
          family_history: string | null
          lifestyle_factors: string | null
          student_school: string | null
          student_year: string | null
          clinician_name: string | null
          onboarding_completed: boolean | null
          practice_profile_completed: boolean | null
          practice_setup_guide_dismissed: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          user_id: string
          layout?: string | null
          prompt_suggestions?: boolean | null
          show_tool_invocations?: boolean | null
          show_conversation_previews?: boolean | null
          hidden_models?: string[] | null
          user_role?: string | null
          medical_specialty?: string | null
          healthcare_agent_enabled?: boolean | null
          medical_compliance_mode?: boolean | null
          clinical_decision_support?: boolean | null
          medical_literature_access?: boolean | null
          health_context?: string | null
          health_conditions?: string[] | null
          medications?: string[] | null
          allergies?: string[] | null
          family_history?: string | null
          lifestyle_factors?: string | null
          student_school?: string | null
          student_year?: string | null
          clinician_name?: string | null
          onboarding_completed?: boolean | null
          practice_profile_completed?: boolean | null
          practice_setup_guide_dismissed?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          user_id?: string
          layout?: string | null
          prompt_suggestions?: boolean | null
          show_tool_invocations?: boolean | null
          show_conversation_previews?: boolean | null
          hidden_models?: string[] | null
          user_role?: string | null
          medical_specialty?: string | null
          healthcare_agent_enabled?: boolean | null
          medical_compliance_mode?: boolean | null
          clinical_decision_support?: boolean | null
          medical_literature_access?: boolean | null
          health_context?: string | null
          health_conditions?: string[] | null
          medications?: string[] | null
          allergies?: string[] | null
          family_history?: string | null
          lifestyle_factors?: string | null
          student_school?: string | null
          student_year?: string | null
          clinician_name?: string | null
          onboarding_completed?: boolean | null
          practice_profile_completed?: boolean | null
          practice_setup_guide_dismissed?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          id: string
          name: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          created_at?: string | null
        }
        Relationships: []
      }
      practice_members: {
        Row: {
          id: string
          practice_id: string
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          user_id: string
          role?: string
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
      practice_crypto_wrappers: {
        Row: {
          id: string
          practice_id: string
          user_id: string
          salt: string
          wrapped_dek: string
          iv: string
          key_version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          user_id: string
          salt: string
          wrapped_dek: string
          iv: string
          key_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          user_id?: string
          salt?: string
          wrapped_dek?: string
          iv?: string
          key_version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_patients: {
        Row: {
          id: string
          practice_id: string
          profile_ciphertext: string | null
          profile_iv: string | null
          profile_version: number
          display_name_hint: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          profile_ciphertext?: string | null
          profile_iv?: string | null
          profile_version?: number
          display_name_hint?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          profile_ciphertext?: string | null
          profile_iv?: string | null
          profile_version?: number
          display_name_hint?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      clinical_encounters: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          provider_user_id: string | null
          status: string
          started_at: string
          ended_at: string | null
          chat_id: string | null
          state_ciphertext: string | null
          state_iv: string | null
          state_version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          provider_user_id?: string | null
          status?: string
          started_at?: string
          ended_at?: string | null
          chat_id?: string | null
          state_ciphertext?: string | null
          state_iv?: string | null
          state_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          provider_user_id?: string | null
          status?: string
          started_at?: string
          ended_at?: string | null
          chat_id?: string | null
          state_ciphertext?: string | null
          state_iv?: string | null
          state_version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      medical_schemes: {
        Row: {
          id: string
          code: string
          name: string
          administrator: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          name: string
          administrator?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code?: string
          name?: string
          administrator?: string | null
          created_at?: string
        }
        Relationships: []
      }
      clinical_session_keys: {
        Row: {
          id: string
          user_id: string
          practice_id: string
          enc_dek: string
          dek_iv: string
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          practice_id: string
          enc_dek: string
          dek_iv: string
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          practice_id?: string
          enc_dek?: string
          dek_iv?: string
          expires_at?: string
          created_at?: string
        }
        Relationships: []
      }
      practice_staff: {
        Row: {
          id: string
          practice_id: string
          linked_user_id: string | null
          display_name: string
          role: string | null
          credential_status: string | null
          email: string | null
          sensitive_ciphertext: string | null
          sensitive_iv: string | null
          sensitive_version: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          linked_user_id?: string | null
          display_name?: string
          role?: string | null
          credential_status?: string | null
          email?: string | null
          sensitive_ciphertext?: string | null
          sensitive_iv?: string | null
          sensitive_version?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          linked_user_id?: string | null
          display_name?: string
          role?: string | null
          credential_status?: string | null
          email?: string | null
          sensitive_ciphertext?: string | null
          sensitive_iv?: string | null
          sensitive_version?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_appointments: {
        Row: {
          id: string
          practice_id: string
          patient_id: string | null
          patient_name_snapshot: string | null
          provider_staff_id: string | null
          appt_date: string
          start_time: string
          end_time: string
          hour_val: number | null
          minute_val: number | null
          duration_minutes: number
          reason: string | null
          service: string | null
          status: string
          payment_type: string | null
          medical_aid: string | null
          member_number: string | null
          notes: string | null
          icd_codes: string[] | null
          total_fee: number | null
          linked_consult_id: string | null
          payload_ciphertext: string | null
          payload_iv: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id?: string | null
          patient_name_snapshot?: string | null
          provider_staff_id?: string | null
          appt_date: string
          start_time: string
          end_time: string
          hour_val?: number | null
          minute_val?: number | null
          duration_minutes?: number
          reason?: string | null
          service?: string | null
          status?: string
          payment_type?: string | null
          medical_aid?: string | null
          member_number?: string | null
          notes?: string | null
          icd_codes?: string[] | null
          total_fee?: number | null
          linked_consult_id?: string | null
          payload_ciphertext?: string | null
          payload_iv?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string | null
          patient_name_snapshot?: string | null
          provider_staff_id?: string | null
          appt_date?: string
          start_time?: string
          end_time?: string
          hour_val?: number | null
          minute_val?: number | null
          duration_minutes?: number
          reason?: string | null
          service?: string | null
          status?: string
          payment_type?: string | null
          medical_aid?: string | null
          member_number?: string | null
          notes?: string | null
          icd_codes?: string[] | null
          total_fee?: number | null
          linked_consult_id?: string | null
          payload_ciphertext?: string | null
          payload_iv?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_inventory_items: {
        Row: {
          id: string
          practice_id: string
          name: string
          nappi_code: string | null
          category: string
          current_stock: number
          min_stock: number
          unit: string
          unit_price: number
          cost_price: number | null
          supplier: string | null
          expires_at: string | null
          last_restocked: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          name: string
          nappi_code?: string | null
          category?: string
          current_stock?: number
          min_stock?: number
          unit?: string
          unit_price?: number
          cost_price?: number | null
          supplier?: string | null
          expires_at?: string | null
          last_restocked?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          name?: string
          nappi_code?: string | null
          category?: string
          current_stock?: number
          min_stock?: number
          unit?: string
          unit_price?: number
          cost_price?: number | null
          supplier?: string | null
          expires_at?: string | null
          last_restocked?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_inbox_messages: {
        Row: {
          id: string
          practice_id: string
          channel: string
          from_label: string
          preview: string
          read_flag: boolean
          patient_id: string | null
          message_at: string
          payload_ciphertext: string | null
          payload_iv: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          channel: string
          from_label: string
          preview: string
          read_flag?: boolean
          patient_id?: string | null
          message_at?: string
          payload_ciphertext?: string | null
          payload_iv?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          channel?: string
          from_label?: string
          preview?: string
          read_flag?: boolean
          patient_id?: string | null
          message_at?: string
          payload_ciphertext?: string | null
          payload_iv?: string | null
          created_at?: string
        }
        Relationships: []
      }
      practice_admin_notifications: {
        Row: {
          id: string
          practice_id: string
          type: string
          title: string
          detail: string | null
          read_flag: boolean
          action_tab: string | null
          action_entity_id: string | null
          notif_at: string
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          type: string
          title: string
          detail?: string | null
          read_flag?: boolean
          action_tab?: string | null
          action_entity_id?: string | null
          notif_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          type?: string
          title?: string
          detail?: string | null
          read_flag?: boolean
          action_tab?: string | null
          action_entity_id?: string | null
          notif_at?: string
          created_at?: string
        }
        Relationships: []
      }
      practice_flow_entries: {
        Row: {
          id: string
          practice_id: string
          patient_id: string | null
          patient_name_snapshot: string
          status: string
          doctor_staff_id: string | null
          room_number: string | null
          appointment_time: string | null
          check_in_time: string | null
          start_time: string | null
          end_time: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id?: string | null
          patient_name_snapshot: string
          status: string
          doctor_staff_id?: string | null
          room_number?: string | null
          appointment_time?: string | null
          check_in_time?: string | null
          start_time?: string | null
          end_time?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string | null
          patient_name_snapshot?: string
          status?: string
          doctor_staff_id?: string | null
          room_number?: string | null
          appointment_time?: string | null
          check_in_time?: string | null
          start_time?: string | null
          end_time?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clinical_rag_chunks: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          encounter_id: string
          chunk_index: number
          source_type: string
          chunk_key: string | null
          embedding: string | null
          content_tsv: unknown
          chunk_body: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          encounter_id: string
          chunk_index: number
          source_type: string
          chunk_key?: string | null
          embedding?: string | null
          content_tsv?: unknown
          chunk_body?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          encounter_id?: string
          chunk_index?: number
          source_type?: string
          chunk_key?: string | null
          embedding?: string | null
          content_tsv?: unknown
          chunk_body?: string | null
          created_at?: string
        }
        Relationships: []
      }
      practice_billing_settings: {
        Row: {
          practice_id: string
          provider_name: string
          medprax_discipline_code: string | null
          billing_ciphertext: string | null
          billing_iv: string | null
          billing_version: number
          updated_at: string
        }
        Insert: {
          practice_id: string
          provider_name?: string
          medprax_discipline_code?: string | null
          billing_ciphertext?: string | null
          billing_iv?: string | null
          billing_version?: number
          updated_at?: string
        }
        Update: {
          practice_id?: string
          provider_name?: string
          medprax_discipline_code?: string | null
          billing_ciphertext?: string | null
          billing_iv?: string | null
          billing_version?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: Record<string, never>
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
