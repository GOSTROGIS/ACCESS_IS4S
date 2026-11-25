"""Shared pieces of the Intake 140 course pages: the page shell, the game sections and the data the games read."""
import json

import build_guides

FOOT = ('Study pages built from the Intake 140 course folder. Pictures are taken from the course documents named under each one. '
        'Audio is computer-read.')
ALL_GAMES = [('match', 'Picture match'), ('pairs', 'Match the pairs'), ('cards', 'Flashcards'), ('quiz', 'Quiz'),
             ('order', 'Put in order'), ('sort', 'Sort it')]
TEXT_GAMES = ALL_GAMES[2:]


def page(title, crumb_href, crumb, body, eyebrow):
    return build_guides.page(title, crumb_href, crumb, body, eyebrow, ('../study-guides/guide.css', 'course.css'), ' data-img="img/"', FOOT)


def terms(pairs, src):
    """Flashcards from (term, meaning) pairs, each naming its source."""
    return [{'t': a, 'd': b, 's': src} for a, b in pairs]


def game_data(cards, terms, quiz, steps, sorts):
    """What course.js reads: picture cards, flashcard terms, quiz items, order sets and sort sets."""
    return {'cards': cards, 'terms': terms, 'quiz': quiz, 'steps': steps,
            'sorts': [dict(s, items=[list(i) for i in s['items']]) for s in sorts]}


def games(data, kinds=ALL_GAMES):
    """The game sections and their data. course.js hides a game that has nothing to play."""
    return (''.join('<section class="game" data-game="%s" aria-label="%s"><p>Loading…</p></section>\n' % k for k in kinds) +
            '<script type="application/json" id="cd">%s</script>\n' % json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
