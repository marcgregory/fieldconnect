export function Logo({ size = 24, showText = false }: { size?: number; showText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className="flex-shrink-0 drop-shadow-sm">
        <defs>
          <linearGradient id="logo-grad" x1="4" y1="36" x2="36" y2="4" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0f172a" />
            <stop offset="0.55" stopColor="#5f3921" />
            <stop offset="1" stopColor="#cdae79" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="10" fill="url(#logo-grad)" />
        <path d="M22 5L12 21h6l-2 14 12-18h-6l2-12z" fill="#fff8e6" />
      </svg>
      {showText && (
        <span className="font-black tracking-tight text-slate-950" style={{ fontSize: size * 0.58 }}>
          FieldConnect
        </span>
      )}
    </div>
  );
}
