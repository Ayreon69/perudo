// La table : les gobelets tout autour, l'annonce au centre, tes dés et tes décisions en bas.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Flag, MessageCircle, Minus, MoreHorizontal, Plus, Smile, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMOTES, FACES, PACO, TAUNTS, type Bid, type MyOptions, type PlayerView, type RoomView, type RoundView } from '../../../shared/protocol';
import { Avatar, Cup, CupAndDice, Die3D, DieFace, PacoGlyph, colorVars, faceName, type CupState } from '../components/Dice';
import { ChatInput, FeedList } from '../components/Feed';
import { Button, Modal } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';
import { RevealScreen } from './Reveal';

function Bubble({ emotes, atStart }: { emotes: Emote[]; atStart?: boolean }) {
  const last = emotes[emotes.length - 1];
  const x = atStart ? 0 : '-50%';
  return (
    <AnimatePresence>
      {last && (
        <motion.span key={last.id} className={cls('bubble', last.emoji.length > 3 && 'is-text', atStart && 'is-start')} initial={{ opacity: 0, x, y: 10, scale: 0.7 }} animate={{ opacity: 1, x, y: 0, scale: 1 }} exit={{ opacity: 0, x, y: -8 }}>
          {last.emoji}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function TurnTimer({ endsAt, think }: { endsAt: number; think: number }) {
  const now = useTick(250);
  if (!endsAt || !think) return null;
  const left = Math.max(0, endsAt - now);
  return (
    <span className="turn-timer" aria-label={`${secondsLeft(endsAt, now)} secondes`}>
      <span style={{ width: `${Math.min(100, (left / (think * 1000)) * 100)}%` }} />
    </span>
  );
}

/** Une annonce écrite en toutes lettres pour les lecteurs d'écran. */
const bidLabel = (b: Bid) => `${b.qty} × ${faceName(b.face)}`;

function DicePips({ n }: { n: number }) {
  return (
    <span className="seat-pips" role="img" aria-label={`${n} dé${n > 1 ? 's' : ''}`}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

function Seat({ p, r, emotes, think, pos }: { p: PlayerView; r: RoundView; emotes: Emote[]; think: number; pos: { x: number; y: number } }) {
  const out = !p.inRound;
  const isTurn = r.turnId === p.id;
  const holds = r.bidderId === p.id && !!r.bid && r.phase === 'bid';
  return (
    <div className={cls('seat', isTurn && 'is-turn', out && 'is-off', r.palificoId === p.id && 'is-palifico')} style={{ ...colorVars(p.color), left: `${pos.x}%`, top: `${pos.y}%` }} data-player={p.id}>
      <Bubble emotes={emotes} />
      <span className="seat-cup">
        {!out && <Cup className={cls(r.phase === 'roll' && 'is-shaking')} style={{ animationDelay: `${(p.color * 73) % 240}ms` }} />}
        <Avatar avatar={p.avatar} color={p.color} out={out} className="seat-avatar" />
        <AnimatePresence>
          {holds && r.bid && (
            <motion.span key={`${r.bid.qty}-${r.bid.face}`} className="seat-bid" aria-label={bidLabel(r.bid)} initial={{ scale: 2, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ type: 'spring', stiffness: 460, damping: 15 }}>
              {r.bid.qty}
              <DieFace face={r.bid.face} color={p.color} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="seat-name">{p.name}</span>
      {out ? <span className="seat-out">Sorti</span> : <DicePips n={p.dice} />}
      {isTurn && <TurnTimer endsAt={r.turnEndsAt} think={think} />}
      {p.autopilot && <span className="seat-auto">Pilote auto</span>}
    </div>
  );
}

/** Le tapis du centre : la seule annonce qui compte, et de qui on attend la suite. */
function Mat({ view, r }: { view: RoomView; r: RoundView }) {
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '?';
  const bidder = view.players.find((p) => p.id === r.bidderId);
  const myTurn = r.turnId === view.me;
  const seq = r.bidSeq;
  let line = '';
  if (r.phase === 'roll') line = 'Les gobelets s’agitent…';
  else if (myTurn) line = r.bid ? 'À toi !' : 'À toi d’ouvrir !';
  else if (r.turnId) line = r.bid ? `À ${name(r.turnId)}…` : `${name(r.turnId)} ouvre…`;
  return (
    <div className={cls('mat', r.palificoId && 'is-palifico', myTurn && 'is-mine')}>
      <div className="mat-inner">
        {r.palificoId && <span className="mat-flag">Palifico</span>}
        {r.bid ? (
          <motion.div key={seq} className={cls('mat-bid', r.bid.qty > 9 && 'is-long')} aria-label={`Annonce : ${bidLabel(r.bid)}`} initial={{ scale: 1.8, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 420, damping: 15 }}>
            <span className="mat-qty">{r.bid.qty}</span>
            <span className="mat-times">×</span>
            <Die3D face={r.bid.face} color={bidder?.color ?? 1} roll={seq} index={seq} className="mat-die" />
          </motion.div>
        ) : (
          r.phase === 'bid' && (
            <motion.div className="mat-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Aucune annonce
            </motion.div>
          )
        )}
        {r.bid && <span className="mat-who">{r.bidderId === view.me ? 'ton annonce' : `annonce de ${bidder?.name ?? '?'}`}</span>}
        <motion.p key={line} className="mat-line" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
          {line}
        </motion.p>
        {r.palificoId && <p className="mat-rule">Pas de joker. La face ne change plus.</p>}
      </div>
    </div>
  );
}

/** Le pupitre d'annonce : une face, une quantité, et les deux cris. */
function BidPad({ opt, r }: { opt: MyOptions; r: RoundView }) {
  const legal = useMemo<number[]>(() => FACES.filter((f) => opt.mins[f] !== null && opt.mins[f] !== undefined), [opt]);
  const [face, setFace] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  // À chaque nouvelle annonce, on repart du plus petit coup permis sur la même face.
  useEffect(() => {
    const keep = r.bid && legal.includes(r.bid.face) ? r.bid.face : legal.includes(3) ? 3 : legal[0] ?? null;
    setFace(keep);
    setQty(keep ? opt.mins[keep] ?? 1 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.bidSeq, r.number]);

  const min = face ? opt.mins[face] ?? 1 : 1;
  const value = Math.max(min, Math.min(qty, opt.maxQty));
  const act = async (event: string, payload: Record<string, unknown> = {}) => {
    if (busy) return;
    setBusy(true);
    await send(event, payload);
    setBusy(false);
  };

  return (
    <div className="pad">
      <div className="pad-faces" role="radiogroup" aria-label="Face annoncée">
        {FACES.map((f) => {
          const m = opt.mins[f];
          const off = m === null || m === undefined;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={face === f}
              aria-label={off ? `${faceName(f)} : interdit` : `${faceName(f)} : au moins ${m}`}
              disabled={off}
              className={cls('pad-face', face === f && 'is-on', f === PACO && 'is-paco')}
              onClick={() => {
                setFace(f);
                setQty(m ?? 1);
                sfx.pop();
              }}
            >
              <DieFace face={f} color={face === f ? 1 : 7} />
              <small>{off ? '–' : `≥ ${m}`}</small>
            </button>
          );
        })}
      </div>
      <div className="pad-row">
        <div className="stepper">
          <button type="button" aria-label="Moins" disabled={value <= min} onClick={() => setQty(value - 1)}>
            <Minus size={20} />
          </button>
          <motion.output key={value} initial={{ scale: 1.35 }} animate={{ scale: 1 }} aria-live="polite">
            {value}
          </motion.output>
          <button type="button" aria-label="Plus" disabled={value >= opt.maxQty} onClick={() => setQty(value + 1)}>
            <Plus size={20} />
          </button>
        </div>
        <Button variant="primary" className="pad-go" disabled={busy || !face} onClick={() => void act('game:bid', { face, qty: value })}>
          <span className="pad-go-inner">
            Annoncer {value} × {face && <DieFace face={face} color={0} />}
          </span>
        </Button>
        {opt.canDudo && (
          <Button variant="danger" className="pad-dudo" disabled={busy} onClick={() => void act('game:dudo')}>
            ¡Dudo!
          </Button>
        )}
      </div>
    </div>
  );
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Sons et vibrations : ils se déduisent des changements d'état reçus du serveur. */
function useRoundEffects(view: RoomView, setPalifico: (id: string | null) => void) {
  const r = view.round;
  const prev = useRef<{ number: number; phase: string; turn: string | null; seq: number } | null>(null);
  useEffect(() => {
    if (!r) return;
    const last = prev.current;
    if (!last || last.number !== r.number) {
      if (r.phase === 'roll') sfx.rattle();
      if (r.palificoId && r.phase === 'roll') {
        sfx.palifico();
        setPalifico(r.palificoId);
      }
    } else {
      if (last.phase === 'roll' && r.phase === 'bid') sfx.slam();
      if (r.bidSeq > last.seq && r.bid) sfx.bid(r.bid.qty);
    }
    if (r.turnId === view.me && last?.turn !== view.me) {
      sfx.turn();
      vibrate(30);
    }
    prev.current = { number: r.number, phase: r.phase, turn: r.turnId, seq: r.bidSeq };
  }, [r, view.me, setPalifico]);
}

function PalificoShow({ id, view, onEnd }: { id: string | null; view: RoomView; onEnd: () => void }) {
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(onEnd, 2000);
    return () => clearTimeout(t);
  }, [id, onEnd]);
  const who = id === view.me ? 'Pour toi : tu ouvres, sur la face de ton choix.' : `Pour ${view.players.find((p) => p.id === id)?.name ?? '?'}, qui ouvre.`;
  return (
    <AnimatePresence>
      {id && (
        <motion.div className="palifico-show" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-live="assertive">
          <span className="stamp-rays" />
          <motion.div className="palifico-sun" initial={{ y: 120, scale: 0.4, rotate: -120 }} animate={{ y: 0, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 13 }}>
            <PacoGlyph />
          </motion.div>
          <motion.h2 initial={{ scale: 2.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ delay: 0.15, type: 'spring', stiffness: 380, damping: 16 }}>
            ¡Palifico!
          </motion.h2>
          <p>{who}</p>
          <p className="palifico-rule">Pas de joker. La face ne change plus.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Les sièges s'étalent sur l'arc du haut de la table, du plus proche à gauche au plus loin à droite. */
function seatPositions(n: number): { x: number; y: number }[] {
  if (n === 1) return [{ x: 50, y: 12 }];
  const spread = Math.min(244, 62 * (n - 1));
  return Array.from({ length: n }, (_, i) => {
    const a = ((-90 - spread / 2 + (spread * i) / (n - 1)) * Math.PI) / 180;
    return { x: 50 + 39 * Math.cos(a), y: 53 + 41 * Math.sin(a) };
  });
}

export function Table({ view }: { view: RoomView }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const feedOpen = useStore((s) => s.feedOpen);
  const setFeedOpen = useStore((s) => s.setFeedOpen);
  const unread = useStore((s) => s.unread);
  const emotes = useStore((s) => s.emotes);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [react, setReact] = useState(false);
  const [palifico, setPalifico] = useState<string | null>(null);
  // Les dés restent visibles, mais on peut rabattre le gobelet si quelqu'un regarde par-dessus l'épaule.
  const [hidden, setHidden] = useState(false);
  const hidePalifico = useCallback(() => setPalifico(null), []);
  const r = view.round;
  const me = view.players.find((p) => p.id === view.me);
  useRoundEffects(view, setPalifico);
  const roundNumber = r?.number;
  useEffect(() => setHidden(false), [roundNumber]);

  if (!r) return null;

  const seats = view.players.filter((p) => p.status !== 'spectator');
  // On tourne la table pour que l'adversaire qui joue juste après soit le premier affiché.
  const myIndex = seats.findIndex((p) => p.id === view.me);
  const others = myIndex < 0 ? seats : [...seats.slice(myIndex + 1), ...seats.slice(0, myIndex)];
  const positions = seatPositions(others.length);
  const inRound = !!me && me.inRound;
  const isHost = view.hostId === view.me;
  const opt = r.options;
  const cupState: CupState = r.phase === 'roll' ? 'shake' : hidden ? 'closed' : 'open';
  const myTurn = r.turnId === view.me;

  return (
    <div className={cls('table-screen', r.palificoId && 'is-palifico')}>
      <header className="table-top">
        <div className="table-info">
          <span className="table-round">Manche {r.number}</span>
        </div>
        <div className="table-tools">
          <button type="button" className="icon-btn feed-toggle" aria-label="Journal et chat" onClick={() => setFeedOpen(true)}>
            <MessageCircle size={20} />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
      </header>

      <div className="table-main">
        <main className="arena">
          <Mat view={view} r={r} />
          {others.map((p, i) => (
            <Seat key={p.id} p={p} r={r} think={view.settings.think} pos={positions[i]} emotes={emotes.filter((e) => e.playerId === p.id)} />
          ))}
        </main>

        <aside className="side-feed">
          <h3>Journal</h3>
          <FeedList log={view.log} />
          <ChatInput />
        </aside>
      </div>

      <section className={cls('me-zone', myTurn && 'is-turn')} style={me ? colorVars(me.color) : undefined}>
        {myTurn && <TurnTimer endsAt={r.turnEndsAt} think={view.settings.think} />}
        {inRound && me && r.mine ? (
          <div className="me-row">
            <Bubble emotes={emotes.filter((e) => e.playerId === view.me)} atStart />
            <div className="me-dice">
              <CupAndDice dice={r.mine} color={me.color} state={cupState} roll={r.number} label={hidden ? 'Soulever le gobelet' : 'Cacher mes dés'} onToggle={r.phase === 'bid' ? () => setHidden((x) => !x) : undefined} />
            </div>
            {/* Le Calza se crie à tout moment : il reste à portée de pouce, même quand ce n'est pas ton tour. */}
            {r.canCalza && (
              <Button variant="calza" className="me-calza" onClick={() => void send('game:calza', { seq: r.bidSeq })}>
                ¡Calza!
              </Button>
            )}
            <button type="button" className={cls('react-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
              <Smile size={22} />
            </button>
            <AnimatePresence>{react && <ReactionTray onClose={() => setReact(false)} />}</AnimatePresence>
          </div>
        ) : (
          <p className="me-off">{me?.status === 'spectator' ? 'Tu regardes la partie.' : 'Tu es hors jeu : profite du spectacle.'}</p>
        )}
        {opt && <BidPad opt={opt} r={r} />}
      </section>

      {r.phase === 'reveal' && r.reveal && <RevealScreen key={r.number} view={view} r={r} canReady={me?.status === 'playing' || r.reveal.loserId === view.me} />}
      <PalificoShow id={palifico} view={view} onEnd={hidePalifico} />

      <Modal open={feedOpen} onClose={() => setFeedOpen(false)} title="Journal et chat">
        <div className="feed-modal">
          <FeedList log={view.log} />
          <ChatInput />
        </div>
      </Modal>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son : {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer : arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
