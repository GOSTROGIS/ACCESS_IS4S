// Only take over a direct fraction-to-percent question. A word problem that contains
// a fraction, another operation, or an explicit rounding request belongs to the tutor.
const fraction = '(-?\\d{1,9})\\s*(?:/|out of|over)\\s*(-?\\d{1,9})';
const patterns = [
  new RegExp('^(?:what(?: is|s)? |how much is |convert |express |write |turn )?' + fraction +
    '\\s*(?:as|in|to|into|written as|expressed as) (?:a |an? equivalent )?(?:percentage|percent|per cent)$'),
  new RegExp('^(?:(?:what(?: is|s)?|calculate|find|work out|convert to) (?:the |a )?)?' +
    '(?:percentage|percent|per cent) (?:of |for |is |does )?' + fraction + '(?: represent)?$'),
  new RegExp('^how (?:do i|can i|do you|to) (?:convert|write|express|turn) ' + fraction +
    ' (?:as|to|into) (?:a )?(?:percentage|percent|per cent)$'),
];
const shortFollowup = new RegExp('^(?:and |what about |how about )?' + fraction + '$');
const claimedValue = '-?\\d+(?:\\.\\d+)?\\s*%';
const claim = new RegExp('^(?:is )?' + fraction + ' as (?:a )?percent(?:age)? (?:is |equals |==? )?' +
  '(?:(?:\\1\\s*/\\s*\\2)\\s*[*×]\\s*100%?\\s*=\\s*)?' + claimedValue + '$');
const calculation = new RegExp('^' + fraction + '\\s*[*×]\\s*100%?\\s*=\\s*' + claimedValue + '$');
const numerators = {one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9};
const denominators = {half:2, halves:2, third:3, quarter:4, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9, tenth:10};

function clean(question) {
  return question.toLowerCase().replace(/[’']/g, '').replace(/[⁄∕]/g, '/').replace(/−/g, '-')
    .replace(/\\\*/g, '*').replace(/[“”"`]/g, '')
    .replace(/(as a percent(?:age)?)\s*:\s*/g, '$1 is ')
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine)[ -](half|halves|third|quarter|fourth|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/g,
      (_, top, bottom) => numerators[top] + '/' + denominators[bottom])
    .replace(/^(?:it|(?:the |my )?(?:tutor|assistant|guide)) (?:said|says|told me) (?:that )?/, '')
    .replace(/[.,!? —-]+(?:is (?:that|this|it) (?:right|correct)|really)[?! .]*$/, '')
    .replace(/[,?!;.\s:]*(?:im |i am )(?:really |so )?(?:confused|stuck|lost)\b[\s.!?:()]*$/, '')
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you (?:please )?(?:help me (?:to )?)?|help me (?:to )?)/, '')
    .replace(/^figure out /, 'find ').replace(/(?:\s+please)?[.?!:\s()]*$/, '')
    .replace(/\s+/g, ' ').trim();
}

function decimal(a, b, multiplier, places = 4) {
  const scale = 10n ** BigInt(places);
  const numerator = BigInt(a) * multiplier * scale;
  const denominator = BigInt(b);
  const absolute = n => n < 0n ? -n : n;
  const n = absolute(numerator), d = absolute(denominator);
  const rounded = (2n * n + d) / (2n * d);
  const sign = (numerator < 0n) !== (denominator < 0n) && rounded !== 0n ? '-' : '';
  const decimals = String(rounded % scale).padStart(places, '0').replace(/0+$/, '');
  return { value: sign + String(rounded / scale) + (decimals ? '.' + decimals : ''), approximate: n % d !== 0n };
}

export function fractionAnswer(question, previousConversion = false) {
  let input = clean(question);
  const why = /^(?:why(?: multiply by 100)?|how did you get that|explain that)$/.test(input);
  if (typeof previousConversion === 'string' && (why || /^(?:is (?:that|it) )?-?\d+(?:\.\d+)?\s*%$/.test(input))) {
    const previous = /^(-?\d+\/-?\d+) is /.exec(previousConversion);
    if (previous) input = previous[1] + ' as a percentage';
  }
  const withoutHint = input.replace(/^(?:give me |i(?:d like| want) )?(?:only |just )?(?:a |one )?hint (?:for|on) (?:converting )?/, '')
    .replace(/[,.!? ]+(?:(?:please )?(?:just |only )?a hint|hint only)$/, '');
  const hint = withoutHint !== input;
  input = withoutHint;
  const candidates = [claim, calculation, ...patterns];
  if (previousConversion) candidates.push(shortFollowup);
  for (const pattern of candidates) {
    const match = pattern.exec(input);
    if (!match) continue;
    const [, a, b] = match;
    if (hint) return BigInt(b) === 0n ? 'Look at the denominator. Can you divide by zero?' :
      `Start by dividing ${a} by ${b}. To turn that decimal into a percentage, multiply it by 100.`;
    if (BigInt(b) === 0n) return `${a}/${b} has no percentage because division by zero is undefined.`;
    const ratio = decimal(a, b, 1n);
    const {value, approximate} = decimal(a, b, 100n);
    const steps = ratio.approximate ? `(${a} ÷ ${b}) × 100 ${approximate ? '≈' : '='} ${value}.` :
      `${a} ÷ ${b} = ${ratio.value}, then ${ratio.value} × 100 = ${value}.`;
    return `${a}/${b} is ${approximate ? 'approximately ' : ''}${value}%.\n\n${why ? 'Percent means “out of 100”. ' : ''}${steps}`;
  }
  return null;
}

// A language model must never guess at a percentage calculation. Route
// separate conversions and an explicitly requested total to exact arithmetic.
export function percentageHelp(question, previousConversion) {
  const exact = fractionAnswer(question, previousConversion);
  if (exact !== null) return exact;
  const lines = question.trim().split(/\s*(?:\r?\n|;)\s*/).filter(Boolean);
  if (lines.length > 1) {
    const corrections = lines.map(line => fractionAnswer(line, previousConversion));
    if (corrections.every(Boolean)) return corrections.join('\n\n');
  }
  const input = clean(question);
  const found = [...input.matchAll(/(?<![\w/.-])(-?\d{1,9})\s*(?:\/|out of|over)\s*(-?\d{1,9})(?![\w/]|\.\d)/g)];
  const labels = found.map(m => m[1] + '/' + m[2]);
  const intent = /percent|per cent|%/.test(input) ||
    previousConversion && /^(?:and |what about |how about )?[-\d][\d /,and?+.-]*$/.test(input);
  if (!intent || !found.length) return null;
  if (/\b(?:hint|clue)\b/.test(input) && !/\bno hints?\b/.test(input))
    return 'Divide the top number of each fraction by its bottom number. Multiply each decimal by 100.';
  const precision = /(?:to |rounded? (?:to )?)(zero|one|two|three|four|[0-8]) decimal places?/.exec(input);
  const places = precision ? ({zero:0,one:1,two:2,three:3,four:4}[precision[1]] ?? Number(precision[1])) : 4;
  const format = (n,d) => {
    const result = decimal(n,d,100n,places);
    return (result.approximate ? 'approximately ' : '') + result.value + '%';
  };
  if (found.some(m => BigInt(m[2]) === 0n)) return 'A fraction with a zero denominator is undefined. It has no percentage.';
  // Relative percentages have their own base: "what percent of A is B?"
  const relative = new RegExp('^what percent(?:age)? of ' + fraction + ' is ' + fraction + '$').exec(input);
  if (relative) {
    const [,a,b,c,d] = relative.map((v,i) => i ? BigInt(v) : v);
    if (a === 0n) return 'A percentage relative to zero is undefined.';
    return `${c}/${d} is ${format(c*b,d*a)} of ${a}/${b}. Divide ${c}/${d} by ${a}/${b}, then multiply by 100.`;
  }
  const rest = input.replace(/(?<![\w/.-])-?\d{1,9}\s*(?:\/|out of|over)\s*-?\d{1,9}(?![\w/]|\.\d)/g, 'F')
    .replace(precision?.[0] || /$^/, '');
  const total = /\b(?:add|sum|total|combined|altogether)\b|F\s*\+\s*F/.test(rest);
  const anotherOperation = /\b(?:minus|subtract|change|increase|decrease|difference|times|product|of which|discount|multiply|ratio)\b|[=*÷×]|F\s*(?:of|\/|-)\s*F|\d/.test(rest);
  if (total && !anotherOperation && found.length > 1) {
    let n=0n, d=1n;
    for (const [,a,b] of found) { n=n*BigInt(b)+BigInt(a)*d; d*=BigInt(b); }
    return `${labels.join(' + ')} is ${format(n,d)}.\n\nAdd the fractions first, then multiply their sum by 100.`;
  }
  if (!anotherOperation && !/\b(?:of F is|F of|from F to|between|larger|smaller|more than|less than)\b/.test(rest)) {
    const unique = new Map(found.map(m => [m[1]+'/'+m[2], m]));
    return [...unique].map(([label,[,a,b]]) => `${label} is ${format(a,b)}.`).join('\n') +
      '\n\nFor each percentage, divide the top number by the bottom number and multiply by 100.';
  }
  return 'Which calculation do you want to check? You can enter a fraction such as ' + labels[0] +
    ' as a percentage, add two fractions, or ask what percentage one fraction is of another.';
}
