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
          country_code: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          country_code?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          country_code?: string
          created_at?: string | null
        }
        Relationships: []
      }
      lab_partner_connections: {
        Row: {
          id: string
          practice_id: string
          lab_partner: string
          status: string
          inbound_auth_token: string | null
          doctor_snapshot: unknown
          last_outreach_at: string | null
          last_outreach_to: string | null
          last_outreach_error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          lab_partner: string
          status?: string
          inbound_auth_token?: string | null
          doctor_snapshot?: unknown
          last_outreach_at?: string | null
          last_outreach_to?: string | null
          last_outreach_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          lab_partner?: string
          status?: string
          inbound_auth_token?: string | null
          doctor_snapshot?: unknown
          last_outreach_at?: string | null
          last_outreach_to?: string | null
          last_outreach_error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      number_requests: {
        Row: {
          id: string
          practice_id: string
          country_code: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          country_code: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          country_code?: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
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
      practice_invitations: {
        Row: {
          id: string
          practice_id: string
          email: string
          role: string
          invited_by: string
          token_hash: string
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          email: string
          role: string
          invited_by: string
          token_hash: string
          expires_at: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          email?: string
          role?: string
          invited_by?: string
          token_hash?: string
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
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
          phone_e164: string | null
          profile_status: string
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
          phone_e164?: string | null
          profile_status?: string
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
          phone_e164?: string | null
          profile_status?: string
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
          last_indexed_at: string | null
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
          last_indexed_at?: string | null
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
          last_indexed_at?: string | null
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
          metadata: Record<string, unknown>
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
          metadata?: Record<string, unknown>
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
          metadata?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_channels: {
        Row: {
          id: string
          practice_id: string
          channel_type: string
          provider: string
          phone_number: string
          phone_number_sid: string | null
          whatsapp_sender_sid: string | null
          whatsapp_waba_id: string | null
          sender_display_name: string | null
          sender_registered_at: string | null
          vapi_assistant_id: string | null
          vapi_phone_number_id: string | null
          provider_config_encrypted: string | null
          config_iv: string | null
          status: string
          webhook_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          channel_type: string
          provider: string
          phone_number: string
          phone_number_sid?: string | null
          whatsapp_sender_sid?: string | null
          whatsapp_waba_id?: string | null
          sender_display_name?: string | null
          sender_registered_at?: string | null
          vapi_assistant_id?: string | null
          vapi_phone_number_id?: string | null
          provider_config_encrypted?: string | null
          config_iv?: string | null
          status?: string
          webhook_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          channel_type?: string
          provider?: string
          phone_number?: string
          phone_number_sid?: string | null
          whatsapp_sender_sid?: string | null
          whatsapp_waba_id?: string | null
          sender_display_name?: string | null
          sender_registered_at?: string | null
          vapi_assistant_id?: string | null
          vapi_phone_number_id?: string | null
          provider_config_encrypted?: string | null
          config_iv?: string | null
          status?: string
          webhook_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_threads: {
        Row: {
          id: string
          practice_id: string
          channel: string
          external_party: string
          patient_id: string | null
          status: string
          priority: string
          current_flow: string
          flow_state: Json
          last_message_at: string
          session_expires_at: string | null
          unread_count: number
          assigned_staff_id: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          channel: string
          external_party: string
          patient_id?: string | null
          status?: string
          priority?: string
          current_flow?: string
          flow_state?: Json
          last_message_at?: string
          session_expires_at?: string | null
          unread_count?: number
          assigned_staff_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          channel?: string
          external_party?: string
          patient_id?: string | null
          status?: string
          priority?: string
          current_flow?: string
          flow_state?: Json
          last_message_at?: string
          session_expires_at?: string | null
          unread_count?: number
          assigned_staff_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      thread_messages: {
        Row: {
          id: string
          thread_id: string
          practice_id: string
          direction: string
          sender_type: string
          content_type: string
          body: string | null
          media_url: string | null
          media_mime_type: string | null
          media_storage_path: string | null
          template_name: string | null
          interactive_payload: Json | null
          provider_message_id: string | null
          delivery_status: string
          failure_reason: string | null
          agent_tool_calls: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          practice_id: string
          direction: string
          sender_type: string
          content_type?: string
          body?: string | null
          media_url?: string | null
          media_mime_type?: string | null
          media_storage_path?: string | null
          template_name?: string | null
          interactive_payload?: Json | null
          provider_message_id?: string | null
          delivery_status?: string
          failure_reason?: string | null
          agent_tool_calls?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          practice_id?: string
          direction?: string
          sender_type?: string
          content_type?: string
          body?: string | null
          media_url?: string | null
          media_mime_type?: string | null
          media_storage_path?: string | null
          template_name?: string | null
          interactive_payload?: Json | null
          provider_message_id?: string | null
          delivery_status?: string
          failure_reason?: string | null
          agent_tool_calls?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      voice_calls: {
        Row: {
          id: string
          thread_id: string
          practice_id: string
          direction: string
          vapi_call_id: string | null
          twilio_call_sid: string | null
          duration_seconds: number | null
          recording_url: string | null
          recording_storage_path: string | null
          transcript: string | null
          summary: string | null
          tool_calls_log: Json | null
          ended_reason: string | null
          cost_cents: number | null
          intent: string | null
          structured_outcome: Json | null
          appointment_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          practice_id: string
          direction: string
          vapi_call_id?: string | null
          twilio_call_sid?: string | null
          duration_seconds?: number | null
          recording_url?: string | null
          recording_storage_path?: string | null
          transcript?: string | null
          summary?: string | null
          tool_calls_log?: Json | null
          ended_reason?: string | null
          cost_cents?: number | null
          intent?: string | null
          structured_outcome?: Json | null
          appointment_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          thread_id?: string
          practice_id?: string
          direction?: string
          vapi_call_id?: string | null
          twilio_call_sid?: string | null
          duration_seconds?: number | null
          recording_url?: string | null
          recording_storage_path?: string | null
          transcript?: string | null
          summary?: string | null
          tool_calls_log?: Json | null
          ended_reason?: string | null
          cost_cents?: number | null
          intent?: string | null
          structured_outcome?: Json | null
          appointment_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      communication_interactions: {
        Row: {
          id: string
          practice_id: string
          patient_id: string | null
          appointment_id: string | null
          thread_id: string | null
          voice_call_id: string | null
          portal_session_id: string | null
          channel: string
          event_type: string
          provider: string | null
          provider_event_id: string | null
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id?: string | null
          appointment_id?: string | null
          thread_id?: string | null
          voice_call_id?: string | null
          portal_session_id?: string | null
          channel: string
          event_type: string
          provider?: string | null
          provider_event_id?: string | null
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string | null
          appointment_id?: string | null
          thread_id?: string | null
          voice_call_id?: string | null
          portal_session_id?: string | null
          channel?: string
          event_type?: string
          provider?: string | null
          provider_event_id?: string | null
          payload?: Json
          created_at?: string
        }
        Relationships: []
      }
      message_templates: {
        Row: {
          id: string
          practice_id: string
          template_key: string
          channel: string
          provider: string
          provider_template_id: string | null
          body_template: string
          rich_card_payload: Json | null
          variables: Json | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          template_key: string
          channel: string
          provider?: string
          provider_template_id?: string | null
          body_template: string
          rich_card_payload?: Json | null
          variables?: Json | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          template_key?: string
          channel?: string
          provider?: string
          provider_template_id?: string | null
          body_template?: string
          rich_card_payload?: Json | null
          variables?: Json | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      patient_access_tokens: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          token_hash: string
          purpose: string
          appointment_id: string | null
          invoice_id: string | null
          expires_at: string
          used_at: string | null
          elevated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          token_hash: string
          purpose: string
          appointment_id?: string | null
          invoice_id?: string | null
          expires_at: string
          used_at?: string | null
          elevated_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          token_hash?: string
          purpose?: string
          appointment_id?: string | null
          invoice_id?: string | null
          expires_at?: string
          used_at?: string | null
          elevated_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      patient_consent: {
        Row: {
          id: string
          practice_id: string
          patient_id: string | null
          external_party: string
          channel: string
          consent_type: string
          granted: boolean
          granted_at: string | null
          revoked_at: string | null
          evidence_message_id: string | null
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id?: string | null
          external_party: string
          channel: string
          consent_type: string
          granted?: boolean
          granted_at?: string | null
          revoked_at?: string | null
          evidence_message_id?: string | null
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string | null
          external_party?: string
          channel?: string
          consent_type?: string
          granted?: boolean
          granted_at?: string | null
          revoked_at?: string | null
          evidence_message_id?: string | null
        }
        Relationships: []
      }
      portal_sessions: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          access_token_id: string
          purpose: string
          started_at: string
          last_activity_at: string
          elevated: boolean
          ip_address: string | null
          user_agent: string | null
          ended_at: string | null
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          access_token_id: string
          purpose: string
          started_at?: string
          last_activity_at?: string
          elevated?: boolean
          ip_address?: string | null
          user_agent?: string | null
          ended_at?: string | null
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          access_token_id?: string
          purpose?: string
          started_at?: string
          last_activity_at?: string
          elevated?: boolean
          ip_address?: string | null
          user_agent?: string | null
          ended_at?: string | null
        }
        Relationships: []
      }
      rcs_agents: {
        Row: {
          id: string
          practice_id: string
          provider: string
          agent_id: string | null
          brand_name: string | null
          verification_status: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          provider?: string
          agent_id?: string | null
          brand_name?: string | null
          verification_status?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          provider?: string
          agent_id?: string | null
          brand_name?: string | null
          verification_status?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          id: string
          practice_id: string | null
          source: string
          event_type: string | null
          payload: Json
          error_message: string | null
          retry_count: number
          next_retry_at: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          practice_id?: string | null
          source: string
          event_type?: string | null
          payload: Json
          error_message?: string | null
          retry_count?: number
          next_retry_at?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string | null
          source?: string
          event_type?: string | null
          payload?: Json
          error_message?: string | null
          retry_count?: number
          next_retry_at?: string | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      practice_hours: {
        Row: {
          id: string
          practice_id: string
          day_of_week: number
          open_time: string
          close_time: string
          is_closed: boolean
          label: string | null
        }
        Insert: {
          id?: string
          practice_id: string
          day_of_week: number
          open_time?: string
          close_time?: string
          is_closed?: boolean
          label?: string | null
        }
        Update: {
          id?: string
          practice_id?: string
          day_of_week?: number
          open_time?: string
          close_time?: string
          is_closed?: boolean
          label?: string | null
        }
        Relationships: []
      }
      practice_faqs: {
        Row: {
          id: string
          practice_id: string
          category: string
          question: string
          answer: string
          keywords: string[] | null
          sort_order: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          category?: string
          question: string
          answer: string
          keywords?: string[] | null
          sort_order?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          category?: string
          question?: string
          answer?: string
          keywords?: string[] | null
          sort_order?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_services: {
        Row: {
          id: string
          practice_id: string
          name: string
          description: string | null
          duration_minutes: number
          fee: number | null
          category: string | null
          requires_referral: boolean
          preparation_instructions: string | null
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          name: string
          description?: string | null
          duration_minutes?: number
          fee?: number | null
          category?: string | null
          requires_referral?: boolean
          preparation_instructions?: string | null
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          name?: string
          description?: string | null
          duration_minutes?: number
          fee?: number | null
          category?: string | null
          requires_referral?: boolean
          preparation_instructions?: string | null
          active?: boolean
          created_at?: string
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
      medikredit_providers: {
        Row: {
          practice_id: string
          vendor_id: string | null
          bhf_number: string | null
          hpc_number: string | null
          group_practice_number: string | null
          pc_number: string | null
          works_number: string | null
          prescriber_mem_acc_nbr: string | null
          discipline: string | null
          vendor_version: string | null
          provider_display_name: string | null
          use_test_provider: boolean
          extra_settings: Record<string, unknown>
          created_at: string
          updated_at: string
        }
        Insert: {
          practice_id: string
          vendor_id?: string | null
          bhf_number?: string | null
          hpc_number?: string | null
          group_practice_number?: string | null
          pc_number?: string | null
          works_number?: string | null
          prescriber_mem_acc_nbr?: string | null
          discipline?: string | null
          vendor_version?: string | null
          provider_display_name?: string | null
          use_test_provider?: boolean
          extra_settings?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Update: {
          practice_id?: string
          vendor_id?: string | null
          bhf_number?: string | null
          hpc_number?: string | null
          group_practice_number?: string | null
          pc_number?: string | null
          works_number?: string | null
          prescriber_mem_acc_nbr?: string | null
          discipline?: string | null
          vendor_version?: string | null
          provider_display_name?: string | null
          use_test_provider?: boolean
          extra_settings?: Record<string, unknown>
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      eligibility_checks: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          check_type: string
          tx_nbr: string | null
          res: string | null
          response: Record<string, unknown>
          raw_xml: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          check_type: string
          tx_nbr?: string | null
          res?: string | null
          response?: Record<string, unknown>
          raw_xml?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          check_type?: string
          tx_nbr?: string | null
          res?: string | null
          response?: Record<string, unknown>
          raw_xml?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: []
      }
      practice_claims: {
        Row: {
          id: string
          practice_id: string
          patient_id: string
          clinical_encounter_id: string | null
          status: string
          lines: unknown[]
          medikredit_response: Record<string, unknown> | null
          submission_fingerprint: string | null
          tx_nbr: string | null
          orig_code: string | null
          raw_last_response_xml: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id: string
          clinical_encounter_id?: string | null
          status?: string
          lines?: unknown[]
          medikredit_response?: Record<string, unknown> | null
          submission_fingerprint?: string | null
          tx_nbr?: string | null
          orig_code?: string | null
          raw_last_response_xml?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string
          clinical_encounter_id?: string | null
          status?: string
          lines?: unknown[]
          medikredit_response?: Record<string, unknown> | null
          submission_fingerprint?: string | null
          tx_nbr?: string | null
          orig_code?: string | null
          raw_last_response_xml?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_invoices: {
        Row: {
          id: string
          practice_id: string
          patient_id: string | null
          claim_id: string | null
          clinical_encounter_id: string | null
          appointment_id: string | null
          invoice_number: string
          currency: string
          subtotal_cents: number
          vat_cents: number
          total_cents: number
          amount_paid_cents: number
          amount_due_cents: number
          billing_mode: string
          status: string
          practice_snapshot: Record<string, unknown>
          patient_snapshot: Record<string, unknown>
          line_items: unknown[]
          notes: string | null
          pdf_storage_path: string | null
          issued_at: string | null
          due_at: string | null
          last_reminded_at: string | null
          paid_at: string | null
          voided_at: string | null
          write_off_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          patient_id?: string | null
          claim_id?: string | null
          clinical_encounter_id?: string | null
          appointment_id?: string | null
          invoice_number: string
          currency?: string
          subtotal_cents?: number
          vat_cents?: number
          total_cents?: number
          amount_paid_cents?: number
          billing_mode?: string
          status?: string
          practice_snapshot?: Record<string, unknown>
          patient_snapshot?: Record<string, unknown>
          line_items?: unknown[]
          notes?: string | null
          pdf_storage_path?: string | null
          issued_at?: string | null
          due_at?: string | null
          last_reminded_at?: string | null
          paid_at?: string | null
          voided_at?: string | null
          write_off_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          patient_id?: string | null
          claim_id?: string | null
          clinical_encounter_id?: string | null
          appointment_id?: string | null
          invoice_number?: string
          currency?: string
          subtotal_cents?: number
          vat_cents?: number
          total_cents?: number
          amount_paid_cents?: number
          billing_mode?: string
          status?: string
          practice_snapshot?: Record<string, unknown>
          patient_snapshot?: Record<string, unknown>
          line_items?: unknown[]
          notes?: string | null
          pdf_storage_path?: string | null
          issued_at?: string | null
          due_at?: string | null
          last_reminded_at?: string | null
          paid_at?: string | null
          voided_at?: string | null
          write_off_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_payments: {
        Row: {
          id: string
          practice_id: string
          invoice_id: string
          provider: string
          method: string | null
          amount_cents: number
          currency: string
          status: string
          provider_checkout_id: string | null
          provider_order_id: string | null
          provider_payment_intent: string | null
          provider_customer_id: string | null
          provider_raw: Record<string, unknown> | null
          received_by_user_id: string | null
          cash_drawer_session_id: string | null
          reference: string | null
          idempotency_key: string | null
          failure_reason: string | null
          created_at: string
          updated_at: string
          succeeded_at: string | null
          refunded_at: string | null
        }
        Insert: {
          id?: string
          practice_id: string
          invoice_id: string
          provider: string
          method?: string | null
          amount_cents: number
          currency?: string
          status?: string
          provider_checkout_id?: string | null
          provider_order_id?: string | null
          provider_payment_intent?: string | null
          provider_customer_id?: string | null
          provider_raw?: Record<string, unknown> | null
          received_by_user_id?: string | null
          cash_drawer_session_id?: string | null
          reference?: string | null
          idempotency_key?: string | null
          failure_reason?: string | null
          created_at?: string
          updated_at?: string
          succeeded_at?: string | null
          refunded_at?: string | null
        }
        Update: {
          id?: string
          practice_id?: string
          invoice_id?: string
          provider?: string
          method?: string | null
          amount_cents?: number
          currency?: string
          status?: string
          provider_checkout_id?: string | null
          provider_order_id?: string | null
          provider_payment_intent?: string | null
          provider_customer_id?: string | null
          provider_raw?: Record<string, unknown> | null
          received_by_user_id?: string | null
          cash_drawer_session_id?: string | null
          reference?: string | null
          idempotency_key?: string | null
          failure_reason?: string | null
          created_at?: string
          updated_at?: string
          succeeded_at?: string | null
          refunded_at?: string | null
        }
        Relationships: []
      }
      practice_receipts: {
        Row: {
          id: string
          practice_id: string
          invoice_id: string
          payment_id: string
          receipt_number: string
          pdf_storage_path: string | null
          snapshot: Record<string, unknown>
          delivered_email_at: string | null
          delivered_sms_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          invoice_id: string
          payment_id: string
          receipt_number: string
          pdf_storage_path?: string | null
          snapshot?: Record<string, unknown>
          delivered_email_at?: string | null
          delivered_sms_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          invoice_id?: string
          payment_id?: string
          receipt_number?: string
          pdf_storage_path?: string | null
          snapshot?: Record<string, unknown>
          delivered_email_at?: string | null
          delivered_sms_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      practice_credit_notes: {
        Row: {
          id: string
          practice_id: string
          invoice_id: string
          payment_id: string | null
          credit_note_number: string
          amount_cents: number
          currency: string
          reason: string | null
          pdf_storage_path: string | null
          snapshot: Record<string, unknown>
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          invoice_id: string
          payment_id?: string | null
          credit_note_number: string
          amount_cents: number
          currency?: string
          reason?: string | null
          pdf_storage_path?: string | null
          snapshot?: Record<string, unknown>
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          invoice_id?: string
          payment_id?: string | null
          credit_note_number?: string
          amount_cents?: number
          currency?: string
          reason?: string | null
          pdf_storage_path?: string | null
          snapshot?: Record<string, unknown>
          created_at?: string
        }
        Relationships: []
      }
      practice_billing_sequences: {
        Row: {
          practice_id: string
          kind: string
          next_value: number
          prefix: string
        }
        Insert: {
          practice_id: string
          kind: string
          next_value?: number
          prefix?: string
        }
        Update: {
          practice_id?: string
          kind?: string
          next_value?: number
          prefix?: string
        }
        Relationships: []
      }
      payment_provider_events: {
        Row: {
          id: string
          provider: string
          provider_event_id: string
          event_type: string
          signature_valid: boolean
          payload: Record<string, unknown>
          processed_at: string | null
          received_at: string
        }
        Insert: {
          id?: string
          provider: string
          provider_event_id: string
          event_type: string
          signature_valid?: boolean
          payload?: Record<string, unknown>
          processed_at?: string | null
          received_at?: string
        }
        Update: {
          id?: string
          provider?: string
          provider_event_id?: string
          event_type?: string
          signature_valid?: boolean
          payload?: Record<string, unknown>
          processed_at?: string | null
          received_at?: string
        }
        Relationships: []
      }
      billing_audit_log: {
        Row: {
          id: string
          practice_id: string
          actor_user_id: string | null
          entity_type: string
          entity_id: string
          action: string
          diff: Record<string, unknown> | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          practice_id: string
          actor_user_id?: string | null
          entity_type: string
          entity_id: string
          action: string
          diff?: Record<string, unknown> | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          practice_id?: string
          actor_user_id?: string | null
          entity_type?: string
          entity_id?: string
          action?: string
          diff?: Record<string, unknown> | null
          reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      cash_drawer_sessions: {
        Row: {
          id: string
          practice_id: string
          opened_by: string
          opened_at: string
          opening_float_cents: number
          closed_by: string | null
          closed_at: string | null
          counted_cash_cents: number | null
          variance_cents: number | null
          notes: string | null
          z_report_storage_path: string | null
        }
        Insert: {
          id?: string
          practice_id: string
          opened_by: string
          opened_at?: string
          opening_float_cents?: number
          closed_by?: string | null
          closed_at?: string | null
          counted_cash_cents?: number | null
          variance_cents?: number | null
          notes?: string | null
          z_report_storage_path?: string | null
        }
        Update: {
          id?: string
          practice_id?: string
          opened_by?: string
          opened_at?: string
          opening_float_cents?: number
          closed_by?: string | null
          closed_at?: string | null
          counted_cash_cents?: number | null
          variance_cents?: number | null
          notes?: string | null
          z_report_storage_path?: string | null
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
      next_billing_number: {
        Args: {
          p_practice_id: string
          p_kind: string
          p_default_prefix?: string
        }
        Returns: string
      }
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
