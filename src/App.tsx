import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreProvider } from "./data/store";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Games from "./pages/Games";
import GameDetails from "./pages/GameDetails";
import GameForm from "./pages/GameForm";
import Players from "./pages/Players";
import PlayerProfile from "./pages/PlayerProfile";
import Financials from "./pages/Financials";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/new" element={<GameForm />} />
            <Route path="/games/:id" element={<GameDetails />} />
            <Route path="/games/:id/edit" element={<GameForm />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerProfile />} />
            <Route path="/financials" element={<Financials />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
