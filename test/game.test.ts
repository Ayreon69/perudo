import { afterEach, describe, expect, it, vi } from 'vitest';
import { botTurn, chance, exactChance, randomPersonality, type BotView } from '../server/bots';
import { Room, type Player } from '../server/room';
import { countDice, minQty, type Bid } from '../shared/protocol';

function table(players: number): { room: Room; ids: string[] } {
  const room = new Room('TEST');
  const host = room.addHuman('Hôte', 'llama') as Player;
  for (let i = 1; i < players; i++) room.addHuman(`J${i}`, 'sun');
  room.start(host.id);
  room.beginBidding();
  return { room, ids: room.round!.order };
}

/** Impose les dés de chacun, dans l'ordre de jeu. */
function rig(room: Room, hands: number[][]): void {
  const r = room.round!;
  r.order.forEach((id, i) => r.hands.set(id, hands[i]));
}

function dice(room: Room, id: string): number {
  return room.get(id)!.dice;
}

/** Fait perdre un dé à ce joueur jusqu'à ce qu'il lui en reste n, sans passer par une manche. */
function setDice(room: Room, id: string, n: number): void {
  room.get(id)!.dice = n;
}

/** Prochaine manche, et les gobelets posés. */
function next(room: Room): void {
  room.afterRound();
  room.beginBidding();
}

describe('mise en place', () => {
  it('on joue dès 2 joueurs, et pas tout seul', () => {
    const room = new Room('TEST');
    const host = room.addHuman('Hôte', 'llama') as Player;
    expect(room.start(host.id)).toMatch(/au moins 2/);
    room.addBot(host.id);
    expect(room.start(host.id)).toBeUndefined();
  });

  it('refuse un neuvième joueur', () => {
    const room = new Room('TEST');
    const host = room.addHuman('Hôte', 'llama') as Player;
    for (let i = 0; i < 7; i++) expect(room.addBot(host.id)).toBeUndefined();
    expect(room.addBot(host.id)).toMatch(/complète/);
    expect(room.addHuman('Tard', 'sun')).toMatch(/complète/);
  });

  it('chacun a cinq dés, une couleur à lui, et des dés de 1 à 6', () => {
    const { room } = table(6);
    expect(new Set(room.players.map((p) => p.color)).size).toBe(6);
    for (const p of room.players) {
      expect(p.dice).toBe(5);
      const hand = room.round!.hands.get(p.id)!;
      expect(hand).toHaveLength(5);
      expect(hand.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)).toBe(true);
    }
  });

  it("personne n'annonce tant que les gobelets s'agitent", () => {
    const room = new Room('TEST');
    const host = room.addHuman('Hôte', 'llama') as Player;
    room.addHuman('Deux', 'sun');
    room.start(host.id);
    expect(room.round!.phase).toBe('roll');
    expect(room.bid(room.round!.firstId, 1, 3)).toMatch(/moment/);
  });
});

describe('la règle des annonces', () => {
  const b = (qty: number, face: number): Bid => ({ qty, face });

  it("à l'ouverture : n'importe quelle face sauf le Paco", () => {
    for (const f of [2, 3, 4, 5, 6]) expect(minQty(null, f, false)).toBe(1);
    expect(minQty(null, 1, false)).toBeNull();
  });

  it('plus de dés sur n’importe quelle face, ou autant sur une face plus haute', () => {
    expect(minQty(b(5, 3), 3, false)).toBe(6);
    expect(minQty(b(5, 3), 2, false)).toBe(6);
    expect(minQty(b(5, 3), 4, false)).toBe(5);
    expect(minQty(b(5, 3), 6, false)).toBe(5);
  });

  it('vers les Pacos : la moitié, arrondie au-dessus', () => {
    expect(minQty(b(11, 4), 1, false)).toBe(6);
    expect(minQty(b(10, 4), 1, false)).toBe(5);
    expect(minQty(b(1, 6), 1, false)).toBe(1);
  });

  it('depuis les Pacos : le double, plus un', () => {
    expect(minQty(b(3, 1), 4, false)).toBe(7);
    expect(minQty(b(3, 1), 2, false)).toBe(7);
    expect(minQty(b(3, 1), 1, false)).toBe(4);
  });

  it('en Palifico : ouverture libre, puis la face ne bouge plus', () => {
    expect(minQty(null, 1, true)).toBe(1);
    expect(minQty(null, 4, true)).toBe(1);
    expect(minQty(b(2, 4), 4, true)).toBe(3);
    expect(minQty(b(2, 4), 5, true)).toBeNull();
    expect(minQty(b(2, 4), 1, true)).toBeNull();
    expect(minQty(b(2, 1), 1, true)).toBe(3);
    expect(minQty(b(2, 1), 3, true)).toBeNull();
  });

  it('refuse les faces impossibles', () => {
    expect(minQty(null, 0, false)).toBeNull();
    expect(minQty(null, 7, false)).toBeNull();
    expect(minQty(null, 2.5, false)).toBeNull();
  });

  it('le serveur applique tout ça', () => {
    const { room, ids } = table(3);
    const [a, b2, c] = ids;
    expect(room.bid(a, 1, 1)).toMatch(/Pacos/);
    expect(room.bid(b2, 1, 3)).toMatch(/ton tour/);
    expect(room.bid(a, 0, 3)).toMatch(/au moins/);
    expect(room.bid(a, 'beaucoup', 3)).toBeTruthy();
    expect(room.bid(a, 16, 3)).toMatch(/tant de dés/);
    expect(room.bid(a, 3, 3)).toBeUndefined();
    expect(room.bid(b2, 3, 2)).toMatch(/au moins 4/);
    expect(room.bid(b2, 2, 1)).toBeUndefined();
    expect(room.bid(c, 4, 5)).toMatch(/au moins 5/);
    expect(room.bid(c, 5, 5)).toBeUndefined();
  });

  it("le premier joueur ne peut pas crier Dudo sur rien", () => {
    const { room, ids } = table(3);
    expect(room.dudo(ids[0])).toMatch(/aucune annonce/);
  });
});

describe('le décompte', () => {
  it('les Pacos comptent comme joker, sauf si on annonce des Pacos', () => {
    expect(countDice([1, 1, 3, 3, 5], 3, true)).toBe(4);
    expect(countDice([1, 1, 3, 3, 5], 3, false)).toBe(2);
    expect(countDice([1, 1, 3, 3, 5], 1, false)).toBe(2);
  });
});

describe('Dudo', () => {
  it("annonce trop haute : celui qui a annoncé perd un dé et rouvre", () => {
    const { room, ids } = table(3);
    const [a, b, c] = ids;
    rig(room, [[2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 3, 6);
    room.dudo(b);
    expect(room.round!.reveal!.actual).toBe(0);
    expect(room.round!.reveal!.loserId).toBe(a);
    expect(dice(room, a)).toBe(4);
    expect(dice(room, b)).toBe(5);
    expect(dice(room, c)).toBe(5);
    next(room);
    expect(room.round!.firstId).toBe(a);
  });

  it("annonce tenue, même pile : celui qui a douté perd un dé et rouvre", () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    rig(room, [[1, 1, 2, 2, 2], [6, 6, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 4, 6);
    room.dudo(b);
    expect(room.round!.reveal!.actual).toBe(4);
    expect(room.round!.reveal!.loserId).toBe(b);
    expect(dice(room, b)).toBe(4);
    next(room);
    expect(room.round!.firstId).toBe(b);
  });

  it('sur des Pacos, les autres faces ne comptent pas', () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    rig(room, [[1, 2, 2, 2, 2], [1, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 2, 4);
    room.bid(b, 1, 1);
    room.dudo(ids[2]);
    expect(room.round!.reveal!.actual).toBe(2);
    expect(room.round!.reveal!.loserId).toBe(ids[2]);
  });

  it('le perdant éliminé : son voisin de gauche ouvre', () => {
    const { room, ids } = table(3);
    const [a, b, c] = ids;
    setDice(room, a, 1);
    rig(room, [[2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 5, 6);
    room.dudo(b);
    expect(room.get(a)!.status).toBe('eliminated');
    expect(room.round!.reveal!.eliminated).toBe(true);
    expect(room.round!.reveal!.nextFirstId).toBe(b);
    next(room);
    expect(room.round!.order).toEqual([b, c]);
    expect(room.round!.firstId).toBe(b);
  });

  it('le voisin de gauche suit bien la table quand le dernier du tour sort', () => {
    const { room, ids } = table(3);
    const [a, b, c] = ids;
    setDice(room, c, 1);
    rig(room, [[2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4]]);
    room.bid(a, 1, 2);
    room.bid(b, 2, 2);
    room.dudo(c);
    room.afterRound();
    expect(room.round!.firstId).toBe(a);
  });

  it('le dernier en jeu gagne, et le classement suit les sorties', () => {
    const { room, ids } = table(3);
    const [a, b, c] = ids;
    setDice(room, a, 1);
    setDice(room, b, 1);
    rig(room, [[2], [3], [4, 4, 4, 4, 4]]);
    room.bid(a, 7, 6);
    room.dudo(b);
    room.afterRound();
    room.beginBidding();
    expect(room.round!.order).toEqual([b, c]);
    rig(room, [[3], [4, 4, 4, 4, 4]]);
    room.bid(b, 6, 6);
    room.dudo(c);
    expect(room.round!.reveal!.winnerId).toBe(c);
    room.afterRound();
    expect(room.phase).toBe('finished');
    expect(room.final!.map((f) => f.id)).toEqual([c, b, a]);
    expect(room.final!.map((f) => f.rank)).toEqual([1, 2, 3]);
  });
});

describe('Calza', () => {
  it('pile juste : un dé de regagné, et celui qui a crié ouvre', () => {
    const { room, ids } = table(3);
    const [a, b, c] = ids;
    setDice(room, c, 3);
    rig(room, [[1, 2, 2, 2, 2], [6, 3, 3, 3, 3], [6, 4, 4]]);
    room.bid(a, 3, 6);
    expect(room.calza(c, room.round!.bidSeq)).toBeUndefined();
    expect(room.round!.reveal!.kind).toBe('calza');
    expect(room.round!.reveal!.gainerId).toBe(c);
    expect(dice(room, c)).toBe(4);
    next(room);
    expect(room.round!.firstId).toBe(c);
    expect(room.round!.hands.get(c)).toHaveLength(4);
    expect(b).toBeTruthy();
  });

  it('jamais plus de cinq dés', () => {
    const { room, ids } = table(3);
    const [a, , c] = ids;
    rig(room, [[6, 2, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 1, 6);
    room.calza(c, room.round!.bidSeq);
    expect(room.round!.reveal!.gainerId).toBeNull();
    expect(room.round!.reveal!.loserId).toBeNull();
    expect(dice(room, c)).toBe(5);
  });

  it('raté : un dé de perdu pour celui qui a crié, jamais pour celui qui a annoncé', () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    rig(room, [[6, 6, 2, 2, 2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(a, 1, 6);
    room.calza(b, room.round!.bidSeq);
    expect(room.round!.reveal!.loserId).toBe(b);
    expect(dice(room, b)).toBe(4);
    expect(dice(room, a)).toBe(5);
  });

  it('se crie hors tour, mais pas sur sa propre annonce ni sur une annonce périmée', () => {
    const { room, ids } = table(4);
    const [a, b, c] = ids;
    room.bid(a, 1, 3);
    const seen = room.round!.bidSeq;
    expect(room.calza(a, seen)).toMatch(/propre annonce/);
    room.bid(b, 2, 3);
    expect(room.calza(c, seen)).toMatch(/vient de changer/);
    expect(room.round!.phase).toBe('bid');
    expect(room.calza(a, room.round!.bidSeq)).toBeUndefined();
    expect(room.round!.phase).toBe('reveal');
  });

  it("n'existe pas à deux joueurs, ni en Palifico, ni si l'hôte l'a désactivé", () => {
    const duo = table(2);
    duo.room.bid(duo.ids[0], 1, 3);
    expect(duo.room.calza(duo.ids[1], 1)).toMatch(/deux joueurs/);
    expect(duo.room.viewFor(duo.ids[1]).round!.canCalza).toBe(false);

    const pal = table(3);
    pal.room.round!.palificoId = pal.ids[0];
    pal.room.bid(pal.ids[0], 1, 3);
    expect(pal.room.calza(pal.ids[1], 1)).toMatch(/Palifico/);

    const off = new Room('TEST');
    const host = off.addHuman('Hôte', 'llama') as Player;
    off.addBot(host.id);
    off.addBot(host.id);
    expect(off.updateSettings(host.id, { calza: false })).toBeUndefined();
    off.start(host.id);
    off.beginBidding();
    const r = off.round!;
    off.bid(r.firstId, 1, 3);
    if (r.bidderId !== host.id) expect(off.calza(host.id, r.bidSeq)).toMatch(/désactivé/);
    expect(off.viewFor(host.id).round!.canCalza).toBe(false);
  });
});

describe('Palifico', () => {
  /** Amène ce joueur de 2 dés à 1 sur un Dudo gagné contre lui. */
  function dropToOne(room: Room, ids: string[]): string {
    const [a, b] = ids;
    setDice(room, a, 2);
    rig(room, ids.map((id, i) => (i === 0 ? [2, 2] : [3, 3, 3, 3, 3])));
    room.bid(a, 7, 6);
    room.dudo(b);
    return a;
  }

  it('tomber à un dé déclenche le Palifico : ce joueur ouvre, sur la face de son choix', () => {
    const { room, ids } = table(3);
    const a = dropToOne(room, ids);
    expect(room.round!.reveal!.palificoNextId).toBe(a);
    next(room);
    expect(room.round!.palificoId).toBe(a);
    expect(room.round!.firstId).toBe(a);
    expect(room.bid(a, 1, 1)).toBeUndefined();
  });

  it('les Pacos ne sont plus des jokers et la face ne change plus', () => {
    const { room, ids } = table(3);
    const a = dropToOne(room, ids);
    next(room);
    const [first, second, third] = room.round!.order;
    expect(first).toBe(a);
    rig(room, [[5], [1, 1, 5, 2, 2], [1, 1, 1, 1, 1]]);
    room.bid(first, 1, 5);
    expect(room.bid(second, 2, 6)).toMatch(/face ne change plus/);
    expect(room.bid(second, 3, 5)).toBeUndefined();
    room.dudo(third);
    expect(room.round!.reveal!.wild).toBe(false);
    expect(room.round!.reveal!.actual).toBe(2);
    expect(room.round!.reveal!.loserId).toBe(second);
  });

  it('une seule fois par joueur, même après avoir regagné un dé', () => {
    const { room, ids } = table(3);
    const a = dropToOne(room, ids);
    next(room);
    expect(room.round!.palificoId).toBe(a);
    // Le Palifico se termine sans toucher à ce joueur, qui regagne ensuite un dé puis retombe à un.
    const [first, second, third] = room.round!.order;
    rig(room, [[2], [3, 3, 3, 3, 3], [4, 4, 4, 4, 4]]);
    room.bid(first, 1, 3);
    room.dudo(second);
    next(room);
    expect(room.round!.palificoId).toBeNull();
    setDice(room, a, 2);
    const order = room.round!.order;
    rig(room, order.map((id) => (id === a ? [2, 2] : [3, 3, 3, 3, 3])));
    const opener = order[0];
    const responder = order[1];
    if (opener === a) {
      room.bid(a, 9, 6);
      room.dudo(responder);
    } else {
      room.bid(opener, 1, 6);
      room.round!.turnId = a;
      room.bid(a, 9, 6);
      room.round!.turnId = opener;
      room.dudo(opener);
    }
    expect(dice(room, a)).toBe(1);
    expect(room.round!.reveal!.palificoNextId).toBeNull();
    expect(third).toBeTruthy();
  });

  it('pas de Palifico quand il ne reste que deux joueurs', () => {
    const { room, ids } = table(2);
    const a = dropToOne(room, ids);
    expect(dice(room, a)).toBe(1);
    expect(room.round!.reveal!.palificoNextId).toBeNull();
    next(room);
    expect(room.round!.palificoId).toBeNull();
    expect(room.bid(a, 1, 1)).toMatch(/Pacos/);
  });
});

describe('secrets', () => {
  it("chacun ne reçoit que ses propres dés avant la révélation", () => {
    const { room, ids } = table(4);
    const [a, b] = ids;
    room.bid(a, 1, 3);
    const v = room.viewFor(b);
    expect(v.round!.mine).toEqual(room.round!.hands.get(b));
    expect(v.round!.reveal).toBeNull();
    const text = JSON.stringify({ ...v, round: { ...v.round, mine: null } });
    expect(text).not.toContain('hands');
    expect(room.viewFor('spectateur-inconnu').round!.mine).toBeNull();
  });

  it('une seule annonce circule : les précédentes ne sont écrites nulle part', () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    room.bid(a, 2, 3);
    room.bid(b, 3, 5);
    const v = room.viewFor(ids[2]);
    expect(v.round!.bid).toEqual({ qty: 3, face: 5 });
    expect(v.log.some((l) => /2 × 3/.test(l.text))).toBe(false);
    expect(JSON.stringify(v)).not.toContain('heard');
  });

  it('les dés de tous se révèlent au Dudo, triés et en ordre de table', () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    rig(room, [[6, 2, 4, 1, 3], [5, 5, 5, 5, 5], [2, 2, 2, 2, 2]]);
    room.bid(a, 1, 3);
    room.dudo(b);
    const reveal = room.viewFor(ids[2]).round!.reveal!;
    expect(reveal.hands.map((h) => h.id)).toEqual(ids);
    expect(reveal.hands[0].dice).toEqual([1, 2, 3, 4, 6]);
  });
});

describe('statistiques', () => {
  it('comptent les Dudo et les annonces', () => {
    const { room, ids } = table(3);
    const [a, b] = ids;
    rig(room, [[3, 3, 3, 3, 3], [2, 2, 2, 2, 2], [2, 2, 2, 2, 2]]);
    room.bid(a, 5, 3);
    room.dudo(b);
    expect(room.get(a)!.stats.held).toBe(1);
    expect(room.get(a)!.stats.biggestHeld).toBe(5);
    expect(room.get(b)!.stats.dudoWrong).toBe(1);
  });
});

describe('les bots', () => {
  const view = (over: Partial<BotView>): BotView => ({
    dice: [2, 3, 4, 5, 6],
    total: 20,
    bid: null,
    palifico: false,
    calzaAllowed: true,
    personality: { bluff: 0.4, nerve: 0.5, trust: 0.5 },
    heard: [],
    ...over,
  });

  it("n'ouvrent jamais sur des Pacos hors Palifico, et jouent toujours un coup permis", () => {
    for (let i = 0; i < 300; i++) {
      const v = view({ personality: randomPersonality(), dice: Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6)) });
      const move = botTurn(v);
      expect(move.type).toBe('bid');
      if (move.type === 'bid') {
        expect(move.bid.face).not.toBe(1);
        expect(minQty(null, move.bid.face, false)).not.toBeNull();
        expect(move.bid.qty).toBeLessThanOrEqual(20);
      }
    }
  });

  it('restent dans les règles quelle que soit la situation', () => {
    for (let i = 0; i < 2000; i++) {
      const face = 1 + Math.floor(Math.random() * 6);
      const total = 2 + Math.floor(Math.random() * 38);
      const bid = { qty: 1 + Math.floor(Math.random() * total), face };
      const palifico = Math.random() < 0.2;
      const v = view({ total, bid, palifico, personality: randomPersonality(), calzaAllowed: !palifico && Math.random() < 0.5, dice: Array.from({ length: Math.min(5, total) }, () => 1 + Math.floor(Math.random() * 6)) });
      const move = botTurn(v);
      if (move.type === 'bid') {
        const min = minQty(bid, move.bid.face, palifico);
        expect(min).not.toBeNull();
        expect(move.bid.qty).toBeGreaterThanOrEqual(min!);
        expect(move.bid.qty).toBeLessThanOrEqual(total);
      }
      if (move.type === 'calza') expect(v.calzaAllowed).toBe(true);
    }
  });

  it('crient Dudo sur une annonce impossible, et laissent passer une annonce sûre', () => {
    let dudos = 0;
    for (let i = 0; i < 100; i++) if (botTurn(view({ total: 10, bid: { qty: 10, face: 6 } })).type === 'dudo') dudos++;
    expect(dudos).toBeGreaterThan(95);
    let safe = 0;
    for (let i = 0; i < 100; i++) if (botTurn(view({ dice: [6, 6, 6, 1, 1], total: 20, bid: { qty: 2, face: 6 }, calzaAllowed: false })).type === 'dudo') safe++;
    expect(safe).toBeLessThan(3);
  });

  it('estiment les chances à partir de leurs seuls dés', () => {
    const v = view({ dice: [6, 6, 1, 2, 3], total: 15 });
    expect(chance(v, { qty: 3, face: 6 })).toBe(1);
    expect(chance(v, { qty: 4, face: 6 })).toBeGreaterThan(chance(v, { qty: 8, face: 6 }));
    expect(exactChance(v, { qty: 2, face: 6 })).toBe(0);
    const pal = view({ dice: [1, 1, 1, 1, 1], total: 10, palifico: true });
    expect(chance(pal, { qty: 1, face: 6 })).toBeLessThan(1);
  });

  it('jouent des parties complètes sans jamais se bloquer', () => {
    vi.useFakeTimers();
    for (let n = 0; n < 200; n++) {
      const players = 2 + (n % 7);
      const room = new Room('TEST');
      const host = room.addHuman('Hôte', 'llama') as Player;
      for (let i = 1; i < players; i++) room.addBot(host.id);
      room.start(host.id);
      room.leave(host.id);
      let safety = 0;
      while (room.phase === 'playing' && safety++ < 5000) {
        const r = room.round!;
        room.commit();
        vi.advanceTimersByTime(r.phase === 'reveal' ? 60_000 : 20_000);
      }
      expect(room.phase).toBe('finished');
      expect(room.final!.length).toBe(players);
      expect(room.final![0].dice).toBeGreaterThan(0);
      room.dispose();
    }
    vi.useRealTimers();
  });
});

describe('robustesse', () => {
  afterEach(() => vi.useRealTimers());

  it('un joueur parti est remplacé par le pilote automatique', () => {
    vi.useFakeTimers();
    const { room, ids } = table(3);
    room.commit();
    const turn = room.round!.turnId!;
    room.leave(turn);
    room.commit();
    vi.advanceTimersByTime(800);
    expect(room.round!.turnId === turn && !room.round!.bid).toBe(false);
    expect(ids).toContain(turn);
    room.dispose();
  });

  it('le temps de réflexion écoulé fait jouer le pilote automatique', () => {
    vi.useFakeTimers();
    const room = new Room('TEST');
    const host = room.addHuman('Hôte', 'llama') as Player;
    const other = room.addHuman('Deux', 'sun') as Player;
    room.connect(host, 's1');
    room.connect(other, 's2');
    room.updateSettings(host.id, { think: 30 });
    room.start(host.id);
    room.beginBidding();
    room.commit();
    vi.advanceTimersByTime(29_000);
    expect(room.round!.bid).toBeNull();
    vi.advanceTimersByTime(1_500);
    expect(room.round!.bid).not.toBeNull();
    room.dispose();
  });

  it('on ne saute pas le décompte, même si tout le monde est pressé', () => {
    vi.useFakeTimers();
    const room = new Room('TEST');
    const host = room.addHuman('Hôte', 'llama') as Player;
    room.connect(host, 's1');
    room.addBot(host.id);
    room.start(host.id);
    room.beginBidding();
    const r = room.round!;
    const [first, second] = r.order;
    room.bid(first, 1, 3);
    room.dudo(second);
    expect(r.phase).toBe('reveal');
    room.readyNext(host.id);
    expect(room.round).toBe(r);
    expect(r.revealEndsAt).toBe(r.revealMinAt);
    room.commit();
    vi.advanceTimersByTime(r.revealMinAt - Date.now() + 10);
    expect(room.round).not.toBe(r);
    room.dispose();
  });

  it('la revanche remet tout à zéro', () => {
    const { room, ids } = table(3);
    room.get(ids[0])!.usedPalifico = true;
    const host = room.hostId;
    expect(room.restart(host)).toBeUndefined();
    expect(room.phase).toBe('lobby');
    expect(room.start(host)).toBeUndefined();
    for (const p of room.players) {
      expect(p.dice).toBe(5);
      expect(p.usedPalifico).toBe(false);
    }
  });
});
