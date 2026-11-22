export type PlanType = 'TICKET' | 'MONTHLY' | 'YEARLY' | 'FAMILY';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'ONLINE' | 'OTHER';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type TicketStatus = 'ACTIVE' | 'USED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
export type PassStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED';
export type EntryResult = 
  | 'SUCCESS' 
  | 'USED' 
  | 'INVALID' 
  | 'EXPIRED' 
  | 'CANCELLED' 
  | 'SUSPENDED' 
  | 'DAILY_LIMIT' 
  | 'COOLDOWN' 
  | 'UNPAID' 
  | 'REJECTED'
  | 'PHOTO_REQUIRED'
  | 'BIOMETRIC_REQUIRED'
  | 'BIOMETRIC_MISMATCH'
  | 'ENROLLMENT_REQUIRED';

export type UserRole = 'SUPER_ADMIN' | 'MANAGER' | 'COUNTER' | 'GATE';

export interface ParkSettings {
  id: 1;
  park_name: string;
  organization_name: string;
  address: string;
  timezone: string;
  currency: string;
  printing_width_mm: number; // 76.20 (3 inch)
  printable_width_mm: number; // 72.00
  qr_size_mm: number; // 40.00
  max_persons_per_ticket: number;
  enable_passes?: boolean; // Controls visibility of Subscription Passes tab in navigation
  updated_at?: string;
}

export interface Counter {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
}

export interface Gate {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  counter_id?: string;
  gate_id?: string;
  enabled: boolean;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  plan_type: PlanType;
  price_paise: number; // In integer paise: e.g. 2000 = ₹20.00
  duration_days?: number;
  max_people: number;
  max_visits_per_day?: number;
  cooldown_minutes: number;
  allow_same_day_reentry: boolean;
  named_members_required: boolean;
  active: boolean;
}

export interface Order {
  id: string;
  order_reference: string;
  item_type: PlanType;
  purchaser_name?: string;
  purchaser_phone?: string;
  persons_count: number;
  amount_paise: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  counter_id?: string;
  operator_id?: string;
  created_at: string;
  paid_at?: string;
}

export interface Ticket {
  id: string;
  ticket_number: string; // VUP-T-YYYYMMDD-000001
  order_id: string;
  plan_id: string;
  persons_count: number;
  price_paise: number;
  qr_token_sha256: string;
  qr_token_ciphertext: string;
  qr_token_nonce: string;
  qr_token_tag: string;
  status: TicketStatus;
  issued_at: string;
  expires_at?: string;
  used_at?: string;
  used_by?: string;
  used_gate_id?: string;
  reprint_count: number;
  created_at: string;
  device_name?: string;
  
  // Transient for printing (contains raw secure token)
  qr_raw_token?: string;
  plan_name?: string;
  order_reference?: string;
  payment_method?: PaymentMethod;
}

export interface PassMember {
  id: string;
  pass_id: string;
  full_name: string;
  relationship: string;
  is_primary_holder: boolean;
  photo_url?: string;
  photo_captured_at?: string;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
  enabled: boolean;
  has_biometric?: boolean;
  biometric_type?: 'FINGERPRINT' | 'WEBAUTHN' | 'FACIAL' | 'IRIS';
  biometric_template?: string;
  biometric_enrolled_at?: string;
  biometric_quality?: number;
  consent_recorded?: boolean;
  guardian_consent_name?: string;
  last_scanned_at?: string;
  created_at?: string;
}

export type MaritalStatus = 'MARRIED' | 'UNMARRIED';
export type PassEnrollmentStatus = 'DRAFT' | 'PENDING_ENROLLMENT' | 'ACTIVE' | 'BLOCKED';

export interface Pass {
  id: string;
  pass_number: string; // VUP-M-YYYYMMDD-000001 or VUP-F-YYYYMMDD-000001
  order_id: string;
  plan_id: string;
  pass_type: 'MONTHLY' | 'YEARLY' | 'FAMILY';
  holder_name: string;
  holder_phone?: string;
  people_allowed: number;
  valid_from: string; // YYYY-MM-DD
  valid_through: string; // YYYY-MM-DD
  qr_token_sha256: string;
  qr_token_ciphertext: string;
  qr_token_nonce: string;
  qr_token_tag: string;
  status: PassStatus;
  reprint_count: number;
  created_at: string;
  updated_at: string;
  device_name?: string;

  // Family & Biometric fields
  marital_status?: MaritalStatus;
  family_size?: number; // total family members including primary
  children_count?: number; // total children in family
  covered_members_count?: number; // members registered in this pass
  enrollment_status?: PassEnrollmentStatus;
  photo_url?: string;
  members?: PassMember[];

  // Transient for printing
  qr_raw_token?: string;
  plan_name?: string;
  amount_paise?: number;
  payment_method?: PaymentMethod;
}

export interface BiometricEnrollment {
  id: string;
  pass_id: string;
  member_id: string;
  biometric_type: 'FINGERPRINT' | 'WEBAUTHN' | 'FACIAL' | 'IRIS';
  device_provider: string;
  template_data: string;
  template_hash: string;
  quality_score: number;
  status: 'ENROLLED' | 'REVOKED';
  consent_recorded: boolean;
  guardian_consent_name?: string;
  enrolled_by?: string;
  enrolled_at: string;
}

export interface EntryEvent {
  id: string;
  request_id: string;
  document_type: 'TICKET' | 'PASS';
  ticket_id?: string;
  pass_id?: string;
  member_id?: string;
  gate_id?: string;
  scanned_by?: string;
  result: EntryResult;
  persons_admitted: number;
  reason?: string;
  scanned_at: string;
  device_name?: string;
  entry_photo_url?: string;
  biometric_verified?: boolean;
  biometric_match_score?: number;
  biometric_member_id?: string;
  biometric_member_name?: string;
  
  // Display helpers
  document_number?: string;
  holder_name?: string;
  pass_type?: 'MONTHLY' | 'YEARLY' | 'FAMILY';
}

export interface VerificationResponse {
  success: boolean;
  code: EntryResult | 'PHOTO_REQUIRED' | 'BIOMETRIC_REQUIRED' | 'BIOMETRIC_MISMATCH' | 'ENROLLMENT_REQUIRED';
  document_type?: 'TICKET' | 'PASS';
  ticket_number?: string;
  pass_number?: string;
  pass_type?: 'MONTHLY' | 'YEARLY' | 'FAMILY';
  holder_name?: string;
  member_id?: string;
  member_name?: string;
  relationship?: string;
  entry_photo_url?: string;
  biometric_verified?: boolean;
  match_score?: number;
  persons_admitted?: number;
  valid_from?: string;
  valid_through?: string;
  plan_name?: string;
  issued_at?: string;
  scanned_at?: string;
  payment_method?: PaymentMethod | string;
  amount_inr?: string;
  message: string;
  members?: PassMember[];
  requires_member_selection?: boolean;
}

export interface AuthStaff {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'COUNTER' | 'GATE';
  counter_name?: string;
  counter_code?: string;
  gate_name?: string;
  gate_code?: string;
  system_name?: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'COUNTER' | 'GATE';
  counter_name?: string;
  counter_code?: string;
  gate_name?: string;
  gate_code?: string;
  enabled: boolean;
  system_name?: string;
  created_at: string;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  actor_name?: string;
  actor_email?: string;
  device_name?: string;
  device_type?: 'DESKTOP' | 'MOBILE' | 'TABLET';
  details_summary?: string;
  after_json?: Record<string, unknown> | null;
  created_at: string;
}

export interface AppConfig {
  park_settings: ParkSettings;
  supabaseUrl: string;
  supabaseAnonKey: string;
  counter_code: string;
  counter_name: string;
  gate_code: string;
  gate_name: string;
  operator_name: string;
  printer_transport: 'BLUETOOTH' | 'USB' | 'OS_PRINT';
}
