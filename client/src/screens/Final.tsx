// Fin de partie : l'affiche du vainqueur, le classement, les récompenses et la revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FinalEntry, RoomView } from '../../../shared/protocol';
import { Avatar, Cup, colorVars } from '../components/Dice';
import { Button, Logo, Poster } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, plural } from '../lib/util';
import { leaveRoom, send } from '../net';

interface Award {
  title: string;
  entry: FinalEntry;
  detail: string;
}

const NEONS = ['#ff2d95', '#ffe600', '#19f26b', '#12e6ff', '#ff7a00'];

function awards(final: FinalEntry[]): Award[] {
  const best = (score: (f: FinalEntry) => number) => {
    const sorted = [...final].sort((a, b) => score(b) - score(a));
    return score(sorted[0]) > 0 ? sorted[0] : null;
  };
  const list: Award[] = [];
  const nose = best((f) => f.stats.dudoRight);
  if (nose) list.push({ title: 'Le flair', entry: nose, detail: `${plural(nose.stats.dudoRight, 'Dudo')} bien placé${nose.stats.dudoRight > 1 ? 's' : ''}` });
  const nerve = best((f) => f.stats.biggestHeld);
  if (nerve) list.push({ title: 'Le sang-froid', entry: nerve, detail: `${plural(nerve.stats.biggestHeld, 'dé')} annoncé${nerve.stats.biggestHeld > 1 ? 's' : ''}, et ça a tenu` });
  const exact = best((f) => f.stats.calzaRight);
  if (exact) list.push({ title: 'Pile-poil', entry: exact, detail: `${plural(exact.stats.calzaRight, 'Calza')} réussi${exact.stats.calzaRight > 1 ? 's' : ''}` });
  const caught = best((f) => f.stats.caught);
  if (caught) list.push({ title: 'La main dans le sac', entry: caught, detail: `${plural(caught.stats.caught, 'annonce')} démasquée${caught.stats.caught > 1 ? 's' : ''}` });
  const doubts = best((f) => f.stats.dudoWrong);
  if (doubts) list.push({ title: 'Le doute de trop', entry: doubts, detail: `${plural(doubts.stats.dudoWrong, 'Dudo')} de travers` });
  return list;
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const isHost = view.hostId === view.me;
  const iWon = final[0]?.id === view.me;
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.champion();
    if (iWon) {
      void confetti({ particleCount: 170, spread: 100, origin: { y: 0.4 }, colors: NEONS });
      setTimeout(() => void confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: NEONS }), 500);
      setTimeout(() => void confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: NEONS }), 800);
    }
  }, [iWon]);

  const list = awards(final);
  const winner = final[0];

  return (
    <Poster className="is-quiet">
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        {winner && (
          <motion.section className="final-winner" initial={{ scale: 1.5, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: -1.5 }} transition={{ type: 'spring', stiffness: 170, damping: 12 }}>
            <span className="final-eyebrow">Dernier gobelet debout</span>
            <div className="final-cup" style={colorVars(winner.color)}>
              <Cup />
              <Avatar avatar={winner.avatar} color={winner.color} className="final-avatar" />
            </div>
            <h1>{iWon ? 'Tu gagnes !' : winner.name}</h1>
            {!iWon && <p className="final-sub">remporte la partie</p>}
            <p className="final-sub">
              avec {plural(winner.dice, 'dé')} encore sous le gobelet
            </p>
          </motion.section>
        )}

        <div className="final-grid">
          <section className="sheet">
            <h3>Classement</h3>
            <ol className="rank-list">
              {final.map((f, i) => (
                <motion.li key={f.id} className={cls('rank-row', f.id === view.me && 'is-me')} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.07 }}>
                  <span className="rank-n">{f.rank}</span>
                  <Avatar avatar={f.avatar} color={f.color} className="player-avatar" />
                  <span className="player-name">
                    {f.name}
                    {f.id === view.me && <span className="muted"> (toi)</span>}
                  </span>
                </motion.li>
              ))}
            </ol>
          </section>

          {list.length > 0 && (
            <section className="sheet">
              <h3>Récompenses</h3>
              <ul className="award-list">
                {list.map((a) => (
                  <li key={a.title} className="award">
                    <Avatar avatar={a.entry.avatar} color={a.entry.color} className="player-avatar" />
                    <div>
                      <b>{a.title}</b>
                      <span className="muted small">
                        {a.entry.name} : {a.detail}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Revanche
            </Button>
          ) : (
            <div className="waiting">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Poster>
  );
}
