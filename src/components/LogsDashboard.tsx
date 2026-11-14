import React, { useState, useEffect, useMemo } from 'react';
import type { Ticket, Pass, EntryEvent, AppConfig, StaffUser, AuditLog } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { getSystemDeviceInfo, getCustomDeviceName, setCustomDeviceName } from '../lib/device';
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
  Shield,
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
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedStaffForPassword, setSelectedStaffForPassword] = useState<StaffUser | null>(null);
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
    if (isSettingsUnlocked) {
      setActiveSection('settings');
    } else {
      setSettingsPasswordInput('');
      setSettingsAuthError(null);
      setIsSettingsAuthModalOpen(true);
    }
  };

  const handleVerifySettingsPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsPasswordInput) {
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
        setSettingsAuthError('Incorrect Password! Only authorized administrators can access Settings.');
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
      enabled: true,
    });
    setStaffFormFeedback(null);
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (stf: StaffUser) => {
    setEditingStaffId(stf.id);
    setStaffFormData({
      name: stf.name,
      email: stf.email,
      phone: stf.phone || '',
      role: stf.role,
      password: '',
      counter_code: stf.counter_code || 'CTR-01',
      gate_code: stf.gate_code || 'GATE-01',
      enabled: stf.enabled,
    });
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
    setNewPassword('');
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
        role: selectedStaffForPassword.role,
        password: newPassword.trim(),
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
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const amount = p.amount_paise || (p.pass_type === 'YEARLY' ? 310000 : 30000);
      entry.passesCount += 1;
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
        personsCount: 0,
        cashPaise: 0,
        upiPaise: 0,
        totalPaise: 0,
      };
      const amount = p.amount_paise || (p.pass_type === 'YEARLY' ? 310000 : 30000);
      entry.passesCount += 1;
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
  const monthlyGeneratePassData = useMemo(() => {
    return passes
      .filter(p => p.pass_type === 'MONTHLY' && isDateInRange(p.created_at))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [passes, startDate, endDate]);

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
      headers = ['Date', 'Tickets Sold', 'Passes Sold', 'Total Persons', 'Cash Amount (INR)', 'UPI Amount (INR)', 'Total Amount (INR)'];
      rows = dailySaleData.map(r => [
        r.date,
        r.ticketsCount,
        r.passesCount,
        r.personsCount,
        (r.cashPaise / 100).toFixed(2),
        (r.upiPaise / 100).toFixed(2),
        (r.totalPaise / 100).toFixed(2),
      ]);
    } else if (selectedReport === 'monthly-sales') {
      headers = ['Month', 'Tickets Sold', 'Passes Sold', 'Total Persons', 'Cash Amount (INR)', 'UPI Amount (INR)', 'Total Revenue (INR)'];
      rows = monthlySaleData.map(r => [
        r.monthName,
        r.ticketsCount,
        r.passesCount,
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
      headers = ['Issue Timestamp (IST)', 'Pass Number', 'Holder Name', 'Phone', 'People Allowed', 'Valid From', 'Valid Through', 'Payment Mode', 'Amount (INR)', 'Status'];
      rows = monthlyGeneratePassData.map(r => [
        new Date(r.created_at).toLocaleString('en-IN'),
        r.pass_number,
        r.holder_name,
        r.holder_phone || '—',
        r.people_allowed,
        r.valid_from,
        r.valid_through,
        r.payment_method || 'CASH',
        ((r.amount_paise || 30000) / 100).toFixed(2),
        r.status,
      ]);
    } else if (selectedReport === 'yearly-generate-pass') {
      headers = ['Issue Timestamp (IST)', 'Pass Number', 'Holder Name', 'Phone', 'People Allowed', 'Valid From', 'Valid Through', 'Payment Mode', 'Amount (INR)', 'Status'];
      rows = yearlyGeneratePassData.map(r => [
        new Date(r.created_at).toLocaleString('en-IN'),
        r.pass_number,
        r.holder_name,
        r.holder_phone || '—',
        r.people_allowed,
        r.valid_from,
        r.valid_through,
        r.payment_method || 'CASH',
        ((r.amount_paise || 310000) / 100).toFixed(2),
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
    todayPasses.reduce((sum, p) => sum + (p.amount_paise || (p.pass_type === 'YEARLY' ? 310000 : 30000)), 0);
  const todayRevenueInr = (todayRevenuePaise / 100).toFixed(2);

  const todayCashPaise = todayTickets.filter(t => (t.payment_method || 'CASH') === 'CASH').reduce((sum, t) => sum + (t.price_paise || (t.persons_count || 1) * 1000), 0) +
    todayPasses.filter(p => (p.payment_method || 'CASH') === 'CASH').reduce((sum, p) => sum + (p.amount_paise || (p.pass_type === 'YEARLY' ? 310000 : 30000)), 0);
  const todayUpiPaise = todayTickets.filter(t => t.payment_method === 'UPI').reduce((sum, t) => sum + (t.price_paise || (t.persons_count || 1) * 1000), 0) +
    todayPasses.filter(p => p.payment_method === 'UPI').reduce((sum, p) => sum + (p.amount_paise || (p.pass_type === 'YEARLY' ? 310000 : 30000)), 0);

  const todaySuccessEvents = entryEvents.filter(e => e.result === 'SUCCESS' && isSameIstDay(e.scanned_at, todayYmd));
  const totalVisitorsAdmitted = todaySuccessEvents.reduce((sum, e) => sum + (e.persons_admitted || 1), 0);

  const activeTicketsCount = todayTickets.filter(t => t.status === 'ACTIVE').length;
  const usedTicketsCount = todayTickets.filter(t => t.status === 'USED').length;

  return (
    <div className="max-w-7xl mx-auto p-2.5 sm:p-4 space-y-4 sm:space-y-6">
      {/* 4 Big Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {/* Visitors */}
        <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex items-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-3.5 bg-emerald-100 text-emerald-800 rounded-2xl shrink-0">
            <Users className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold">Visitors Admitted Today</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5">{totalVisitorsAdmitted}</div>
          </div>
        </div>

        {/* Collection */}
        <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex items-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-3.5 bg-blue-100 text-blue-800 rounded-2xl shrink-0">
            <IndianRupee className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="flex-1">
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold">Total Collection Today</div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 mt-0.5">₹{todayRevenueInr}</div>
            <div className="flex items-center gap-2 mt-1 text-[10px] sm:text-[11px] font-bold text-slate-500">
              <span className="text-emerald-700">1. Cash: ₹{(todayCashPaise / 100).toFixed(0)}</span>
              <span>•</span>
              <span className="text-blue-700">2. UPI: ₹{(todayUpiPaise / 100).toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Active Tickets */}
        <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex items-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-3.5 bg-amber-100 text-amber-800 rounded-2xl shrink-0">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold">Active Valid Tickets</div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-0.5">{activeTicketsCount}</div>
          </div>
        </div>

        {/* Expired / Used */}
        <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-sm flex items-center gap-3 sm:gap-4">
          <div className="p-3 sm:p-3.5 bg-purple-100 text-purple-800 rounded-2xl shrink-0">
            <CheckCircle2 className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div>
            <div className="text-[11px] sm:text-xs text-slate-500 font-bold">Scanned & Expired Today</div>
            <div className="text-2xl sm:text-3xl font-black text-slate-700 mt-0.5">{usedTicketsCount}</div>
          </div>
        </div>
      </div>

      {/* 4-Section Admin Dashboard Navigation Tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-sm no-print gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
          {/* 1. Reports */}
          <button
            type="button"
            onClick={() => setActiveSection('reports')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeSection === 'reports'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">1. Reports (8)</span>
          </button>

          {/* 2. User Master */}
          <button
            type="button"
            onClick={() => setActiveSection('users')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeSection === 'users'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span className="truncate">2. User Master</span>
          </button>

          {/* 3. Audit Logs */}
          <button
            type="button"
            onClick={() => setActiveSection('audit')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeSection === 'audit'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="truncate">3. Audit Logs</span>
          </button>

          {/* 4. System Settings (Password Protected) */}
          <button
            type="button"
            onClick={handleSettingsTabClick}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-center ${
              activeSection === 'settings'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="truncate">4. Settings</span>
            {!isSettingsUnlocked && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
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
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'week', label: 'Last 7 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'all', label: 'All Records' },
                  ] as const
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
                          <td className="py-3 px-3 text-slate-700">{r.passesCount}</td>
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
                        <td className="py-3 px-3">{dailySaleData.reduce((s, r) => s + r.passesCount, 0)}</td>
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
                          <td className="py-3 px-3 text-slate-700">{r.passesCount}</td>
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
                        <td className="py-3 px-3">{monthlySaleData.reduce((s, r) => s + r.passesCount, 0)}</td>
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 uppercase font-bold">
                      <th className="py-3 px-3">Issue Time (IST)</th>
                      <th className="py-3 px-3">System / Device</th>
                      <th className="py-3 px-3">Pass Number</th>
                      <th className="py-3 px-3">Holder Name</th>
                      <th className="py-3 px-3">Phone</th>
                      <th className="py-3 px-3">Allowed</th>
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
                          No monthly subscription passes generated in the selected period.
                        </td>
                      </tr>
                    ) : (
                      monthlyGeneratePassData.map(ps => (
                        <tr key={ps.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-3 font-mono text-slate-600">
                            {new Date(ps.created_at).toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-3">
                            {renderDeviceBadge(ps.device_name)}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-purple-900">{ps.pass_number}</td>
                          <td className="py-3 px-3 font-bold text-slate-900">{ps.holder_name}</td>
                          <td className="py-3 px-3 text-slate-600">{ps.holder_phone || '—'}</td>
                          <td className="py-3 px-3 font-bold text-slate-800">{ps.people_allowed} Person</td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                            {ps.valid_from} → {ps.valid_through}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {ps.payment_method || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ₹{((ps.amount_paise || 30000) / 100).toFixed(2)}
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
                  {monthlyGeneratePassData.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-purple-50/60 font-black text-slate-900">
                        <td className="py-3 px-3 uppercase">Total Passes: {monthlyGeneratePassData.length}</td>
                        <td colSpan={7}></td>
                        <td className="py-3 px-3 text-purple-900 text-sm">
                          ₹{(monthlyGeneratePassData.reduce((s, p) => s + (p.amount_paise || 30000), 0) / 100).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
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
                      <th className="py-3 px-3">Holder Name</th>
                      <th className="py-3 px-3">Phone</th>
                      <th className="py-3 px-3">Allowed Members</th>
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
                          <td className="py-3 px-3 font-bold text-slate-900">{ps.holder_name}</td>
                          <td className="py-3 px-3 text-slate-600">{ps.holder_phone || '—'}</td>
                          <td className="py-3 px-3 font-bold text-purple-800">{ps.people_allowed} Person</td>
                          <td className="py-3 px-3 text-slate-600 font-mono text-[11px]">
                            {ps.valid_from} → {ps.valid_through}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {ps.payment_method || 'CASH'}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-black text-slate-900">
                            ₹{((ps.amount_paise || 310000) / 100).toFixed(2)}
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
                        <td className="py-3 px-3 uppercase">Total Passes: {yearlyGeneratePassData.length}</td>
                        <td colSpan={7}></td>
                        <td className="py-3 px-3 text-purple-900 text-sm">
                          ₹{(yearlyGeneratePassData.reduce((s, p) => s + (p.amount_paise || 310000), 0) / 100).toFixed(2)}
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
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No staff records found matching filter.
                    </td>
                  </tr>
                ) : (
                  filteredStaffList.map(stf => (
                    <tr key={stf.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {stf.name}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {stf.email}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {stf.phone || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${
                          stf.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-800' :
                          stf.role === 'MANAGER' ? 'bg-indigo-100 text-indigo-800' :
                          stf.role === 'GATE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {stf.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {stf.role === 'GATE' ? (
                          <span>Gate: <strong>{stf.gate_code || 'GATE-01'}</strong></span>
                        ) : (
                          <span>Counter: <strong>{stf.counter_code || 'CTR-01'}</strong></span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          stf.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {stf.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditStaff(stf)}
                            title="Edit Staff"
                            className="p-1.5 hover:bg-slate-200 text-slate-600 rounded-lg transition cursor-pointer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenChangePassword(stf)}
                            title="Change Password"
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
                                <Shield className="w-4 h-4" />
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
      {activeSection === 'settings' && (
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
              onClick={() => {
                setIsSettingsUnlocked(false);
                setActiveSection('reports');
              }}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
              title="Lock Settings Area"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600" />
              <span>Lock Settings</span>
            </button>
          </div>

          {/* Official Gazette Pricing Master & Rate Editor */}
          <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="text-emerald-700 font-black text-lg">₹</span>
                  Official Pricing Master & Rate Editor
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Change official rates for single entry tickets and subscription passes. Updates take effect immediately.
                </p>
              </div>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black shrink-0">
                Live Pricing Active
              </span>
            </div>

            {pricingSaveSuccess && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{pricingSaveSuccess}</span>
              </div>
            )}

            {pricingSaveError && (
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{pricingSaveError}</span>
              </div>
            )}

            <form onSubmit={handleSaveRates} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Single Ticket Rate */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Single Entry Ticket
                    </label>
                    <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      Per Person
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-base font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={ratesForm.ticket_rate_inr}
                      onChange={e => setRatesForm({ ...ratesForm, ticket_rate_inr: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Applied per person at Ticket Counter POS.</p>
                </div>

                {/* 2. Monthly Pass Rates (1, 2, 3 Months) */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Monthly Passes (1, 2, 3 Mo)
                    </label>
                    <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded">
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
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
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
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
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
                          className="w-full pl-7 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Yearly Pass Rate */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Yearly Pass
                    </label>
                    <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded">
                      365 Days
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-base font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={ratesForm.yearly_pass_inr}
                      onChange={e => setRatesForm({ ...ratesForm, yearly_pass_inr: Number(e.target.value) })}
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-lg font-black text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-none transition"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">Applied for annual subscription pass.</p>
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Note: Changes are saved to system storage and applied immediately to Ticket POS & Passes.
                </span>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save & Apply New Pricing Rates</span>
                </button>
              </div>
            </form>
          </div>

          {/* Bluetooth Thermal Printer Card */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-black text-slate-900">Bluetooth Thermal Printer</h3>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                printerService.isConnected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {btStatus}
              </span>
            </div>

            <p className="text-xs text-slate-600">
              Pair your Bluetooth ESC/POS thermal receipt printer directly via Web Bluetooth in Chrome.
            </p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isBluetoothConnecting}
                onClick={handlePairBluetooth}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow"
              >
                <Bluetooth className="w-4 h-4" />
                {isBluetoothConnecting ? 'Searching Devices...' : 'Pair Bluetooth Printer'}
              </button>

              {printerService.isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnectBluetooth}
                  className="px-4 py-2 bg-white hover:bg-red-50 text-red-600 rounded-xl text-xs font-bold transition border border-red-200 cursor-pointer"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Terminal & System Device Identification Card */}
          <div className="bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-emerald-600" />
                  Terminal & System Identification
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Device model name and terminal identifier recorded across all Ticket generations, Gate scans, and Activity logs.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {renderDeviceBadge()}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Auto-Detected Hardware & OS
                </span>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>{getSystemDeviceInfo().hardwareSummary || getSystemDeviceInfo().deviceName}</span>
                  <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                    {getSystemDeviceInfo().os} • {getSystemDeviceInfo().browser}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Automatically extracted from browser User Agent, GPU WebGL chip, and screen context.
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Custom Terminal Name (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Counter 1 (Main PC) or Gate 1 Mobile"
                    value={customDeviceInput}
                    onChange={e => setCustomDeviceInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomDeviceName}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  {customDeviceInput && (
                    <button
                      type="button"
                      onClick={handleResetCustomDeviceName}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition cursor-pointer"
                      title="Reset to Auto-detect"
                    >
                      Reset
                    </button>
                  )}
                </div>
                {deviceSaveMessage && (
                  <p className="text-[11px] text-emerald-700 font-bold">{deviceSaveMessage}</p>
                )}
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
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                  {editingStaffId ? 'New Password (Leave blank to keep unchanged)' : 'Login Password *'}
                </label>
                <input
                  type="password"
                  placeholder={editingStaffId ? '••••••••' : 'Enter login password'}
                  value={staffFormData.password}
                  onChange={e => setStaffFormData({ ...staffFormData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
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
                onClick={() => setIsSettingsAuthModalOpen(false)}
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
                  onClick={() => setIsSettingsAuthModalOpen(false)}
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
                <label className="block text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                  New Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter new password (min 4 characters)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
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
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Issue Time (IST)</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Pass Number</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Holder Name</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Phone</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Allowed</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Validity</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'left' }}>Mode</th>
                <th style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(selectedReport === 'monthly-generate-pass' ? monthlyGeneratePassData : yearlyGeneratePassData).map(ps => (
                <tr key={ps.id}>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{new Date(ps.created_at).toLocaleString('en-IN')}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.pass_number}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.holder_name}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.holder_phone || '—'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.people_allowed}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.valid_from} to {ps.valid_through}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px' }}>{ps.payment_method || 'CASH'}</td>
                  <td style={{ border: '1px solid #cbd5e1', padding: '6px', textAlign: 'right' }}>
                    ₹{((ps.amount_paise || (ps.pass_type === 'YEARLY' ? 310000 : 30000)) / 100).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
