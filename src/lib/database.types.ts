
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_attempts": {
                  Row: {
                    "at": string,"ip_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"ip_hash": string
                  }
                  Update: {
                    "at"?: string,"ip_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "bride_name": string,"created_at": string | null,"groom_name": string,"header_message": string | null,"id": string,"qr_account_name": string | null,"qr_bank": string | null,"qr_path": string | null,"slug": string,"uploads_open": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "bride_name": string,"created_at"?: string | null,"groom_name": string,"header_message"?: string | null,"id"?: string,"qr_account_name"?: string | null,"qr_bank"?: string | null,"qr_path"?: string | null,"slug": string,"uploads_open"?: boolean
                  }
                  Update: {
                    "bride_name"?: string,"created_at"?: string | null,"groom_name"?: string,"header_message"?: string | null,"id"?: string,"qr_account_name"?: string | null,"qr_bank"?: string | null,"qr_path"?: string | null,"slug"?: string,"uploads_open"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"guests": {
                  Row: {
                    "created_at": string | null,"event_id": string,"id": string,"name": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"event_id": string,"id"?: string,"name": string,"token_hash": string
                  }
                  Update: {
                    "created_at"?: string | null,"event_id"?: string,"id"?: string,"name"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guests_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"post_media": {
                  Row: {
                    "bytes": number,"duration_s": number | null,"height": number | null,"id": string,"kind": string,"mime": string,"path": string,"position": number,"post_id": string,"poster_path": string | null,"thumb_path": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes": number,"duration_s"?: number | null,"height"?: number | null,"id"?: string,"kind": string,"mime": string,"path": string,"position": number,"post_id": string,"poster_path"?: string | null,"thumb_path"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number,"duration_s"?: number | null,"height"?: number | null,"id"?: string,"kind"?: string,"mime"?: string,"path"?: string,"position"?: number,"post_id"?: string,"poster_path"?: string | null,"thumb_path"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_media_post_id_fkey"
      columns: ["post_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "caption": string | null,"created_at": string | null,"event_id": string,"guest_id": string,"hidden": boolean,"id": string,"type": Database["public"]['Enums']["post_type"],"wish_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string | null,"event_id": string,"guest_id": string,"hidden"?: boolean,"id"?: string,"type": Database["public"]['Enums']["post_type"],"wish_text"?: string | null
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string | null,"event_id"?: string,"guest_id"?: string,"hidden"?: boolean,"id"?: string,"type"?: Database["public"]['Enums']["post_type"],"wish_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "public_guests"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_attempts": {
                  Row: {
                    "at": string,"key_hash": string,"scope": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"key_hash": string,"scope": string
                  }
                  Update: {
                    "at"?: string,"key_hash"?: string,"scope"?: string
                  }
                  Relationships: [
                    
                  ]
                },"upload_intents": {
                  Row: {
                    "cancelled_at": string | null,"consumed_at": string | null,"event_id": string,"expires_at": string,"files": NonNullable<Json>,"guest_id": string,"post_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelled_at"?: string | null,"consumed_at"?: string | null,"event_id": string,"expires_at": string,"files": NonNullable<Json>,"guest_id": string,"post_id": string
                  }
                  Update: {
                    "cancelled_at"?: string | null,"consumed_at"?: string | null,"event_id"?: string,"expires_at"?: string,"files"?: NonNullable<Json>,"guest_id"?: string,"post_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "upload_intents_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_intents_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "upload_intents_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "public_guests"
      referencedColumns: ["id"]
    }
                  ]
                },"wish_log": {
                  Row: {
                    "created_at": string,"guest_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"guest_id": string
                  }
                  Update: {
                    "created_at"?: string,"guest_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "wish_log_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "guests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wish_log_guest_id_fkey"
      columns: ["guest_id"]
isOneToOne: false
      referencedRelation: "public_guests"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_guests": {
                  Row: {
                    "event_id": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                           "event_id"?: string | null,"id"?: string | null,"name"?: string | null
                         }
                        Update: {
                           "event_id"?: string | null,"id"?: string | null,"name"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "guests_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "admin_login_attempt":
{ Args: { "p_ip_hash": string,"p_max": number,"p_since": string }; Returns: undefined
                           },
"admin_login_clear":
{ Args: { "p_ip_hash": string }; Returns: undefined
                           },
"create_post_from_intent":
{ Args: { "p_caption": string,"p_guest_id": string,"p_media": Json,"p_post_id": string,"p_type": Database["public"]['Enums']["post_type"] }; Returns: undefined
                           },
"create_upload_intent":
{ Args: { "p_event_id": string,"p_expires_at": string,"p_files": Json,"p_guest_id": string,"p_max_bytes": number,"p_max_event_bytes": number,"p_max_posts": number,"p_post_id": string,"p_since": string }; Returns: undefined
                           },
"create_wish":
{ Args: { "p_event_id": string,"p_guest_id": string,"p_max_bytes": number,"p_max_posts": number,"p_since": string,"p_text": string }; Returns: string
                           },
"guest_usage":
{ Args: { "p_guest_id": string,"p_since": string }; Returns: {
              "bytes": number,"posts": number
            }[]
                           },
"rate_limit_hit":
{ Args: { "p_key": string,"p_max": number,"p_scope": string,"p_window_s": number }; Returns: undefined
                           },
"wall_counts":
{ Args: { "e": string }; Returns: {
              "all_count": number,"photos": number,"videos": number,"wishes": number
            }[]
                           }
          }
          Enums: {
            "post_type": "photo"|"album"|"video"|"wish"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
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
    : never = never
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
    : never = never
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "post_type": ["photo", "album", "video", "wish"]
          }
        }
} as const
