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
      {/* 深藍色圓角背景 (Night) */}
      <rect width="512" height="512" rx="112" fill="#0F172A" />

      {/* 溫暖的黃色彎月 (Lumi/MaMa 守護) */}
      <path
        d="M336.5 352.5C266.084 352.5 209 295.416 209 225C209 178.653 233.729 138.077 272.247 115.15C191.077 122.95 128 191.246 128 275C128 363.366 199.634 435 288 435C355.834 435 413.784 392.835 433.824 332.615C406.879 345.362 372.825 352.5 336.5 352.5Z"
        fill="#FDE047"
      />

      {/* 青藍色安全定位點 (Navigation/Safe Point) */}
      <circle cx="340" cy="200" r="48" fill="#38BDF8" />
      <circle cx="340" cy="200" r="16" fill="#0F172A" />
    </svg>
  )
}
