import React, { useState } from 'react';
import { CHECKED, SOURCES, TRADE_GUIDES } from './data.js';
import { ColumnsArt, FLOW_STEPS } from './art.jsx';
import { coverPrompt } from './prompts.js';
import { coverToText, findBrackets, resumeToText, ticketStatus } from './model.js';
import { coverDocx, coverPdf, fileName, resumeDocx, resumePdf, saveBlob } from './exporter.js';
import { AiButton, copyText, CoverView, Field, toast } from './ui.jsx';

// ---------- job posting keyword guide ----------
function Ring({ pct }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const band = pct >= 70 ? 'hi' : pct >= 40 ? 'mid' : 'lo';
  return (
    <svg className={`ring ring-${band}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle className="ring-track" cx="32" cy="32" r={r} fill="none" strokeWidth="7" />
      <circle className="ring-val" cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="ring-num">{pct}%</text>
    </svg>
  );
}

export function JobMatch({ state, set, score, onAddSkill }) {
  const setJD = (v) => set((s) => ({ ...s, jobDescription: v }));
  return (
    <section className="card match" id="job-match" aria-labelledby="match-h">
      <h2 id="match-h" className="card-h">Match a job posting</h2>
      <p className="hint">Paste a posting to see which of its words are on your résumé and which are missing.</p>
      <Field as="textarea" rows={7} label="Job posting" value={state.jobDescription} onChange={setJD} hint="Paste the whole posting: duties, requirements and tickets." />
      {state.jobDescription.trim() && <div className="row-btns"><button type="button" className="btn btn-small" onClick={() => setJD('')}>Clear posting</button></div>}
      {score && (
        <div className="match-result">
          <div className="match-score">
            <Ring pct={score.score} />
            <p><strong>{score.found.length} of {score.total}</strong> keywords from the posting are on your résumé.</p>
          </div>
          <h3 className="mini-h">Missing ({score.missing.length})</h3>
          {score.missing.length === 0 ? <p className="hint">None of the keywords we found are missing.</p> : (
            <ul className="kw-list">
              {score.missing.map((k) => (
                <li key={k.label}>
                  <span className="kw kw-miss"><span aria-hidden="true">○</span> {k.label}</span>
                  <button type="button" className="btn btn-small btn-link" onClick={() => onAddSkill(k.label)} aria-label={`Add ${k.label} to skills`}>Add</button>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mini-h">Found ({score.found.length})</h3>
          {score.found.length === 0 ? <p className="hint">None yet.</p> : (
            <ul className="kw-list">
              {score.found.map((k) => <li key={k.label}><span className="kw kw-hit"><span aria-hidden="true">✓</span> {k.label}</span></li>)}
            </ul>
          )}
          <p className="note note-gold"><strong>This score is a keyword guide, not a prediction.</strong> It is not what any employer's system will do. Employers use different systems and settings. Add a missing word only if it is true for you.</p>
        </div>
      )}
    </section>
  );
}

// ---------- cover letter ----------
export function CoverTab({ state, set, cover, openAi, keywords }) {
  const cl = state.coverLetter;
  const up = (k) => (v) => set((s) => ({ ...s, coverLetter: { ...s.coverLetter, [k]: v } }));
  const left = findBrackets(cl.body);
  const outline = () => {
    if (cl.body.trim() && !window.confirm('Replace your letter with the outline?')) return;
    up('body')([
      'Dear [name of the hiring manager, or Hiring Manager],',
      '',
      'I am applying for the [job title] position at [company]. I saw the posting on [where you saw it].',
      '',
      '[Two or three things you can do that match the posting. Use one short example.]',
      '',
      '[Why you want to work for this employer or on this kind of job.]',
      '',
      'Thank you for your time. You can reach me at [phone] or [email].',
      '',
      'Sincerely,',
      '[Your name]',
    ].join('\n'));
    toast('Outline added. Replace every part in [square brackets].', 'info');
  };
  return (
    <div className="two-col">
      <div className="col-main">
        <section className="card" aria-labelledby="cl-h">
          <h2 id="cl-h" className="card-h">Cover letter</h2>
          <p className="hint">Keep it under one page. Three short paragraphs is enough: the job, why you fit, and how to reach you.</p>
          <div className="grid-2">
            <Field label="Who you are writing to" value={cl.recipient} onChange={up('recipient')} hint="A name if the posting gives one, or Hiring Manager." />
            <Field label="Company" value={cl.company} onChange={up('company')} />
            <Field label="Job title you are applying for" value={cl.role} onChange={up('role')} className="span-2" />
          </div>
          <Field as="textarea" rows={14} label="Letter" value={cl.body} onChange={up('body')} hint="Leave a blank line between paragraphs." />
          {left.length > 0 && <p className="note note-warn" role="status">Still to replace: {left.join(', ')}</p>}
          <div className="row-btns">
            <button type="button" className="btn" onClick={outline}>Start from an outline</button>
            <AiButton onClick={() => openAi(coverPrompt({ body: cl.body, role: cl.role, company: cl.company, keywords }))} />
          </div>
        </section>
      </div>
      <div className="col-side">
        <section className="card preview-card" aria-labelledby="clp-h">
          <h2 id="clp-h" className="card-h">Preview</h2>
          <div className="paper-wrap"><CoverView cover={cover} /></div>
          <p className="hint">Download it as a PDF or Word file on the Download tab.</p>
        </section>
      </div>
    </div>
  );
}

// ---------- download ----------
function readiness(state, model) {
  const p = state.personal;
  const texts = [state.summary, ...state.experience.flatMap((e) => e.bullets.map((b) => b.text)), ...state.projects.flatMap((x) => x.bullets.map((b) => b.text))].join('\n');
  const brackets = findBrackets(texts);
  const expired = state.tickets.filter((t) => t.name && ticketStatus(t) === 'expired').map((t) => t.name);
  const sec = (id) => model.sections.some((s) => s.id === id);
  return [
    { ok: !!p.fullName.trim(), text: p.fullName.trim() ? 'Your name is at the top.' : 'Add your full name.' },
    { ok: !!(p.email.trim() || p.phone.trim()), text: p.email.trim() || p.phone.trim() ? 'An employer can contact you.' : 'Add an email address or phone number.' },
    { ok: sec('experience') || sec('education'), text: sec('experience') || sec('education') ? 'You have work experience or education listed.' : 'Add at least one job or one education entry.' },
    { ok: sec('skills'), text: sec('skills') ? 'Skills are listed.' : 'Add a few skills, tools or equipment.' },
    { ok: brackets.length === 0, text: brackets.length ? `Replace the starter text still in [square brackets]: ${brackets.join(', ')}` : 'No starter text left in [square brackets].' },
    { ok: expired.length === 0, text: expired.length ? `Expired: ${expired.join(', ')}. Renew it or remove it.` : 'No expired tickets listed.' },
  ];
}

export function DownloadTab({ state, model, cover, onGoTips }) {
  const [busy, setBusy] = useState('');
  const checks = readiness(state, model);
  const run = async (key, fn, name) => {
    setBusy(key);
    try {
      const blob = await fn();
      saveBlob(blob, name);
      toast(`Saved ${name}. Check your Downloads folder.`, 'success');
    } catch (e) {
      toast(`That file could not be made: ${e && e.message ? e.message : e}`, 'error');
    } finally {
      setBusy('');
    }
  };
  const person = state.personal.fullName;
  const hasLetter = cover.paragraphs.length > 0;
  const copyPlain = async () => {
    const ok = await copyText(resumeToText(model));
    toast(ok ? 'Résumé copied as plain text. Paste it where a form asks for your résumé text.' : 'Your browser blocked copying.', ok ? 'success' : 'error');
  };
  return (
    <div className="stack">
      <section className="card" aria-labelledby="ready-h">
        <h2 id="ready-h" className="card-h">Before you download</h2>
        <ul className="checks">
          {checks.map((c, i) => (
            <li key={i} className={c.ok ? 'ok' : 'todo'}>
              <span className="check-mark" aria-hidden="true">{c.ok ? '✓' : '!'}</span>
              <span><span className="sr-only">{c.ok ? 'Done: ' : 'To fix: '}</span>{c.text}</span>
            </li>
          ))}
        </ul>
        <p className="hint">Proofread it, then ask someone you trust to read it too. Job Bank warns that a single spelling mistake can give a poor first impression.</p>
      </section>

      <div className="grid-2 export-grid">
        <section className="card" aria-labelledby="res-h">
          <h2 id="res-h" className="card-h">Résumé</h2>
          <div className="row-btns col-btns">
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run('rpdf', () => resumePdf(model), fileName(person, 'resume', 'pdf'))}>{busy === 'rpdf' ? 'Making PDF' : 'Download PDF'}</button>
            <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run('rdocx', () => resumeDocx(model), fileName(person, 'resume', 'docx'))}>{busy === 'rdocx' ? 'Making Word file' : 'Download Word (.docx)'}</button>
            <button type="button" className="btn" onClick={copyPlain}>Copy as plain text</button>
            <button type="button" className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </section>
        <section className="card" aria-labelledby="cov-h">
          <h2 id="cov-h" className="card-h">Cover letter</h2>
          {!hasLetter && <p className="hint">Write your letter on the Cover letter tab first.</p>}
          <div className="row-btns col-btns">
            <button type="button" className="btn btn-primary" disabled={!!busy || !hasLetter} onClick={() => run('cpdf', () => coverPdf(cover), fileName(person, 'cover-letter', 'pdf'))}>{busy === 'cpdf' ? 'Making PDF' : 'Download PDF'}</button>
            <button type="button" className="btn btn-primary" disabled={!!busy || !hasLetter} onClick={() => run('cdocx', () => coverDocx(cover), fileName(person, 'cover-letter', 'docx'))}>{busy === 'cdocx' ? 'Making Word file' : 'Download Word (.docx)'}</button>
            <button type="button" className="btn" disabled={!hasLetter} onClick={async () => toast((await copyText(coverToText(cover))) ? 'Letter copied as plain text.' : 'Your browser blocked copying.', 'info')}>Copy as plain text</button>
          </div>
        </section>
      </div>

      <section className="card" aria-labelledby="fmt-h">
        <h2 id="fmt-h" className="card-h">What every file from this page has</h2>
        <ul className="plain-list">
          <li>Real text you can select and copy, not a picture of text.</li>
          <li>One column, read from top to bottom.</li>
          <li>Plain section headings such as WORK EXPERIENCE and EDUCATION.</li>
          <li>Your name and contact details in the body of the page, not in a header or footer.</li>
          <li>No tables, text boxes, photos, icons or logos.</li>
        </ul>
        <p className="hint">Which file to send: if the posting names a file type, use that one. The Lever and Workday help pages we checked both list PDF and Word (.docx). <button type="button" className="btn-inline" onClick={onGoTips}>See the sources on the Tips tab.</button></p>
      </section>
    </div>
  );
}

// ---------- trade guides ----------
export function GuidesTab() {
  return (
    <div className="stack">
      <section className="card intro-card">
        <h2 className="card-h">BC trades: what the work is and how certification works</h2>
        <p>Each guide uses the national occupation description (NOC 2021, Statistics Canada) for what the work involves, and SkilledTradesBC for training and certification in BC. We checked every fact on {CHECKED}. Rules and hours change, so confirm with SkilledTradesBC before you plan your training.</p>
        <p>The last list in each guide gives words you can use on your résumé, but only for things you have really done.</p>
      </section>
      {TRADE_GUIDES.map((g) => (
        <article className="card guide" key={g.id} aria-labelledby={`g-${g.id}`}>
          <h2 className="card-h" id={`g-${g.id}`}>{g.title}</h2>
          <p className="guide-noc">NOC 2021 <a href={g.noc.url} target="_blank" rel="noopener noreferrer">{g.noc.code}: {g.noc.title}</a></p>
          <div className="guide-grid">
            <div>
              <h3 className="mini-h">What the work involves</h3>
              <ul className="plain-list">{g.duties.map((d) => <li key={d}>{d}</li>)}</ul>
              <h3 className="mini-h">What employers usually ask for</h3>
              <ul className="plain-list">{g.requirements.map((d) => <li key={d}>{d}</li>)}</ul>
            </div>
            <div>
              <h3 className="mini-h">Training and certification in BC</h3>
              <ul className="plain-list">{g.bc.map((d) => <li key={d}>{d}</li>)}</ul>
              <h3 className="mini-h">Résumé words, if they are true for you</h3>
              <ul className="kw-list">{g.words.map((w) => <li key={w}><span className="kw">{w}</span></li>)}</ul>
            </div>
          </div>
          <details className="sources">
            <summary>Sources for this guide (checked {CHECKED})</summary>
            <ul>{g.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></li>)}</ul>
          </details>
        </article>
      ))}
    </div>
  );
}

// ---------- tips ----------
function Tip({ title, children }) {
  return (
    <section className="card tip">
      <h3 className="tip-h">{title}</h3>
      {children}
    </section>
  );
}

export function TipsTab() {
  const src = (id) => SOURCES.find((s) => s.id === id);
  const Cite = ({ id }) => <a href={src(id).url} target="_blank" rel="noopener noreferrer">{src(id).label.split(':')[0]}</a>;
  return (
    <div className="stack">
      <section className="card" aria-labelledby="flow-h">
        <h2 id="flow-h" className="card-h">How hiring software reads your résumé</h2>
        <p>Employers that use an applicant tracking system (ATS) store applications in it. Here is what can happen to your file.</p>
        <ol className="flow">
          {FLOW_STEPS.map((s, i) => (
            <li key={s.id} className="flow-step">
              {s.icon}
              <h3 className="flow-h"><span className="flow-n">{i + 1}</span> {s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card" aria-labelledby="cols-h">
        <h2 id="cols-h" className="card-h">Why one column</h2>
        <figure className="fig">
          <ColumnsArt />
          <figcaption>Greenhouse lists columned layouts, tables, and contact details in a header, footer or text box among the reasons a résumé does not read in correctly. Workday's guidelines also say to avoid tables and columns. Every file from this page uses one column.</figcaption>
        </figure>
      </section>

      <h2 className="tips-h">Tips we checked</h2>
      <div className="tips">
        <Tip title="Send a file with real text in it">
          <p>Use PDF or Word (.docx) unless the posting asks for something else. Lever says it cannot read image files such as JPG or PNG, and Workday says a PDF must contain real text, not a scanned image. Sources: <Cite id="lever" />, <Cite id="workday" />.</p>
        </Tip>
        <Tip title="Keep the layout plain">
          <p>Skip photos, logos, text boxes and tables. Put your name and contact details at the top of the page itself. Systems differ: Oracle's Taleo documentation says its parser can read headers and footers, while Greenhouse lists contact details in a header or footer as a problem. Keeping them in the body works for both. Sources: <Cite id="greenhouse" />, <Cite id="workday" />, <Cite id="taleo" />.</p>
        </Tip>
        <Tip title="Use plain headings and keep each job separate">
          <p>Headings like EDUCATION and EXPERIENCE help software sort your résumé. Workday's guidelines also say not to combine sections under one heading, and to list each job on its own. Source: <Cite id="workday" />.</p>
        </Tip>
        <Tip title="Match the posting, honestly">
          <p>Job Bank says to tailor your résumé to each job by reading the job description, and to be honest: do not overstate your skills or results. Use the posting's words for things you really have done. Source: <Cite id="jobbank" />.</p>
        </Tip>
        <Tip title="Show what you did">
          <p>Job Bank suggests highlighting what you accomplished, using numbers an employer understands, and using simple words and action verbs. It also says not to just list job duties. Source: <Cite id="jobbank" />.</p>
        </Tip>
        <Tip title="Keep it short and leave personal details out">
          <p>Job Bank suggests two pages at most and 5 to 7 bullets per section. Leave out your photo, age, marital status and your Social Insurance Number. Do not write "I", "me" or "my". Keep references on a separate sheet and give them when asked. Source: <Cite id="jobbank" />.</p>
        </Tip>
        <Tip title="Keep your tickets current">
          <p>Add expiry dates in the Tickets section. The builder flags any ticket that has expired or expires within 90 days, so you can renew it or take it off.</p>
        </Tip>
        <Tip title="When a file does not read in">
          <p>When a résumé does not read in correctly, Greenhouse's help page says the details need to be typed in by hand. A plain layout makes that less likely. Source: <Cite id="greenhouse" />.</p>
        </Tip>
        <Tip title="About the match score on this page">
          <p>The score only counts which words from the posting are on your résumé. It is a keyword guide. It is not what any employer's system will do, because employers use different systems and settings.</p>
        </Tip>
        <Tip title="About numbers you may see online">
          <p>Some websites claim a set share of résumés is rejected by software before a person sees them. We did not find a reliable source for those numbers, so this page does not use them.</p>
        </Tip>
        <Tip title="Look after yourself">
          <p>Job searching takes energy. Track your applications in a simple list, take breaks, and talk to your ACCESS instructor or someone you trust. If you need to talk to someone now, the Hope for Wellness Helpline is open to all Indigenous people in Canada 24 hours a day at 1-855-242-3310, with online chat at hopeforwellness.ca. Source: <Cite id="hope" />.</p>
        </Tip>
      </div>

      <section className="card" aria-labelledby="src-h">
        <h2 id="src-h" className="card-h">Sources</h2>
        <p className="hint">All checked {CHECKED}.</p>
        <ul className="src-list">
          {SOURCES.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a> <span className="src-url">{s.url}</span></li>)}
        </ul>
        <p className="hint">Trade facts have their own sources at the bottom of each guide on the Trade guides tab.</p>
      </section>
    </div>
  );
}
