import React from 'react'

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number
}

export default function Logo({ size = 48, style, ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', borderRadius: '22%', ...style }}
      {...props}
    >
      <defs>
        {/* 背景極致夜空漸層 */}
        <linearGradient id="bgGrad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B0F19" />
          <stop offset="50%" stopColor="#1E1035" />
          <stop offset="100%" stopColor="#090D16" />
        </linearGradient>

        {/* 溫暖金黃微光月亮漸層 */}
        <linearGradient id="moonGrad" x1="120" y1="120" x2="380" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF59D" />
          <stop offset="35%" stopColor="#FDE047" />
          <stop offset="70%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* 霓虹安全導航脈衝漸層 */}
        <linearGradient id="pulseGrad" x1="180" y1="140" x2="420" y2="380" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#EC4899" />
        </linearGradient>

        {/* 柔光發光濾鏡 */}
        <filter id="glowFilter" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 1. 極致夜空深色背景 */}
      <rect width="512" height="512" rx="112" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />

      {/* 2. 背景環境光暈 (Ambient Glow) */}
      <circle cx="270" cy="250" r="150" fill="#8B5CF6" opacity="0.2" filter="url(#glowFilter)" />
      <circle cx="350" cy="190" r="85" fill="#38BDF8" opacity="0.25" filter="url(#glowFilter)" />

      {/* 3. 雙重守護護盾弧線 (Protective Safety Shield) */}
      <path
        d="M 140 270 A 150 150 0 0 1 390 140"
        stroke="url(#pulseGrad)"
        strokeWidth="12"
        strokeLinecap="round"
        opacity="0.75"
        strokeDasharray="16 10"
      />

      {/* 4. 溫暖立體黃昏彎月 (Golden Guardian Moon) */}
      <path
        d="M336.5 352.5C266.084 352.5 209 295.416 209 225C209 178.653 233.729 138.077 272.247 115.15C191.077 122.95 128 191.246 128 275C128 363.366 199.634 435 288 435C355.834 435 413.784 392.835 433.824 332.615C406.879 345.362 372.825 352.5 336.5 352.5Z"
        fill="url(#moonGrad)"
      />

      {/* 5. 霓虹安全發光地標 Core Pin */}
      <circle cx="340" cy="190" r="36" fill="url(#pulseGrad)" filter="url(#glowFilter)" />
      <circle cx="340" cy="190" r="16" fill="#FFFFFF" />
      <circle cx="340" cy="190" r="8" fill="#0B0F19" />

      {/* 6. 夜空微光星芒 (Safety Stars) */}
      <path d="M 175 160 L 179 172 L 191 176 L 179 180 L 175 192 L 171 180 L 159 176 L 171 172 Z" fill="#FDE047" opacity="0.95" />
      <path d="M 400 310 L 403 318 L 411 321 L 403 324 L 400 332 L 397 324 L 389 321 L 397 318 Z" fill="#38BDF8" opacity="0.9" />
    </svg>
  )
}
