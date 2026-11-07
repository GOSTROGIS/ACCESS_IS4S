// Builds copy-and-paste prompts for an AI chat tool. Nothing here sends data anywhere.
// Prompts leave out name, phone, email and address on purpose.

const RULES = [
  'Use only the facts I give you. Do not add tools, tickets, numbers, results or duties I did not mention.',
  'If you need a detail you do not have, ask me a question instead of guessing.',
  'Use plain language and Canadian spelling.',
  'Use a word from the job posting only if my facts already show it is true.',
];

function keywordLine(keywords) {
  if (!keywords || !keywords.length) return '';
  return `Words from the job posting (use one only if it is true for me): ${keywords.slice(0, 12).join(', ')}`;
}

function block(lines) {
  return lines.filter((x) => x !== null && x !== undefined && x !== false).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function bulletPrompt({ verb, text, jobTitle, trade, keywords }) {
  const bullet = [verb, text].filter(Boolean).join(' ').trim();
  return block([
    'I am writing a résumé for a trades job in British Columbia, Canada.',
    'Please help me improve one bullet point from my work experience.',
    '',
    jobTitle ? `My job title in that role: ${jobTitle}` : '',
    trade ? `The trade I am working toward: ${trade}` : '',
    `What I wrote: "${bullet || '(empty so far)'}"`,
    keywordLine(keywords),
    '',
    'Rules:',
    ...RULES.map((r) => `- ${r}`),
    '- Start with an action verb. Keep it to one line, under 25 words.',
    '- Give me 3 versions so I can choose.',
  ]);
}

export function summaryPrompt({ summary, headline, trade, skills, tickets, keywords }) {
  return block([
    'I am writing a résumé for a trades job in British Columbia, Canada.',
    'Please help me improve the short summary at the top of my résumé.',
    '',
    headline ? `My headline: ${headline}` : '',
    trade ? `The trade I am working toward: ${trade}` : '',
    skills && skills.length ? `Skills I listed: ${skills.join(', ')}` : '',
    tickets && tickets.length ? `Tickets and certifications I listed: ${tickets.join('; ')}` : '',
    `What I wrote: "${summary || '(empty so far)'}"`,
    keywordLine(keywords),
    '',
    'Rules:',
    ...RULES.map((r) => `- ${r}`),
    '- Two or three sentences, under 60 words. Do not use "I", "me" or "my".',
    '- Give me 2 versions so I can choose.',
  ]);
}

export function coverPrompt({ body, role, company, keywords }) {
  return block([
    'I am writing a cover letter for a trades job in British Columbia, Canada.',
    'Please help me make my letter clearer and shorter.',
    '',
    role ? `The job: ${role}` : '',
    company ? `The employer: ${company}` : '',
    keywordLine(keywords),
    '',
    'My letter:',
    body || '(empty so far)',
    '',
    'Rules:',
    ...RULES.map((r) => `- ${r}`),
    '- Keep my voice. Keep it under 300 words.',
    '- Leave out my name, address, phone number and email; I will add those myself.',
  ]);
}
