// Cerveau des bots : ils ne connaissent que leurs dés, le nombre de dés de chacun et les annonces entendues.
import { FACES, PACO, minQty, type Bid } from '../shared/protocol';

export interface Personality {
  /** Goût du mensonge : annoncer une face qu'on n'a pas (0 à 1). */
  bluff: number;
  /** Prise de risque : garder la main plutôt que crier Dudo (0 à 1). */
  nerve: number;
  /** Crédit accordé aux annonces des autres (0 à 1). */
  trust: number;
}

export function randomPersonality(): Personality {
  return { bluff: 0.1 + Math.random() * 0.6, nerve: 0.2 + Math.random() * 0.6, trust: 0.2 + Math.random() * 0.6 };
}

/** Tout ce qu'un bot sait. Les dés des autres n'y figurent pas : il ne peut pas tricher. */
export interface BotView {
  dice: number[];
  total: number;
  bid: Bid | null;
  palifico: boolean;
  calzaAllowed: boolean;
  personality: Personality;
  /** Ce que chacun a annoncé dans la manche : un joueur annonce souvent ce qu'il a. */
  heard: { face: number; qty: number }[];
}

export type BotMove = { type: 'bid'; bid: Bid } | { type: 'dudo' } | { type: 'calza' };

function binomialTail(n: number, p: number, k: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let term = (1 - p) ** n;
  let below = 0;
  for (let i = 0; i < k; i++) {
    below += term;
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return Math.max(0, 1 - below);
}

function binomialExact(n: number, p: number, k: number): number {
  if (k < 0 || k > n) return 0;
  return binomialTail(n, p, k) - binomialTail(n, p, k + 1);
}

/** Les dés cachés de cette face : un sur six, un sur trois avec les jokers, un peu plus si la table en parle. */
function hiddenOdds(view: BotView, face: number): number {
  const wild = !view.palifico && face !== PACO;
  const base = wild ? 1 / 3 : 1 / 6;
  const talk = view.heard.filter((h) => h.face === face).length;
  return Math.min(0.55, base + talk * 0.03 * (0.5 + view.personality.trust));
}

function mineOf(view: BotView, face: number): number {
  const wild = !view.palifico && face !== PACO;
  return view.dice.filter((d) => d === face || (wild && d === PACO)).length;
}

/** Chance estimée qu'il y ait au moins qty dés de cette face sur la table. */
export function chance(view: BotView, bid: Bid): number {
  return binomialTail(view.total - view.dice.length, hiddenOdds(view, bid.face), bid.qty - mineOf(view, bid.face));
}

/** Chance estimée qu'il y en ait exactement qty. */
export function exactChance(view: BotView, bid: Bid): number {
  return binomialExact(view.total - view.dice.length, hiddenOdds(view, bid.face), bid.qty - mineOf(view, bid.face));
}

function legalBids(view: BotView): Bid[] {
  const list: Bid[] = [];
  for (const face of FACES) {
    const min = minQty(view.bid, face, view.palifico);
    if (min === null) continue;
    // Quelques crans au-dessus du minimum suffisent : personne ne saute dix dés d'un coup. À l'ouverture, on vise ce qui est plausible.
    const top = view.bid ? min + 2 : Math.ceil(view.total / 2);
    for (let qty = min; qty <= Math.min(view.total, top); qty++) list.push({ qty, face });
  }
  return list;
}

export function botTurn(view: BotView, rng: () => number = Math.random): BotMove {
  const me = view.personality;
  const bids = legalBids(view);
  const opening = !view.bid;
  if (!bids.length && view.bid) return { type: 'dudo' };

  let best: Bid = bids[0];
  let score = -Infinity;
  for (const b of bids) {
    const odds = chance(view, b);
    // Une annonce vraie vaut son pesant de chances ; un menteur se permet des annonces sans dé en main.
    const lie = mineOf(view, b.face) === 0 ? me.bluff * 0.28 : 0;
    const noise = (rng() - 0.5) * 0.14;
    // Une ouverture trop basse ne dit rien : on vise une annonce solide sans être gratuite.
    const worth = opening ? 1 - Math.abs(odds - (0.78 - me.nerve * 0.28)) : odds - (b.qty - view.bid!.qty) * 0.04;
    const s = worth + lie + noise;
    if (s > score) {
      score = s;
      best = b;
    }
  }
  if (opening) return { type: 'bid', bid: best };

  const standing = chance(view, view.bid!);
  const mineBest = chance(view, best);
  // Un Calza juste rend un dé : ça vaut le coup seulement quand tout colle.
  if (view.calzaAllowed && exactChance(view, view.bid!) > 0.42 - me.nerve * 0.06 && rng() < 0.7) return { type: 'calza' };
  // Dudo quand l'annonce en cours a l'air plus fragile que ce qu'on pourrait dire à la place.
  const doubt = 1 - standing;
  const riskOfRaise = 1 - mineBest;
  const lean = (me.nerve - 0.5) * 0.3;
  if (doubt > riskOfRaise + lean && doubt > 0.32) return { type: 'dudo' };
  if (mineBest < 0.1 + (1 - me.nerve) * 0.14) return { type: 'dudo' };
  return { type: 'bid', bid: best };
}
