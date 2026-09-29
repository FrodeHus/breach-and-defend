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
- Opt-in interactive first-play tutorial, quick tips, searchable card library, field guide, and match recap with security lessons.
- Responsive layout and native keyboard-operable buttons and dialogs.
- Animated hover and keyboard-focus previews for hand cards, opening hands, and the card library, with specific explanations when a card cannot be played.

## Run locally

Install Node.js, then run `node serve.cjs` from this directory. Open the printed local URL. No npm dependencies, remote AI service, or API key is required. The game uses JavaScript modules and should be served over HTTP rather than opened as a file.

Run the rule and tutorial checks with `npm test`.

## Publish to GitHub Pages

The workflow in `.github/workflows/pages.yml` runs all tests using Node.js 24 and publishes only `dist/`. It runs automatically on pushes to `main`, or manually from **Actions → Publish game to GitHub Pages → Run workflow**. Only runs on `main` can deploy.

Before the first deployment, select **Settings → Pages → Build and deployment → Source → GitHub Actions** in the repository. Commit and push the workflow along with the game files, then use the deployment link shown in the workflow run. No custom secrets, dependency installation, or build command are required. Relative asset paths support GitHub Pages repository URLs.

See [GitHub’s custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for repository configuration.

## Guided first game

Check **Guide my first game** before choosing either faction. It starts unchecked and is never enabled automatically for later matches. Six lessons track keeping a hand, playing infrastructure, deploying a unit, passing or responding, attacking, and defending. Highlighted cards and controls show what to do next; lessons advance from actual game actions.

The guide pauses your first pending-effect priority window so you can read before passing. It adapts to your real hand and available moves, so lessons may span several turns or occur in a different order. **Exit tutorial** is available on the board and in card dialogs and continues the same match without guidance. Existing quick tips and the field guide remain available independently.

## Browse and play cards

Hover a visible card in your hand, opening hand, either battlefield, or card library to lift out an enlarged preview with its full rules, cost, stats, and keyword explanations. Tab focus also opens previews; Escape dismisses them. Previews stay within the screen edges and respect reduced-motion preferences. Clicking still opens the card details and play options; touch players can continue to tap cards.

Drag a card from your hand (or its enlarged preview) onto **Your battlefield** to play it. The battlefield highlights while dragging; blocked cards explain their unmet requirements. Cards needing a target open the target picker before payment. Release elsewhere or press Escape to cancel. Horizontal touch swipes still scroll the hand; tap-to-play and keyboard controls remain available.

Hand previews and card details show every unmet play requirement, including required versus ready compute, main-phase timing, priority, pending effects, and the specific kind of missing target. These explanations use the same checks that validate playing the card and update with the current match state.

## Deliberate simplifications

This is not a full Magic rules implementation. Compute is one generic resource and is paid automatically. Upkeep gains resolve automatically without triggered-ability responses. Combat damage is assigned automatically in the order blockers were assigned, lethal damage first. No colored mana, planeswalkers, first strike, tokens, exile, sideboards, deck editor, multiplayer, or saved matches are included. Reloading resets the current match.

The computer uses a local heuristic. It knows its own hand and the public battlefield, not the player's hidden cards. The user always takes the first turn. Starter balance and the 15–25 minute target duration need human playtesting.

## Validation

`npm test` covers the rules, including 100 seeded complete matches with card-count conservation and no deadlocks, plus tutorial opt-in, exit, progression for both factions, unavailable moves, and early match endings. The simulation uses different policies for the two players and is a correctness check, not proof of competitive balance. Tutorial browser checks cover the unchecked default, both factions, mulligans, resource play, unit casting, priority, desktop/mobile layout, and exiting with mouse and keyboard.

## Source layout

- `dist/cards.mjs`: card definitions, lessons, deck lists, and keyword glossary.
- `dist/engine.mjs`: rules and computer strategy, independent of the interface.
- `dist/app.mjs`: arena, tutorial, library, guide, dialogs, and optional WebMCP tools.
- `dist/tutorial.mjs`: lesson progress and contextual guidance, independent of rendering.
- `dist/tutorial.css`: opt-in panel, lesson checklist, and action highlights.
- `dist/card-preview.mjs` and `dist/card-preview.css`: hover/focus preview interactions and positioning.
- `dist/card-drag.mjs` and `dist/card-drag.css`: hand-to-battlefield dragging and drop feedback.
- `dist/style.css`: layout and visual design.
- `dist/art/`: generated artwork used by the cards.
- `art-prompts.json`: exact final prompts used with the built-in image generation tool.
- `tests/engine.test.mjs`: rules and match simulation checks.
- `tests/tutorial.test.mjs`: tutorial progression against the real rules engine.
- `tests/playability.test.mjs` and `tests/card-preview.test.mjs`: play-requirement explanations and preview placement.

## Learning references

Card effects are simplified game mechanics, not technical instructions or universal guarantees. Useful primary references are linked in the field guide:

- https://www.cisa.gov/stopransomware/ransomware-guide
- https://www.cisa.gov/sites/default/files/2023-01/fact-sheet-implementing-phishing-resistant-mfa-508c.pdf
- https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-278a
- https://magic.wizards.com/en/rules

Independent educational game; not affiliated with or endorsed by Wizards of the Coast. AI artwork was generated with the built-in image tool. The source does not include third-party Magic card images, symbols, or frames.
