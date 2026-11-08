import { CircleAlert, LoaderCircle, X } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  busy?: boolean;
};

export function Button({ variant = 'secondary', busy, children, disabled, className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={`btn btn-${variant} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy && <LoaderCircle size={14} className="spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...rest} type="button" className={`iconbtn ${className}`} aria-label={label} title={label}>{children}</button>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactElement }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function PageHead({ eyebrow, title, actions, children }: { eyebrow: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pagehead">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p className="lede">{children}</p>}
      </div>
      {actions && <div className="pagehead-actions">{actions}</div>}
    </header>
  );
}

export function Notice({ tone = 'info', children, action }: { tone?: 'info' | 'alert'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'alert' ? 'alert' : undefined}>
      {tone === 'alert' && <CircleAlert size={15} aria-hidden />}
      <div className="notice-body">{children}</div>
      {action}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Notice tone="alert" action={onRetry && <Button onClick={onRetry}>Retry</Button>}>{message}</Notice>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="loading" role="status"><LoaderCircle size={16} className="spin" aria-hidden /> {label}…</div>;
}

export function Pager({ total, limit, offset, onChange }: { total: number; limit: number; offset: number; onChange: (offset: number) => void }) {
  if (total <= limit) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <span>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
      <Button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</Button>
      <Button disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Next</Button>
    </nav>
  );
}

/** Moves focus into the dialog, restores it on close, and closes on Escape. */
function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
    };
    const node = ref.current;
    node?.addEventListener('keydown', onKey);
    return () => { node?.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return ref;
}

export function Drawer({ eyebrow, title, onClose, children, footer }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useDialogFocus(onClose);
  const titleId = useId();
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="drawer-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2 id={titleId}>{title}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={16} aria-hidden /></IconButton>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onResult }: { title: string; body: ReactNode; confirmLabel: string; onResult: (ok: boolean) => void }) {
  const ref = useDialogFocus(() => onResult(false));
  const titleId = useId();
  return (
    <>
      <div className="scrim scrim-top" onClick={() => onResult(false)} />
      <div ref={ref} className="modal" role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <h2 id={titleId}>{title}</h2>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <Button onClick={() => onResult(false)}>Keep as is</Button>
          <Button variant="primary" onClick={() => onResult(true)}>{confirmLabel}</Button>
        </div>
      </div>
    </>
  );
}
