// Une table de Perudo : salon, lancers secrets, annonces, Dudo, Calza, Palifico et classement.
import crypto from 'node:crypto';
import {
  AVATARS,
  FACES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PACO,
  START_DICE,
  TAUNTS,
  THINK_OPTIONS,
  countDice,
  minQty,
  type Bid,
  type FinalEntry,
  type LogEntry,
  type LogKind,
  type MyOptions,
  type PlayerStats,
  type PlayerStatus,
  type Reveal,
  type RoomView,
  type RoundPhase,
  type Settings,
  type ThinkTime,
} from '../shared/protocol';
import { botTurn, randomPersonality, type BotView, type Personality } from './bots';

const BOT_NAMES = ['Rosita', 'Don Pablo', 'Wayra', 'Pachacútec', 'Doña Inés', 'Tito', 'Killa', 'El Chino', 'Quispe', 'Yma'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (PE_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.PE_FAST === '1';
/** Les gobelets s'agitent avant que la première annonce ne soit possible. */
const ROLL_MS = FAST ? 20 : 1_900;
const REVEAL_MS = FAST ? 200 : 14_000;
/** Le cri, les gobelets qui se lèvent, puis un dé compté à la fois : personne ne doit couper ce moment. */
const REVEAL_BASE_MS = FAST ? 0 : 3_600;
const REVEAL_STEP_MS = FAST ? 0 : 420;
const COLORS = 8;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  color: number;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  dice: number;
  /** Le Palifico ne se joue qu'une fois par joueur, même s'il regagne un dé. */
  usedPalifico: boolean;
  rank: number | null;
  outOrder: number;
  stats: PlayerStats;
}

export interface Round {
  number: number;
  order: string[];
  firstId: string;
  phase: RoundPhase;
  hands: Map<string, number[]>;
  bid: Bid | null;
  bidderId: string | null;
  bidSeq: number;
  heard: { face: number; qty: number }[];
  palificoId: string | null;
  turnId: string | null;
  turnEndsAt: number;
  botActAt: number;
  rollEndsAt: number;
  reveal: Reveal | null;
  revealEndsAt: number;
  revealMinAt: number;
  ready: Set<string>;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function emptyStats(): PlayerStats {
  return { dudoRight: 0, dudoWrong: 0, calzaRight: 0, calzaWrong: 0, caught: 0, held: 0, biggestHeld: 0 };
}

/** « 5 × 3 » écrit comme à la table. */
export function bidText(b: Bid): string {
  if (b.face === PACO) return `${b.qty} Paco${b.qty > 1 ? 's' : ''}`;
  return `${b.qty} × ${b.face}`;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { think: 0, calza: true };
  players: Player[] = [];
  round: Round | null = null;
  final: FinalEntry[] | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private log: LogEntry[] = [];
  private logId = 0;
  private roundCount = 0;
  private firstId = '';
  private nextPalifico: string | null = null;
  private outCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  /** Chaque joueur assis a la couleur de son gobelet et de ses dés. */
  private freeColor(): number {
    const used = new Set(this.seated.map((p) => p.color));
    for (let c = 0; c < COLORS; c++) if (!used.has(c)) return c;
    return 0;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      color: status === 'spectator' ? 0 : this.freeColor(),
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: 0,
      left: false,
      status,
      dice: 0,
      usedPalifico: false,
      rank: null,
      outOrder: 0,
      stats: emptyStats(),
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const seatFree = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS;
    if (this.phase === 'lobby' && !seatFree) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, seatFree ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    this.addLog('system', p.status === 'spectator' ? `${p.name} regarde la partie.` : `${p.name} rejoint la table.`);
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    const bot = this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby');
    this.players.push(bot);
    this.addLog('system', `${bot.name} (bot) rejoint la table.`);
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    this.addLog('system', `${p.name} a été retiré de la table.`);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') {
      this.players = this.players.filter((x) => x.id !== id);
      this.addLog('system', `${p.name} a quitté la table.`);
    } else {
      p.left = true;
      if (p.status === 'playing') this.addLog('system', `${p.name} a quitté la partie : le pilote automatique prend le relais.`);
      else this.addLog('system', `${p.name} a quitté la table.`);
    }
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
    if (next) this.addLog('system', `${next.name} devient l'hôte de la table.`);
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    if (p.left) {
      p.left = false;
      this.addLog('system', `${p.name} est de retour.`);
    }
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    const { think, calza } = payload;
    if ((THINK_OPTIONS as readonly unknown[]).includes(think)) this.settings.think = think as ThinkTime;
    if (typeof calza === 'boolean') this.settings.calza = calza;
    return undefined;
  }

  // ───────────────────────────── Journal ─────────────────────────────

  addLog(kind: LogKind, text: string, playerId?: string): void {
    this.log.push({ id: ++this.logId, at: Date.now(), kind, text, playerId });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
  }

  chat(id: string, text: string): string | undefined {
    const p = this.get(id);
    if (!p) return 'Joueur introuvable.';
    this.addLog('chat', `${p.name} : ${text}`, p.id);
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...shuffle([...seated]), ...spectators];
    for (const p of seated) {
      p.status = 'playing';
      p.dice = START_DICE;
      p.usedPalifico = false;
      p.rank = null;
      p.outOrder = 0;
      p.stats = emptyStats();
    }
    this.phase = 'playing';
    this.roundCount = 0;
    this.outCount = 0;
    this.nextPalifico = null;
    this.firstId = this.players[0].id;
    this.final = null;
    this.addLog('system', `La partie commence ! ${seated.length} joueurs, cinq dés chacun.`);
    this.startRound();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.dice = 0;
      p.rank = null;
    }
    // Un spectateur qui prend place reçoit une couleur libre.
    const taken = new Set<number>();
    for (const p of this.seated) {
      if (taken.has(p.color)) {
        for (let c = 0; c < COLORS; c++) {
          if (!taken.has(c)) {
            p.color = c;
            break;
          }
        }
      }
      taken.add(p.color);
    }
    this.phase = 'lobby';
    this.round = null;
    this.final = null;
    this.addLog('system', 'Retour au salon : nouvelle partie en préparation.');
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    this.addLog('system', "L'hôte a arrêté la partie.");
    return this.restart(by);
  }

  private playing(): Player[] {
    return this.players.filter((p) => p.status === 'playing');
  }

  private startRound(): void {
    const alive = this.playing();
    const seats = this.players.map((p) => p.id);
    const start = Math.max(0, seats.indexOf(this.firstId));
    const order: string[] = [];
    for (let i = 0; i < seats.length; i++) {
      const p = this.players[(start + i) % seats.length];
      if (alive.includes(p)) order.push(p.id);
    }
    const now = Date.now();
    const hands = new Map<string, number[]>();
    for (const p of alive) hands.set(p.id, Array.from({ length: p.dice }, () => crypto.randomInt(1, 7)));
    const palificoId = this.nextPalifico;
    this.nextPalifico = null;
    this.round = {
      number: ++this.roundCount,
      order,
      firstId: order[0],
      phase: 'roll',
      hands,
      bid: null,
      bidderId: null,
      bidSeq: 0,
      heard: [],
      palificoId,
      turnId: null,
      turnEndsAt: 0,
      botActAt: 0,
      rollEndsAt: now + ROLL_MS,
      reveal: null,
      revealEndsAt: 0,
      revealMinAt: 0,
      ready: new Set(),
    };
    const firstName = this.get(order[0])!.name;
    if (palificoId) this.addLog('round', `Manche ${this.roundCount} : Palifico pour ${this.get(palificoId)!.name} ! Pas de joker, la face ne change plus.`);
    else this.addLog('round', `Manche ${this.roundCount} : ${firstName} ouvre.`);
  }

  /** Fin de l'agitation des gobelets : la première annonce peut tomber. */
  beginBidding(): void {
    const r = this.round;
    if (!r || r.phase !== 'roll') return;
    r.phase = 'bid';
    this.setTurn(r, r.firstId);
  }

  private setTurn(r: Round, id: string): void {
    const now = Date.now();
    r.turnId = id;
    r.turnEndsAt = FAST ? now + 900 : this.settings.think ? now + this.settings.think * 1000 : 0;
    r.botActAt = FAST ? now + 20 : this.onlyBotsLeft() ? now + 400 : now + 1300 + Math.random() * 2400;
  }

  /** Plus aucun humain en jeu : les bots finissent vite pour ne pas faire attendre les éliminés. */
  private onlyBotsLeft(): boolean {
    return this.playing().every((p) => p.isBot || p.left);
  }

  private nextAfter(r: Round, id: string): string {
    const i = r.order.indexOf(id);
    return r.order[(i + 1) % r.order.length];
  }

  private totalDice(r: Round): number {
    let n = 0;
    for (const d of r.hands.values()) n += d.length;
    return n;
  }

  private calzaAllowed(r: Round): boolean {
    return this.settings.calza && !r.palificoId && r.order.length > 2 && !!r.bid;
  }

  bid(id: string, qty: unknown, face: unknown): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'bid') return "Ce n'est pas le moment d'annoncer.";
    if (r.turnId !== id) return "Ce n'est pas ton tour.";
    const q = Math.floor(Number(qty));
    const f = Math.floor(Number(face));
    const min = minQty(r.bid, f, !!r.palificoId);
    if (min === null) return r.palificoId && r.bid ? 'En Palifico, la face ne change plus.' : !r.bid && f === PACO ? "On n'ouvre pas sur des Pacos." : 'Cette face est interdite.';
    const max = this.totalDice(r);
    if (!Number.isFinite(q) || q < min) return `Il faut annoncer au moins ${min} dé${min > 1 ? 's' : ''} sur cette face.`;
    if (q > max) return `Il n'y a pas tant de dés en jeu.`;
    r.bid = { qty: q, face: f };
    r.bidderId = id;
    r.bidSeq++;
    r.heard.push({ face: f, qty: q });
    const p = this.get(id)!;
    if (p.isBot && !FAST && Math.random() < 0.12) this.onEmote(id, TAUNTS[crypto.randomInt(TAUNTS.length)]);
    this.setTurn(r, this.nextAfter(r, id));
    return undefined;
  }

  dudo(id: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'bid') return "Ce n'est pas le moment de crier Dudo.";
    if (r.turnId !== id) return "Ce n'est pas ton tour.";
    if (!r.bid || !r.bidderId) return "Il n'y a encore aucune annonce à contester.";
    this.resolve(r, 'dudo', id);
    return undefined;
  }

  /** Le Calza se crie à tout moment, sauf par celui qui vient d'annoncer. */
  calza(id: string, seq: unknown): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'bid') return "Ce n'est pas le moment de crier Calza.";
    if (!this.settings.calza) return 'Le Calza est désactivé à cette table.';
    if (!r.bid || !r.bidderId) return "Il n'y a encore aucune annonce.";
    if (r.palificoId) return 'Pas de Calza en Palifico.';
    if (r.order.length <= 2) return 'Pas de Calza à deux joueurs.';
    if (!r.order.includes(id)) return 'Tu ne joues pas cette manche.';
    if (r.bidderId === id) return 'Pas de Calza sur ta propre annonce.';
    if (seq !== undefined && seq !== r.bidSeq) return "L'annonce vient de changer.";
    this.resolve(r, 'calza', id);
    return undefined;
  }

  private resolve(r: Round, kind: 'dudo' | 'calza', callerId: string): void {
    const bid = r.bid!;
    const bidderId = r.bidderId!;
    const wild = !r.palificoId && bid.face !== PACO;
    const hands = r.order.map((id) => ({ id, dice: [...r.hands.get(id)!].sort((a, b) => a - b) }));
    const actual = hands.reduce((n, h) => n + countDice(h.dice, bid.face, wild), 0);
    const caller = this.get(callerId)!;
    const bidder = this.get(bidderId)!;
    let loser: Player | null = null;
    let gainer: Player | null = null;
    const text = bidText(bid);
    if (kind === 'dudo') {
      const holds = actual >= bid.qty;
      loser = holds ? caller : bidder;
      if (holds) {
        caller.stats.dudoWrong++;
        bidder.stats.held++;
        bidder.stats.biggestHeld = Math.max(bidder.stats.biggestHeld, bid.qty);
      } else {
        caller.stats.dudoRight++;
        bidder.stats.caught++;
      }
      this.addLog('penalty', `${caller.name} crie Dudo sur ${text} de ${bidder.name} : il y en avait ${actual}. ${loser.name} perd un dé.`, callerId);
    } else if (actual === bid.qty) {
      caller.stats.calzaRight++;
      if (caller.dice < START_DICE) gainer = caller;
      this.addLog('win', `${caller.name} crie Calza sur ${text} : pile ${actual} !${gainer ? ' Un dé de regagné.' : ''}`, callerId);
    } else {
      caller.stats.calzaWrong++;
      loser = caller;
      this.addLog('penalty', `${caller.name} crie Calza sur ${text} : il y en avait ${actual}. ${caller.name} perd un dé.`, callerId);
    }
    if (gainer) gainer.dice++;
    if (loser) loser.dice--;

    const eliminated = !!loser && loser.dice === 0;
    if (eliminated) {
      loser!.status = 'eliminated';
      loser!.outOrder = ++this.outCount;
      this.addLog('eliminate', `${loser!.name} n'a plus de dé et sort du jeu.`, loser!.id);
    }
    const alive = this.playing();
    const winnerId = alive.length === 1 ? alive[0].id : null;

    // Le perdant ouvre ; s'il est éliminé, son voisin de gauche ; après un Calza réussi, celui qui l'a crié.
    const pivot = (loser ?? caller).id;
    const nextFirstId = winnerId ? null : eliminated ? this.nextAfter(r, pivot) : pivot;
    let palificoNextId: string | null = null;
    if (!winnerId && loser && loser.dice === 1 && !loser.usedPalifico && alive.length > 2) {
      loser.usedPalifico = true;
      palificoNextId = loser.id;
    }
    if (loser && loser.dice === 1 && alive.length <= 2) loser.usedPalifico = true;
    if (nextFirstId) this.firstId = nextFirstId;
    this.nextPalifico = palificoNextId;

    const matches = hands.reduce((n, h) => n + countDice(h.dice, bid.face, wild), 0);
    const now = Date.now();
    r.phase = 'reveal';
    r.turnId = null;
    r.turnEndsAt = 0;
    r.reveal = { kind, callerId, bidderId, bid: { ...bid }, wild, hands, actual, loserId: loser?.id ?? null, gainerId: gainer?.id ?? null, eliminated, winnerId, nextFirstId, palificoNextId };
    // Le décompte dure d'autant plus qu'il y a de dés à compter.
    r.revealMinAt = now + REVEAL_BASE_MS + matches * REVEAL_STEP_MS;
    const quick = this.onlyBotsLeft() ? 900 : REVEAL_MS;
    r.revealEndsAt = FAST ? now + REVEAL_MS : r.revealMinAt + quick;
    r.ready.clear();
  }

  readyNext(id: string): string | undefined {
    const r = this.round;
    if (this.phase !== 'playing' || !r || r.phase !== 'reveal') return undefined;
    r.ready.add(id);
    const needed = this.players.filter((p) => !p.isBot && !this.isAuto(p) && p.connected && p.status === 'playing');
    if (needed.every((p) => r.ready.has(p.id))) {
      // Tout le monde est prêt : on abrège l'attente, sans couper le décompte.
      if (Date.now() >= r.revealMinAt) this.afterRound();
      else r.revealEndsAt = r.revealMinAt;
    }
    return undefined;
  }

  afterRound(): void {
    const r = this.round;
    if (!r?.reveal) return;
    if (r.reveal.winnerId) this.finishGame(r.reveal.winnerId);
    else this.startRound();
  }

  private finishGame(winnerId: string): void {
    const winner = this.get(winnerId)!;
    const out = this.players.filter((p) => p.status === 'eliminated').sort((a, b) => b.outOrder - a.outOrder);
    [winner, ...out].forEach((p, i) => {
      p.rank = i + 1;
      p.status = 'eliminated';
    });
    this.addLog('win', `${winner.name} remporte la partie !`, winner.id);
    this.phase = 'finished';
    this.clearTimer();
    this.final = this.players
      .filter((p) => p.rank !== null)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, rank: p.rank!, dice: p.dice, stats: { ...p.stats } }))
      .sort((a, b) => a.rank - b.rank);
  }

  // ───────────────────────────── Minuteries & automatismes ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private at(ms: number, fn: () => void): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(ms, 2_147_000_000)));
  }

  /** Quand agir pour un joueur : bot → délai naturel, déconnecté → fin du délai de grâce, sinon à la fin du chrono éventuel. */
  private dueAt(p: Player, deadline: number, botAt: number): number {
    const limit = deadline > 0 ? deadline : Infinity;
    if (this.isAuto(p)) return p.isBot ? botAt : Math.min(botAt, Date.now() + 700);
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'playing') return;
    const now = Date.now();
    const r = this.round;
    if (!r) return;
    if (r.phase === 'roll') {
      this.at(r.rollEndsAt - now, () => {
        if (this.round === r) this.beginBidding();
      });
      return;
    }
    if (r.phase === 'reveal') {
      this.at(r.revealEndsAt - now, () => {
        if (this.round === r && r.phase === 'reveal') this.afterRound();
      });
      return;
    }
    if (!r.turnId) return;
    const p = this.get(r.turnId);
    if (!p) return;
    const turnId = r.turnId;
    const seq = r.bidSeq;
    const due = this.dueAt(p, r.turnEndsAt, r.botActAt);
    if (!Number.isFinite(due)) return;
    this.at(due - now, () => {
      if (this.round !== r || r.phase !== 'bid' || r.turnId !== turnId || r.bidSeq !== seq) return;
      if (this.isAuto(p) || (r.turnEndsAt > 0 && Date.now() >= r.turnEndsAt) || !p.connected) this.autoPlay(r, p);
    });
  }

  private botView(r: Round, p: Player): BotView {
    return {
      dice: [...(r.hands.get(p.id) ?? [])],
      total: this.totalDice(r),
      bid: r.bid ? { ...r.bid } : null,
      palifico: !!r.palificoId,
      calzaAllowed: this.calzaAllowed(r) && r.bidderId !== p.id,
      personality: p.personality,
      heard: r.heard.map((h) => ({ ...h })),
    };
  }

  private autoPlay(r: Round, p: Player): void {
    const move = botTurn(this.botView(r, p));
    const err = move.type === 'dudo' ? this.dudo(p.id) : move.type === 'calza' ? this.calza(p.id, undefined) : this.bid(p.id, move.bid.qty, move.bid.face);
    if (!err) return;
    // Filet de sécurité : la partie ne doit jamais se bloquer sur un bot.
    if (r.bid) this.dudo(p.id);
    else this.bid(p.id, 1, 2);
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private options(r: Round, id: string): MyOptions | null {
    if (r.phase !== 'bid' || r.turnId !== id) return null;
    const maxQty = this.totalDice(r);
    const mins: Record<number, number | null> = {};
    for (const f of FACES) {
      const m = minQty(r.bid, f, !!r.palificoId);
      mins[f] = m !== null && m <= maxQty ? m : null;
    }
    return { canBid: Object.values(mins).some((m) => m !== null), mins, maxQty, canDudo: !!r.bid };
  }

  viewFor(viewerId: string): RoomView {
    const r = this.round;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        color: p.color,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        rank: p.rank,
        dice: p.dice,
        inRound: !!r && r.order.includes(p.id),
      })),
      round: r
        ? {
            number: r.number,
            order: [...r.order],
            firstId: r.firstId,
            phase: r.phase,
            turnId: r.turnId,
            turnEndsAt: r.turnEndsAt,
            bid: r.bid ? { ...r.bid } : null,
            bidderId: r.bidderId,
            bidSeq: r.bidSeq,
            palificoId: r.palificoId,
            options: this.options(r, viewerId),
            canCalza: r.phase === 'bid' && this.calzaAllowed(r) && r.order.includes(viewerId) && r.bidderId !== viewerId,
            // Le cœur du jeu : les dés d'un joueur ne sortent du serveur que pour lui, jusqu'à la révélation.
            mine: r.hands.has(viewerId) ? [...r.hands.get(viewerId)!] : null,
            reveal: r.reveal,
            revealEndsAt: r.revealEndsAt,
            revealMinAt: r.revealMinAt,
            readyIds: [...r.ready],
          }
        : null,
      log: this.log.slice(-80),
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
