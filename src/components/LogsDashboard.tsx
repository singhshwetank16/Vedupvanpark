import React, { useState, useEffect, useMemo } from 'react';
import type { Ticket, Pass, EntryEvent, AppConfig, StaffUser, AuditLog } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { getSystemDeviceInfo, getAutoDetectedHardware, getCustomDeviceName, setCustomDeviceName } from '../lib/device';
import { getTodayIstYmd, getIstDateYmd, isSameIstDay } from '../lib/dateUtils';
import { 
  Users, 
  IndianRupee, 
  ShieldCheck, 
  Search, 
  CheckCircle2, 
  Printer, 
  Download, 
  Calendar, 
  RefreshCw, 
  FileText, 
  Layers,
  ChevronRight,
  UserPlus,
  KeyRound,
  Edit2,
  Trash2,
  Check,
  X,
  Settings,
  Bluetooth,
  Activity,
  Save,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  Smartphone,
  Monitor,
  Tablet,
  LogIn,
  LogOut,
  Ticket as TicketIcon,
  CreditCard,
  Camera,
  UserCheck,
  UserX,
  Unlock,
  AlertTriangle,
  RotateCcw,
  Cpu,
  Laptop,
} from 'lucide-react';

interface LogsDashboardProps {
  config: AppConfig;
  onOpenSettings?: () => void;
  onTicketGenerated?: (doc: Ticket | Pass) => void;
}

type ReportType = 
  | 'daily-sales'
  | 'monthly-sales'
  | 'scan-tickets'
  | 'generate-tickets'
  | 'monthly-generate-pass'
  | 'yearly-generate-pass'
  | 'monthly-scan-pass'
  | 'yearly-scan-pass';

export type MonthlyDurationCategory = 'ALL' | '1_MONTH' | '2_MONTHS' | '3_MONTHS';

export interface PassDurationCategoryInfo {
  category: '1_MONTH' | '2_MONTHS' | '3_MONTHS' | 'YEARLY' | 'OTHER';
  label: string;
  shortLabel: string;
  days: number;
  months: number;
  expectedRateInr: number;
}

export const getPassDurationCategory = (p: Pass): PassDurationCategoryInfo => {
  if (p.pass_type === 'YEARLY') {
    return {
      category: 'YEARLY',
      label: '1 Year (365 Days)',
      shortLabel: '1 Year',
      days: 365,
      months: 12,
      expectedRateInr: 3100,
    };
  }

  const name = (p.plan_name || '').toLowerCase();
  const amount = p.amount_paise || 0;

  // Day difference calculation
  let diffDays = 30;
  if (p.valid_from && p.valid_through) {
    const fromTime = new Date(p.valid_from).getTime();
    const throughTime = new Date(p.valid_through).getTime();
    if (!isNaN(fromTime) && !isNaN(throughTime) && throughTime > fromTime) {
      diffDays = Math.round((throughTime - fromTime) / (1000 * 60 * 60 * 24));
    }
  }

  // Check 3 Months (approx 90 days or ₹900)
  if (name.includes('3 month') || name.includes('3m') || name.includes('90 day') || amount === 90000 || diffDays >= 75) {
    return {
      category: '3_MONTHS',
      label: '3 Months (90 Days)',
      shortLabel: '3 Months',
      days: 90,
      months: 3,
      expectedRateInr: 900,
    };
  }

  // Check 2 Months (approx 60 days or ₹600)
  if (name.includes('2 month') || name.includes('2m') || name.includes('60 day') || amount === 60000 || (diffDays >= 45 && diffDays < 75)) {
    return {
      category: '2_MONTHS',
      label: '2 Months (60 Days)',
      shortLabel: '2 Months',
      days: 60,
      months: 2,
      expectedRateInr: 600,
    };
  }

  // Default to 1 Month (approx 30 days or ₹300)
  return {
    category: '1_MONTH',
    label: '1 Month (30 Days)',
    shortLabel: '1 Month',
    days: 30,
    months: 1,
    expectedRateInr: 300,
  };
};

export const getPassEffectiveAmountPaise = (
  p: Pass, 
  rates?: { monthly_pass_1m_inr: number; monthly_pass_2m_inr: number; monthly_pass_3m_inr: number; yearly_pass_inr: number }
): number => {
  const currentRates = rates || dbService.getPricingRates();
  if (p.pass_type === 'YEARLY') {
    return (p.amount_paise && p.amount_paise > 100000) ? p.amount_paise : (currentRates.yearly_pass_inr * 100);
  }

  const info = getPassDurationCategory(p);

  if (info.category === '3_MONTHS') {
    if (p.amount_paise && p.amount_paise >= 80000) {
      return p.amount_paise;
    }
    return (currentRates.monthly_pass_3m_inr || 900) * 100;
  }

  if (info.category === '2_MONTHS') {
    if (p.amount_paise && p.amount_paise >= 50000 && p.amount_paise < 80000) {
      return p.amount_paise;
    }
    return (currentRates.monthly_pass_2m_inr || 600) * 100;
  }

  // 1 Month:
  if (p.amount_paise && p.amount_paise > 0 && p.amount_paise < 50000) {
    return p.amount_paise;
  }
  return (currentRates.monthly_pass_1m_inr || 300) * 100;
};

export const LogsDashboard: React.FC<LogsDashboardProps> = ({ config, onTicketGenerated }) => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [entryEvents, setEntryEvents] = useState<EntryEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Active view: 'reports' | 'users' | 'audit' | 'settings'
  const [activeSection, setActiveSection] = useState<'reports' | 'users' | 'audit' | 'settings'>('reports');

  // User Master states
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [showStaffModalPassword, setShowStaffModalPassword] = useState(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedStaffForPassword, setSelectedStaffForPassword] = useState<StaffUser | null>(null);
  const [showChangePassword, setShowChangePassword] = useState(true);
  const [visibleTablePasswords, setVisibleTablePasswords] = useState<Record<string, boolean>>({});
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('all');
  const [isStaffSaving, setIsStaffSaving] = useState(false);
  const [staffFormFeedback, setStaffFormFeedback] = useState<string | null>(null);

  const [staffFormData, setStaffFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'COUNTER' as 'SUPER_ADMIN' | 'MANAGER' | 'COUNTER' | 'GATE',
    password: '',
    counter_code: 'CTR-01',
    gate_code: 'GATE-01',
    system_name: '',
    enabled: true,
  });

  const [newPassword, setNewPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState<string | null>(null);

  // Audit Logs states
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditCategory, setAuditCategory] = useState<'all' | 'auth' | 'gate' | 'ticket' | 'pass' | 'staff' | 'security' | 'admin'>('all');
  const [auditSearchQuery, setAuditSearchQuery] = useState('');

  // Hardware / Bluetooth state for embedded settings
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false);
  const [btStatus, setBtStatus] = useState<string>(printerService.isConnected ? 'Connected' : 'Not Connected');

  // Settings Protection & Rate Management States
  const [isSettingsUnlocked, setIsSettingsUnlocked] = useState<boolean>(false);
  const [isSettingsAuthModalOpen, setIsSettingsAuthModalOpen] = useState<boolean>(false);
  const [settingsPasswordInput, setSettingsPasswordInput] = useState<string>('');
  const [showSettingsPassword, setShowSettingsPassword] = useState<boolean>(false);
  const [settingsAuthError, setSettingsAuthError] = useState<string | null>(null);
  const [isVerifyingSettingsAuth, setIsVerifyingSettingsAuth] = useState<boolean>(false);

  // Editable pricing rates
  const [ratesForm, setRatesForm] = useState(() => dbService.getPricingRates());
  const [pricingSaveSuccess, setPricingSaveSuccess] = useState<string | null>(null);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);

  // Custom Device Name State
  const [customDeviceInput, setCustomDeviceInput] = useState<string>(() => getCustomDeviceName());
  const [deviceSaveMessage, setDeviceSaveMessage] = useState<string | null>(null);

  const handleSaveCustomDeviceName = () => {
    setCustomDeviceName(customDeviceInput);
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'TERMINAL_CONFIGURED',
      entity_type: 'SETTINGS',
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Terminal device name set to "${customDeviceInput.trim()}"`,
      after_json: { customDeviceName: customDeviceInput.trim() },
    });
    setDeviceSaveMessage('Terminal device name saved successfully!');
    setTimeout(() => setDeviceSaveMessage(null), 3000);
  };

  const handleResetCustomDeviceName = () => {
    setCustomDeviceName('');
    setCustomDeviceInput('');
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'TERMINAL_CONFIGURED',
      entity_type: 'SETTINGS',
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: 'Terminal name reset to auto-detected system hardware name',
    });
    setDeviceSaveMessage('Reset to auto-detected hardware system name.');
    setTimeout(() => setDeviceSaveMessage(null), 3000);
  };

  const handleSettingsTabClick = () => {
    if (activeSection === 'settings' && isSettingsUnlocked) {
      return;
    }
    // Always prompt for Administrator password when entering Settings from outside
    setIsSettingsUnlocked(false);
    setSettingsPasswordInput('');
    setSettingsAuthError(null);
    setShowSettingsPassword(false);
    setIsSettingsAuthModalOpen(true);
  };

  const handleSwitchSection = (section: 'reports' | 'users' | 'audit') => {
    // Immediately lock Settings and clear inputs whenever navigating away from Settings
    setIsSettingsUnlocked(false);
    setSettingsPasswordInput('');
    setSettingsAuthError(null);
    setShowSettingsPassword(false);
    setActiveSection(section);
  };

  const handleCloseSettingsModal = () => {
    setIsSettingsAuthModalOpen(false);
    setSettingsPasswordInput('');
    setSettingsAuthError(null);
    if (activeSection === 'settings' && !isSettingsUnlocked) {
      setActiveSection('reports');
    }
  };

  // Auto-lock Settings whenever leaving Settings, navigating away, or switching browser tabs/minimizing
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && activeSection === 'settings') {
        setIsSettingsUnlocked(false);
        setActiveSection('reports');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setIsSettingsUnlocked(false);
    };
  }, [activeSection]);

  const handleVerifySettingsPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsPasswordInput.trim()) {
      setSettingsAuthError('Please enter administrator password.');
      return;
    }
    setIsVerifyingSettingsAuth(true);
    setSettingsAuthError(null);

    try {
      const isValid = await dbService.verifyAdminPassword(settingsPasswordInput);
      if (isValid) {
        setIsSettingsUnlocked(true);
        setIsSettingsAuthModalOpen(false);
        setRatesForm(dbService.getPricingRates());
        setActiveSection('settings');
        const currentStaff = dbService.getCurrentStaff();
        dbService.logAuditEvent({
          action: 'SETTINGS_UNLOCKED',
          entity_type: 'SETTINGS',
          actor_name: currentStaff?.name || 'Administrator',
          actor_email: currentStaff?.email || 'admin@vedupvan.local',
          details_summary: 'Administrator verified password and unlocked Settings & Rates Editor',
        });
      } else {
        setSettingsAuthError('Incorrect Password! Only the Administrator password can unlock Settings.');
      }
    } catch {
      setSettingsAuthError('Verification error. Please try again.');
    } finally {
      setIsVerifyingSettingsAuth(false);
    }
  };

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setPricingSaveError(null);
    setPricingSaveSuccess(null);

    if (ratesForm.ticket_rate_inr <= 0) {
      setPricingSaveError('Ticket rate must be greater than ₹0.');
      return;
    }
    if (ratesForm.monthly_pass_1m_inr <= 0 || ratesForm.monthly_pass_2m_inr <= 0 || ratesForm.monthly_pass_3m_inr <= 0) {
      setPricingSaveError('Monthly pass rates must be greater than ₹0.');
      return;
    }
    if (ratesForm.yearly_pass_inr <= 0) {
      setPricingSaveError('Yearly pass rate must be greater than ₹0.');
      return;
    }

    const updated = dbService.savePricingRates(ratesForm);
    setRatesForm(updated);
    setPricingSaveSuccess('Pricing rates updated successfully! New rates are now active across Ticket POS & Passes.');
    setTimeout(() => setPricingSaveSuccess(null), 4000);
  };

  // Active report out of 8
  const [selectedReport, setSelectedReport] = useState<ReportType>('daily-sales');

  // Filter for Monthly Pass Duration: 'ALL' | '1_MONTH' | '2_MONTHS' | '3_MONTHS'
  const [monthlyDurationFilter, setMonthlyDurationFilter] = useState<MonthlyDurationCategory>('ALL');

  // Date Filters (Indian Standard Time)
  const todayYmd = getTodayIstYmd();
  const [startDate, setStartDate] = useState<string>(todayYmd);
  const [endDate, setEndDate] = useState<string>(todayYmd);
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all' | 'custom'>('today');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 8000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [reportingData, staffData, auditData] = await Promise.all([
        dbService.fetchReportingData().catch(() => ({
          tickets: dbService.getLocalTickets(),
          passes: dbService.getLocalPasses(),
          entryEvents: dbService.getLocalEntryEvents(),
        })),
        dbService.fetchStaffList().catch(() => []),
        dbService.fetchAuditLogs(100).catch(() => []),
      ]);
      setTickets(reportingData.tickets);
      setPasses(reportingData.passes);
      setEntryEvents(reportingData.entryEvents);
      setStaffList(staffData);
      setAuditLogs(auditData);
    } catch (e) {
      console.warn('Failed loading reporting data:', e);
      setTickets(dbService.getLocalTickets());
      setPasses(dbService.getLocalPasses());
      setEntryEvents(dbService.getLocalEntryEvents());
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddStaff = () => {
    setEditingStaffId(null);
    setStaffFormData({
      name: '',
      email: '',
      phone: '',
      role: 'COUNTER',
      password: '',
      counter_code: config.counter_code || 'CTR-01',
      gate_code: config.gate_code || 'GATE-01',
      system_name: 'Ticket Counter 1 PC',
      enabled: true,
    });
    setShowStaffModalPassword(true);
    setStaffFormFeedback(null);
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (stf: StaffUser) => {
    setEditingStaffId(stf.id);
    const existingPassword = dbService.getStaffPassword(stf.id, stf.email, stf.role);
    setStaffFormData({
      name: stf.name,
      email: stf.email,
      phone: stf.phone || '',
      role: stf.role,
      password: existingPassword,
      counter_code: stf.counter_code || 'CTR-01',
      gate_code: stf.gate_code || 'GATE-01',
      system_name: stf.system_name || (stf.role === 'SUPER_ADMIN' ? 'SHWETANK SYSTEM' : stf.role === 'GATE' ? 'Gate 1 Mobile Scanner' : 'Ticket Counter 1 PC'),
      enabled: stf.enabled,
    });
    setShowStaffModalPassword(true);
    setStaffFormFeedback(null);
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormData.name.trim() || !staffFormData.email.trim()) {
      setStaffFormFeedback('Name and Email are required.');
      return;
    }
    if (!editingStaffId && !staffFormData.password.trim()) {
      setStaffFormFeedback('Password is required for new user.');
      return;
    }

    setIsStaffSaving(true);
    try {
      const res = await dbService.upsertStaff({
        id: editingStaffId || undefined,
        name: staffFormData.name,
        email: staffFormData.email,
        phone: staffFormData.phone || undefined,
        role: staffFormData.role,
        password: staffFormData.password.trim() || undefined,
        counter_code: staffFormData.counter_code,
        gate_code: staffFormData.gate_code,
        system_name: staffFormData.system_name.trim() || undefined,
        enabled: staffFormData.enabled,
      });

      if (res.success) {
        setStaffFormFeedback('✅ Saved successfully!');
        await loadData();
        setTimeout(() => {
          setIsStaffModalOpen(false);
          setStaffFormFeedback(null);
        }, 600);
      } else {
        setStaffFormFeedback(`❌ ${res.message || 'Error saving user'}`);
      }
    } catch (err: unknown) {
      setStaffFormFeedback(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsStaffSaving(false);
    }
  };

  const handleToggleStaffEnabled = async (stf: StaffUser) => {
    if (stf.role === 'SUPER_ADMIN') {
      alert('Cannot disable Super Administrator.');
      return;
    }
    const newStatus = !stf.enabled;
    const confirmMsg = newStatus 
      ? `Activate access for ${stf.name}?` 
      : `Deactivate login access for ${stf.name}?`;
    if (!window.confirm(confirmMsg)) return;

    await dbService.upsertStaff({
      id: stf.id,
      name: stf.name,
      email: stf.email,
      phone: stf.phone,
      role: stf.role,
      counter_code: stf.counter_code,
      gate_code: stf.gate_code,
      system_name: stf.system_name,
      enabled: newStatus,
    });
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: newStatus ? 'STAFF_ENABLED' : 'STAFF_DISABLED',
      entity_type: 'STAFF',
      entity_id: stf.email,
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Staff account "${stf.name}" (${stf.email}) was ${newStatus ? 'enabled' : 'disabled'}`,
      after_json: { email: stf.email, role: stf.role, enabled: newStatus },
    });
    await loadData();
  };

  const handleDeleteStaff = async (stf: StaffUser) => {
    if (stf.role === 'SUPER_ADMIN') {
      alert('Super Administrator cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user "${stf.name}" (${stf.email})?\n\nThis user will be permanently removed from the system.`)) {
      return;
    }
    try {
      const res = await dbService.deleteStaff(stf.id);
      if (res.success) {
        setStaffList(prev => prev.filter(s => s.id !== stf.id));
        await loadData();
      } else {
        alert(res.message || 'Failed to delete user.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error deleting user.');
    }
  };

  const handleOpenChangePassword = (stf: StaffUser) => {
    setSelectedStaffForPassword(stf);
    const existingPassword = dbService.getStaffPassword(stf.id, stf.email, stf.role);
    setNewPassword(existingPassword);
    setShowChangePassword(true);
    setPasswordFeedback(null);
    setIsPasswordModalOpen(true);
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForPassword) return;
    if (!newPassword.trim() || newPassword.length < 4) {
      setPasswordFeedback('Password must be at least 4 characters long.');
      return;
    }

    setIsStaffSaving(true);
    try {
      const res = await dbService.upsertStaff({
        id: selectedStaffForPassword.id,
        name: selectedStaffForPassword.name,
        email: selectedStaffForPassword.email,
        phone: selectedStaffForPassword.phone,
        role: selectedStaffForPassword.role,
        password: newPassword.trim(),
        counter_code: selectedStaffForPassword.counter_code,
        gate_code: selectedStaffForPassword.gate_code,
        system_name: selectedStaffForPassword.system_name,
        enabled: selectedStaffForPassword.enabled,
      });

      if (res.success) {
        const currentStaff = dbService.getCurrentStaff();
        dbService.logAuditEvent({
          action: 'STAFF_PASSWORD_CHANGED',
          entity_type: 'STAFF',
          entity_id: selectedStaffForPassword.email,
          actor_name: currentStaff?.name || 'Administrator',
          actor_email: currentStaff?.email || 'admin@vedupvan.local',
          details_summary: `Password changed for staff user "${selectedStaffForPassword.name}" (${selectedStaffForPassword.email})`,
          after_json: { email: selectedStaffForPassword.email, role: selectedStaffForPassword.role },
        });
        setPasswordFeedback('✅ Password changed successfully!');
        await loadData();
        setTimeout(() => {
          setIsPasswordModalOpen(false);
          setPasswordFeedback(null);
          setNewPassword('');
        }, 800);
      } else {
        setPasswordFeedback(`❌ ${res.message || 'Error updating password'}`);
      }
    } catch (err: unknown) {
      setPasswordFeedback(err instanceof Error ? err.message : 'Error changing password');
    } finally {
      setIsStaffSaving(false);
    }
  };

  const handlePairBluetooth = async () => {
    setIsBluetoothConnecting(true);
    try {
      const deviceName = await printerService.connectBluetooth();
      setBtStatus(`Connected: ${deviceName}`);
      const currentStaff = dbService.getCurrentStaff();
      dbService.logAuditEvent({
        action: 'PRINTER_PAIRED',
        entity_type: 'HARDWARE',
        actor_name: currentStaff?.name || 'Administrator',
        actor_email: currentStaff?.email || 'admin@vedupvan.local',
        details_summary: `Bluetooth thermal printer paired: ${deviceName}`,
        after_json: { printerName: deviceName },
      });
      alert(`Bluetooth Thermal Printer Paired: ${deviceName}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Bluetooth pairing failed');
      setBtStatus('Connection Failed');
    } finally {
      setIsBluetoothConnecting(false);
    }
  };

  const handleDisconnectBluetooth = () => {
    printerService.disconnectBluetooth();
    setBtStatus('Disconnected');
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'PRINTER_DISCONNECTED',
      entity_type: 'HARDWARE',
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: 'Bluetooth thermal printer disconnected',
    });
  };

  const handleResetDatabase = async () => {
    if (!window.confirm('⚠️ ARE YOU SURE?\n\nThis will wipe all tickets, passes, and entry logs from both Cloud Database and Local Storage.\n\nTicket numbering will restart from #000001.')) {
      return;
    }
    try {
      const currentStaff = dbService.getCurrentStaff();
      dbService.logAuditEvent({
        action: 'DATABASE_RESET',
        entity_type: 'SYSTEM',
        actor_name: currentStaff?.name || 'Administrator',
        actor_email: currentStaff?.email || 'admin@vedupvan.local',
        details_summary: 'Database reset executed: all tickets, passes, gate scans wiped; serial restarted from #000001',
      });
      await dbService.resetAllDatabaseAndLocal();
      alert('✅ Database wiped successfully! Ticket numbering restarted.');
      window.location.reload();
    } catch {
      alert('Error wiping database');
    }
  };

  const handleReprintTicket = async (ticket: Ticket) => {
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'TICKET_REPRINTED',
      entity_type: 'TICKET',
      entity_id: ticket.ticket_number,
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Ticket #${ticket.ticket_number} reprinted (${ticket.persons_count || 1} Persons • ₹${((ticket.price_paise || (ticket.persons_count || 1) * 1000) / 100).toFixed(0)})`,
      after_json: {
        ticket_number: ticket.ticket_number,
        persons_count: ticket.persons_count,
        price_paise: ticket.price_paise,
      },
    });
    if (onTicketGenerated) {
      onTicketGenerated(ticket);
    }
    if (printerService.isConnected) {
      await printerService.printViaBluetooth(ticket, config);
    } else {
      setTimeout(() => {
        printerService.printViaBrowser();
      }, 100);
    }
  };

  const filteredStaffList = useMemo(() => {
    return staffList
      .filter(s => (s.role as string) !== 'MANAGER' && !s.name.toLowerCase().includes('manager') && !s.email.toLowerCase().includes('manager'))
      .filter(s => {
        const q = staffSearchQuery.toLowerCase().trim();
        const matchesSearch = !q || 
          s.name.toLowerCase().includes(q) || 
          s.email.toLowerCase().includes(q) || 
          (s.phone && s.phone.includes(q)) || 
          s.role.toLowerCase().includes(q);
        const matchesRole = staffRoleFilter === 'all' || s.role === staffRoleFilter;
        return matchesSearch && matchesRole;
      });
  }, [staffList, staffSearchQuery, staffRoleFilter]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter(l => {
      const q = auditSearchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        l.action.toLowerCase().includes(q) ||
        (l.entity_id && l.entity_id.toLowerCase().includes(q)) ||
        (l.actor_name && l.actor_name.toLowerCase().includes(q)) ||
        (l.actor_email && l.actor_email.toLowerCase().includes(q)) ||
        (l.device_name && l.device_name.toLowerCase().includes(q)) ||
        (l.details_summary && l.details_summary.toLowerCase().includes(q)) ||
        (l.after_json && JSON.stringify(l.after_json).toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (auditCategory === 'all') return true;
      if (auditCategory === 'auth') return l.action.includes('LOGIN') || l.action.includes('LOGOUT') || l.entity_type === 'AUTH';
      if (auditCategory === 'gate') return l.action.startsWith('GATE_');
      if (auditCategory === 'ticket') return l.action.includes('TICKET');
      if (auditCategory === 'pass') return l.action.includes('PASS');
      if (auditCategory === 'staff') return l.action.includes('STAFF');
      if (auditCategory === 'admin') return l.action.includes('STAFF') || l.action.includes('PRICING') || l.action.includes('RATES') || l.action.includes('SETTING') || l.action.includes('REPORT') || l.action.includes('DATABASE') || l.action.includes('LOGS') || l.action.includes('TERMINAL') || l.action.includes('PRINTER');
      if (auditCategory === 'security') return l.action.includes('DENIED') || l.action.includes('REJECTED') || l.action.includes('USED') || l.action.includes('INVALID');
      return true;
    });
  }, [auditLogs, auditSearchQuery, auditCategory]);

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to permanently clear all system audit and activity logs?\n\nThis will remove all activity history from the dashboard and database.')) {
      return;
    }
    try {
      const currentStaff = dbService.getCurrentStaff();
      const res = await dbService.clearAllAuditLogs();
      if (res.success) {
        dbService.logAuditEvent({
          action: 'LOGS_CLEARED',
          entity_type: 'AUDIT',
          actor_name: currentStaff?.name || 'Administrator',
          actor_email: currentStaff?.email || 'admin@vedupvan.local',
          details_summary: 'All system audit and activity logs were cleared by Administrator',
        });
        await loadData();
        alert('All system logs have been cleared successfully!');
      } else {
        alert(res.message || 'Failed to clear logs.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error clearing logs.');
    }
  };

  const exportAuditLogsCsv = () => {
    if (filteredAuditLogs.length === 0) {
      alert('No audit logs to export');
      return;
    }
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'REPORT_EXPORTED_CSV',
      entity_type: 'AUDIT',
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Audit activity logs exported (${filteredAuditLogs.length} events, filter: ${auditCategory})`,
    });
    const headers = ['Timestamp (IST)', 'Action', 'System / Device Name', 'Entity Type', 'Entity ID / Document', 'Actor Name', 'Actor Email', 'Details'];
    const rows = filteredAuditLogs.map(l => [
      new Date(l.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      l.action,
      l.device_name || 'System / Desktop',
      l.entity_type,
      l.entity_id || '',
      l.actor_name || '',
      l.actor_email || '',
      l.details_summary || (l.after_json ? JSON.stringify(l.after_json).replace(/"/g, '""') : ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ved-upvan-audit-logs-${todayYmd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderDeviceBadge = (deviceName?: string, deviceType?: string) => {
    const defaultDev = getSystemDeviceInfo();
    const finalDeviceName = (deviceName && deviceName.trim()) ? deviceName.trim() : defaultDev.deviceName;
    const finalDeviceType = deviceType || defaultDev.deviceType;
    const isMobile = finalDeviceType === 'MOBILE' || /mobile|phone|android|iphone/i.test(finalDeviceName);
    const isTablet = finalDeviceType === 'TABLET' || /tablet|ipad/i.test(finalDeviceName);

    if (isMobile) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-50 text-sky-900 border border-sky-200 text-xs font-bold tracking-tight shadow-xs whitespace-nowrap">
          <Smartphone className="w-3.5 h-3.5 text-sky-600 shrink-0" />
          <span>{finalDeviceName}</span>
        </span>
      );
    }
    if (isTablet) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 text-xs font-bold tracking-tight shadow-xs whitespace-nowrap">
          <Tablet className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <span>{finalDeviceName}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold tracking-tight shadow-xs whitespace-nowrap">
        <Monitor className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        <span>{finalDeviceName}</span>
      </span>
    );
  };

  const renderAuditActionBadge = (action: string) => {
    let bg = 'bg-slate-50 text-slate-800 border-slate-200';
    let label = action.replace(/_/g, ' ');
    let Icon = Activity;
    let iconColor = 'text-slate-600';

    if (action.includes('LOGIN')) {
      bg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      label = 'User Login';
      Icon = LogIn;
      iconColor = 'text-emerald-600';
    } else if (action.includes('LOGOUT')) {
      bg = 'bg-slate-100 text-slate-700 border-slate-200';
      label = 'User Logout';
      Icon = LogOut;
      iconColor = 'text-slate-500';
    } else if (action.includes('TICKET_REPRINT')) {
      bg = 'bg-amber-50 text-amber-800 border-amber-200';
      label = 'Ticket Re-Printed';
      Icon = RotateCcw;
      iconColor = 'text-amber-600';
    } else if (action.includes('TICKET_GEN') || action.includes('TICKET_ISSUED')) {
      bg = 'bg-teal-50 text-teal-800 border-teal-200';
      label = 'Ticket Generated';
      Icon = TicketIcon;
      iconColor = 'text-teal-600';
    } else if (action.includes('PASS_GEN')) {
      bg = 'bg-purple-50 text-purple-800 border-purple-200';
      label = 'Pass Generated';
      Icon = CreditCard;
      iconColor = 'text-purple-600';
    } else if (action.includes('ADMITTED') || action.includes('GRANTED')) {
      bg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      label = action.includes('PASS') ? 'Pass Entry Passed' : 'Ticket Scan Passed';
      Icon = Camera;
      iconColor = 'text-emerald-600';
    } else if (action.includes('DENIED') || action.includes('REJECTED') || action.includes('USED') || action.includes('EXPIRED') || action.includes('INVALID')) {
      bg = 'bg-rose-50 text-rose-800 border-rose-200';
      label = action.includes('USED') ? 'Denied: Already Used' : action.includes('EXPIRED') ? 'Denied: Expired' : action.includes('COOLDOWN') ? 'Denied: Cooldown' : 'Gate Scan Denied';
      Icon = AlertTriangle;
      iconColor = 'text-rose-600';
    } else if (action.includes('PASSWORD')) {
      bg = 'bg-amber-50 text-amber-800 border-amber-200';
      label = 'Password Changed';
      Icon = KeyRound;
      iconColor = 'text-amber-600';
    } else if (action.includes('STAFF_DELETE') || action.includes('DELETE_STAFF')) {
      bg = 'bg-rose-50 text-rose-800 border-rose-200';
      label = 'Staff Deleted';
      Icon = UserX;
      iconColor = 'text-rose-600';
    } else if (action.includes('STAFF_CREATE') || action.includes('CREATE_STAFF')) {
      bg = 'bg-indigo-50 text-indigo-800 border-indigo-200';
      label = 'Staff Added';
      Icon = UserPlus;
      iconColor = 'text-indigo-600';
    } else if (action.includes('STAFF_UPDATE') || action.includes('UPDATE_STAFF') || action.includes('STAFF_ENABLE') || action.includes('STAFF_DISABLE')) {
      bg = 'bg-blue-50 text-blue-800 border-blue-200';
      label = action.includes('ENABLE') ? 'Staff Enabled' : action.includes('DISABLE') ? 'Staff Disabled' : 'Staff Updated';
      Icon = UserCheck;
      iconColor = 'text-blue-600';
    } else if (action.includes('PRICING') || action.includes('RATES')) {
      bg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      label = 'Rates Updated';
      Icon = IndianRupee;
      iconColor = 'text-emerald-600';
    } else if (action.includes('SETTINGS_UNLOCKED') || action.includes('SETTING')) {
      bg = 'bg-amber-50 text-amber-800 border-amber-200';
      label = 'Settings Unlocked';
      Icon = Unlock;
      iconColor = 'text-amber-600';
    } else if (action.includes('TERMINAL') || action.includes('DEVICE')) {
      bg = 'bg-slate-100 text-slate-800 border-slate-300';
      label = 'Terminal Configured';
      Icon = Monitor;
      iconColor = 'text-slate-600';
    } else if (action.includes('PRINTER')) {
      bg = 'bg-blue-50 text-blue-800 border-blue-200';
      label = action.includes('DISCONNECT') ? 'Printer Disconnected' : 'Printer Paired';
      Icon = Bluetooth;
      iconColor = 'text-blue-600';
    } else if (action.includes('REPORT_PRINT')) {
      bg = 'bg-purple-50 text-purple-800 border-purple-200';
      label = 'Report Printed (A4)';
      Icon = Printer;
      iconColor = 'text-purple-600';
    } else if (action.includes('REPORT_EXPORT') || action.includes('CSV')) {
      bg = 'bg-emerald-50 text-emerald-800 border-emerald-200';
      label = 'Report Exported (CSV)';
      Icon = Download;
      iconColor = 'text-emerald-600';
    } else if (action.includes('REPORT')) {
      bg = 'bg-sky-50 text-sky-800 border-sky-200';
      label = 'Report Generated';
      Icon = FileText;
      iconColor = 'text-sky-600';
    } else if (action.includes('DATABASE_RESET') || action.includes('RESET')) {
      bg = 'bg-rose-50 text-rose-800 border-rose-200';
      label = 'Database Reset';
      Icon = Trash2;
      iconColor = 'text-rose-600';
    } else if (action.includes('LOGS_CLEARED') || action.includes('CLEAR')) {
      bg = 'bg-rose-50 text-rose-800 border-rose-200';
      label = 'Logs Cleared';
      Icon = Trash2;
      iconColor = 'text-rose-600';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap shadow-xs border select-none shrink-0 ${bg}`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
        <span>{label}</span>
      </span>
    );
  };

  // Date Preset Handler (Indian Standard Time)
  const handleDatePreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'all') => {
    setDatePreset(preset);
    const today = getTodayIstYmd();

    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const now = new Date();
      now.setDate(now.getDate() - 1);
      const yStr = getIstDateYmd(now);
      setStartDate(yStr);
      setEndDate(yStr);
    } else if (preset === 'week') {
      const now = new Date();
      now.setDate(now.getDate() - 7);
      setStartDate(getIstDateYmd(now));
      setEndDate(today);
    } else if (preset === 'month') {
      const [year, month] = today.split('-');
      setStartDate(`${year}-${month}-01`);
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Check if date falls in selected range (Indian Standard Time)
  const isDateInRange = (isoDateStr?: string) => {
    if (!isoDateStr) return false;
    const itemDate = getIstDateYmd(isoDateStr);
    if (startDate && itemDate < startDate) return false;
    if (endDate && itemDate > endDate) return false;
    return true;
  };

  // =========================================================================
  // REPORT 1: DAILY SALE REPORT
  // =========================================================================
  const dailySaleData = useMemo(() => {
    const map = new Map<string, {
      date: string;
      ticketsCount: number;
      passesCount: number;
      passes1mCount: number;
      passes2mCount: number;
      passes3mCount: number;
      passesYearlyCount: number;
      personsCount: number;
      cashPaise: number;
      upiPaise: number;
      totalPaise: number;
    }>();

    tickets.filter(t => isDateInRange(t.created_at)).forEach(t => {
      const d = getIstDateYmd(t.created_at);
      const entry = map.get(d) || {
        date: d,
        ticketsCount: 0,
        passesCount: 0,
        passes1mCount: 0,
        passes2mCount: 0,
        passes3mCount: 0,
        passesYearlyCount: 0,
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const amount = t.price_paise || (t.persons_count || 1) * 1000;
      entry.ticketsCount += 1;
      entry.personsCount += (t.persons_count || 1);
      if (t.payment_method === 'UPI') {
        entry.upiPaise += amount;
      } else {
        entry.cashPaise += amount;
      }
      entry.totalPaise += amount;
      map.set(d, entry);
    });

    passes.filter(p => isDateInRange(p.created_at)).forEach(p => {
      const d = getIstDateYmd(p.created_at);
      const entry = map.get(d) || {
        date: d,
        ticketsCount: 0,
        passesCount: 0,
        passes1mCount: 0,
        passes2mCount: 0,
        passes3mCount: 0,
        passesYearlyCount: 0,
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const dInfo = getPassDurationCategory(p);
      const amount = getPassEffectiveAmountPaise(p, ratesForm);
      entry.passesCount += 1;
      if (p.pass_type === 'YEARLY') {
        entry.passesYearlyCount += 1;
      } else if (dInfo.category === '3_MONTHS') {
        entry.passes3mCount += 1;
      } else if (dInfo.category === '2_MONTHS') {
        entry.passes2mCount += 1;
      } else {
        entry.passes1mCount += 1;
      }
      entry.personsCount += (p.people_allowed || 1);
      if (p.payment_method === 'UPI') {
        entry.upiPaise += amount;
      } else {
        entry.cashPaise += amount;
      }
      entry.totalPaise += amount;
      map.set(d, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [tickets, passes, startDate, endDate]);

  // =========================================================================
  // REPORT 2: MONTHLY SALE REPORT
  // =========================================================================
  const monthlySaleData = useMemo(() => {
    const map = new Map<string, {
      monthKey: string; // YYYY-MM
      monthName: string;
      ticketsCount: number;
      passesCount: number;
      passes1mCount: number;
      passes2mCount: number;
      passes3mCount: number;
      passesYearlyCount: number;
      personsCount: number;
      cashPaise: number;
      upiPaise: number;
      totalPaise: number;
    }>();

    const getMonthName = (ym: string) => {
      const [year, month] = ym.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    };

    tickets.filter(t => isDateInRange(t.created_at)).forEach(t => {
      const ym = getIstDateYmd(t.created_at).slice(0, 7);
      const entry = map.get(ym) || {
        monthKey: ym,
        monthName: getMonthName(ym),
        ticketsCount: 0,
        passesCount: 0,
        passes1mCount: 0,
        passes2mCount: 0,
        passes3mCount: 0,
        passesYearlyCount: 0,
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const amount = t.price_paise || (t.persons_count || 1) * 1000;
      entry.ticketsCount += 1;
      entry.personsCount += (t.persons_count || 1);
      if (t.payment_method === 'UPI') {
        entry.upiPaise += amount;
      } else {
        entry.cashPaise += amount;
      }
      entry.totalPaise += amount;
      map.set(ym, entry);
    });

    passes.filter(p => isDateInRange(p.created_at)).forEach(p => {
      const ym = getIstDateYmd(p.created_at).slice(0, 7);
      const entry = map.get(ym) || {
        monthKey: ym,
        monthName: getMonthName(ym),
        ticketsCount: 0,
        passesCount: 0,
        passes1mCount: 0,
        passes2mCount: 0,
        passes3mCount: 0,
        passesYearlyCount: 0,
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const dInfo = getPassDurationCategory(p);
      const amount = getPassEffectiveAmountPaise(p, ratesForm);
      entry.passesCount += 1;
      if (p.pass_type === 'YEARLY') {
        entry.passesYearlyCount += 1;
      } else if (dInfo.category === '3_MONTHS') {
        entry.passes3mCount += 1;
      } else if (dInfo.category === '2_MONTHS') {
        entry.passes2mCount += 1;
      } else {
        entry.passes1mCount += 1;
      }
      entry.personsCount += (p.people_allowed || 1);
      if (p.payment_method === 'UPI') {
        entry.upiPaise += amount;
      } else {
        entry.cashPaise += amount;
      }
      entry.totalPaise += amount;
      map.set(ym, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [tickets, passes, startDate, endDate]);

  // =========================================================================
  // REPORT 3: SCAN TICKET REPORT
  // =========================================================================
  const scanTicketData = useMemo(() => {
    return entryEvents
      .filter(e => e.document_type === 'TICKET' && isDateInRange(e.scanned_at))
      .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at));
  }, [entryEvents, startDate, endDate]);

  // =========================================================================
  // REPORT 4: GENERATE TICKET REPORT
  // =========================================================================
  const generateTicketData = useMemo(() => {
    return tickets
      .filter(t => isDateInRange(t.created_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [tickets, startDate, endDate]);

  // =========================================================================
  // REPORT 5: MONTHLY SUBSCRIPTION GENERATE PASS REPORT
  // =========================================================================
  const allMonthlyGeneratePassData = useMemo(() => {
    return passes
      .filter(p => p.pass_type === 'MONTHLY' && isDateInRange(p.created_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [passes, startDate, endDate]);

  // Comprehensive Breakdown of Monthly Passes by duration
  const monthlyPassBreakdown = useMemo(() => {
    let count1M = 0;
    let revPaise1M = 0;
    let count2M = 0;
    let revPaise2M = 0;
    let count3M = 0;
    let revPaise3M = 0;

    allMonthlyGeneratePassData.forEach(p => {
      const info = getPassDurationCategory(p);
      const amount = getPassEffectiveAmountPaise(p, ratesForm);
      if (info.category === '3_MONTHS') {
        count3M += 1;
        revPaise3M += amount;
      } else if (info.category === '2_MONTHS') {
        count2M += 1;
        revPaise2M += amount;
      } else {
        count1M += 1;
        revPaise1M += amount;
      }
    });

    const totalCount = allMonthlyGeneratePassData.length;
    const totalRevPaise = revPaise1M + revPaise2M + revPaise3M;

    return {
      totalCount,
      totalRevPaise,
      m1: { count: count1M, revPaise: revPaise1M },
      m2: { count: count2M, revPaise: revPaise2M },
      m3: { count: count3M, revPaise: revPaise3M },
    };
  }, [allMonthlyGeneratePassData, ratesForm]);

  // Filtered dataset for Table & Export based on monthlyDurationFilter
  const monthlyGeneratePassData = useMemo(() => {
    if (monthlyDurationFilter === 'ALL') return allMonthlyGeneratePassData;
    return allMonthlyGeneratePassData.filter(p => {
      const info = getPassDurationCategory(p);
      return info.category === monthlyDurationFilter;
    });
  }, [allMonthlyGeneratePassData, monthlyDurationFilter]);

  // =========================================================================
  // REPORT 6: YEARLY SUBSCRIPTION GENERATE PASS REPORT
  // =========================================================================
  const yearlyGeneratePassData = useMemo(() => {
    return passes
      .filter(p => p.pass_type === 'YEARLY' && isDateInRange(p.created_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [passes, startDate, endDate]);

  // =========================================================================
  // REPORT 7: MONTHLY SUBSCRIPTION PASS SCAN REPORT
  // =========================================================================
  const monthlyScanPassData = useMemo(() => {
    return entryEvents
      .filter(e => {
        if (e.document_type !== 'PASS' || !isDateInRange(e.scanned_at)) return false;
        if (e.pass_type === 'MONTHLY') return true;
        if (e.document_number && e.document_number.includes('-M-')) return true;
        return false;
      })
      .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at));
  }, [entryEvents, startDate, endDate]);

  // =========================================================================
  // REPORT 8: YEARLY SUBSCRIPTION PASS SCAN REPORT
  // =========================================================================
  const yearlyScanPassData = useMemo(() => {
    return entryEvents
      .filter(e => {
        if (e.document_type !== 'PASS' || !isDateInRange(e.scanned_at)) return false;
        if (e.pass_type === 'YEARLY') return true;
        if (e.document_number && e.document_number.includes('-Y-')) return true;
        return false;
      })
      .sort((a, b) => b.scanned_at.localeCompare(a.scanned_at));
  }, [entryEvents, startDate, endDate]);

  // =========================================================================
  // PRINT & EXPORT HELPERS
  // =========================================================================
  const handleSelectReport = (repId: ReportType, label: string) => {
    setSelectedReport(repId);
    if (repId === 'monthly-sales' && (datePreset === 'today' || datePreset === 'yesterday' || datePreset === 'week')) {
      handleDatePreset('all');
    }
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'REPORT_GENERATED',
      entity_type: 'REPORT',
      entity_id: repId,
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Report "${label}" generated for period ${startDate || 'All'} to ${endDate || 'All'}`,
      after_json: { report: repId, startDate, endDate },
    });
  };

  const printReport = () => {
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'REPORT_PRINTED',
      entity_type: 'REPORT',
      entity_id: selectedReport,
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `Official A4 PDF Print generated for "${reportTitles[selectedReport]?.title || selectedReport}" (${startDate || 'All'} to ${endDate || 'All'})`,
      after_json: { report: selectedReport, startDate, endDate },
    });
    document.body.classList.add('print-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-report');
    }, 1200);
  };

  const exportCsv = () => {
    const escapeCsv = (str: string | number | undefined | null) => {
      const s = String(str ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    let filename = `Ved_Upvan_${selectedReport}_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
    const currentStaff = dbService.getCurrentStaff();
    dbService.logAuditEvent({
      action: 'REPORT_EXPORTED_CSV',
      entity_type: 'REPORT',
      entity_id: selectedReport,
      actor_name: currentStaff?.name || 'Administrator',
      actor_email: currentStaff?.email || 'admin@vedupvan.local',
      details_summary: `CSV spreadsheet downloaded for "${reportTitles[selectedReport]?.title || selectedReport}" (${startDate || 'All'} to ${endDate || 'All'})`,
      after_json: { report: selectedReport, startDate, endDate, filename },
    });
    let headers: string[] = [];
    let rows: (string | number)[][] = [];

    if (selectedReport === 'daily-sales') {
      headers = ['Date', 'Tickets Sold', 'Passes Sold', 'Passes Breakdown', 'Total Persons', 'Cash Amount (INR)', 'UPI Amount (INR)', 'Total Amount (INR)'];
      rows = dailySaleData.map(r => [
        r.date,
        r.ticketsCount,
        r.passesCount,
        r.passesCount > 0 ? `1M: ${r.passes1mCount}, 2M: ${r.passes2mCount}, 3M: ${r.passes3mCount}${r.passesYearlyCount > 0 ? `, 1Y: ${r.passesYearlyCount}` : ''}` : 'None',
        r.personsCount,
        (r.cashPaise / 100).toFixed(2),
        (r.upiPaise / 100).toFixed(2),
        (r.totalPaise / 100).toFixed(2),
      ]);
    } else if (selectedReport === 'monthly-sales') {
      headers = ['Month', 'Tickets Sold', 'Passes Sold', 'Passes Breakdown', 'Total Persons', 'Cash Amount (INR)', 'UPI Amount (INR)', 'Total Revenue (INR)'];
      rows = monthlySaleData.map(r => [
        r.monthName,
        r.ticketsCount,
        r.passesCount,
        r.passesCount > 0 ? `1M: ${r.passes1mCount}, 2M: ${r.passes2mCount}, 3M: ${r.passes3mCount}${r.passesYearlyCount > 0 ? `, 1Y: ${r.passesYearlyCount}` : ''}` : 'None',
        r.personsCount,
        (r.cashPaise / 100).toFixed(2),
        (r.upiPaise / 100).toFixed(2),
        (r.totalPaise / 100).toFixed(2),
      ]);
    } else if (selectedReport === 'scan-tickets') {
      headers = ['Scan Timestamp (IST)', 'Ticket Number', 'Persons Admitted', 'Gate ID', 'Result', 'Reason / Note'];
      rows = scanTicketData.map(r => [
        new Date(r.scanned_at).toLocaleString('en-IN'),
        r.document_number || '—',
        r.persons_admitted,
        r.gate_id || 'GATE-01',
        r.result,
        r.reason || '—',
      ]);
    } else if (selectedReport === 'generate-tickets') {
      headers = ['Issue Timestamp (IST)', 'Ticket Number', 'Plan Name', 'Persons Count', 'Payment Mode', 'Amount (INR)', 'Status'];
      rows = generateTicketData.map(r => [
        new Date(r.created_at).toLocaleString('en-IN'),
        r.ticket_number,
        r.plan_name || 'Single Entry Ticket',
        r.persons_count,
        r.payment_method || 'CASH',
        ((r.price_paise || r.persons_count * 1000) / 100).toFixed(2),
        r.status,
      ]);
    } else if (selectedReport === 'monthly-generate-pass') {
      headers = ['Issue Timestamp (IST)', 'Pass Number', 'Plan Duration', 'Holder Name', 'Phone', 'Valid From', 'Valid Through', 'Payment Mode', 'Amount (INR)', 'Status'];
      rows = monthlyGeneratePassData.map(r => {
        const dInfo = getPassDurationCategory(r);
        return [
          new Date(r.created_at).toLocaleString('en-IN'),
          r.pass_number,
          dInfo.label,
          r.holder_name,
          r.holder_phone || '—',
          r.valid_from,
          r.valid_through,
          r.payment_method || 'CASH',
          (getPassEffectiveAmountPaise(r, ratesForm) / 100).toFixed(2),
          r.status,
        ];
      });
    } else if (selectedReport === 'yearly-generate-pass') {
      headers = ['Issue Timestamp (IST)', 'Pass Number', 'Plan Duration', 'Holder Name', 'Phone', 'Valid From', 'Valid Through', 'Payment Mode', 'Amount (INR)', 'Status'];
      rows = yearlyGeneratePassData.map(r => [
        new Date(r.created_at).toLocaleString('en-IN'),
        r.pass_number,
        '1 Year (365 Days)',
        r.holder_name,
        r.holder_phone || '—',
        r.valid_from,
        r.valid_through,
        r.payment_method || 'CASH',
        (getPassEffectiveAmountPaise(r, ratesForm) / 100).toFixed(2),
        r.status,
      ]);
    } else if (selectedReport === 'monthly-scan-pass') {
      headers = ['Scan Timestamp (IST)', 'Pass Number', 'Holder Name', 'Persons Admitted', 'Gate ID', 'Result', 'Reason / Note'];
      rows = monthlyScanPassData.map(r => [
        new Date(r.scanned_at).toLocaleString('en-IN'),
        r.document_number || '—',
        r.holder_name || '—',
        r.persons_admitted,
        r.gate_id || 'GATE-01',
        r.result,
        r.reason || '—',
      ]);
    } else if (selectedReport === 'yearly-scan-pass') {
      headers = ['Scan Timestamp (IST)', 'Pass Number', 'Holder Name', 'Persons Admitted', 'Gate ID', 'Result', 'Reason / Note'];
      rows = yearlyScanPassData.map(r => [
        new Date(r.scanned_at).toLocaleString('en-IN'),
        r.document_number || '—',
        r.holder_name || '—',
        r.persons_admitted,
        r.gate_id || 'GATE-01',
        r.result,
        r.reason || '—',
      ]);
    }

    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Report Display Metadata
  const reportTitles: Record<ReportType, { title: string; subtitle: string }> = {
    'daily-sales': {
      title: '1. Daily Sale Report',
      subtitle: 'Day-by-day breakdown of ticket & pass sales, visitors count, and cash vs UPI revenue',
    },
    'monthly-sales': {
      title: '2. Monthly Sale Report',
      subtitle: 'Monthly aggregated revenue, ticket volume, subscription pass count, and payment mode totals',
    },
    'scan-tickets': {
      title: '3. Scan Ticket Report',
      subtitle: 'Audit log of all single-entry ticket gate scans, admitted visitors count, and burn status',
    },
    'generate-tickets': {
      title: '4. Generate Ticket Report',
      subtitle: 'Detailed register of all tickets issued at POS counters with cash / UPI mode and amounts',
    },
    'monthly-generate-pass': {
      title: '5. Monthly Subscription Generate Pass Report',
      subtitle: 'All Monthly Walker / Individual subscription passes issued with validity dates and payment info',
    },
    'yearly-generate-pass': {
      title: '6. Yearly Subscription Generate Pass Report',
      subtitle: 'All Yearly Walker subscription passes issued with 365 days validity and collection details',
    },
    'monthly-scan-pass': {
      title: '7. Monthly Subscription Pass Scan Report',
      subtitle: 'Gate check-in events and admissions recorded for Monthly Subscription passes',
    },
    'yearly-scan-pass': {
      title: '8. Yearly Subscription Pass Scan Report',
      subtitle: 'Gate check-in events and admissions recorded for Yearly Subscription passes',
    },
  };

  // Top Global KPIs for today (Indian Standard Time)
  const todayTickets = tickets.filter(t => isSameIstDay(t.created_at, todayYmd));
  const todayPasses = passes.filter(p => isSameIstDay(p.created_at, todayYmd));

  const todayRevenuePaise = todayTickets.reduce((sum, t) => sum + (t.price_paise || (t.persons_count || 1) * 1000), 0) +
    todayPasses.reduce((sum, p) => sum + getPassEffectiveAmountPaise(p, ratesForm), 0);
  const todayRevenueInr = (todayRevenuePaise / 100).toFixed(2);

  const todayCashPaise = todayTickets.filter(t => (t.payment_method || 'CASH') === 'CASH').reduce((sum, t) => sum + (t.price_paise || (t.persons_count || 1) * 1000), 0) +
    todayPasses.filter(p => (p.payment_method || 'CASH') === 'CASH').reduce((sum, p) => sum + getPassEffectiveAmountPaise(p, ratesForm), 0);
  const todayUpiPaise = todayTickets.filter(t => t.payment_method === 'UPI').reduce((sum, t) => sum + (t.price_paise || (t.persons_count || 1) * 1000), 0) +
    todayPasses.filter(p => p.payment_method === 'UPI').reduce((sum, p) => sum + getPassEffectiveAmountPaise(p, ratesForm), 0);

  const todaySuccessEvents = entryEvents.filter(e => e.result === 'SUCCESS' && isSameIstDay(e.scanned_at, todayYmd));
  const totalVisitorsAdmitted = todaySuccessEvents.reduce((sum, e) => sum + (e.persons_admitted || 1), 0);

  const activeTicketsCount = todayTickets.filter(t => t.status === 'ACTIVE').length;
  const usedTicketsCount = todayTickets.filter(t => t.status === 'USED').length;

  return (
    <div className="max-w-7xl mx-auto p-2.5 sm:p-4 space-y-4 sm:space-y-6">
      {/* 4 Big Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {/* Visitors */}
        <div className="bg-gradient-to-br from-white to-emerald-50/50 border border-emerald-100/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs hover:shadow-md transition-all flex items-center gap-3 sm:gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-emerald-500/10 transition-all pointer-events-none" />
          <div className="p-3 sm:p-3.5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-sm shadow-emerald-500/20 shrink-0">
            <Users className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Visitors Admitted Today</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight">{totalVisitorsAdmitted}</div>
            <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Gate entries verified</span>
            </div>
          </div>
        </div>

        {/* Collection */}
        <div className="bg-gradient-to-br from-white to-blue-50/50 border border-blue-100/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs hover:shadow-md transition-all flex items-center gap-3 sm:gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-blue-500/10 transition-all pointer-events-none" />
          <div className="p-3 sm:p-3.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-sm shadow-blue-500/20 shrink-0">
            <IndianRupee className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Total Collection Today</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight">
              <span className="text-emerald-700">₹{todayRevenueInr}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] sm:text-[11px] font-bold">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-200/60">
                Cash: ₹{(todayCashPaise / 100).toFixed(0)}
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md border border-blue-200/60">
                UPI: ₹{(todayUpiPaise / 100).toFixed(0)}
              </span>
            </div>
            {todayPasses.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-1.5 text-[10px] font-bold text-slate-600">
                <span>Passes:</span>
                <span className="text-slate-900 font-black">{todayPasses.length}</span>
                <span className="text-slate-400">•</span>
                <span className="text-emerald-700">1M: {todayPasses.filter(p => getPassDurationCategory(p).category === '1_MONTH').length}</span>
                <span className="text-slate-400">•</span>
                <span className="text-blue-700">2M: {todayPasses.filter(p => getPassDurationCategory(p).category === '2_MONTHS').length}</span>
                <span className="text-slate-400">•</span>
                <span className="text-indigo-700">3M: {todayPasses.filter(p => getPassDurationCategory(p).category === '3_MONTHS').length}</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Tickets */}
        <div className="bg-gradient-to-br from-white to-amber-50/50 border border-amber-100/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs hover:shadow-md transition-all flex items-center gap-3 sm:gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-amber-500/10 transition-all pointer-events-none" />
          <div className="p-3 sm:p-3.5 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl shadow-sm shadow-amber-500/20 shrink-0">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Active Valid Tickets</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-0.5 tracking-tight">{activeTicketsCount}</div>
            <div className="text-[11px] text-amber-700/90 font-medium mt-0.5">
              Ready for entry scan
            </div>
          </div>
        </div>

        {/* Expired / Used */}
        <div className="bg-gradient-to-br from-white to-purple-50/50 border border-purple-100/90 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs hover:shadow-md transition-all flex items-center gap-3 sm:gap-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-purple-500/10 transition-all pointer-events-none" />
          <div className="p-3 sm:p-3.5 bg-gradient-to-br from-purple-600 to-violet-600 text-white rounded-2xl shadow-sm shadow-purple-500/20 shrink-0">
            <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Scanned & Expired Today</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-700 mt-0.5 tracking-tight">{usedTicketsCount}</div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
              Single-use tokens burned
            </div>
          </div>
        </div>
      </div>

      {/* 4-Section Admin Dashboard Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-white/90 backdrop-blur-md p-2 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs no-print gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 flex-1">
          {/* 1. Reports */}
          <button
            type="button"
            onClick={() => handleSwitchSection('reports')}
            className={`px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
              activeSection === 'reports'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">1. Reports</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSection === 'reports' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              8
            </span>
          </button>

          {/* 2. User Master */}
          <button
            type="button"
            onClick={() => handleSwitchSection('users')}
            className={`px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
              activeSection === 'users'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">2. User Master</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeSection === 'users' ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {staffList.length}
            </span>
          </button>

          {/* 3. Audit Logs */}
          <button
            type="button"
            onClick={() => handleSwitchSection('audit')}
            className={`px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
              activeSection === 'audit'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="truncate">3. Audit Logs</span>
          </button>

          {/* 4. System Settings (Password Protected) */}
          <button
            type="button"
            onClick={handleSettingsTabClick}
            className={`px-3.5 py-2.5 rounded-xl sm:rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
              activeSection === 'settings' && isSettingsUnlocked
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/25'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="truncate">4. Settings</span>
            {(!isSettingsUnlocked || activeSection !== 'settings') ? (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                <Lock className="w-2.5 h-2.5 mr-0.5" />
                PIN
              </span>
            ) : (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                <Unlock className="w-2.5 h-2.5 mr-0.5" />
                Open
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="px-4 py-2.5 bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 rounded-xl sm:rounded-2xl text-xs font-black transition flex items-center justify-center gap-2 cursor-pointer shrink-0 border border-slate-200/60 active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : 'text-slate-500'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* =========================================================================
         SECTION A: 8 OFFICIAL REPORTS WITH DATE FILTER & PDF EXPORT
         ========================================================================= */}
      {activeSection === 'reports' && (
        <div className="space-y-5 no-print">
          {/* 8 Report Selector Pill Tabs */}
          <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Select Official Report:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  { id: 'daily-sales', label: '1. Daily Sale Report' },
                  { id: 'monthly-sales', label: '2. Monthly Sale Report' },
                  { id: 'scan-tickets', label: '3. Scan Ticket Report' },
                  { id: 'generate-tickets', label: '4. Generate Ticket Report' },
                  { id: 'monthly-generate-pass', label: '5. Monthly Pass Gen Report' },
                  { id: 'yearly-generate-pass', label: '6. Yearly Pass Gen Report' },
                  { id: 'monthly-scan-pass', label: '7. Monthly Pass Scan Report' },
                  { id: 'yearly-scan-pass', label: '8. Yearly Pass Scan Report' },
                ] as { id: ReportType; label: string }[]
              ).map(rep => (
                <button
                  key={rep.id}
                  type="button"
                  onClick={() => handleSelectReport(rep.id, rep.label)}
                  className={`p-3 rounded-2xl text-left text-xs font-bold transition border cursor-pointer flex items-center justify-between ${
                    selectedReport === rep.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="truncate">{rep.label}</span>
                  <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${selectedReport === rep.id ? 'text-white' : 'text-slate-400'}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Unified Date Filter & Action Bar */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">{reportTitles[selectedReport].title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{reportTitles[selectedReport].subtitle}</p>
              </div>

              {/* Action Buttons: Print PDF & Export CSV */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={printReport}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print / Export PDF</span>
                </button>

                <button
                  type="button"
                  onClick={exportCsv}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export to Excel (CSV)</span>
                </button>
              </div>
            </div>

            {/* Date Filters Control */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Date Filter:</span>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  selectedReport === 'monthly-sales'
                    ? ([
                        { id: 'month', label: 'This Month' },
                        { id: 'all', label: 'All Records' },
                      ] as const)
                    : ([
                        { id: 'today', label: 'Today' },
                        { id: 'yesterday', label: 'Yesterday' },
                        { id: 'week', label: 'Last 7 Days' },
                        { id: 'month', label: 'This Month' },
                        { id: 'all', label: 'All Records' },
                      ] as const)
                ).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleDatePreset(p.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      datePreset === p.id
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers */}
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs flex-1 sm:flex-initial">
                  <span className="text-slate-400 font-bold">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => {
                      setStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer w-full"
                  />
                </div>

                <div className="flex items-center gap-1 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200 text-xs flex-1 sm:flex-initial">
                  <span className="text-slate-400 font-bold">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => {
                      setEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Report Data Display Container */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden">
            {/* 1. DAILY SALE REPORT TABLE */}
            {selectedReport === 'daily-sales' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Single Tickets</th>
                      <th className="py-3 px-3">Passes Sold</th>
                      <th className="py-3 px-3">Total Persons</th>
                      <th className="py-3 px-3">1. Cash (₹)</th>
                      <th className="py-3 px-3">2. UPI (₹)</th>
                      <th className="py-3 px-3 text-right">Total Revenue (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailySaleData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          No sales recorded in the selected date period.
                        </td>
                      </tr>
                    ) : (
                      dailySaleData.map(r => (
                        <tr key={r.date} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{r.date}</td>
                          <td className="py-3 px-3 text-slate-700">{r.ticketsCount}</td>
                          <td className="py-3 px-3 text-slate-700">
                            <div className="font-bold text-slate-900">{r.passesCount}</div>
                            {r.passesCount > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[9px] font-bold">
                                {r.passes1mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200" title="1 Month Passes">
                                    1M:{r.passes1mCount}
                                  </span>
                                )}
                                {r.passes2mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200" title="2 Months Passes">
                                    2M:{r.passes2mCount}
                                  </span>
                                )}
                                {r.passes3mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200" title="3 Months Passes">
                                    3M:{r.passes3mCount}
                                  </span>
                                )}
                                {r.passesYearlyCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-800 border border-purple-200" title="Yearly Passes">
                                    1Y:{r.passesYearlyCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-emerald-800">{r.personsCount} Persons</td>
                          <td className="py-3 px-3 font-semibold text-slate-800">₹{(r.cashPaise / 100).toFixed(2)}</td>
                          <td className="py-3 px-3 font-semibold text-blue-700">₹{(r.upiPaise / 100).toFixed(2)}</td>
                          <td className="py-3 px-3 font-black text-right text-emerald-700">₹{(r.totalPaise / 100).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dailySaleData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-emerald-50/60 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Grand Total</td>
                        <td className="py-3 px-3">{dailySaleData.reduce((s, r) => s + r.ticketsCount, 0)}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold">{dailySaleData.reduce((s, r) => s + r.passesCount, 0)}</div>
                          {dailySaleData.reduce((s, r) => s + r.passesCount, 0) > 0 && (
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                              (1M: {dailySaleData.reduce((s, r) => s + r.passes1mCount, 0)}, 2M: {dailySaleData.reduce((s, r) => s + r.passes2mCount, 0)}, 3M: {dailySaleData.reduce((s, r) => s + r.passes3mCount, 0)})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-emerald-800">{dailySaleData.reduce((s, r) => s + r.personsCount, 0)} Persons</td>
                        <td className="py-3 px-3">₹{(dailySaleData.reduce((s, r) => s + r.cashPaise, 0) / 100).toFixed(2)}</td>
                        <td className="py-3 px-3 text-blue-700">₹{(dailySaleData.reduce((s, r) => s + r.upiPaise, 0) / 100).toFixed(2)}</td>
                        <td className="py-3 px-3 text-right text-emerald-800 text-sm">
                          ₹{(dailySaleData.reduce((s, r) => s + r.totalPaise, 0) / 100).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 2. MONTHLY SALE REPORT TABLE */}
            {selectedReport === 'monthly-sales' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Month</th>
                      <th className="py-3 px-3">Tickets Sold</th>
                      <th className="py-3 px-3">Passes Sold</th>
                      <th className="py-3 px-3">Total Persons</th>
                      <th className="py-3 px-3">1. Cash (₹)</th>
                      <th className="py-3 px-3">2. UPI (₹)</th>
                      <th className="py-3 px-3 text-right">Total Revenue (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlySaleData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          No sales recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      monthlySaleData.map(r => (
                        <tr key={r.monthKey} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-bold text-slate-900">{r.monthName}</td>
                          <td className="py-3 px-3 text-slate-700">{r.ticketsCount}</td>
                          <td className="py-3 px-3 text-slate-700">
                            <div className="font-bold text-slate-900">{r.passesCount}</div>
                            {r.passesCount > 0 && (
                              <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[9px] font-bold">
                                {r.passes1mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200" title="1 Month Passes">
                                    1M:{r.passes1mCount}
                                  </span>
                                )}
                                {r.passes2mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-800 border border-blue-200" title="2 Months Passes">
                                    2M:{r.passes2mCount}
                                  </span>
                                )}
                                {r.passes3mCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200" title="3 Months Passes">
                                    3M:{r.passes3mCount}
                                  </span>
                                )}
                                {r.passesYearlyCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-800 border border-purple-200" title="Yearly Passes">
                                    1Y:{r.passesYearlyCount}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold text-emerald-800">{r.personsCount} Persons</td>
                          <td className="py-3 px-3 font-semibold text-slate-800">₹{(r.cashPaise / 100).toFixed(2)}</td>
                          <td className="py-3 px-3 font-semibold text-blue-700">₹{(r.upiPaise / 100).toFixed(2)}</td>
                          <td className="py-3 px-3 font-black text-right text-emerald-700">₹{(r.totalPaise / 100).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {monthlySaleData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-emerald-50/60 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Grand Total</td>
                        <td className="py-3 px-3">{monthlySaleData.reduce((s, r) => s + r.ticketsCount, 0)}</td>
                        <td className="py-3 px-3">
                          <div className="font-bold">{monthlySaleData.reduce((s, r) => s + r.passesCount, 0)}</div>
                          {monthlySaleData.reduce((s, r) => s + r.passesCount, 0) > 0 && (
                            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                              (1M: {monthlySaleData.reduce((s, r) => s + r.passes1mCount, 0)}, 2M: {monthlySaleData.reduce((s, r) => s + r.passes2mCount, 0)}, 3M: {monthlySaleData.reduce((s, r) => s + r.passes3mCount, 0)})
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-emerald-800">{monthlySaleData.reduce((s, r) => s + r.personsCount, 0)} Persons</td>
                        <td className="py-3 px-3">₹{(monthlySaleData.reduce((s, r) => s + r.cashPaise, 0) / 100).toFixed(2)}</td>
                        <td className="py-3 px-3 text-blue-700">₹{(monthlySaleData.reduce((s, r) => s + r.upiPaise, 0) / 100).toFixed(2)}</td>
                        <td className="py-3 px-3 text-right text-emerald-800 text-sm">
                          ₹{(monthlySaleData.reduce((s, r) => s + r.totalPaise, 0) / 100).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 3. SCAN TICKET REPORT TABLE */}
            {selectedReport === 'scan-tickets' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Scan Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Ticket Number</th>
                      <th className="py-3 px-3">Admitted</th>
                      <th className="py-3 px-3">Gate Code</th>
                      <th className="py-3 px-3">Result</th>
                      <th className="py-3 px-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scanTicketData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          No ticket scan events recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      scanTicketData.map(ev => (
                        <tr key={ev.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(ev.scanned_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(ev.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{ev.document_number || '—'}</td>
                          <td className="py-3 px-3 font-black text-emerald-700">{ev.persons_admitted} Persons</td>
                          <td className="py-3 px-3 text-slate-600">{ev.gate_id || 'GATE-01'}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              ev.result === 'SUCCESS'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ev.result === 'USED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {ev.result}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 truncate max-w-xs">{ev.reason || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {scanTicketData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Total Scans: {scanTicketData.length}</td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-3 text-emerald-800">
                          {scanTicketData.reduce((s, e) => s + (e.persons_admitted || 0), 0)} Total Persons
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 4. GENERATE TICKET REPORT TABLE */}
            {selectedReport === 'generate-tickets' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Issue Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Ticket Number</th>
                      <th className="py-3 px-3">Plan</th>
                      <th className="py-3 px-3">Persons</th>
                      <th className="py-3 px-3">Payment Mode</th>
                      <th className="py-3 px-3">Amount (₹)</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Re-Print</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {generateTicketData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-400">
                          No tickets generated in the selected period.
                        </td>
                      </tr>
                    ) : (
                      generateTicketData.map(tk => (
                        <tr key={tk.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(tk.created_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(tk.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">{tk.ticket_number}</td>
                          <td className="py-3 px-3 text-slate-700">{tk.plan_name || 'Single Entry Ticket'}</td>
                          <td className="py-3 px-3 font-bold text-emerald-800">{tk.persons_count} Person(s)</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tk.payment_method === 'UPI'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {tk.payment_method || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ₹{((tk.price_paise || tk.persons_count * 1000) / 100).toFixed(2)}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              tk.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : tk.status === 'USED'
                                ? 'bg-slate-200 text-slate-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {tk.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleReprintTicket(tk)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-bold text-xs border border-emerald-200 shadow-sm transition flex items-center gap-1.5 ml-auto cursor-pointer"
                              title="Re-Print Ticket"
                            >
                              <Printer className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Re-Print</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {generateTicketData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-emerald-50/60 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Total Tickets: {generateTicketData.length}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td className="py-3 px-3 text-emerald-800">
                          {generateTicketData.reduce((s, t) => s + (t.persons_count || 1), 0)} Persons
                        </td>
                        <td></td>
                        <td className="py-3 px-3 text-emerald-800 text-sm">
                          ₹{(generateTicketData.reduce((s, t) => s + (t.price_paise || (t.persons_count || 1) * 1000), 0) / 100).toFixed(2)}
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 5. MONTHLY SUBSCRIPTION GENERATE PASS REPORT TABLE */}
            {selectedReport === 'monthly-generate-pass' && (
              <div className="space-y-4">
                {/* Executive Breakdown KPI Cards for Monthly Passes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Card 1: Total Monthly */}
                  <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 p-3.5 rounded-2xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">All Monthly Passes</span>
                      <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                        <CreditCard className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-black text-slate-900">
                        {monthlyPassBreakdown.totalCount} <span className="text-xs font-bold text-slate-500">Passes</span>
                      </span>
                      <span className="text-sm font-black text-slate-800">
                        ₹{(monthlyPassBreakdown.totalRevPaise / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">Total monthly subscription volume</div>
                  </div>

                  {/* Card 2: 1 Month Pass */}
                  <div 
                    onClick={() => setMonthlyDurationFilter(monthlyDurationFilter === '1_MONTH' ? 'ALL' : '1_MONTH')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      monthlyDurationFilter === '1_MONTH'
                        ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/30 shadow-sm'
                        : 'bg-gradient-to-br from-emerald-50/40 to-white border-emerald-200 hover:border-emerald-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                        1 Month Pass (₹{ratesForm.monthly_pass_1m_inr || 300})
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                        30 DAYS
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-black text-emerald-950">
                        {monthlyPassBreakdown.m1.count} <span className="text-xs font-bold text-emerald-700">Passes</span>
                      </span>
                      <span className="text-sm font-black text-emerald-800">
                        ₹{(monthlyPassBreakdown.m1.revPaise / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-emerald-700/80 font-bold mt-0.5">
                      {monthlyPassBreakdown.totalCount > 0 ? Math.round((monthlyPassBreakdown.m1.count / monthlyPassBreakdown.totalCount) * 100) : 0}% of monthly sales
                    </div>
                  </div>

                  {/* Card 3: 2 Months Pass */}
                  <div 
                    onClick={() => setMonthlyDurationFilter(monthlyDurationFilter === '2_MONTHS' ? 'ALL' : '2_MONTHS')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      monthlyDurationFilter === '2_MONTHS'
                        ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/30 shadow-sm'
                        : 'bg-gradient-to-br from-blue-50/40 to-white border-blue-200 hover:border-blue-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">
                        2 Months Pass (₹{ratesForm.monthly_pass_2m_inr || 600})
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                        60 DAYS
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-black text-blue-950">
                        {monthlyPassBreakdown.m2.count} <span className="text-xs font-bold text-blue-700">Passes</span>
                      </span>
                      <span className="text-sm font-black text-blue-800">
                        ₹{(monthlyPassBreakdown.m2.revPaise / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-blue-700/80 font-bold mt-0.5">
                      {monthlyPassBreakdown.totalCount > 0 ? Math.round((monthlyPassBreakdown.m2.count / monthlyPassBreakdown.totalCount) * 100) : 0}% of monthly sales
                    </div>
                  </div>

                  {/* Card 4: 3 Months Pass */}
                  <div 
                    onClick={() => setMonthlyDurationFilter(monthlyDurationFilter === '3_MONTHS' ? 'ALL' : '3_MONTHS')}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      monthlyDurationFilter === '3_MONTHS'
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-500/30 shadow-sm'
                        : 'bg-gradient-to-br from-indigo-50/40 to-white border-indigo-200 hover:border-indigo-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
                        3 Months Pass (₹{ratesForm.monthly_pass_3m_inr || 900})
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-300">
                        90 DAYS
                      </span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-black text-indigo-950">
                        {monthlyPassBreakdown.m3.count} <span className="text-xs font-bold text-indigo-700">Passes</span>
                      </span>
                      <span className="text-sm font-black text-indigo-800">
                        ₹{(monthlyPassBreakdown.m3.revPaise / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[10px] text-indigo-700/80 font-bold mt-0.5">
                      {monthlyPassBreakdown.totalCount > 0 ? Math.round((monthlyPassBreakdown.m3.count / monthlyPassBreakdown.totalCount) * 100) : 0}% of monthly sales
                    </div>
                  </div>
                </div>

                {/* Sub-Filter Controls for Pass Duration */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/80 p-3 rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                      <span>Filter Duration:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMonthlyDurationFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        monthlyDurationFilter === 'ALL'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      All Durations ({monthlyPassBreakdown.totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyDurationFilter('1_MONTH')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        monthlyDurationFilter === '1_MONTH'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      1 Month - 30 Days ({monthlyPassBreakdown.m1.count})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyDurationFilter('2_MONTHS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        monthlyDurationFilter === '2_MONTHS'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50'
                      }`}
                    >
                      2 Months - 60 Days ({monthlyPassBreakdown.m2.count})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonthlyDurationFilter('3_MONTHS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        monthlyDurationFilter === '3_MONTHS'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-indigo-800 border-indigo-200 hover:bg-indigo-50'
                      }`}
                    >
                      3 Months - 90 Days ({monthlyPassBreakdown.m3.count})
                    </button>
                  </div>

                  {monthlyDurationFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setMonthlyDurationFilter('ALL')}
                      className="text-xs text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer"
                    >
                      Show All Durations
                    </button>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                        <th className="py-3 px-3">Issue Time (IST)</th>
                        <th className="py-3 px-3">System / Device</th>
                        <th className="py-3 px-3">Pass Number</th>
                        <th className="py-3 px-3">Plan Duration</th>
                        <th className="py-3 px-3">Holder Name</th>
                        <th className="py-3 px-3">Phone</th>
                        <th className="py-3 px-3">Valid Period</th>
                        <th className="py-3 px-3">Pay Mode</th>
                        <th className="py-3 px-3">Amount (₹)</th>
                        <th className="py-3 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyGeneratePassData.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-slate-400">
                            No monthly subscription passes found matching the current filter.
                          </td>
                        </tr>
                      ) : (
                        monthlyGeneratePassData.map(ps => {
                          const dInfo = getPassDurationCategory(ps);
                          return (
                            <tr key={ps.id} className="hover:bg-slate-50 transition">
                              <td className="py-3 px-3 font-mono text-slate-600">
                                {new Date(ps.created_at).toLocaleString('en-IN')}
                              </td>
                              <td className="py-3 px-3">
                                {renderDeviceBadge(ps.device_name)}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-purple-900">{ps.pass_number}</td>
                              <td className="py-3 px-3">
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wide border inline-flex items-center gap-1 ${
                                  dInfo.category === '3_MONTHS'
                                    ? 'bg-indigo-100/90 text-indigo-900 border-indigo-300'
                                    : dInfo.category === '2_MONTHS'
                                    ? 'bg-blue-100/90 text-blue-900 border-blue-300'
                                    : 'bg-emerald-100/90 text-emerald-900 border-emerald-300'
                                }`}>
                                  <Calendar className="w-3 h-3 opacity-70" />
                                  <span>{dInfo.label}</span>
                                </span>
                              </td>
                              <td className="py-3 px-3 font-bold text-slate-900">{ps.holder_name}</td>
                              <td className="py-3 px-3 text-slate-600">{ps.holder_phone || '—'}</td>
                              <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                                {ps.valid_from} → {ps.valid_through}
                              </td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                                  {ps.payment_method || 'CASH'}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-black text-slate-900">
                                ₹{(getPassEffectiveAmountPaise(ps, ratesForm) / 100).toFixed(2)}
                              </td>
                              <td className="py-3 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  {ps.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {monthlyGeneratePassData.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-purple-50/60 font-black text-slate-900">
                          <td className="py-3 px-3 uppercase" colSpan={4}>
                            Total Passes: {monthlyGeneratePassData.length}
                            {monthlyDurationFilter === 'ALL' && (
                              <span className="ml-2 font-normal text-slate-600 text-[11px]">
                                (1-Mo: {monthlyPassBreakdown.m1.count} | 2-Mo: {monthlyPassBreakdown.m2.count} | 3-Mo: {monthlyPassBreakdown.m3.count})
                              </span>
                            )}
                          </td>
                          <td colSpan={4}></td>
                          <td className="py-3 px-3 text-purple-900 text-sm">
                            ₹{(monthlyGeneratePassData.reduce((s, p) => s + getPassEffectiveAmountPaise(p, ratesForm), 0) / 100).toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* 6. YEARLY SUBSCRIPTION GENERATE PASS REPORT TABLE */}
            {selectedReport === 'yearly-generate-pass' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Issue Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Pass Number</th>
                      <th className="py-3 px-3">Plan Duration</th>
                      <th className="py-3 px-3">Holder Name</th>
                      <th className="py-3 px-3">Phone</th>
                      <th className="py-3 px-3">Valid Period</th>
                      <th className="py-3 px-3">Pay Mode</th>
                      <th className="py-3 px-3">Amount (₹)</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearlyGeneratePassData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          No yearly subscription passes generated in the selected period.
                        </td>
                      </tr>
                    ) : (
                      yearlyGeneratePassData.map(ps => (
                        <tr key={ps.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(ps.created_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(ps.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-900">{ps.pass_number}</td>
                          <td className="py-3 px-3">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wide border inline-flex items-center gap-1 bg-purple-100/90 text-purple-900 border-purple-300">
                              <Calendar className="w-3 h-3 opacity-70" />
                              <span>1 Year (365 Days)</span>
                            </span>
                          </td>
                          <td className="py-3 px-3 font-bold text-slate-900">{ps.holder_name}</td>
                          <td className="py-3 px-3 text-slate-600">{ps.holder_phone || '—'}</td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                            {ps.valid_from} → {ps.valid_through}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {ps.payment_method || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ₹{(getPassEffectiveAmountPaise(ps, ratesForm) / 100).toFixed(2)}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {ps.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {yearlyGeneratePassData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-purple-50/60 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase" colSpan={4}>Total Passes: {yearlyGeneratePassData.length}</td>
                        <td colSpan={4}></td>
                        <td className="py-3 px-3 text-purple-900 text-sm">
                          ₹{(yearlyGeneratePassData.reduce((s, p) => s + getPassEffectiveAmountPaise(p, ratesForm), 0) / 100).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 7. MONTHLY SUBSCRIPTION PASS SCAN REPORT TABLE */}
            {selectedReport === 'monthly-scan-pass' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Scan Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Pass Number</th>
                      <th className="py-3 px-3">Holder Name</th>
                      <th className="py-3 px-3">Admitted</th>
                      <th className="py-3 px-3">Gate</th>
                      <th className="py-3 px-3">Result</th>
                      <th className="py-3 px-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthlyScanPassData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          No monthly pass scan events recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      monthlyScanPassData.map(ev => (
                        <tr key={ev.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(ev.scanned_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(ev.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-900">{ev.document_number || '—'}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">{ev.holder_name || '—'}</td>
                          <td className="py-3 px-3 font-bold text-emerald-800">{ev.persons_admitted} Person</td>
                          <td className="py-3 px-3 text-slate-600">{ev.gate_id || 'GATE-01'}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              {ev.result}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 truncate max-w-xs">{ev.reason || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {monthlyScanPassData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Total Entries: {monthlyScanPassData.length}</td>
                        <td colSpan={3}></td>
                        <td className="py-3 px-3 text-emerald-800">
                          {monthlyScanPassData.reduce((s, e) => s + (e.persons_admitted || 0), 0)} Total Persons
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* 8. YEARLY SUBSCRIPTION PASS SCAN REPORT TABLE */}
            {selectedReport === 'yearly-scan-pass' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Scan Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Pass Number</th>
                      <th className="py-3 px-3">Holder Name</th>
                      <th className="py-3 px-3">Admitted</th>
                      <th className="py-3 px-3">Gate</th>
                      <th className="py-3 px-3">Result</th>
                      <th className="py-3 px-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {yearlyScanPassData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          No yearly pass scan events recorded in the selected period.
                        </td>
                      </tr>
                    ) : (
                      yearlyScanPassData.map(ev => (
                        <tr key={ev.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(ev.scanned_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(ev.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-900">{ev.document_number || '—'}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">{ev.holder_name || '—'}</td>
                          <td className="py-3 px-3 font-bold text-emerald-800">{ev.persons_admitted} Person</td>
                          <td className="py-3 px-3 text-slate-600">{ev.gate_id || 'GATE-01'}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                              {ev.result}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 truncate max-w-xs">{ev.reason || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {yearlyScanPassData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Total Entries: {yearlyScanPassData.length}</td>
                        <td colSpan={3}></td>
                        <td className="py-3 px-3 text-emerald-800">
                          {yearlyScanPassData.reduce((s, e) => s + (e.persons_admitted || 0), 0)} Total Persons
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
         SECTION B: USER MASTER (STAFF & ROLE MANAGEMENT)
         ========================================================================= */}
      {activeSection === 'users' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm space-y-5 no-print">
          {/* Header & Quick Action */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">User Master (Staff Management)</h2>
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                  {staffList.filter(s => s.enabled).length} Active Staff
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage operator logins, roles (Super Admin, Counter, Gate), reset passwords, and permissions.
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenAddStaff}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User / Staff</span>
            </button>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search staff by name, email or phone..."
                value={staffSearchQuery}
                onChange={e => setStaffSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Role Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All Roles' },
                { id: 'SUPER_ADMIN', label: 'Admin' },
                { id: 'COUNTER', label: 'Counter' },
                { id: 'GATE', label: 'Gate' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStaffRoleFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    staffRoleFilter === f.id
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Staff List: Mobile Cards (<lg) */}
          <div className="block lg:hidden space-y-3">
            {filteredStaffList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No staff found matching filter.</div>
            ) : (
              filteredStaffList.map(stf => (
                <div key={stf.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{stf.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{stf.email}</div>
                      {stf.phone && <div className="text-[11px] text-slate-600">📞 {stf.phone}</div>}
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      stf.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' :
                      stf.role === 'MANAGER' ? 'bg-indigo-100 text-indigo-800' :
                      stf.role === 'GATE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {stf.role.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/70">
                    <span className="text-slate-600 font-bold text-[11px]">Password:</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-800">
                        {visibleTablePasswords[stf.id] ? dbService.getStaffPassword(stf.id, stf.email, stf.role) : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVisibleTablePasswords(prev => ({ ...prev, [stf.id]: !prev[stf.id] }))}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
                        title={visibleTablePasswords[stf.id] ? "Hide password" : "Show password"}
                      >
                        {visibleTablePasswords[stf.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/70">
                    <span className="text-slate-600 font-bold text-[11px]">System / Terminal:</span>
                    <div>
                      {renderDeviceBadge(stf.system_name || (stf.role === 'SUPER_ADMIN' ? 'SHWETANK SYSTEM' : stf.role === 'GATE' ? 'Gate 1 Mobile Scanner' : 'Ticket Counter 1 PC'))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200/60">
                    <div>
                      {stf.role === 'GATE' ? (
                        <span>Assigned Gate: <strong>{stf.gate_code || 'GATE-01'}</strong></span>
                      ) : (
                        <span>Assigned Counter: <strong>{stf.counter_code || 'CTR-01'}</strong></span>
                      )}
                    </div>
                    <div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        stf.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {stf.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Actions for Mobile */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => handleOpenEditStaff(stf)}
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenChangePassword(stf)}
                      className="flex-1 py-1.5 bg-white hover:bg-slate-100 text-amber-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center justify-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>Password</span>
                    </button>
                    {stf.role !== 'SUPER_ADMIN' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleStaffEnabled(stf)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                            stf.enabled
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {stf.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStaff(stf)}
                          title="Delete User Permanently"
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold border border-red-200 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Staff List: Desktop Table (lg+) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold">
                  <th className="py-3 px-3">Staff Name</th>
                  <th className="py-3 px-3">Login ID / Email</th>
                  <th className="py-3 px-3">Password</th>
                  <th className="py-3 px-3">Designated System / Terminal</th>
                  <th className="py-3 px-3">Phone</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Assigned Counter/Gate</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaffList.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No staff records found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredStaffList.map(stf => (
                    <tr key={stf.id} className="hover:bg-slate-50/80 transition group">
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs ${
                            stf.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            stf.role === 'GATE' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {stf.name ? stf.name.slice(0, 2).toUpperCase() : 'ST'}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 text-xs tracking-tight">{stf.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{stf.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-slate-700 font-bold">
                        {stf.email}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100/90 hover:bg-slate-200/80 px-2.5 py-1 rounded-xl border border-slate-200/80 shadow-2xs">
                          <span className="font-mono text-xs font-black text-slate-800">
                            {visibleTablePasswords[stf.id] ? dbService.getStaffPassword(stf.id, stf.email, stf.role) : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setVisibleTablePasswords(prev => ({ ...prev, [stf.id]: !prev[stf.id] }))}
                            className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5 transition"
                            title={visibleTablePasswords[stf.id] ? "Hide password" : "Show password"}
                          >
                            {visibleTablePasswords[stf.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {renderDeviceBadge(stf.system_name || (stf.role === 'SUPER_ADMIN' ? 'SHWETANK SYSTEM' : stf.role === 'GATE' ? 'Gate 1 Mobile Scanner' : 'Ticket Counter 1 PC'))}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 font-medium">
                        {stf.phone || '—'}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                          stf.role === 'SUPER_ADMIN' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                          stf.role === 'MANAGER' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' :
                          stf.role === 'GATE' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}>
                          {stf.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {stf.role === 'GATE' ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">Gate: <strong>{stf.gate_code || 'GATE-01'}</strong></span>
                        ) : (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">Counter: <strong>{stf.counter_code || 'CTR-01'}</strong></span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border ${
                          stf.enabled 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                            : 'bg-red-50 text-red-800 border-red-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${stf.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                          {stf.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditStaff(stf)}
                            title="Edit Staff Credentials"
                            className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenChangePassword(stf)}
                            title="Reset Staff Password"
                            className="p-1.5 hover:bg-amber-100 text-amber-700 rounded-lg transition cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          {stf.role !== 'SUPER_ADMIN' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleStaffEnabled(stf)}
                                title={stf.enabled ? 'Disable User Access' : 'Enable User Access'}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${
                                  stf.enabled ? 'hover:bg-amber-100 text-amber-600' : 'hover:bg-emerald-100 text-emerald-600'
                                }`}
                              >
                                {stf.enabled ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteStaff(stf)}
                                title="Delete User Permanently"
                                className="p-1.5 hover:bg-red-100 text-red-600 rounded-lg transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SECTION C: AUDIT & SYSTEM ACTIVITY LOGS
         ========================================================================= */}
      {activeSection === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 no-print">
          {/* Header & Quick Action Buttons */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">System Audit & Activity Logs</h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-bold">
                  <Activity className="w-3.5 h-3.5 animate-pulse text-emerald-600" />
                  <span>{filteredAuditLogs.length} Events</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Full chronological traceability of logins, logouts, ticket issuance, pass generation, gate scans, and system operations with device detection.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleClearLogs}
                className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-red-50 hover:bg-red-100 active:scale-95 text-red-700 border border-red-200 font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                title="Clear all stored audit logs"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Clear All Logs</span>
              </button>
              <button
                type="button"
                onClick={exportAuditLogsCsv}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-900 hover:bg-black active:scale-95 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Search & Category Filter Pills */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 lg:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by action, doc #, staff, device name or details..."
                value={auditSearchQuery}
                onChange={e => setAuditSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All Activity' },
                { id: 'auth', label: 'Login & Logout' },
                { id: 'ticket', label: 'Tickets' },
                { id: 'pass', label: 'Passes' },
                { id: 'gate', label: 'Gate Entries' },
                { id: 'admin', label: 'Admin & Reports' },
                { id: 'staff', label: 'Staff Changes' },
                { id: 'security', label: 'Security & Denials' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setAuditCategory(cat.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    auditCategory === cat.id
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Audit Logs Mobile Cards (<lg) */}
          <div className="block lg:hidden space-y-3">
            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                No activity logs recorded matching criteria.
              </div>
            ) : (
              filteredAuditLogs.map(l => (
                <div key={l.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    {renderAuditActionBadge(l.action)}
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="text-slate-400 font-medium">{l.entity_type}:</span>
                      <span className="font-mono text-emerald-800">{l.entity_id || '—'}</span>
                    </div>
                    {renderDeviceBadge(l.device_name, l.device_type)}
                  </div>

                  <div className="text-xs text-slate-600 flex items-center justify-between border-t border-slate-200/60 pt-2">
                    <div>
                      Actor: <span className="font-bold text-slate-900">{l.actor_name || 'System'}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>

                  {l.details_summary ? (
                    <div className="text-xs text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200 font-medium">
                      {l.details_summary}
                    </div>
                  ) : l.after_json ? (
                    <div className="text-[11px] text-slate-500 bg-white p-2 rounded-xl border border-slate-200 font-mono break-all">
                      {JSON.stringify(l.after_json)}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {/* Audit Logs Desktop Table (lg+) */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 uppercase font-black tracking-wide">
                  <th className="py-3 px-3.5 whitespace-nowrap">Date & Time (IST)</th>
                  <th className="py-3 px-3 whitespace-nowrap min-w-[170px]">Operation / Action</th>
                  <th className="py-3 px-3 whitespace-nowrap min-w-[170px]">System / Device</th>
                  <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">Entity / Doc #</th>
                  <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">Actor (Staff)</th>
                  <th className="py-3 px-3 min-w-[240px]">Details & Operation Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredAuditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No audit events recorded matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAuditLogs.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                        </div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderAuditActionBadge(l.action)}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {renderDeviceBadge(l.device_name, l.device_type)}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {l.entity_id || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        <div className="font-bold text-slate-900">{l.actor_name || 'System'}</div>
                        {l.actor_email && <div className="text-[10px] text-slate-400 font-mono">{l.actor_email}</div>}
                      </td>
                      <td className="py-3 px-3 text-slate-800">
                        {l.details_summary ? (
                          <span className="font-medium text-slate-800">{l.details_summary}</span>
                        ) : l.after_json ? (
                          <span className="font-mono text-[11px] text-slate-500 truncate max-w-md block">
                            {JSON.stringify(l.after_json)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SECTION D: SYSTEM & HARDWARE SETTINGS
         ========================================================================= */}
      {activeSection === 'settings' && isSettingsUnlocked && (
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm space-y-6 no-print">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-slate-900">System & Hardware Settings</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Thermal printer pairing, official pricing master, cloud database connection, and terminal configurations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchSection('reports')}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
              title="Lock Settings Area"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Lock Settings</span>
            </button>
          </div>

          {/* Official Gazette Pricing Master & Rate Editor */}
          <div className="bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/30 p-5 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-sm shadow-emerald-500/20 shrink-0">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    Official Pricing Master & Rate Editor
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Configure official gazette rates for single entry visitor tickets and subscription passes.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black shrink-0 border border-emerald-200/80 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Live Rates Enforced
              </span>
            </div>

            {pricingSaveSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{pricingSaveSuccess}</span>
              </div>
            )}

            {pricingSaveError && (
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{pricingSaveError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRates} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Single Ticket Rate */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 hover:border-emerald-200 transition">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <TicketIcon className="w-3.5 h-3.5 text-emerald-600" />
                      Single Entry Ticket
                    </label>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 font-black px-2 py-0.5 rounded-md border border-emerald-200/60">
                      Per Person
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-base font-black text-slate-400">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={ratesForm.ticket_rate_inr}
                      onChange={e => setRatesForm({ ...ratesForm, ticket_rate_inr: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xl font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition shadow-inner"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Auto-calculated per visitor at Counter POS.</p>
                </div>

                {/* 2. Monthly Pass Rates (1, 2, 3 Months) */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 hover:border-blue-200 transition">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      Monthly Passes (1, 2, 3 Mo)
                    </label>
                    <span className="text-[10px] bg-blue-50 text-blue-800 font-black px-2 py-0.5 rounded-md border border-blue-200/60">
                      Subscriptions
                    </span>
                  </div>

                  <div className="space-y-2">
                    {/* 1 Month */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 w-24 shrink-0">1 Mo (30d):</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1.5 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="1"
                          required
                          value={ratesForm.monthly_pass_1m_inr}
                          onChange={e => setRatesForm({ ...ratesForm, monthly_pass_1m_inr: Number(e.target.value) })}
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition"
                        />
                      </div>
                    </div>

                    {/* 2 Months */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 w-24 shrink-0">2 Mo (60d):</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1.5 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="1"
                          required
                          value={ratesForm.monthly_pass_2m_inr}
                          onChange={e => setRatesForm({ ...ratesForm, monthly_pass_2m_inr: Number(e.target.value) })}
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition"
                        />
                      </div>
                    </div>

                    {/* 3 Months */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 w-24 shrink-0">3 Mo (90d):</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1.5 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="1"
                          required
                          value={ratesForm.monthly_pass_3m_inr}
                          onChange={e => setRatesForm({ ...ratesForm, monthly_pass_3m_inr: Number(e.target.value) })}
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none transition"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Yearly Pass Rate */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 hover:border-purple-200 transition">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                      Yearly Walker Pass
                    </label>
                    <span className="text-[10px] bg-purple-50 text-purple-800 font-black px-2 py-0.5 rounded-md border border-purple-200/60">
                      365 Days
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-base font-black text-slate-400">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={ratesForm.yearly_pass_inr}
                      onChange={e => setRatesForm({ ...ratesForm, yearly_pass_inr: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xl font-black text-slate-900 focus:bg-white focus:border-purple-600 focus:outline-none transition shadow-inner"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Applied for 1-year annual subscription pass.</p>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  Note: Changes are updated across Ticket Counter, Passes, and Database Functions immediately.
                </span>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save & Apply New Pricing Rates</span>
                </button>
              </div>
            </form>
          </div>

          {/* Bluetooth Thermal Printer Card */}
          <div className="bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-sm shadow-blue-500/20 shrink-0">
                  <Bluetooth className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900">Bluetooth Thermal Slip Printer</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    ESC/POS 3-Inch (76.20mm) thermal printer pairing via Web Bluetooth.
                  </p>
                </div>
              </div>
              <span className={`text-[11px] font-black px-3 py-1 rounded-full border flex items-center gap-1.5 ${
                printerService.isConnected 
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${printerService.isConnected ? 'bg-emerald-600 animate-ping' : 'bg-slate-400'}`} />
                {btStatus}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={isBluetoothConnecting}
                onClick={handlePairBluetooth}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-sm shadow-blue-500/20 active:scale-95"
              >
                <Bluetooth className="w-4 h-4" />
                {isBluetoothConnecting ? 'Searching Devices...' : 'Pair Bluetooth Printer'}
              </button>

              {printerService.isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnectBluetooth}
                  className="px-4 py-2 bg-white hover:bg-red-50 text-red-600 rounded-xl text-xs font-bold transition border border-red-200 cursor-pointer active:scale-95"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Terminal & System Device Identification Card */}
          <div className="bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/30 p-5 sm:p-7 rounded-3xl border border-slate-200 shadow-xs space-y-5 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl shadow-sm shadow-emerald-500/20 shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    Terminal & System Identification
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Hardware signature, OS and terminal nicknames recorded across every Ticket, Gate Admission, and Security Audit event.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  <span>Live Signature:</span>
                  {renderDeviceBadge()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              {/* Box 1: Auto-Detected Hardware & OS */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 relative flex flex-col justify-between hover:border-emerald-200 transition">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                      Auto-Detected Hardware & OS
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 ${
                      getAutoDetectedHardware().isMobile 
                        ? 'bg-sky-100 text-sky-800 border border-sky-200' 
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {getAutoDetectedHardware().isMobile ? (
                        <>
                          <Smartphone className="w-3 h-3" />
                          <span>Mobile Device</span>
                        </>
                      ) : (
                        <>
                          <Monitor className="w-3 h-3" />
                          <span>Desktop PC Terminal</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                      {getAutoDetectedHardware().hardwareSummary}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-bold border border-slate-200 font-mono">
                        OS: {getAutoDetectedHardware().os}
                      </span>
                      <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 font-bold border border-slate-200 font-mono">
                        Browser: {getAutoDetectedHardware().browser}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span>Engine: WebGL GPU + User Agent</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Verified Pure
                  </span>
                </div>
              </div>

              {/* Box 2: Custom Terminal Nickname */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-3 relative flex flex-col justify-between hover:border-emerald-200 transition">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5 text-emerald-600" />
                      Custom Terminal Nickname (Optional)
                    </label>
                    {dbService.getCurrentStaff()?.system_name && (
                      <span className="text-[10px] font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        Default: {dbService.getCurrentStaff()?.system_name}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. SHWETANK SYSTEM, Counter 1 PC, Gate 1 Scanner"
                      value={customDeviceInput}
                      onChange={e => setCustomDeviceInput(e.target.value)}
                      className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomDeviceName}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                    {customDeviceInput && (
                      <button
                        type="button"
                        onClick={handleResetCustomDeviceName}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer border border-slate-200"
                        title="Reset to Auto-detect"
                      >
                        Reset
                      </button>
                    )}
                  </div>

                  {/* 1-Click Quick Preset Chips */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Quick Fill:</span>
                    <button
                      type="button"
                      onClick={() => setCustomDeviceInput('SHWETANK SYSTEM')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition cursor-pointer"
                    >
                      SHWETANK SYSTEM
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomDeviceInput('Ticket Counter 1 PC')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer"
                    >
                      Ticket Counter 1 PC
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomDeviceInput('Gate 1 Mobile Scanner')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 transition cursor-pointer"
                    >
                      Gate 1 Mobile Scanner
                    </button>
                  </div>
                </div>

                {deviceSaveMessage && (
                  <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-black flex items-center gap-1 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{deviceSaveMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Current Active Session & Assigned System Strip */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-5 py-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-black text-xs flex items-center justify-center ring-2 ring-white/20 shrink-0">
                  {dbService.getCurrentStaff()?.name ? dbService.getCurrentStaff()!.name.slice(0, 2).toUpperCase() : 'AD'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">
                      {dbService.getCurrentStaff()?.name || 'Administrator'}
                    </span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {dbService.getCurrentStaff()?.role || 'SUPER_ADMIN'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Staff Email: {dbService.getCurrentStaff()?.email || 'admin@vedupvan.local'}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                  Active Stamped Terminal Name
                </span>
                <span className="font-mono font-bold text-xs text-emerald-300 bg-slate-950/60 px-3 py-1 rounded-lg border border-slate-700/80">
                  {getSystemDeviceInfo().deviceName}
                </span>
              </div>
            </div>
          </div>

          {/* Danger Zone: Full Wipe */}
          <div className="bg-red-50 border border-red-200 p-5 rounded-2xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-red-800 font-black text-sm">
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span>Reset All Database & Restart Numbering</span>
                </div>
                <p className="text-xs text-red-700/80 mt-0.5">
                  Permanently wipe all tickets, passes, and gate scan events. Next ticket issued will be <strong>#000001</strong>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleResetDatabase}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow shrink-0"
              >
                Clean & Restart #000001
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Locked card when Settings tab is active but not yet unlocked with password */}
      {activeSection === 'settings' && !isSettingsUnlocked && (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-sm no-print max-w-md mx-auto my-6 animate-in fade-in">
          <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Settings Area Locked</h3>
            <p className="text-xs text-slate-500 mt-1">
              Administrator password verification is required to access system settings & rates.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSettingsPasswordInput('');
              setSettingsAuthError(null);
              setIsSettingsAuthModalOpen(true);
            }}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs shadow-md shadow-emerald-600/20 cursor-pointer transition inline-flex items-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Enter Admin Password</span>
          </button>
        </div>
      )}

      {/* =========================================================================
         MODAL 1: ADD / EDIT STAFF MODAL
         ========================================================================= */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingStaffId ? 'Edit Staff User' : 'Add New User / Staff'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Configure operator credentials & permissions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsStaffModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {staffFormFeedback && (
              <div className={`p-3 rounded-xl text-xs font-bold ${
                staffFormFeedback.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {staffFormFeedback}
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="space-y-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={staffFormData.name}
                  onChange={e => setStaffFormData({ ...staffFormData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                  Login ID / Email *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. counter2@vedupvan.local or username"
                  value={staffFormData.email}
                  onChange={e => setStaffFormData({ ...staffFormData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={staffFormData.phone}
                  onChange={e => setStaffFormData({ ...staffFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                    Role *
                  </label>
                  <select
                    value={staffFormData.role}
                    onChange={e => setStaffFormData({ ...staffFormData, role: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="COUNTER">Counter POS</option>
                    <option value="GATE">Gate Security</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                    Status
                  </label>
                  <select
                    value={staffFormData.enabled ? 'true' : 'false'}
                    onChange={e => setStaffFormData({ ...staffFormData, enabled: e.target.value === 'true' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="true">Active (Enabled)</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-700 font-bold flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Designated System / Terminal Name</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {staffFormData.role === 'GATE' ? 'Mobile / Scanner' : 'Counter / PC'}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder={staffFormData.role === 'GATE' ? 'Gate 1 Mobile Scanner' : staffFormData.role === 'SUPER_ADMIN' ? 'SHWETANK SYSTEM' : 'Ticket Counter 1 PC'}
                  value={staffFormData.system_name}
                  onChange={e => setStaffFormData({ ...staffFormData, system_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setStaffFormData({ ...staffFormData, system_name: 'SHWETANK SYSTEM' })}
                    className="text-[10px] text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200 font-bold cursor-pointer"
                  >
                    SHWETANK SYSTEM
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffFormData({ ...staffFormData, system_name: 'Ticket Counter 1 PC' })}
                    className="text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 font-bold cursor-pointer"
                  >
                    Ticket Counter 1 PC
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffFormData({ ...staffFormData, system_name: 'Gate 1 Mobile Scanner' })}
                    className="text-[10px] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 font-bold cursor-pointer"
                  >
                    Gate 1 Mobile Scanner
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-700 font-black">
                    {editingStaffId ? 'Staff Password *' : 'Login Password *'}
                  </label>
                  <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {editingStaffId ? 'Current Set Password' : 'Min 4 Characters'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showStaffModalPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter login password"
                    value={staffFormData.password}
                    onChange={e => setStaffFormData({ ...staffFormData, password: e.target.value })}
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffModalPassword(!showStaffModalPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer transition"
                    title={showStaffModalPassword ? 'Hide password' : 'Show password'}
                  >
                    {showStaffModalPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {showStaffModalPassword ? 'Password is visible. You can edit it directly.' : 'Click the eye icon to view password in plain text.'}
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStaffSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer disabled:opacity-50"
                >
                  {isStaffSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 3: SETTINGS SECURITY PASSWORD VERIFICATION MODAL
         ========================================================================= */}
      {isSettingsAuthModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 my-8 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200">
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Administrator Access</h3>
                  <p className="text-xs text-slate-500">Password required for Settings & Rates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseSettingsModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {settingsAuthError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{settingsAuthError}</span>
              </div>
            )}

            <form onSubmit={handleVerifySettingsPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Admin Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showSettingsPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    placeholder="Enter admin password"
                    value={settingsPasswordInput}
                    onChange={e => {
                      setSettingsPasswordInput(e.target.value);
                      setSettingsAuthError(null);
                    }}
                    className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsPassword(!showSettingsPassword)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    title={showSettingsPassword ? 'Hide password' : 'Show password'}
                  >
                    {showSettingsPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseSettingsModal}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingSettingsAuth}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer disabled:opacity-50"
                >
                  {isVerifyingSettingsAuth ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Unlock Settings</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         MODAL 2: CHANGE PASSWORD MODAL
         ========================================================================= */}
      {isPasswordModalOpen && selectedStaffForPassword && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Change Password</h3>
                  <p className="text-[11px] text-slate-500">{selectedStaffForPassword.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordFeedback && (
              <div className={`p-3 rounded-xl text-xs font-bold ${
                passwordFeedback.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {passwordFeedback}
              </div>
            )}

            <form onSubmit={handleSavePassword} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-700 font-black">
                    New Password *
                  </label>
                  <span className="text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Min 4 Characters
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    required
                    placeholder="Enter new password (min 4 characters)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(!showChangePassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer transition"
                    title={showChangePassword ? 'Hide password' : 'Show password'}
                  >
                    {showChangePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Click the eye icon to view or verify password before saving.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isStaffSaving}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow cursor-pointer disabled:opacity-50"
                >
                  {isStaffSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
         DEDICATED FULL-WIDTH A4 PRINT / PDF CONTAINER (#print-report-root)
         Visible ONLY during report printing / PDF export
         ========================================================================= */}
      <div id="print-report-root">
        {/* Official Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '16px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
            {config.park_settings.park_name}
          </h1>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '2px 0', color: '#15803d' }}>
            {config.park_settings.organization_name}
          </h2>
          <p style={{ fontSize: '11px', margin: 0, color: '#4b5563' }}>
            {config.park_settings.address}
          </p>
          <div style={{ display: 'inline-block', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', marginTop: '8px' }}>
            {reportTitles[selectedReport].title.toUpperCase()}
          </div>
        </div>

        {/* Metadata Strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px', color: '#334155' }}>
          <div>
            <strong>Report Period:</strong> {startDate || 'Start'} to {endDate || 'Present'}
          </div>
          <div>
            <strong>Generated:</strong> {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
          </div>
          <div>
            <strong>Generated By:</strong> {config.operator_name || 'Admin'}
          </div>
        </div>

        {/* Dynamic Table Output for Print */}
        {selectedReport === 'daily-sales' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Date</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Single Tickets</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Passes Sold</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Total Persons</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Cash Amount (₹)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>UPI Amount (₹)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Total Revenue (₹)</th>
              </tr>
            </thead>
            <tbody>
              {dailySaleData.map(r => (
                <tr key={r.date}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.date}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.ticketsCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.passesCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.personsCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(r.cashPaise / 100).toFixed(2)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(r.upiPaise / 100).toFixed(2)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>₹{(r.totalPaise / 100).toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{ backgroundColor: '#f8fafc', fontWeight: 'bold' }}>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>TOTAL</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{dailySaleData.reduce((s, r) => s + r.ticketsCount, 0)}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{dailySaleData.reduce((s, r) => s + r.passesCount, 0)}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{dailySaleData.reduce((s, r) => s + r.personsCount, 0)}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(dailySaleData.reduce((s, r) => s + r.cashPaise, 0) / 100).toFixed(2)}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(dailySaleData.reduce((s, r) => s + r.upiPaise, 0) / 100).toFixed(2)}</td>
                <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(dailySaleData.reduce((s, r) => s + r.totalPaise, 0) / 100).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {selectedReport === 'monthly-sales' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Month</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Tickets Sold</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Passes Sold</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Total Persons</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Cash Amount (₹)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>UPI Amount (₹)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Total Revenue (₹)</th>
              </tr>
            </thead>
            <tbody>
              {monthlySaleData.map(r => (
                <tr key={r.monthKey}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.monthName}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.ticketsCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.passesCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{r.personsCount}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(r.cashPaise / 100).toFixed(2)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>₹{(r.upiPaise / 100).toFixed(2)}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>₹{(r.totalPaise / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selectedReport === 'scan-tickets' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Scan Time (IST)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Ticket Number</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Admitted</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Gate</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Result</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {scanTicketData.map(ev => (
                <tr key={ev.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(ev.scanned_at).toLocaleString('en-IN')}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.document_number || '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.persons_admitted} Persons</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.gate_id || 'GATE-01'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.result}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selectedReport === 'generate-tickets' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Issue Time (IST)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Ticket Number</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Plan</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Persons</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Payment Mode</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Amount (₹)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {generateTicketData.map(tk => (
                <tr key={tk.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(tk.created_at).toLocaleString('en-IN')}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tk.ticket_number}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tk.plan_name || 'Single Entry Ticket'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tk.persons_count}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tk.payment_method || 'CASH'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>
                    ₹{((tk.price_paise || tk.persons_count * 1000) / 100).toFixed(2)}
                  </td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{tk.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(selectedReport === 'monthly-generate-pass' || selectedReport === 'yearly-generate-pass') && (
          <div>
            {selectedReport === 'monthly-generate-pass' && (
              <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '6px', textTransform: 'uppercase', color: '#0f172a' }}>
                  Official Monthly Subscription Pass Sales Summary ({monthlyPassBreakdown.totalCount} Total Issued):
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ padding: '3px 8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '4px' }}>
                    <strong>1 Month Pass (₹{ratesForm.monthly_pass_1m_inr || 300}):</strong> {monthlyPassBreakdown.m1.count} Sold (₹{(monthlyPassBreakdown.m1.revPaise / 100).toFixed(2)})
                  </span>
                  <span style={{ padding: '3px 8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px' }}>
                    <strong>2 Months Pass (₹{ratesForm.monthly_pass_2m_inr || 600}):</strong> {monthlyPassBreakdown.m2.count} Sold (₹{(monthlyPassBreakdown.m2.revPaise / 100).toFixed(2)})
                  </span>
                  <span style={{ padding: '3px 8px', backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '4px' }}>
                    <strong>3 Months Pass (₹{ratesForm.monthly_pass_3m_inr || 900}):</strong> {monthlyPassBreakdown.m3.count} Sold (₹{(monthlyPassBreakdown.m3.revPaise / 100).toFixed(2)})
                  </span>
                  <span style={{ padding: '3px 8px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', marginLeft: 'auto', fontWeight: 'bold' }}>
                    Total Revenue: ₹{(monthlyPassBreakdown.totalRevPaise / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9' }}>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Issue Time (IST)</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Pass Number</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Plan Duration</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Holder Name</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Phone</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Validity</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Mode</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {(selectedReport === 'monthly-generate-pass' ? monthlyGeneratePassData : yearlyGeneratePassData).map(ps => {
                  const dInfo = getPassDurationCategory(ps);
                  return (
                    <tr key={ps.id}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(ps.created_at).toLocaleString('en-IN')}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontWeight: 'bold' }}>{ps.pass_number}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px', fontWeight: 'bold' }}>{dInfo.label}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.holder_name}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.holder_phone || '—'}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.valid_from} to {ps.valid_through}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.payment_method || 'CASH'}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>
                        ₹{(getPassEffectiveAmountPaise(ps, ratesForm) / 100).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(selectedReport === 'monthly-scan-pass' || selectedReport === 'yearly-scan-pass') && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Scan Time (IST)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Pass Number</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Holder Name</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Admitted</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Gate</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {(selectedReport === 'monthly-scan-pass' ? monthlyScanPassData : yearlyScanPassData).map(ev => (
                <tr key={ev.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(ev.scanned_at).toLocaleString('en-IN')}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.document_number || '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.holder_name || '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.persons_admitted} Persons</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.gate_id || 'GATE-01'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ev.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Official Signoff Footer */}
        <div style={{ marginTop: '28px', paddingTop: '12px', borderTop: '1px dashed #94a3b8', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
          <div>
            System: Ved Upvan Park Smart Park Ticketing & Pass System (Nagar Palika Parishad)
          </div>
          <div>
            Authorized Signatory / Incharge: ___________________________
          </div>
        </div>
      </div>
    </div>
  );
};
