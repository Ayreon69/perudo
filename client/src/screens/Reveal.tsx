// Le grand moment : le cri, les gobelets qui se lèvent, puis chaque dé compté un à un jusqu'au verdict.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { PACO, type Reveal, type RoomView, type RoundView } from '../../../shared/protocol';
import { Avatar, DieFace, colorVars } from '../components/Dice';
import { Button } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural, secondsLeft, useTick, vibrate } from '../lib/util';
import { send } from '../net';
import { serverNow } from '../store';

/** Le temps du cri plein écran, puis celui d'un dé compté. Le serveur attend au moins autant avant de passer à la suite. */
const STAMP_MS = 1250;
const SETTLE_MS = 450;
const STEP_MS = 380;

function verdict(rv: Reveal, view: RoomView): { title: string; line: string; tone: 'win' | 'lose' | 'neutral' } {
  const me = view.me;
  const name = (id: string | null) => (id === me ? 'Tu' : view.players.find((p) => p.id === id)?.name ?? '?');
  const owner = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '?';
  const verb = (id: string | null, tu: string, il: string) => (id === me ? `Tu ${tu}` : `${owner(id)} ${il}`);
  const parts: string[] = [];
  if (rv.loserId) parts.push(`${verb(rv.loserId, 'perds', 'perd')} un dé.`);
  else if (rv.gainerId) parts.push(`${verb(rv.gainerId, 'regagnes', 'regagne')} un dé.`);
  else parts.push(`${name(rv.callerId)} ${rv.callerId === me ? 'as' : 'a'} déjà cinq dés : rien à regagner.`);
  if (rv.eliminated) parts.push(rv.loserId === me ? 'Plus de dé : tu sors du jeu.' : 'Plus de dé : sortie du jeu.');
  if (rv.winnerId) parts.push(rv.winnerId === me ? 'Et la partie est à toi !' : `${owner(rv.winnerId)} remporte la partie.`);
  else if (rv.palificoNextId) parts.push(rv.palificoNextId === me ? 'Palifico pour toi au prochain tour.' : `Palifico pour ${owner(rv.palificoNextId)} au prochain tour.`);
  const tone = rv.loserId === me ? 'lose' : rv.gainerId === me || rv.winnerId === me ? 'win' : rv.kind === 'dudo' && (rv.callerId === me || rv.bidderId === me) ? 'win' : 'neutral';
  let title: string;
  if (rv.kind === 'calza') title = rv.actual === rv.bid.qty ? 'Pile-poil !' : 'Calza ratée !';
  else title = rv.actual >= rv.bid.qty ? "L'annonce tient !" : 'Annonce démasquée !';
  return { title, line: parts.join(' '), tone };
}

export function Stamp({ rv, view }: { rv: Reveal; view: RoomView }) {
  const caller = view.players.find((p) => p.id === rv.callerId);
  const bidder = view.players.find((p) => p.id === rv.bidderId);
  const who = rv.callerId === view.me ? 'Tu cries' : `${caller?.name ?? '?'} crie`;
  const on = rv.bidderId === view.me ? 'ton annonce' : `l'annonce de ${bidder?.name ?? '?'}`;
  return (
    <motion.div className={cls('stamp', `is-${rv.kind}`)} initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.06 }} transition={{ duration: 0.2 }} aria-live="assertive">
      <span className="stamp-rays" />
      <motion.h2 initial={{ scale: 3.2, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -5, opacity: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 20 }}>
        {rv.kind === 'dudo' ? '¡Dudo!' : '¡Calza!'}
      </motion.h2>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
        {who} sur {on}
      </motion.p>
    </motion.div>
  );
}

export function RevealScreen({ view, r, canReady }: { view: RoomView; r: RoundView; canReady: boolean }) {
  const rv = r.reveal!;
  const now = useTick(250);
  // Les dés à compter, dans l'ordre de la table : ce sont eux qui s'allument un à un.
  const matches = useMemo(() => {
    const list: string[] = [];
    rv.hands.forEach((h) => h.dice.forEach((d, i) => {
      if (d === rv.bid.face || (rv.wild && d === PACO)) list.push(`${h.id}:${i}`);
    }));
    return list;
  }, [rv]);
  // Arrivé après le décompte (page rechargée) : pas de cri ni de compte, on montre directement le verdict.
  const [late] = useState(() => serverNow() >= r.revealMinAt);
  const [stage, setStage] = useState<'stamp' | 'count' | 'done'>(late ? 'done' : 'stamp');
  const [counted, setCounted] = useState(late ? matches.length : 0);
  const target = rv.bid.qty;

  // Une seule fois par manche : le serveur renvoie un nouvel objet reveal à chaque diffusion (un joueur prêt, un message…), et ça ne doit pas relancer le compte.
  useEffect(() => {
    if (late) return;
    const ids: ReturnType<typeof setTimeout>[] = [];
    // Différé : le double montage de StrictMode en dev l'annule, le cri ne part qu'une fois.
    ids.push(setTimeout(() => {
      if (rv.kind === 'dudo') sfx.dudo();
      else sfx.calza();
      vibrate([70, 50, 140]);
    }, 0));
    ids.push(setTimeout(() => {
      setStage('count');
      sfx.lift();
    }, STAMP_MS));
    const start = STAMP_MS + SETTLE_MS;
    matches.forEach((_, i) => {
      ids.push(setTimeout(() => {
        setCounted(i + 1);
        sfx.count(i);
        vibrate(14);
      }, start + i * STEP_MS));
    });
    ids.push(setTimeout(() => {
      setStage('done');
      const mine = rv.loserId === view.me;
      const good = rv.gainerId === view.me || rv.winnerId === view.me || (!mine && rv.kind === 'dudo' && (rv.callerId === view.me || rv.bidderId === view.me));
      if (mine) {
        sfx.bad();
        vibrate([60, 40, 160]);
      } else if (good) {
        sfx.good();
        void confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 }, colors: ['#ff2d95', '#ffe600', '#19f26b', '#12e6ff'] });
      } else sfx.slam();
    }, start + matches.length * STEP_MS + 250));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const v = verdict(rv, view);
  const lit = new Set(matches.slice(0, counted));
  const left = secondsLeft(r.revealEndsAt, now);
  const ready = r.readyIds.includes(view.me);
  const reached = counted >= target;

  return (
    <div className={cls('reveal', stage === 'done' && `is-${v.tone}`)}>
      <AnimatePresence>{stage === 'stamp' && <Stamp rv={rv} view={view} />}</AnimatePresence>
      {stage !== 'stamp' && (
        <>
          <div className="reveal-head">
            <div className="reveal-bid">
              <small>Annoncé</small>
              <span>
                {rv.bid.qty} <i>×</i> <DieFace face={rv.bid.face} color={1} />
              </span>
            </div>
            <div className={cls('reveal-count', reached && rv.kind === 'dudo' && 'is-reached', stage === 'done' && rv.kind === 'calza' && rv.actual === target && 'is-reached')}>
              <small>Sur la table</small>
              <motion.b key={counted} initial={{ scale: 1.7 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 520, damping: 16 }}>
                {counted}
              </motion.b>
            </div>
          </div>
          {!rv.wild && <p className="reveal-note">{rv.bid.face === PACO ? 'On compte les Pacos, et eux seuls.' : 'Palifico : les Pacos ne comptent pas.'}</p>}

          <ul className="reveal-rows">
            {rv.hands.map((h, i) => {
              const p = view.players.find((x) => x.id === h.id);
              if (!p) return null;
              const loses = stage === 'done' && rv.loserId === h.id;
              const gains = stage === 'done' && rv.gainerId === h.id;
              return (
                <motion.li key={h.id} className={cls('reveal-row', h.id === view.me && 'is-me', loses && 'is-loser', gains && 'is-gainer')} style={colorVars(p.color)} initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.045 }}>
                  <Avatar avatar={p.avatar} color={p.color} className="reveal-avatar" />
                  <span className="reveal-name">{h.id === view.me ? 'Toi' : p.name}</span>
                  <span className="reveal-dice">
                    {h.dice.map((d, k) => {
                      const key = `${h.id}:${k}`;
                      const match = matches.includes(key);
                      return (
                        <motion.span key={k} initial={{ y: -14, rotate: -50, opacity: 0, scale: 0.6 }} animate={{ y: 0, rotate: 0, opacity: 1, scale: lit.has(key) ? 1.14 : 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18, delay: i * 0.045 + k * 0.03 }}>
                          <DieFace face={d} color={p.color} className={cls(lit.has(key) && 'is-lit', stage === 'done' && !match && 'is-dim', counted > 0 && !match && 'is-dim')} />
                        </motion.span>
                      );
                    })}
                  </span>
                  <AnimatePresence>
                    {loses && (
                      <motion.span className="reveal-delta is-minus" initial={{ scale: 2.4, opacity: 0, rotate: 18 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 460, damping: 14 }}>
                        −1
                      </motion.span>
                    )}
                    {gains && (
                      <motion.span className="reveal-delta is-plus" initial={{ scale: 2.4, opacity: 0, rotate: 18 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} transition={{ type: 'spring', stiffness: 460, damping: 14 }}>
                        +1
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </ul>

          <div className="reveal-foot">
            {stage === 'done' ? (
              <motion.div className="reveal-verdict" initial={{ y: 26, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
                <h2>{v.title}</h2>
                <p>
                  {plural(rv.actual, 'dé')} pour {rv.bid.qty} {rv.bid.qty > 1 ? 'annoncés' : 'annoncé'}. {v.line}
                </p>
                {canReady && (
                  <Button variant="primary" className="btn-wide" disabled={ready} onClick={() => void send('game:next')}>
                    {ready ? `On attend les autres… ${left}` : `${rv.winnerId ? 'Voir le classement' : 'Manche suivante'} · ${left}`}
                  </Button>
                )}
              </motion.div>
            ) : (
              <p className="reveal-counting">On compte…</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
