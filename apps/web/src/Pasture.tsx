/** Silueta de lomas y pasto, decorativa. Los colores salen de los tokens de marca. */
export function Pasture({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 96 C60 60 120 70 190 92 S320 70 400 88 V160 H0Z" fill="#1d5a3f" opacity=".55" />
      <path
        d="M0 118 C70 88 150 100 220 116 S340 96 400 110 V160 H0Z"
        fill="#256b4a"
        opacity=".8"
      />
      <path
        d="M0 138 C80 120 170 128 250 140 S350 128 400 134 V160 H0Z"
        fill="#2f9c62"
        opacity=".55"
      />
      <g fill="#14402e" opacity=".9">
        <path d="M58 104 l10-30 10 30z M63 112 l5-14 5 14z" />
        <circle cx="300" cy="96" r="14" />
        <rect x="298" y="104" width="4" height="14" />
        <circle cx="326" cy="100" r="10" />
        <rect x="324" y="106" width="4" height="12" />
      </g>
      <g fill="#d8b558" opacity=".9">
        <circle cx="344" cy="26" r="14" />
      </g>
    </svg>
  );
}
