import React from 'react';

export type LogoVariant =
  | 'gold-on-black'
  | 'launcher'
  | 'transparent'
  | 'white'
  | 'black'
  | 'adaptive-fg'
  | 'adaptive-bg';

interface BrandLogoProps {
  size?: number;
  variant?: LogoVariant;
  showWordmark?: boolean;
  className?: string;
}

/**
 * Original ALL CUT emblem: geometric letter "A" cleaved by a precision
 * diagonal timeline-cut blade in metallic gold (#D4AF37) and white (#FFFFFF)
 * on deep obsidian black (#080808).
 */
export function buildAllCutSvgMarkup(
  variant: LogoVariant = 'gold-on-black',
  includeWordmark = false,
  pixelSize = 1024
): string {
  const uid = 'acGrad';
  const isLightIcon = variant === 'black';
  const showBg =
    variant === 'gold-on-black' ||
    variant === 'launcher' ||
    variant === 'adaptive-bg';
  const rounded = variant === 'launcher';

  const primaryStroke =
    variant === 'white'
      ? '#FFFFFF'
      : variant === 'black'
        ? '#080808'
        : `url(#${uid})`;
  const secondaryStroke =
    variant === 'white'
      ? '#FFFFFF'
      : variant === 'black'
        ? '#080808'
        : '#FFFFFF';

  const bgRect = showBg
    ? `<rect x="0" y="0" width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="#080808"/>`
    : '';

  const subtleGlow =
    showBg && variant !== 'adaptive-bg'
      ? `<radialGradient id="bgGlow" cx="50%" cy="22%" r="68%">
          <stop offset="0%" stop-color="#D4AF37" stop-opacity="0.22"/>
          <stop offset="65%" stop-color="#080808" stop-opacity="0"/>
        </radialGradient>
        <rect x="0" y="0" width="1024" height="1024" rx="${rounded ? 224 : 0}" fill="url(#bgGlow)"/>`
      : '';

  // Keep symbol strictly inside Android Adaptive Icon 66% safe zone (~174..850)
  const symbolGroup =
    variant === 'adaptive-bg'
      ? `<radialGradient id="adGlow" cx="50%" cy="40%" r="60%">
           <stop offset="0%" stop-color="#2A210B"/>
           <stop offset="100%" stop-color="#080808"/>
         </radialGradient>
         <rect x="0" y="0" width="1024" height="1024" fill="url(#adGlow)"/>`
      : `<g transform="${includeWordmark ? 'translate(0, -68) scale(0.86) translate(83, 83)' : ''}">
          <!-- Left precision leg of geometric A -->
          <path d="M276 764 L486 244 L558 244 L402 630 L348 764 Z" fill="${primaryStroke}"/>
          <!-- Right split leg offset by precision cut -->
          <path d="M548 312 L620 312 L760 764 L668 764 L574 446 Z" fill="${secondaryStroke}"/>
          <!-- Precision diagonal timeline blade slash -->
          <path d="M232 612 L796 426 L772 486 L256 672 Z" fill="${primaryStroke}"/>
          <!-- Timeline playhead accent bar -->
          <rect x="498" y="654" width="118" height="34" rx="4" fill="${primaryStroke}"/>
        </g>`;

  const wordmark = includeWordmark
    ? `<text x="512" y="886" text-anchor="middle" fill="${isLightIcon ? '#080808' : '#FFFFFF'}" font-family="Plus Jakarta Sans, sans-serif" font-weight="800" font-size="112" letter-spacing="26">ALL CUT</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 1024 1024" fill="none">
    <defs>
      <linearGradient id="${uid}" x1="220" y1="220" x2="800" y2="790" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#F7E396"/>
        <stop offset="48%" stop-color="#D4AF37"/>
        <stop offset="100%" stop-color="#9A7615"/>
      </linearGradient>
    </defs>
    ${bgRect}
    ${subtleGlow}
    ${symbolGroup}
    ${wordmark}
  </svg>`;
}

export async function downloadLogoAssetPng(
  variant: LogoVariant,
  includeWordmark: boolean,
  filename: string
): Promise<void> {
  const svg = buildAllCutSvgMarkup(variant, includeWordmark, 1024);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, 1024, 1024);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 32,
  variant = 'launcher',
  showWordmark = false,
  className = '',
}) => {
  const gradId = React.useId();
  const showBg = variant === 'gold-on-black' || variant === 'launcher';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 1024 1024"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={gradId} x1="220" y1="220" x2="800" y2="790" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F7E396" />
            <stop offset="48%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#9A7615" />
          </linearGradient>
        </defs>
        {showBg && (
          <rect
            x="16"
            y="16"
            width="992"
            height="992"
            rx={variant === 'launcher' ? 220 : 0}
            fill="#080808"
            stroke="#D4AF37"
            strokeOpacity="0.38"
            strokeWidth="22"
          />
        )}
        <path
          d="M276 764 L486 244 L558 244 L402 630 L348 764 Z"
          fill={variant === 'white' ? '#FFFFFF' : variant === 'black' ? '#080808' : `url(#${gradId})`}
        />
        <path
          d="M548 312 L620 312 L760 764 L668 764 L574 446 Z"
          fill={variant === 'black' ? '#080808' : '#FFFFFF'}
        />
        <path
          d="M232 612 L796 426 L772 486 L256 672 Z"
          fill={variant === 'white' ? '#FFFFFF' : variant === 'black' ? '#080808' : `url(#${gradId})`}
        />
        <rect
          x="498"
          y="654"
          width="118"
          height="34"
          rx="4"
          fill={variant === 'white' ? '#FFFFFF' : variant === 'black' ? '#080808' : `url(#${gradId})`}
        />
      </svg>
      {showWordmark && (
        <span className="font-display font-extrabold tracking-[0.18em] text-white text-base whitespace-nowrap">
          ALL <span className="text-[#D4AF37]">CUT</span>
        </span>
      )}
    </div>
  );
};

export const SplashScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  React.useEffect(() => {
    const timer = window.setTimeout(onDone, 950);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      role="button"
      tabIndex={0}
      aria-label="Skip splash screen"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDone(); }}
      className="fixed inset-0 z-50 bg-[#080808] flex flex-col items-center justify-center cursor-pointer"
    >
      <div className="relative flex flex-col items-center">
        <svg width="116" height="116" viewBox="0 0 1024 1024" fill="none" className="animate-splash-cut">
          <defs>
            <linearGradient id="splashGold" x1="220" y1="220" x2="800" y2="790" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F7E396" />
              <stop offset="50%" stopColor="#D4AF37" />
              <stop offset="100%" stopColor="#9A7615" />
            </linearGradient>
          </defs>
          <rect x="24" y="24" width="976" height="976" rx="220" fill="#0B0B0B" stroke="#D4AF37" strokeOpacity="0.4" strokeWidth="18" />
          <path d="M276 764 L486 244 L558 244 L402 630 L348 764 Z" fill="url(#splashGold)" />
          <path d="M548 312 L620 312 L760 764 L668 764 L574 446 Z" fill="#FFFFFF" />
          <path d="M232 612 L796 426 L772 486 L256 672 Z" fill="url(#splashGold)" className="animate-splash-blade" />
          <rect x="498" y="654" width="118" height="34" rx="4" fill="url(#splashGold)" />
        </svg>
        <div className="mt-5 font-display text-2xl font-extrabold tracking-[0.26em] text-white">
          ALL <span className="text-[#D4AF37]">CUT</span>
        </div>
        <div className="mt-1.5 text-xs tracking-widest text-neutral-400">
          PRECISION VIDEO ENGINE
        </div>
      </div>
    </div>
  );
};
