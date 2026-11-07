import React, { useEffect, useId, useRef, useState } from 'react';
import { SectionIcon } from './art.jsx';
import { subLine } from './model.js';

// ---------- toasts (announced politely to screen readers) ----------
let toastListener = null;
export function toast(message, kind = 'info') {
  if (toastListener) toastListener({ id: Math.random().toString(36).slice(2), message, kind });
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastListener = (t) => {
      setItems((list) => [...list.slice(-1), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 4000);
    };
    return () => { toastListener = null; };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.message}</div>)}
    </div>
  );
}

// ---------- form fields ----------
export function Field({ label, hint, value, onChange, type = 'text', as = 'input', options, rows = 3, placeholder, list, autoComplete, inputMode, disabled, className = '', children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const common = {
    id,
    value: value == null ? '' : value,
    onChange: (e) => onChange(e.target.value),
    'aria-describedby': hintId,
    disabled,
  };
  let control;
  if (as === 'textarea') control = <textarea {...common} rows={rows} placeholder={placeholder} />;
  else if (as === 'select') {
    control = (
      <select {...common}>
        {options.map((o) => (typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    );
  } else control = <input {...common} type={type} placeholder={placeholder} list={list} autoComplete={autoComplete} inputMode={inputMode} />;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {control}
      {hint && <p className="hint" id={hintId}>{hint}</p>}
      {children}
    </div>
  );
}

export function Check({ label, checked, onChange }) {
  const id = useId();
  return (
    <div className="check">
      <input id={id} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

// ---------- collapsible section card ----------
export function SectionCard({ num, icon, title, sub, status, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const statusText = status === 'done' ? 'Done' : status === 'optional' ? 'Optional' : 'To do';
  return (
    <section className={`card sec ${open ? 'open' : ''}`} aria-labelledby={`${id}-h`}>
      <h2 className="sec-h" id={`${id}-h`}>
        <button type="button" className="sec-toggle" aria-expanded={open} aria-controls={`${id}-b`} onClick={() => setOpen((o) => !o)}>
          <span className="sec-num" aria-hidden="true">{num}</span>
          <SectionIcon name={icon} />
          <span className="sec-titles">
            <span className="sec-title">{title}</span>
            {sub && <span className="sec-sub">{sub}</span>}
          </span>
          <span className={`pill pill-${status}`}>{statusText}</span>
          <svg className="chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </h2>
      <div className="sec-body" id={`${id}-b`} hidden={!open}>{children}</div>
    </section>
  );
}

// ---------- chip list with an Add button (Enter and commas work too) ----------
export function ChipInput({ label, hint, items, onAdd, onRemove, placeholder }) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const commit = () => {
    const parts = draft.split(',').map((x) => x.trim()).filter(Boolean);
    parts.forEach(onAdd);
    setDraft('');
  };
  return (
    <div className="field chips-field">
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint" id={`${id}-hint`}>{hint}</p>}
      {items.length > 0 && (
        <ul className="chips" aria-label={`${label} you added`}>
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="chip">
              <span>{it}</span>
              <button type="button" className="chip-x" onClick={() => onRemove(i)} aria-label={`Remove ${it}`}>
                <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="chip-add">
        <input id={id} value={draft} placeholder={placeholder} aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }} />
        <button type="button" className="btn" onClick={commit} disabled={!draft.trim()}>Add</button>
      </div>
    </div>
  );
}

// ---------- AI help dialog ----------
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

export function AiHelpDialog({ prompt, onClose }) {
  const ref = useRef(null);
  const taRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const before = document.activeElement;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    }
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    return () => {
      d.removeEventListener('cancel', onCancel);
      if (before && typeof before.focus === 'function') before.focus();
    };
  }, [onClose]);
  const doCopy = async () => {
    const ok = await copyText(prompt);
    if (ok) toast('Prompt copied. Paste it into the AI tool you use.', 'success');
    else {
      taRef.current.focus();
      taRef.current.select();
      toast('Your browser blocked copying. The prompt is selected: press Ctrl+C or Cmd+C.', 'info');
    }
  };
  return (
    <dialog ref={ref} className="ai-dialog" aria-labelledby={titleId}>
      <h2 id={titleId}>Get AI help with this text</h2>
      <ol className="ai-steps">
        <li>Copy the prompt below.</li>
        <li>Paste it into an AI chat tool such as Claude, ChatGPT, Copilot or Gemini.</li>
        <li>Read the answer. Keep only what is true for you, then type your choice back into this page.</li>
      </ol>
      <label className="sr-only" htmlFor={`${titleId}-p`}>Prompt to copy</label>
      <textarea id={`${titleId}-p`} ref={taRef} className="ai-prompt" readOnly value={prompt} rows={12} />
      <p className="note note-gold"><strong>Check it is true.</strong> AI tools can add skills, numbers or tickets you do not have. An employer can ask about any line on your résumé, so remove anything you did not do.</p>
      <p className="hint">This page does not send anything. If you paste the prompt into an AI tool, that company receives what you paste. The prompt leaves out your name, phone number, email and address.</p>
      <div className="row-btns">
        <button type="button" className="btn btn-primary" onClick={doCopy}>Copy prompt</button>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </dialog>
  );
}

export function AiButton({ onClick, label = 'Get AI help' }) {
  return (
    <button type="button" className="btn btn-small btn-ai" onClick={onClick}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 2l1.8 4.6L16 8.5l-4.2 1.9L10 15l-1.8-4.6L4 8.5l4.2-1.9z" fill="currentColor" /></svg>
      {label}
    </button>
  );
}

// ---------- résumé page rendered from the shared model ----------
export function ResumeView({ model }) {
  const empty = !model.name && !model.sections.length;
  return (
    <article className="paper" aria-label="Résumé preview">
      {empty && <p className="paper-empty">Your résumé appears here as you fill in the form.</p>}
      {model.name && <h3 className="r-name">{model.name}</h3>}
      {model.headline && <p className="r-headline">{model.headline}</p>}
      {model.contact.length > 0 && <p className="r-contact">{model.contact.join(' | ')}</p>}
      {model.sections.map((s) => (
        <section key={s.id} className="r-sec">
          <h4 className="r-h">{s.title}</h4>
          {s.blocks.map((b, i) => {
            if (b.type === 'para') return <p key={i} className="r-p">{b.text}</p>;
            if (b.type === 'labeled') return <p key={i} className="r-p"><strong>{b.label}:</strong> {b.text}</p>;
            if (b.type === 'list') return <ul key={i} className="r-ul">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
            return (
              <div key={i} className="r-entry">
                <p className="r-entry-head"><strong>{b.title}</strong></p>
                {(b.sub || b.right) && <p className="r-sub">{subLine(b)}</p>}
                {b.note && <p className="r-sub">{b.note}</p>}
                {b.bullets.length > 0 && <ul className="r-ul">{b.bullets.map((x, j) => <li key={j}>{x}</li>)}</ul>}
              </div>
            );
          })}
        </section>
      ))}
    </article>
  );
}

export function CoverView({ cover }) {
  return (
    <article className="paper paper-letter" aria-label="Cover letter preview">
      {cover.name && <p className="r-p"><strong>{cover.name}</strong></p>}
      {cover.senderLines.map((l, i) => <p key={i} className="r-line">{l}</p>)}
      <p className="r-gap">{cover.date}</p>
      {cover.recipientLines.map((l, i) => <p key={i} className="r-line">{l}</p>)}
      {cover.re && <p className="r-gap"><strong>{cover.re}</strong></p>}
      {cover.paragraphs.length === 0 && <p className="paper-empty">Your letter appears here as you type.</p>}
      {cover.paragraphs.map((p, i) => <p key={i} className="r-para">{p}</p>)}
    </article>
  );
}
