// Le matériel : dés en 3D, faces à plat, gobelets de cuir et leur bande d'aguayo.
import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PACO } from '../../../shared/protocol';
import { cls } from '../lib/util';

/** La couleur de chaque joueur : ses dés et son gobelet. */
const COLORS = ['#ff2d95', '#ffe600', '#19f26b', '#12e6ff', '#ff7a00', '#b57bff', '#ff4a3d', '#f5efdf'];

export function colorVars(color: number): CSSProperties {
  return { '--c': COLORS[color] ?? COLORS[0] } as CSSProperties;
}

export const AVATAR_EMOJI: Record<string, string> = {
  llama: '🦙',
  condor: '🦅',
  cactus: '🌵',
  sun: '☀️',
  moon: '🌙',
  mountain: '⛰️',
  guitar: '🎸',
  skull: '💀',
  pepper: '🌶️',
  fish: '🐟',
  hat: '🤠',
  star: '⭐',
};
export const AVATAR_LABELS: Record<string, string> = {
  llama: 'Lama',
  condor: 'Condor',
  cactus: 'Cactus',
  sun: 'Soleil',
  moon: 'Lune',
  mountain: 'Montagne',
  guitar: 'Guitare',
  skull: 'Crâne',
  pepper: 'Piment',
  fish: 'Poisson',
  hat: 'Chapeau',
  star: 'Étoile',
};

export function Avatar({ avatar, color, out, className }: { avatar: string; color: number; out?: boolean; className?: string }) {
  return (
    <span className={cls('avatar', out && 'is-out', className)} style={colorVars(color)} role="img" aria-label={AVATAR_LABELS[avatar] ?? avatar}>
      {AVATAR_EMOJI[avatar] ?? '🎲'}
    </span>
  );
}

/** Le Paco : Inti, le soleil, à la place du point unique. */
export function PacoGlyph() {
  const rays = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg className="paco" viewBox="-50 -50 100 100" aria-hidden>
      {rays.map((a) => (
        <path key={a} d="M-9-22L0-46L9-22Z" transform={`rotate(${a})`} />
      ))}
      <circle r="20" />
      <circle className="paco-eye" cx="-7" cy="-4" r="3.4" />
      <circle className="paco-eye" cx="7" cy="-4" r="3.4" />
      <path className="paco-smile" d="M-9 7Q0 15 9 7" />
    </svg>
  );
}

/** La position des points sur une grille de 3 × 3. */
const PIPS: Record<number, number[]> = {
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function FaceInner({ face }: { face: number }) {
  if (face === PACO) return <PacoGlyph />;
  return (
    <span className="pips">
      {(PIPS[face] ?? []).map((p) => (
        <i key={p} style={{ gridArea: `${Math.floor(p / 3) + 1} / ${(p % 3) + 1}` }} />
      ))}
    </span>
  );
}

export const faceName = (face: number) => (face === PACO ? 'Paco' : String(face));

/** Une face à plat : pour les annonces et le décompte. */
export function DieFace({ face, color, className, style }: { face: number; color?: number; className?: string; style?: CSSProperties }) {
  return (
    <span className={cls('dieface', face === PACO && 'is-paco', className)} style={{ ...(color === undefined ? null : colorVars(color)), ...style }} role="img" aria-label={faceName(face)}>
      <FaceInner face={face} />
    </span>
  );
}

const ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, 180],
  2: [0, -90],
  5: [0, 90],
  3: [90, 0],
  4: [-90, 0],
};

/** Un vrai cube : il retombe en tournoyant sur la face demandée, à chaque nouveau lancer. */
export function Die3D({ face, color, roll = 0, index = 0, className }: { face: number; color?: number; roll?: number; index?: number; className?: string }) {
  const [rx, ry] = ROTATION[face] ?? ROTATION[1];
  const a = (roll * 2 + index) % 3;
  const b = (roll + index * 2) % 3;
  const transform = `rotateX(-16deg) rotateY(16deg) rotateX(${rx + 360 * (roll * (1 + a))}deg) rotateY(${ry + 360 * (roll * (1 + b))}deg)`;
  return (
    <span className={cls('die', className)} style={color === undefined ? undefined : colorVars(color)} role="img" aria-label={faceName(face)}>
      <span className="die-cube" style={{ transform }}>
        {[1, 6, 2, 5, 3, 4].map((f) => (
          <span key={f} className={cls('die-side', `side-${f}`, f === PACO && 'is-paco')}>
            <FaceInner face={f} />
          </span>
        ))}
      </span>
    </span>
  );
}

/** À placer une seule fois dans la page : l'ombre et la bande tissée de tous les gobelets. */
export function CupSprites() {
  return (
    <svg className="sprites" width="0" height="0" aria-hidden>
      <defs>
        <linearGradient id="cup-shade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".52" />
          <stop offset=".22" stopColor="#000" stopOpacity=".05" />
          <stop offset=".36" stopColor="#fff" stopOpacity=".3" />
          <stop offset=".52" stopColor="#000" stopOpacity=".04" />
          <stop offset="1" stopColor="#000" stopOpacity=".66" />
        </linearGradient>
        <pattern id="cup-weave" width="20" height="16" patternUnits="userSpaceOnUse" shapeRendering="crispEdges">
          <rect width="20" height="16" fill="#0b0710" />
          <path d="M8 2h4v2h2v2h2v4h-2v2h-2v2H8v-2H6v-2H4V6h2V4h2z" fill="#fff7e8" />
          <path d="M9 6h2v1h1v2h-1v1H9V9H8V7h1z" fill="#ff2d95" />
          <path d="M0 2h2v12H0zM18 2h2v12h-2z" fill="#ffe600" />
        </pattern>
        <clipPath id="cup-body">
          <path d="M23 6H77Q80 6 80 10L92 100Q93 106 86 107Q50 113 14 107Q7 106 8 100L20 10Q20 6 23 6Z" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function Cup({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={cls('cup', className)} style={style} viewBox="0 0 100 114" aria-hidden>
      <g clipPath="url(#cup-body)">
        <rect className="cup-leather" width="100" height="114" />
        <rect y="30" width="100" height="26" fill="url(#cup-weave)" />
        <path d="M0 28H100M0 58H100" stroke="#0b0710" strokeWidth="2.4" />
        <path d="M6 96Q50 104 94 96" fill="none" stroke="#0b0710" strokeWidth="1.8" strokeDasharray="4 3.4" opacity=".7" />
        <path d="M20 13Q50 18 80 13" fill="none" stroke="#0b0710" strokeWidth="1.8" strokeDasharray="4 3.4" opacity=".7" />
        <rect width="100" height="114" fill="url(#cup-shade)" />
      </g>
    </svg>
  );
}

export type CupState = 'shake' | 'open' | 'closed';

/** Le gobelet et ses dés : il s'agite, s'écarte, et les dés en sortent en roulant. */
export function CupAndDice({ dice, color, state, roll, onToggle, label }: { dice: number[]; color: number; state: CupState; roll: number; onToggle?: () => void; label?: string }) {
  const open = state === 'open';
  const inner = <Cup className={cls(state === 'shake' && 'is-shaking')} />;
  // Les dés sont gardés dans l'ordre du lancer : les ranger est un geste de joueur, pas une aide.
  return (
    <div className={cls('cupdice', open ? 'is-open' : 'is-closed')} style={colorVars(color)}>
      {onToggle ? (
        <button type="button" className="cd-cup" aria-label={label} onClick={onToggle}>
          {inner}
        </button>
      ) : (
        <span className="cd-cup">{inner}</span>
      )}
      <div className="cd-dice" aria-hidden={!open}>
        {dice.map((d, i) => (
          <motion.span
            key={i}
            className="cd-slot"
            initial={false}
            animate={open ? { x: 0, scale: 1, opacity: 1, rotate: 0 } : { x: `${(2 - i) * 112 - 65}%`, scale: 0.25, opacity: 0, rotate: -80 }}
            transition={open ? { type: 'spring', stiffness: 190, damping: 15, delay: 0.05 + i * 0.07 } : { duration: 0.22 }}
          >
            <Die3D face={d} roll={roll} index={i} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}

/** Le décor de la page d'accueil : les dés changent à chaque fois que le gobelet revient. */
export function useHeroLoop(count: number): { dice: number[]; state: CupState; roll: number } {
  const [state, setState] = useState<CupState>('shake');
  const [roll, setRoll] = useState(1);
  const [dice, setDice] = useState(() => Array.from({ length: count }, (_, i) => [6, 1, 3, 1, 5][i] ?? 2));
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    let alive = true;
    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(() => alive && fn(), ms));
    const cycle = () => {
      setState('shake');
      later(1500, () => {
        setDice((old) => old.map(() => 1 + Math.floor(Math.random() * 6)));
        setRoll((r) => r + 1);
        setState('open');
      });
      later(6800, () => setState('closed'));
      later(7200, cycle);
    };
    cycle();
    return () => {
      alive = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  return { dice, state, roll };
}
