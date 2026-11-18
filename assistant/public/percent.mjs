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

function clean(question) {
  return question.toLowerCase().replace(/[’']/g, '').replace(/[⁄∕]/g, '/').replace(/−/g, '-')
    .replace(/[,?!;.\s:]*(?:im |i am )(?:really |so )?(?:confused|stuck|lost)\b[\s.!?:()]*$/, '')
    .replace(/^(?:please\s+)?(?:(?:can|could|would) you (?:please )?(?:help me (?:to )?)?|help me (?:to )?)/, '')
    .replace(/^figure out /, 'find ').replace(/(?:\s+please)?[.?!:\s()]*$/, '')
    .replace(/\s+/g, ' ').trim();
}

function percentage(a, b) {
  const scale = 10000n;
  const numerator = BigInt(a) * 100n * scale;
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
  const withoutHint = input.replace(/^(?:give me |i(?:d like| want) )?(?:only |just )?(?:a |one )?hint (?:for|on) (?:converting )?/, '')
    .replace(/[,.!? ]+(?:(?:please )?(?:just |only )?a hint|hint only)$/, '');
  const hint = withoutHint !== input;
  input = withoutHint;
  const candidates = previousConversion ? [...patterns, shortFollowup] : patterns;
  for (const pattern of candidates) {
    const match = pattern.exec(input);
    if (!match) continue;
    const [, a, b] = match;
    if (hint) return BigInt(b) === 0n ? 'Look at the denominator. Can you divide by zero?' :
      `Start by dividing ${a} by ${b}. To turn that decimal into a percentage, multiply it by 100.`;
    if (BigInt(b) === 0n) return `${a}/${b} has no percentage because division by zero is undefined.`;
    const {value, approximate} = percentage(a, b);
    return `${a}/${b} is ${approximate ? 'approximately ' : ''}${value}%.\n\nDivide ${a} by ${b}, then multiply by 100. (${a} ÷ ${b}) × 100 ${approximate ? '≈' : '='} ${value}.`;
  }
  return null;
}
