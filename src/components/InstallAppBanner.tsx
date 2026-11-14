import React from 'react';
import { Download } from 'lucide-react';
import { usePwaInstall } from '../lib/usePwaInstall';

interface InstallAppBannerProps {
  className?: string;
  variant?: 'button' | 'card' | 'compact';
}

export const InstallAppBanner: React.FC<InstallAppBannerProps> = ({
  className = '',
  variant = 'button',
}) => {
  const { isInstallable, isInstalled, promptInstall } = usePwaInstall();

  if (isInstalled) {
    return null;
  }

  // If browser hasn't fired beforeinstallprompt or on iOS/desktop without prompt,
  // we can still offer instructions or click handler.
  const handleClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      // Guide user
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS) {
        alert('📲 To Install on iPhone/iPad:\n\n1. Tap the Share button (square with arrow) at the bottom.\n2. Scroll down and tap "Add to Home Screen".');
      } else {
        alert('📲 To Install App on Mobile / PC:\n\n1. Open menu (⋮) in Chrome or Edge.\n2. Click "Install Ved Upvan Park" or "Add to Home Screen".\n\nOr use the native Windows .exe / Android .apk!');
      }
    }
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer ${className}`}
        title="Install as Desktop / Mobile App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-emerald-950 border border-emerald-500/30 text-white flex items-center justify-between gap-3 shadow-lg ${className}`}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-black flex items-center gap-1.5">
              <span>Install Ved Upvan App</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-bold">Mobile &amp; PC</span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Install on your phone or computer for 1-click launch and offline speed.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
        >
          <Download className="w-4 h-4" />
          <span>Install Now</span>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition cursor-pointer ${className}`}
    >
      <Download className="w-4 h-4" />
      <span>Install App</span>
    </button>
  );
};
