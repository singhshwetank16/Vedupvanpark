import React from 'react';
import { PhoneCall } from 'lucide-react';

interface PromotionalTickerProps {
  className?: string;
}

/**
 * PromotionalTicker
 * Continuous seamless marquee running horizontally across the bottom footer.
 * Moves smoothly from the right corner towards the left corner in an infinite loop.
 * Bold, prominently sized (easy to read from distance), clean typography without any sparkle/star symbols.
 * Completely hidden during receipt and report printing (.no-print).
 */
export const PromotionalTicker: React.FC<PromotionalTickerProps> = ({ className = 'bottom-0' }) => {
  const messageBlock = (
    <div className="flex items-center gap-3.5 shrink-0 px-8">
      {/* Design & Developed Attribution */}
      <span className="text-emerald-300 font-extrabold text-sm sm:text-base tracking-wide">
        Design &amp; Developed by <span className="text-white font-black underline decoration-emerald-400 decoration-2">Techbuzz Fusion</span> || <span className="text-amber-300 font-black">Shwetank Singh</span>
      </span>

      <span className="text-emerald-400 font-black mx-3 text-base">||</span>

      {/* Main Promotional Business Pitch */}
      <span className="text-white font-bold text-sm sm:text-base tracking-wide">
        Take your business to the next level with smarter technology!
      </span>

      <span className="text-emerald-200 font-bold text-sm sm:text-base">
        Contact us today at
      </span>

      {/* Clickable Highlighted Phone Number */}
      <a
        href="tel:+918439522256"
        className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-sm sm:text-base hover:bg-amber-300 transition-colors shadow-md shadow-amber-400/25 shrink-0"
        title="Call +91-8439522256"
      >
        <PhoneCall className="w-4 h-4 text-slate-950 stroke-[3] shrink-0" />
        <span>+91-8439522256</span>
      </a>

      <span className="text-white font-bold text-sm sm:text-base tracking-wide">
        to find the right software solution for your business.
      </span>

      <span className="text-emerald-400 font-black mx-4 text-base">||</span>
    </div>
  );

  return (
    <div
      aria-label="Promotional Announcement"
      className={`fixed left-0 right-0 z-50 bg-[#021812] border-t-2 border-emerald-500/50 shadow-[0_-4px_25px_rgba(0,0,0,0.6)] py-2.5 sm:py-3 overflow-hidden select-none no-print transition-all ${className}`}
    >
      <div className="w-full overflow-hidden flex">
        {/* Continuous ticker track moving right to left */}
        <div className="flex w-max animate-footer-marquee hover:[animation-play-state:paused] cursor-default">
          {messageBlock}
          {messageBlock}
          {messageBlock}
          {messageBlock}
        </div>
      </div>
    </div>
  );
};
