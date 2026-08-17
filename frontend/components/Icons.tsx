import React from 'react'
import { Icon } from '@iconify/react'

export interface IconProps {
  size?: number
  color?: string
  className?: string
  style?: React.CSSProperties
}

/** Factory that wraps an Iconify icon name into a component matching our existing IconProps API. */
function makeIcon(iconName: string) {
  function IconComponent({ size = 18, color = 'currentColor', className, style }: IconProps) {
    return <Icon icon={iconName} width={size} height={size} color={color} className={className} style={style} />
  }
  return IconComponent
}

// ─── Existing icon set (previously hand-drawn SVGs) ────────────────────────
export const IconShield = makeIcon('lucide:shield')
export const IconZap = makeIcon('lucide:zap')
export const IconScale = makeIcon('lucide:scale')
export const IconBulb = makeIcon('lucide:lightbulb')
export const IconCamera = makeIcon('lucide:camera')
export const IconStore = makeIcon('lucide:store')
export const IconBadge = makeIcon('lucide:badge-check')
export const IconWalk = makeIcon('lucide:footprints')
export const IconMic = makeIcon('lucide:mic')
export const IconAlertTriangle = makeIcon('lucide:triangle-alert')
export const IconSos = makeIcon('lucide:siren')
export const IconCompass = makeIcon('lucide:compass')
export const IconVolume2 = makeIcon('lucide:volume-2')
export const IconVolumeX = makeIcon('lucide:volume-x')
export const IconTarget = makeIcon('lucide:target')
export const IconPencil = makeIcon('lucide:pencil')
export const IconMap = makeIcon('lucide:map')
export const IconSettings = makeIcon('lucide:settings')
export const IconPin = makeIcon('lucide:map-pin')
export const IconFlag = makeIcon('lucide:flag')
export const IconSearch = makeIcon('lucide:search')
export const IconUser = makeIcon('lucide:user')
export const IconMicOff = makeIcon('lucide:mic-off')
export const IconPhoneOff = makeIcon('lucide:phone-off')

// ─── Additional icons needed to replace decorative/functional emoji ───────
export const IconChevronLeft = makeIcon('lucide:chevron-left')
export const IconChevronDown = makeIcon('lucide:chevron-down')
export const IconPhone = makeIcon('lucide:phone')
export const IconPhoneCall = makeIcon('lucide:phone-call')
export const IconCalendar = makeIcon('lucide:calendar')
export const IconMenu = makeIcon('lucide:menu')
export const IconPlus = makeIcon('lucide:plus')
export const IconImage = makeIcon('lucide:image')
export const IconSmile = makeIcon('lucide:smile')
export const IconBell = makeIcon('lucide:bell')
export const IconMessageCircle = makeIcon('lucide:message-circle')
export const IconCheckCircle = makeIcon('lucide:check-circle-2')
export const IconX = makeIcon('lucide:x')
export const IconAmbulance = makeIcon('lucide:ambulance')
export const IconArrowUpDown = makeIcon('lucide:arrow-up-down')
export const IconArrowRight = makeIcon('lucide:arrow-right')
export const IconArrowUp = makeIcon('lucide:arrow-up')
export const IconCornerUpRight = makeIcon('lucide:corner-up-right')
export const IconCornerUpLeft = makeIcon('lucide:corner-up-left')
export const IconLoader = makeIcon('lucide:loader-2')
export const IconSparkles = makeIcon('lucide:sparkles')
export const IconRoute = makeIcon('lucide:route')
export const IconSend = makeIcon('lucide:send')
export const IconTrash = makeIcon('lucide:trash-2')
export const IconMoon = makeIcon('lucide:moon')
export const IconHeart = makeIcon('lucide:heart')
export const IconHome = makeIcon('lucide:home')
