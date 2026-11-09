import { Icon } from './Icon';
// Keyholder's illustrations: friendly flat people, homes and small scenes, drawn as SVG.
// Decorative: every scene is aria-hidden. Colours come from the friendly palette, never from status colours.

const INK = '#1F2937';
export type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'wavy';
export type Look = { skin: string; hair: string; shirt: string; pants: string; style: HairStyle; beard?: boolean };

export const LOOKS = {
  priya: { skin: '#C68657', hair: '#1E1E24', shirt: '#F472B6', pants: '#1F2A44', style: 'long' },
  marcus: { skin: '#6B4430', hair: '#1E1E24', shirt: '#34D399', pants: '#334155', style: 'short', beard: true },
  helene: { skin: '#F6D3B3', hair: '#B5651D', shirt: '#38BDF8', pants: '#1F2A44', style: 'bun' },
  sam: { skin: '#E8B48A', hair: '#4A2E1F', shirt: '#FBBF24', pants: '#475569', style: 'curly' },
  alex: { skin: '#8D5A3B', hair: '#2B1B12', shirt: '#6366F1', pants: '#1F2A44', style: 'wavy' },
  lena: { skin: '#F2C9A5', hair: '#D6B46A', shirt: '#A78BFA', pants: '#334155', style: 'long' },
} satisfies Record<string, Look>;

// ---------------------------------------------------------------- People (local origin: between the feet)
function HairBack({ look }: { look: Look }) {
  if (look.style === 'long') return <rect x={-15} y={-108} width={30} height={34} rx={13} fill={look.hair} />;
  if (look.style === 'wavy') return <rect x={-15} y={-107} width={30} height={22} rx={11} fill={look.hair} />;
  return null;
}
function HairFront({ look }: { look: Look }) {
  const c = look.hair;
  switch (look.style) {
    case 'curly':
      return <g fill={c}>{[[-11, -99], [-7, -106], [0, -109], [7, -106], [11, -99], [-13, -93], [13, -93]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={5.6} />)}</g>;
    case 'bun':
      return <g fill={c}><circle cx={0} cy={-113} r={6.5} /><path d="M-13.2 -94 C-14 -110 14 -110 13.2 -94 C8 -101 -3 -102 -13.2 -94 Z" /></g>;
    default:
      return <path d="M-13.4 -93 C-14.5 -111 14.5 -111 13.4 -93 C9 -100 -1 -102 -13.4 -93 Z" fill={c} />;
  }
}
/** A head in person coordinates (centre 0,-96). */
function Head({ look }: { look: Look }) {
  return (
    <g>
      <HairBack look={look} />
      <rect x={-4} y={-86} width={8} height={9} rx={3} fill={look.skin} />
      <circle cx={0} cy={-96} r={13} fill={look.skin} />
      <HairFront look={look} />
      {look.beard && <path d="M-9.5 -92 Q0 -78 9.5 -92 Q8 -84 0 -83 Q-8 -84 -9.5 -92 Z" fill={look.hair} />}
      <circle cx={-4.6} cy={-96} r={1.5} fill={INK} />
      <circle cx={4.6} cy={-96} r={1.5} fill={INK} />
      <circle cx={-8} cy={-91.5} r={2.2} fill="#F472B6" opacity={0.25} />
      <circle cx={8} cy={-91.5} r={2.2} fill="#F472B6" opacity={0.25} />
      <path d="M-3.8 -90.5 Q0 -87.5 3.8 -90.5" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </g>
  );
}

export type Pose = 'stand' | 'wave' | 'phone' | 'point' | 'key';
export function Person({ x = 0, y = 0, s = 1, look, pose = 'stand', flip = false }: { x?: number; y?: number; s?: number; look: Look; pose?: Pose; flip?: boolean }) {
  const arm = (d: string) => <path d={d} stroke={look.shirt} strokeWidth={7.5} strokeLinecap="round" fill="none" />;
  const hand = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={3.8} fill={look.skin} />;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <ellipse cx={0} cy={1} rx={18} ry={3.5} fill={INK} opacity={0.08} />
      <rect x={-10.5} y={-44} width={9} height={43} rx={4.5} fill={look.pants} />
      <rect x={1.5} y={-44} width={9} height={43} rx={4.5} fill={look.pants} />
      <ellipse cx={-6.5} cy={-1} rx={6.5} ry={3.2} fill={INK} />
      <ellipse cx={6.5} cy={-1} rx={6.5} ry={3.2} fill={INK} />
      {/* back arm */}
      {arm('M-13 -71 Q-19 -58 -17 -46')}{hand(-17, -45)}
      <rect x={-16} y={-80} width={32} height={42} rx={13} fill={look.shirt} />
      <path d="M-6 -80 Q0 -74 6 -80" stroke="#fff" strokeOpacity={0.35} strokeWidth={2} fill="none" />
      {pose === 'stand' && <>{arm('M13 -71 Q19 -58 17 -46')}{hand(17, -45)}</>}
      {pose === 'wave' && <>{arm('M13 -72 Q25 -82 23 -100')}{hand(23, -103)}<path d="M30 -110 q3 3 0 7 M34 -113 q4 5 0 11" stroke={INK} strokeOpacity={0.35} strokeWidth={1.5} fill="none" strokeLinecap="round" /></>}
      {pose === 'phone' && <><rect x={-1} y={-74} width={10} height={16} rx={2.5} fill={INK} /><rect x={0.5} y={-72} width={7} height={11} rx={1} fill="#C7D2FE" />{arm('M13 -71 Q17 -58 8 -60')}{hand(7, -60)}</>}
      {pose === 'point' && <>{arm('M13 -72 L31 -78')}{hand(32, -78)}</>}
      {pose === 'key' && <>{arm('M13 -72 L30 -74')}{hand(31, -74)}<g transform="translate(36 -74) rotate(20)"><circle cx={0} cy={0} r={4.2} fill="none" stroke="#F59E0B" strokeWidth={2.4} /><path d="M4 0 h9 M10 0 v3 M13 0 v2.5" stroke="#F59E0B" strokeWidth={2.4} strokeLinecap="round" /></g></>}
      <Head look={look} />
    </g>
  );
}

/** A round avatar of an illustrated person (head and shoulders). */
export function Bust({ look, size = 56, bg = '#EEF0FF' }: { look: Look; size?: number; bg?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="bust">
      <defs><clipPath id={`bust-${look.shirt.slice(1)}-${look.hair.slice(1)}`}><circle cx={32} cy={32} r={32} /></clipPath></defs>
      <g clipPath={`url(#bust-${look.shirt.slice(1)}-${look.hair.slice(1)})`}>
        <rect width={64} height={64} fill={bg} />
        <path d="M10 66 C12 47 52 47 54 66 Z" fill={look.shirt} />
        <g transform="translate(32 107) scale(0.82)"><Head look={look} /></g>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- Homes and things (local origin: bottom-left)
type HouseVariant = 'basement' | 'detached' | 'duplex';
export function House({ x = 0, y = 0, w = 120, variant = 'detached', wall = '#FFF7ED', roof = '#6366F1', lit = true }: { x?: number; y?: number; w?: number; variant?: HouseVariant; wall?: string; roof?: string; lit?: boolean }) {
  const h = w * 0.62, win = lit ? '#FDE68A' : '#BAE6FD';
  const W = (wx: number, wy: number, ww = w * 0.2, wh = w * 0.17, glow = false) => (
    <g key={`${wx}-${wy}`}><rect x={wx} y={wy} width={ww} height={wh} rx={2.5} fill={glow ? '#FDE68A' : '#BAE6FD'} stroke="#fff" strokeWidth={2.5} /><path d={`M${wx + ww / 2} ${wy} v${wh} M${wx} ${wy + wh / 2} h${ww}`} stroke="#fff" strokeWidth={1.6} /></g>
  );
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={w / 2} cy={2} rx={w * 0.62} ry={5} fill={INK} opacity={0.07} />
      <rect x={w * 0.68} y={-h - w * 0.36} width={w * 0.1} height={w * 0.2} rx={2} fill="#94A3B8" />
      <rect x={0} y={-h} width={w} height={h} rx={4} fill={wall} />
      <path d={`M${-w * 0.07} ${-h + 2} L${w / 2} ${-h - w * 0.4} L${w * 1.07} ${-h + 2} Z`} fill={roof} stroke={roof} strokeWidth={6} strokeLinejoin="round" />
      {variant === 'duplex' ? (
        <>
          {W(w * 0.08, -h * 0.82)}{W(w * 0.72, -h * 0.82)}
          <rect x={w * 0.3} y={-h * 0.48} width={w * 0.15} height={h * 0.48} rx={2} fill="#4338CA" /><circle cx={w * 0.42} cy={-h * 0.24} r={1.6} fill="#FDE68A" />
          <rect x={w * 0.55} y={-h * 0.48} width={w * 0.15} height={h * 0.48} rx={2} fill="#F472B6" /><circle cx={w * 0.58} cy={-h * 0.24} r={1.6} fill="#FDE68A" />
          <path d={`M${w / 2} ${-h} v${h}`} stroke={roof} strokeOpacity={0.25} strokeWidth={2} />
        </>
      ) : (
        <>
          {W(w * 0.1, -h * 0.84, undefined, undefined, lit)}{W(w * 0.7, -h * 0.84)}
          <rect x={w * 0.42} y={-h * (variant === 'basement' ? 0.62 : 0.5)} width={w * 0.16} height={h * (variant === 'basement' ? 0.4 : 0.5)} rx={2} fill="#4338CA" />
          <circle cx={w * 0.54} cy={-h * (variant === 'basement' ? 0.42 : 0.25)} r={1.7} fill="#FDE68A" />
        </>
      )}
      {variant === 'basement' && (
        <>
          <rect x={0} y={-h * 0.22} width={w} height={h * 0.22} rx={2} fill="#FED7AA" opacity={0.6} />
          {W(w * 0.08, -h * 0.18, w * 0.18, h * 0.12, true)}{W(w * 0.74, -h * 0.18, w * 0.18, h * 0.12, true)}
          <rect x={w * 0.42} y={-h * 0.22} width={w * 0.16} height={h * 0.04} fill="#CBD5E1" />
        </>
      )}
      {variant !== 'duplex' && lit && <circle cx={w * 0.2} cy={-h * 0.84 + w * 0.085} r={w * 0.11} fill={win} opacity={0.18} />}
    </g>
  );
}
export function Tree({ x, y, s = 1, tone = '#4ADE80' }: { x: number; y: number; s?: number; tone?: string }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x={-3} y={-26} width={6} height={26} rx={2} fill="#A16207" /><circle cx={0} cy={-38} r={17} fill={tone} /><circle cx={-9} cy={-30} r={10} fill={tone} /><circle cx={9} cy={-31} r={11} fill={tone} /><circle cx={-4} cy={-44} r={6} fill="#fff" opacity={0.2} /></g>;
}
export function Bush({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} fill="#22C55E"><circle cx={-8} cy={-6} r={8} /><circle cx={2} cy={-9} r={10} /><circle cx={11} cy={-5} r={7} /></g>;
}
function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff"><circle cx={0} cy={0} r={9} /><circle cx={11} cy={-4} r={12} /><circle cx={24} cy={0} r={9} /><rect x={0} y={0} width={24} height={9} /></g>;
}
function Phone({ x, y, s = 1, children }: { x: number; y: number; s?: number; children?: React.ReactNode }) {
  return <g transform={`translate(${x} ${y}) scale(${s})`}><rect x={0} y={0} width={64} height={116} rx={12} fill={INK} /><rect x={4} y={8} width={56} height={100} rx={8} fill="#fff" /><rect x={24} y={3} width={16} height={3} rx={1.5} fill="#475569" />{children}</g>;
}
function Check({ x, y, r = 12, bg = '#10B981' }: { x: number; y: number; r?: number; bg?: string }) {
  return <g transform={`translate(${x} ${y})`}><circle r={r} fill={bg} /><path d={`M${-r * 0.42} 0 l${r * 0.3} ${r * 0.32} l${r * 0.55} ${-r * 0.6}`} stroke="#fff" strokeWidth={r * 0.22} fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>;
}
function Blob({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return <circle cx={cx} cy={cy} r={r} fill={fill} />;
}
function Ground({ y = 176, fill = '#DCFCE7' }: { y?: number; fill?: string }) {
  return <rect x={20} y={y} width={280} height={14} rx={7} fill={fill} />;
}
const Scene = ({ children, vb = '0 0 320 200', className }: { children: React.ReactNode; vb?: string; className?: string }) => (
  <svg viewBox={vb} className={`art ${className ?? ''}`} aria-hidden focusable="false">{children}</svg>
);

// ---------------------------------------------------------------- Scenes
/** Step 1: add your property. */
export function SceneAddHome() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={86} fill="#EBE9FE" />
      <Cloud x={60} y={52} s={0.8} /><Cloud x={226} y={40} s={0.7} />
      <Ground />
      <Tree x={52} y={178} s={0.9} />
      <House x={88} y={178} w={118} variant="basement" />
      <g transform="translate(192 74)"><circle r={15} fill="#4F46E5" /><path d="M-6 0h12M0 -6v12" stroke="#fff" strokeWidth={3} strokeLinecap="round" /></g>
      <Person x={250} y={178} s={0.95} look={LOOKS.priya} pose="phone" />
    </Scene>
  );
}
/** Step 2: connect a bank (view only), or skip it. */
export function SceneBank() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={86} fill="#D3F8DF" />
      <Ground />
      <g transform="translate(66 178)">
        <path d="M0 -70 L50 -96 L100 -70 Z" fill="#475569" />
        <rect x={4} y={-70} width={92} height={8} fill="#64748B" />
        {[12, 34, 56, 78].map((cx) => <rect key={cx} x={cx} y={-60} width={10} height={50} rx={2} fill="#E2E8F0" />)}
        <rect x={0} y={-10} width={100} height={10} rx={2} fill="#64748B" />
      </g>
      <path d="M170 120 C190 100 205 100 222 112" stroke="#10B981" strokeWidth={3} strokeDasharray="5 6" fill="none" strokeLinecap="round" />
      <Phone x={222} y={66} s={0.88}>
        <rect x={10} y={22} width={44} height={8} rx={4} fill="#E0E7FF" />
        <rect x={10} y={38} width={36} height={6} rx={3} fill="#E5E7EB" />
        <rect x={10} y={50} width={40} height={6} rx={3} fill="#E5E7EB" />
        <Check x={32} y={80} r={13} />
      </Phone>
      <g transform="translate(150 70)"><path d="M0 -16 L14 -10 V2 C14 12 7 17 0 20 C-7 17 -14 12 -14 2 V-10 Z" fill="#4F46E5" /><rect x={-5} y={-2} width={10} height={9} rx={2} fill="#fff" /><path d="M-3 -2 v-3 a3 3 0 0 1 6 0 v3" stroke="#fff" strokeWidth={2} fill="none" /></g>
    </Scene>
  );
}
/** Step 3: tap the next step (Send receipt). */
export function SceneTap() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={86} fill="#E0F2FE" />
      <Phone x={112} y={30} s={1.25}>
        <rect x={10} y={18} width={30} height={6} rx={3} fill="#C7D2FE" />
        {[34, 58].map((y, i) => <g key={y}><circle cx={16} cy={y + 7} r={6} fill={i ? '#FDE68A' : '#FBCFE8'} /><rect x={26} y={y + 3} width={24} height={4} rx={2} fill="#CBD5E1" /><rect x={26} y={y + 10} width={16} height={3} rx={1.5} fill="#E5E7EB" /></g>)}
        <rect x={10} y={84} width={44} height={14} rx={7} fill="#4F46E5" /><rect x={18} y={89.5} width={28} height={3} rx={1.5} fill="#fff" />
      </Phone>
      <g transform="translate(168 156)"><circle r={18} fill="#4F46E5" opacity={0.12} /><circle r={10} fill="#4F46E5" opacity={0.18} /></g>
      <g transform="translate(232 70) rotate(10)">
        <path d="M0 0 H42 V56 L35 51 L28 56 L21 51 L14 56 L7 51 L0 56 Z" fill="#fff" stroke="#E2E8F0" strokeWidth={2} />
        <rect x={8} y={10} width={26} height={4} rx={2} fill="#CBD5E1" /><rect x={8} y={20} width={18} height={4} rx={2} fill="#E5E7EB" />
        <Check x={21} y={38} r={9} />
      </g>
      <path d="M210 92 q8 -6 16 -4" stroke="#94A3B8" strokeWidth={2} fill="none" strokeDasharray="3 4" strokeLinecap="round" />
    </Scene>
  );
}
/** All rent is in: a small celebration. */
export function SceneCelebrate() {
  const bits = [[70, 46, '#F472B6'], [96, 30, '#FBBF24'], [130, 50, '#38BDF8'], [210, 34, '#34D399'], [240, 56, '#A78BFA'], [262, 30, '#FB923C'], [186, 24, '#F472B6']] as const;
  return (
    <Scene>
      <Blob cx={160} cy={110} r={82} fill="#FEF7C3" />
      {bits.map(([x, y, c], i) => <rect key={i} x={x} y={y} width={8} height={4} rx={2} fill={c} transform={`rotate(${i * 37} ${x} ${y})`} />)}
      <Ground />
      <House x={92} y={178} w={108} variant="detached" roof="#10B981" />
      <Check x={204} y={86} r={16} />
      <Person x={244} y={178} s={0.95} look={LOOKS.alex} pose="wave" />
    </Scene>
  );
}
/** No receipts yet. */
export function SceneReceipts() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={84} fill="#FFE6D5" />
      <Ground fill="#FFEDD5" />
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${108 + i * 14} ${66 - i * 8}) rotate(${-8 + i * 8})`}>
          <path d="M0 0 H62 V84 L52 78 L41 84 L31 78 L21 84 L10 78 L0 84 Z" fill="#fff" stroke="#FED7AA" strokeWidth={2} />
          <rect x={10} y={14} width={38} height={5} rx={2.5} fill="#FDBA74" opacity={0.7} /><rect x={10} y={28} width={30} height={4} rx={2} fill="#E5E7EB" /><rect x={10} y={38} width={34} height={4} rx={2} fill="#E5E7EB" />
        </g>
      ))}
      <g transform="translate(222 120)"><rect x={-26} y={-18} width={52} height={36} rx={9} fill="#4F46E5" /><rect x={-10} y={-24} width={20} height={8} rx={3} fill="#4F46E5" /><circle r={11} fill="#fff" /><circle r={6} fill="#C7D2FE" /></g>
    </Scene>
  );
}
/** No properties yet: your home goes here. */
export function SceneEmptyHome() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={86} fill="#EBE9FE" />
      <Cloud x={70} y={50} s={0.8} />
      <Ground />
      <g transform="translate(100 178)" fill="none" stroke="#A5B4FC" strokeWidth={3} strokeDasharray="7 7" strokeLinejoin="round">
        <rect x={0} y={-66} width={104} height={66} rx={4} /><path d="M-8 -64 L52 -108 L112 -64" />
      </g>
      <g transform="translate(152 140)"><circle r={16} fill="#4F46E5" /><path d="M-6 0h12M0 -6v12" stroke="#fff" strokeWidth={3} strokeLinecap="round" /></g>
      <Person x={250} y={178} s={0.95} look={LOOKS.helene} pose="point" flip />
      <Bush x={70} y={178} />
    </Scene>
  );
}
/** Welcome: a landlord hands keys to a happy tenant. */
export function SceneWelcome() {
  return (
    <Scene>
      <Blob cx={160} cy={104} r={86} fill="#E0F2FE" />
      <Cloud x={56} y={46} s={0.8} /><Cloud x={236} y={36} s={0.6} />
      <Ground />
      <House x={110} y={178} w={100} variant="duplex" roof="#4F46E5" />
      <Person x={84} y={178} s={0.95} look={LOOKS.marcus} pose="key" />
      <Person x={244} y={178} s={0.95} look={LOOKS.lena} pose="wave" flip />
    </Scene>
  );
}

// ---------------------------------------------------------------- Small pictures for the signup questions (viewBox 0 0 160 100)
const Mini = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <svg viewBox="0 0 160 100" className="art art-mini" aria-hidden focusable="false"><rect width={160} height={100} rx={20} fill={bg} />{children}</svg>
);
export function QWhere() {
  return (
    <Mini bg="#E0F2FE">
      <path d="M34 30 l26 -8 26 8 26 -8 v50 l-26 8 -26 -8 -26 8 Z" fill="#fff" stroke="#BAE6FD" strokeWidth={2} />
      <path d="M60 22 v50 M86 30 v50" stroke="#BAE6FD" strokeWidth={2} />
      {[[56, 44, '#F472B6'], [80, 52, '#4F46E5'], [102, 40, '#10B981']].map(([x, y, c]) => <g key={`${x}`} transform={`translate(${x} ${y})`}><path d="M0 0 C-7 -7 -7 -16 0 -18 C7 -16 7 -7 0 0 Z" fill={c as string} /><circle cx={0} cy={-11} r={2.6} fill="#fff" /></g>)}
    </Mini>
  );
}
export function QWhat() {
  return (
    <Mini bg="#EBE9FE">
      <House x={14} y={82} w={34} variant="basement" />
      <House x={64} y={82} w={32} variant="detached" roof="#10B981" lit={false} />
      <House x={112} y={82} w={36} variant="duplex" roof="#F472B6" />
    </Mini>
  );
}
export function QPay() {
  return (
    <Mini bg="#D3F8DF">
      <Phone x={22} y={20} s={0.55}><path d="M18 44 h22 m-7 -7 l7 7 -7 7" stroke="#10B981" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Phone>
      <g transform="translate(66 34) rotate(-6)"><rect width={58} height={28} rx={4} fill="#fff" stroke="#A7F3D0" strokeWidth={2} /><rect x={8} y={9} width={26} height={3} rx={1.5} fill="#94A3B8" /><rect x={8} y={17} width={18} height={3} rx={1.5} fill="#CBD5E1" /><path d="M40 20 q4 -6 8 0 t8 0" stroke="#4F46E5" strokeWidth={1.6} fill="none" /></g>
      <g transform="translate(92 62)"><rect width={52} height={24} rx={4} fill="#34D399" /><circle cx={26} cy={12} r={7} fill="#D1FAE5" /><text x={26} y={16} fontSize={10} fontWeight={700} textAnchor="middle" fill="#047857" fontFamily="Inter, sans-serif">$</text></g>
    </Mini>
  );
}
export function QHard() {
  return (
    <Mini bg="#FFE6D5">
      <g transform="translate(-12 6)"><Person x={60} y={92} s={0.62} look={LOOKS.sam} pose="phone" /></g>
      <g transform="translate(98 36)">
        <circle cx={-24} cy={30} r={3} fill="#fff" /><circle cx={-16} cy={22} r={4.5} fill="#fff" />
        <rect x={-12} y={-16} width={52} height={36} rx={14} fill="#fff" />
        <rect x={0} y={-8} width={26} height={22} rx={3} fill="#FED7AA" /><rect x={0} y={-8} width={26} height={6} rx={3} fill="#FB923C" />
        <text x={13} y={11} fontSize={11} fontWeight={800} textAnchor="middle" fill="#C2410C" fontFamily="Inter, sans-serif">1</text>
      </g>
    </Mini>
  );
}
export function QTax() {
  return (
    <Mini bg="#FEF7C3">
      <g transform="translate(40 18) rotate(-6)"><rect width={50} height={64} rx={5} fill="#fff" stroke="#FDE68A" strokeWidth={2} /><rect x={8} y={10} width={30} height={5} rx={2.5} fill="#FBBF24" /><rect x={8} y={22} width={34} height={3.5} rx={1.75} fill="#E5E7EB" /><rect x={8} y={30} width={26} height={3.5} rx={1.75} fill="#E5E7EB" /><rect x={8} y={38} width={30} height={3.5} rx={1.75} fill="#E5E7EB" /></g>
      <g transform="translate(88 30)"><rect width={36} height={48} rx={6} fill="#4F46E5" /><rect x={5} y={5} width={26} height={12} rx={2} fill="#C7D2FE" />{[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={5 + c * 9} y={22 + r * 8} width={7} height={6} rx={1.5} fill="#A5B4FC" />))}</g>
    </Mini>
  );
}
export function QGoal() {
  return (
    <Mini bg="#FFE4E8">
      <g transform="translate(80 52)">
        <circle r={32} fill="#fff" /><circle r={23} fill="#FBCFE8" /><circle r={14} fill="#fff" /><circle r={6} fill="#F43F5E" />
        <path d="M30 -30 L2 -2" stroke="#4F46E5" strokeWidth={4} strokeLinecap="round" /><path d="M30 -30 l-9 1 M30 -30 l-1 9" stroke="#4F46E5" strokeWidth={4} strokeLinecap="round" />
      </g>
    </Mini>
  );
}

// ---------------------------------------------------------------- Avatars with initials (tenants)
const AVATAR = [['#FFE6D5', '#C4320A'], ['#D3F8DF', '#087443'], ['#E0F2FE', '#026AA2'], ['#FEF7C3', '#A15C07'], ['#EBE9FE', '#5925DC'], ['#FFE4E8', '#C01048']];
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const parts = name.replace(/&/g, ' ').split(/\s+/).filter(Boolean);
  const initials = (parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = AVATAR[h % AVATAR.length];
  return <span className="avatar" aria-hidden style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}>{initials.toUpperCase()}</span>;
}

// ---------------------------------------------------------------- Expense category icons
const CAT: Record<string, [string, string]> = {
  repairs: ['wrench', 'peach'], utilities: ['bolt', 'sun'], insurance: ['shield', 'sky'], 'property-tax': ['home', 'lilac'],
  interest: ['bank', 'mint'], advertising: ['sparkle', 'rose'], professional: ['paper', 'sky'], management: ['users', 'lilac'],
  office: ['print', 'sun'], travel: ['map', 'mint'], vehicle: ['pin', 'peach'], supplies: ['box', 'sun'], other: ['receipt', 'lilac'],
};
export function CategoryIcon({ id }: { id: string }) {
  const [icon, tone] = CAT[id] ?? CAT.other;
  return <span className={`tile-ic sm ${tone}`} aria-hidden><Icon name={icon} size={16} /></span>;
}
