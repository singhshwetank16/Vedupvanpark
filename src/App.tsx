import { useState, useEffect } from 'react';
import type { AppConfig, Ticket, Pass, AuthStaff } from './types';
import { dbService } from './lib/supabase';
import { Navbar } from './components/Navbar';
import { TicketPOS } from './components/TicketPOS';
import { PassManager } from './components/PassManager';
import { GateScanner } from './components/GateScanner';
import { LogsDashboard } from './components/LogsDashboard';
import { PrintTicketView } from './components/PrintTicketView';
import { SettingsModal } from './components/SettingsModal';
import { LoginView } from './components/LoginView';
import { NatureBackground } from './components/NatureBackground';
import { PromotionalTicker } from './components/PromotionalTicker';
import { Ticket as TicketIcon, CreditCard, Camera, BarChart3 } from 'lucide-react';

export function App() {
  const [staff, setStaff] = useState<AuthStaff | null>(() => dbService.getCurrentStaff());
  const [config, setConfig] = useState<AppConfig>(() => dbService.getConfig());
  const [documentToPrint, setDocumentToPrint] = useState<Ticket | Pass | null>(() => {
    const localTickets = dbService.getLocalTickets();
    return localTickets.length > 0 ? localTickets[0] : null;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Set initial tab based on role
  const getDefaultTabForRole = (role?: string): 'counter' | 'passes' | 'scanner' | 'logs' => {
    if (role === 'GATE') return 'scanner';
    if (role === 'SUPER_ADMIN') return 'logs';
    return 'counter';
  };

  const [activeTab, setActiveTab] = useState<'counter' | 'passes' | 'scanner' | 'logs'>(() =>
    getDefaultTabForRole(staff?.role)
  );

  useEffect(() => {
    setConfig(dbService.getConfig());
    // One-time clear of legacy mock logs to start fresh with clean real-time logs
    if (!localStorage.getItem('vup_audit_logs_v2_clean')) {
      dbService.clearAllAuditLogs();
      localStorage.setItem('vup_audit_logs_v2_clean', 'true');
    }
    dbService.syncAllWithCloud().then(({ ticketsCount }) => {
      if (ticketsCount === 0) {
        setDocumentToPrint(null);
      }
    });
  }, []);

  const handleLoginSuccess = (authenticatedStaff: AuthStaff) => {
    setStaff(authenticatedStaff);
    setActiveTab(getDefaultTabForRole(authenticatedStaff.role));
  };

  const handleLogout = () => {
    dbService.logoutStaff();
    setStaff(null);
  };

  const handleDocumentGenerated = (doc: Ticket | Pass) => {
    setDocumentToPrint(doc);
  };

  useEffect(() => {
    if (config.park_settings?.enable_passes === false && activeTab === 'passes') {
      setActiveTab('counter');
    }
  }, [config.park_settings?.enable_passes, activeTab]);

  // If not logged in, show dedicated 3-Role Login screen
  if (!staff) {
    return (
      <div className="relative min-h-screen">
        <LoginView onLoginSuccess={handleLoginSuccess} />
        <PromotionalTicker className="bottom-0" />
      </div>
    );
  }

  const role = staff.role;
  const isAdmin = role === 'SUPER_ADMIN';
  const isCounter = role === 'COUNTER' || isAdmin;
  const isGate = role === 'GATE' || isAdmin;

  return (
    <div className="min-h-screen bg-[#031d16] text-slate-100 flex flex-col relative selection:bg-emerald-500 selection:text-slate-950">
      {/* Living Park Nature & Greenery Animated Background (Animals, Leaves, Birds, Flora) */}
      <NatureBackground />

      {/* 3-Inch (76.20mm) Thermal Slip Print Output */}
      <PrintTicketView document={documentToPrint} config={config} />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top Navbar with Role-Restricted Tabs & User Badge */}
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          config={config}
          staff={staff}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLogout={handleLogout}
        />

        {/* Main Workspace Body: Desktop locked to viewport, content aligned to top below navbar */}
        <main className={`flex-1 no-print ${
          activeTab === 'counter' || activeTab === 'passes'
            ? 'h-[calc(100vh-4rem)] md:overflow-hidden overflow-y-auto flex flex-col justify-start px-3 sm:px-6 lg:px-8 pt-2 sm:pt-3 pb-2'
            : 'pb-28 md:pb-16 pt-4'
        }`}>
          {/* Admin Dashboard */}
          {isAdmin && activeTab === 'logs' && (
            <LogsDashboard
              config={config}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onTicketGenerated={handleDocumentGenerated}
              onConfigUpdated={updated => setConfig(updated)}
            />
          )}

          {/* Counter POS */}
          {isCounter && activeTab === 'counter' && (
            <TicketPOS config={config} onTicketGenerated={handleDocumentGenerated} />
          )}

          {/* Passes Manager */}
          {isCounter && (config.park_settings?.enable_passes !== false) && activeTab === 'passes' && (
            <PassManager config={config} onTicketGenerated={handleDocumentGenerated} />
          )}

          {/* Gate Scanner */}
          {isGate && activeTab === 'scanner' && (
            <GateScanner config={config} />
          )}
        </main>

        {/* Mobile Bottom Navigation Bar (Filtered by Role) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 p-2 z-40 no-print flex items-center justify-around">
          {isAdmin && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold ${activeTab === 'logs' ? 'text-purple-400 bg-purple-500/10' : 'text-slate-400'
                }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>Admin</span>
            </button>
          )}

          {isCounter && (
            <>
              <button
                onClick={() => setActiveTab('counter')}
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold ${activeTab === 'counter' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
                  }`}
              >
                <TicketIcon className="w-5 h-5" />
                <span>Counter</span>
              </button>

              {config.park_settings?.enable_passes !== false && (
                <button
                  onClick={() => setActiveTab('passes')}
                  className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold ${activeTab === 'passes' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400'
                    }`}
                >
                  <CreditCard className="w-5 h-5" />
                  <span>Passes</span>
                </button>
              )}
            </>
          )}

          {isGate && (
            <button
              onClick={() => setActiveTab('scanner')}
              className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl text-[10px] font-bold ${activeTab === 'scanner' ? 'text-blue-400 bg-blue-500/10' : 'text-slate-400'
                }`}
            >
              <Camera className="w-5 h-5" />
              <span>Gate Scan</span>
            </button>
          )}
        </div>

        {/* Settings Modal (Accessible to configure hardware, park info, pricing & printer) */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={config}
          onConfigUpdated={updated => setConfig(updated)}
        />

        {/* Promotional Running Marquee Footer (Pure Project Me) */}
        <PromotionalTicker className="bottom-[52px] md:bottom-0" />
      </div>
    </div>
  );
}

export default App;
