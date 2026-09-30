# Contributing to Breach & Defend

Thanks for your interest! Bug reports, rules fixes, accessibility improvements,
balance feedback from playtesting and new card ideas are all welcome.

## Before you start

- For anything larger than a small fix, [open an issue](https://github.com/FrodeHus/breach-and-defend/issues/new/choose)
  first so we can agree on the approach.
- Card designs and balance changes are judgement calls — please explain the
  reasoning and, ideally, the playtest that motivated them.
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

Requirements: [Node.js](https://nodejs.org/) 22 or newer. There are no npm
dependencies and no build step: `public/` is both the source and the published
site.

```sh
git clone https://github.com/FrodeHus/breach-and-defend.git
cd breach-and-defend
npm start   # serves the game at http://127.0.0.1:4173
npm test    # rules, tutorial and 100 simulated matches
npm run typecheck   # checks the files marked // @ts-check (downloads TypeScript)
```

Edit files in `public/` and refresh the browser.

## Making changes

1. Fork the repo and create a branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep the rules engine (`public/engine.mjs`) independent of the UI.
3. Add or update tests in `tests/` for rule and behaviour changes.
4. Run `npm test` and `npm run typecheck`. Both must pass.
5. Check the change in a browser, including keyboard navigation and a narrow
   (mobile) viewport if you touched the UI.
6. Open a pull request and fill in the template.

### Style

- Match the surrounding code: ES modules, no frameworks, no npm dependencies.
  The only runtime third-party script is PeerJS (loaded from a pinned CDN URL
  in `public/net.mjs`) for play-a-friend; avoid adding more.
- Markup lives in view modules (`card-view.mjs`, `arena-view.mjs`, `library.mjs`,
  `versus-ui.mjs`, …) as pure functions of the UI state, so they can be tested
  in Node. `app.mjs` owns the state and handles events by delegation on `#app`;
  give new controls an `id` or `data-` attribute and add a handler there.
  Escape anything that is not fixed card data with `esc` from `html.mjs`.
- Respect `prefers-reduced-motion` for new animations.
- Use native, keyboard-operable elements (`<button>`, `<dialog>`) for controls.

### Artwork

New or changed card art must be original and compatible with
[CC BY-NC 4.0](LICENSE-ASSETS.md). Do not submit images from other games,
franchises or stock sites. If the art is AI-generated, add the prompt to
`docs/art-prompts/`. Ship `.webp` files sized like the existing ones in
`public/art/cards/`.

## Licensing of contributions

By submitting a pull request you agree that your code is licensed under the
[MIT License](LICENSE) and any artwork or game content under
[CC BY-NC 4.0](LICENSE-ASSETS.md).
