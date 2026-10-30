// Briques d'interface communes : boutons, fenêtres, pastilles, sélecteurs, logo et décor.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'calza';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} aria-label="Perudo">
      Perudo
    </div>
  );
}

/** Le fond d'affiche : le soleil qui tourne, et la cordillère en aplats. */
export function Poster({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cls('poster', className)}>
      <span className="poster-sun" aria-hidden />
      <svg className="poster-peaks" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden>
        <path className="peak-3" d="M0 300V190L120 120L210 180L340 60L470 170L590 90L720 190L860 70L990 180L1100 110L1200 170V300Z" />
        <path className="peak-2" d="M0 300V230L150 170L280 240L430 140L560 230L700 160L840 240L1000 150L1200 240V300Z" />
        <path className="peak-1" d="M0 300V270L180 220L340 280L520 210L700 280L900 225L1200 285V300Z" />
      </svg>
      <div className="poster-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'yellow' | 'cyan' | 'pink'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={cls('modal', wide && 'is-wide')}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{title}</h2>
              <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
                <X size={20} />
              </button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
