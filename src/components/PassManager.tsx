import React, { useState, useEffect, useMemo } from 'react';
import type { Pass, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import {
  CreditCard,
  Calendar,
  Printer,
  CheckCircle2,
  ShieldCheck,
  UserCheck,
  Banknote,
  QrCode,
  Smartphone,
  User,
  Phone,
  RefreshCw,
  Sparkles,
  Clock
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { LOGO_URL } from '../assets/logo';

interface PassManagerProps {
  config: AppConfig;
  onTicketGenerated: (pass: Pass) => void;
}

export const PassManager: React.FC<PassManagerProps> = ({ config, onTicketGenerated }) => {
  const [passType, setPassType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [holderName, setHolderName] = useState('');
  const [holderPhone, setHolderPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('CASH');
  const [validityDays, setValidityDays] = useState(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [recentPasses, setRecentPasses] = useState<Pass[]>([]);
  const [pricingRates, setPricingRates] = useState(() => dbService.getPricingRates());

  // Dynamic base rate calculation from Admin settings:
  const baseRateInr = useMemo(() => {
    if (passType === 'YEARLY') {
      return pricingRates.yearly_pass_inr;
    }
    if (validityDays === 60) return pricingRates.monthly_pass_2m_inr;
    if (validityDays === 90) return pricingRates.monthly_pass_3m_inr;
    return pricingRates.monthly_pass_1m_inr;
  }, [passType, validityDays, pricingRates]);

  const totalAmountInr = baseRateInr;

  useEffect(() => {
    if (passType === 'MONTHLY') {
      setValidityDays(30);
    } else {
      setValidityDays(365);
    }
  }, [passType]);

  const loadPasses = async () => {
    try {
      const passes = await dbService.fetchRecentPasses(8);
      setRecentPasses(passes);
    } catch {
      const all = dbService.getLocalPasses();
      setRecentPasses(all.slice(0, 8));
    }
  };

  useEffect(() => {
    loadPasses();
    setPricingRates(dbService.getPricingRates());
    const interval = setInterval(() => {
      loadPasses();
      setPricingRates(dbService.getPricingRates());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleGeneratePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holderName.trim()) {
      alert('Please enter Pass Holder Name');
      return;
    }

    setIsGenerating(true);
    try {
      const pass = await dbService.issuePass({
        pass_type: passType,
        holder_name: holderName.trim(),
        holder_phone: holderPhone.trim() || undefined,
        people_allowed: 1,
        payment_method: paymentMode,
        duration_days: validityDays,
        price_paise: totalAmountInr * 100,
      });

      onTicketGenerated(pass);
      loadPasses();

      // Trigger Print
      if (printerService.isConnected) {
        await printerService.printViaBluetooth(pass, config);
      } else {
        setTimeout(() => {
          printerService.printViaBrowser();
        }, 100);
      }

      setHolderName('');
      setHolderPhone('');
      const durationLabel = passType === 'MONTHLY'
        ? (validityDays === 30 ? '1 Month (₹300)' : validityDays === 60 ? '2 Months (₹600)' : '3 Months (₹900)')
        : '1 Year (₹3,100)';
      alert(`Success! ${passType === 'MONTHLY' ? 'Monthly Pass' : 'Yearly Pass'} [${durationLabel}] issued and sent to printer.`);
    } catch (err) {
      console.error(err);
      alert('Failed to issue pass. Please check your connection.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReprint = (pass: Pass) => {
    onTicketGenerated(pass);
    if (printerService.isConnected) {
      printerService.printViaBluetooth(pass, config);
    } else {
      setTimeout(() => {
        printerService.printViaBrowser();
      }, 100);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-2.5 sm:p-4 space-y-4 sm:space-y-6">
      {/* Title Header with Logo & Mode Switcher */}
      <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-3xl p-4 sm:p-6 shadow-xl shadow-emerald-950/20 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4">
          <div className="relative group shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Logo"
              className="relative w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-2xl border border-white/80 p-1 bg-white shadow-xs"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200/60 text-emerald-900 text-[10px] sm:text-xs font-black uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
              <span>Pass & Subscription Desk</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Subscription Passes</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </h1>
            <p className="text-slate-500 text-[11px] sm:text-xs mt-0.5 font-medium">
              Issue Monthly (1, 2, 3 Months) & Yearly regular walker passes with instant thermal QR badge slips.
            </p>
          </div>
        </div>

        {/* Pass Type Switcher Tabs with Vibrant Gradients */}
        <div className="w-full sm:w-auto grid grid-cols-2 bg-slate-100/90 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs gap-1.5">
          <button
            type="button"
            onClick={() => setPassType('MONTHLY')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              passType === 'MONTHLY'
                ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>Monthly (₹300 - ₹900)</span>
          </button>
          <button
            type="button"
            onClick={() => setPassType('YEARLY')}
            className={`px-4 sm:px-5 py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              passType === 'YEARLY'
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>Yearly (₹3,100)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Pass Issuance Form */}
        <div className="lg:col-span-7 bg-gradient-to-br from-white via-white to-emerald-50/30 border border-white/70 rounded-3xl p-5 sm:p-7 shadow-xl shadow-emerald-950/20 backdrop-blur-xl">
          <form onSubmit={handleGeneratePass} className="space-y-5">
            {/* Header Badge */}
            <div className="flex items-center justify-between border-b border-emerald-950/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-sm">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 tracking-tight">
                    New {passType === 'YEARLY' ? 'Yearly Pass (1 Year)' : `Monthly Pass (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})`}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">Fill in applicant details to print membership pass slip</p>
                </div>
              </div>

              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                passType === 'YEARLY'
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              }`}>
                {passType}
              </span>
            </div>

            {/* Holder Full Name */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-700 font-black mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pass Holder Full Name *</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar Sharma"
                  value={holderName}
                  onChange={e => setHolderName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/90 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm shadow-2xs transition"
                />
              </div>
            </div>

            {/* Contact Mobile */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-700 font-black mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contact Mobile Number</span>
              </label>
              <input
                type="tel"
                placeholder="e.g. 98XXXXXXXX (Optional for SMS / Records)"
                value={holderPhone}
                onChange={e => setHolderPhone(e.target.value)}
                className="w-full px-4 py-3 bg-white/90 border border-slate-200 rounded-2xl text-slate-900 font-bold placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm shadow-2xs transition"
              />
            </div>

            {/* Validity Duration Quick Tap Chips */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-700 font-black mb-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Select Validity Duration</span>
              </label>

              {passType === 'MONTHLY' ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { days: 30, label: '1 Month', sub: '30 Days', price: '₹300' },
                    { days: 60, label: '2 Months', sub: '60 Days', price: '₹600' },
                    { days: 90, label: '3 Months', sub: '90 Days', price: '₹900' },
                  ].map(plan => {
                    const isSelected = validityDays === plan.days;
                    return (
                      <button
                        key={plan.days}
                        type="button"
                        onClick={() => setValidityDays(plan.days)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                            : 'bg-white hover:bg-emerald-50/50 border-slate-200 text-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <div className={`text-xs font-black ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                          {plan.label}
                        </div>
                        <div className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-slate-400'} mt-0.5`}>
                          {plan.sub}
                        </div>
                        <div className={`mt-1.5 text-xs font-black px-2 py-0.5 rounded-full inline-block ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-800'
                        }`}>
                          {plan.price}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-purple-500/10 border border-purple-200/80 rounded-2xl p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-xs">
                      1Y
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900">365 Days Regular Entry (Full Year)</div>
                      <div className="text-[10px] text-purple-700 font-semibold">Includes 2 entries/day for 1 person</div>
                    </div>
                  </div>
                  <span className="text-sm font-black text-purple-900 bg-white px-3 py-1 rounded-xl border border-purple-200 shadow-2xs">
                    ₹3,100.00
                  </span>
                </div>
              )}
            </div>

            {/* Payment Mode Selector */}
            <div className="space-y-3">
              <label className="block text-xs uppercase tracking-wider text-slate-700 font-black mb-1.5 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                <span>Payment Mode</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-3 px-4 rounded-2xl font-black text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMode === 'CASH'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-400/50'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>1. Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-3 px-4 rounded-2xl font-black text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    paymentMode === 'UPI'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-600 shadow-md shadow-blue-600/25 ring-2 ring-blue-400/50'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>2. UPI</span>
                </button>
              </div>

              {/* Dynamic Customer UPI QR Box when UPI is selected */}
              {paymentMode === 'UPI' && (
                <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/90 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 transition-all duration-200 shadow-sm">
                  <div className="p-2.5 bg-white rounded-2xl border border-blue-200 shadow-xs shrink-0">
                    <QRCodeSVG
                      value={`upi://pay?pa=vedupvan@upi&pn=Ved%20Upvan%20Park&am=${totalAmountInr}&cu=INR&tn=${passType}%20Pass%20Subscription`}
                      size={96}
                      level="M"
                    />
                  </div>
                  <div className="text-center sm:text-left space-y-1">
                    <div className="text-xs font-black text-blue-950 uppercase tracking-wide flex items-center justify-center sm:justify-start gap-1.5">
                      <Smartphone className="w-4 h-4 text-blue-700" />
                      <span>Scan & Pay Subscription: ₹{totalAmountInr.toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium">
                      Customer can scan using <strong>Google Pay, PhonePe, Paytm, or BHIM</strong> to complete payment.
                    </p>
                    <div className="text-[11px] text-blue-900 font-bold bg-white/80 px-2.5 py-0.5 rounded-full inline-block border border-blue-200/60">
                      Plan: {passType === 'MONTHLY' ? `Monthly Pass (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})` : 'Yearly Pass (1 Year)'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Total and Submit Hero Bar */}
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 p-4 sm:p-5 rounded-2xl sm:rounded-3xl shadow-lg border border-emerald-600/50 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
              <div className="text-center sm:text-left">
                <div className="text-[11px] uppercase tracking-wider text-emerald-200 font-extrabold">Total Subscription Fee</div>
                <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
                  ₹{totalAmountInr.toFixed(2)}
                </div>
                <div className="text-[10px] text-emerald-100 font-bold mt-0.5">
                  {passType === 'MONTHLY'
                    ? (validityDays === 30 ? '30 Days Validity' : validityDays === 60 ? '60 Days Validity' : '90 Days Validity')
                    : '365 Days Validity'}
                  {' • Single Person Allowed'}
                </div>
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full sm:w-auto px-7 py-3.5 bg-white hover:bg-emerald-50 active:scale-95 text-emerald-950 font-black rounded-2xl shadow-xl shadow-black/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 transition cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-700" />
                <span>{isGenerating ? 'Generating...' : 'Issue & Print Pass'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar: Active Passes List */}
        <div className="lg:col-span-5 bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-3xl p-5 sm:p-6 shadow-xl shadow-emerald-950/20 backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-950/10 pb-3">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Active Passes Issued</span>
              <button
                type="button"
                onClick={loadPasses}
                className="p-1 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-700 transition cursor-pointer"
                title="Refresh passes list"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </h3>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
              {recentPasses.length} Total
            </span>
          </div>

          <div className="space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
            {recentPasses.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
                  <CreditCard className="w-6 h-6 opacity-60" />
                </div>
                <p className="text-xs text-slate-400 font-medium">No subscription passes issued yet today.</p>
                <p className="text-[11px] text-slate-400">Fill the form to issue a pass.</p>
              </div>
            ) : (
              recentPasses.map(pass => (
                <div
                  key={pass.id}
                  className="bg-white p-3.5 rounded-2xl border border-slate-200/90 hover:border-emerald-300 hover:shadow-xs transition space-y-2 group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                      pass.pass_type === 'YEARLY'
                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    }`}>
                      {pass.pass_type === 'YEARLY' ? 'YEARLY PASS' : pass.pass_type === 'FAMILY' ? 'FAMILY PASS' : 'MONTHLY PASS'}
                    </span>
                    <span className="font-mono text-xs font-black text-slate-700">{pass.pass_number}</span>
                  </div>

                  <div className="flex justify-between items-baseline pt-0.5">
                    <span className="font-black text-slate-900 text-sm flex items-center gap-1.5 truncate max-w-[200px]">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{pass.holder_name}</span>
                    </span>
                    <span className="text-xs text-emerald-700 font-black">
                      ₹{((pass.amount_paise || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-semibold flex justify-between items-center pt-0.5 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Valid: {pass.valid_through}</span>
                    </span>
                    <span className="text-slate-400 font-medium">1 Person</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReprint(pass)}
                    className="w-full mt-1.5 py-2 bg-slate-50 hover:bg-emerald-600 text-slate-700 hover:text-white border border-slate-200 hover:border-emerald-600 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Re-Print Pass</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
