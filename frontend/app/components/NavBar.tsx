'use client'

import { useRouter } from 'next/navigation'
import { IconMap, IconMic, IconSos } from '@/components/Icons'

export function NavBar({ active }: { active: 'home' | 'companion' | 'sos' | 'settings' }) {
  const router = useRouter()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      height: 72, background: 'rgba(15, 23, 42, 0.92)', backdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around'
    }}>
      {/* 導航 (Home) */}
      <button
        onClick={() => router.push('/')}
        style={{
          background: 'none', border: 'none',
          color: active === 'home' ? '#a78bfa' : 'rgba(255,255,255,0.5)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
        }}
      >
        <IconMap size={22} color={active === 'home' ? '#a78bfa' : 'rgba(255,255,255,0.5)'} />
        <span style={{ fontSize: 11, fontWeight: active === 'home' ? 800 : 500 }}>導航</span>
        {active === 'home' && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa' }} />}
      </button>

      {/* 陪伴 (Companion) */}
      <button
        onClick={() => router.push('/companion')}
        style={{
          background: 'none', border: 'none',
          color: active === 'companion' ? '#a78bfa' : 'rgba(255,255,255,0.5)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
        }}
      >
        <IconMic size={22} color={active === 'companion' ? '#a78bfa' : 'rgba(255,255,255,0.5)'} />
        <span style={{ fontSize: 11, fontWeight: active === 'companion' ? 800 : 500 }}>陪伴</span>
        {active === 'companion' && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#a78bfa' }} />}
      </button>

      {/* SOS (Emergency) */}
      <button
        onClick={() => router.push('/sos')}
        style={{
          background: 'none', border: 'none',
          color: active === 'sos' ? '#ef4444' : 'rgba(255,255,255,0.5)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer'
        }}
      >
        <IconSos size={22} color={active === 'sos' ? '#ef4444' : 'rgba(255,255,255,0.5)'} />
        <span style={{ fontSize: 11, fontWeight: active === 'sos' ? 800 : 500 }}>SOS</span>
        {active === 'sos' && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#ef4444' }} />}
      </button>
    </nav>
  )
}

export default NavBar
