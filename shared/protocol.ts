// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes, règle des annonces.

export const MIN_PLAYERS = 2;
/** La boîte prévoit 6 joueurs ; en ligne, rien n'empêche de réunir deux boîtes. */
export const MAX_PLAYERS = 8;
export const START_DICE = 5;
/** Le Paco : le 1, joker hors Palifico. */
export const PACO = 1;
export const FACES = [2, 3, 4, 5, 6, PACO] as const;

export const AVATARS = ['llama', 'condor', 'cactus', 'sun', 'moon', 'mountain', 'guitar', 'skull', 'pepper', 'fish', 'hat', 'star'] as const;
export const EMOTES = ['😂', '😏', '😱', '🤔', '🔥', '🤥', '🦙', '🤫'] as const;
export const TAUNTS = ['Tu mens.', 'Moi ? Jamais.', 'Dudo, dudo, dudo…', 'Ça sent le bluff', 'Mes dés sont parfaits', 'Tu trembles ?', 'Soulève ton gobelet'] as const;

export const THINK_OPTIONS = [0, 30, 60] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];

export interface Settings {
  think: ThinkTime;
  /** Variante du livret : parier que l'annonce tombe pile. */
  calza: boolean;
}

export type PlayerStatus = 'lobby' | 'playing' | 'eliminated' | 'spectator';
/** roll : les gobelets s'agitent. bid : on annonce à tour de rôle. reveal : gobelets levés, on compte. */
export type RoundPhase = 'roll' | 'bid' | 'reveal';

export interface Bid {
  qty: number;
  face: number;
}

export interface PlayerStats {
  dudoRight: number;
  dudoWrong: number;
  calzaRight: number;
  calzaWrong: number;
  /** Annonces démasquées par un Dudo. */
  caught: number;
  /** Annonces qui ont tenu face à un Dudo. */
  held: number;
  /** La plus grosse annonce qui a tenu. */
  biggestHeld: number;
}

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  color: number;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  rank: number | null;
  /** Combien de dés il lui reste : ça se voit sur la table. Leur valeur, jamais avant la révélation. */
  dice: number;
  inRound: boolean;
}

export interface MyOptions {
  canBid: boolean;
  /** Pour chaque face, la plus petite quantité permise (null si la face est interdite). */
  mins: Record<number, number | null>;
  maxQty: number;
  canDudo: boolean;
}

export interface Reveal {
  kind: 'dudo' | 'calza';
  callerId: string;
  bidderId: string;
  bid: Bid;
  /** Les jokers comptent-ils ? Pas en Palifico. */
  wild: boolean;
  /** Tous les dés, gobelets levés, dans l'ordre de la table. */
  hands: { id: string; dice: number[] }[];
  actual: number;
  /** Celui qui perd un dé (null si un Calza est réussi). */
  loserId: string | null;
  /** Celui qui regagne un dé sur un Calza réussi (null s'il a déjà ses cinq dés ou si le Calza est raté). */
  gainerId: string | null;
  eliminated: boolean;
  winnerId: string | null;
  nextFirstId: string | null;
  /** Le prochain tour sera un Palifico pour ce joueur. */
  palificoNextId: string | null;
}

export interface RoundView {
  number: number;
  order: string[];
  firstId: string;
  phase: RoundPhase;
  turnId: string | null;
  turnEndsAt: number;
  /** Seulement la dernière annonce : se souvenir des précédentes fait partie du jeu. */
  bid: Bid | null;
  bidderId: string | null;
  /** Numéro de l'annonce en cours : un Calza ne vaut que pour celle que le joueur a vue. */
  bidSeq: number;
  palificoId: string | null;
  options: MyOptions | null;
  canCalza: boolean;
  /** Tes dés, à toi seul. */
  mine: number[] | null;
  reveal: Reveal | null;
  revealEndsAt: number;
  /** Date à partir de laquelle on peut passer à la suite : le décompte doit avoir eu lieu. */
  revealMinAt: number;
  readyIds: string[];
}

export type LogKind = 'system' | 'round' | 'action' | 'win' | 'penalty' | 'eliminate' | 'chat';
export interface LogEntry {
  id: number;
  at: number;
  kind: LogKind;
  text: string;
  playerId?: string;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  color: number;
  rank: number;
  dice: number;
  stats: PlayerStats;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  round: RoundView | null;
  log: LogEntry[];
  final: FinalEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/**
 * La plus petite quantité permise pour cette face, ou null si la face est interdite.
 * Plus de dés sur n'importe quelle face, ou autant de dés sur une face plus haute.
 * Vers les Pacos : la moitié, arrondie au-dessus. Depuis les Pacos : le double, plus un.
 * En Palifico, la face annoncée à l'ouverture ne change plus et le Paco n'a rien de spécial.
 */
export function minQty(prev: Bid | null, face: number, palifico: boolean): number | null {
  if (!Number.isInteger(face) || face < 1 || face > 6) return null;
  if (!prev) return face === PACO && !palifico ? null : 1;
  if (palifico) return face === prev.face ? prev.qty + 1 : null;
  if (face === PACO) return prev.face === PACO ? prev.qty + 1 : Math.ceil(prev.qty / 2);
  if (prev.face === PACO) return prev.qty * 2 + 1;
  return face > prev.face ? prev.qty : prev.qty + 1;
}

/** Combien de dés correspondent à l'annonce. */
export function countDice(dice: number[], face: number, wild: boolean): number {
  return dice.filter((d) => d === face || (wild && d === PACO)).length;
}
