import React, { useState, useEffect, useMemo } from 'react';
import type { Ticket, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { Users, Printer, QrCode, RefreshCw, Clock, Banknote, Smartphone, FileText, Search, X } from 'lucide-react';
import { LOGO_URL } from '../assets/logo';
import { isSameIstDay } from '../lib/dateUtils';

interface TicketPOSProps {
  config: AppConfig;
  onTicketGenerated: (ticket: Ticket) => void;
}

export const TicketPOS: React.FC<TicketPOSProps> = ({ config, onTicketGenerated }) => {
  const [persons, setPersons] = useState<number>(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [recentTickets, setRecentTickets] = useState<Ticket[]>([]);
  const [allTodayTickets, setAllTodayTickets] = useState<Ticket[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [ticketSearch, setTicketSearch] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'UPI'>('ALL');
  const [reprintToast, setReprintToast] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [shiftSummary, setShiftSummary] = useState(() => dbService.getTodayTicketSummary());
  const [pricingRates, setPricingRates] = useState(() => dbService.getPricingRates());

  const unitRateInr = pricingRates.ticket_rate_inr; // Dynamic rate from Admin settings
  const totalAmountInr = persons * unitRateInr;

  const refreshTickets = async () => {
    try {
      const tickets = await dbService.fetchRecentTickets(200);
      const todayOnly = tickets.filter(t => isSameIstDay(t.created_at));
      setAllTodayTickets(todayOnly);
      setRecentTickets(todayOnly.slice(0, 20));
    } catch {
      const local = dbService.getLocalTickets();
      const todayOnly = local.filter(t => isSameIstDay(t.created_at));
      setAllTodayTickets(todayOnly);
      setRecentTickets(todayOnly.slice(0, 20));
    }
  };

  const refreshSummary = async () => {
    try {
      const summary = await dbService.fetchTodayTicketSummary();
      setShiftSummary(summary);
    } catch {
      setShiftSummary(dbService.getTodayTicketSummary());
    }
  };

  // Real-time IST clock update & periodic summary, ticket sync and dynamic pricing update
  useEffect(() => {
    refreshTickets();
    refreshSummary();
    setPricingRates(dbService.getPricingRates());

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const summaryTimer = setInterval(() => {
      refreshSummary();
      refreshTickets();
      setPricingRates(dbService.getPricingRates());
    }, 3000);

    return () => {
      clearInterval(timer);
      clearInterval(summaryTimer);
    };
  }, []);

  const quickPersons = [1, 2, 3, 4, 5, 6, 8, 10];

  const handleGenerateAndPrint = async () => {
    if (persons < 1 || isGenerating) return;

    setIsGenerating(true);
    try {
      const ticket = await dbService.issueTicket({
        persons_count: persons,
        payment_method: paymentMode,
      });

      setRecentTickets(prev => [ticket, ...prev.slice(0, 19)]);
      onTicketGenerated(ticket);
      refreshSummary();

      // Trigger Print
      if (printerService.isConnected) {
        await printerService.printViaBluetooth(ticket, config);
      } else {
        setTimeout(() => {
          printerService.printViaBrowser();
        }, 100);
      }

      // Reset to 1 for the next visitor in queue
      setPersons(1);
    } catch (err) {
      console.error('Failed to issue ticket:', err);
      alert('Error generating ticket. Please check printer connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReprint = async (ticket: Ticket) => {
    onTicketGenerated(ticket);
    setReprintToast(`🖨️ Re-printing Ticket ${ticket.ticket_number}...`);
    if (printerService.isConnected) {
      await printerService.printViaBluetooth(ticket, config);
    } else {
      setTimeout(() => {
        printerService.printViaBrowser();
      }, 100);
    }
    setTimeout(() => {
      setReprintToast(null);
    }, 3000);
  };

  const filteredReportTickets = useMemo(() => {
    return allTodayTickets.filter(tk => {
      const q = ticketSearch.toLowerCase().trim();
      const matchesSearch = !q ||
        tk.ticket_number.toLowerCase().includes(q) ||
        String(tk.persons_count).includes(q) ||
        String((tk.price_paise || tk.persons_count * 1000) / 100).includes(q);

      const matchesPayment = paymentFilter === 'ALL' || tk.payment_method === paymentFilter;
      return matchesSearch && matchesPayment;
    });
  }, [allTodayTickets, ticketSearch, paymentFilter]);

  return (
    <div className="max-w-[1440px] xl:max-w-[1560px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 lg:gap-5 items-stretch">
      {/* Left Column: POS Generation */}
      <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
        {/* Compact Header Banner with Official Logo */}
        <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/60 rounded-2xl px-4 py-2.5 sm:py-3 shadow-md shadow-emerald-950/10 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-2.5 relative overflow-hidden group shrink-0">
          <div className="flex items-center gap-3 text-center sm:text-left relative z-10">
            <div className="relative shrink-0">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />
              <img
                src={LOGO_URL}
                alt="Ved Upvan Park Logo"
                className="relative w-10 h-10 object-contain rounded-xl border border-white/80 bg-white p-0.5 shadow-xs shrink-0"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                  {config.park_settings.park_name}
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] font-black uppercase tracking-wider shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  {config.counter_code}
                </span>
              </div>
              <p className="text-emerald-800 text-[10px] sm:text-[11px] font-bold tracking-tight">
                {config.park_settings.organization_name} • Sirsaganj, Firozabad
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative z-10">
            <div className="bg-slate-900 text-white border border-slate-700/80 px-3 py-1 rounded-xl text-center sm:text-right shadow-xs space-y-0.5">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Current Time (IST)</span>
              </div>
              <div className="text-sm font-mono font-black text-white tracking-wider leading-none">
                {currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/30"
              title="Open Ticket Generate Report"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          </div>
        </div>

        {/* Main POS Card: Persons, Pay Mode, and Print in One Compact View */}
        <div className="bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/60 rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-950/15 backdrop-blur-xl flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-3">
            {/* Step 1: Select Persons Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Users className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight">
                    1. Select Number of Persons
                  </h2>
                </div>
              </div>
              <div className="text-[11px] bg-emerald-50 text-emerald-800 font-black px-2.5 py-0.5 rounded-lg border border-emerald-200/80 shadow-2xs flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Rate: ₹{unitRateInr.toFixed(0)} / person
              </div>
            </div>

            {/* Quick Touch Buttons */}
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 sm:gap-2.5">
              {quickPersons.map(count => {
                const isSelected = persons === count;
                const cost = count * unitRateInr;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setPersons(count)}
                    className={`py-2.5 sm:py-3.5 px-2 rounded-xl flex flex-col items-center justify-center transition-all duration-150 transform cursor-pointer relative overflow-hidden group ${
                      isSelected
                        ? 'bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/35 ring-2 ring-emerald-400 scale-[1.03] border-0'
                        : 'bg-white hover:bg-emerald-50/70 text-slate-800 border border-slate-200/90 hover:border-emerald-300 shadow-2xs hover:scale-[1.01]'
                    }`}
                  >
                    <span className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${isSelected ? 'text-white' : 'text-slate-900 group-hover:text-emerald-700'}`}>
                      {count}
                    </span>
                    <span className={`text-[11px] font-black px-1.5 py-0.5 rounded-full mt-1.5 transition ${
                      isSelected 
                        ? 'bg-white/25 text-white' 
                        : 'bg-slate-100 text-slate-600 group-hover:bg-emerald-100 group-hover:text-emerald-800'
                    }`}>
                      ₹{cost}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Person Count Box (Enlarged, Touch-Friendly & High-Visibility) */}
            <div className="bg-gradient-to-r from-emerald-50/80 via-white to-teal-50/80 p-3 sm:p-4 rounded-2xl border-2 border-emerald-300 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span>Custom Person Count</span>
                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300/60">
                      Group Entry
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                    Type count directly or use large − / + buttons
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPersons(Math.max(1, persons - 1))}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white hover:bg-emerald-600 text-slate-800 hover:text-white text-2xl font-black active:scale-90 transition border-2 border-slate-300 hover:border-emerald-600 shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                  title="Decrease person count"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={100}
                  placeholder="1"
                  value={persons === 0 ? '' : persons}
                  onClick={() => setPersons(0)}
                  onFocus={() => setPersons(0)}
                  onBlur={() => {
                    if (persons < 1) setPersons(1);
                  }}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                    setPersons(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                  }}
                  className="w-20 sm:w-24 h-12 sm:h-14 text-center bg-white border-2 border-emerald-500 rounded-xl text-2xl sm:text-3xl font-black text-emerald-950 focus:outline-none focus:ring-4 focus:ring-emerald-500/25 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setPersons(persons + 1)}
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white hover:bg-emerald-600 text-slate-800 hover:text-white text-2xl font-black active:scale-90 transition border-2 border-slate-300 hover:border-emerald-600 shadow-sm cursor-pointer flex items-center justify-center shrink-0"
                  title="Increase person count"
                >
                  +
                </button>
              </div>
            </div>

            {/* Step 2: Payment Mode */}
            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Select Payment Mode</span>
                </label>
                <span className="text-[10px] text-slate-400 font-medium">Cash or Instant UPI</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-2 px-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer ${
                    paymentMode === 'CASH'
                      ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-2xs'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span className="text-xs sm:text-sm">1. Cash Payment</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-2 px-3 rounded-xl font-black flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer ${
                    paymentMode === 'UPI'
                      ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-400'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-2xs'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span className="text-xs sm:text-sm">2. Digital UPI</span>
                </button>
              </div>
            </div>
          </div>

          {/* Step 3: Total & Big Print Button Hero Bar */}
          <div className="pt-2">
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-600 to-teal-600 text-white p-3.5 sm:p-4 rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-between gap-3 relative overflow-hidden">
              <div className="relative z-10 min-w-0">
                <div className="text-[10px] text-emerald-200 font-black uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  TOTAL PAYABLE AMOUNT
                </div>
                <div className="text-2xl sm:text-4xl font-black flex items-baseline gap-2 mt-0.5 tracking-tight truncate">
                  <span className="drop-shadow-xs">₹{totalAmountInr.toFixed(2)}</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-100/90 whitespace-nowrap">
                    ({persons} {persons === 1 ? 'Person' : 'Persons'})
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateAndPrint}
                className="px-6 sm:px-8 py-3 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-900 font-black text-sm sm:text-base rounded-xl shadow-lg shadow-black/25 flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 cursor-pointer relative z-10 shrink-0 group"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-emerald-700" />
                    <span>Printing...</span>
                  </>
                ) : (
                  <>
                    <div className="p-1 rounded-lg bg-emerald-100 group-hover:bg-emerald-200 transition">
                      <Printer className="w-5 h-5 text-emerald-800" />
                    </div>
                    <span>PRINT TICKET</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Shift Report & Recent Tickets */}
      <div className="lg:col-span-4 flex flex-col justify-between space-y-3">
        {/* Live Counter Report Card */}
        <div className="bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/60 rounded-2xl p-3.5 sm:p-4 shadow-md shadow-emerald-950/10 backdrop-blur-xl space-y-3 shrink-0">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-xs" />
              <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-wider">
                Today's Counter Report
              </h3>
            </div>
            <span className="text-[10px] bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black px-2.5 py-0.5 rounded-full shadow-2xs tracking-wider">
              LIVE SHIFT
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tickets Issued</div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight flex items-baseline gap-1">
                <span>{shiftSummary.totalTickets}</span>
                <span className="text-xs font-bold text-slate-400">Tkts</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-50/60 to-teal-50/70 p-2.5 rounded-xl border border-emerald-200/90 shadow-2xs">
              <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Visitors</div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-800 mt-0.5 tracking-tight flex items-baseline gap-1">
                <span>{shiftSummary.totalPersons}</span>
                <span className="text-xs font-bold text-emerald-600">Persons</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-50/80 via-teal-50/50 to-emerald-50/80 p-3 rounded-xl border border-emerald-200/90 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-wider text-[11px] font-black text-emerald-950">Total Shift Revenue</span>
              <span className="text-emerald-950 font-black text-lg sm:text-xl tracking-tight">₹{shiftSummary.totalAmount.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200/80">
              <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-emerald-300/80 shadow-2xs flex items-center justify-between gap-1.5">
                <span className="font-extrabold text-slate-700 flex items-center gap-1.5 text-xs">
                  <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Cash:</span>
                </span>
                <span className="font-black text-emerald-900 text-sm sm:text-base tracking-tight">
                  ₹{shiftSummary.cashAmount.toFixed(0)}
                </span>
              </div>

              <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-blue-300/80 shadow-2xs flex items-center justify-between gap-1.5">
                <span className="font-extrabold text-slate-700 flex items-center gap-1.5 text-xs">
                  <QrCode className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>UPI:</span>
                </span>
                <span className="font-black text-blue-900 text-sm sm:text-base tracking-tight">
                  ₹{shiftSummary.upiAmount.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Tickets History Card (Strictly fixed height with internal scroller only - page never expands) */}
        <div className="bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/60 rounded-2xl p-3.5 sm:p-4 shadow-md shadow-emerald-950/10 backdrop-blur-xl flex flex-col justify-between space-y-2.5 shrink-0">
          <div className="flex items-center justify-between text-xs font-black text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span>Recent Tickets</span>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70">
                {recentTickets.length}
              </span>
              <button
                type="button"
                onClick={() => { refreshTickets(); refreshSummary(); }}
                className="p-1 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                title="Sync tickets with Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Re-Print</span>
          </div>

          {/* Fixed-Height Scroller: strictly 205px. When >4 tickets exist, ONLY this box scrolls */}
          <div className="space-y-2 h-[195px] sm:h-[205px] overflow-y-auto custom-scrollbar pr-1.5 shrink-0">
            {recentTickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center font-medium">No tickets issued yet today.</p>
            ) : (
              recentTickets.map(tk => (
                <div
                  key={tk.id}
                  className="flex items-center justify-between bg-white hover:bg-emerald-50/40 p-2 sm:p-2.5 rounded-xl border border-slate-200/90 hover:border-emerald-300 transition-all duration-150 gap-2 shadow-2xs group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-emerald-800 tracking-tight whitespace-nowrap text-xs">
                        {tk.ticket_number}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider ${
                        tk.payment_method === 'UPI' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {tk.payment_method || 'CASH'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold whitespace-nowrap truncate mt-0.5">
                      {tk.persons_count} {tk.persons_count === 1 ? 'Person' : 'Persons'} • <span className="font-bold text-slate-800">₹{((tk.price_paise || tk.persons_count * 1000) / 100).toFixed(0)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReprint(tk)}
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-emerald-600 text-slate-600 hover:text-white rounded-lg border border-slate-200 hover:border-emerald-600 transition shadow-2xs cursor-pointer shrink-0 flex items-center gap-1 text-[11px] font-bold"
                    title={`Re-print Ticket ${tk.ticket_number}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Print</span>
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsReportModalOpen(true)}
            className="w-full py-2 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Full Report & Re-Print ({allTodayTickets.length})</span>
          </button>
        </div>
      </div>

      {/* Floating Re-Print Toast Notification */}
      {reprintToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200 text-sm font-semibold">
          <Printer className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>{reprintToast}</span>
        </div>
      )}

      {/* Full Ticket Generate Report & Direct Re-Print Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl border border-white/20">
                  <FileText className="w-6 h-6 text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    Ticket Generate Report & Direct Re-Print
                  </h2>
                  <p className="text-xs text-emerald-200 font-medium">
                    {config.park_settings.park_name} • Counter Code: {config.counter_code}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Filters & Stats Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Tickets</span>
                  <span className="text-base font-black text-slate-900">{allTodayTickets.length}</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Total Visitors</span>
                  <span className="text-base font-black text-emerald-700">
                    {allTodayTickets.reduce((sum, t) => sum + (t.persons_count || 1), 0)} Persons
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">Cash Collected</span>
                  <span className="text-base font-black text-slate-900">
                    ₹{(allTodayTickets.filter(t => t.payment_method === 'CASH').reduce((sum, t) => sum + (t.price_paise || t.persons_count * 1000), 0) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-slate-400 block text-[10px] font-bold uppercase">UPI Collected</span>
                  <span className="text-base font-black text-blue-700">
                    ₹{(allTodayTickets.filter(t => t.payment_method === 'UPI').reduce((sum, t) => sum + (t.price_paise || t.persons_count * 1000), 0) / 100).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Search & Mode Filters */}
              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Search by Ticket # (e.g. 000015), person count, or amount..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  {ticketSearch && (
                    <button
                      onClick={() => setTicketSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-xl text-xs w-full sm:w-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      paymentFilter === 'ALL'
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    All ({allTodayTickets.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('CASH')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                      paymentFilter === 'CASH'
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentFilter('UPI')}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1 ${
                      paymentFilter === 'UPI'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-blue-800 hover:bg-blue-50'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {filteredReportTickets.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
                  <p className="font-semibold text-sm">No tickets found</p>
                  <p className="text-xs text-slate-400 mt-1">Try changing your search terms or filters.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Ticket Number</th>
                        <th className="py-2.5 px-3">Issued Time</th>
                        <th className="py-2.5 px-3">Persons</th>
                        <th className="py-2.5 px-3">Amount</th>
                        <th className="py-2.5 px-3">Payment</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Re-Print</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredReportTickets.map((tk, idx) => {
                        const price = (tk.price_paise || (tk.persons_count * 1000)) / 100;
                        const dateObj = new Date(tk.issued_at || (tk as any).created_at || Date.now());
                        const timeStr = dateObj.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        });
                        const isScanned = !!tk.used_at || tk.status === 'USED';

                        return (
                          <tr key={tk.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              {tk.ticket_number}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                              {timeStr}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-800">
                              {tk.persons_count} Person{tk.persons_count > 1 ? 's' : ''}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-emerald-800">
                              ₹{price.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                tk.payment_method === 'UPI'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {tk.payment_method || 'CASH'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isScanned
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {isScanned ? 'SCANNED' : 'ACTIVE'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleReprint(tk)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs hover:shadow active:scale-95 cursor-pointer"
                                title="Re-Print Ticket"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Re-Print</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
              <span className="font-medium">
                Showing {filteredReportTickets.length} of {allTodayTickets.length} tickets
              </span>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition cursor-pointer"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
