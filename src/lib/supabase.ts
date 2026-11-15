import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  AppConfig,
  Ticket,
  Pass,
  Order,
  Plan,
  EntryEvent,
  VerificationResponse,
  PaymentMethod,
  EntryResult,
  AuthStaff,
  StaffUser,
  AuditLog
} from '../types';
import { generateSecureQrToken, encryptQrToken, computeSha256 } from './crypto';
import { getSystemDeviceInfo } from './device';
import { getTodayIstYmd, getIstDateYmd, isSameIstDay } from './dateUtils';

export const DEFAULT_APP_CONFIG: AppConfig = {
  park_settings: {
    id: 1,
    park_name: 'Ved Upvan Park',
    organization_name: '(Nagar Palika Parishid)',
    address: 'Etawah Road, Sirsaganj, Firozabad - 205151',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    printing_width_mm: 76.20,
    printable_width_mm: 72.00,
    qr_size_mm: 40.00,
    max_persons_per_ticket: 20,
  },
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'https://kzuxtkxdhyrowgczrhwa.supabase.co',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6dXh0a3hkaHlyb3dnY3pyaHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0ODMyOTMsImV4cCI6MjExMDA1OTI5M30.l9gqo23C6Hd9mnAd5qJLcp-oITpOBhkGWvF3FTXm8pA',
  counter_code: 'CTR-01',
  counter_name: 'Main Ticket Counter 1',
  gate_code: 'GATE-01',
  gate_name: 'Main Entrance Gate',
  operator_name: 'Counter Operator',
  printer_transport: 'BLUETOOTH',
};

export interface PricingRates {
  ticket_rate_inr: number;
  monthly_pass_1m_inr: number;
  monthly_pass_2m_inr: number;
  monthly_pass_3m_inr: number;
  yearly_pass_inr: number;
}

export const DEFAULT_PRICING_RATES: PricingRates = {
  ticket_rate_inr: 10,
  monthly_pass_1m_inr: 300,
  monthly_pass_2m_inr: 600,
  monthly_pass_3m_inr: 900,
  yearly_pass_inr: 3100,
};

export const DEFAULT_PLANS: Plan[] = [
  {
    id: 'a1b84e1b-5d00-4740-b168-b30b769cd099',
    code: 'ENTRY-SINGLE',
    name: 'Single Entry Ticket',
    plan_type: 'TICKET',
    price_paise: 1000, // ₹10.00 per person
    max_people: 1,
    cooldown_minutes: 0,
    allow_same_day_reentry: false,
    named_members_required: false,
    active: true,
  },
  {
    id: '2b1b362d-bd48-46ca-80ba-9878445f38e6',
    code: 'MONTHLY-WALK',
    name: 'Monthly Walker Pass',
    plan_type: 'MONTHLY',
    price_paise: 30000, // ₹300.00
    duration_days: 30,
    max_people: 1,
    max_visits_per_day: 2,
    cooldown_minutes: 60,
    allow_same_day_reentry: true,
    named_members_required: true,
    active: true,
  },
  {
    id: '4d93bb58-3478-5448-a9e2-9188298c432c',
    code: 'YEARLY-WALK',
    name: 'Yearly Walker Pass',
    plan_type: 'YEARLY',
    price_paise: 310000, // ₹3,100.00
    duration_days: 365,
    max_people: 1,
    max_visits_per_day: 2,
    cooldown_minutes: 60,
    allow_same_day_reentry: true,
    named_members_required: true,
    active: true,
  },
];

class VupDatabaseService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private supabase: SupabaseClient<any, any, any> | null = null;
  private config: AppConfig = DEFAULT_APP_CONFIG;

  constructor() {
    this.loadConfig();
    this.applyPricingRatesToPlans();
    this.initSupabase();
  }

  getPricingRates(): PricingRates {
    try {
      const saved = localStorage.getItem('vup_pricing_rates');
      if (saved) {
        return { ...DEFAULT_PRICING_RATES, ...JSON.parse(saved) };
      }
    } catch { }
    return DEFAULT_PRICING_RATES;
  }

  applyPricingRatesToPlans() {
    const rates = this.getPricingRates();
    const singlePlan = DEFAULT_PLANS.find(p => p.plan_type === 'TICKET');
    if (singlePlan) singlePlan.price_paise = rates.ticket_rate_inr * 100;
    const monthlyPlan = DEFAULT_PLANS.find(p => p.plan_type === 'MONTHLY');
    if (monthlyPlan) monthlyPlan.price_paise = rates.monthly_pass_1m_inr * 100;
    const yearlyPlan = DEFAULT_PLANS.find(p => p.plan_type === 'YEARLY');
    if (yearlyPlan) yearlyPlan.price_paise = rates.yearly_pass_inr * 100;
  }

  savePricingRates(rates: Partial<PricingRates>): PricingRates {
    const current = this.getPricingRates();
    const updated: PricingRates = {
      ticket_rate_inr: Math.max(1, Math.round(Number(rates.ticket_rate_inr ?? current.ticket_rate_inr))),
      monthly_pass_1m_inr: Math.max(1, Math.round(Number(rates.monthly_pass_1m_inr ?? current.monthly_pass_1m_inr))),
      monthly_pass_2m_inr: Math.max(1, Math.round(Number(rates.monthly_pass_2m_inr ?? current.monthly_pass_2m_inr))),
      monthly_pass_3m_inr: Math.max(1, Math.round(Number(rates.monthly_pass_3m_inr ?? current.monthly_pass_3m_inr))),
      yearly_pass_inr: Math.max(1, Math.round(Number(rates.yearly_pass_inr ?? current.yearly_pass_inr))),
    };
    localStorage.setItem('vup_pricing_rates', JSON.stringify(updated));
    this.applyPricingRatesToPlans();
    this.logAuditEvent({
      action: 'PRICING_RATES_UPDATED',
      entity_type: 'SETTINGS',
      details_summary: `Ticket: ₹${updated.ticket_rate_inr}, Monthly: ₹${updated.monthly_pass_1m_inr}, Yearly: ₹${updated.yearly_pass_inr}`,
      after_json: updated,
    });
    return updated;
  }

  async verifyAdminPassword(password: string): Promise<boolean> {
    if (!password || !password.trim()) return false;
    const trimmed = password.trim();

    const currentStaff = this.getCurrentStaff();
    // Target administrator identifier: if current user is SUPER_ADMIN, use their email; otherwise use 'admin'
    const targetAdminIdentifier = (currentStaff && currentStaff.role === 'SUPER_ADMIN') 
      ? currentStaff.email 
      : 'admin';

    // 1. Verify directly against Supabase database Administrator account
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('staff_login', {
          p_identifier: targetAdminIdentifier,
          p_password: trimmed,
        });

        if (!error && data) {
          if (data.success && data.staff?.role === 'SUPER_ADMIN') {
            this.saveStaffPasswordLocally(data.staff.id, data.staff.email, trimmed);
            return true;
          } else if (!data.success) {
            // If targetAdminIdentifier was custom and failed, also check 'admin'
            if (targetAdminIdentifier !== 'admin') {
              const { data: fallbackAdminData } = await this.supabase.rpc('staff_login', {
                p_identifier: 'admin',
                p_password: trimmed,
              });
              if (fallbackAdminData && fallbackAdminData.success && fallbackAdminData.staff?.role === 'SUPER_ADMIN') {
                this.saveStaffPasswordLocally(fallbackAdminData.staff.id, fallbackAdminData.staff.email, trimmed);
                return true;
              }
            }
            // Strict rejection: non-admin or wrong password
            return false;
          }
        }
      } catch (err) {
        console.warn('Supabase verifyAdminPassword network error, using local fallback:', err);
      }
    }

    // 2. Offline Fallback (ONLY when Supabase is completely unreachable)
    const staffList = await this.fetchStaffList();
    const adminUser = staffList.find(s => 
      (currentStaff?.role === 'SUPER_ADMIN' && s.id === currentStaff.id) ||
      s.role === 'SUPER_ADMIN' || 
      s.email.toLowerCase() === 'admin' || 
      s.email.toLowerCase().startsWith('admin@')
    );
    if (!adminUser) return false;

    const expectedAdminPassword = this.getStaffPassword(adminUser.id, adminUser.email, 'SUPER_ADMIN');
    return trimmed === expectedAdminPassword;
  }

  loadConfig(): AppConfig {
    try {
      const saved = localStorage.getItem('vup_app_config');
      if (saved) {
        this.config = { ...DEFAULT_APP_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      this.config = DEFAULT_APP_CONFIG;
    }
    return this.config;
  }

  saveConfig(newConfig: Partial<AppConfig>) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('vup_app_config', JSON.stringify(this.config));
    this.initSupabase();
    this.logAuditEvent({
      action: 'CONFIG_UPDATED',
      entity_type: 'SETTINGS',
      actor_name: this.getCurrentStaff()?.name || 'Administrator',
      actor_email: this.getCurrentStaff()?.email || 'admin@vedupvan.local',
      details_summary: 'System configuration settings updated',
      after_json: newConfig,
    });
  }

  getConfig(): AppConfig {
    return this.config;
  }

  private initSupabase() {
    const url = this.config.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const key = this.config.supabaseAnonKey || import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (url && key && url.startsWith('http')) {
      try {
        this.supabase = createClient(url, key);
      } catch (e) {
        console.warn('Supabase client error, falling back to local DB:', e);
        this.supabase = null;
      }
    } else {
      this.supabase = null;
    }
  }

  get isConnected(): boolean {
    return this.supabase !== null;
  }

  // Format YYYYMMDD in Indian Standard Time (Asia/Kolkata)
  private getIstYmd(): string {
    const now = new Date();
    // Offset for IST +05:30
    const istTime = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60000);
    const y = istTime.getFullYear();
    const m = String(istTime.getMonth() + 1).padStart(2, '0');
    const d = String(istTime.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // Generate sequence number starting from 000001 (e.g. VUP-T-20261112-000001)
  async getNextDocumentNumber(type: 'TICKET' | 'MONTHLY' | 'YEARLY' | 'FAMILY' | 'ORDER'): Promise<string> {
    const ymd = this.getIstYmd();
    const prefix = type === 'TICKET' ? 'T' : type === 'MONTHLY' ? 'M' : type === 'YEARLY' ? 'Y' : type === 'FAMILY' ? 'F' : 'O';

    if (this.supabase) {
      try {
        if (type === 'TICKET') {
          const { count } = await this.supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true });
          const nextSeq = (count || 0) + 1;
          return `VUP-T-${ymd}-${String(nextSeq).padStart(6, '0')}`;
        }
        if (type === 'MONTHLY' || type === 'YEARLY' || type === 'FAMILY') {
          const { count } = await this.supabase
            .from('passes')
            .select('*', { count: 'exact', head: true })
            .eq('pass_type', type);
          const nextSeq = (count || 0) + 1;
          return `VUP-${prefix}-${ymd}-${String(nextSeq).padStart(6, '0')}`;
        }
        if (type === 'ORDER') {
          const { count } = await this.supabase
            .from('orders')
            .select('*', { count: 'exact', head: true });
          const nextSeq = (count || 0) + 1;
          return `VUP-O-${ymd}-${String(nextSeq).padStart(6, '0')}`;
        }
      } catch (e) {
        console.warn('Supabase count error, using local fallback:', e);
      }
    }

    // Local sequence generator based on local data count
    if (type === 'TICKET') {
      const localTickets = this.getLocalTickets();
      const nextSeq = localTickets.length + 1;
      return `VUP-${prefix}-${ymd}-${String(nextSeq).padStart(6, '0')}`;
    }
    const localPasses = this.getLocalPasses().filter(p => p.pass_type === type);
    const nextSeq = localPasses.length + 1;
    return `VUP-${prefix}-${ymd}-${String(nextSeq).padStart(6, '0')}`;
  }

  // Clear all data (local and cloud) to start fresh from ticket #000001
  async resetAllDatabaseAndLocal(): Promise<void> {
    if (this.supabase) {
      try {
        await this.supabase.from('entry_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabase.from('passes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await this.supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Supabase cloud reset warning:', e);
      }
    }
    localStorage.removeItem('vup_tickets');
    localStorage.removeItem('vup_passes');
    localStorage.removeItem('vup_entry_events');
    localStorage.removeItem('vup_orders');
    const ymd = this.getIstYmd();
    localStorage.removeItem(`vup_seq_TICKET_${ymd}`);
    localStorage.removeItem(`vup_seq_MONTHLY_${ymd}`);
    localStorage.removeItem(`vup_seq_FAMILY_${ymd}`);
    localStorage.removeItem(`vup_seq_ORDER_${ymd}`);
  }

  // 4. AUTHENTICATION & LOGIN (ROLE-BASED: COUNTER, GATE, SUPER_ADMIN)
  getStoredStaffPasswords(): Record<string, string> {
    const defaultPasswords: Record<string, string> = {
      'admin@vedupvan.local': 'admin@123',
      'admin': 'admin@123',
      'counter1@vedupvan.local': 'counter@123',
      'counter1': 'counter@123',
      'gate1@vedupvan.local': 'gate@123',
      'gate1': 'gate@123',
    };
    try {
      const savedPass = localStorage.getItem('vup_staff_passwords');
      if (savedPass) {
        return { ...defaultPasswords, ...JSON.parse(savedPass) };
      }
    } catch { }
    return defaultPasswords;
  }

  getStaffPassword(staffId?: string, email?: string, role?: string): string {
    const saved = this.getStoredStaffPasswords();
    if (staffId && saved[staffId]) return saved[staffId];
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      const user = cleanEmail.split('@')[0];
      if (saved[cleanEmail]) return saved[cleanEmail];
      if (saved[user]) return saved[user];
      if (saved[`${user}@vedupvan.local`]) return saved[`${user}@vedupvan.local`];
    }
    if (role === 'SUPER_ADMIN') return 'admin@123';
    if (role === 'GATE') return 'gate@123';
    return 'counter@123';
  }

  saveStaffPasswordLocally(staffId: string | undefined, email: string, password: string) {
    if (!password || !password.trim()) return;
    const cleanPass = password.trim();
    const cleanEmail = email.trim().toLowerCase();
    const user = cleanEmail.split('@')[0];
    const store = this.getStoredStaffPasswords();
    if (staffId) store[staffId] = cleanPass;
    store[cleanEmail] = cleanPass;
    store[user] = cleanPass;
    store[`${user}@vedupvan.local`] = cleanPass;
    try {
      localStorage.setItem('vup_staff_passwords', JSON.stringify(store));
    } catch (e) {
      console.warn('Failed to save staff password locally:', e);
    }
  }

  async loginStaff(identifier: string, password: string): Promise<{ success: boolean; staff?: AuthStaff; message?: string }> {
    const rawId = identifier.trim();
    if (!rawId || !password) {
      return { success: false, message: 'Please enter your Login ID and Password.' };
    }

    const cleanEmail = rawId.toLowerCase();

    // 1. Try Supabase RPC FIRST
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('staff_login', {
          p_identifier: cleanEmail,
          p_password: password,
        });

        if (!error && data) {
          if (data.success) {
            const staff: AuthStaff = data.staff;
            this.setCurrentStaff(staff);
            // Sync password locally so offline access works with updated credentials
            this.saveStaffPasswordLocally(staff.id, staff.email, password);
            return { success: true, staff };
          } else {
            // Database explicitly rejected credentials (wrong password or account disabled)
            // DO NOT fall through to offline acceptance!
            return { success: false, message: data.message || 'Invalid Login ID or Password.' };
          }
        }
      } catch (err) {
        console.warn('Supabase staff_login network error, trying fallback:', err);
      }
    }

    // 2. Offline / Local Staff Directory Lookup (ONLY if Supabase is offline / unreachable)
    const staffList = await this.fetchStaffList();
    const cleanUsername = cleanEmail.includes('@') ? cleanEmail.split('@')[0] : cleanEmail;

    const matchedStaff = staffList.find(s => {
      const email = s.email.toLowerCase();
      const user = email.split('@')[0];
      return email === cleanEmail || 
             user === cleanEmail || 
             user === cleanUsername || 
             s.id === cleanEmail || 
             email === `${cleanUsername}@vedupvan.local` ||
             `${user}@vedupvan.local` === cleanEmail;
    });

    if (!matchedStaff) {
      return { success: false, message: `Staff user "${identifier}" not found. Please check username/email.` };
    }

    if (!matchedStaff.enabled) {
      return { success: false, message: 'This staff account has been disabled by Administrator.' };
    }

    const expectedPassword = this.getStaffPassword(matchedStaff.id, matchedStaff.email, matchedStaff.role);

    // STRICT CHECK: Password must match expectedPassword!
    // No universal 'admin@123' bypass for non-admin accounts!
    if (password === expectedPassword) {
      const authStaff: AuthStaff = {
        id: matchedStaff.id,
        name: matchedStaff.name,
        email: matchedStaff.email,
        role: matchedStaff.role,
        counter_name: matchedStaff.counter_name || `Counter ${matchedStaff.counter_code || 'CTR-01'}`,
        counter_code: matchedStaff.counter_code || 'CTR-01',
        gate_name: matchedStaff.gate_name || `Gate ${matchedStaff.gate_code || 'GATE-01'}`,
        gate_code: matchedStaff.gate_code || 'GATE-01',
        system_name: matchedStaff.system_name || (matchedStaff.role === 'SUPER_ADMIN' ? 'SHWETANK SYSTEM' : matchedStaff.role === 'GATE' ? 'Gate 1 Mobile Scanner' : 'Ticket Counter 1 PC'),
      };
      this.setCurrentStaff(authStaff);

      this.logAuditEvent({
        action: 'USER_LOGIN',
        entity_type: 'AUTH',
        entity_id: authStaff.email,
        actor_name: authStaff.name,
        actor_email: authStaff.email,
        details_summary: `Staff login successful (${authStaff.role})`,
        after_json: {
          role: authStaff.role,
          counter_code: authStaff.counter_code,
          gate_code: authStaff.gate_code,
        },
      });

      return { success: true, staff: authStaff };
    }

    return { success: false, message: 'Incorrect Password. Please try again.' };
  }

  getCurrentStaff(): AuthStaff | null {
    try {
      const saved = localStorage.getItem('vup_auth_staff');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }

  setCurrentStaff(staff: AuthStaff | null) {
    if (staff) {
      localStorage.setItem('vup_auth_staff', JSON.stringify(staff));
    } else {
      localStorage.removeItem('vup_auth_staff');
    }
  }

  logoutStaff() {
    const currentStaff = this.getCurrentStaff();
    if (currentStaff) {
      this.logAuditEvent({
        action: 'USER_LOGOUT',
        entity_type: 'AUTH',
        entity_id: currentStaff.email,
        actor_name: currentStaff.name,
        actor_email: currentStaff.email,
        details_summary: `Staff signed out of session (${currentStaff.role})`,
        after_json: {
          role: currentStaff.role,
        },
      });
    }
    this.setCurrentStaff(null);
  }

  // 5. STAFF / USER MASTER MANAGEMENT
  async fetchStaffList(): Promise<StaffUser[]> {
    if (this.supabase) {
      try {
        // Auto-purge any legacy manager entries from remote table
        try {
          await this.supabase
            .from('staff')
            .delete()
            .or('role.eq.MANAGER,email.ilike.%manager%,name.ilike.%manager%');
        } catch {
          // ignore
        }

        // 1. Prioritize get_staff_directory (returns system_name column)
        const { data: dirData, error: dirError } = await this.supabase.rpc('get_staff_directory');
        if (!dirError && Array.isArray(dirData) && dirData.length > 0) {
          const filtered = (dirData as StaffUser[]).filter(
            s => (s.role as string) !== 'MANAGER' &&
              !s.name.toLowerCase().includes('manager') &&
              !s.email.toLowerCase().includes('manager')
          );
          localStorage.setItem('vup_staff_list', JSON.stringify(filtered));
          return filtered;
        }

        // 2. Fallback to list_staff
        const { data, error } = await this.supabase.rpc('list_staff');
        if (!error && Array.isArray(data) && data.length > 0) {
          const filtered = (data as StaffUser[]).filter(
            s => (s.role as string) !== 'MANAGER' &&
              !s.name.toLowerCase().includes('manager') &&
              !s.email.toLowerCase().includes('manager')
          );
          localStorage.setItem('vup_staff_list', JSON.stringify(filtered));
          return filtered;
        }
      } catch (err) {
        console.warn('fetchStaffList RPC error, using local fallback:', err);
      }
    }
    try {
      const saved = localStorage.getItem('vup_staff_list');
      if (saved) {
        const parsed: StaffUser[] = JSON.parse(saved);
        const filtered = parsed.filter(
          s => (s.role as string) !== 'MANAGER' &&
            !s.name.toLowerCase().includes('manager') &&
            !s.email.toLowerCase().includes('manager')
        );
        localStorage.setItem('vup_staff_list', JSON.stringify(filtered));
        return filtered;
      }
    } catch {
      // ignore
    }
    const defaultStaff: StaffUser[] = [
      {
        id: '208e138d-d105-44f3-9084-00eb707dee27',
        name: 'Park Administrator',
        email: 'admin@vedupvan.local',
        phone: '9876543210',
        role: 'SUPER_ADMIN',
        counter_name: 'Main Ticket Counter 1',
        counter_code: 'CTR-01',
        gate_name: 'Main Entrance Gate',
        gate_code: 'GATE-01',
        system_name: 'SHWETANK SYSTEM',
        enabled: true,
        created_at: '2026-11-12T15:45:24.093Z',
      },
      {
        id: '4ef67a28-7552-4273-a305-82080253a7a3',
        name: 'Counter Operator 1',
        email: 'counter1@vedupvan.local',
        phone: '9876543211',
        role: 'COUNTER',
        counter_name: 'Main Ticket Counter 1',
        counter_code: 'CTR-01',
        gate_name: 'Main Entrance Gate',
        gate_code: 'GATE-01',
        system_name: 'Ticket Counter 1 PC',
        enabled: true,
        created_at: '2026-11-12T15:40:20.305Z',
      },
      {
        id: 'd6c0a2cc-d1d5-4a9c-954b-48ad02fc0f20',
        name: 'Gate Security Guard',
        email: 'gate1@vedupvan.local',
        phone: '9876543212',
        role: 'GATE',
        counter_name: 'Main Ticket Counter 1',
        counter_code: 'CTR-01',
        gate_name: 'Main Entrance Gate',
        gate_code: 'GATE-01',
        system_name: 'Gate 1 Mobile Scanner',
        enabled: true,
        created_at: '2026-11-12T15:40:20.305Z',
      },
    ];
    localStorage.setItem('vup_staff_list', JSON.stringify(defaultStaff));
    return defaultStaff;
  }

  async upsertStaff(params: {
    id?: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    password?: string;
    counter_code?: string;
    gate_code?: string;
    enabled?: boolean;
    system_name?: string;
  }): Promise<{ success: boolean; message?: string }> {
    const cleanEmail = params.email.trim().toLowerCase();
    let savedStaffId = params.id;
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('save_staff_member', {
          p_id: params.id || null,
          p_name: params.name.trim(),
          p_email: cleanEmail,
          p_phone: params.phone?.trim() || null,
          p_role: params.role,
          p_password: params.password?.trim() || null,
          p_counter_code: params.counter_code || 'CTR-01',
          p_gate_code: params.gate_code || 'GATE-01',
          p_enabled: params.enabled ?? true,
          p_system_name: params.system_name?.trim() || null,
        });
        if (error) {
          console.warn('save_staff_member RPC failed, falling back to upsert_staff:', error);
          await this.supabase.rpc('upsert_staff', {
            p_id: params.id || null,
            p_name: params.name.trim(),
            p_email: cleanEmail,
            p_phone: params.phone?.trim() || null,
            p_role: params.role,
            p_password: params.password?.trim() || null,
            p_counter_code: params.counter_code || 'CTR-01',
            p_gate_code: params.gate_code || 'GATE-01',
            p_enabled: params.enabled ?? true,
          });
        } else if (data && data.success === false) {
          return { success: false, message: data.message };
        } else if (data && data.staff_id) {
          savedStaffId = data.staff_id;
        }
      } catch (err: unknown) {
        console.warn('upsert_staff error, continuing with local fallback:', err);
      }
    }

    try {
      const currentList = await this.fetchStaffList();
      const existingIdx = currentList.findIndex(s => (savedStaffId && s.id === savedStaffId) || s.email.toLowerCase() === cleanEmail);
      if (existingIdx !== -1) {
        savedStaffId = currentList[existingIdx].id;
        currentList[existingIdx] = {
          ...currentList[existingIdx],
          name: params.name.trim(),
          email: cleanEmail,
          phone: params.phone?.trim() || currentList[existingIdx].phone,
          role: params.role as any,
          counter_code: params.counter_code || currentList[existingIdx].counter_code,
          gate_code: params.gate_code || currentList[existingIdx].gate_code,
          enabled: params.enabled ?? currentList[existingIdx].enabled,
          system_name: params.system_name?.trim() || currentList[existingIdx].system_name,
          updated_at: new Date().toISOString(),
        };
      } else {
        const newId = savedStaffId || (crypto.randomUUID ? crypto.randomUUID() : `stf-${Date.now()}`);
        savedStaffId = newId;
        const newStaff: StaffUser = {
          id: newId,
          name: params.name.trim(),
          email: cleanEmail,
          phone: params.phone?.trim(),
          role: params.role as any,
          counter_code: params.counter_code || 'CTR-01',
          counter_name: 'Main Ticket Counter 1',
          gate_code: params.gate_code || 'GATE-01',
          gate_name: 'Main Entrance Gate',
          system_name: params.system_name?.trim() || (params.role === 'GATE' ? 'Gate 1 Mobile Scanner' : 'Ticket Counter 1 PC'),
          enabled: params.enabled ?? true,
          created_at: new Date().toISOString(),
        };
        currentList.unshift(newStaff);
      }
      localStorage.setItem('vup_staff_list', JSON.stringify(currentList));

      // Persist password in local credentials store
      if (params.password && params.password.trim()) {
        this.saveStaffPasswordLocally(savedStaffId, cleanEmail, params.password.trim());
      }
      const isUpdate = !!params.id;
      this.logAuditEvent({
        action: isUpdate ? 'STAFF_UPDATED' : 'STAFF_CREATED',
        entity_type: 'STAFF',
        entity_id: cleanEmail,
        actor_name: this.getCurrentStaff()?.name || 'Administrator',
        actor_email: this.getCurrentStaff()?.email || 'admin@vedupvan.local',
        details_summary: isUpdate
          ? `Staff account "${params.name}" (${cleanEmail}) updated as ${params.role}`
          : `New staff account "${params.name}" (${cleanEmail}) added as ${params.role}`,
        after_json: {
          name: params.name,
          email: cleanEmail,
          role: params.role,
          counter_code: params.counter_code,
          gate_code: params.gate_code,
          enabled: params.enabled ?? true,
        },
      });
      return { success: true, message: isUpdate ? 'User updated successfully!' : 'User created successfully!' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Error updating user' };
    }
  }

  async deleteStaff(id: string): Promise<{ success: boolean; message?: string }> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('delete_staff', { p_id: id });
        if (error) {
          console.warn('delete_staff RPC error:', error);
        } else if (data && data.success === false) {
          return { success: false, message: data.message };
        }
      } catch (err) {
        console.warn('delete_staff error, using local fallback:', err);
      }
    }
    try {
      const list = await this.fetchStaffList();
      const targetUser = list.find(s => s.id === id);
      const updated = list.filter(s => s.id !== id);
      localStorage.setItem('vup_staff_list', JSON.stringify(updated));

      // Clean up local password store
      try {
        const passStore = JSON.parse(localStorage.getItem('vup_staff_passwords') || '{}');
        delete passStore[id];
        if (targetUser) {
          delete passStore[targetUser.email];
          delete passStore[targetUser.email.split('@')[0]];
        }
        localStorage.setItem('vup_staff_passwords', JSON.stringify(passStore));
      } catch {
        // ignore
      }

      this.logAuditEvent({
        action: 'STAFF_DELETED',
        entity_type: 'STAFF',
        entity_id: targetUser?.email || id,
        actor_name: this.getCurrentStaff()?.name || 'Administrator',
        actor_email: this.getCurrentStaff()?.email || 'admin@vedupvan.local',
        details_summary: `Staff account "${targetUser?.name || id}" (${targetUser?.email || ''}) was permanently deleted`,
        after_json: {
          id,
          name: targetUser?.name,
          email: targetUser?.email,
          role: targetUser?.role,
        },
      });
      return { success: true, message: 'User deleted permanently!' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed to delete user' };
    }
  }

  // 6. SYSTEM AUDIT & ACTIVITY LOGS
  async clearAllAuditLogs(): Promise<{ success: boolean; message?: string }> {
    try {
      localStorage.removeItem('vup_audit_logs');
      if (this.supabase) {
        try {
          await this.supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        } catch (e) {
          console.warn('Supabase audit logs deletion error:', e);
        }
      }
      return { success: true, message: 'All audit logs cleared successfully!' };
    } catch (err: unknown) {
      return { success: false, message: err instanceof Error ? err.message : 'Failed to clear audit logs' };
    }
  }

  async fetchAuditLogs(limit: number = 300): Promise<AuditLog[]> {
    const cloudLogs: AuditLog[] = [];
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('list_audit_logs', { p_limit: limit });
        if (!error && Array.isArray(data)) {
          for (const item of (data as any[])) {
            const after = (typeof item.after_json === 'object' && item.after_json) || {};
            cloudLogs.push({
              ...item,
              device_name: item.device_name || after.device_name,
              device_type: item.device_type || after.device_type,
              details_summary: item.details_summary || after.details_summary,
            });
          }
        } else {
          const { data: tblData } = await this.supabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
          if (Array.isArray(tblData)) {
            for (const item of (tblData as any[])) {
              const after = (typeof item.after_json === 'object' && item.after_json) || {};
              cloudLogs.push({
                ...item,
                device_name: item.device_name || after.device_name,
                device_type: item.device_type || after.device_type,
                details_summary: item.details_summary || after.details_summary,
              });
            }
          }
        }
      } catch (err) {
        console.warn('list_audit_logs warning:', err);
      }
    }

    const localLogs: AuditLog[] = [];
    const defaultDev = getSystemDeviceInfo();

    try {
      const saved = localStorage.getItem('vup_audit_logs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            let after: any = {};
            if (typeof item.after_json === 'string') {
              try { after = JSON.parse(item.after_json); } catch { }
            } else if (typeof item.after_json === 'object' && item.after_json !== null) {
              after = item.after_json;
            }

            localLogs.push({
              ...item,
              device_name: item.device_name || after.device_name || defaultDev.deviceName,
              device_type: item.device_type || after.device_type || defaultDev.deviceType,
              details_summary: item.details_summary || after.details_summary,
            });
          }
        }
      }
    } catch {
      // ignore
    }

    // Merge real logs
    const merged = [...cloudLogs];
    for (const l of localLogs) {
      if (!merged.some(m => m.id === l.id)) {
        merged.push({
          ...l,
          device_name: l.device_name || defaultDev.deviceName,
          device_type: l.device_type || defaultDev.deviceType,
        });
      }
    }

    // Automatically bridge any local tickets, passes, and entry events into audit logs
    const existingEntityIds = new Set(merged.map(m => m.entity_id || m.id));

    // Bridge local tickets
    for (const t of this.getLocalTickets()) {
      if (!existingEntityIds.has(t.ticket_number) && !existingEntityIds.has(t.id)) {
        merged.push({
          id: `audit-tkt-${t.id}`,
          action: 'TICKET_GENERATED',
          entity_type: 'TICKET',
          entity_id: t.ticket_number,
          actor_name: 'Counter Operator',
          details_summary: `${t.persons_count || 1} Person(s) • ₹${((t.price_paise || (t.persons_count || 1) * 1000) / 100).toFixed(0)} (${t.payment_method || 'CASH'})`,
          device_name: t.device_name || defaultDev.deviceName,
          device_type: defaultDev.deviceType,
          created_at: t.created_at || new Date().toISOString(),
        });
      }
    }

    // Bridge local passes
    for (const p of this.getLocalPasses()) {
      if (!existingEntityIds.has(p.pass_number) && !existingEntityIds.has(p.id)) {
        merged.push({
          id: `audit-pss-${p.id}`,
          action: 'PASS_GENERATED',
          entity_type: 'PASS',
          entity_id: p.pass_number,
          actor_name: 'Counter Operator',
          details_summary: `${p.pass_type} Pass • ${p.holder_name} (${p.people_allowed || 1} Person)`,
          device_name: p.device_name || defaultDev.deviceName,
          device_type: defaultDev.deviceType,
          created_at: p.created_at || new Date().toISOString(),
        });
      }
    }

    // Bridge local entry events
    for (const ev of this.getLocalEntryEvents()) {
      const eventKey = ev.document_number || ev.request_id || ev.id;
      if (!existingEntityIds.has(eventKey) && !existingEntityIds.has(ev.id)) {
        merged.push({
          id: `audit-ev-${ev.id}`,
          action: ev.result === 'SUCCESS'
            ? (ev.document_type === 'PASS' ? 'GATE_PASS_ADMITTED' : 'GATE_TICKET_ADMITTED')
            : `GATE_SCAN_DENIED_${ev.result || 'INVALID'}`,
          entity_type: 'GATE',
          entity_id: ev.document_number || ev.ticket_id || ev.pass_id,
          actor_name: 'Gate Security',
          details_summary: ev.result === 'SUCCESS'
            ? `Entry Granted for ${ev.persons_admitted || 1} Person(s) at ${ev.gate_id || 'GATE-01'}`
            : `Scan Denied: ${ev.reason || ev.result}`,
          device_name: ev.device_name || defaultDev.deviceName,
          device_type: defaultDev.deviceType,
          created_at: ev.scanned_at || new Date().toISOString(),
        });
      }
    }

    // Ensure all logs have valid device details
    const finalized = merged.map(m => ({
      ...m,
      device_name: m.device_name || defaultDev.deviceName,
      device_type: m.device_type || defaultDev.deviceType,
    }));

    return finalized.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, limit);
  }

  logAuditEvent(
    actionOrParams: string | {
      action: string;
      entity_type: string;
      entity_id?: string;
      actor_name?: string;
      actor_email?: string;
      details_summary?: string;
      after_json?: any;
    },
    legacyEntityType?: string,
    legacyEntityId?: string,
    legacyAfterJson?: any
  ) {
    let action = '';
    let entity_type = '';
    let entity_id: string | undefined;
    let actor_name: string | undefined;
    let actor_email: string | undefined;
    let details_summary: string | undefined;
    let after_json: any = null;

    if (typeof actionOrParams === 'string') {
      action = actionOrParams;
      entity_type = legacyEntityType || 'SYSTEM';
      entity_id = legacyEntityId;
      after_json = legacyAfterJson || null;
    } else if (actionOrParams && typeof actionOrParams === 'object') {
      action = actionOrParams.action || '';
      entity_type = actionOrParams.entity_type || 'SYSTEM';
      entity_id = actionOrParams.entity_id;
      actor_name = actionOrParams.actor_name;
      actor_email = actionOrParams.actor_email;
      details_summary = actionOrParams.details_summary;
      after_json = actionOrParams.after_json;
    }

    const currentStaff = this.getCurrentStaff();
    const devInfo = getSystemDeviceInfo();

    const newLog: AuditLog = {
      id: crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      action,
      entity_type,
      entity_id,
      actor_name: actor_name || currentStaff?.name || 'Administrator',
      actor_email: actor_email || currentStaff?.email || 'admin@vedupvan.local',
      device_name: devInfo.deviceName,
      device_type: devInfo.deviceType,
      details_summary: details_summary || (after_json ? JSON.stringify(after_json) : undefined),
      after_json: after_json || null,
      created_at: new Date().toISOString(),
    };

    try {
      const saved = localStorage.getItem('vup_audit_logs');
      const list: AuditLog[] = saved ? JSON.parse(saved) : [];
      list.unshift(newLog);
      localStorage.setItem('vup_audit_logs', JSON.stringify(list.slice(0, 500)));
    } catch {
      // ignore
    }

    if (this.supabase) {
      this.supabase.rpc('log_audit_event', {
        p_action: newLog.action,
        p_entity_type: newLog.entity_type,
        p_entity_id: newLog.entity_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newLog.entity_id) ? newLog.entity_id : null,
        p_actor_name: newLog.actor_name,
        p_actor_email: newLog.actor_email,
        p_device_name: devInfo.deviceName,
        p_device_type: devInfo.deviceType,
        p_details_summary: newLog.details_summary,
        p_details_json: after_json || {},
      }).then(() => { }, () => { });
    }
  }

  // 1. ISSUE SINGLE-USE ENTRY TICKET
  async issueTicket(params: {
    persons_count: number;
    payment_method: PaymentMethod;
    purchaser_name?: string;
    purchaser_phone?: string;
  }): Promise<Ticket> {
    const plan = DEFAULT_PLANS.find(p => p.plan_type === 'TICKET') || DEFAULT_PLANS[0];
    const rates = this.getPricingRates();
    const unitPricePaise = rates.ticket_rate_inr * 100; // Updated dynamic ticket rate
    const totalAmountPaise = unitPricePaise * params.persons_count;

    const orderRef = await this.getNextDocumentNumber('ORDER');
    const ticketNumber = await this.getNextDocumentNumber('TICKET');
    const nowIso = new Date().toISOString();

    // 1. Create Order
    const order: Order = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ord-${Date.now()}`,
      order_reference: orderRef,
      item_type: 'TICKET',
      purchaser_name: params.purchaser_name,
      purchaser_phone: params.purchaser_phone,
      persons_count: params.persons_count,
      amount_paise: totalAmountPaise,
      payment_method: params.payment_method,
      payment_status: 'PAID', // Counter-confirmed payment
      created_at: nowIso,
      paid_at: nowIso,
    };

    // 2. Cryptographically generate QR token, SHA256 hash, and AES-GCM ciphertext
    const rawQrToken = generateSecureQrToken('TICKET', ticketNumber);
    const { ciphertext, nonce, tag, sha256 } = await encryptQrToken(rawQrToken);

    // End of day expiry for single tickets
    const expiresAt = new Date();
    expiresAt.setHours(23, 59, 59, 999);

    const newTicket: Ticket = {
      id: crypto.randomUUID ? crypto.randomUUID() : `tk-${Date.now()}`,
      ticket_number: ticketNumber,
      order_id: order.id,
      plan_id: plan.id,
      persons_count: params.persons_count,
      price_paise: totalAmountPaise,
      qr_token_sha256: sha256,
      qr_token_ciphertext: ciphertext,
      qr_token_nonce: nonce,
      qr_token_tag: tag,
      status: 'ACTIVE',
      issued_at: nowIso,
      expires_at: expiresAt.toISOString(),
      reprint_count: 0,
      created_at: nowIso,
      qr_raw_token: rawQrToken,
      plan_name: plan.name,
      order_reference: orderRef,
      payment_method: params.payment_method,
      device_name: getSystemDeviceInfo().deviceName,
    };

    // Try saving to Supabase via secure server-side RPC if connected
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('issue_ticket', {
          p_plan_id: plan.id,
          p_persons_count: params.persons_count,
          p_payment_method: params.payment_method,
          p_purchaser_name: params.purchaser_name || null,
          p_purchaser_phone: params.purchaser_phone || null,
          p_operator_id: this.getCurrentStaff()?.id || null,
          p_counter_code: this.config.counter_code,
          p_qr_sha256: sha256,
          p_qr_ciphertext: ciphertext,
          p_qr_nonce: nonce,
          p_qr_tag: tag,
          p_device_name: getSystemDeviceInfo().deviceName,
        });

        if (!error && data && data.success && data.ticket) {
          const sTkt = data.ticket;
          newTicket.id = sTkt.id;
          newTicket.ticket_number = sTkt.ticket_number;
          newTicket.order_id = sTkt.order_id;
          newTicket.order_reference = sTkt.order_reference;
          newTicket.price_paise = sTkt.price_paise;
          newTicket.status = sTkt.status;
          order.id = sTkt.order_id;
          order.order_reference = sTkt.order_reference;
          order.amount_paise = sTkt.price_paise;
          console.log('✅ Ticket secured & issued by Supabase Server RPC:', newTicket.ticket_number);
        } else {
          console.warn('Supabase issue_ticket error:', error || data?.message);
        }
      } catch (err) {
        console.warn('Supabase RPC call failed, maintaining local state:', err);
      }
    }

    this.saveLocalTicket(newTicket);
    this.saveLocalOrder(order);

    const currentStaff = this.getCurrentStaff();
    this.logAuditEvent({
      action: 'TICKET_GENERATED',
      entity_type: 'TICKET',
      entity_id: newTicket.ticket_number,
      actor_name: currentStaff?.name || 'Counter Operator',
      actor_email: currentStaff?.email || 'counter1@vedupvan.local',
      details_summary: `${params.persons_count} Person(s) • ₹${(totalAmountPaise / 100).toFixed(0)} (${params.payment_method})`,
      after_json: {
        ticket_number: newTicket.ticket_number,
        order_reference: orderRef,
        persons_count: params.persons_count,
        price_paise: totalAmountPaise,
        payment_method: params.payment_method,
        counter_code: currentStaff?.counter_code || this.config.counter_code,
      },
    });

    return newTicket;
  }

  // 2. ISSUE REUSABLE PASS (MONTHLY, YEARLY, OR FAMILY)
  async issuePass(params: {
    pass_type: 'MONTHLY' | 'YEARLY' | 'FAMILY';
    holder_name: string;
    holder_phone?: string;
    people_allowed: number;
    payment_method: PaymentMethod;
    duration_days?: number;
    price_paise?: number;
  }): Promise<Pass> {
    const plan = DEFAULT_PLANS.find(p => p.plan_type === params.pass_type) || DEFAULT_PLANS[1];

    // Calculate amount based on dynamic pricing rates:
    let amountPaise = params.price_paise;
    if (amountPaise === undefined || amountPaise === null) {
      const rates = this.getPricingRates();
      if (params.pass_type === 'MONTHLY') {
        const days = params.duration_days || 30;
        if (days >= 90) amountPaise = rates.monthly_pass_3m_inr * 100;
        else if (days >= 60) amountPaise = rates.monthly_pass_2m_inr * 100;
        else amountPaise = rates.monthly_pass_1m_inr * 100;
      } else if (params.pass_type === 'YEARLY') {
        amountPaise = rates.yearly_pass_inr * 100;
      } else {
        amountPaise = plan.price_paise;
      }
      if (params.people_allowed > 1) {
        amountPaise = amountPaise * params.people_allowed;
      }
    }

    const orderRef = await this.getNextDocumentNumber('ORDER');
    const passNumber = await this.getNextDocumentNumber(params.pass_type);
    const now = new Date();
    const nowIso = now.toISOString();

    const days = params.duration_days || plan.duration_days || 30;
    const validFromDate = getTodayIstYmd();

    const validThroughDateObj = new Date(now);
    validThroughDateObj.setDate(validThroughDateObj.getDate() + days);
    const validThroughDate = getIstDateYmd(validThroughDateObj);

    // Create Order
    const order: Order = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ord-${Date.now()}`,
      order_reference: orderRef,
      item_type: params.pass_type,
      purchaser_name: params.holder_name,
      purchaser_phone: params.holder_phone,
      persons_count: params.people_allowed,
      amount_paise: amountPaise,
      payment_method: params.payment_method,
      payment_status: 'PAID',
      created_at: nowIso,
      paid_at: nowIso,
    };

    // Encrypted QR token
    const rawQrToken = generateSecureQrToken(params.pass_type, passNumber);
    const { ciphertext, nonce, tag, sha256 } = await encryptQrToken(rawQrToken);

    const planTitle = params.pass_type === 'MONTHLY'
      ? `Monthly Pass (${days === 30 ? '1 Month' : days === 60 ? '2 Months' : '3 Months'})`
      : plan.name;

    const newPass: Pass = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ps-${Date.now()}`,
      pass_number: passNumber,
      order_id: order.id,
      plan_id: plan.id,
      pass_type: params.pass_type,
      holder_name: params.holder_name,
      holder_phone: params.holder_phone,
      people_allowed: params.people_allowed,
      valid_from: validFromDate,
      valid_through: validThroughDate,
      qr_token_sha256: sha256,
      qr_token_ciphertext: ciphertext,
      qr_token_nonce: nonce,
      qr_token_tag: tag,
      status: 'ACTIVE',
      reprint_count: 0,
      created_at: nowIso,
      updated_at: nowIso,
      qr_raw_token: rawQrToken,
      plan_name: planTitle,
      amount_paise: amountPaise,
      payment_method: params.payment_method,
      device_name: getSystemDeviceInfo().deviceName,
    };

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('issue_pass', {
          p_pass_type: params.pass_type,
          p_holder_name: params.holder_name,
          p_holder_phone: params.holder_phone || null,
          p_people_allowed: params.people_allowed,
          p_payment_method: params.payment_method,
          p_valid_from: validFromDate,
          p_valid_through: validThroughDate,
          p_qr_sha256: sha256,
          p_qr_ciphertext: ciphertext,
          p_qr_nonce: nonce,
          p_qr_tag: tag,
          p_members: [],
          p_operator_id: this.getCurrentStaff()?.id || null,
          p_counter_code: this.config.counter_code,
          p_device_name: getSystemDeviceInfo().deviceName,
        });

        if (!error && data && data.success && data.pass) {
          const sPass = data.pass;
          newPass.id = sPass.id;
          newPass.pass_number = sPass.pass_number;
          newPass.order_id = sPass.order_id;
          order.id = sPass.order_id;
          order.amount_paise = sPass.price_paise;
          console.log('✅ Pass secured & issued by Supabase Server RPC:', newPass.pass_number);
        } else {
          console.warn('Supabase issue_pass error:', error || data?.message);
        }
      } catch (err) {
        console.warn('Supabase issue_pass RPC failed, maintaining local state:', err);
      }
    }

    this.saveLocalPass(newPass);
    this.saveLocalOrder(order);

    const currentStaff = this.getCurrentStaff();
    this.logAuditEvent({
      action: 'PASS_GENERATED',
      entity_type: 'PASS',
      entity_id: newPass.pass_number,
      actor_name: currentStaff?.name || 'Counter Operator',
      actor_email: currentStaff?.email || 'counter1@vedupvan.local',
      details_summary: `${params.pass_type} Pass (${newPass.holder_name}) • ₹${((amountPaise || 0) / 100).toFixed(0)} (${params.payment_method})`,
      after_json: {
        pass_number: newPass.pass_number,
        holder_name: newPass.holder_name,
        pass_type: params.pass_type,
        people_allowed: newPass.people_allowed,
        price_paise: amountPaise,
        valid_from: validFromDate,
        valid_through: validThroughDate,
        payment_method: params.payment_method,
      },
    });

    return newPass;
  }

  // 3. GATE ENTRY VALIDATION & BURNING (SECURE SHA-256 LOOKUP)
  async admitVisitor(rawQrTokenOrText: string): Promise<VerificationResponse> {
    const trimmed = rawQrTokenOrText.trim();
    if (!trimmed) {
      return {
        success: false,
        code: 'INVALID',
        message: 'Empty scan data.',
      };
    }

    // Compute SHA-256 hash of scanned token
    const scannedHash = await computeSha256(trimmed);
    const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`;

    // A. If Supabase is connected, call Postgres RPC public.admit_visitor
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('admit_visitor', {
          p_qr_token_hash: trimmed, // Sends raw QR token, ticket number, or hash
          p_gate_code: this.config.gate_code,
          p_request_id: requestId,
        });

        if (!error && data) {
          // Sync local state as well
          this.syncLocalBurn(scannedHash);
          const res = data as VerificationResponse;
          this.logEntryEvent({
            request_id: requestId,
            document_type: res.document_type || 'TICKET',
            result: res.code || (res.success ? 'SUCCESS' : 'INVALID'),
            persons_admitted: res.persons_admitted || 0,
            scanned_at: new Date().toISOString(),
            document_number: res.ticket_number || res.pass_number,
            holder_name: res.holder_name,
            reason: res.message,
          });

          const currentStaff = this.getCurrentStaff();
          this.logAuditEvent({
            action: res.success
              ? (res.document_type === 'PASS' ? 'GATE_PASS_ADMITTED' : 'GATE_TICKET_ADMITTED')
              : `GATE_SCAN_DENIED_${res.code || 'INVALID'}`,
            entity_type: 'GATE',
            entity_id: res.ticket_number || res.pass_number || trimmed,
            actor_name: currentStaff?.name || 'Gate Security',
            actor_email: currentStaff?.email || 'gate1@vedupvan.local',
            details_summary: res.success
              ? `Entry Granted for ${res.persons_admitted || 1} Person(s) (${res.document_type || 'TICKET'})`
              : `Scan Denied: ${res.message || res.code}`,
            after_json: {
              result: res.code,
              persons_admitted: res.persons_admitted,
              doc_number: res.ticket_number || res.pass_number,
              holder_name: res.holder_name,
              reason: res.message,
              gate_code: this.config.gate_code,
            },
          });

          return res;
        } else if (error) {
          console.warn('Supabase admit_visitor RPC returned error, using local fallback:', error);
        }
      } catch (err) {
        console.warn('Supabase admit_visitor RPC failed, using local engine:', err);
      }
    }

    // B. Local Deterministic Validation Engine (Conforms 100% to schema rules)
    return this.admitVisitorLocal(trimmed, scannedHash, requestId);
  }

  private admitVisitorLocal(rawToken: string, sha256: string, requestId: string): VerificationResponse {
    const now = new Date();
    const todayYmd = getTodayIstYmd();
    const currentStaff = this.getCurrentStaff();

    const tickets = this.getLocalTickets();
    const passes = this.getLocalPasses();

    // Extract document number if payload has VUP-T-... or VUP-M-... or VUP-Y-... or VUP-F-...
    let extractedDocNum: string | null = null;
    if (rawToken.includes('VUP-')) {
      const match = rawToken.match(/VUP-[TMYF]-\d+-\d+/);
      if (match) extractedDocNum = match[0];
    }

    // 1. Check Tickets in ANY order (ticket 1, 2, 5, etc.)
    const ticketIdx = tickets.findIndex(t =>
      t.qr_token_sha256 === sha256 ||
      t.qr_raw_token === rawToken ||
      t.ticket_number === rawToken ||
      (extractedDocNum && t.ticket_number === extractedDocNum)
    );
    if (ticketIdx !== -1) {
      const ticket = tickets[ticketIdx];

      // Check if already used
      if (ticket.status === 'USED' || ticket.used_at) {
        this.logEntryEvent({
          request_id: requestId,
          document_type: 'TICKET',
          ticket_id: ticket.id,
          result: 'USED',
          persons_admitted: 0,
          reason: 'Ticket already used and burned',
          scanned_at: now.toISOString(),
          document_number: ticket.ticket_number,
        });

        const firstScannedStr = new Date(ticket.used_at || ticket.created_at).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        this.logAuditEvent({
          action: 'GATE_SCAN_DENIED_USED',
          entity_type: 'GATE',
          entity_id: ticket.ticket_number,
          actor_name: currentStaff?.name || 'Gate Security',
          actor_email: currentStaff?.email || 'gate1@vedupvan.local',
          details_summary: `Ticket already expired / used (First scanned: ${firstScannedStr})`,
          after_json: { ticket_number: ticket.ticket_number, first_scanned_at: firstScannedStr },
        });

        return {
          success: false,
          code: 'USED',
          document_type: 'TICKET',
          ticket_number: ticket.ticket_number,
          scanned_at: firstScannedStr,
          message: `TICKET ALREADY EXPIRED! First scanned at: ${firstScannedStr}`,
        };
      }

      // Check expired
      if (ticket.expires_at && now > new Date(ticket.expires_at)) {
        ticket.status = 'EXPIRED';
        tickets[ticketIdx] = ticket;
        localStorage.setItem('vup_tickets', JSON.stringify(tickets));

        this.logAuditEvent({
          action: 'GATE_SCAN_DENIED_EXPIRED',
          entity_type: 'GATE',
          entity_id: ticket.ticket_number,
          actor_name: currentStaff?.name || 'Gate Security',
          actor_email: currentStaff?.email || 'gate1@vedupvan.local',
          details_summary: 'Ticket validity expired',
          after_json: { ticket_number: ticket.ticket_number, expires_at: ticket.expires_at },
        });

        return {
          success: false,
          code: 'EXPIRED',
          document_type: 'TICKET',
          ticket_number: ticket.ticket_number,
          message: 'Ticket validity expired!',
        };
      }

      // SUCCESS: BURN TICKET
      ticket.status = 'USED';
      ticket.used_at = now.toISOString();
      tickets[ticketIdx] = ticket;
      localStorage.setItem('vup_tickets', JSON.stringify(tickets));

      this.logEntryEvent({
        request_id: requestId,
        document_type: 'TICKET',
        ticket_id: ticket.id,
        result: 'SUCCESS',
        persons_admitted: ticket.persons_count,
        reason: 'Verified and single-entry ticket burned',
        scanned_at: now.toISOString(),
        document_number: ticket.ticket_number,
      });

      this.logAuditEvent({
        action: 'GATE_TICKET_ADMITTED',
        entity_type: 'GATE',
        entity_id: ticket.ticket_number,
        actor_name: currentStaff?.name || 'Gate Security',
        actor_email: currentStaff?.email || 'gate1@vedupvan.local',
        details_summary: `Entry Granted for ${ticket.persons_count} Person(s) • Ticket Burned`,
        after_json: {
          ticket_number: ticket.ticket_number,
          persons_count: ticket.persons_count,
          gate_code: this.config.gate_code,
        },
      });

      return {
        success: true,
        code: 'SUCCESS',
        document_type: 'TICKET',
        ticket_number: ticket.ticket_number,
        persons_admitted: ticket.persons_count,
        plan_name: ticket.plan_name || 'Single Entry Ticket',
        issued_at: new Date(ticket.created_at).toLocaleString('en-IN'),
        scanned_at: now.toLocaleString('en-IN'),
        payment_method: ticket.payment_method || 'CASH',
        amount_inr: ((ticket.price_paise || ticket.persons_count * 1000) / 100).toFixed(2),
        message: `GENUINE TICKET VERIFIED! Entry Granted for ${ticket.persons_count} Person(s).`,
      };
    }

    // 2. Check Passes in ANY order
    const passIdx = passes.findIndex(p =>
      p.qr_token_sha256 === sha256 ||
      p.qr_raw_token === rawToken ||
      p.pass_number === rawToken ||
      (extractedDocNum && p.pass_number === extractedDocNum)
    );
    if (passIdx !== -1) {
      const pass = passes[passIdx];

      // Check status
      if (pass.status !== 'ACTIVE') {
        const resultCode: EntryResult = pass.status === 'REFUNDED' ? 'REJECTED' : pass.status;
        this.logAuditEvent({
          action: `GATE_PASS_DENIED_${resultCode}`,
          entity_type: 'GATE',
          entity_id: pass.pass_number,
          actor_name: currentStaff?.name || 'Gate Security',
          actor_email: currentStaff?.email || 'gate1@vedupvan.local',
          details_summary: `Pass is ${pass.status}!`,
          after_json: { pass_number: pass.pass_number, status: pass.status },
        });
        return {
          success: false,
          code: resultCode,
          document_type: 'PASS',
          pass_number: pass.pass_number,
          message: `Pass is ${pass.status}!`,
        };
      }

      // Check date validity
      if (todayYmd < pass.valid_from || todayYmd > pass.valid_through) {
        this.logAuditEvent({
          action: 'GATE_PASS_DENIED_EXPIRED',
          entity_type: 'GATE',
          entity_id: pass.pass_number,
          actor_name: currentStaff?.name || 'Gate Security',
          actor_email: currentStaff?.email || 'gate1@vedupvan.local',
          details_summary: `Pass expired on ${pass.valid_through}`,
          after_json: { pass_number: pass.pass_number, valid_through: pass.valid_through },
        });
        return {
          success: false,
          code: 'EXPIRED',
          document_type: 'PASS',
          pass_number: pass.pass_number,
          message: `Pass validity expired on ${pass.valid_through}`,
        };
      }

      // Check cooldown (prevent immediate double tap within 60 minutes)
      const lastLogs = this.getLocalEntryEvents().filter(e => e.pass_id === pass.id && e.result === 'SUCCESS');
      if (lastLogs.length > 0) {
        const lastScanTime = new Date(lastLogs[0].scanned_at).getTime();
        const diffMinutes = (now.getTime() - lastScanTime) / (1000 * 60);
        if (diffMinutes < 60) {
          this.logAuditEvent({
            action: 'GATE_PASS_DENIED_COOLDOWN',
            entity_type: 'GATE',
            entity_id: pass.pass_number,
            actor_name: currentStaff?.name || 'Gate Security',
            actor_email: currentStaff?.email || 'gate1@vedupvan.local',
            details_summary: `Pass cooldown active (Last used ${Math.round(diffMinutes)} mins ago)`,
            after_json: { pass_number: pass.pass_number, minutes_ago: Math.round(diffMinutes) },
          });
          return {
            success: false,
            code: 'COOLDOWN',
            document_type: 'PASS',
            pass_number: pass.pass_number,
            message: `COOLDOWN ACTIVE! Last scanned ${Math.round(diffMinutes)} mins ago.`,
          };
        }
      }

      // SUCCESS: PASS REMAINS ACTIVE
      this.logEntryEvent({
        request_id: requestId,
        document_type: 'PASS',
        pass_id: pass.id,
        result: 'SUCCESS',
        persons_admitted: pass.people_allowed,
        reason: 'Pass verified and admission recorded',
        scanned_at: now.toISOString(),
        document_number: pass.pass_number,
        holder_name: pass.holder_name,
      });

      this.logAuditEvent({
        action: 'GATE_PASS_ADMITTED',
        entity_type: 'GATE',
        entity_id: pass.pass_number,
        actor_name: currentStaff?.name || 'Gate Security',
        actor_email: currentStaff?.email || 'gate1@vedupvan.local',
        details_summary: `Entry Granted for ${pass.people_allowed} Person(s) (${pass.holder_name})`,
        after_json: {
          pass_number: pass.pass_number,
          holder_name: pass.holder_name,
          people_allowed: pass.people_allowed,
          valid_through: pass.valid_through,
          gate_code: this.config.gate_code,
        },
      });

      return {
        success: true,
        code: 'SUCCESS',
        document_type: 'PASS',
        pass_number: pass.pass_number,
        pass_type: pass.pass_type,
        holder_name: pass.holder_name,
        persons_admitted: pass.people_allowed,
        valid_through: pass.valid_through,
        message: `PASS VERIFIED! Welcome ${pass.holder_name} (${pass.people_allowed} Person(s) allowed).`,
      };
    }

    // 3. Not Found
    this.logEntryEvent({
      request_id: requestId,
      document_type: 'TICKET',
      result: 'INVALID',
      persons_admitted: 0,
      reason: 'No ticket or pass matching QR hash',
      scanned_at: now.toISOString(),
      document_number: rawToken,
    });

    this.logAuditEvent({
      action: 'GATE_SCAN_DENIED_INVALID',
      entity_type: 'GATE',
      entity_id: (rawToken || '').slice(0, 30),
      actor_name: currentStaff?.name || 'Gate Security',
      actor_email: currentStaff?.email || 'gate1@vedupvan.local',
      details_summary: 'FRAUD ALERT: Unrecognized or forged QR code',
      after_json: { scanned_raw: (rawToken || '').slice(0, 40) },
    });

    return {
      success: false,
      code: 'INVALID',
      message: 'INVALID QR! Ticket/Pass not found in Ved Upvan database.',
    };
  }

  private syncLocalBurn(sha256: string) {
    const tickets = this.getLocalTickets();
    const idx = tickets.findIndex(t => t.qr_token_sha256 === sha256);
    if (idx !== -1) {
      tickets[idx].status = 'USED';
      tickets[idx].used_at = new Date().toISOString();
      localStorage.setItem('vup_tickets', JSON.stringify(tickets));
    }
  }

  // Local Storage Helpers
  private saveLocalTicket(ticket: Ticket) {
    const tickets = this.getLocalTickets();
    tickets.unshift(ticket);
    localStorage.setItem('vup_tickets', JSON.stringify(tickets.slice(0, 500)));
  }

  getLocalTickets(): Ticket[] {
    try {
      const data = localStorage.getItem('vup_tickets');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveLocalPass(pass: Pass) {
    const passes = this.getLocalPasses();
    passes.unshift(pass);
    localStorage.setItem('vup_passes', JSON.stringify(passes.slice(0, 500)));
  }

  getLocalPasses(): Pass[] {
    try {
      const data = localStorage.getItem('vup_passes');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private saveLocalOrder(order: Order) {
    const orders = this.getLocalOrders();
    orders.unshift(order);
    localStorage.setItem('vup_orders', JSON.stringify(orders.slice(0, 500)));
  }

  getLocalOrders(): Order[] {
    try {
      const data = localStorage.getItem('vup_orders');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private logEntryEvent(event: Partial<EntryEvent>) {
    const events = this.getLocalEntryEvents();
    const newEvent: EntryEvent = {
      id: crypto.randomUUID ? crypto.randomUUID() : `ev-${Date.now()}`,
      request_id: event.request_id || crypto.randomUUID(),
      document_type: event.document_type || 'TICKET',
      ticket_id: event.ticket_id,
      pass_id: event.pass_id,
      gate_id: this.config.gate_code,
      result: event.result || 'INVALID',
      persons_admitted: event.persons_admitted || 0,
      reason: event.reason,
      scanned_at: event.scanned_at || new Date().toISOString(),
      document_number: event.document_number,
      holder_name: event.holder_name,
      device_name: getSystemDeviceInfo().deviceName,
    };
    events.unshift(newEvent);
    localStorage.setItem('vup_entry_events', JSON.stringify(events.slice(0, 500)));
  }

  getLocalEntryEvents(): EntryEvent[] {
    try {
      const data = localStorage.getItem('vup_entry_events');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  // Fetch Authoritative Recent Tickets from Cloud Supabase (with auto-cache purge)
  async fetchRecentTickets(limit: number = 10): Promise<Ticket[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('v_report_tickets')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          const cloudTickets = data as Ticket[];
          if (cloudTickets.length === 0) {
            // Cloud database is empty (0 tickets) -> Clean local browser cache
            localStorage.removeItem('vup_tickets');
            return [];
          }
          localStorage.setItem('vup_tickets', JSON.stringify(cloudTickets));
          return cloudTickets;
        }
      } catch (err) {
        console.warn('fetchRecentTickets failed, using local fallback:', err);
      }
    }
    return this.getLocalTickets().slice(0, limit);
  }

  // Fetch Authoritative Recent Passes from Cloud Supabase (with auto-cache purge)
  async fetchRecentPasses(limit: number = 10): Promise<Pass[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('v_report_passes')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data) {
          const cloudPasses = data as Pass[];
          if (cloudPasses.length === 0) {
            localStorage.removeItem('vup_passes');
            return [];
          }
          localStorage.setItem('vup_passes', JSON.stringify(cloudPasses));
          return cloudPasses;
        }
      } catch (err) {
        console.warn('fetchRecentPasses failed, using local fallback:', err);
      }
    }
    return this.getLocalPasses().slice(0, limit);
  }

  // Full Bi-directional Cloud & Local Cache Synchronization
  async syncAllWithCloud(): Promise<{ ticketsCount: number; passesCount: number }> {
    if (!this.supabase) return { ticketsCount: 0, passesCount: 0 };
    try {
      const { data, error } = await this.supabase.rpc('get_reporting_data', { p_limit: 1000 });
      if (!error && data) {
        const tktCount = (data.tickets || []).length;
        const pssCount = (data.passes || []).length;
        return { ticketsCount: tktCount, passesCount: pssCount };
      }
      return { ticketsCount: 0, passesCount: 0 };
    } catch (e) {
      console.warn('syncAllWithCloud warning:', e);
      return { ticketsCount: 0, passesCount: 0 };
    }
  }

  // Real-time Data Sync & Reporting Queries
  async fetchReportingData(): Promise<{ tickets: Ticket[]; passes: Pass[]; entryEvents: EntryEvent[] }> {
    let cloudTickets: Ticket[] = [];
    let cloudPasses: Pass[] = [];
    let cloudEvents: EntryEvent[] = [];

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('get_reporting_data', { p_limit: 2000 });

        if (!error && data) {
          cloudTickets = (data.tickets || []) as Ticket[];
          cloudPasses = (data.passes || []) as Pass[];
          cloudEvents = (data.events || []) as EntryEvent[];

          localStorage.setItem('vup_tickets', JSON.stringify(cloudTickets.slice(0, 500)));
          localStorage.setItem('vup_passes', JSON.stringify(cloudPasses.slice(0, 500)));
          localStorage.setItem('vup_entry_events', JSON.stringify(cloudEvents.slice(0, 500)));
        } else if (error) {
          console.warn('RPC get_reporting_data error:', error);
        }
      } catch (err) {
        console.warn('Error fetching cloud reporting data, using local fallback:', err);
      }
    }

    const localTickets = this.getLocalTickets();
    const localPasses = this.getLocalPasses();
    const localEvents = this.getLocalEntryEvents();

    const mergedTickets = [...cloudTickets];
    for (const lt of localTickets) {
      if (!mergedTickets.some(t => t.id === lt.id || t.ticket_number === lt.ticket_number)) {
        mergedTickets.push(lt);
      }
    }

    const mergedPasses = [...cloudPasses];
    for (const lp of localPasses) {
      if (!mergedPasses.some(p => p.id === lp.id || p.pass_number === lp.pass_number)) {
        mergedPasses.push(lp);
      }
    }

    const mergedEvents = [...cloudEvents];
    for (const le of localEvents) {
      if (!mergedEvents.some(e => e.id === le.id || (e.request_id && e.request_id === le.request_id))) {
        mergedEvents.push(le);
      }
    }

    const defaultDev = getSystemDeviceInfo();

    return {
      tickets: mergedTickets.map(t => ({
        ...t,
        device_name: t.device_name || defaultDev.deviceName,
      })),
      passes: mergedPasses.map(p => ({
        ...p,
        device_name: p.device_name || defaultDev.deviceName,
      })),
      entryEvents: mergedEvents.map(e => ({
        ...e,
        device_name: e.device_name || defaultDev.deviceName,
      })),
    };
  }

  getTodayTicketSummary(): {
    totalTickets: number;
    totalPersons: number;
    cashAmount: number;
    upiAmount: number;
    totalAmount: number;
  } {
    const todayIstYmd = getTodayIstYmd();
    const tickets = this.getLocalTickets().filter(t => isSameIstDay(t.created_at, todayIstYmd));

    let totalPersons = 0;
    let cashAmountPaise = 0;
    let upiAmountPaise = 0;

    for (const t of tickets) {
      totalPersons += t.persons_count || 1;
      const amount = t.price_paise || (t.persons_count || 1) * 1000;
      if (t.payment_method === 'UPI') {
        upiAmountPaise += amount;
      } else {
        cashAmountPaise += amount;
      }
    }

    return {
      totalTickets: tickets.length,
      totalPersons,
      cashAmount: cashAmountPaise / 100,
      upiAmount: upiAmountPaise / 100,
      totalAmount: (cashAmountPaise + upiAmountPaise) / 100,
    };
  }

  getTodayScanSummary(): {
    totalScannedTickets: number;
    totalPersonsAdmitted: number;
  } {
    const todayIstYmd = getTodayIstYmd();
    const events = this.getLocalEntryEvents().filter(e => isSameIstDay(e.scanned_at, todayIstYmd));

    // Only ticket scans
    const ticketEvents = events.filter(e => e.document_type === 'TICKET');
    const successfulEvents = ticketEvents.filter(e => e.result === 'SUCCESS');
    const totalPersons = successfulEvents.reduce((sum, e) => sum + (e.persons_admitted || 1), 0);

    return {
      totalScannedTickets: ticketEvents.length,
      totalPersonsAdmitted: totalPersons,
    };
  }

  async fetchTodayScanSummary(): Promise<{
    totalScannedTickets: number;
    totalPersonsAdmitted: number;
  }> {
    const todayIstYmd = getTodayIstYmd();
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('get_dashboard_metrics', {
          p_target_date: todayIstYmd,
        });

        if (!error && data && data.success) {
          return {
            totalScannedTickets: data.scanned_tickets || 0,
            totalPersonsAdmitted: data.visitors_admitted || 0,
          };
        }
      } catch (err) {
        console.warn('fetchTodayScanSummary RPC failed, using local:', err);
      }
    }
    return this.getTodayScanSummary();
  }

  async fetchTodayTicketSummary(): Promise<{
    totalTickets: number;
    totalPersons: number;
    cashAmount: number;
    upiAmount: number;
    totalAmount: number;
  }> {
    const todayIstYmd = getTodayIstYmd();
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc('get_dashboard_metrics', {
          p_target_date: todayIstYmd,
        });

        if (!error && data && data.success) {
          const cashAmount = (data.cash_paise || 0) / 100;
          const upiAmount = (data.upi_paise || 0) / 100;
          const totalAmount = (data.total_collection_paise || 0) / 100;
          return {
            totalTickets: data.tickets_issued || 0,
            totalPersons: data.total_visitors || 0,
            cashAmount,
            upiAmount,
            totalAmount,
          };
        }
      } catch (err) {
        console.warn('fetchTodayTicketSummary RPC failed, using local:', err);
      }
    }
    return this.getTodayTicketSummary();
  }
}

export const dbService = new VupDatabaseService();
