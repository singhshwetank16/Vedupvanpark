import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { dbService } from '../lib/supabase';
import { sounds } from '../lib/audio';
import { BiometricScannerModal } from './BiometricScannerModal';
import type { VerificationResponse, AppConfig, Pass, PassMember } from '../types';
import {
  Camera,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Volume2,
  ShieldCheck,
  RefreshCw,
  Upload,
  Lock,
  QrCode,
  Clock,
  Phone,
  Search,
  Smartphone,
  Fingerprint
} from 'lucide-react';
import { LOGO_URL } from '../assets/logo';

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
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [isPhoneValidating, setIsPhoneValidating] = useState<boolean>(false);

  // Biometric gate verification modal state
  const [gateBioModalOpen, setGateBioModalOpen] = useState(false);
  const [pendingScanCode, setPendingScanCode] = useState<string>('');
  const [pendingPass, setPendingPass] = useState<Pass | null>(null);
  const [pendingEntryPhoto, setPendingEntryPhoto] = useState<string | undefined>(undefined);

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

  const captureGateSnapshot = (): string | undefined => {
    try {
      const container = document.getElementById(scannerContainerId);
      const video = container?.querySelector('video');
      if (video && video.videoWidth > 0 && video.videoHeight > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(640, video.videoWidth);
        canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.82);
        }
      }
    } catch (e) {
      console.warn('Gate snapshot capture failed:', e);
    }
    return undefined;
  };

  const handleScannedCode = async (rawCode: string) => {
    const cleanCode = rawCode.trim();
    if (!cleanCode || isProcessing || scanLockedRef.current) return;

    // 1. Immediately lock scanning in software & capture gate snapshot
    scanLockedRef.current = true;
    setIsScanLocked(true);
    setIsProcessing(true);

    const entrySnapshot = captureGateSnapshot();

    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch (e) {
      console.warn('Could not pause camera video:', e);
    }

    try {
      // 2. Check if scanned item is a Pass with biometric members enrolled
      const pass = await dbService.findPassByTokenOrPhone(cleanCode);
      const enrolledMembersList = pass?.members?.length ? pass.members : (pass?.members_json || []);
      const hasEnrolledBiometric = (enrolledMembersList && enrolledMembersList.some(m => m.biometric_id)) || pass?.biometric_id;

      if (pass && hasEnrolledBiometric) {
        // Build active members list with pass holder as fallback if needed
        const membersToVerify: PassMember[] = enrolledMembersList.length > 0
          ? enrolledMembersList
          : [{
              id: 'mem-primary',
              name: pass.holder_name,
              relation: 'Self',
              photo_url: pass.photo_url,
              biometric_id: pass.biometric_id,
            }];

        pass.members = membersToVerify;
        setPendingScanCode(cleanCode);
        setPendingPass(pass);
        setPendingEntryPhoto(entrySnapshot);
        setGateBioModalOpen(true);
        setIsProcessing(false);
        return;
      }

      // 3. Normal admission (Single Entry Ticket or Pass without biometric)
      const response = await dbService.admitVisitor(cleanCode, {
        entry_photo_url: entrySnapshot,
      });
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

  const handleGateBioVerifySuccess = async (matchedMember: PassMember, bioId: string) => {
    setGateBioModalOpen(false);
    setIsProcessing(true);

    try {
      const response = await dbService.admitVisitor(pendingScanCode, {
        biometric_id: bioId,
        biometric_member_name: matchedMember.name,
        entry_photo_url: pendingEntryPhoto,
      });

      setVerificationResult(response);
      refreshScanSummary();

      if (response.success) {
        sounds.playSuccess();
      } else {
        sounds.playError();
      }
    } catch (e) {
      sounds.playError();
      setVerificationResult({
        success: false,
        code: 'INVALID',
        message: 'Gate validation failed. Please check connection.',
      });
    } finally {
      setIsProcessing(false);
      setPendingPass(null);
      setPendingScanCode('');
      setPendingEntryPhoto(undefined);
    }
  };

  const handleGateBioVerifyFailed = (reason: string) => {
    setGateBioModalOpen(false);
    sounds.playError();
    setVerificationResult({
      success: false,
      code: 'REJECTED',
      document_type: 'PASS',
      pass_number: pendingPass?.pass_number,
      holder_name: pendingPass?.holder_name,
      message: `BIOMETRIC VERIFICATION FAILED: ${reason}`,
    });
    setPendingPass(null);
    setPendingScanCode('');
    setPendingEntryPhoto(undefined);
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

  const handlePhoneValidate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || isPhoneValidating) return;

    setIsPhoneValidating(true);
    try {
      await handleScannedCode(cleanPhone);
      setPhoneInput('');
    } finally {
      setIsPhoneValidating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-2.5 sm:p-4 space-y-4 sm:space-y-6">
      {/* Header Info Banner with Glassmorphism */}
      <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          <div className="relative group shrink-0">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-xs opacity-70 group-hover:opacity-100 transition" />
            <img
              src={LOGO_URL}
              alt="Logo"
              className="relative w-12 h-12 object-contain rounded-2xl border border-white/80 p-1 bg-white shadow-xs"
            />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200/60 text-emerald-900 text-[10px] sm:text-xs font-black uppercase tracking-wider mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
              <span>Gate Scanner • {config.gate_code}</span>
            </div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              {config.park_settings.park_name}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">{config.park_settings.organization_name}</p>
          </div>
        </div>

        <div className="bg-slate-100/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/80 text-xs font-black text-slate-700 flex items-center gap-2 shadow-2xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>Active Gate: <strong className="text-emerald-800">{config.gate_name}</strong></span>
        </div>
      </div>

      {/* Main Verification Result Card (Dynamic Success/Denial) */}
      {verificationResult && (
        <div
          className={`p-5 sm:p-7 rounded-3xl border-2 shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 space-y-4 ${
            verificationResult.success
              ? 'bg-gradient-to-br from-emerald-600 via-green-600 to-emerald-700 text-white border-emerald-400/80 shadow-emerald-900/40 ring-4 ring-emerald-500/20'
              : 'bg-gradient-to-br from-red-600 via-rose-600 to-red-700 text-white border-red-400/80 shadow-red-900/40 ring-4 ring-red-500/20'
          }`}
        >
          {/* Card Top Control Row: Status Pill on left, Close button on right */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-white/20 backdrop-blur-md border border-white/30">
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
            <div className="space-y-3.5">
              {/* Highlight Hero Card: Visitors Count */}
              <div className="bg-white text-emerald-950 rounded-2xl p-4 sm:p-5 shadow-xl border border-white/80">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
                      <Users className="w-8 h-8 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700 leading-tight">
                        Allowed Visitor Entry
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-900 leading-none mt-1 whitespace-nowrap">
                        {verificationResult.persons_admitted || 1} {((verificationResult.persons_admitted || 1) > 1) ? 'PERSONS' : 'PERSON'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-full text-xs font-black border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>ADMITTED</span>
                    </div>
                  </div>
                </div>

                {/* Pass Holder Name & Biometric Details if present */}
                {verificationResult.holder_name && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Pass Holder:</span>
                    <span className="font-black text-slate-900 truncate max-w-[200px]">
                      {verificationResult.holder_name}
                    </span>
                  </div>
                )}

                {/* Biometric Verified Member Badge */}
                {verificationResult.biometric_verified && (
                  <div className="mt-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                    <span className="text-emerald-800 font-bold flex items-center gap-1">
                      <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Biometric Verified Member:</span>
                    </span>
                    <span className="font-black text-emerald-950 bg-white px-2 py-0.5 rounded border border-emerald-300">
                      {verificationResult.biometric_member_name || verificationResult.holder_name} ✓
                    </span>
                  </div>
                )}

                {/* Photos Row: Registered Photo & Gate Entry Snapshot */}
                {(verificationResult.photo_url || verificationResult.entry_photo_url) && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                    {verificationResult.photo_url && (
                      <div className="bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
                          Registered Photo
                        </span>
                        <img
                          src={verificationResult.photo_url}
                          alt="Enrolled"
                          className="w-16 h-16 mx-auto rounded-lg object-cover border border-slate-300 shadow-2xs"
                        />
                      </div>
                    )}
                    {verificationResult.entry_photo_url && (
                      <div className="bg-emerald-50/60 p-1.5 rounded-xl border border-emerald-200">
                        <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-700 mb-1">
                          Gate Live Photo
                        </span>
                        <img
                          src={verificationResult.entry_photo_url}
                          alt="Gate Entry"
                          className="w-16 h-16 mx-auto rounded-lg object-cover border border-emerald-400 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Grid of Ticket Details */}
              <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/20 text-xs text-white space-y-2 shadow-inner">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/15">
                  <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Document Number:</span>
                  <span className="font-mono font-black text-white text-xs sm:text-sm tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                    {verificationResult.ticket_number || verificationResult.pass_number}
                  </span>
                </div>

                {verificationResult.plan_name && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Ticket / Pass Plan:</span>
                    <span className="font-bold text-white text-xs sm:text-sm truncate">
                      {verificationResult.plan_name}
                    </span>
                  </div>
                )}

                {verificationResult.issued_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Date & Time Issued:</span>
                    <span className="font-mono font-medium text-white/95 text-xs tracking-tight whitespace-nowrap">
                      {formatCleanDateTime(verificationResult.issued_at)}
                    </span>
                  </div>
                )}

                {verificationResult.scanned_at && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Date & Time Scanned:</span>
                    <span className="font-mono font-bold text-emerald-300 text-xs tracking-tight whitespace-nowrap">
                      {formatCleanDateTime(verificationResult.scanned_at)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/15">
                  <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Payment Mode:</span>
                  <span className="font-bold px-2 py-0.5 rounded bg-white/20 text-white uppercase text-[11px] tracking-wider">
                    {verificationResult.payment_method || 'CASH'}
                  </span>
                </div>

                {verificationResult.amount_inr && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/70 text-[11px] sm:text-xs shrink-0 font-medium">Total Amount:</span>
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
                <div className="bg-white text-red-950 rounded-2xl p-5 shadow-xl border border-white/80 text-center space-y-2.5">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shadow-md shadow-red-600/30">
                    <XCircle className="w-9 h-9 stroke-[2.5]" />
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
                    <div className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs sm:text-sm font-black text-amber-300 shadow-inner max-w-full">
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
              className={`w-full py-4 px-6 font-black text-sm sm:text-base rounded-2xl shadow-2xl active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer ring-4 ${
                verificationResult.success
                  ? 'bg-white hover:bg-emerald-50 text-emerald-950 ring-white/30'
                  : 'bg-white hover:bg-rose-50 text-red-950 ring-white/30'
              }`}
            >
              <Camera className="w-5 h-5 shrink-0 text-emerald-700" />
              <span>NEXT SCAN (अगला टिकट स्कैन करें) ➔</span>
            </button>

            <div className="text-center text-[11px] text-white/90 font-medium flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span>Camera OFF. Tap button above to open camera for next scan.</span>
            </div>
          </div>
        </div>
      )}

      {/* Aesthetic Live Scan Statistics Row (2 Rich Cards) */}
      <div className="grid grid-cols-2 gap-3.5">
        {/* Card 1: Tickets Scanned */}
        <div className="bg-gradient-to-br from-white via-white to-emerald-50/50 border border-white/70 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 backdrop-blur-xl flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/30">
            <QrCode className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-[10px] sm:text-[11px] font-black text-slate-500 uppercase tracking-wider">
              Tickets Scanned
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 leading-none">
              {scanSummary.totalScannedTickets}
              <span className="text-xs font-bold text-slate-400 ml-1.5">Tkts</span>
            </div>
          </div>
        </div>

        {/* Card 2: Admitted Visitors */}
        <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 border border-emerald-700/60 rounded-3xl p-4 sm:p-5 shadow-xl shadow-emerald-950/20 text-white flex items-center justify-between">
          <div>
            <div className="text-[10px] sm:text-[11px] font-black text-emerald-200 uppercase tracking-wider">
              Admitted Visitors
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white mt-0.5 leading-none">
              {scanSummary.totalPersonsAdmitted}
              <span className="text-xs font-bold text-emerald-300 ml-1.5">Persons</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-emerald-300" />
          </div>
        </div>
      </div>

      {/* Mobile Number Pass Validation (Forgot Pass Entry) */}
      <div className="bg-gradient-to-br from-white via-white to-blue-50/40 border border-blue-200/90 rounded-3xl p-4 sm:p-5 shadow-xl shadow-blue-950/10 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm tracking-tight">
                Pass Entry via Mobile Number
              </h2>
            </div>
          </div>
        </div>

        <form onSubmit={handlePhoneValidate} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Phone className="w-4 h-4 text-blue-600" />
            </div>
            <input
              type="tel"
              maxLength={10}
              placeholder="Enter 10-digit mobile number (e.g. 98XXXXXXXX)"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="w-full pl-10 pr-3 py-2.5 bg-white border-2 border-blue-200 hover:border-blue-400 focus:border-blue-600 rounded-xl text-sm font-black text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-4 focus:ring-blue-500/20 transition shadow-inner font-mono tracking-wider"
            />
          </div>

          <button
            type="submit"
            disabled={isPhoneValidating || phoneInput.length < 10}
            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer active:scale-95 shrink-0"
          >
            {isPhoneValidating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Verify & Admit Pass</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Camera Live Scanner Box (Optical QR Scan Only - Zero Manual Entry) */}
      <div className="bg-gradient-to-br from-white via-white to-slate-50/50 border border-white/70 rounded-3xl p-5 sm:p-7 shadow-xl shadow-emerald-950/20 backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-950/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-sm tracking-tight">Optical QR Scanner</h2>
              <p className="text-[10px] text-slate-500 font-medium">Automatic ultra-fast barcode recognition</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-initial px-3.5 py-2 bg-slate-100/90 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200/80 shadow-2xs"
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
              className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                scannerActive
                  ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {scannerActive ? 'Pause Camera' : 'Start Camera'}
            </button>
          </div>
        </div>

        {/* Camera Viewfinder with Futuristic Border */}
        <div className="relative rounded-3xl overflow-hidden bg-slate-950 min-h-[350px] flex items-center justify-center border-2 border-slate-800 shadow-2xl">
          <div id={scannerContainerId} className="w-full max-w-sm mx-auto"></div>

          {/* Software Lock Overlay - shown when ticket is scanned and waiting for user to click NEXT SCAN */}
          {isScanLocked && (
            <div className="absolute inset-0 bg-slate-950/92 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white space-y-4 z-10 animate-in fade-in duration-200">
              <div className={`p-4 rounded-3xl border shadow-xl ${
                verificationResult?.success
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/20'
                  : 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-500/20'
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
                <p className="text-xs text-slate-300 mt-1 max-w-xs font-medium">
                  Review ticket details above. Tap below when ready to scan next ticket:
                </p>
              </div>
              <button
                type="button"
                onClick={handleNextScan}
                className="w-full max-w-xs py-3.5 px-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-900/50 flex items-center justify-center gap-2.5 cursor-pointer transition active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span>NEXT SCAN (OPEN CAMERA) ➔</span>
              </button>
            </div>
          )}

          {/* Shown when camera is stopped manually and no scan is locked */}
          {!scannerActive && !isScanLocked && !cameraError && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
              <div className="w-16 h-16 bg-slate-900 text-slate-400 rounded-3xl border border-slate-800 flex items-center justify-center shadow-inner">
                <Camera className="w-8 h-8 opacity-70" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Camera is Off</p>
                <p className="text-xs text-slate-400 mt-1 font-medium">Tap below to turn on the camera for scanning.</p>
              </div>
              <button
                type="button"
                onClick={startScanner}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-900/50 active:scale-95 transition"
              >
                <Camera className="w-4 h-4" /> Start Camera
              </button>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center text-white space-y-3">
              <div className="w-14 h-14 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-black text-white">Camera Access Notice</p>
                <p className="text-xs text-slate-300 max-w-sm mt-1">{cameraError}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer border border-slate-700"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload QR Image
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security Badge - No Manual Entry Allowed */}
        <div className="pt-3 border-t border-emerald-950/10 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-900 font-black bg-emerald-50 border border-emerald-200/80 px-3.5 py-1.5 rounded-xl">
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>Anti-Fraud Mode Active • Optical QR & Mobile Pass Validation</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 font-bold">
            <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sound alerts enabled</span>
          </div>
        </div>
      </div>

      {/* Gate Entry Biometric Verification Modal */}
      {pendingPass && (
        <BiometricScannerModal
          isOpen={gateBioModalOpen}
          onClose={() => {
            setGateBioModalOpen(false);
            setIsProcessing(false);
            setPendingPass(null);
            setPendingScanCode('');
            setPendingEntryPhoto(undefined);
            scanLockedRef.current = false;
            setIsScanLocked(false);
          }}
          mode="VERIFY"
          memberName={pendingPass.holder_name}
          enrolledMembers={
            pendingPass.members?.length
              ? pendingPass.members
              : (pendingPass.members_json?.length
                  ? pendingPass.members_json
                  : [{
                      id: 'mem-primary',
                      name: pendingPass.holder_name,
                      relation: 'Self',
                      photo_url: pendingPass.photo_url,
                      biometric_id: pendingPass.biometric_id,
                    }])
          }
          onVerifySuccess={handleGateBioVerifySuccess}
          onVerifyFailed={handleGateBioVerifyFailed}
        />
      )}
    </div>
  );
};
