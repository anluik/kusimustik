export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      answers: {
        Row: {
          created_at: string
          question_id: string
          response_id: string
          survey_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          question_id: string
          response_id: string
          survey_id: string
          value: Json
        }
        Update: {
          created_at?: string
          question_id?: string
          response_id?: string
          survey_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "answers_question_id_survey_id_fkey"
            columns: ["question_id", "survey_id"]
            isOneToOne: false
            referencedRelation: "survey_questions"
            referencedColumns: ["question_id", "survey_id"]
          },
          {
            foreignKeyName: "answers_response_id_survey_id_fkey"
            columns: ["response_id", "survey_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id", "survey_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      responses: {
        Row: {
          id: string
          locale: string | null
          meta: Json | null
          submitted_at: string
          survey_id: string
          survey_version: number
        }
        Insert: {
          id?: string
          locale?: string | null
          meta?: Json | null
          submitted_at?: string
          survey_id: string
          survey_version: number
        }
        Update: {
          id?: string
          locale?: string | null
          meta?: Json | null
          submitted_at?: string
          survey_id?: string
          survey_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_stats"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_survey_id_survey_version_fkey"
            columns: ["survey_id", "survey_version"]
            isOneToOne: false
            referencedRelation: "survey_versions"
            referencedColumns: ["survey_id", "version"]
          },
        ]
      }
      survey_events: {
        Row: {
          at: string
          id: number
          meta: Json | null
          question_id: string | null
          session_id: string
          survey_id: string
          type: string
        }
        Insert: {
          at?: string
          id?: never
          meta?: Json | null
          question_id?: string | null
          session_id: string
          survey_id: string
          type: string
        }
        Update: {
          at?: string
          id?: never
          meta?: Json | null
          question_id?: string | null
          session_id?: string
          survey_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_events_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_stats"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "survey_events_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_questions: {
        Row: {
          key: string
          position: number
          question_id: string
          removed_at: string | null
          survey_id: string
          title: string
          type: string
        }
        Insert: {
          key: string
          position: number
          question_id: string
          removed_at?: string | null
          survey_id: string
          title: string
          type: string
        }
        Update: {
          key?: string
          position?: number
          question_id?: string
          removed_at?: string | null
          survey_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_stats"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_versions: {
        Row: {
          created_at: string
          description: string | null
          elements: Json
          locale: string
          survey_id: string
          title: string
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          elements: Json
          locale: string
          survey_id: string
          title: string
          version: number
        }
        Update: {
          created_at?: string
          description?: string | null
          elements?: Json
          locale?: string
          survey_id?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "survey_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "survey_stats"
            referencedColumns: ["survey_id"]
          },
          {
            foreignKeyName: "survey_versions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          closed_at: string | null
          created_at: string
          description: string | null
          elements: Json
          id: string
          locale: string
          owner_id: string
          published_at: string | null
          published_version: number | null
          slug: string | null
          status: string
          title: string
          updated_at: string
          version: number
          wave_group_id: string
          wave_label: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          description?: string | null
          elements?: Json
          id?: string
          locale?: string
          owner_id: string
          published_at?: string | null
          published_version?: number | null
          slug?: string | null
          status?: string
          title: string
          updated_at?: string
          version?: number
          wave_group_id?: string
          wave_label?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          description?: string | null
          elements?: Json
          id?: string
          locale?: string
          owner_id?: string
          published_at?: string | null
          published_version?: number | null
          slug?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
          wave_group_id?: string
          wave_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surveys_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_published_version_fkey"
            columns: ["id", "published_version"]
            isOneToOne: false
            referencedRelation: "survey_versions"
            referencedColumns: ["survey_id", "version"]
          },
        ]
      }
    }
    Views: {
      survey_stats: {
        Row: {
          question_count: number | null
          response_count: number | null
          survey_id: string | null
        }
        Insert: {
          question_count?: never
          response_count?: never
          survey_id?: string | null
        }
        Update: {
          question_count?: never
          response_count?: never
          survey_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_runner_survey: {
        Args: { p_slug: string }
        Returns: {
          description: string
          elements: Json
          id: string
          locale: string
          published_version: number
          slug: string
          status: string
          title: string
          version: number
          wave_group_id: string
          wave_label: string
        }[]
      }
      owns_survey: { Args: { p_survey_id: string }; Returns: boolean }
      submit_response: {
        Args: {
          p_answers: Json
          p_locale?: string
          p_meta?: Json
          p_survey_id: string
        }
        Returns: string
      }
      survey_is_published: { Args: { p_survey_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

