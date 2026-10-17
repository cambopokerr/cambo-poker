import { useNavigate } from "react-router-dom";
import type { Game } from "../types";
import { useStore } from "../data/store";
import { computeGame, hourly } from "../lib/finance";
import { fmtDateShort, fmtHours, money } from "../lib/format";
import { StatusBadge } from "./ui";
import { IcoCalendar, IcoChevron } from "./icons";

/** Desktop: table. Phone: tappable list rows (CSS switches between the two). */
export default function GameTable({ games, compact = false }: { games: Game[]; compact?: boolean }) {
  const { db } = useStore();
  const nav = useNavigate();
  const hosts = db.settings.hosts;
  if (!games.length) return <p className="muted">No games match.</p>;
  const equal = hosts.every((h) => Math.abs((db.settings.split[h] ?? 0) - 1 / hosts.length) < 1e-6);
  const rows = games.map((g) => { const f = computeGame(db, g); return { g, f, hr: hourly(db, g, f), players: db.attendance.filter((a) => a.gameId === g.id).length }; });

  return (
    <>
      <div className="table-wrap only-desktop">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              {!compact && <th>Start</th>}
              <th className={compact ? "num" : ""}>{compact ? "Hours" : "Duration"}</th>
              <th className="num">Players</th>
              <th className="num">Rake (AUD)</th>
              {!compact && <th className="num">Expenses</th>}
              {!compact && <th className="num">Dealer</th>}
              <th className="num">Net profit</th>
              <th className="num">Profit each</th>
              <th className="num" title="Net profit per hour of the night">$/hour</th>
              {!compact && <th className="num" title="Each host's share per hour (hosts alternate dealing, half each)">Each /h</th>}
              <th>Status</th>
              <th className="td-chev" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ g, f, hr, players }) => (
              <tr key={g.id} className="clickable" onClick={() => nav(`/games/${g.id}`)}>
                <td className="date-cell"><span className="row-link">{g.date == null ? "No date" : fmtDateShort(g.date)}</span>{g.date == null && g.originalDateText && <div className="faint date-note" title={g.originalDateText}>{g.originalDateText}</div>}</td>
                {!compact && <td className="muted">{g.startTime || "–"}</td>}
                <td className={compact ? "num muted" : "muted"}>{fmtHours(g.durationHours)}</td>
                <td className="num">{players}</td>
                <td className="num">{f.hasRake ? money(f.grossRake, true) : <span className="neg">?</span>}</td>
                {!compact && <td className="num">{f.expenses ? money(f.expenses) : <span className="faint">–</span>}</td>}
                {!compact && <td className="num">{f.dealerEarnings ? money(f.dealerEarnings, true) : <span className="faint">–</span>}</td>}
                <td className={`num ${f.status === "reconciled" ? "pos" : ""}`}>{f.hasRake ? money(f.netDistributable) : <span className="faint">–</span>}</td>
                <td className="num">{f.hasRake ? (equal ? `${money(f.shares[hosts[0]])} each` : hosts.map((h) => `${h[0]} ${money(f.shares[h], true)}`).join(" · ")) : <span className="faint">–</span>}</td>
                <td className="num">{hr ? money(hr.netPerHour, true) : <span className="faint" title="No finish time recorded">–</span>}</td>
                {!compact && <td className="num">{hr ? (equal ? money(hr.perHost[hosts[0]].perHour, true) : hosts.map((h) => `${h[0]} ${money(hr.perHost[h].perHour, true)}`).join(" · ")) : <span className="faint">–</span>}</td>}
                <td><StatusBadge status={f.status} /></td>
                <td className="td-chev"><IcoChevron className="chev" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="list only-mobile">
        {rows.map(({ g, f, hr, players }) => (
          <button key={g.id} type="button" className="list-row" onClick={() => nav(`/games/${g.id}`)}>
            <span className="list-ico"><IcoCalendar /></span>
            <span className="list-main">
              <span className="list-title">{fmtDateShort(g.date)}{g.date == null && <span className="faint"> · {g.originalDateText}</span>}</span>
              <span className="list-sub">{g.startTime || "–"}{g.durationHours != null ? ` · ${fmtHours(g.durationHours)}` : ""} · {players} players{hr ? ` · ${money(hr.netPerHour, true)}/h` : ""}</span>
            </span>
            <span className="list-side">
              <span className="list-amt">{f.hasRake ? money(f.grossRake, true) : "?"}</span>
              <StatusBadge status={f.status} />
            </span>
            <IcoChevron className="chev" />
          </button>
        ))}
      </div>
    </>
  );
}
