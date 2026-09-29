# Start here

This is the complete editable project exported on 2026-09-29, including the new logo/header and the corrected infrastructure stacks. Published source commit: 128187ceb300cb2a4462c3b92408ce129961906c.

## Local development

1. Extract this ZIP.
2. Install Node.js 22 or newer.
3. Open a terminal in this folder and run `npm start` (or `node serve.cjs`).
4. Open http://127.0.0.1:4173/ . Stop with Ctrl+C.
5. Run `npm test` to check the rules and 100 simulated matches.

No npm install, API key, database, build step, or Sites account is required. Edit the files inside dist directly and refresh your browser. dist is the actual source for this buildless app, not disposable generated output. Google Fonts is the only external font request; system fallbacks are provided. Match state resets when you refresh.

## Put it on GitHub

Create an empty GitHub repository (without an initial README). In this extracted folder:

```sh
git init -b main
git add .
git commit -m "Import Breach and Defend"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the uppercase placeholders. GitHub will handle authentication through your configured Git client. Do not paste tokens into source files.

## Publish with GitHub Pages

In the GitHub repository, open Settings > Pages and select GitHub Actions as the build/deployment source. Open Actions > Publish game to GitHub Pages > Run workflow. Subsequent pushes to main redeploy automatically. The workflow runs the tests, then publishes only dist. The Actions run and Pages settings show your URL. Use a public repository for GitHub Free Pages, or an eligible paid plan for private repositories.

The game uses relative asset paths, so it works under a repository subpath. No base URL edit is required. The .openai/hosting.json file records the existing Sites deployment but is not needed by GitHub Pages; it is included for completeness. No domain has been configured or purchased. Custom domains can be set later in GitHub Pages settings.

Official instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Optional: preserve the original Git history

The ZIP includes repo-history.bundle rather than a machine-specific .git directory. To restore the history, run from the extracted folder:

```sh
git clone repo-history.bundle ../breach-defend-with-history
```

Copy package.json, .gitignore, START-HERE.md, logo-prompt.txt, and the .github folder from this export into that new checkout and commit them. Those portability additions were made for this download after the live source snapshot. In the new checkout, run `git branch -M main`, then `git remote set-url origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git` and `git push -u origin main`. The bundle itself is ignored to avoid committing a duplicate history archive.

## Where to edit

- dist/cards.mjs: card definitions, costs, effects, security lessons, starter decks.
- dist/engine.mjs: game rules and computer strategy.
- dist/app.mjs: screens, interactions and rendered card stacks.
- dist/motion.mjs: dealing, combat and other visual animations.
- dist/style.css: base styles and responsive layout.
- dist/arena.css: compact battlefield, readable labels and infrastructure piles.
- dist/header.css: logo and navigation header, including compact match mode.
- dist/index.html: entry page and header markup.
- dist/art/: all 14 PNG assets, including the original logo.
- tests/engine.test.mjs: rule and simulation tests.
- *prompts*: artwork generation provenance.

The project has no chosen open-source license; add an appropriate LICENSE before offering reuse permissions to others. It is an independent educational game, not an official Magic product.
