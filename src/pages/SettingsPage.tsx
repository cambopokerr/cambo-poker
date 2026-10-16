import { useEffect, useRef, useState } from "react";
import { useStore } from "../data/store";
import { buildSeed } from "../data/seed";
import { listProfiles, removeProfile, setApproved, type Profile } from "../data/remote";
import { download } from "../lib/csv";
import type { DB } from "../types";
import { Card, ConfirmDialog, Field } from "../components/ui";

export default function SettingsPage() {
  const { db, dispatch, storageOk, remote, profile, signOut, syncError, refresh } = useStore();
  const s = db.settings;
  const [name, setName] = useState(s.businessName);
  const [hosts, setHosts] = useState(s.hosts.join(", "));
  const [split, setSplit] = useState(s.hosts.map((h) => String(Math.round((s.split[h] ?? 0) * 100))).join(", "));
  const [tol, setTol] = useState(String(s.reconcileTolerance));
  const [dealerDefault, setDealerDefault] = useState(s.dealerPaidFromRakeByDefault);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPeople = () => { if (remote) listProfiles().then(setPeople).catch((e) => setMsg(e.message)); };
  useEffect(loadPeople, [remote]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const hs = hosts.split(",").map((x) => x.trim()).filter(Boolean);
    const ps = split.split(",").map((x) => Number(x.trim()));
    if (!hs.length) return setMsg("Enter at least one host.");
    if (ps.length !== hs.length || ps.some((p) => isNaN(p) || p < 0)) return setMsg("Enter one percentage per host.");
    const total = ps.reduce((a, b) => a + b, 0);
    if (Math.abs(total - 100) > 0.01) return setMsg(`Split must total 100% (currently ${total}%).`);
    const t = Number(tol);
    if (isNaN(t) || t < 0) return setMsg("Tolerance must be 0 or more.");
    dispatch({ type: "settings", settings: { ...s, businessName: name.trim() || s.businessName, hosts: hs, split: Object.fromEntries(hs.map((h, i) => [h, ps[i] / 100])), reconcileTolerance: t, dealerPaidFromRakeByDefault: dealerDefault } });
    setMsg("Settings saved.");
  };

  const exportJSON = () => download(`cambo-poker-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db, null, 2), "application/json");
  const importJSON = (file: File) => {
    file.text().then((txt) => {
      try {
        const parsed = JSON.parse(txt) as DB;
        if (parsed.version !== 1 || !Array.isArray(parsed.games) || !Array.isArray(parsed.players)) throw new Error("bad");
        dispatch({ type: "replace", db: parsed });
        setMsg(`Imported ${parsed.games.length} games and ${parsed.players.length} players.`);
      } catch { setMsg("That file is not a Cambo Poker backup."); }
    });
  };

  return (
    <>
      <div className="page-head"><div><h1>Settings</h1><div className="sub">Business details, profit split, accounting rules, access and your data.</div></div>
        {remote && <div className="actions"><button className="btn" onClick={() => void signOut()}>Sign out{profile?.email ? ` (${profile.email})` : ""}</button></div>}
      </div>
      {(msg || syncError) && <Card className="stack-item"><p style={{ margin: 0 }} className={syncError ? "error" : undefined}>{syncError ? `A change did not reach the server: ${syncError}. The latest server copy has been reloaded.` : msg}</p></Card>}
      <div className="grid grid-2" style={{ marginTop: msg || syncError ? 16 : 0 }}>
        <Card title="Business & split">
          <div className="form-grid">
            <Field label="Business name" className="span-2"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Hosts (comma separated)" className="span-2"><input className="input" value={hosts} onChange={(e) => setHosts(e.target.value)} /></Field>
            <Field label="Profit split % (same order)" className="span-2" hint="Must total 100"><input className="input" value={split} onChange={(e) => setSplit(e.target.value)} /></Field>
            <Field label="Reconciliation tolerance ($)" hint="Allowed gap between computed net and the recorded split"><input className="input" value={tol} onChange={(e) => setTol(e.target.value)} /></Field>
            <label className="check span-2" style={{ alignSelf: "end", paddingBottom: 10 }}><input type="checkbox" checked={dealerDefault} onChange={(e) => setDealerDefault(e.target.checked)} /> New dealer-earnings entries default to “paid from rake”</label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><button className="btn btn-primary" onClick={save}>Save settings</button></div>
        </Card>

        <Card title="Accounting rules">
          <ol className="rule" style={{ paddingLeft: 18, margin: 0, display: "grid", gap: 6 }}>
            <li><strong>Gross rake</strong> = sum of rake entries with an amount.</li>
            <li><strong>Expenses</strong> = food + drinks & snacks + other expenses.</li>
            <li><strong>Adjustments</strong> are signed: positive adds to the pot (e.g. dealer tips the hosts kept), negative removes.</li>
            <li><strong>Dealer earnings</strong> reduce profit only when marked “paid from rake”. Tips kept by the dealer are reported, never deducted.</li>
            <li><strong>Net distributable</strong> = rake + adjustments − expenses − dealer paid from rake.</li>
            <li><strong>Shares</strong> = net distributable × each host's percentage.</li>
            <li>A game is <strong>Completed</strong> only when every amount is verified, it has a usable date, no open questions remain, and any recorded split is within the tolerance of the computed net.</li>
            <li><strong>Verified totals</strong> include only verified entries and completed games. Flagged amounts are always shown separately.</li>
          </ol>
        </Card>

        {remote && (
          <Card title="People with access" actions={<button className="btn btn-sm" onClick={loadPeople}>Refresh</button>}>
            {people.length ? (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Email</th><th>Since</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.user_id}>
                      <td>{p.email}{p.user_id === profile?.user_id && <span className="faint"> (you)</span>}</td>
                      <td className="muted">{new Date(p.created_at).toLocaleDateString("en-AU")}</td>
                      <td>{p.approved ? <span className="badge badge-reconciled">Approved</span> : <span className="badge badge-needs_review">Waiting</span>}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {!p.approved && <button className="btn btn-sm btn-primary" onClick={() => setApproved(p.user_id, true).then(loadPeople).catch((e) => setMsg(e.message))}>Approve</button>}{" "}
                        {p.user_id !== profile?.user_id && <button className="btn btn-sm btn-danger" onClick={() => setRemoveId(p.user_id)}>Remove</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : <p className="muted">Loading…</p>}
            <p className="rule" style={{ marginTop: 10 }}>Anyone who signs in appears here as Waiting until someone with access approves them. The very first account is approved automatically.</p>
          </Card>
        )}

        <Card title="Data">
          <p className="rule">
            {remote
              ? "Records are saved in the shared Cambo Poker database and every signed-in phone sees the same games. Export a backup any time; Import replaces everything in the database with the file."
              : storageOk
                ? "Records are saved in this browser's local storage and survive refreshes. They are not synced to other devices or people. Export a backup before clearing browser data, and import it on another device to move your records."
                : "Local storage is unavailable in this browser, so changes will be lost on refresh. Export a backup after making changes."}
          </p>
          <div className="card-actions" style={{ marginTop: 10 }}>
            <button className="btn" onClick={exportJSON}>Export backup (JSON)</button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
            {remote && <button className="btn" onClick={() => void refresh()}>Reload from server</button>}
            <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>Reset to imported notes</button>
          </div>
          <p className="rule" style={{ marginTop: 10 }}>Reset restores the 28 games exactly as imported from the original notes and discards every change made since{remote ? ", for everyone" : ""}.</p>
        </Card>
      </div>
      {confirmReset && (
        <ConfirmDialog title="Reset all data?" confirmLabel="Reset" message={`This replaces everything with the original imported notes${remote ? " in the shared database, for every phone" : ""}. Any games, players or corrections added since will be lost. Export a backup first if unsure.`}
          onCancel={() => setConfirmReset(false)} onConfirm={() => { dispatch({ type: "replace", db: buildSeed() }); setConfirmReset(false); setMsg("Data reset to the imported notes."); }} />
      )}
      {removeId && (
        <ConfirmDialog title="Remove access?" confirmLabel="Remove" message="This person will no longer be able to open the app. They can sign in again and wait for approval."
          onCancel={() => setRemoveId(null)} onConfirm={() => { removeProfile(removeId).then(loadPeople).catch((e) => setMsg(e.message)); setRemoveId(null); }} />
      )}
    </>
  );
}
