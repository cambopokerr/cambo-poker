import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreProvider, useStore } from "./data/store";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Games from "./pages/Games";
import GameDetails from "./pages/GameDetails";
import GameForm from "./pages/GameForm";
import Players from "./pages/Players";
import PlayerProfile from "./pages/PlayerProfile";
import Financials from "./pages/Financials";
import SettingsPage from "./pages/SettingsPage";
import Login from "./pages/Login";
import LiveGame from "./pages/LiveGame";
import ImportNotes from "./pages/ImportNotes";
import MissingInfo from "./pages/MissingInfo";

function Gate() {
  const { remote, status } = useStore();
  if (remote && status === "loading") {
    return <div className="auth"><div className="auth-card" style={{ textAlign: "center" }}><span className="brand-spade" aria-hidden style={{ fontSize: 40 }}>♠</span><p className="muted" style={{ marginTop: 10 }}>Loading your games…</p></div></div>;
  }
  if (remote && status !== "ready") return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/games" element={<Games />} />
        <Route path="/games/new" element={<GameForm />} />
        <Route path="/games/paste" element={<ImportNotes />} />
        <Route path="/games/missing" element={<MissingInfo />} />
        <Route path="/games/:id" element={<GameDetails />} />
        <Route path="/games/:id/edit" element={<GameForm />} />
        <Route path="/games/:id/live" element={<LiveGame />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/financials" element={<Financials />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Gate />
      </BrowserRouter>
    </StoreProvider>
  );
}
