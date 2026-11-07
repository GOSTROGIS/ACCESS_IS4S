// Original flat illustrations in the ACCESS palette. Colours come from CSS classes
// (art-*), so they follow the light and dark themes.

import React from 'react';

export function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 400 300" role="img" aria-labelledby="hero-art-t hero-art-d">
      <title id="hero-art-t">A trades worker holding up a résumé</title>
      <desc id="hero-art-d">A worker in a gold hard hat and high-visibility vest stands in front of a wood-frame wall and holds up a one-page résumé with a check mark on it.</desc>
      <circle className="art-tint" cx="200" cy="158" r="132" />
      <g className="art-line-s" strokeWidth="6" strokeLinecap="round">
        <line x1="44" y1="78" x2="44" y2="262" />
        <line x1="74" y1="78" x2="74" y2="262" />
        <line x1="104" y1="78" x2="104" y2="262" />
        <line x1="34" y1="78" x2="114" y2="78" />
        <line x1="34" y1="262" x2="114" y2="262" />
      </g>
      <ellipse className="art-shadow" cx="168" cy="276" rx="92" ry="9" />
      <rect className="art-ink" x="128" y="196" width="20" height="70" rx="6" />
      <rect className="art-ink" x="154" y="196" width="20" height="70" rx="6" />
      <rect className="art-slate" x="120" y="258" width="30" height="13" rx="5" />
      <rect className="art-slate" x="152" y="258" width="30" height="13" rx="5" />
      <rect className="art-ink" x="104" y="124" width="17" height="64" rx="8.5" />
      <circle className="art-skin" cx="112" cy="190" r="8" />
      <rect className="art-deep" x="118" y="116" width="66" height="84" rx="16" />
      <path className="art-gold" d="M122 124 h24 v76 h-16 a8 8 0 0 1 -8 -8 z" />
      <path className="art-gold" d="M156 124 h24 v68 a8 8 0 0 1 -8 8 h-16 z" />
      <rect className="art-paper" x="122" y="160" width="24" height="6" />
      <rect className="art-paper" x="156" y="160" width="24" height="6" />
      <rect className="art-skin" x="143" y="104" width="16" height="14" rx="4" />
      <circle className="art-skin" cx="151" cy="90" r="21" />
      <path className="art-gold" d="M127 86 a24 24 0 0 1 48 0 z" />
      <rect className="art-gold-d" x="121" y="83" width="60" height="7" rx="3.5" />
      <rect className="art-gold-d" x="148" y="64" width="6" height="22" rx="3" />
      <g transform="rotate(-7 262 156)">
        <rect className="art-paper art-edge" x="210" y="82" width="112" height="146" rx="6" />
        <rect className="art-red" x="224" y="98" width="62" height="9" rx="2" />
        <rect className="art-muted" x="224" y="113" width="84" height="4" rx="2" />
        <rect className="art-red" x="224" y="128" width="34" height="5" rx="2" />
        <rect className="art-muted" x="224" y="139" width="84" height="4" rx="2" />
        <rect className="art-muted" x="224" y="148" width="72" height="4" rx="2" />
        <rect className="art-red" x="224" y="163" width="34" height="5" rx="2" />
        <rect className="art-muted" x="224" y="174" width="84" height="4" rx="2" />
        <rect className="art-muted" x="224" y="183" width="60" height="4" rx="2" />
        <rect className="art-muted" x="224" y="192" width="70" height="4" rx="2" />
        <circle className="art-gold" cx="302" cy="208" r="15" />
        <path className="art-ink-s" d="M295 208 l5 5 l10 -11" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path className="art-deep-s" d="M178 132 L208 150" strokeWidth="17" strokeLinecap="round" fill="none" />
      <circle className="art-skin" cx="212" cy="152" r="9" />
    </svg>
  );
}

function FlowIcon({ id, title, children }) {
  return (
    <svg className="flow-icon" viewBox="0 0 64 64" role="img" aria-labelledby={`${id}-t`}>
      <title id={`${id}-t`}>{title}</title>
      {children}
    </svg>
  );
}

const Page = () => <rect className="art-paper art-edge" x="14" y="8" width="36" height="48" rx="4" />;

export const FLOW_STEPS = [
  {
    id: 'flow-1',
    title: 'You upload',
    text: 'You send a PDF or Word file through the job site or by email.',
    icon: (
      <FlowIcon id="flow-1" title="A résumé file being uploaded">
        <Page />
        <rect className="art-muted" x="20" y="38" width="24" height="3" rx="1.5" />
        <rect className="art-muted" x="20" y="45" width="18" height="3" rx="1.5" />
        <circle className="art-red" cx="32" cy="22" r="10" />
        <path className="art-paper-s" d="M32 28 v-12 M27 21 l5 -5 l5 5" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </FlowIcon>
    ),
  },
  {
    id: 'flow-2',
    title: 'Text is pulled out',
    text: 'Software copies the words out of the file. A picture of text cannot be read this way.',
    icon: (
      <FlowIcon id="flow-2" title="Words being copied out of a file">
        <Page />
        <rect className="art-muted" x="20" y="16" width="22" height="3" rx="1.5" />
        <rect className="art-muted" x="20" y="24" width="18" height="3" rx="1.5" />
        <rect className="art-gold" x="34" y="32" width="24" height="9" rx="2" />
        <rect className="art-gold" x="30" y="45" width="28" height="9" rx="2" />
        <path className="art-ink-s" d="M38 36.5 h16 M34 49.5 h20" strokeWidth="2" strokeLinecap="round" />
      </FlowIcon>
    ),
  },
  {
    id: 'flow-3',
    title: 'Sections are found',
    text: 'Plain headings like WORK EXPERIENCE and EDUCATION help it sort what it read.',
    icon: (
      <FlowIcon id="flow-3" title="A page split into labelled sections">
        <Page />
        <rect className="art-red" x="19" y="14" width="18" height="4" rx="1.5" />
        <rect className="art-muted" x="19" y="21" width="26" height="3" rx="1.5" />
        <rect className="art-red" x="19" y="30" width="14" height="4" rx="1.5" />
        <rect className="art-muted" x="19" y="37" width="26" height="3" rx="1.5" />
        <rect className="art-red" x="19" y="45" width="16" height="4" rx="1.5" />
        <path className="art-gold-s" d="M10 16 h4 M10 32 h4 M10 47 h4" strokeWidth="3" strokeLinecap="round" />
      </FlowIcon>
    ),
  },
  {
    id: 'flow-4',
    title: 'Keywords are searched',
    text: 'A recruiter can search the stored résumés for words, such as a ticket or a tool named in the posting.',
    icon: (
      <FlowIcon id="flow-4" title="A magnifying glass over keywords">
        <rect className="art-tint-strong" x="6" y="12" width="30" height="10" rx="5" />
        <rect className="art-tint-strong" x="6" y="28" width="22" height="10" rx="5" />
        <rect className="art-tint-strong" x="6" y="44" width="26" height="10" rx="5" />
        <circle className="art-paper art-red-s" cx="42" cy="30" r="12" strokeWidth="4" />
        <path className="art-red-s" d="M50.5 38.5 L58 46" strokeWidth="5" strokeLinecap="round" />
        <path className="art-ink-s" d="M37 30 l3.5 3.5 l7 -7" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </FlowIcon>
    ),
  },
  {
    id: 'flow-5',
    title: 'A person reads it',
    text: 'Someone at the company reads your résumé. It has to make sense to that person, not only to the software.',
    icon: (
      <FlowIcon id="flow-5" title="A person reading a résumé">
        <circle className="art-deep" cx="20" cy="20" r="8" />
        <path className="art-deep" d="M6 52 a14 14 0 0 1 28 0 z" />
        <rect className="art-paper art-edge" x="34" y="18" width="24" height="32" rx="3" />
        <rect className="art-red" x="38" y="23" width="12" height="3" rx="1.5" />
        <rect className="art-muted" x="38" y="30" width="16" height="2.5" rx="1.25" />
        <rect className="art-muted" x="38" y="36" width="16" height="2.5" rx="1.25" />
        <rect className="art-muted" x="38" y="42" width="11" height="2.5" rx="1.25" />
      </FlowIcon>
    ),
  },
];

export function ColumnsArt() {
  const lines = (x, y0, n, w) => Array.from({ length: n }, (_, i) => (
    <rect key={i} className="art-muted" x={x} y={y0 + i * 14} width={w} height="5" rx="2.5" />
  ));
  return (
    <svg className="columns-art" viewBox="0 0 520 250" role="img" aria-labelledby="cols-t cols-d">
      <title id="cols-t">One column compared with two columns</title>
      <desc id="cols-d">On the left, a one-column page is read from top to bottom in order. On the right, a two-column page is read straight across, so lines from the left and right columns get mixed together.</desc>
      <g>
        <rect className="art-paper art-edge" x="40" y="14" width="160" height="208" rx="6" />
        <rect className="art-red" x="58" y="32" width="70" height="8" rx="2" />
        {lines(58, 50, 3, 124)}
        <rect className="art-red" x="58" y="100" width="54" height="6" rx="2" />
        {lines(58, 116, 3, 124)}
        <rect className="art-red" x="58" y="164" width="54" height="6" rx="2" />
        {lines(58, 180, 2, 124)}
        <path className="art-gold-s" d="M24 34 V200" strokeWidth="5" strokeLinecap="round" />
        <path className="art-gold-s" d="M17 192 L24 204 L31 192" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text className="art-label" x="120" y="242" textAnchor="middle">Read in order</text>
      </g>
      <g>
        <rect className="art-paper art-edge" x="300" y="14" width="190" height="208" rx="6" />
        <rect className="art-tint-strong" x="312" y="26" width="60" height="184" rx="4" />
        <rect className="art-red" x="318" y="36" width="44" height="6" rx="2" />
        {lines(318, 52, 4, 46)}
        <rect className="art-red" x="386" y="36" width="60" height="6" rx="2" />
        {lines(386, 52, 9, 92)}
        <path className="art-red-s" d="M318 72 H476 M476 72 L318 86 M318 86 H476" strokeWidth="2.6" fill="none" strokeDasharray="5 4" />
        <text className="art-label" x="395" y="242" textAnchor="middle">Lines can get mixed</text>
      </g>
    </svg>
  );
}

const ICONS = {
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  summary: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  hardhat: <><path d="M3 18h18" /><path d="M5 18v-3a7 7 0 0 1 14 0v3" /><path d="M10 8V5h4v3" /></>,
  ticket: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h6M7 14h4" /><circle cx="17" cy="12" r="1.5" /></>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  wrench: <><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3z" /><path d="M14.5 6.5L17 4l3 3-2.5 2.5" /></>,
  tools: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M9 9V6h6v3M3 14h18" /></>,
  school: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5" /></>,
  plan: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M10 10v10" /></>,
  heart: <><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></>,
};

export function SectionIcon({ name }) {
  return (
    <svg className="sec-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <title>{name}</title>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</g>
    </svg>
  );
}
