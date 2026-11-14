import React, { useState } from 'react';
import type { AppConfig } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { Settings, Bluetooth, Database, Save, Check, X, ShieldAlert, Trash2, RefreshCcw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onConfigUpdated: (config: AppConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
}) => {
  const [formData, setFormData] = useState<AppConfig>(config);
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false);
  const [btStatus, setBtStatus] = useState<string>(printerService.isConnected ? 'Connected' : 'Not Connected');
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handlePairBluetooth = async () => {
    setIsBluetoothConnecting(true);
    try {
      const deviceName = await printerService.connectBluetooth();
      setBtStatus(`Connected: ${deviceName}`);
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
  };

  const [isResetting, setIsResetting] = useState(false);

  const handleResetAll = async () => {
    if (!window.confirm('⚠️ ARE YOU SURE?\n\nThis will permanently delete all tickets, passes, and entry logs from both Cloud Database and Local Storage.\n\nTicket numbering will restart from 000001.')) {
      return;
    }

    setIsResetting(true);
    try {
      await dbService.resetAllDatabaseAndLocal();
      alert('✅ Database fully wiped! Ticket sequence restarted from 000001.');
      window.location.reload();
    } catch {
      alert('Error resetting database');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    dbService.saveConfig(formData);
    onConfigUpdated(formData);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">System & Hardware Settings</h2>
              <p className="text-xs text-slate-400">Configure Thermal Printer, Supabase vup Schema & Gate Codes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Bluetooth Thermal Printer */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-white">Bluetooth Thermal Printer</h3>
              </div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                printerService.isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                {btStatus}
              </span>
            </div>
            
            <p className="text-xs text-slate-400">
              Connect directly from Chrome (Android mobile or Desktop) to your wireless thermal printer.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isBluetoothConnecting}
                onClick={handlePairBluetooth}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
              >
                <Bluetooth className="w-4 h-4" />
                {isBluetoothConnecting ? 'Searching Devices...' : 'Pair Bluetooth Printer'}
              </button>

              {printerService.isConnected && (
                <button
                  type="button"
                  onClick={handleDisconnectBluetooth}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-red-400 rounded-xl text-xs font-bold transition"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>

          {/* Supabase Free DB */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Supabase PostgreSQL (vup Schema)</h3>
            </div>
            <p className="text-xs text-slate-400">
              Enter your Supabase Project URL and Anon/Public Key to sync with <code>vup.*</code> database tables.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  placeholder="https://xyz.supabase.co"
                  value={formData.supabaseUrl}
                  onChange={e => setFormData({ ...formData, supabaseUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Supabase Anon Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={formData.supabaseAnonKey}
                  onChange={e => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Park & Hardware Settings */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              vup.park_settings & Hardware Identifiers
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Park Name (Fixed)
                </label>
                <input
                  type="text"
                  value={formData.park_settings.park_name}
                  onChange={e => setFormData({
                    ...formData,
                    park_settings: { ...formData.park_settings, park_name: e.target.value }
                  })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Organization (Fixed)
                </label>
                <input
                  type="text"
                  value={formData.park_settings.organization_name}
                  onChange={e => setFormData({
                    ...formData,
                    park_settings: { ...formData.park_settings, organization_name: e.target.value }
                  })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Address (Fixed)
                </label>
                <input
                  type="text"
                  value={formData.park_settings.address}
                  onChange={e => setFormData({
                    ...formData,
                    park_settings: { ...formData.park_settings, address: e.target.value }
                  })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Printing Width (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.park_settings.printing_width_mm}
                  readOnly
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Max Persons Per Ticket
                </label>
                <input
                  type="number"
                  value={formData.park_settings.max_persons_per_ticket}
                  onChange={e => setFormData({
                    ...formData,
                    park_settings: { ...formData.park_settings, max_persons_per_ticket: parseInt(e.target.value) || 20 }
                  })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-emerald-400 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Active Counter Code
                </label>
                <input
                  type="text"
                  value={formData.counter_code}
                  onChange={e => setFormData({ ...formData, counter_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Active Gate Code
                </label>
                <input
                  type="text"
                  value={formData.gate_code}
                  onChange={e => setFormData({ ...formData, gate_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Official Pricing Master Card */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">₹</span>
                Official Pricing Master (Gazette Approved)
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">
                Active Rates
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Single Ticket</div>
                <div className="text-lg font-black text-emerald-400 mt-0.5">₹10</div>
                <div className="text-[10px] text-slate-500">Per Person / Entry</div>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Monthly Pass</div>
                <div className="text-lg font-black text-blue-400 mt-0.5">₹300 / ₹600 / ₹900</div>
                <div className="text-[10px] text-slate-500">1 Mo / 2 Mo / 3 Mo Validity</div>
              </div>

              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Yearly Pass</div>
                <div className="text-lg font-black text-purple-400 mt-0.5">₹3,100</div>
                <div className="text-[10px] text-slate-500">365 Days Validity</div>
              </div>
            </div>
          </div>

          {/* Danger Zone: Full Database & Sequence Wipe */}
          <div className="bg-red-950/30 border border-red-900/60 p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs">
                <Trash2 className="w-4 h-4" />
                <span>Reset Full Database & Ticket Sequence</span>
              </div>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetAll}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
              >
                {isResetting ? (
                  <>
                    <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                    Wiping Database...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Clean & Restart from #000001
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-red-300/80">
              Permanently wipes all issued tickets, passes, and gate scan logs. Next ticket printed will be <strong>VUP-T-YYYYMMDD-000001</strong>.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              {isSaved ? (
                <>
                  <Check className="w-4 h-4" /> Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Settings
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
