import React, { useMemo } from 'react';

/**
 * NatureBackground
 * Animated living park environment with:
 * - Lush emerald forest gradient & sunbeams
 * - Swaying canopy branches and hanging vines
 * - Rolling grassy hills with grazing deer (हिरण), peacock & fauna silhouettes
 * - Flocks of soaring birds gliding across the sky
 * - Fluttering butterflies drifting in gentle arcs
 * - Realistic falling & floating leaves swaying with the breeze
 * - Glowing ambient fireflies (जुगनू)
 * 
 * Optimized for 60fps GPU performance, non-blocking (pointer-events-none),
 * and completely hidden during printing (.no-print).
 */
export const NatureBackground: React.FC = () => {
  // Pre-generate deterministic leaves to avoid hydration mismatches
  const leaves = useMemo(() => {
    return [
      { id: 1, left: '6%', size: 24, dur: 14, delay: 0, anim: 'leaf-drift-1', color: '#34d399', rot: 25 },
      { id: 2, left: '16%', size: 18, dur: 18, delay: 3, anim: 'leaf-drift-2', color: '#10b981', rot: -40 },
      { id: 3, left: '28%', size: 22, dur: 15, delay: 7, anim: 'leaf-drift-1', color: '#6ee7b7', rot: 15 },
      { id: 4, left: '38%', size: 20, dur: 21, delay: 1, anim: 'leaf-drift-2', color: '#fbbf24', rot: 80 },
      { id: 5, left: '50%', size: 26, dur: 16, delay: 9, anim: 'leaf-drift-1', color: '#059669', rot: -20 },
      { id: 6, left: '62%', size: 17, dur: 19, delay: 4, anim: 'leaf-drift-2', color: '#34d399', rot: 45 },
      { id: 7, left: '74%', size: 24, dur: 17, delay: 6, anim: 'leaf-drift-1', color: '#a7f3d0', rot: -60 },
      { id: 8, left: '85%', size: 20, dur: 22, delay: 2, anim: 'leaf-drift-2', color: '#f59e0b', rot: 30 },
      { id: 9, left: '93%', size: 19, dur: 14, delay: 8, anim: 'leaf-drift-1', color: '#10b981', rot: 10 },
      { id: 10, left: '11%', size: 21, dur: 20, delay: 11, anim: 'leaf-drift-2', color: '#6ee7b7', rot: -15 },
      { id: 11, left: '44%', size: 18, dur: 17, delay: 13, anim: 'leaf-drift-1', color: '#34d399', rot: 50 },
      { id: 12, left: '80%', size: 23, dur: 19, delay: 10, anim: 'leaf-drift-2', color: '#10b981', rot: -75 },
    ];
  }, []);

  // Pre-generate fireflies
  const fireflies = useMemo(() => {
    return [
      { id: 1, left: '12%', top: '65%', dur: 7, delay: 0, size: 4 },
      { id: 2, left: '24%', top: '78%', dur: 9, delay: 2, size: 5 },
      { id: 3, left: '42%', top: '70%', dur: 8, delay: 1, size: 3.5 },
      { id: 4, left: '58%', top: '82%', dur: 10, delay: 4, size: 5 },
      { id: 5, left: '72%', top: '68%', dur: 6.5, delay: 3, size: 4.5 },
      { id: 6, left: '88%', top: '75%', dur: 8.5, delay: 2.5, size: 4 },
      { id: 7, left: '33%', top: '85%', dur: 9.5, delay: 5, size: 3 },
      { id: 8, left: '79%', top: '88%', dur: 7.5, delay: 1.5, size: 4 },
    ];
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden no-print select-none"
      style={{
        background: `
          radial-gradient(circle at 18% 12%, rgba(52, 211, 153, 0.22) 0%, transparent 45%),
          radial-gradient(circle at 82% 18%, rgba(16, 185, 129, 0.16) 0%, transparent 50%),
          radial-gradient(circle at 50% 90%, rgba(5, 150, 105, 0.20) 0%, transparent 60%),
          linear-gradient(180deg, #031c15 0%, #052a1f 35%, #073527 65%, #031f17 100%)
        `,
      }}
    >
      {/* 1. Golden Sunbeams / God-Rays from Canopy */}
      <div
        className="absolute -top-32 -left-32 w-[600px] h-[700px] rounded-full opacity-20 filter blur-3xl pointer-events-none"
        style={{
          background: 'conic-gradient(from 120deg at 20% 20%, #fef08a, #34d399, transparent 65%)',
          animation: 'sunbeam-pulse 9s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute -top-40 right-10 w-[500px] h-[500px] rounded-full opacity-15 filter blur-3xl pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(110, 231, 183, 0.35) 0%, transparent 70%)',
          animation: 'sunbeam-pulse 11s ease-in-out infinite alternate-reverse',
        }}
      />

      {/* 2. Overhanging Forest Canopies & Hanging Leaves (Top Corners) */}
      {/* Top Left Branch & Foliage */}
      <svg
        className="absolute -top-6 -left-6 w-72 sm:w-96 md:w-[480px] h-auto text-emerald-950/90 drop-shadow-xl"
        viewBox="0 0 400 240"
        fill="currentColor"
        style={{ transformOrigin: 'top left', animation: 'sway-left 8s ease-in-out infinite' }}
      >
        {/* Branch */}
        <path
          d="M0 0 C 80 40, 160 30, 260 70 C 290 82, 330 90, 360 85 C 330 98, 280 95, 240 85 C 160 55, 90 70, 0 40 Z"
          fill="#02140f"
        />
        {/* Leaf Clustered Canopy */}
        <path
          d="M-20 -10 C 20 60, 80 80, 120 60 C 160 40, 190 85, 230 75 C 270 65, 300 95, 330 80 C 350 70, 370 85, 380 75 C 370 110, 330 115, 300 100 C 260 125, 210 110, 180 95 C 140 120, 80 110, 40 85 C 10 105, -20 80, -20 -10 Z"
          fill="#042017"
          opacity="0.95"
        />
        {/* Hanging Leafy Fronds */}
        <g fill="#063224" opacity="0.9">
          {/* Peepal / Vine leaf 1 */}
          <path d="M 120 75 C 125 110, 145 130, 140 145 C 130 135, 110 115, 115 80 Z" />
          {/* Peepal / Vine leaf 2 */}
          <path d="M 180 90 C 190 130, 215 155, 210 170 C 195 155, 175 130, 175 95 Z" />
          {/* Peepal / Vine leaf 3 */}
          <path d="M 250 85 C 265 120, 285 140, 280 155 C 270 140, 250 120, 245 90 Z" />
          {/* Leaf accent highlights in vibrant emerald */}
          <path d="M 70 50 C 95 85, 110 95, 105 105 C 95 95, 75 80, 68 55 Z" fill="#0d523b" />
          <path d="M 310 90 C 325 115, 335 125, 330 135 C 322 125, 310 110, 305 92 Z" fill="#0d523b" />
        </g>
      </svg>

      {/* Top Right Branch & Foliage */}
      <svg
        className="absolute -top-6 -right-6 w-64 sm:w-88 md:w-[420px] h-auto text-emerald-950/90 drop-shadow-xl"
        viewBox="0 0 380 220"
        fill="currentColor"
        style={{ transformOrigin: 'top right', animation: 'sway-right 9s ease-in-out infinite' }}
      >
        <path
          d="M380 0 C 310 35, 240 30, 150 65 C 120 78, 80 82, 50 80 C 80 92, 130 88, 170 78 C 240 50, 300 60, 380 35 Z"
          fill="#02140f"
        />
        <path
          d="M400 -10 C 360 55, 310 75, 270 58 C 230 42, 200 80, 160 70 C 120 62, 90 90, 60 78 C 45 70, 20 80, 15 72 C 30 105, 70 108, 100 95 C 135 118, 185 105, 215 90 C 255 112, 310 105, 350 80 C 380 98, 400 75, 400 -10 Z"
          fill="#042017"
          opacity="0.95"
        />
        <g fill="#063224" opacity="0.9">
          <path d="M 270 70 C 260 105, 240 128, 245 142 C 255 130, 275 110, 275 75 Z" />
          <path d="M 200 85 C 190 120, 170 145, 175 160 C 185 145, 205 125, 205 90 Z" />
          <path d="M 130 80 C 120 110, 105 130, 110 142 C 118 130, 132 112, 135 85 Z" />
          <path d="M 320 65 C 305 95, 290 110, 295 122 C 305 110, 320 95, 325 70 Z" fill="#0d523b" />
        </g>
      </svg>

      {/* 3. Soaring Birds (Gliding Across Sky) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Bird 1: High Sky Glide */}
        <div
          className="absolute top-16 left-0"
          style={{ animation: 'bird-fly-across-1 26s linear infinite' }}
        >
          <svg className="w-8 h-8 text-emerald-400/80 drop-shadow-md" viewBox="0 0 50 30" fill="currentColor">
            <path
              d="M 2 16 Q 14 0 25 12 Q 36 0 48 16 Q 36 8 25 18 Q 14 8 2 16 Z"
              style={{ transformOrigin: 'center', animation: 'bird-wings 0.7s ease-in-out infinite' }}
            />
          </svg>
        </div>

        {/* Bird 2 & 3: Companion Birds Following */}
        <div
          className="absolute top-28 left-0"
          style={{ animation: 'bird-fly-across-2 32s linear infinite', animationDelay: '5s' }}
        >
          <div className="relative">
            <svg className="w-6 h-6 text-emerald-300/70" viewBox="0 0 50 30" fill="currentColor">
              <path
                d="M 2 16 Q 14 0 25 12 Q 36 0 48 16 Q 36 8 25 18 Q 14 8 2 16 Z"
                style={{ transformOrigin: 'center', animation: 'bird-wings 0.65s ease-in-out infinite' }}
              />
            </svg>
            <svg className="w-4 h-4 text-emerald-200/60 absolute -top-4 -left-6" viewBox="0 0 50 30" fill="currentColor">
              <path
                d="M 2 16 Q 14 0 25 12 Q 36 0 48 16 Q 36 8 25 18 Q 14 8 2 16 Z"
                style={{ transformOrigin: 'center', animation: 'bird-wings 0.6s ease-in-out infinite' }}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* 4. Animated Fluttering Butterflies (तितलियाँ) */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Butterfly 1 (Emerald/Cyan) */}
        <div
          className="absolute"
          style={{ animation: 'butterfly-flight-1 22s ease-in-out infinite' }}
        >
          <div
            className="flex items-center"
            style={{ animation: 'butterfly-wing 0.28s ease-in-out infinite alternate' }}
          >
            <svg className="w-6 h-6 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" viewBox="0 0 32 32" fill="currentColor">
              {/* Left Wing */}
              <path d="M 16 16 C 14 6, 2 6, 4 15 C 5 21, 13 18, 16 17 Z" fill="#34d399" />
              <path d="M 16 17 C 13 22, 6 25, 7 28 C 9 30, 15 24, 16 18 Z" fill="#10b981" />
              {/* Right Wing */}
              <path d="M 16 16 C 18 6, 30 6, 28 15 C 27 21, 19 18, 16 17 Z" fill="#34d399" />
              <path d="M 16 17 C 19 22, 26 25, 25 28 C 23 30, 17 24, 16 18 Z" fill="#10b981" />
              {/* Body */}
              <ellipse cx="16" cy="17" rx="1.5" ry="7" fill="#064e3b" />
            </svg>
          </div>
        </div>

        {/* Butterfly 2 (Golden Monarch Amber) */}
        <div
          className="absolute"
          style={{ animation: 'butterfly-flight-2 28s ease-in-out infinite', animationDelay: '8s' }}
        >
          <div
            className="flex items-center"
            style={{ animation: 'butterfly-wing 0.24s ease-in-out infinite alternate' }}
          >
            <svg className="w-5 h-5 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" viewBox="0 0 32 32" fill="currentColor">
              <path d="M 16 16 C 14 6, 2 6, 4 15 C 5 21, 13 18, 16 17 Z" fill="#f59e0b" />
              <path d="M 16 17 C 13 22, 6 25, 7 28 C 9 30, 15 24, 16 18 Z" fill="#d97706" />
              <path d="M 16 16 C 18 6, 30 6, 28 15 C 27 21, 19 18, 16 17 Z" fill="#f59e0b" />
              <path d="M 16 17 C 19 22, 26 25, 25 28 C 23 30, 17 24, 16 18 Z" fill="#d97706" />
              <ellipse cx="16" cy="17" rx="1.2" ry="6" fill="#78350f" />
            </svg>
          </div>
        </div>
      </div>

      {/* 5. Floating / Drifting Park Leaves (पत्ते) */}
      <div className="absolute inset-0 pointer-events-none">
        {leaves.map(leaf => (
          <div
            key={leaf.id}
            className="absolute top-0 opacity-0"
            style={{
              left: leaf.left,
              animation: `${leaf.anim} ${leaf.dur}s linear infinite`,
              animationDelay: `${leaf.delay}s`,
            }}
          >
            <svg
              width={leaf.size}
              height={leaf.size}
              viewBox="0 0 24 24"
              fill={leaf.color}
              className="drop-shadow-sm filter"
              style={{
                transform: `rotate(${leaf.rot}deg)`,
                opacity: 0.85,
              }}
            >
              {/* Natural Leaf Path with subtle spine */}
              <path d="M 12 2 C 18 6, 22 13, 19 19 C 15 22, 7 20, 4 14 C 2 8, 8 3, 12 2 Z" />
              <path d="M 12 4 Q 13 12 17 18" stroke="#043224" strokeWidth="0.8" fill="none" opacity="0.6" />
            </svg>
          </div>
        ))}
      </div>

      {/* 6. Glowing Ambient Fireflies (जुगनू) */}
      <div className="absolute inset-0 pointer-events-none">
        {fireflies.map(f => (
          <div
            key={f.id}
            className="absolute rounded-full"
            style={{
              left: f.left,
              top: f.top,
              width: `${f.size}px`,
              height: `${f.size}px`,
              backgroundColor: '#a7f3d0',
              boxShadow: '0 0 12px 3px rgba(110, 231, 183, 0.9), 0 0 24px 6px rgba(16, 185, 129, 0.6)',
              animation: `firefly-float ${f.dur}s ease-in-out infinite`,
              animationDelay: `${f.delay}s`,
            }}
          />
        ))}
      </div>

      {/* 7. Bottom Park Horizon, Grassy Hills & Wildlife (हिरण / Animals) */}
      <div className="absolute bottom-0 left-0 right-0 h-44 sm:h-56 md:h-64 pointer-events-none flex items-end">
        <svg
          className="w-full h-full preserve-3d"
          viewBox="0 0 1200 240"
          preserveAspectRatio="none"
          fill="none"
        >
          {/* Layer 1: Distant Misty Hill Silhouette */}
          <path
            d="M 0 160 Q 250 110, 500 145 T 1000 125 Q 1120 135, 1200 150 L 1200 240 L 0 240 Z"
            fill="#03251c"
            opacity="0.55"
          />

          {/* Layer 2: Midground Rolling Green Mounds with Trees */}
          <path
            d="M 0 180 Q 200 130, 420 165 T 850 140 Q 1050 150, 1200 170 L 1200 240 L 0 240 Z"
            fill="#021d15"
            opacity="0.8"
          />

          {/* Distant Tree Silhouettes along the midground ridge */}
          <g fill="#011610" opacity="0.75">
            {/* Tree cluster on left hill */}
            <circle cx="210" cy="140" r="22" />
            <circle cx="230" cy="135" r="26" />
            <circle cx="252" cy="142" r="20" />
            <rect x="226" y="152" width="7" height="20" />

            {/* Tree cluster mid-right */}
            <circle cx="820" cy="142" r="24" />
            <circle cx="845" cy="132" r="28" />
            <circle cx="870" cy="140" r="22" />
            <rect x="842" y="150" width="7" height="22" />
          </g>

          {/* Layer 3: Foreground Grassy Park Lawn */}
          <path
            d="M 0 200 Q 180 165, 360 185 T 760 175 Q 980 168, 1200 190 L 1200 240 L 0 240 Z"
            fill="#02150f"
          />
        </svg>

        {/* ==============================================================
            WILDLIFE SILHOUETTES (DEER & PEACOCK IN PARK)
            ============================================================== */}

        {/* Wildlife 1: Majestic Stag (बारहसिंगा / हिरण) on Left Lawn */}
        <div
          className="absolute bottom-6 sm:bottom-8 left-4 sm:left-12 md:left-24 drop-shadow-xl"
          style={{ animation: 'deer-breathe 4s ease-in-out infinite' }}
        >
          <svg
            className="w-16 h-20 sm:w-20 sm:h-24 md:w-24 md:h-28 text-emerald-950/95"
            viewBox="0 0 100 120"
            fill="currentColor"
          >
            {/* Antlers / सींग */}
            <path
              d="M 52 35 C 50 25, 42 16, 36 10 C 34 8, 38 12, 42 16 C 36 12, 30 7, 24 2 C 26 6, 32 14, 38 20 C 32 18, 25 17, 18 16 C 24 20, 34 24, 46 28 Z"
              fill="#01130d"
            />
            <path
              d="M 55 35 C 58 25, 66 16, 72 10 C 74 8, 70 12, 66 16 C 72 12, 78 7, 84 2 C 82 6, 76 14, 70 20 C 76 18, 83 17, 90 16 C 84 20, 74 24, 62 28 Z"
              fill="#01130d"
            />
            {/* Head & Ears */}
            <path d="M 46 32 C 43 28, 38 28, 36 30 C 40 33, 44 35, 47 36 Z" fill="#01130d" />
            <path d="M 62 32 C 65 28, 70 28, 72 30 C 68 33, 64 35, 61 36 Z" fill="#01130d" />
            <path d="M 48 30 C 50 38, 54 44, 54 48 C 50 48, 48 44, 46 38 Z" />
            {/* Elegant Neck */}
            <path d="M 48 40 C 46 52, 44 65, 40 75 C 48 76, 56 70, 56 50 C 56 44, 54 38, 50 36 Z" />
            {/* Muscular Torso */}
            <path d="M 40 72 C 32 75, 20 78, 14 84 C 12 90, 16 98, 28 98 C 42 98, 56 94, 62 82 C 60 76, 52 72, 40 72 Z" />
            {/* Slender Legs */}
            {/* Front Legs */}
            <path d="M 46 86 L 44 116 L 47 116 L 50 88 Z" />
            <path d="M 52 84 L 54 116 L 57 116 L 56 86 Z" opacity="0.85" />
            {/* Back Legs */}
            <path d="M 22 88 C 20 96, 16 104, 18 116 L 21 116 C 21 106, 26 98, 27 90 Z" />
            <path d="M 26 88 C 24 96, 22 104, 23 116 L 26 116 C 27 106, 30 98, 32 90 Z" opacity="0.85" />
            {/* Fluffy Tail */}
            <path d="M 13 83 C 9 86, 8 91, 12 92 C 14 91, 14 86, 13 83 Z" />
          </svg>
        </div>

        {/* Wildlife 2: Grazing Doe / Gentle Fawn on Right Lawn */}
        <div
          className="absolute bottom-4 sm:bottom-6 right-6 sm:right-16 md:right-28 drop-shadow-xl hidden xs:block"
          style={{ animation: 'deer-breathe 4.5s ease-in-out infinite', animationDelay: '1.2s' }}
        >
          <svg
            className="w-16 h-14 sm:w-20 sm:h-18 md:w-22 md:h-20 text-emerald-950/95"
            viewBox="0 0 100 80"
            fill="currentColor"
          >
            {/* Grazing Deer Body (head lowered feeding on grass) */}
            {/* Torso */}
            <path d="M 40 32 C 55 30, 72 32, 80 40 C 82 48, 76 56, 62 58 C 48 58, 36 54, 32 44 C 32 38, 36 34, 40 32 Z" />
            {/* Neck lowering down to grass on left */}
            <path d="M 36 38 C 28 44, 20 54, 12 66 C 14 68, 20 68, 24 60 C 28 52, 34 46, 38 42 Z" />
            {/* Head near ground */}
            <path d="M 12 64 C 8 68, 6 72, 8 74 C 11 74, 15 70, 16 66 Z" />
            {/* Ears */}
            <path d="M 18 58 C 16 52, 14 50, 12 52 C 14 55, 17 58, 19 60 Z" />
            {/* Tail */}
            <path d="M 80 40 C 85 42, 86 47, 82 48 C 80 47, 80 43, 80 40 Z" />
            {/* Slender Legs on Grass */}
            <path d="M 38 48 L 34 76 L 37 76 L 42 50 Z" />
            <path d="M 44 48 L 42 76 L 45 76 L 48 50 Z" opacity="0.85" />
            <path d="M 68 52 L 67 76 L 70 76 L 73 54 Z" />
            <path d="M 74 50 L 75 76 L 78 76 L 78 52 Z" opacity="0.85" />
          </svg>
        </div>

        {/* Wildlife 3: Graceful Peacock (राष्ट्रीय पक्षी - मोर) standing on mound */}
        <div
          className="absolute bottom-5 sm:bottom-7 left-1/3 drop-shadow-lg hidden lg:block opacity-90"
          style={{ animation: 'sway-left 6s ease-in-out infinite' }}
        >
          <svg className="w-14 h-16 text-emerald-950" viewBox="0 0 70 80" fill="currentColor">
            {/* Crest on head */}
            <circle cx="36" cy="14" r="1.5" fill="#34d399" />
            <circle cx="38" cy="12" r="1.5" fill="#34d399" />
            <circle cx="40" cy="14" r="1.5" fill="#34d399" />
            <path d="M 37 15 L 36 20 M 38 14 L 37 20 M 39 15 L 38 20" stroke="#01130d" strokeWidth="0.8" />
            {/* Head & Beak */}
            <path d="M 34 20 Q 38 18 42 22 Q 44 23 48 24 Q 44 26 40 26 Q 36 26 34 20 Z" />
            {/* S-curved Royal Neck */}
            <path d="M 36 24 Q 30 32 34 40 Q 36 46 32 50 Q 38 52 40 44 Q 40 34 38 24 Z" />
            {/* Body */}
            <path d="M 30 46 Q 24 50 20 60 Q 28 62 36 52 Z" />
            {/* Sweeping Long Tail Feathers with iridescent eyespots */}
            <path d="M 22 55 Q 10 65 0 76 Q 16 74 28 58 Z" fill="#042a1e" />
            <circle cx="10" cy="68" r="2.5" fill="#10b981" />
            <circle cx="16" cy="64" r="2.5" fill="#34d399" />
            {/* Slender legs */}
            <path d="M 26 58 L 24 76 L 26 76 Z" />
            <path d="M 30 56 L 30 76 L 32 76 Z" />
          </svg>
        </div>

        {/* Foreground Grass Blades & Wild Flora */}
        <div className="absolute -bottom-1 left-0 right-0 flex justify-between overflow-hidden opacity-90">
          <svg className="w-full h-8 text-[#01110b]" preserveAspectRatio="none" viewBox="0 0 600 40" fill="currentColor">
            <path d="
              M 0 40 L 0 20 Q 10 5, 20 30 Q 30 10, 45 40 Q 55 15, 65 35 Q 75 8, 90 40 
              Q 105 12, 120 38 Q 135 5, 150 40 Q 165 14, 180 35 Q 195 8, 210 40 
              Q 230 10, 250 38 Q 270 5, 290 40 Q 310 12, 330 35 Q 350 7, 370 40 
              Q 390 14, 410 38 Q 430 8, 450 40 Q 470 12, 490 35 Q 510 5, 530 40 
              Q 550 14, 570 36 Q 585 8, 600 40 Z" 
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

