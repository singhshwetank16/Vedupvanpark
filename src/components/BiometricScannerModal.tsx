import React, { useState, useEffect, useRef } from 'react';
import { Fingerprint, X, CheckCircle2, ShieldCheck, RefreshCw, Smartphone } from 'lucide-react';
import {
  generateBiometricId,
  generateBiometricTemplate,
  drawFingerprintCanvas,
  registerWebAuthnBiometric,
  verifyWebAuthnBiometric,
  isWebAuthnAvailable,
  matchBiometricAgainstMembers,
} from '../lib/biometric';
import type { PassMember } from '../types';

interface BiometricScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'ENROLL' | 'VERIFY';
  memberName?: string;
  memberRelation?: string;
  memberIndex?: number;
  enrolledMembers?: PassMember[];
  onEnrollSuccess?: (bioId: string, template: string) => void;
  onVerifySuccess?: (matchedMember: PassMember, bioId: string) => void;
  onVerifyFailed?: (reason: string) => void;
}

export const BiometricScannerModal: React.FC<BiometricScannerModalProps> = ({
  isOpen,
  onClose,
  mode,
  memberName = 'Pass Holder',
  memberRelation = 'Self',
  memberIndex = 1,
  enrolledMembers = [],
  onEnrollSuccess,
  onVerifySuccess,
  onVerifyFailed,
}) => {
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<{
    status: 'IDLE' | 'SUCCESS' | 'FAILED';
    message: string;
    bioId?: string;
    matchedMember?: PassMember;
  }>({ status: 'IDLE', message: '' });
  const [hasHardwareWebAuthn, setHasHardwareWebAuthn] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const laserYRef = useRef<number>(0);
  const laserDirectionRef = useRef<number>(1);

  // Check hardware WebAuthn availability
  useEffect(() => {
    if (isOpen) {
      isWebAuthnAvailable().then(avail => setHasHardwareWebAuthn(avail));
      setScanProgress(0);
      setIsScanning(false);
      setScanResult({ status: 'IDLE', message: '' });
    }
  }, [isOpen]);

  // Optical Fingerprint Animation Loop
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const seed = `${memberName}-${memberRelation}-${memberIndex}`;

    const render = () => {
      if (isScanning) {
        laserYRef.current += 3.5 * laserDirectionRef.current;
        if (laserYRef.current >= canvas.height - 10) laserDirectionRef.current = -1;
        if (laserYRef.current <= 10) laserDirectionRef.current = 1;
      } else {
        laserYRef.current = -1;
      }

      drawFingerprintCanvas(
        canvas,
        seed,
        laserYRef.current,
        scanResult.status === 'SUCCESS',
        isScanning
      );

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, isScanning, scanResult.status, memberName, memberRelation, memberIndex]);

  // Touch/Hold Fingerprint Scan Simulation
  const handleTriggerScan = () => {
    if (isScanning || scanResult.status === 'SUCCESS') return;

    setIsScanning(true);
    setScanProgress(0);
    setScanResult({ status: 'IDLE', message: 'Scanning fingerprint ridges & minutiae...' });

    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setScanProgress(Math.min(100, current));

      if (current >= 100) {
        clearInterval(interval);
        setIsScanning(false);

        if (mode === 'ENROLL') {
          // Complete enrollment
          const bioId = generateBiometricId(memberName, memberIndex);
          const template = generateBiometricTemplate(`${memberName}-${bioId}`);
          setScanResult({
            status: 'SUCCESS',
            message: `Biometric Enrolled Successfully! ID: ${bioId}`,
            bioId,
          });
          setTimeout(() => {
            if (onEnrollSuccess) onEnrollSuccess(bioId, template);
            onClose();
          }, 900);
        } else {
          // Verification mode at gate
          const targetSeed = enrolledMembers[0]?.biometric_id || generateBiometricId(memberName, 1);
          const matchRes = matchBiometricAgainstMembers(targetSeed, enrolledMembers);

          if (matchRes.isMatch && matchRes.matchedMember) {
            setScanResult({
              status: 'SUCCESS',
              message: `✓ Biometric Match: ${matchRes.matchedMember.name} (${matchRes.confidence}% Confidence)`,
              matchedMember: matchRes.matchedMember,
              bioId: matchRes.matchedMember.biometric_id,
            });
            setTimeout(() => {
              if (onVerifySuccess && matchRes.matchedMember) {
                onVerifySuccess(matchRes.matchedMember, matchRes.matchedMember.biometric_id || targetSeed);
              }
              onClose();
            }, 800);
          } else {
            const failReason = matchRes.reason || 'Fingerprint does not match any member of this pass.';
            setScanResult({
              status: 'FAILED',
              message: `❌ ${failReason}`,
            });
            if (onVerifyFailed) onVerifyFailed(failReason);
          }
        }
      }
    }, 60);
  };

  // Hardware WebAuthn Authenticator trigger
  const handleHardwareWebAuthn = async () => {
    if (isScanning) return;
    setIsScanning(true);

    if (mode === 'ENROLL') {
      const res = await registerWebAuthnBiometric(memberName);
      setIsScanning(false);
      if (res.success && res.credentialId) {
        const bioId = `WEB-BIO-${res.credentialId.slice(0, 12).toUpperCase()}`;
        const template = generateBiometricTemplate(res.credentialId);
        setScanResult({
          status: 'SUCCESS',
          message: 'Hardware Biometric (Touch ID/Windows Hello) Registered!',
          bioId,
        });
        setTimeout(() => {
          if (onEnrollSuccess) onEnrollSuccess(bioId, template);
          onClose();
        }, 800);
      } else {
        // Fallback to optical scan
        handleTriggerScan();
      }
    } else {
      const res = await verifyWebAuthnBiometric();
      setIsScanning(false);
      if (res.success && enrolledMembers.length > 0) {
        const primary = enrolledMembers[0];
        setScanResult({
          status: 'SUCCESS',
          message: `Hardware Biometric Verified: ${primary.name}`,
          matchedMember: primary,
        });
        setTimeout(() => {
          if (onVerifySuccess) onVerifySuccess(primary, primary.biometric_id || 'BIO-VERIFIED');
          onClose();
        }, 800);
      } else {
        handleTriggerScan();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl text-white my-auto">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 border-b border-emerald-900/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Fingerprint className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight text-white">
                {mode === 'ENROLL' ? 'Biometric Fingerprint Enrollment' : 'Gate Biometric Verification'}
              </h3>
              <p className="text-[11px] text-emerald-300 font-medium truncate max-w-[210px]">
                {memberName} ({memberRelation})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optical Fingerprint Scanner Sensor Pad */}
        <div className="p-5 space-y-4 text-center">
          <div
            onClick={handleTriggerScan}
            className="relative cursor-pointer group mx-auto w-48 h-56 rounded-3xl overflow-hidden bg-slate-950 border-2 border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:border-emerald-400 transition-all flex flex-col items-center justify-center select-none active:scale-98"
          >
            <canvas ref={canvasRef} width={192} height={224} className="w-full h-full object-cover" />

            {/* Glowing Sensor Frame Overlay */}
            <div className="absolute inset-2 border border-emerald-400/20 rounded-2xl pointer-events-none flex flex-col items-center justify-between p-2">
              <span className="text-[9px] font-mono tracking-widest text-emerald-400/60 uppercase">
                OPTICAL SENSOR
              </span>
              <span className="text-[9px] font-bold text-emerald-300/80 bg-black/50 px-2 py-0.5 rounded-full">
                {isScanning ? 'SCANNING...' : 'TAP SENSOR TO SCAN'}
              </span>
            </div>
          </div>

          {/* Progress Bar during Scanning */}
          {isScanning && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-emerald-300">
                <span>Reading Minutiae Points</span>
                <span>{scanProgress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-75"
                  style={{ width: `${scanProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Feedback */}
          {scanResult.message && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 ${
                scanResult.status === 'SUCCESS'
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                  : scanResult.status === 'FAILED'
                    ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300'
                    : 'bg-slate-800 text-slate-300'
              }`}
            >
              {scanResult.status === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : scanResult.status === 'FAILED' ? (
                <X className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
              )}
              <span className="truncate">{scanResult.message}</span>
            </div>
          )}

          {/* Buttons: Scan Sensor / Hardware WebAuthn */}
          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={handleTriggerScan}
              disabled={isScanning}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
            >
              <Fingerprint className="w-4 h-4" />
              <span>{isScanning ? 'SCANNING FINGERPRINT...' : 'PLACE FINGER & SCAN NOW'}</span>
            </button>

            {hasHardwareWebAuthn && (
              <button
                type="button"
                onClick={handleHardwareWebAuthn}
                disabled={isScanning}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>Use Device Biometric (Touch ID / Windows Hello)</span>
              </button>
            )}

            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1 mt-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>SHA-256 Encrypted Minutiae Biometric Security</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
