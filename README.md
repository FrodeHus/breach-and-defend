# Breach & Defend — Foundations

A playable browser prototype for cybersecurity learning, inspired by Magic-style card-game structure. Play red or blue against a local computer opponent.

## Included

- 50 original card designs: 25 for each faction.
- Two fixed 60-card decks, each with 24 infrastructure, 24 units, and 12 other cards.
- Eight original AI illustrations shared by related card families, with an illustration on every card.
- Original daylight battlefield, two transparent faction emblems, and two faction card backs used on deck piles and 3D flip animations.
- Opening-hand mulligans; one infrastructure per turn; automatic resource payment; turn phases; priority and a last-in-first-out effect stack.
- Attacking, blocking, multiple blockers, simultaneous damage, summoning sickness, haste, vigilance, flying, reach, lifelink, trample, and defender.
- Target validation, counterspells, temporary modifiers, discard and recovery, defeat at zero capacity, and deck-out losses.
- Tutorial prompts, searchable card library, field guide, and match recap with security lessons.
- Responsive layout and native keyboard-operable buttons and dialogs.

## Run locally

Install Node.js, then run `node serve.cjs` from this directory. Open the printed local URL. No npm dependencies, remote AI service, or API key is required. The game uses JavaScript modules and should be served over HTTP rather than opened as a file.

Run the rule checks with `node --test tests/engine.test.mjs`.

## Deliberate simplifications

This is not a full Magic rules implementation. Compute is one generic resource and is paid automatically. Upkeep gains resolve automatically without triggered-ability responses. Combat damage is assigned automatically in the order blockers were assigned, lethal damage first. No colored mana, planeswalkers, first strike, tokens, exile, sideboards, deck editor, multiplayer, or saved matches are included. Reloading resets the current match.

The computer uses a local heuristic. It knows its own hand and the public battlefield, not the player's hidden cards. The user always takes the first turn. Starter balance and the 15–25 minute target duration need human playtesting.

## Validation

15 automated rule tests passed, including 100 seeded complete matches with card-count conservation and no deadlocks. The simulation used different policies for the two players and is a correctness check, not proof of competitive balance. Browser checks cover opening hands, mulligans, resource play, phase progression, card inspection, library filtering, and the optional browser-agent start/read tools.

## Source layout

- `dist/cards.mjs`: card definitions, lessons, deck lists, and keyword glossary.
- `dist/engine.mjs`: rules and computer strategy, independent of the interface.
- `dist/app.mjs`: arena, tutorial, library, guide, dialogs, and optional WebMCP tools.
- `dist/style.css`: layout and visual design.
- `dist/art/`: generated artwork used by the cards.
- `art-prompts.json`: exact final prompts used with the built-in image generation tool.
- `tests/engine.test.mjs`: rules and match simulation checks.

## Learning references

Card effects are simplified game mechanics, not technical instructions or universal guarantees. Useful primary references are linked in the field guide:

- https://www.cisa.gov/stopransomware/ransomware-guide
- https://www.cisa.gov/sites/default/files/2023-01/fact-sheet-implementing-phishing-resistant-mfa-508c.pdf
- https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-278a
- https://magic.wizards.com/en/rules

Independent educational game; not affiliated with or endorsed by Wizards of the Coast. AI artwork was generated with the built-in image tool. The source does not include third-party Magic card images, symbols, or frames.
