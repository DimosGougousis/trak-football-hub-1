import { useId } from 'react'
import { describeKit, type KitDesign } from '@/lib/kit-templates'

const shirt = 'M98 17 Q120 24 142 17 L173 27 Q194 34 201 55 L216 101 L185 112 L173 80 L178 169 Q120 179 62 169 L67 80 L55 112 L24 101 L39 55 Q46 34 67 27Z'
const shorts = 'M65 184 Q120 191 175 184 L187 279 Q159 285 133 279 L120 234 L107 279 Q81 285 53 279Z'
const sock = 'M72 300 Q88 297 105 300 L102 330 Q98 353 99 375 L103 388 Q107 401 93 403 L76 402 Q68 399 71 388 L77 371 Q78 349 73 330Z'

// Included in standalone SVG exports as well as the React component. One reveal,
// no perpetual movement, and no hidden content when animations are disabled.
const motion = `
@keyframes trak-kit-reveal { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
.trak-kit-animated .trak-kit-shirt { animation: trak-kit-reveal 420ms cubic-bezier(.2,.7,.2,1) both; }
.trak-kit-animated .trak-kit-shorts { animation: trak-kit-reveal 420ms 65ms cubic-bezier(.2,.7,.2,1) both; }
.trak-kit-animated .trak-kit-socks { animation: trak-kit-reveal 420ms 130ms cubic-bezier(.2,.7,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .trak-kit-animated > g { animation: none !important; } }
`

export interface KitIllustrationProps {
  kit: KitDesign
  label?: string
  animated?: boolean
  decorative?: boolean
  className?: string
}

/** Blank, front-facing shirt / shorts / socks. No external files or brand marks. */
export function KitIllustration({ kit, label, animated = false, decorative = false, className = '' }: KitIllustrationProps) {
  const id = `kit-${useId().replace(/:/g, '')}`
  const ref = (name: string) => `url(#${id}-${name})`
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 420" width="240" height="420"
      className={`${animated ? 'trak-kit-animated' : ''} ${className}`.trim()}
      role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
      aria-labelledby={decorative ? undefined : `${id}-title`} focusable="false">
      {!decorative && <title id={`${id}-title`}>{`${label ? `${label}: ` : ''}${describeKit(kit)}`}</title>}
      {animated && <style>{motion}</style>}
      <defs>
        <clipPath id={`${id}-shirt`}><path d={shirt} /></clipPath>
        <clipPath id={`${id}-shorts`}><path d={shorts} /></clipPath>
        <clipPath id={`${id}-sock`}><path d={sock} /></clipPath>
        <linearGradient id={`${id}-shade`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#071222" stopOpacity=".24" />
          <stop offset=".22" stopColor="#071222" stopOpacity="0" />
          <stop offset=".48" stopColor="#fff" stopOpacity=".14" />
          <stop offset=".75" stopColor="#071222" stopOpacity="0" />
          <stop offset="1" stopColor="#071222" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id={`${id}-light`} x2=".2" y2="1">
          <stop stopColor="#fff" stopOpacity=".12" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#071222" stopOpacity=".13" />
        </linearGradient>
        <linearGradient id={`${id}-sock-shade`} x1="0" x2="1">
          <stop stopColor="#071222" stopOpacity=".22" />
          <stop offset=".48" stopColor="#fff" stopOpacity=".14" />
          <stop offset="1" stopColor="#071222" stopOpacity=".2" />
        </linearGradient>
      </defs>

      <g className="trak-kit-shirt">
        <path d={shirt} fill={kit.shirt} />
        <g clipPath={ref('shirt')} fill={kit.secondary}>
          {kit.pattern === 'stripes' && [73, 112, 151].map(x => <rect key={x} x={x} y="18" width="18" height="158" />)}
          {kit.pattern === 'hoops' && [52, 92, 132].map(y => <rect key={y} x="20" y={y} width="200" height="17" />)}
          {kit.pattern === 'sash' && <path d="M56 9 L77 1 L187 168 L165 181Z" />}
          {kit.pattern === 'halves' && <rect x="120" y="10" width="100" height="170" />}
          {kit.pattern === 'chest-band' && <rect x="57" y="67" width="126" height="28" />}
          <path d="M23 93 L58 104 L55 112 L23 101Z M182 104 L217 93 L217 101 L185 112Z" fill={kit.trim} />
          <path d={shirt} fill={ref('shade')} />
          <path d={shirt} fill={ref('light')} />
          <path d="M68 37 Q61 54 67 80 M172 37 Q179 54 173 80 M65 163 Q120 173 175 163" fill="none" stroke="#091729" strokeOpacity=".16" strokeWidth="1" />
          <path d="M72 87 L81 122 L69 110 M167 87 L159 119 L172 104 M78 142 L100 162 L84 154 M158 139 L141 161 L155 153" fill="#091729" opacity=".07" />
          <path d="M74 87 L84 119 M164 87 L156 116 M82 142 L101 160 M157 139 L140 159" stroke="#fff" strokeOpacity=".2" fill="none" />
          <path d="M67 28 Q83 29 98 20 M142 20 Q157 29 173 28" stroke="#fff" strokeOpacity=".3" fill="none" />
        </g>
        <path d={shirt} fill="none" stroke="#0B1525" strokeOpacity=".3" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M98 17 Q120 12 142 17 Q138 39 120 42 Q102 39 98 17Z" fill={kit.trim} stroke="#0B1525" strokeOpacity=".28" />
        <path d="M103 19 Q120 17 137 19 Q134 33 120 36 Q106 33 103 19Z" fill={kit.shirt} />
        <path d="M103 19 Q120 17 137 19 Q134 25 120 27 Q106 25 103 19Z" fill="#0B1525" opacity=".3" />
        <path d="M106 30 Q120 42 134 30" fill="none" stroke="#fff" strokeOpacity=".26" />
      </g>

      <g className="trak-kit-shorts">
        <path d={shorts} fill={kit.shorts} />
        <g clipPath={ref('shorts')}>
          <path d="M65 184 L71 185 L61 280 L53 279Z M169 185 L175 184 L187 279 L179 280Z" fill={kit.trim} />
          <path d={shorts} fill={ref('shade')} />
          <path d="M64 187 Q120 196 176 187 L177 197 Q120 204 63 197Z" fill="#091729" opacity=".12" />
          <path d="M69 189 L68 196 M76 190 L75 198 M83 191 L82 199 M91 192 L90 199 M99 193 L99 200 M107 193 L107 201 M133 193 L133 201 M141 193 L141 200 M149 192 L150 199 M157 191 L158 199 M164 190 L165 198 M171 189 L172 196" stroke="#091729" strokeOpacity=".2" />
          <path d="M120 201 L120 232 M55 272 Q80 279 108 272 M132 272 Q160 279 185 272" stroke="#091729" strokeOpacity=".16" fill="none" />
          <path d="M88 206 L97 229 L79 239 L91 222Z M153 204 L144 229 L164 244 L151 222Z M115 227 L94 251 L107 244 M125 227 L148 253 L133 244" fill="#091729" opacity=".09" />
          <path d="M87 206 L94 222 L78 238 M154 205 L149 222 L165 242" stroke="#fff" strokeOpacity=".18" fill="none" />
        </g>
        <path d={shorts} fill="none" stroke="#0B1525" strokeOpacity=".3" strokeWidth="1.1" strokeLinejoin="round" />
        <path d="M116 196 L114 209 M124 196 L127 207" stroke={kit.trim} strokeWidth="1.4" strokeLinecap="round" />
      </g>

      <g className="trak-kit-socks">
        {[false, true].map(mirrored => <g key={String(mirrored)} transform={mirrored ? 'translate(240 0) scale(-1 1)' : undefined}>
          <path d={sock} fill={kit.socks} />
          <g clipPath={ref('sock')}>
            <path d="M70 301 Q88 305 107 301 L106 312 Q88 316 71 312Z" fill={kit.trim} />
            <path d="M71 316 Q88 320 105 316" stroke={kit.trim} strokeWidth="2" fill="none" />
            <path d={sock} fill={ref('sock-shade')} />
            <path d="M75 322 L78 341 M80 322 L83 341 M85 322 L87 342 M90 322 L91 342 M95 322 L95 341 M100 322 L99 341" stroke="#091729" strokeOpacity=".09" />
            <path d="M77 371 Q88 375 99 371 M73 391 Q88 385 104 392" stroke="#091729" strokeOpacity=".16" fill="none" />
            <path d="M80 347 Q82 362 80 373" stroke="#fff" strokeOpacity=".18" fill="none" />
          </g>
          <path d={sock} fill="none" stroke="#0B1525" strokeOpacity=".3" strokeWidth="1.1" />
          <path d="M72 300 Q88 304 105 300" fill="none" stroke="#fff" strokeOpacity=".3" />
        </g>)}
      </g>
    </svg>
  )
}
