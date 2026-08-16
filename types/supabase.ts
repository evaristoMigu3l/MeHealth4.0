/**
 * Generated Supabase database types for project "MeHealth"
 * (ref: grjdquzozfczsfdyvjtg).
 *
 * Regenerate with:
 *   npx supabase gen types typescript --project-id grjdquzozfczsfdyvjtg
 * or via the Supabase MCP `generate_typescript_types` tool.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          category: string
          created_at: string
          date_time: string | null
          duration_hours: number
          duration_minutes: number
          id: string
          notes: string | null
          specific_activity: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          date_time?: string | null
          duration_hours?: number
          duration_minutes?: number
          id: string
          notes?: string | null
          specific_activity?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          date_time?: string | null
          duration_hours?: number
          duration_minutes?: number
          id?: string
          notes?: string | null
          specific_activity?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_state: {
        Row: {
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          date_time: string | null
          doctor_name: string | null
          duration_minutes: number
          hcp_id: string | null
          id: string
          linked_exam_ids: Json
          location: string
          reason: string | null
          recurrence: string | null
          reminder: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string | null
          doctor_name?: string | null
          duration_minutes?: number
          hcp_id?: string | null
          id: string
          linked_exam_ids?: Json
          location?: string
          reason?: string | null
          recurrence?: string | null
          reminder?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string | null
          doctor_name?: string | null
          duration_minutes?: number
          hcp_id?: string | null
          id?: string
          linked_exam_ids?: Json
          location?: string
          reason?: string | null
          recurrence?: string | null
          reminder?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diagnoses: {
        Row: {
          condition: string
          created_at: string
          date_of_diagnosis: string | null
          id: string
          linked_appointment_ids: Json
          status: string
          treatment: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          condition?: string
          created_at?: string
          date_of_diagnosis?: string | null
          id: string
          linked_appointment_ids?: Json
          status?: string
          treatment?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          condition?: string
          created_at?: string
          date_of_diagnosis?: string | null
          id?: string
          linked_appointment_ids?: Json
          status?: string
          treatment?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      diet_plans: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          start_date: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id: string
          notes?: string | null
          start_date?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          date_time: string | null
          id: string
          name: string
          notes: string | null
          type: string
          updated_at: string
          uri: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string | null
          id: string
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          uri?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string | null
          id?: string
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          uri?: string | null
          user_id?: string
        }
        Relationships: []
      }
      food_entries: {
        Row: {
          calories: number
          created_at: string
          date_time: string | null
          id: string
          name: string
          notes: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          created_at?: string
          date_time?: string | null
          id: string
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calories?: number
          created_at?: string
          date_time?: string | null
          id?: string
          name?: string
          notes?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hcps: {
        Row: {
          contact_details: string | null
          created_at: string
          first_name: string
          id: string
          last_name: string
          location_name: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_details?: string | null
          created_at?: string
          first_name?: string
          id: string
          last_name?: string
          location_name?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_details?: string | null
          created_at?: string
          first_name?: string
          id?: string
          last_name?: string
          location_name?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      investigations: {
        Row: {
          attachments: Json
          created_at: string
          date_time: string | null
          id: string
          linked_appointment_id: string | null
          linked_medication_id: string | null
          notes: string | null
          result: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          date_time?: string | null
          id: string
          linked_appointment_id?: string | null
          linked_medication_id?: string | null
          notes?: string | null
          result?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          date_time?: string | null
          id?: string
          linked_appointment_id?: string | null
          linked_medication_id?: string | null
          notes?: string | null
          result?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      measurements: {
        Row: {
          created_at: string
          date_time: string | null
          id: string
          notes: string | null
          reading: string
          sub_type: string | null
          type: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string | null
          id: string
          notes?: string | null
          reading?: string
          sub_type?: string | null
          type?: string
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string | null
          id?: string
          notes?: string | null
          reading?: string
          sub_type?: string | null
          type?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          adherence_log: Json
          color: string | null
          created_at: string
          display_name: string | null
          dosage_unit: string
          end_date: string | null
          formulation: string | null
          frequency: string
          id: string
          location: string | null
          name: string
          notes: string | null
          preparation: string
          reminders_enabled: boolean | null
          schedule: Json
          self_prescribed: boolean | null
          start_date: string | null
          status: string
          target_condition: string | null
          times_per_day: number
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adherence_log?: Json
          color?: string | null
          created_at?: string
          display_name?: string | null
          dosage_unit?: string
          end_date?: string | null
          formulation?: string | null
          frequency?: string
          id: string
          location?: string | null
          name?: string
          notes?: string | null
          preparation?: string
          reminders_enabled?: boolean | null
          schedule?: Json
          self_prescribed?: boolean | null
          start_date?: string | null
          status?: string
          target_condition?: string | null
          times_per_day?: number
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adherence_log?: Json
          color?: string | null
          created_at?: string
          display_name?: string | null
          dosage_unit?: string
          end_date?: string | null
          formulation?: string | null
          frequency?: string
          id?: string
          location?: string | null
          name?: string
          notes?: string | null
          preparation?: string
          reminders_enabled?: boolean | null
          schedule?: Json
          self_prescribed?: boolean | null
          start_date?: string | null
          status?: string
          target_condition?: string | null
          times_per_day?: number
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      migrations_log: {
        Row: {
          created_at: string
          name: string
          record_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          name: string
          record_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          name?: string
          record_count?: number
          user_id?: string
        }
        Relationships: []
      }
      mood_logs: {
        Row: {
          created_at: string
          date_time: string | null
          emoji: string | null
          feeling: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string | null
          emoji?: string | null
          feeling?: string
          id: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string | null
          emoji?: string | null
          feeling?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          current_streak: number
          dob: string
          email: string
          ethnicity: string
          gender: string
          last_active_date: string | null
          longest_streak: number
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          dob?: string
          email?: string
          ethnicity?: string
          gender?: string
          last_active_date?: string | null
          longest_streak?: number
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          dob?: string
          email?: string
          ethnicity?: string
          gender?: string
          last_active_date?: string | null
          longest_streak?: number
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          created_at: string
          date_time: string | null
          hours: number
          id: string
          notes: string | null
          quality: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_time?: string | null
          hours?: number
          id: string
          notes?: string | null
          quality?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_time?: string | null
          hours?: number
          id?: string
          notes?: string | null
          quality?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      symptoms: {
        Row: {
          created_at: string
          date_started: string | null
          duration: string | null
          id: string
          images: Json
          intensity: number
          intensity_label: string
          name: string
          notes: string | null
          place: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_started?: string | null
          duration?: string | null
          id: string
          images?: Json
          intensity?: number
          intensity_label?: string
          name?: string
          notes?: string | null
          place?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_started?: string | null
          duration?: string | null
          id?: string
          images?: Json
          intensity?: number
          intensity_label?: string
          name?: string
          notes?: string | null
          place?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          language: string
          notification_sound: string
          theme_preference: string
          updated_at: string
          user_id: string
        }
        Insert: {
          language?: string
          notification_sound?: string
          theme_preference?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          language?: string
          notification_sound?: string
          theme_preference?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          amount: number
          created_at: string
          date_time: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          date_time?: string | null
          id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date_time?: string | null
          id?: string
          updated_at?: string
          user_id?: string
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
