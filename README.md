# Cambo Poker

Private home-game manager for Jett and Maddox: sessions, attendance, rake, expenses, dealer earnings, profit split and reconciliation.

## Live app

https://cambopokerr.github.io/cambo-poker/ (deployed automatically from `main` by GitHub Actions). On a phone, open it and use Add to Home Screen.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173/cambo-poker/
npm run build      # production build in dist/
```

## Where things live

| Path | What |
|---|---|
| `src/types.ts` | Data model: games, players, attendance, financial entries, distributions, settings |
| `src/lib/finance.ts` | Every calculation, with the accounting rules documented at the top |
| `src/data/seed.ts` | The 28 imported nights, each with its original note and flagged questions |
| `src/data/store.tsx` | State + persistence (browser localStorage, key `cambo-poker:v1`) |
| `src/pages/` | One page per section: Dashboard, Games, GameDetails, GameForm, Players, PlayerProfile, Financials, Settings |

## Accounting rules

1. Gross rake = sum of rake entries with an amount.
2. Expenses = food + drinks & snacks + other expenses.
3. Adjustments are signed: positive adds to the pot (e.g. dealer tips the hosts kept), negative removes.
4. Dealer earnings reduce profit only when the entry is marked "paid from rake". Tips kept by the dealer are reported, never deducted.
5. Net distributable = rake + adjustments − expenses − dealer earnings paid from rake.
6. Shares = net distributable × each host's percentage (Settings).
7. A game is **Reconciled** only when every amount is verified, it has a usable date, no open questions remain, and any recorded split is within the tolerance of the computed net. Otherwise **Needs review**; with no rake amount at all, **Incomplete**.
8. Verified totals include only verified entries and reconciled games. Flagged amounts are always shown separately.

## Phone / installable app

The app is a PWA. Open it on a phone and use "Add to Home Screen" (iOS Safari share menu, or Chrome's install prompt). It then runs full-screen with a bottom tab bar and keeps working offline for pages already visited. `vite.config.ts` holds the manifest and caching rules; icons are in `public/icons/`.

Each section has its own backdrop (`public/bg-1.jpg` … `bg-5.jpg`): Dashboard 1, Games 2, Players 3, Financials 4, Settings 5. These are Higgsfield variations of the hosts' own table photo; swap any file to change a section.

Deployment is GitHub only: every push to `main` runs `.github/workflows/pages.yml`, which builds the app and publishes it to GitHub Pages.

## Persistence

Data is stored in the browser's localStorage. It survives refreshes but is per browser and per device. Use Settings → Export backup to move it, and Reset to return to the original imported notes. Swapping localStorage for a real backend only requires replacing `load()` and the `useEffect` save in `src/data/store.tsx`.
