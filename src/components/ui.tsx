import { useEffect, type ReactNode } from "react";
import type { GameStatus, Verification } from "../types";
import { STATUS_LABEL } from "../types";
import { IcoSearch } from "./icons";

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Stat tile: icon square, small label, big value. */
export function Stat({ icon, label, value, sub, tone = "default" }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: "default" | "green" | "amber" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <div className="stat-ico">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; count?: number }> }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "active" : ""} onClick={() => onChange(o.value)}>
          {o.label}{o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: GameStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function VerifyBadge({ v, onToggle }: { v: Verification; onToggle?: () => void }) {
  const el = <span className={`badge ${v === "verified" ? "badge-reconciled" : "badge-needs_review"}`}>{v === "verified" ? "Verified" : "Needs review"}</span>;
  return onToggle ? <button type="button" className="badge-btn" onClick={onToggle} title="Toggle verification">{el}</button> : el;
}

const PALETTE = ["#1e9bff", "#8b5cf6", "#14b8a6", "#f59e0b", "#ec4899", "#22c55e", "#f97316", "#06b6d4"];
export function Initial({ name, size }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = PALETTE[h % PALETTE.length];
  const style = size ? { width: size, height: size, fontSize: size * 0.4, background: bg } : { background: bg };
  return <span className="ini" style={style} aria-hidden>{name.trim()[0]?.toUpperCase() ?? "?"}</span>;
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head"><h3>{title}</h3><button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Delete", onConfirm, onCancel }: { title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel} footer={<><button className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button></>}>
      <p>{message}</p>
    </Modal>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-chip">♠</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Search({ value, onChange, placeholder = "Search…", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`search-wrap ${className}`}>
      <IcoSearch className="ico" />
      <input className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "active" : ""} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
