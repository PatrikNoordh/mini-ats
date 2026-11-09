export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      applications: {
        Row: {
          candidate_id: string;
          created_at: string;
          customer_id: string;
          id: string;
          job_id: string;
          position: number;
          stage_changed_at: string;
          stage_id: string;
          updated_at: string;
        };
        Insert: {
          candidate_id: string;
          created_at?: string;
          customer_id?: string;
          id?: string;
          job_id: string;
          position?: number;
          stage_changed_at?: string;
          stage_id?: string;
          updated_at?: string;
        };
        Update: {
          candidate_id?: string;
          created_at?: string;
          customer_id?: string;
          id?: string;
          job_id?: string;
          position?: number;
          stage_changed_at?: string;
          stage_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_candidate_id_fkey";
            columns: ["candidate_id"];
            isOneToOne: false;
            referencedRelation: "candidates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_stage_id_fkey";
            columns: ["stage_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id", "customer_id"];
          },
        ];
      };
      candidates: {
        Row: {
          created_at: string;
          customer_id: string;
          cv_path: string | null;
          cv_uploaded_at: string | null;
          email: string | null;
          full_name: string;
          id: string;
          linkedin_url: string | null;
          notes: string | null;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          cv_path?: string | null;
          cv_uploaded_at?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          linkedin_url?: string | null;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          cv_path?: string | null;
          cv_uploaded_at?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          linkedin_url?: string | null;
          notes?: string | null;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "candidates_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      company_members: {
        Row: {
          company_id: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          user_id: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cv_assessments: {
        Row: {
          application_id: string;
          created_at: string;
          customer_id: string;
          gaps: Json;
          id: string;
          model: string | null;
          score: number | null;
          strengths: Json;
          summary: string | null;
        };
        Insert: {
          application_id: string;
          created_at?: string;
          customer_id: string;
          gaps?: Json;
          id?: string;
          model?: string | null;
          score?: number | null;
          strengths?: Json;
          summary?: string | null;
        };
        Update: {
          application_id?: string;
          created_at?: string;
          customer_id?: string;
          gaps?: Json;
          id?: string;
          model?: string | null;
          score?: number | null;
          strengths?: Json;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cv_assessments_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cv_assessments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          created_at: string;
          customer_id: string;
          description: string | null;
          id: string;
          location: string | null;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          description?: string | null;
          id?: string;
          location?: string | null;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stages: {
        Row: {
          colour: string;
          created_at: string;
          customer_id: string;
          default_key: string | null;
          id: string;
          kind: string;
          name: string | null;
          position: number;
        };
        Insert: {
          colour: string;
          created_at?: string;
          customer_id: string;
          default_key?: string | null;
          id?: string;
          kind?: string;
          name?: string | null;
          position: number;
        };
        Update: {
          colour?: string;
          created_at?: string;
          customer_id?: string;
          default_key?: string | null;
          id?: string;
          kind?: string;
          name?: string | null;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          company_name: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          role: string;
        };
        Insert: {
          company_name?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          role?: string;
        };
        Update: {
          company_name?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      account_is_active: { Args: never; Returns: boolean };
      accounts_due_for_purge: { Args: never; Returns: string[] };
      add_stage: {
        Args: { colour: string; customer_id: string; name: string };
        Returns: {
          colour: string;
          created_at: string;
          customer_id: string;
          default_key: string | null;
          id: string;
          kind: string;
          name: string | null;
          position: number;
        };
        SetofOptions: {
          from: "*";
          to: "pipeline_stages";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      companies_due_for_purge: { Args: never; Returns: string[] };
      create_default_stages: { Args: { customer: string }; Returns: undefined };
      current_company_id: { Args: never; Returns: string };
      default_stage_specs: {
        Args: never;
        Returns: {
          colour: string;
          default_key: string;
          kind: string;
          position: number;
        }[];
      };
      is_admin: { Args: never; Returns: boolean };
      move_application: {
        Args: {
          application_id: string;
          customer_id: string;
          new_stage_id: string;
        };
        Returns: {
          candidate_id: string;
          created_at: string;
          customer_id: string;
          id: string;
          job_id: string;
          position: number;
          stage_changed_at: string;
          stage_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "applications";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reorder_stages: {
        Args: { customer_id: string; stage_ids: string[] };
        Returns: {
          colour: string;
          created_at: string;
          customer_id: string;
          default_key: string | null;
          id: string;
          kind: string;
          name: string | null;
          position: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "pipeline_stages";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reset_stages: {
        Args: { customer_id: string };
        Returns: {
          colour: string;
          created_at: string;
          customer_id: string;
          default_key: string | null;
          id: string;
          kind: string;
          name: string | null;
          position: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "pipeline_stages";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      soft_delete_or_demote_account: {
        Args: { account_id: string; change: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
