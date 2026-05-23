# Application de suivi de portefeuille — Contexte pour Claude Code

## Objectif
Application PWA mobile (installable sur iOS/Android) pour gérer une stratégie d'investissement personnelle.

## Stack technique
- HTML/JS vanilla avec React 18 via CDN + Babel standalone (pas de build nécessaire)
- localStorage pour la persistance des données
- Déployée sur Netlify (HTTPS requis pour les APIs et le service worker)

## Architecture — 4 onglets
1. **Accueil** — valeur totale du portefeuille, signal mNAV, position dans le cycle BTC halving
2. **Investir** — calculateur de répartition mensuelle selon capital et signal mNAV
3. **Tracker** — suivi des parts, prix temps réel, achats/ventes, +/- value
4. **Stratégie** — règles, cycles, coûts, config API Claude

## Portefeuille cible
| Actif | % cible | Poche | Courtier |
|-------|---------|-------|---------|
| PUST (Nasdaq-100) | 15% | PEA | Fortuneo |
| PAEEM (MSCI Emerging) | 10% | PEA | Fortuneo |
| MSTR/BTC | 50% | CTO | Trade Republic / OKX→Ledger |
| URNU (Uranium) | 15% | CTO | Trade Republic |
| VVMX (Métaux critiques) | 10% | CTO | Trade Republic |

## Règle mNAV (Strategy/MSTR)
- mNAV < 1,3 → 100% MSTR sur Trade Republic
- mNAV > 1,3 → 100% BTC via OKX → retrait Ledger

## APIs utilisées
- **BTC prix** : CoinGecko (gratuit, sans clé, fonctionne depuis navigateur)
- **ETF/Actions prix** : Yahoo Finance (CORS souvent bloqué) → fallback Claude
- **mNAV** : calculée = Enterprise Value / Bitcoin NAV
  - EV = Market Cap + Dette + Preferred Stock
  - MSTR ticker Europe = MIGA.F (Francfort, EUR)
  - Données Strategy à maintenir manuellement :
    - BTC_HOLDINGS = 568840 (vérifier — la page strategy.com indique 843738)
    - SHARES = 351900000
    - DEBT_USD = 8254M$
    - PREF_USD = 15479M$
- **Claude API** : clé stockée en localStorage, utilisée pour prix (TradingView) et fallback mNAV

## Tickers corrects
| Actif | Yahoo Finance | TradingView |
|-------|--------------|-------------|
| PUST | PUST.PA | EURONEXT-PUST |
| PAEEM | PAEEM.PA | EURONEXT-PAEEM |
| MSTR (Europe) | MIGA.F | XETR-MIGA |
| URNU | URNU.PA | EURONEXT-URNU |
| VVMX | VVMX.DE | XETR-VVMX |
| BTC | CoinGecko API | — |

## Problèmes connus à résoudre
1. Yahoo Finance bloqué par CORS depuis navigateur → utiliser Claude API pour tous les prix
2. mNAV calculation : vérifier le bon nombre de BTC détenus (843738 ou 568840 ?)
3. Prix parfois faux ou manquants — améliorer la robustesse du parsing
4. Chargement des prix lent si Claude API utilisée (web search prend 5-10s par actif)

## Priorités d'amélioration
- Fiabiliser la récupération des prix (tous les actifs)
- Fiabiliser le calcul mNAV
- UX : indicateur de chargement par actif individuel
- UX : afficher la dernière mise à jour des prix
- Permettre la mise à jour manuelle des constantes Strategy depuis l'interface

## Déploiement
- Netlify Drop : glisser le dossier sur app.netlify.com/drop
- Service worker version actuelle : portefeuille-v5
- Incrémenter la version à chaque mise à jour pour forcer le rechargement du cache
