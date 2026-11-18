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
    .replace(/\b(one|two|three|four|five|six|seven|eight|nine)[ -](half|halves|third|quarter|fourth|fifth|sixth|seventh|eighth|ninth|tenth)s?\b/g,
      (_, top, bottom) => numerators[top] + '/' + denominators[bottom])
    .replace(/^(?:it|(?:the |my )?(?:tutor|assistant|guide)) (?:said|says|told me) (?:that )?/, '')
    .replace(/[.,!? —-]+(?:is (?:that|this|it) (?:right|correct)|really)[?! .]*$/, '')
    .replace(/[,?!;.\s:]*(?:im |i am )(?:really |so )?(?:confused|stuck|lost)\b[\s.!?:()]*$/, '')
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you (?:please )?(?:help me (?:to )?)?|help me (?:to )?)/, '')
    .replace(/^figure out /, 'find ').replace(/(?:\s+please)?[.?!:\s()]*$/, '')
    .replace(/\s+/g, ' ').trim();
}

function decimal(a, b, multiplier) {
  const scale = 10000n;
  const numerator = BigInt(a) * multiplier * scale;
  const denominator = BigInt(b);
  const absolute = n => n < 0n ? -n : n;
  const n = absolute(numerator), d = absolute(denominator);
  const rounded = (2n * n + d) / (2n * d);
  const sign = (numerator < 0n) !== (denominator < 0n) && rounded !== 0n ? '-' : '';
  const decimals = String(rounded % scale).padStart(4, '0').replace(/0+$/, '');
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
