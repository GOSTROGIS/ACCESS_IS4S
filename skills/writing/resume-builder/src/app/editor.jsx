import React, { useState } from 'react';
import {
  ACTION_VERBS, APPRENTICE_LEVELS, CREDENTIAL_TYPES, LICENCE_CLASSES, SUMMARY_STARTERS, TICKET_SUGGESTIONS,
} from './data.js';
import {
  blankBullet, blankCredential, blankEducation, blankExperience, blankProject, blankTicket, blankVolunteer,
} from './state.js';
import { ticketStatus, findBrackets } from './model.js';
import { bulletPrompt, summaryPrompt } from './prompts.js';
import { AiButton, Check, ChipInput, Field, SectionCard, toast } from './ui.jsx';

const updAt = (list, i, patch) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));
const without = (list, i) => list.filter((_, j) => j !== i);
const swap = (list, i, j) => {
  const a = [...list];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

function ItemHead({ label, onRemove, onUp, onDown }) {
  return (
    <div className="item-head">
      <h3 className="item-title">{label}</h3>
      <div className="row-btns">
        {onUp && <button type="button" className="btn btn-small" onClick={onUp} aria-label={`Move ${label} up`}>Move up</button>}
        {onDown && <button type="button" className="btn btn-small" onClick={onDown} aria-label={`Move ${label} down`}>Move down</button>}
        <button type="button" className="btn btn-small btn-quiet-danger" onClick={onRemove} aria-label={`Remove ${label}`}>Remove</button>
      </div>
    </div>
  );
}

// ---------- 1. About you ----------
export function PersonalSection({ state, set }) {
  const p = state.personal;
  const up = (k) => (v) => set((s) => ({ ...s, personal: { ...s.personal, [k]: v } }));
  const done = !!(p.fullName && p.email && p.phone);
  return (
    <SectionCard num={1} icon="person" title="About you" sub="Your name and how to reach you. This goes at the top of the page." status={done ? 'done' : 'todo'}>
      <div className="grid-2">
        <Field label="Full name" value={p.fullName} onChange={up('fullName')} autoComplete="name" />
        <Field label="Headline (optional)" value={p.headline} onChange={up('headline')} hint="One line under your name, such as the job you want." placeholder="Example: Level 1 Carpenter Apprentice" />
        <Field label="Email" type="email" value={p.email} onChange={up('email')} autoComplete="email" hint="Use an address based on your name." />
        <Field label="Phone" type="tel" value={p.phone} onChange={up('phone')} autoComplete="tel" inputMode="tel" />
        <Field label="Location" value={p.location} onChange={up('location')} autoComplete="address-level2" hint="Job Bank's guide lists your address here. Some people give only their city and province. You choose." placeholder="Example: New Westminster, BC" />
        <Field label="LinkedIn (optional)" type="url" value={p.linkedin} onChange={up('linkedin')} />
        <Field label="Website or portfolio (optional)" type="url" value={p.portfolio} onChange={up('portfolio')} />
      </div>
    </SectionCard>
  );
}

// ---------- 2. Summary ----------
export function SummarySection({ state, set, openAi, keywords }) {
  const v = state.summary;
  const setV = (x) => set((s) => ({ ...s, summary: x }));
  const left = findBrackets(v);
  const useStarter = (t) => {
    if (v.trim() && !window.confirm('Replace your summary with this starter?')) return;
    setV(t);
    toast('Starter added. Replace every part in [square brackets] with your own facts.', 'info');
  };
  const ai = () => openAi(summaryPrompt({
    summary: v,
    headline: state.personal.headline,
    trade: state.trade.apprenticeship.trade,
    skills: [...state.skills.trade, ...state.skills.tools].slice(0, 12),
    tickets: state.tickets.map((t) => t.name).filter(Boolean),
    keywords,
  }));
  return (
    <SectionCard num={2} icon="summary" title="Summary" sub="Two or three sentences about what you can do and what you want next." status={v.trim() ? 'done' : 'todo'}>
      <Field as="textarea" rows={4} label="Your summary" value={v} onChange={setV}
        hint={`${v.length} characters. About 250 to 400 is plenty. Leave out "I", "me" and "my".`} />
      {left.length > 0 && <p className="note note-warn" role="status">Still to replace: {left.join(', ')}</p>}
      <div className="row-btns">
        <AiButton onClick={ai} />
      </div>
      <h3 className="mini-h">Need a start? Pick one, then replace the parts in [square brackets]</h3>
      <div className="row-btns">
        {SUMMARY_STARTERS.map((t) => <button key={t.label} type="button" className="btn btn-small" onClick={() => useStarter(t.text)}>{t.label}</button>)}
      </div>
    </SectionCard>
  );
}

// ---------- 3. Trade and apprenticeship ----------
export function TradeSection({ state, set }) {
  const t = state.trade;
  const setT = (patch) => set((s) => ({ ...s, trade: { ...s.trade, ...patch } }));
  const a = t.apprenticeship;
  const setA = (k) => (v) => setT({ apprenticeship: { ...a, [k]: v } });
  const l = t.licence;
  const setL = (k) => (v) => setT({ licence: { ...l, [k]: v } });
  const done = t.credentials.length > 0 || !!a.trade || !!l.cls;
  return (
    <SectionCard num={3} icon="hardhat" title="Trade, apprenticeship and licence" sub="Red Seal and SkilledTradesBC credentials, your apprenticeship level and hours, and your driver's licence." status={done ? 'done' : 'optional'}>
      <h3 className="mini-h">Apprenticeship</h3>
      <div className="grid-2">
        <Field label="Trade" value={a.trade} onChange={setA('trade')} placeholder="Example: Carpenter" />
        <Field as="select" label="Level" value={a.level} onChange={setA('level')} options={[{ value: '', label: 'Choose a level' }, ...APPRENTICE_LEVELS]} />
        <Field label="Work-based training hours" value={a.hours} onChange={setA('hours')} inputMode="numeric" hint="The hours you have logged so far, as a number." />
        <Field label="Hours as of (month)" type="month" value={a.asOf} onChange={setA('asOf')} />
        <Field label="Sponsor employer (optional)" value={a.sponsor} onChange={setA('sponsor')} className="span-2" />
      </div>

      <h3 className="mini-h">Trade credentials</h3>
      {t.credentials.length === 0 && <p className="empty">No trade credentials yet. Add a Red Seal, Certificate of Qualification or other credential you hold.</p>}
      {t.credentials.map((c, i) => (
        <div className="item" key={c.id}>
          <ItemHead label={`Credential ${i + 1}`} onRemove={() => setT({ credentials: without(t.credentials, i) })} />
          <div className="grid-2">
            <Field as="select" label="Type" value={c.type} onChange={(v) => setT({ credentials: updAt(t.credentials, i, { type: v }) })} options={CREDENTIAL_TYPES} />
            <Field label={c.type === 'other' ? 'Credential name' : 'Trade'} value={c.trade} onChange={(v) => setT({ credentials: updAt(t.credentials, i, { trade: v }) })} placeholder={c.type === 'other' ? '' : 'Example: Welder'} />
            <Field label="Issued by" value={c.issuer} onChange={(v) => setT({ credentials: updAt(t.credentials, i, { issuer: v }) })} />
            <Field label="Date (month)" type="month" value={c.date} onChange={(v) => setT({ credentials: updAt(t.credentials, i, { date: v }) })} />
          </div>
        </div>
      ))}
      <div className="row-btns"><button type="button" className="btn" onClick={() => setT({ credentials: [...t.credentials, blankCredential()] })}>Add a trade credential</button></div>

      <h3 className="mini-h">Driver's licence</h3>
      <div className="grid-2">
        <Field as="select" label="Licence class" value={l.cls} onChange={setL('cls')} options={LICENCE_CLASSES} hint="Many trades postings ask about driving. List it only if it is current." />
        {l.cls === 'other' && <Field label="Licence (as it should appear)" value={l.other} onChange={setL('other')} placeholder="Example: Alberta Class 5" />}
      </div>
      {l.cls && <Check label="I have an air brake endorsement" checked={l.airBrake} onChange={setL('airBrake')} />}
    </SectionCard>
  );
}

// ---------- 4. Tickets and safety training ----------
function StatusNote({ t }) {
  const st = ticketStatus(t);
  if (st === 'expired') return <p className="note note-warn">Expired. Renew it, or remove it from your résumé.</p>;
  if (st === 'soon') return <p className="note note-gold">Expires within 90 days. Plan to renew it.</p>;
  if (st === 'ok') return <p className="note note-ok">Current.</p>;
  return null;
}

export function TicketsSection({ state, set }) {
  const list = state.tickets;
  const setList = (v) => set((s) => ({ ...s, tickets: v }));
  return (
    <SectionCard num={4} icon="shield" title="Tickets and safety training" sub="Add the expiry date so you can see what needs renewing." status={list.some((x) => x.name) ? 'done' : 'todo'}>
      <datalist id="ticket-suggestions">{TICKET_SUGGESTIONS.map((x) => <option key={x} value={x} />)}</datalist>
      {list.length === 0 && <p className="empty">No tickets yet.</p>}
      {list.map((t, i) => (
        <div className="item" key={t.id}>
          <ItemHead label={t.name ? t.name : `Ticket ${i + 1}`} onRemove={() => setList(without(list, i))} />
          <div className="grid-2">
            <Field label="Name" value={t.name} onChange={(v) => setList(updAt(list, i, { name: v }))} list="ticket-suggestions" hint="Type it the way it appears on your card." />
            <Field as="select" label="Show it under" value={t.category} onChange={(v) => setList(updAt(list, i, { category: v }))}
              options={[{ value: 'safety', label: 'Safety training' }, { value: 'ticket', label: 'Certifications' }]} />
            <Field label="Issued by" value={t.issuer} onChange={(v) => setList(updAt(list, i, { issuer: v }))} />
            <Field label="Date issued (month)" type="month" value={t.issued} onChange={(v) => setList(updAt(list, i, { issued: v }))} />
            <Field label="Expiry date (month)" type="month" value={t.expiry} disabled={t.noExpiry} onChange={(v) => setList(updAt(list, i, { expiry: v }))} />
            <div className="field field-check">
              <Check label="This ticket does not expire" checked={t.noExpiry} onChange={(v) => setList(updAt(list, i, { noExpiry: v, expiry: v ? '' : t.expiry }))} />
            </div>
          </div>
          <StatusNote t={t} />
        </div>
      ))}
      <div className="row-btns">
        <button type="button" className="btn" onClick={() => setList([...list, blankTicket('safety')])}>Add safety training</button>
        <button type="button" className="btn" onClick={() => setList([...list, blankTicket('ticket')])}>Add a ticket or certificate</button>
      </div>
    </SectionCard>
  );
}

// ---------- bullets with action verbs, STAR helper and AI help ----------
function joinStar({ s, t, a, r }) {
  let out = (a || '').trim();
  if (t && t.trim()) out += ` to ${t.trim()}`;
  if (s && s.trim()) out += ` on ${s.trim()}`;
  if (r && r.trim()) out += `, ${r.trim()}`;
  return out.replace(/\s+/g, ' ').trim();
}

function BulletItem({ b, n, onChange, onRemove, canRemove, onAi }) {
  const [star, setStar] = useState(false);
  const [parts, setParts] = useState({ s: '', t: '', a: '', r: '' });
  const setP = (k) => (v) => setParts((x) => ({ ...x, [k]: v }));
  const put = () => {
    const text = joinStar(parts);
    if (!text) { toast('Fill in at least "What you did".', 'info'); return; }
    if (b.text.trim() && !window.confirm('Replace this bullet with the STAR version?')) return;
    onChange({ text });
    setStar(false);
  };
  return (
    <li className="bullet">
      <div className="grid-bullet">
        <Field as="select" label={`Bullet ${n}: action verb`} value={b.verb} onChange={(v) => onChange({ verb: v })}
          options={[{ value: '', label: 'Choose a verb' }, ...Object.entries(ACTION_VERBS).flatMap(([cat, vs]) => vs.map((x) => ({ value: x, label: `${x} (${cat.toLowerCase()})` })))]} />
        <Field as="textarea" rows={2} label={`Bullet ${n}: what you did and what happened`} value={b.text} onChange={(v) => onChange({ text: v })}
          hint={b.verb ? `Your bullet starts with "${b.verb}". Numbers help: how many, how often, how big.` : 'Numbers help: how many, how often, how big.'} />
      </div>
      <div className="row-btns">
        <button type="button" className="btn btn-small" aria-expanded={star} onClick={() => setStar((x) => !x)}>STAR helper</button>
        <AiButton onClick={onAi} />
        {canRemove && <button type="button" className="btn btn-small btn-quiet-danger" onClick={onRemove} aria-label={`Remove bullet ${n}`}>Remove bullet</button>}
      </div>
      {star && (
        <div className="star">
          <p className="hint">STAR stands for Situation, Task, Action, Result. Answer what you can, then put it together.</p>
          <div className="grid-2">
            <Field label="Situation: where or when?" value={parts.s} onChange={setP('s')} placeholder="Example: a six-storey wood-frame build" />
            <Field label="Task: what needed doing?" value={parts.t} onChange={setP('t')} placeholder="Example: keep the framers supplied" />
            <Field label={`Action: what you did${b.verb ? ` (after "${b.verb}")` : ''}`} value={parts.a} onChange={setP('a')} placeholder="Example: lumber and sheathing by floor" />
            <Field label="Result: what happened because of it?" value={parts.r} onChange={setP('r')} placeholder="Example: so the crew did not wait for material" />
          </div>
          <p className="hint">Preview: {[b.verb, joinStar(parts)].filter(Boolean).join(' ') || 'fill in the boxes above'}</p>
          <button type="button" className="btn btn-small btn-primary" onClick={put}>Put it together</button>
        </div>
      )}
    </li>
  );
}

function BulletList({ bullets, onChange, aiFor }) {
  return (
    <>
      <ul className="bullets">
        {bullets.map((b, i) => (
          <BulletItem key={b.id} b={b} n={i + 1}
            onChange={(patch) => onChange(updAt(bullets, i, patch))}
            onRemove={() => onChange(without(bullets, i))}
            canRemove={bullets.length > 1}
            onAi={() => aiFor(b)} />
        ))}
      </ul>
      {bullets.length > 7 && <p className="note note-gold">Job Bank suggests 5 to 7 bullets per section so the page is easy to scan.</p>}
      <div className="row-btns"><button type="button" className="btn btn-small" onClick={() => onChange([...bullets, blankBullet()])}>Add a bullet</button></div>
    </>
  );
}

// ---------- 5. Work experience ----------
export function ExperienceSection({ state, set, openAi, keywords }) {
  const list = state.experience;
  const setList = (v) => set((s) => ({ ...s, experience: v }));
  const done = list.some((e) => e.jobTitle && e.bullets.some((b) => b.text.trim()));
  return (
    <SectionCard num={5} icon="wrench" title="Work experience" sub="Most recent first. Paid work, work placements, seasonal and community jobs all count." status={done ? 'done' : 'todo'}>
      <p className="hint">Strong bullets: an action verb, what you did, and what happened because of it. Example: Staged lumber and sheathing by floor for a framing crew of six, so the crew did not wait for material.</p>
      {list.length === 0 && <p className="empty">No jobs yet.</p>}
      {list.map((e, i) => (
        <div className="item" key={e.id}>
          <ItemHead label={e.jobTitle || `Job ${i + 1}`} onRemove={() => { if (window.confirm('Remove this job?')) setList(without(list, i)); }}
            onUp={i > 0 ? () => setList(swap(list, i, i - 1)) : null}
            onDown={i < list.length - 1 ? () => setList(swap(list, i, i + 1)) : null} />
          <div className="grid-2">
            <Field label="Job title" value={e.jobTitle} onChange={(v) => setList(updAt(list, i, { jobTitle: v }))} />
            <Field label="Employer" value={e.company} onChange={(v) => setList(updAt(list, i, { company: v }))} />
            <Field label="Location" value={e.location} onChange={(v) => setList(updAt(list, i, { location: v }))} />
            <Field label="Start (month)" type="month" value={e.startDate} onChange={(v) => setList(updAt(list, i, { startDate: v }))} />
            <Field label="End (month)" type="month" value={e.endDate} disabled={e.current} onChange={(v) => setList(updAt(list, i, { endDate: v }))} />
            <div className="field field-check"><Check label="I work here now" checked={e.current} onChange={(v) => setList(updAt(list, i, { current: v, endDate: v ? '' : e.endDate }))} /></div>
          </div>
          <BulletList bullets={e.bullets} onChange={(bs) => setList(updAt(list, i, { bullets: bs }))}
            aiFor={(b) => openAi(bulletPrompt({ verb: b.verb, text: b.text, jobTitle: e.jobTitle, trade: state.trade.apprenticeship.trade, keywords }))} />
        </div>
      ))}
      <div className="row-btns"><button type="button" className="btn btn-primary" onClick={() => setList([...list, blankExperience()])}>Add a job</button></div>
    </SectionCard>
  );
}

// ---------- 6. Skills ----------
export function SkillsSection({ state, set, missing }) {
  const add = (kind) => (v) => set((s) => {
    const val = v.trim();
    if (!val || s.skills[kind].some((x) => x.toLowerCase() === val.toLowerCase())) return s;
    return { ...s, skills: { ...s.skills, [kind]: [...s.skills[kind], val] } };
  });
  const rm = (kind) => (i) => set((s) => ({ ...s, skills: { ...s.skills, [kind]: without(s.skills[kind], i) } }));
  const sk = state.skills;
  const done = sk.trade.length + sk.tools.length + sk.other.length > 0;
  return (
    <SectionCard num={6} icon="tools" title="Skills, tools and equipment" sub="Short words and phrases. Type one and press Add." status={done ? 'done' : 'todo'}>
      <ChipInput label="Trade and technical skills" items={sk.trade} onAdd={add('trade')} onRemove={rm('trade')} placeholder="Example: reading blueprints" />
      <ChipInput label="Tools and equipment" items={sk.tools} onAdd={add('tools')} onRemove={rm('tools')} placeholder="Example: skid steer" hint="Equipment you can run safely, and tools you use well." />
      <ChipInput label="Other skills" items={sk.other} onAdd={add('other')} onRemove={rm('other')} placeholder="Example: teamwork" />
      <ChipInput label="Languages (optional)" items={sk.languages} onAdd={add('languages')} onRemove={rm('languages')} placeholder="Example: English" />
      {missing.length > 0 && (
        <div className="suggest">
          <h3 className="mini-h">From the job posting, not on your résumé yet</h3>
          <p className="hint">Add one only if it is true for you.</p>
          <ul className="kw-list">
            {missing.slice(0, 10).map((k) => (
              <li key={k.label}><button type="button" className="kw kw-add" onClick={() => add('trade')(k.label)}>Add “{k.label}”</button></li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// ---------- 7. Education ----------
export function EducationSection({ state, set }) {
  const list = state.education;
  const setList = (v) => set((s) => ({ ...s, education: v }));
  return (
    <SectionCard num={7} icon="school" title="Education and training" sub="High school, foundation programs, college, ACCESS courses, and training in progress." status={list.some((e) => e.school || e.credential) ? 'done' : 'todo'}>
      {list.length === 0 && <p className="empty">No education yet.</p>}
      {list.map((e, i) => (
        <div className="item" key={e.id}>
          <ItemHead label={e.credential || `Entry ${i + 1}`} onRemove={() => setList(without(list, i))} />
          <div className="grid-2">
            <Field label="Program or credential" value={e.credential} onChange={(v) => setList(updAt(list, i, { credential: v }))} placeholder="Example: Carpentry Foundation" />
            <Field label="School or training provider" value={e.school} onChange={(v) => setList(updAt(list, i, { school: v }))} />
            <Field label="Location" value={e.location} onChange={(v) => setList(updAt(list, i, { location: v }))} />
            <Field label="Start (month)" type="month" value={e.startDate} onChange={(v) => setList(updAt(list, i, { startDate: v }))} />
            <Field label="End or expected end (month)" type="month" value={e.endDate} disabled={e.current} onChange={(v) => setList(updAt(list, i, { endDate: v }))} />
            <div className="field field-check"><Check label="In progress" checked={e.current} onChange={(v) => setList(updAt(list, i, { current: v, endDate: v ? '' : e.endDate }))} /></div>
            <Field as="textarea" rows={2} label="Notes (optional)" value={e.notes} onChange={(v) => setList(updAt(list, i, { notes: v }))} className="span-2" hint="Awards or courses that match the job." />
          </div>
        </div>
      ))}
      <div className="row-btns"><button type="button" className="btn btn-primary" onClick={() => setList([...list, blankEducation()])}>Add education</button></div>
    </SectionCard>
  );
}

// ---------- 8. Projects ----------
export function ProjectsSection({ state, set, openAi, keywords }) {
  const list = state.projects;
  const setList = (v) => set((s) => ({ ...s, projects: v }));
  return (
    <SectionCard num={8} icon="plan" title="Projects" sub="Builds from your training, home or community projects. Useful when work history is short." status="optional" defaultOpen={list.length > 0}>
      {list.length === 0 && <p className="empty">No projects yet.</p>}
      {list.map((pj, i) => (
        <div className="item" key={pj.id}>
          <ItemHead label={pj.name || `Project ${i + 1}`} onRemove={() => setList(without(list, i))} />
          <div className="grid-2">
            <Field label="Project name" value={pj.name} onChange={(v) => setList(updAt(list, i, { name: v }))} placeholder="Example: Garden shed build" />
            <Field label="Your role (optional)" value={pj.role} onChange={(v) => setList(updAt(list, i, { role: v }))} />
            <Field label="Link (optional)" type="url" value={pj.link} onChange={(v) => setList(updAt(list, i, { link: v }))} className="span-2" />
          </div>
          <BulletList bullets={pj.bullets} onChange={(bs) => setList(updAt(list, i, { bullets: bs }))}
            aiFor={(b) => openAi(bulletPrompt({ verb: b.verb, text: b.text, jobTitle: pj.role || pj.name, trade: state.trade.apprenticeship.trade, keywords }))} />
        </div>
      ))}
      <div className="row-btns"><button type="button" className="btn btn-primary" onClick={() => setList([...list, blankProject()])}>Add a project</button></div>
    </SectionCard>
  );
}

// ---------- 9. Volunteer ----------
export function VolunteerSection({ state, set }) {
  const list = state.volunteer;
  const setList = (v) => set((s) => ({ ...s, volunteer: v }));
  return (
    <SectionCard num={9} icon="heart" title="Volunteer and community" sub="Community work, events, coaching, helping Elders or family with builds and repairs." status="optional" defaultOpen={list.length > 0}>
      {list.length === 0 && <p className="empty">Nothing here yet.</p>}
      {list.map((v, i) => (
        <div className="item" key={v.id}>
          <ItemHead label={v.role || `Entry ${i + 1}`} onRemove={() => setList(without(list, i))} />
          <div className="grid-2">
            <Field label="Role" value={v.role} onChange={(x) => setList(updAt(list, i, { role: x }))} />
            <Field label="Organization or community" value={v.organization} onChange={(x) => setList(updAt(list, i, { organization: x }))} />
            <Field label="Dates" value={v.dates} onChange={(x) => setList(updAt(list, i, { dates: x }))} placeholder="Example: 2024 - Present" />
            <Field label="What you did (one line)" value={v.description} onChange={(x) => setList(updAt(list, i, { description: x }))} />
          </div>
        </div>
      ))}
      <div className="row-btns"><button type="button" className="btn btn-primary" onClick={() => setList([...list, blankVolunteer()])}>Add an entry</button></div>
    </SectionCard>
  );
}
