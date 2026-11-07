import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { clearState, fromBackup, loadState, saveState } from './state.js';
import { buildCover, buildResume, resumeToText } from './model.js';
import { scoreMatch } from './keywords.js';
import { HeroArt } from './art.jsx';
import { AiHelpDialog, ResumeView, Toasts, toast } from './ui.jsx';
import {
  EducationSection, ExperienceSection, PersonalSection, ProjectsSection, SkillsSection, SummarySection,
  TicketsSection, TradeSection, VolunteerSection,
} from './editor.jsx';
import { CoverTab, DownloadTab, GuidesTab, JobMatch, TipsTab } from './tabs.jsx';

const TABS = [
  { id: 'resume', label: 'Build your résumé' },
  { id: 'cover', label: 'Cover letter' },
  { id: 'download', label: 'Download' },
  { id: 'guides', label: 'Trade guides' },
  { id: 'tips', label: 'Tips and sources' },
];

function useSaved(state, storageOk) {
  const [status, setStatus] = useState(storageOk ? 'Saved in this browser' : 'Saving is turned off in this browser');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    const t = setTimeout(() => {
      const ok = saveState(state);
      setStatus(ok
        ? `Saved in this browser at ${new Date().toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`
        : 'Could not save. Use Backup to keep a copy.');
    }, 400);
    return () => clearTimeout(t);
  }, [state]);
  return status;
}

function Intro() {
  return (
    <section className="intro" aria-labelledby="intro-h">
      <div className="intro-text">
        <h2 id="intro-h" className="intro-h">Build a résumé that people and hiring software can both read</h2>
        <p>Fill in the form, one section at a time. Your résumé builds itself in the preview, in a plain, one-column layout. Paste a job posting to see which of its words you already have. When you are ready, download a PDF or a Word file.</p>
        <p className="privacy"><strong>Your information stays on this device.</strong> Everything you type is saved only in this browser. This page does not send it to ACCESS or to anyone else, and it has no tracking. On a shared or public computer, use Backup to save a file, then Clear all before you leave.</p>
      </div>
      <HeroArt />
      <ol className="steps">
        <li><span className="step-n">1</span><span><strong>Fill it in.</strong> Plain questions, drop-down lists and examples.</span></li>
        <li><span className="step-n">2</span><span><strong>Match the job.</strong> Paste a posting and see the missing words.</span></li>
        <li><span className="step-n">3</span><span><strong>Check the preview.</strong> What you see is what the files contain.</span></li>
        <li><span className="step-n">4</span><span><strong>Download.</strong> PDF or Word, with a cover letter if you need one.</span></li>
      </ol>
    </section>
  );
}

function Toolbar({ state, setState }) {
  const fileRef = useRef(null);
  const p = state.personal;
  const parts = [
    !!p.fullName, !!(p.email || p.phone), !!state.summary.trim(),
    state.tickets.some((t) => t.name) || state.trade.credentials.length > 0,
    state.experience.some((e) => e.jobTitle && e.bullets.some((b) => b.text.trim())),
    state.skills.trade.length + state.skills.tools.length + state.skills.other.length > 0,
    state.education.some((e) => e.school || e.credential),
  ];
  const done = parts.filter(Boolean).length;
  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resume-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup file saved. Keep it somewhere safe, like a USB stick or your email.', 'success');
  };
  const restore = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = fromBackup(JSON.parse(r.result));
        if (!window.confirm('Restore this backup? It replaces what is on the page now.')) return;
        setState(data);
        toast('Backup restored.', 'success');
      } catch (err) {
        toast('That file is not a résumé backup from this tool.', 'error');
      }
    };
    r.readAsText(f);
  };
  const clearAll = () => {
    if (!window.confirm('Clear everything and start over? This cannot be undone. Make a backup first if you want to keep it.')) return;
    setState(clearState());
    toast('Cleared. The form is empty.', 'info');
  };
  return (
    <div className="toolbar">
      <div className="progress">
        <label htmlFor="progress-bar">{done} of {parts.length} key parts filled in</label>
        <progress id="progress-bar" max={parts.length} value={done}>{done} of {parts.length}</progress>
      </div>
      <div className="row-btns">
        <a className="btn btn-small" href="#job-match">Match a job posting</a>
        <button type="button" className="btn btn-small" onClick={backup}>Backup</button>
        <button type="button" className="btn btn-small" onClick={() => fileRef.current.click()}>Restore</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={restore} />
        <button type="button" className="btn btn-small btn-quiet-danger" onClick={clearAll}>Clear all</button>
      </div>
    </div>
  );
}

function PreviewCard({ model }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`card preview-card ${open ? 'is-open' : ''}`} aria-labelledby="prev-h">
      <div className="preview-top">
        <h2 id="prev-h" className="card-h">Résumé preview</h2>
        <button type="button" className="btn btn-small preview-toggle" aria-expanded={open} aria-controls="preview-body" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide preview' : 'Show preview'}
        </button>
      </div>
      <div id="preview-body" className="preview-body">
        <div className="paper-wrap"><ResumeView model={model} /></div>
      </div>
    </section>
  );
}

function App() {
  const init = useMemo(() => loadState(), []);
  const [state, setState] = useState(init.state);
  const [tab, setTab] = useState(TABS.some((t) => t.id === init.state.meta.tab) ? init.state.meta.tab : 'resume');
  const [notice, setNotice] = useState(init.migrated);
  const [prompt, setPrompt] = useState(null);
  const [announce, setAnnounce] = useState('');
  const status = useSaved(state, init.storageOk);

  const model = useMemo(() => buildResume(state), [state]);
  const cover = useMemo(() => buildCover(state), [state]);
  const plain = useMemo(() => resumeToText(model), [model]);
  const score = useMemo(() => scoreMatch(state.jobDescription, [plain]), [state.jobDescription, plain]);
  const keywords = useMemo(() => (score ? [...score.missing, ...score.found].map((k) => k.label) : []), [score]);

  useEffect(() => {
    if (!score) { setAnnounce(''); return undefined; }
    const t = setTimeout(() => setAnnounce(`Keyword match ${score.score} percent. ${score.found.length} of ${score.total} keywords found.`), 900);
    return () => clearTimeout(t);
  }, [score && score.score, score && score.found.length, score && score.total]);

  const go = (id) => {
    setTab(id);
    setState((s) => ({ ...s, meta: { ...s.meta, tab: id } }));
    const nav = document.getElementById('tabs');
    if (nav) nav.scrollIntoView({ block: 'start' });
  };
  const openAi = useCallback((p) => setPrompt(p), []);
  const closeAi = useCallback(() => setPrompt(null), []);
  const addSkill = (label) => setState((s) => {
    if (s.skills.trade.some((x) => x.toLowerCase() === label.toLowerCase())) return s;
    toast(`Added "${label}" to Trade and technical skills. Remove it if it is not true for you.`, 'success');
    return { ...s, skills: { ...s.skills, trade: [...s.skills.trade, label] } };
  });
  const missing = score ? score.missing : [];
  const props = { state, set: setState, openAi, keywords };

  return (
    <>
      <nav id="tabs" className="tabs" aria-label="Résumé builder">
        <ul>
          {TABS.map((t) => (
            <li key={t.id}>
              <button type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.label}</button>
            </li>
          ))}
        </ul>
        <p className="save-status" role="status">{status}</p>
      </nav>

      {notice && (
        <div className="banner" role="status">
          <p>We brought in the résumé you saved with the earlier version of this tool. Check each section, then carry on.</p>
          <button type="button" className="btn btn-small" onClick={() => setNotice(false)}>OK</button>
        </div>
      )}

      <div className="tab-panel" id="panel">
        {tab === 'resume' && (
          <>
            <Intro />
            <Toolbar state={state} setState={setState} />
            <div className="two-col builder">
              <div className="col-main">
                <PersonalSection {...props} />
                <SummarySection {...props} />
                <TradeSection {...props} />
                <TicketsSection {...props} />
                <ExperienceSection {...props} />
                <SkillsSection {...props} missing={missing} />
                <EducationSection {...props} />
                <ProjectsSection {...props} />
                <VolunteerSection {...props} />
              </div>
              <aside className="col-side" aria-label="Job match and preview">
                <JobMatch state={state} set={setState} score={score} onAddSkill={addSkill} />
                <PreviewCard model={model} />
              </aside>
            </div>
          </>
        )}
        {tab === 'cover' && <CoverTab {...props} cover={cover} />}
        {tab === 'download' && <DownloadTab state={state} model={model} cover={cover} onGoTips={() => go('tips')} />}
        {tab === 'guides' && <GuidesTab />}
        {tab === 'tips' && <TipsTab />}
      </div>

      <div className="print-only" aria-hidden="true"><ResumeView model={model} /></div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{announce}</p>
      {prompt && <AiHelpDialog prompt={prompt} onClose={closeAi} />}
      <Toasts />
    </>
  );
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }

  static getDerivedStateFromError(err) { return { err }; }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="card">
        <h2 className="card-h">Something went wrong</h2>
        <p>The builder hit an error. Your saved work is still in this browser. Reload the page to try again. If it keeps happening, use a backup file with Restore.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById('app')).render(<Boundary><App /></Boundary>);
