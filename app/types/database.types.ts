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
          type: string | null
          discipline: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          user_id: string
          type?: string | null
          discipline?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
          type?: string | null
          discipline?: string | null
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
          rag_enabled: boolean | null
          rag_threshold: number | null
          rag_max_results: number | null
          rag_file_types: string[] | null
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
          rag_enabled?: boolean | null
          rag_threshold?: number | null
          rag_max_results?: number | null
          rag_file_types?: string[] | null
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
          rag_enabled?: boolean | null
          rag_threshold?: number | null
          rag_max_results?: number | null
          rag_file_types?: string[] | null
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
      study_materials: {
        Row: {
          id: string
          title: string
          content: string
          user_id: string
          material_type: string | null
          discipline: string | null
          content_length: number | null
          processing_status: string | null
          last_embedded_at: string | null
          search_metadata: any | null
          combined_embedding: number[] | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          content: string
          user_id: string
          material_type?: string | null
          discipline?: string | null
          content_length?: number | null
          processing_status?: string | null
          last_embedded_at?: string | null
          search_metadata?: any | null
          combined_embedding?: number[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          content?: string
          user_id?: string
          material_type?: string | null
          discipline?: string | null
          content_length?: number | null
          processing_status?: string | null
          last_embedded_at?: string | null
          search_metadata?: any | null
          combined_embedding?: number[] | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          id: string
          name: string
          user_id: string
          type: string | null
          discipline: string | null
          description: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          user_id: string
          type?: string | null
          discipline?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
          type?: string | null
          discipline?: string | null
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      study_session_materials: {
        Row: {
          id: string
          session_id: string
          material_id: string
          user_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          material_id: string
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          material_id?: string
          user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_session_materials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_session_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_session_materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          id: string
          material_id: string
          chunk_content: string
          chunk_index: number
          user_id: string
          embedding: number[] | null
          created_at: string | null
        }
        Insert: {
          id?: string
          material_id: string
          chunk_content: string
          chunk_index: number
          user_id: string
          embedding?: number[] | null
          created_at?: string | null
        }
        Update: {
          id?: string
          material_id?: string
          chunk_content?: string
          chunk_index?: number
          user_id?: string
          embedding?: number[] | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "study_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_search_logs: {
        Row: {
          id: string
          user_id: string
          query: string
          results_count: number
          search_type: string
          response_time_ms: number
          cache_hit: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          query: string
          results_count: number
          search_type: string
          response_time_ms: number
          cache_hit: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          query?: string
          results_count?: number
          search_type?: string
          response_time_ms?: number
          cache_hit?: boolean
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rag_search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      study_content: {
        Row: {
          id: string
          session_id: string
          content: string
          content_type: string
          user_id: string
          created_at: string | null
        }
        Insert: {
          id?: string
          session_id: string
          content: string
          content_type: string
          user_id: string
          created_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          content?: string
          content_type?: string
          user_id?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_content_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_content_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_artifacts: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          file_name: string
          content_type: string
          file_url: string
          extracted_content: string
          metadata: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          file_name: string
          content_type: string
          file_url: string
          extracted_content: string
          metadata?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          file_name?: string
          content_type?: string
          file_url?: string
          extracted_content?: string
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_artifacts_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_artifacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_artifacts: {
        Row: {
          id: string
          chat_id: string
          user_id: string
          title: string
          content: string
          content_type: string
          metadata: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          chat_id: string
          user_id: string
          title: string
          content: string
          content_type?: string
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          chat_id?: string
          user_id?: string
          title?: string
          content?: string
          content_type?: string
          metadata?: Json | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_artifacts_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_artifacts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_materials_needing_embedding: {
        Args: {
          user_id_filter: string
          limit_count: number
        }
        Returns: Array<{
          id: string
          title: string
          content: string
          user_id: string
          processing_status: string
          last_embedded_at: string | null
        }>
      }
      update_material_embeddings: {
        Args: {
          material_ids: string[]
          embeddings_data: Array<{
            id: string
            embedding: number[]
            model: string
          }>
        }
        Returns: number
      }
      search_study_materials: {
        Args: {
          query_embedding: number[]
          match_threshold: number
          match_count: number
          user_id_filter: string
          material_types: string[] | null
          disciplines: string[] | null
        }
        Returns: Array<{
          id: string
          title: string
          content: string
          similarity: number
          user_id: string
          material_type: string | null
          discipline: string | null
          content_length: number | null
          created_at: string | null
        }>
      }
      hybrid_search_study_materials: {
        Args: {
          query_text: string
          query_embedding: number[]
          match_threshold: number
          match_count: number
          user_id_filter: string
        }
        Returns: Array<{
          id: string
          title: string
          content: string
          similarity: number
          user_id: string
          text_similarity: number
          material_type: string | null
          discipline: string | null
          content_length: number | null
          created_at: string | null
        }>
      }
      search_document_chunks: {
        Args: {
          query_embedding: number[]
          match_threshold: number
          match_count: number
          user_id_filter: string
        }
        Returns: Array<{
          id: string
          material_id: string
          chunk_content: string
          similarity: number
          user_id: string
          title: string
          content: string
          material_type: string | null
          discipline: string | null
          content_length: number | null
          created_at: string | null
        }>
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
