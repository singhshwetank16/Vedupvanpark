import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { dbService } from '../lib/supabase';
import { sounds } from '../lib/audio';
import type { VerificationResponse, AppConfig } from '../types';
import { Camera, CheckCircle2, XCircle, AlertTriangle, Users, Volume2, ShieldCheck, RefreshCw, Upload, Lock, QrCode, Clock } from 'lucide-react';

interface GateScannerProps {
  config: AppConfig;
}

// Clean helper to format date and time reliably into "DD-MMM-YYYY • HH:MM AM/PM"
export const formatCleanDateTime = (val?: string | null): string => {
  if (!val) return '—';
  // Try parsing standard date
  const d = new Date(val);
  if (!isNaN(d.getTime()) && val.includes('-') && (val.includes('T') || val.length > 20)) {
    const day = d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const time = d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${day} • ${time}`;
  }
  // If string already formatted like "13-Nov-2026, 12:46:19 AM" or "13-Nov-2026 12:46 AM"
  let clean = val.replace(/:\d{2}\s+(AM|PM)/i, ' $1');
  clean = clean.replace(/,\s*/g, ' • ');
  return clean.trim();
};

// Clean helper to structure denial messages into 3 distinct lines
const parseDenialDetails = (result: VerificationResponse) => {
  const rawMsg = result.message || '';
  const upper = rawMsg.toUpperCase();

  if (result.code === 'USED' || upper.includes('ALREADY EXPIRED') || upper.includes('FIRST SCANNED AT')) {
    const match = rawMsg.match(/(?:first\s+)?scanned\s+at:\s*(.*)$/i);
    let timeText = match?.[1]?.trim() || result.scanned_at || '';
    timeText = timeText.replace(/[!.]+$/, '').trim();

    return {
      line1: 'Ticket Already Expired !',
      line2: 'First scanned at:',
      line3: timeText || 'Previously scanned',
    };
  }

  if (result.code === 'COOLDOWN' || upper.includes('COOLDOWN ACTIVE')) {
    const match = rawMsg.match(/last scanned:?\s*(.*)$/i);
    const timeText = match?.[1]?.trim() || result.scanned_at || '';
    return {
      line1: 'Cooldown Active !',
      line2: 'Last scanned at:',
      line3: timeText || 'Scanned recently',
    };
  }

  if (result.code === 'EXPIRED') {
    return {
      line1: 'Ticket Validity Expired !',
      line2: 'Expired on:',
      line3: result.valid_through || 'Past expiration date',
    };
  }

  return {
    line1: rawMsg || 'Entry Denied !',
    line2: null,
    line3: null,
  };
};

export const GateScanner: React.FC<GateScannerProps> = ({ config }) => {
  const [scannerActive, setScannerActive] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanSummary, setScanSummary] = useState(() => dbService.getTodayScanSummary());
  const [isScanLocked, setIsScanLocked] = useState<boolean>(false);

  const scanLockedRef = useRef<boolean>(false);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerContainerId = 'qr-reader-container';

  // Guard against double initialization & unmount race conditions
  const isStartingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  // Hardware USB/Bluetooth Barcode Scanner buffer listener
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const refreshScanSummary = async () => {
    try {
      const summary = await dbService.fetchTodayScanSummary();
      setScanSummary(summary);
    } catch {
      setScanSummary(dbService.getTodayScanSummary());
    }
  };

  // Next Scan Handler: Instant unpause without needing page reload
  const handleNextScan = async () => {
    setVerificationResult(null);

    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        html5QrCodeRef.current.resume();
      } catch (e) {
        console.warn('Resume camera warning, restarting scanner:', e);
        await startScanner();
      }
    } else {
      await startScanner();
    }

    // Grace period so moving the old ticket away does not re-trigger scan
    setTimeout(() => {
      scanLockedRef.current = false;
      setIsScanLocked(false);
      setIsProcessing(false);
    }, 400);
  };

  // Dismiss card only
  const handleDismissCard = () => {
    setVerificationResult(null);
    scanLockedRef.current = false;
    setIsScanLocked(false);
    setIsProcessing(false);
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.resume();
      }
    } catch {}
  };

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();
    refreshScanSummary();

    const summaryTimer = setInterval(refreshScanSummary, 3000);

    // Listen for hardware 2D barcode / QR scanner guns without needing an input box
    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      // Most barcode guns type rapid characters (< 50ms per keystroke)
      if (now - lastKeyTimeRef.current > 100) {
        barcodeBufferRef.current = '';
      }
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length > 5 && !scanLockedRef.current) {
          handleScannedCode(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMountedRef.current = false;
      clearInterval(summaryTimer);
      stopScanner();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const cleanupExtraVideos = () => {
    try {
      const container = document.getElementById(scannerContainerId);
      if (container) {
        const videos = container.querySelectorAll('video');
        if (videos.length > 1) {
          for (let i = 1; i < videos.length; i++) {
            videos[i].pause();
            (videos[i].srcObject as MediaStream | null)?.getTracks()?.forEach(t => t.stop());
            videos[i].remove();
          }
        }
      }
    } catch (e) {
      console.warn('cleanupExtraVideos warning:', e);
    }
  };

  const startScanner = async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      setCameraError(null);
      await stopScanner();

      // Ensure container DOM is clean before mounting new video stream
      const container = document.getElementById(scannerContainerId);
      if (container) {
        container.innerHTML = '';
      }

      if (!isMountedRef.current) {
        isStartingRef.current = false;
        return;
      }

      const qrScanner = new Html5Qrcode(scannerContainerId);
      html5QrCodeRef.current = qrScanner;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrEdge = Math.max(180, Math.floor(minEdge * 0.72));
        return { width: qrEdge, height: qrEdge };
      };

      const qrConfig = {
        fps: 15,
        qrbox: qrboxFunction,
      };

      // Try Environment (Back Camera) first
      try {
        await qrScanner.start(
          { facingMode: 'environment' },
          qrConfig,
          (decodedText) => {
            if (scanLockedRef.current) return;
            handleScannedCode(decodedText);
          },
          () => {}
        );
        cleanupExtraVideos();
        if (isMountedRef.current) {
          setScannerActive(true);
        } else {
          await stopScanner();
        }
      } catch (backCamErr) {
        console.warn('Back camera not found or failed, falling back to front/webcam:', backCamErr);
        if (!isMountedRef.current) {
          isStartingRef.current = false;
          return;
        }
        // Fallback to front camera / laptop webcam
        await qrScanner.start(
          { facingMode: 'user' },
          qrConfig,
          (decodedText) => {
            if (scanLockedRef.current) return;
            handleScannedCode(decodedText);
          },
          () => {}
        );
        cleanupExtraVideos();
        if (isMountedRef.current) {
          setScannerActive(true);
        } else {
          await stopScanner();
        }
      }
    } catch (err: unknown) {
      console.error('All camera startup attempts failed:', err);
      if (isMountedRef.current) {
        setCameraError(
          err instanceof Error
            ? err.message
            : 'Camera permission denied or camera device not found. You can still scan via QR image upload below.'
        );
        setScannerActive(false);
      }
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.warn('Error clearing scanner', e);
      }
      html5QrCodeRef.current = null;
    }
    const container = document.getElementById(scannerContainerId);
    if (container) {
      container.innerHTML = '';
    }
    setScannerActive(false);
  };

  const handleScannedCode = async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode || isProcessing || scanLockedRef.current) return;

    // 1. Immediately lock scanning in software & freeze video stream
    scanLockedRef.current = true;
    setIsScanLocked(true);
    setIsProcessing(true);

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn('Could not pause camera video:', e);
    }

    try {
      const response = await dbService.admitVisitor(cleanCode);
      setVerificationResult(response);
      refreshScanSummary();

      if (response.success) {
        sounds.playSuccess();
      } else {
        sounds.playError();
      }
    } catch (err) {
      console.error('Validation error:', err);
      sounds.playError();
      setVerificationResult({
        success: false,
        code: 'INVALID',
        message: 'FRAUD ALERT: Unrecognized or forged QR code!',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode(scannerContainerId);
        html5QrCodeRef.current = scanner;
      }
      const decodedText = await scanner.scanFile(file, false);
      handleScannedCode(decodedText);
    } catch (err) {
      console.warn('File QR scan failed:', err);
      alert('Could not detect genuine QR code in this image. Please make sure the QR is clear and well-lit.');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-2.5 sm:p-4 space-y-3.5 sm:space-y-5">
      {/* Header Info Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Logo"
            className="w-11 h-11 sm:w-12 sm:h-12 object-contain rounded-xl border border-emerald-100 p-0.5 bg-emerald-50/50"
          />
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] sm:text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Gate Scanner • {config.gate_code}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900">{config.park_settings.park_name}</h1>
            <p className="text-[11px] sm:text-xs text-slate-500">{config.park_settings.organization_name}</p>
          </div>
        </div>

        <div className="bg-slate-50 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl sm:rounded-2xl border border-slate-200 text-xs font-bold text-slate-700">
          Active Gate: <span className="text-emerald-700">{config.gate_name}</span>
        </div>
      </div>

      {/* Main Verification Result Card */}
      {verificationResult && (
        <div
          className={`p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 space-y-3.5 sm:space-y-4 ${
            verificationResult.success
              ? 'bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-700 text-white border-emerald-400 shadow-emerald-600/30'
              : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white border-red-400 shadow-red-600/30'
          }`}
        >
          {/* Card Top Control Row: Status Pill on left, Close button on right */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 backdrop-blur-sm">
              {verificationResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                  <span>ENTRY ALLOWED</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-rose-100" />
                  <span>ENTRY DENIED</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleDismissCard}
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition shrink-0"
              title="Close card"
            >
              ✕ Close
            </button>
          </div>

          {/* SUCCESS VIEW */}
          {verificationResult.success ? (
            <div className="space-y-3">
              {/* Highlight Hero Card: Visitors Count */}
              <div className="bg-white text-emerald-950 rounded-2xl p-3.5 sm:p-4 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <Users className="w-7 h-7 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-700 leading-tight">
                        Allowed Visitor Entry
                      </div>
                      <div className="text-2xl sm:text-4xl font-black text-slate-900 leading-none mt-1 whitespace-nowrap">
                        {verificationResult.persons_admitted || 1} {((verificationResult.persons_admitted || 1) > 1) ? 'PERSONS' : 'PERSON'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full text-xs font-black">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>ADMITTED</span>
                    </div>
                  </div>
                </div>

                {/* Pass Holder Name if present */}
                {verificationResult.holder_name && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Pass Holder:</span>
                    <span className="font-bold text-slate-900 truncate max-w-[200px]">
                      {verificationResult.holder_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Grid of Ticket Details: Dates, Times, Amount, Plan, Payment Mode */}
              <div className="bg-black/30 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 border border-white/20 text-xs text-white space-y-2 shadow-inner">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/15">
                  <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Document Number:</span>
                  <span className="font-mono font-bold text-white text-xs sm:text-sm tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {verificationResult.ticket_number || verificationResult.pass_number}
                  </span>
                </div>

                {verificationResult.plan_name && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Ticket / Pass Plan:</span>
                    <span className="font-bold text-white text-xs sm:text-sm truncate">
                      {verificationResult.plan_name}
                    </span>
                  </div>
                )}

                {verificationResult.issued_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Date & Time Issued:</span>
                    <span className="font-mono font-medium text-white/95 text-xs tracking-tight whitespace-nowrap">
                      {formatCleanDateTime(verificationResult.issued_at)}
                    </span>
                  </div>
                )}

                {verificationResult.scanned_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Date & Time Scanned:</span>
                    <span className="font-mono font-bold text-emerald-300 text-xs tracking-tight whitespace-nowrap">
                      {formatCleanDateTime(verificationResult.scanned_at)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/15">
                  <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Payment Mode:</span>
                  <span className="font-bold px-2 py-0.5 rounded bg-white/20 text-white uppercase text-[11px] tracking-wider">
                    {verificationResult.payment_method || 'CASH'}
                  </span>
                </div>

                {verificationResult.amount_inr && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0">Total Amount:</span>
                    <span className="font-black text-emerald-300 text-sm">₹{verificationResult.amount_inr}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* DENIED / EXPIRED VIEW: Clean 3-Line Layout per user request */
            (() => {
              const denial = parseDenialDetails(verificationResult);
              return (
                <div className="bg-white text-red-950 rounded-2xl p-4 sm:p-5 shadow-lg text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-red-100 text-red-600 flex items-center justify-center">
                    <XCircle className="w-8 h-8 stroke-[2.5]" />
                  </div>

                  {/* Line 1: Ticket Already Expired ! */}
                  <div className="text-lg sm:text-2xl font-black text-red-600 uppercase tracking-tight leading-tight">
                    {denial.line1}
                  </div>

                  {/* Line 2: First scanned at: */}
                  {denial.line2 && (
                    <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600">
                      {denial.line2}
                    </div>
                  )}

                  {/* Line 3: Date & Time */}
                  {denial.line3 && (
                    <div className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs sm:text-sm font-black text-amber-300 shadow-inner max-w-full">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="whitespace-nowrap">{formatCleanDateTime(denial.line3)}</span>
                    </div>
                  )}

                  {verificationResult.ticket_number && (
                    <div className="text-[11px] sm:text-xs text-slate-500 font-mono pt-1">
                      Ticket #: <span className="font-bold text-slate-800 whitespace-nowrap">{verificationResult.ticket_number}</span>
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {/* Action: Next Scan Button */}
          <div className="pt-2 space-y-2">
            <button
              type="button"
              onClick={handleNextScan}
              className={`w-full py-3.5 sm:py-4 px-6 font-black text-sm sm:text-base rounded-2xl shadow-2xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer ring-4 ${
                verificationResult.success
                  ? 'bg-white hover:bg-emerald-50 text-emerald-950 ring-white/30'
                  : 'bg-white hover:bg-rose-50 text-red-950 ring-white/30'
              }`}
            >
              <Camera className="w-5 h-5 shrink-0" />
              <span>NEXT SCAN (अगला टिकट स्कैन करें) ➔</span>
            </button>

            <div className="text-center text-[11px] text-white/90 font-medium flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span>Camera OFF. Tap button above to open camera for next scan.</span>
            </div>
          </div>
        </div>
      )}

      {/* 1 Single Live Scan Report: Total Tickets Scanned & Admitted Persons */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 bg-emerald-50 text-emerald-700 rounded-xl sm:rounded-2xl border border-emerald-100 shrink-0">
            <QrCode className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Tickets Scanned Today
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5">
              {scanSummary.totalScannedTickets} <span className="text-xs font-semibold text-slate-400">Tickets</span>
            </div>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-right shrink-0">
          <div className="text-[10px] sm:text-[11px] font-bold text-emerald-800 uppercase tracking-wide">
            Admitted Visitors
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-700">
            {scanSummary.totalPersonsAdmitted} <span className="text-xs font-bold text-emerald-800">Persons</span>
          </div>
        </div>
      </div>

      {/* Camera Live Scanner Box (Optical QR Scan Only - Zero Manual Entry) */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-900 text-sm">Optical QR Scanner</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200"
              title="Upload QR photo or screenshot"
            >
              <Upload className="w-3.5 h-3.5 text-slate-600" />
              <span>Upload Photo</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />

            <button
              type="button"
              onClick={scannerActive ? stopScanner : startScanner}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                scannerActive
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {scannerActive ? 'Pause Camera' : 'Start Camera'}
            </button>
          </div>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative rounded-2xl overflow-hidden bg-slate-900 min-h-[340px] flex items-center justify-center border border-slate-800">
          <div id={scannerContainerId} className="w-full max-w-sm mx-auto"></div>

          {/* Software Lock Overlay - shown when ticket is scanned and waiting for user to click NEXT SCAN */}
          {isScanLocked && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white space-y-4 z-10 animate-in fade-in duration-200">
              <div className={`p-4 rounded-2xl border ${
                verificationResult?.success
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 border-red-500/30'
              }`}>
                {verificationResult?.success ? (
                  <CheckCircle2 className="w-12 h-12" />
                ) : (
                  <XCircle className="w-12 h-12" />
                )}
              </div>
              <div>
                <p className="text-base font-black text-white">
                  {verificationResult?.success ? 'Ticket Verified • Camera Paused' : 'Ticket Expired • Camera Paused'}
                </p>
                <p className="text-xs text-slate-300 mt-1 max-w-xs">
                  Review ticket details above. Tap below when ready to scan next ticket:
                </p>
              </div>
              <button
                type="button"
                onClick={handleNextScan}
                className="w-full max-w-xs py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span>NEXT SCAN (OPEN CAMERA) ➔</span>
              </button>
            </div>
          )}

          {/* Shown when camera is stopped manually and no scan is locked */}
          {!scannerActive && !isScanLocked && !cameraError && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
              <div className="p-4 bg-slate-800 text-slate-400 rounded-2xl border border-slate-700">
                <Camera className="w-10 h-10" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Camera is Off</p>
                <p className="text-xs text-slate-400 mt-1">Tap below to turn on the camera for scanning.</p>
              </div>
              <button
                type="button"
                onClick={startScanner}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/50 active:scale-95 transition"
              >
                <Camera className="w-4 h-4" /> Start Camera
              </button>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
              <AlertTriangle className="w-12 h-12 text-amber-400" />
              <div>
                <p className="text-sm font-bold">Camera Access Notice</p>
                <p className="text-xs text-slate-300 max-w-sm mt-1">{cameraError}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload QR Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security Badge - No Manual Entry Allowed */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Anti-Fraud Mode Active • Optical QR Scan Only</span>
          </div>
          <div className="flex items-center gap-1 text-slate-600 font-semibold">
            <Volume2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Sound alerts on scan</span>
          </div>
        </div>
      </div>
    </div>
  );
};
