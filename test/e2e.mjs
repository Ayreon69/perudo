// Test de bout en bout : 2 humains (socket.io) + 2 bots jouent une partie complète sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), PE_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (5 min)'), 300_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

let audited = 0;
let rounds = 0;
let palificos = 0;
let reveals = 0;

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, session: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(v);
    play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les secrets sur chaque état reçu : aucun dé d'un autre avant que les gobelets se lèvent. */
function audit(v) {
  const r = v.round;
  if (v.phase !== 'playing' || !r) return;
  audited++;
  rounds = Math.max(rounds, r.number);
  if (r.palificoId) palificos++;
  const me = v.players.find((p) => p.id === v.me);
  if (r.phase !== 'reveal' && r.reveal) fail('révélation envoyée avant la fin de la manche');
  if (r.phase !== 'reveal' && JSON.stringify(v).includes('"dice":[')) fail("des dés circulent avant la révélation");
  if (r.mine && r.mine.length !== me.dice && r.phase !== 'reveal') fail(`${me.name} reçoit ${r.mine.length} dés pour ${me.dice}`);
  if (JSON.stringify(v.players).includes('hand')) fail('une main apparaît dans la vue publique');
  if (r.reveal) {
    reveals++;
    const { bid, wild, hands, actual } = r.reveal;
    const count = hands.flatMap((h) => h.dice).filter((d) => d === bid.face || (wild && d === 1)).length;
    if (count !== actual) fail(`décompte faux : ${actual} annoncé pour ${count} sur la table`);
  }
}

/** Stratégie pour finir vite : monter au minimum, puis crier Dudo ou Calza au hasard. */
function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing' || !v.round) return;
  const r = v.round;
  const ack = () => {};
  if (r.phase === 'reveal') {
    if (!r.readyIds.includes(v.me)) c.socket.emit('game:next', {}, ack);
    return;
  }
  const o = r.options;
  if (!o) return;
  if (r.canCalza && Math.random() < 0.08) {
    c.socket.emit('game:calza', { seq: r.bidSeq }, ack);
    return;
  }
  if (o.canDudo && Math.random() < 0.5) {
    c.socket.emit('game:dudo', {}, ack);
    return;
  }
  const legal = Object.entries(o.mins).filter(([, m]) => m !== null);
  if (!legal.length) {
    c.socket.emit('game:dudo', {}, ack);
    return;
  }
  const [face, qty] = legal[Math.floor(Math.random() * legal.length)];
  c.socket.emit('game:bid', { face: Number(face), qty }, ack);
}

const a = client('Alice');
const b = client('Bob');
await new Promise((r) => a.socket.on('connect', r));
await new Promise((r) => (b.socket.connected ? r() : b.socket.on('connect', r)));

const created = await a.call('room:create', { name: 'Alice', avatar: 'llama' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: 'sun' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
b.session = joined.data;
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 4 joueurs`);

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place et ses dés.
await new Promise((r) => setTimeout(r, 100));
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 100));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...b.session, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== b.session.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
const final = a.view.final;
if (audited === 0) fail("aucun état n'a été contrôlé");
if (reveals === 0) fail("aucune révélation n'a été contrôlée");
console.log(`✓ aucun dé caché dans les ${audited} états reçus (${rounds} manches, ${palificos ? 'avec' : 'sans'} Palifico)`);
if (final.length !== 4) fail('il doit y avoir 4 joueurs au classement');
if (final.map((f) => f.rank).join() !== '1,2,3,4') fail('classement incohérent');
console.log(`✓ partie terminée, vainqueur : ${final[0].name}`);

const restarted = await a.call('game:restart');
if (!restarted.ok || a.view.phase !== 'lobby') await new Promise((r) => setTimeout(r, 300));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
