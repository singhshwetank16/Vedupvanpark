import React, { useState, useEffect, useMemo } from 'react';
import type { Pass, AppConfig, PaymentMethod } from '../types';
import { dbService } from '../lib/supabase';
import { printerService } from '../lib/printer';
import { CreditCard, Calendar, Printer, CheckCircle2, ShieldCheck, UserCheck, Banknote, QrCode, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

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
      const passes = await dbService.fetchRecentPasses(6);
      setRecentPasses(passes);
    } catch {
      const all = dbService.getLocalPasses();
      setRecentPasses(all.slice(0, 6));
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
      {/* Title Header with Logo */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-12 h-12 sm:w-14 sm:h-14 object-contain rounded-2xl border border-emerald-100 p-1 bg-emerald-50/50 shrink-0"
          />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] sm:text-xs font-bold mb-1">
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Pass & Subscription Desk
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Subscription Passes</h1>
            <p className="text-slate-500 text-[11px] sm:text-xs mt-0.5">
              Issue Monthly (1, 2, 3 Months) & Yearly entry passes with thermal QR badge slips.
            </p>
          </div>
        </div>

        {/* Pass Type Switcher Tabs */}
        <div className="w-full sm:w-auto grid grid-cols-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => setPassType('MONTHLY')}
            className={`px-3 sm:px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer text-center ${
              passType === 'MONTHLY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly (₹300 - ₹900)
          </button>
          <button
            type="button"
            onClick={() => setPassType('YEARLY')}
            className={`px-3 sm:px-4 py-2 rounded-xl font-bold text-xs transition cursor-pointer text-center ${
              passType === 'YEARLY'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Yearly (₹3,100)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Pass Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm">
          <form onSubmit={handleGeneratePass} className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              New {passType === 'YEARLY' ? 'Yearly Pass (1 Year)' : `Monthly Pass (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})`}
            </h2>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Pass Holder Full Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar Sharma"
                value={holderName}
                onChange={e => setHolderName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Contact Mobile Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 98XXXXXXXX"
                value={holderPhone}
                onChange={e => setHolderPhone(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Validity Duration
              </label>
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-800">
                <Calendar className="w-5 h-5 text-emerald-600 shrink-0" />
                <select
                  value={validityDays}
                  onChange={e => setValidityDays(parseInt(e.target.value))}
                  className="w-full bg-transparent font-bold focus:outline-none text-slate-800 text-sm cursor-pointer"
                >
                  {passType === 'MONTHLY' ? (
                    <>
                      <option value={30}>30 Days (1 Month) - ₹300</option>
                      <option value={60}>60 Days (2 Months) - ₹600</option>
                      <option value={90}>90 Days (3 Months) - ₹900</option>
                    </>
                  ) : (
                    <option value={365}>365 Days (1 Year) - ₹3,100</option>
                  )}
                </select>
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-3">
              <label className="block text-xs uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode('CASH')}
                  className={`py-3 px-4 rounded-xl font-black text-sm border flex items-center justify-center gap-2 transition cursor-pointer ${
                    paymentMode === 'CASH'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Banknote className="w-4 h-4" />
                  <span>1. Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UPI')}
                  className={`py-3 px-4 rounded-xl font-black text-sm border flex items-center justify-center gap-2 transition cursor-pointer ${
                    paymentMode === 'UPI'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>2. UPI</span>
                </button>
              </div>

              {/* Dynamic Customer UPI QR Box when UPI is selected */}
              {paymentMode === 'UPI' && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 transition-all duration-200">
                  <div className="p-2 bg-white rounded-xl border border-emerald-200 shadow-sm shrink-0">
                    <QRCodeSVG
                      value={`upi://pay?pa=vedupvan@upi&pn=Ved%20Upvan%20Park&am=${totalAmountInr}&cu=INR&tn=${passType}%20Pass%20Subscription`}
                      size={90}
                      level="M"
                    />
                  </div>
                  <div className="text-center sm:text-left space-y-1">
                    <div className="text-xs font-black text-emerald-900 uppercase tracking-wide flex items-center justify-center sm:justify-start gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-700" />
                      Scan & Pay Subscription: ₹{totalAmountInr.toFixed(2)}
                    </div>
                    <p className="text-xs text-slate-700">
                      Scan with <strong>Google Pay, PhonePe, Paytm, or BHIM</strong> to complete payment.
                    </p>
                    <div className="text-[11px] text-emerald-800 font-semibold">
                      Plan: {passType === 'MONTHLY' ? `Monthly Walker Pass (${validityDays === 30 ? '1 Month' : validityDays === 60 ? '2 Months' : '3 Months'})` : 'Yearly Walker Pass (1 Year)'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Total and Submit */}
            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left">
                <div className="text-xs text-slate-500 font-medium">Total Subscription Fee</div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900">₹{totalAmountInr.toFixed(2)}</div>
                {passType === 'MONTHLY' && (
                  <div className="text-[10px] text-emerald-700 font-bold mt-0.5">
                    {validityDays === 30 && '₹300 for 1 Month'}
                    {validityDays === 60 && '₹600 for 2 Months'}
                    {validityDays === 90 && '₹900 for 3 Months'}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50 transition active:scale-95 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                {isGenerating ? 'Generating...' : 'Issue & Print Pass'}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Passes List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Active Passes Issued
          </h3>

          <div className="space-y-3 overflow-y-auto max-h-[450px]">
            {recentPasses.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No passes issued yet.</p>
            ) : (
              recentPasses.map(pass => (
                <div
                  key={pass.id}
                  className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 hover:border-emerald-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {pass.pass_type === 'YEARLY' ? 'YEARLY PASS' : pass.pass_type === 'FAMILY' ? 'FAMILY PASS' : 'MONTHLY PASS'}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-600">{pass.pass_number}</span>
                  </div>

                  <div className="flex justify-between items-baseline">
                    <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-slate-400" />
                      {pass.holder_name}
                    </span>
                    <span className="text-xs text-emerald-700 font-bold">
                      ₹{((pass.amount_paise || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Valid until: {pass.valid_through}</span>
                    <span>1 Person Allowed</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleReprint(pass)}
                    className="w-full mt-2 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-600" /> Re-Print Pass
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
