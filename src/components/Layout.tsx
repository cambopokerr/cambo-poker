import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../data/store";
import { IcoDashboard, IcoFinancials, IcoGames, IcoPlayers, IcoPlus, IcoSearch, IcoSettings } from "./icons";

const NAV = [
  { to: "/", label: "Home", Icon: IcoDashboard, bg: 2 },
  { to: "/games", label: "Games", Icon: IcoGames, bg: 1 },
  { to: "/players", label: "Players", Icon: IcoPlayers, bg: 3 },
  { to: "/financials", label: "Financials", Icon: IcoFinancials, bg: 4 },
  { to: "/settings", label: "Settings", Icon: IcoSettings, bg: 5 },
];

function bgFor(pathname: string): number {
  const hit = [...NAV].reverse().find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  return hit?.bg ?? 1;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  const { db } = useStore();
  const words = db.settings.businessName.split(" ");
  const [a, b] = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [db.settings.businessName, ""];
  return (
    <Link to="/" className={`brand ${compact ? "compact" : ""}`} aria-label={`${db.settings.businessName} home`}>
      <span className="brand-spade" aria-hidden>♠</span>
      <span className="brand-lockup">
        <span className="brand-top">{a.toUpperCase()}</span>
        {b && <span className="brand-bottom"><i /> {b.toUpperCase()} <i /></span>}
      </span>
      {!compact && <span className="brand-hosted"><small>HOSTED BY</small>{db.settings.hosts.join(" & ").toUpperCase()}</span>}
    </Link>
  );
}

export default function Layout() {
  const { storageOk } = useStore();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const bg = bgFor(pathname);
  useEffect(() => { window.scrollTo({ top: 0 }); setOpen(false); }, [pathname]);

  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) { nav(`/games?q=${encodeURIComponent(q.trim())}`); setQ(""); setOpen(false); } };

  return (
    <div className="shell">
      {[1, 2, 3, 4, 5].map((n) => <div key={n} className={`backdrop ${bg === n ? "on" : ""} ${pathname === "/" ? "home" : ""}`} style={{ backgroundImage: `url(${import.meta.env.BASE_URL}bg-${n}.jpg)` }} aria-hidden />)}
      <div className={`backdrop-wash ${pathname === "/" ? "home" : ""}`} aria-hidden />

      <header className="header">
        <div className="header-inner">
          <Brand />
          <nav className="topnav" aria-label="Primary">
            {NAV.map(({ to, label }) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `topnav-link ${isActive ? "active" : ""}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="header-right">
            <button type="button" className={`icon-btn ${open ? "active" : ""}`} aria-label="Search" aria-expanded={open} onClick={() => setOpen((v) => !v)}><IcoSearch /></button>
            <Link className="btn btn-primary log-btn" to="/games/new"><IcoPlus /><span>Log a Game</span></Link>
          </div>
        </div>
        {open && (
          <form className="header-search" onSubmit={submitSearch} role="search">
            <IcoSearch className="ico" />
            <input autoFocus className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search games, players, notes…" aria-label="Search games, players, notes" />
          </form>
        )}
      </header>

      <main className="main">
        <div className={`content ${pathname === "/" ? "content-home" : ""}`}>
          <Outlet />
        </div>
        <footer className="footer">
          <span className="footer-tag">♠ GOOD GAMES · BETTER PEOPLE.</span>
          <span className="faint">{storageOk ? "Saved on this device" : "Storage unavailable: changes will not persist"}</span>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Primary">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>
            <Icon /><span>{to === "/settings" ? "More" : label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
