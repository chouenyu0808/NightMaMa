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
      {/* 深藍色圓角背景 (Night / App Icon Base) */}
      <rect width="512" height="512" rx="112" fill="#0F172A" />

      {/* SVG 遮罩定義區 */}
      <defs>
        <mask id="moon-cutout">
          {/* 白色代表顯示，黑色代表裁切隱藏 */}
          <rect width="512" height="512" fill="white" />
          {/* 用右上角的黑圓，切出彎月的內凹弧度 */}
          <circle cx="310" cy="190" r="130" fill="black" />
        </mask>
      </defs>

      {/* 溫暖黃色彎月 (Lumi/MaMa 守護) */}
      <circle
        cx="230"
        cy="270"
        r="150"
        fill="#FDE047"
        mask="url(#moon-cutout)"
      />

      {/* 青藍色安全定位點 (Navigation / Safe Point) */}
      <g>
        <path
          d="M330 160 C302.4 160 280 182.4 280 210 C280 250 330 320 330 320 C330 320 380 250 380 210 C380 182.4 357.6 160 330 160 Z"
          fill="#38BDF8"
        />
        {/* 定位點中間的挖空 */}
        <circle cx="330" cy="205" r="16" fill="#0F172A" />
      </g>

      {/* 點綴的星光 (AI/夜間元素) */}
      <circle cx="160" cy="150" r="8" fill="#FDE047" opacity="0.9" />
      <circle cx="120" cy="230" r="4" fill="#FDE047" opacity="0.6" />
    </svg>
  )
}
