// Accueil : l'affiche, le gobelet qui s'agite, pseudo + avatar, créer / rejoindre une table, entraînement, règles.
import { motion } from 'framer-motion';
import { BookOpen, Bot, LogIn, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, CupAndDice, useHeroLoop } from '../components/Dice';
import { Button, Logo, Poster } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

function HeroCup() {
  const { dice, state, roll } = useHeroLoop(5);
  return (
    <div className="hero-cup">
      <CupAndDice dice={dice} color={0} state={state} roll={roll} />
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('pe:url', sync);
    return () => window.removeEventListener('pe:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Poster className="home">
      <header className="home-hero">
        <motion.div initial={{ opacity: 0, scale: 1.25, rotate: -4 }} animate={{ opacity: 1, scale: 1, rotate: -2 }} transition={{ type: 'spring', stiffness: 170, damping: 13 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">Cinq dés, un gobelet, et tout le monde ment.</p>
        <HeroCup />
      </header>

      <motion.section className="sheet home-panel" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et rejoins !
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. El Mentiroso"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label">Ton avatar</span>
        <div className="avatar-picker" role="radiogroup" aria-label="Ton avatar">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 3, autostart: true }))}>
              {busy === 'bots' ? 'Préparation…' : "S'entraîner contre 3 bots"}
            </Button>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        D'après <i>Perudo</i>, le jeu de dés sud-américain. Création de fans, non officielle.
      </footer>
    </Poster>
  );
}
