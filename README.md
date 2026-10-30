# Perudo

**Cinq dés, un gobelet, et tout le monde ment.**

👉 **Jouer : https://perudo-f6x0.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu multijoueur en ligne de bluff, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Perudo*, le jeu de dés sud-américain édité par Asmodee (projet de fans, non officiel, avec ses propres visuels).

## Règles en bref

- Chacun cache cinq dés sous son gobelet. À tour de rôle, on annonce combien de dés d'une valeur il y a sur toute la table.
- Pour monter : plus de dés sur n'importe quelle face, ou autant de dés sur une face plus haute.
- **Paco** (le 1) : joker. On n'ouvre pas dessus. Vers les Pacos, la moitié arrondie au-dessus ; depuis les Pacos, le double plus un.
- **Dudo** : on conteste, tous les gobelets se lèvent. S'il en manque, celui qui a annoncé perd un dé ; sinon, celui qui a douté. Le perdant rouvre ; s'il est éliminé, son voisin de gauche.
- **Calza** (variante retirable par l'hôte) : tout le monde sauf celui qui vient d'annoncer peut parier, à tout moment, que l'annonce tombe pile. Juste : un dé de regagné, cinq au maximum. Faux : un dé de perdu. Pas de Calza en Palifico ni à deux joueurs.
- **Palifico** : le joueur qui tombe à un dé ouvre une manche spéciale, une seule fois dans la partie, sur n'importe quelle face. Plus de joker, et la face ne change plus. Pas de Palifico quand il ne reste que deux joueurs.
- Le dernier joueur avec un dé gagne.

Les versions du jeu diffèrent sur quelques détails : ici, on suit le livret Asmodee tel que repris par Board Game Arena. La boîte réunit 6 joueurs : en ligne, on joue de 2 à 8.

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Bots qui écoutent les annonces et bluffent sans jamais voir les dés des autres, partie d'entraînement en un clic
- Aucune aide au calcul : ni probabilités, ni total des dés, et seule la dernière annonce reste affichée
- Dés en 3D, gobelet à rabattre si quelqu'un regarde par-dessus ton épaule, décompte dé par dé à chaque Dudo
- Réactions et petites phrases, chat, journal de partie
- Reprise automatique après une coupure, pilote automatique si un joueur s'absente, spectateurs
- Temps de réflexion réglable, récompenses de fin de partie
- Sons synthétisés et vibrations

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3040
npm run dev:client   # interface sur http://localhost:5175
npm test             # moteur de jeu + centaines de parties simulées
npm run build && npm run e2e   # partie complète avec de vrais clients connectés
```

`PE_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur et règle des annonces (`minQty`), la même des deux côtés
- `server/` : Express + Socket.IO, moteur de table (`room.ts`), bots (`bots.ts`). Le serveur fait autorité : les dés d'un joueur ne sortent que vers lui jusqu'à la révélation
- `client/` : React + Vite + Framer Motion. Dés en cubes CSS 3D et gobelets en SVG (`components/Dice.tsx`), décompte dans `screens/Reveal.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
