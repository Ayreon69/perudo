// Règles illustrées, lisibles en une minute.
import { useStore } from '../store';
import { Cup, DieFace } from './Dice';
import { Modal } from './Ui';

function Example({ from, to, note }: { from: [number, number]; to: [number, number]; note: string }) {
  return (
    <li className="rule-example">
      <span className="rule-bid">
        {from[0]} <i>×</i> <DieFace face={from[1]} color={3} />
      </span>
      <span className="rule-arrow">→</span>
      <span className="rule-bid">
        {to[0]} <i>×</i> <DieFace face={to[1]} color={1} />
      </span>
      <small>{note}</small>
    </li>
  );
}

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles en 1 minute" wide>
      <div className="rules">
        <section className="rule-hero">
          <Cup className="rule-cup" style={{ '--c': '#ff2d95' } as React.CSSProperties} />
          <p>
            Chacun cache <b>cinq dés</b> sous son gobelet. À tour de rôle, on annonce combien de dés d'une valeur il y a <b>sur toute la table</b>, ou on crie que l'autre ment. <b>Le dernier joueur avec un dé gagne.</b>
          </p>
        </section>

        <section>
          <h3>Annoncer</h3>
          <p>Le joueur qui ouvre annonce une quantité et une face. Chacun doit ensuite monter, ou crier Dudo. Pour monter :</p>
          <ul className="rule-examples">
            <Example from={[5, 3]} to={[6, 2]} note="Plus de dés, sur n'importe quelle face." />
            <Example from={[5, 3]} to={[5, 6]} note="Autant de dés, sur une face plus haute." />
          </ul>
        </section>

        <section className="rule-paco">
          <DieFace face={1} color={1} className="rule-paco-die" />
          <div>
            <h3>Le Paco, c'est un joker</h3>
            <p>Le soleil (le 1) compte pour toutes les faces. On n'ouvre pas une manche sur des Pacos.</p>
            <ul className="rule-examples">
              <Example from={[5, 3]} to={[3, 1]} note="Vers les Pacos : la moitié, arrondie au-dessus." />
              <Example from={[3, 1]} to={[7, 4]} note="Depuis les Pacos : le double, plus un." />
            </ul>
          </div>
        </section>

        <section className="rule-split">
          <div className="rule-case is-dudo">
            <h3>Dudo !</h3>
            <p>« J'en doute. » Tous les gobelets se lèvent et on compte, Pacos compris. S'il en manque, celui qui a annoncé perd un dé. Sinon, celui qui a douté perd un dé. Le perdant rouvre la manche suivante.</p>
          </div>
          <div className="rule-case is-calza">
            <h3>Calza !</h3>
            <p>
              « C'est pile ça. » Tout le monde sauf celui qui vient d'annoncer peut le crier, à tout moment. Pile juste : tu regagnes un dé, cinq au maximum. Sinon, tu en perds un. Variante : l'hôte peut la retirer. Pas de Calza à deux joueurs.
            </p>
          </div>
        </section>

        <section className="rule-palifico">
          <h3>Palifico</h3>
          <p>
            Le joueur qui tombe à <b>un seul dé</b> ouvre une manche spéciale, une seule fois dans la partie : il peut ouvrir sur n'importe quelle face, Paco compris. <b>Les Pacos ne sont plus des jokers, et la face ne change plus :</b> on ne peut que monter la quantité. Pas de Palifico quand il ne reste que deux joueurs.
          </p>
        </section>

        <section className="rule-tips">
          <h3>Pour bien jouer</h3>
          <ul>
            <li><b>Écoute :</b> qui annonce quoi en dit long sur ses dés. Ou pas.</li>
            <li><b>Retiens :</b> seule la dernière annonce reste affichée. Le reste, c'est dans ta tête.</li>
            <li><b>Mens :</b> rien n'oblige à annoncer une face qu'on a.</li>
          </ul>
        </section>

        <p className="rule-foot">
          D'après <i>Perudo</i>, le jeu de dés sud-américain édité par Asmodee. Création de fans, non officielle, avec ses propres visuels. Le livret réunit jusqu'à 6 joueurs par boîte : ici, on joue de 2 à 8.
        </p>
      </div>
    </Modal>
  );
}
