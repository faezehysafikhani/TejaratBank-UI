import React from 'react';

/** A run of fine parallel strokes along one curve — gives the silk-thread sheen. */
const Hair: React.FC<{ d: string; n?: number; step?: number; color?: string; opacity?: number; width?: number; dx?: number; dy?: number }> = ({ d, n = 14, step = 5, color = '#d1fae5', opacity = 0.35, width = 0.7, dx = 1, dy = 0 }) => (
  <g fill="none" stroke={color} strokeWidth={width}>
    {Array.from({ length: n }, (_, i) => (
      <path key={i} d={d} transform={`translate(${i * step * dx} ${i * step * dy})`} strokeOpacity={opacity * (1 - i / (n * 1.25))} />
    ))}
  </g>
);

/** Flowing green silk ribbons — decorative background art for the login page (right side). */
export const LoginSilk: React.FC<{ className?: string }> = ({ className }) => (
  <svg aria-hidden="true" className={className} viewBox="0 0 1100 900" preserveAspectRatio="xMaxYMid slice" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 34%)', maskImage: 'linear-gradient(to right, transparent 0%, #000 34%)' }}>
    <defs>
      <linearGradient id="ls-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#065f46" /><stop offset="0.55" stopColor="#053f30" /><stop offset="1" stopColor="#011f17" /></linearGradient>
      <linearGradient id="ls-r1" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stopColor="#6ee7b7" /><stop offset="0.35" stopColor="#10b981" /><stop offset="1" stopColor="#047857" /></linearGradient>
      <linearGradient id="ls-r2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10b981" /><stop offset="0.5" stopColor="#065f46" /><stop offset="1" stopColor="#022c22" /></linearGradient>
      <linearGradient id="ls-r3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="0.45" stopColor="#059669" /><stop offset="1" stopColor="#064e3b" /></linearGradient>
      <linearGradient id="ls-r4" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#a7f3d0" /><stop offset="0.35" stopColor="#34d399" /><stop offset="0.75" stopColor="#047857" /><stop offset="1" stopColor="#022c22" /></linearGradient>
      <linearGradient id="ls-sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ecfdf5" stopOpacity="0" /><stop offset="0.5" stopColor="#ecfdf5" stopOpacity="0.45" /><stop offset="1" stopColor="#ecfdf5" stopOpacity="0" /></linearGradient>
      <linearGradient id="ls-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f0fdf4" stopOpacity="0.95" /><stop offset="0.22" stopColor="#f0fdf4" stopOpacity="0" /></linearGradient>
      <filter id="ls-soft"><feGaussianBlur stdDeviation="6" /></filter>
    </defs>

    <rect width="1100" height="900" fill="url(#ls-bg)" />

    {/* deep back folds, upper right */}
    <path d="M1100 0 H760 C700 130 800 250 740 390 C690 510 780 600 760 720 C750 800 800 850 840 900 H1100 Z" fill="url(#ls-r2)" />
    <path d="M900 0 C860 110 940 200 900 320 C870 420 940 470 930 560" fill="none" stroke="#6ee7b7" strokeOpacity="0.4" strokeWidth="1.2" />

    {/* large rising ribbon, top-left to centre */}
    <path d="M470 0 C560 120 420 250 470 400 C520 540 650 520 700 650 C735 740 690 830 610 900 H820 C930 790 800 720 820 610 C840 480 990 430 940 270 C905 160 930 70 990 0 Z" fill="url(#ls-r1)" />
    <Hair d="M470 0 C560 120 420 250 470 400 C520 540 650 520 700 650 C735 740 690 830 610 900" n={16} step={6} opacity={0.4} />
    <path d="M500 0 C585 115 445 255 495 400 C545 530 668 515 722 650" fill="none" stroke="url(#ls-sheen)" strokeWidth="14" filter="url(#ls-soft)" opacity="0.55" />

    {/* second ribbon on top, glossy */}
    <path d="M640 0 C700 90 640 190 700 290 C760 390 900 360 930 470 C955 560 900 640 940 720 C965 770 1010 800 1100 810 V900 H900 C820 800 880 740 850 660 C820 580 700 560 650 450 C600 340 700 230 640 130 C615 85 590 40 560 0 Z" fill="url(#ls-r3)" opacity="0.92" />
    <Hair d="M640 0 C700 90 640 190 700 290 C760 390 900 360 930 470 C955 560 900 640 940 720" n={12} step={5} opacity={0.35} color="#a7f3d0" />
    <path d="M610 0 C660 90 600 195 665 300 C730 410 880 385 905 480" fill="none" stroke="#ecfdf5" strokeOpacity="0.55" strokeWidth="1.6" />

    {/* narrow bright streaks, top right */}
    <path d="M880 0 C850 60 900 110 870 180 C845 240 880 270 860 330 L905 330 C930 270 895 235 920 175 C950 105 905 60 940 0 Z" fill="#34d399" opacity="0.8" />
    <path d="M1010 0 C985 70 1030 120 1005 190 C985 250 1020 290 1000 360 L1040 360 C1065 290 1030 250 1050 190 C1075 120 1040 70 1070 0 Z" fill="#10b981" opacity="0.7" />
    <Hair d="M880 0 C850 60 900 110 870 180 C845 240 880 270 860 330" n={8} step={5} opacity={0.5} color="#ecfdf5" />

    {/* big lower wave, light mint to deep green */}
    <path d="M0 900 C70 790 220 720 400 740 C600 762 700 880 880 800 C990 750 1050 650 1100 560 V900 Z" fill="url(#ls-r4)" />
    <path d="M0 900 C70 805 220 745 400 765 C600 787 700 900 880 825 C990 775 1050 690 1100 610 V900 Z" fill="url(#ls-r2)" opacity="0.8" />
    <Hair d="M0 900 C70 790 220 720 400 740 C600 762 700 880 880 800 C990 750 1050 650 1100 560" n={14} step={7} dy={-1} dx={0} opacity={0.45} color="#ecfdf5" />
    <path d="M0 860 C110 740 300 690 470 720 C650 752 760 850 940 760 C1010 725 1060 650 1100 590" fill="none" stroke="#ecfdf5" strokeOpacity="0.6" strokeWidth="1.4" />

  </svg>
);
