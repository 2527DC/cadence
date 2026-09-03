// AUTO-GENERATED. Do not edit by hand.
//
// Regenerate with:  node supabase/gen-types.mjs
//
// Produced by introspecting the local Postgres database directly, because the
// Supabase CLI's `gen types` requires Docker. The shape matches what the CLI emits,
// so this file stays valid if the project later moves to a hosted Supabase project.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      goals: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          category: string | null;
          color: string | null;
          target_per_week: number;
          start_week: string;
          end_week: string | null;
          state: Database["public"]["Enums"]["goal_state"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          category?: string | null;
          color?: string | null;
          target_per_week?: number;
          start_week: string;
          end_week?: string | null;
          state?: Database["public"]["Enums"]["goal_state"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          category?: string | null;
          color?: string | null;
          target_per_week?: number;
          start_week?: string;
          end_week?: string | null;
          state?: Database["public"]["Enums"]["goal_state"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          user_id: string;
          thread_id: string;
          kind: Database["public"]["Enums"]["message_kind"];
          body: string | null;
          voice_note_id: string | null;
          linked_task_id: string | null;
          linked_goal_id: string | null;
          created_at: string;
          body_tsv: unknown | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          thread_id: string;
          kind: Database["public"]["Enums"]["message_kind"];
          body?: string | null;
          voice_note_id?: string | null;
          linked_task_id?: string | null;
          linked_goal_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          thread_id?: string;
          kind?: Database["public"]["Enums"]["message_kind"];
          body?: string | null;
          voice_note_id?: string | null;
          linked_task_id?: string | null;
          linked_goal_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "threads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_voice_note_id_fkey";
            columns: ["voice_note_id"];
            isOneToOne: false;
            referencedRelation: "voice_notes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_linked_task_id_fkey";
            columns: ["linked_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_linked_goal_id_fkey";
            columns: ["linked_goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          timezone: string;
          week_start_day: number;
          streak_threshold: number;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          timezone?: string;
          week_start_day?: number;
          streak_threshold?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          timezone?: string;
          week_start_day?: number;
          streak_threshold?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      task_status_events: {
        Row: {
          id: string;
          user_id: string;
          task_id: string;
          from_status: Database["public"]["Enums"]["task_status"];
          to_status: Database["public"]["Enums"]["task_status"];
          note: string | null;
          voice_note_id: string | null;
          nc_reason: Database["public"]["Enums"]["nc_reason"] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_id: string;
          from_status: Database["public"]["Enums"]["task_status"];
          to_status: Database["public"]["Enums"]["task_status"];
          note?: string | null;
          voice_note_id?: string | null;
          nc_reason?: Database["public"]["Enums"]["nc_reason"] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          task_id?: string;
          from_status?: Database["public"]["Enums"]["task_status"];
          to_status?: Database["public"]["Enums"]["task_status"];
          note?: string | null;
          voice_note_id?: string | null;
          nc_reason?: Database["public"]["Enums"]["nc_reason"] | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_status_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_status_events_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_status_events_voice_note_id_fkey";
            columns: ["voice_note_id"];
            isOneToOne: false;
            referencedRelation: "voice_notes";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string | null;
          title: string;
          detail: string | null;
          week_start: string;
          planned_for: string | null;
          weight: number;
          is_finalized: boolean;
          finalized_at: string | null;
          late_add: boolean;
          status: Database["public"]["Enums"]["task_status"];
          closed_at: string | null;
          nc_reason: Database["public"]["Enums"]["nc_reason"] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_id?: string | null;
          title: string;
          detail?: string | null;
          week_start: string;
          planned_for?: string | null;
          weight?: number;
          is_finalized?: boolean;
          finalized_at?: string | null;
          late_add?: boolean;
          status?: Database["public"]["Enums"]["task_status"];
          closed_at?: string | null;
          nc_reason?: Database["public"]["Enums"]["nc_reason"] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string | null;
          title?: string;
          detail?: string | null;
          week_start?: string;
          planned_for?: string | null;
          weight?: number;
          is_finalized?: boolean;
          finalized_at?: string | null;
          late_add?: boolean;
          status?: Database["public"]["Enums"]["task_status"];
          closed_at?: string | null;
          nc_reason?: Database["public"]["Enums"]["nc_reason"] | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      threads: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string | null;
          title: string;
          kind: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_id?: string | null;
          title: string;
          kind?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string | null;
          title?: string;
          kind?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "threads_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "threads_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_notes: {
        Row: {
          id: string;
          user_id: string;
          storage_path: string;
          duration_ms: number;
          size_bytes: number | null;
          mime_type: string;
          waveform: number[] | null;
          transcript: string | null;
          transcript_status: Database["public"]["Enums"]["transcript_status"];
          transcript_error: string | null;
          recorded_at: string;
          created_at: string;
          transcript_tsv: unknown | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          storage_path: string;
          duration_ms: number;
          size_bytes?: number | null;
          mime_type?: string;
          waveform?: number[] | null;
          transcript?: string | null;
          transcript_status?: Database["public"]["Enums"]["transcript_status"];
          transcript_error?: string | null;
          recorded_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          storage_path?: string;
          duration_ms?: number;
          size_bytes?: number | null;
          mime_type?: string;
          waveform?: number[] | null;
          transcript?: string | null;
          transcript_status?: Database["public"]["Enums"]["transcript_status"];
          transcript_error?: string | null;
          recorded_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_notes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_reviews: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          summary: string | null;
          voice_note_id: string | null;
          stats: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          week_start: string;
          summary?: string | null;
          voice_note_id?: string | null;
          stats?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          week_start?: string;
          summary?: string | null;
          voice_note_id?: string | null;
          stats?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_reviews_voice_note_id_fkey";
            columns: ["voice_note_id"];
            isOneToOne: false;
            referencedRelation: "voice_notes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      v_goal_progress: {
        Row: {
          goal_id: string | null;
          user_id: string | null;
          title: string | null;
          target_per_week: number | null;
          state: Database["public"]["Enums"]["goal_state"] | null;
          week_start: string | null;
          completed: number | null;
          target: number | null;
          attainment: number | null;
        };
        Relationships: [];
      };
      v_week_rollup: {
        Row: {
          user_id: string | null;
          week_start: string | null;
          total: number | null;
          completed: number | null;
          missed: number | null;
          not_counted: number | null;
          still_open: number | null;
          late_adds: number | null;
          counted_total: number | null;
          completion_rate: number | null;
          nc_rate: number | null;
          is_kept_week: boolean | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      close_task: {
        Args: {
          p_task_id: string;
          p_to_status: Database["public"]["Enums"]["task_status"];
          p_note?: string;
          p_voice_note_id?: string;
          p_nc_reason?: Database["public"]["Enums"]["nc_reason"];
        };
        Returns: Database["public"]["Tables"]["tasks"]["Row"];
      };
    };
    Enums: {
      goal_state: "active" | "paused" | "archived";
      message_kind: "text" | "voice";
      nc_reason: "illness" | "blocked_by_others" | "cancelled_externally" | "plan_changed" | "other";
      task_status: "OPEN" | "N" | "C" | "NC";
      transcript_status: "pending" | "on_device" | "cloud" | "failed";
    };
    CompositeTypes: Record<PropertyKey, never>;
  };
};

// Convenience aliases, matching the ones the Supabase CLI emits.
type PublicSchema = Database["public"];

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never;

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T] extends { Update: infer U } ? U : never;

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
