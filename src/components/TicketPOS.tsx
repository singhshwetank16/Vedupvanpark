import React, { useState, useEffect, useMemo } from 'react';
import type { Ticket, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { Users, Printer, QrCode, RefreshCw, Clock, Banknote, Smartphone, FileText, Search, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { LOGO_URL } from '../assets/logo';

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
      const tickets = await dbService.fetchRecentTickets(100);
      setAllTodayTickets(tickets);
      setRecentTickets(tickets.slice(0, 5));
    } catch {
      const local = dbService.getLocalTickets();
      setAllTodayTickets(local);
      setRecentTickets(local.slice(0, 5));
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

      setRecentTickets(prev => [ticket, ...prev.slice(0, 4)]);
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
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 p-2.5 sm:p-4">
      {/* Left Column: POS Generation */}
      <div className="lg:col-span-8 space-y-4 sm:space-y-5">
        {/* Header Banner with Official Logo */}
        <div className="bg-white border border-emerald-100 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4 text-center sm:text-left">
            <img
              src={LOGO_URL}
              alt="Ved Upvan Park Logo"
              className="w-12 h-12 sm:w-16 sm:h-16 object-contain rounded-2xl border border-emerald-50 bg-emerald-50/50 p-1 shrink-0"
            />
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] sm:text-[11px] font-bold uppercase mb-0.5 sm:mb-1">
                Ticket Counter POS • {config.counter_code}
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {config.park_settings.park_name}
              </h1>
              <p className="text-emerald-700 text-[11px] sm:text-xs font-bold">
                {config.park_settings.organization_name} • {config.park_settings.address}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl text-center sm:text-right shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 font-semibold justify-center sm:justify-end">
              <Clock className="w-3.5 h-3.5 text-emerald-600" />
              <span>Current Time (IST)</span>
            </div>
            <div className="text-lg sm:text-xl font-mono font-bold text-slate-900">
              {currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[10px] sm:text-[11px] font-medium text-slate-500">
              {currentTime.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="mt-2 w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              title="Open Ticket Generate Report"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate Report</span>
            </button>
          </div>
        </div>

        {/* Step 1: Select Persons */}
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 sm:space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                1. Select Number of Persons
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Quickly tap the number of persons for this ticket
              </p>
            </div>
            <div className="text-xs bg-emerald-50 text-emerald-800 font-bold px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border border-emerald-200 shrink-0">
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
                  className={`py-2.5 sm:py-3.5 px-1 sm:px-2 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center transition-all duration-150 transform active:scale-95 border cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 scale-[1.04]'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                  }`}
                >
                  <span className="text-lg sm:text-xl font-black">{count}</span>
                  <span className={`text-[10px] font-bold ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                    ₹{cost}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Stepper for custom person count */}
          <div className="flex items-center justify-between bg-slate-50 p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">
              Custom Person Count:
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => setPersons(Math.max(1, persons - 1))}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white text-slate-800 text-lg font-bold hover:bg-slate-100 active:scale-90 transition border border-slate-300 shadow-sm cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={50}
                placeholder="1"
                value={persons === 0 ? '' : persons}
                onClick={() => setPersons(0)}
                onFocus={() => setPersons(0)}
                onBlur={() => {
                  if (persons < 1) setPersons(1);
                }}
                onChange={e => {
                  const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                  setPersons(isNaN(val) ? 0 : Math.min(50, Math.max(0, val)));
                }}
                className="w-16 sm:w-20 text-center py-1.5 sm:py-2 bg-white border border-slate-300 rounded-xl text-lg sm:text-xl font-black text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setPersons(persons + 1)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white text-slate-800 text-lg font-bold hover:bg-slate-100 active:scale-90 transition border border-slate-300 shadow-sm cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Step 2: Payment Mode */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700">
              2. Payment Mode
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setPaymentMode('CASH')}
                className={`py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl font-black flex items-center justify-center gap-2 sm:gap-2.5 border text-sm sm:text-base transition cursor-pointer ${
                  paymentMode === 'CASH'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-600/30'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Banknote className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>1. Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMode('UPI')}
                className={`py-3 sm:py-3.5 px-3 sm:px-4 rounded-xl sm:rounded-2xl font-black flex items-center justify-center gap-2 sm:gap-2.5 border text-sm sm:text-base transition cursor-pointer ${
                  paymentMode === 'UPI'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-600/30'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <QrCode className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>2. UPI</span>
              </button>
            </div>

            {/* Dynamic Customer UPI QR Box when UPI is selected */}
            {paymentMode === 'UPI' && (
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 transition-all duration-200">
                <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-sm shrink-0">
                  <QRCodeSVG
                    value={`upi://pay?pa=vedupvan@upi&pn=Ved%20Upvan%20Park&am=${totalAmountInr}&cu=INR&tn=Park%20Ticket%20${persons}%20Persons`}
                    size={80}
                    level="M"
                  />
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <div className="text-xs font-black text-emerald-900 uppercase tracking-wide flex items-center justify-center sm:justify-start gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    Customer Scan & Pay: ₹{totalAmountInr.toFixed(2)}
                  </div>
                  <p className="text-xs text-slate-700">
                    Ask customer to scan this QR code with <strong>Google Pay, PhonePe, Paytm, or BHIM</strong>.
                  </p>
                  <div className="text-[11px] text-emerald-800 font-semibold">
                    Amount: ₹{totalAmountInr.toFixed(2)} • Persons: {persons}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Big Print Button */}
          <div className="pt-2 sm:pt-3">
            <div className="bg-gradient-to-r from-emerald-700 to-green-600 text-white p-4 sm:p-5 rounded-xl sm:rounded-2xl shadow-lg shadow-emerald-700/20 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
              <div className="text-center sm:text-left">
                <div className="text-[10px] sm:text-xs text-emerald-100 font-bold uppercase tracking-wider">
                  Total Payable Amount
                </div>
                <div className="text-2xl sm:text-4xl font-black flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                  <span>₹{totalAmountInr.toFixed(2)}</span>
                  <span className="text-xs sm:text-sm font-semibold text-emerald-100">
                    ({persons} {persons === 1 ? 'Person' : 'Persons'})
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGenerateAndPrint}
                className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-800 font-black text-base sm:text-lg rounded-xl sm:rounded-2xl shadow-md flex items-center justify-center gap-2.5 sm:gap-3 transition disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Generating Ticket...
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-700" />
                    PRINT TICKET
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Shift Report, Receipt Preview & History */}
      <div className="lg:col-span-4 space-y-4 sm:space-y-5">
        {/* Live Counter Report Card: Tickets, Persons & Collection with Pay Mode */}
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Today's Counter Report
              </h3>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
              LIVE SHIFT
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200">
              <div className="text-[10px] sm:text-[11px] font-bold text-slate-500">Tickets Issued</div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
                {shiftSummary.totalTickets} <span className="text-xs font-semibold text-slate-400">Tkts</span>
              </div>
            </div>

            <div className="bg-slate-50 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200">
              <div className="text-[10px] sm:text-[11px] font-bold text-slate-500">Total Visitors</div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5">
                {shiftSummary.totalPersons} <span className="text-xs font-semibold text-emerald-600">Persons</span>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50/70 p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border border-emerald-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span>Collection with Pay Mode</span>
              <span className="text-emerald-800 font-black text-sm sm:text-base">₹{shiftSummary.totalAmount.toFixed(2)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/60">
              <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-emerald-200 text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1 text-[11px]">
                  <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cash:
                </span>
                <span className="font-black text-emerald-800">₹{shiftSummary.cashAmount.toFixed(0)}</span>
              </div>

              <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-blue-200 text-xs">
                <span className="font-bold text-slate-600 flex items-center gap-1 text-[11px]">
                  <QrCode className="w-3.5 h-3.5 text-blue-600" /> UPI:
                </span>
                <span className="font-black text-blue-800">₹{shiftSummary.upiAmount.toFixed(0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Tickets History */}
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <span>Recent Counter Tickets</span>
              <button
                type="button"
                onClick={() => { refreshTickets(); refreshSummary(); }}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                title="Sync tickets with Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">Re-Print</span>
          </div>

          <div className="space-y-2">
            {recentTickets.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No recent tickets generated today.</p>
            ) : (
              recentTickets.map(tk => (
                <div
                  key={tk.id}
                  className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs hover:border-slate-300 transition gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-emerald-800 whitespace-nowrap truncate">{tk.ticket_number}</div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap truncate">
                      {tk.persons_count} Person(s) • ₹{(tk.price_paise / 100).toFixed(2)} ({tk.payment_method || 'CASH'})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReprint(tk)}
                    className="p-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition border border-slate-200 shadow-sm shrink-0 cursor-pointer"
                    title="Re-Print Ticket"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setIsReportModalOpen(true)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>View Full Generate Report & Re-Print ({allTodayTickets.length})</span>
            </button>
          </div>
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
