# Two-player mode via invite link — design

Date: 2026-09-29
Status: Draft for review

## Goal

Let a player create a match, share a link, and play Breach & Defend against another person in a different browser. The game must stay a static site on GitHub Pages: no backend, no API keys, no build step.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Transport | Peer-to-peer WebRTC via PeerJS, using the free public PeerJS signaling server |
| Authority | Host browser runs the only real `Game`; guest sends intents |
| Disconnects | Either player can reload/reconnect and continue; state persisted in `localStorage` |
| Factions | Host picks faction when creating the invite; guest gets the other |
| First player | Random, derived from the jointly generated match seed (see Fair play) |
| Clocks | 90 s per turn for the active player; 20 s per response window for the non-active player; fixed, not configurable |
| Fair play | Guest cannot cheat (never holds hidden state). Host tampering with shuffles, hands, or state is detected by a post-match replay audit. Both players must accept an "Honor game" pledge before the match starts. |
| Out of scope | Chat, spectators, matchmaking, rematch history, configurable clocks, TURN relay, tutorial and AI in multiplayer |

## Constraints discovered in the code

- `dist/app.mjs` assumes the local human is `players[0]` (136 references to `game.`, most with index 0) and that player 1 is the computer (`schedule()` calls `game.aiAction()`).
- `Game.mulligan()` / `keep()` only handle player 0; `actor()` returns 0 during `opening`.
- `Game` constructor always makes player 0 active.
- Log text is baked at write time via `label(p)` → `'You' | 'Computer'` and `p===0 ? "play" : "plays"`.
- `Game` state is plain data except `this.random`, so it can round-trip through JSON.
- `app.mjs` already auto-passes when the human has no legal response; that behavior is kept.

## Architecture

```
 Host browser                                   Guest browser
┌───────────────────────────────┐             ┌───────────────────────────┐
│ app.mjs (players[0] = host)   │             │ app.mjs (players[0] = me) │
│   │ intents      ▲ view       │             │   │ intents     ▲ view    │
│   ▼              │            │  PeerJS     │   ▼             │         │
│ match.mjs (referee) ──────────┼─ DataConn ──┼─ remote.mjs (proxy Game)  │
│   │ Game, clocks, persistence │             │   localStorage: token     │
│   ▼                           │             └───────────────────────────┘
│ engine.mjs Game               │
│ localStorage: match snapshot  │
└───────────────────────────────┘
```

### New units

**`dist/net.mjs`** — transport only. Wraps PeerJS.
- `hostPeer(matchId)` registers peer ID `bnd-<matchId>`; retries with backoff if the ID is still held by a previous session of the same tab (PeerJS keeps IDs briefly after disconnect).
- `joinPeer(matchId)` connects to `bnd-<matchId>` with a random guest peer ID.
- Exposes `send(msg)`, `onMessage`, `onOpen`, `onClose`; reconnects automatically with backoff.
- Knows nothing about the game. A `FakeTransport` pair with the same interface is used in tests.
- PeerJS is loaded from cdn.jsdelivr.net with a pinned version and `integrity` attribute. If it fails to load, "Play a friend" shows an error and the single-player game is unaffected.

**`dist/match.mjs`** — host-side referee. Pure logic plus injected `now()` and `setTimeout`, so it runs under `node --test`.
- Owns the `Game`, the clocks, the guest token, and persistence.
- `applyIntent(player, intent)` validates that `player === game.actor()` (or the relevant opening-hand player) before calling the engine; otherwise rejects.
- `viewFor(player)` builds the state that player may see (see Data flow).
- Saves a snapshot to `localStorage` after every accepted intent and every clock tick boundary.
- Used by the host's `app.mjs` for its own moves too, so both players go through the same validation and clock code.

**`dist/remote.mjs`** — guest-side proxy with the same surface `app.mjs` already uses.
- Holds a `Game` rebuilt from the latest view via `Game.fromJSON`, so read-only queries the UI already calls (`legal`, `playIssues`, `targets`, `stats`, `actor`, `canAttack`, `canBlock`, `mana`) work unchanged.
- Mutating calls (`play`, `pass`, `attackers`, `blockers`, `discard`, `mulligan`, `keep`) send an intent and resolve when the next view arrives, or reject with the host's error message (shown via the existing `toast`).
- Because the guest's view is already flipped so the guest is `players[0]`, `app.mjs` needs no per-index changes for the guest.

**`dist/audit.mjs`** — guest-side replay verifier. Pure function `audit({seedCommit, hostSecret, guestSecret, log, viewHashes, sentIntents})` → `{result: 'verified' | 'tampered' | 'unverified', turn?, reason?}`. Reuses `Game` and `match.viewFor` so the replay applies exactly the host's rules and redaction.

### Engine changes (`dist/engine.mjs`)

1. **Constructor options**: `new Game(faction, random, {first = 0, labels = 'solo'})`. `first` sets `active`/`priority` after the opening. `labels: 'factions'` makes log text perspective-neutral ("Red plays Phishing Kit", "Blue untaps and begins upkeep") so the same log reads correctly for both players.
2. **Two-player opening**: `mulligan(p = 0)` and `keep(bottom, p = 0)` act per player; `mulligans` becomes per-player; phase leaves `opening` only when every human player has kept. In solo mode the computer's hand is auto-kept exactly as today. `actor()` during opening returns the lowest-index player who has not kept.
3. **Seeded randomness**: new `dist/rng.mjs` exports `seededRandom(seedBytes)` (sfc32 from a 128-bit seed) returning a function with a serializable `.state`. Solo mode keeps `Math.random`.
4. **Serialization**: `toJSON()` returns plain state including the RNG state when seeded; `static fromJSON(obj)` rebuilds a `Game` with the RNG resumed at the same point, so a restored match replays identically.
5. `aiAction()` is untouched; multiplayer simply never calls it.

Solo-mode defaults keep existing behavior and all existing tests passing.

### `app.mjs` changes

- Arena start screen gains **Play a friend** next to the faction buttons. It asks for faction, creates the match, and shows the invite panel.
- Invite panel: link, **Copy link** button, **Share** via `navigator.share` when available, and "Waiting for opponent…".
- Opening `#join=<matchId>` shows "Joining match…", then the Honor game modal, then the opening-hand screen.
- Match recap shows the audit result (see Fair play).
- `schedule()` skips `aiAction()` in multiplayer; the existing no-legal-response auto-pass still applies to the local player.
- Header shows both clocks, a connection indicator, and the opponent's faction.
- Tutorial checkbox is hidden in multiplayer. Library and Field guide remain available; opening them does not pause the clock.
- **Leave match** concedes (sends a `concede` intent if connected) and clears local state.

## Data flow

### Invite link and identity

- `matchId`: 16 random base32 characters from `crypto.getRandomValues`.
- Host's own URL becomes `…/#host=<matchId>`; invite link is `…/#join=<matchId>`. Using the hash keeps GitHub Pages serving `index.html` with no 404 handling.
- On first join the host issues a random `guestToken`; the guest stores it under `bnd:<matchId>`. Later joins must present it. A join without the token while a guest is bound gets "This match already has two players."
- The host likewise issues a `hostToken` to the guest at first join; after a host reload, the host sends it in its hello so the guest can reject an impostor that registered the same peer ID while the host was offline.

### Messages (JSON over the PeerJS DataConnection)

| Direction | Type | Payload |
|---|---|---|
| guest → host | `hello` | `{guestToken?}` |
| host → guest | `welcome` | `{guestToken, hostToken, seedCommit}` (first join) or `{view, log}` (rejoin) or `{error}` |
| guest → host | `seed` | `{guestSecret}` (first join only) |
| both | `pledge` | `{}` — player accepted the Honor game |
| host → guest | `start` | `{view}` once both pledged |
| host → guest (reconnect) | `hello` | `{hostToken}` |
| guest → host | `intent` | `{seq, type, …args}` — `type` ∈ `play, pass, attackers, blockers, discard, mulligan, keep, concede` |
| host → guest | `view` | `{ackSeq?, error?, entry, view}` — `entry` is the new action-log entry |
| host → guest | `reveal` | `{hostSecret}` when the match ends |

Every accepted host or guest action (including clock-expiry actions) appends one action-log entry and sends one new `view` to the guest. Intents carry a `seq` so a retried intent after reconnect is not applied twice.

### What each player sees

`viewFor(p)` returns `game.toJSON()` transformed as follows:
- **Redacted**: opponent's hand becomes `[{uid: null, hidden: true}, …]` of the same length; both decks become counts only (deck order is secret to both players).
- **Flipped** (guest only): swap `players[0]`/`players[1]` and map every player index (`active`, `priority`, `winner`, `stack[].p`, `targets[].p`, `first`, per-player mulligan fields) with `p → 1 − p`. Card `uid`s are global and not remapped.
- **Clocks**: `{turnDeadline, responseDeadline, paused}` as epoch-ms; the guest renders countdowns locally.

Intents from the guest are un-flipped (`p → 1 − p` on any player index, e.g. a player target) before validation.

## Fair play

### Honor game modal

Shown to both players after the guest connects and before the opening hand. Neither the game nor any clock starts until both have accepted. Tone is playful and on-theme; draft copy (final wording polished in implementation):

> **An honor game**
>
> This is a hacking game running in a web browser. Of course it can be hacked — devtools are one keypress away, and you both know it.
>
> So here's the deal: no peeking at hidden cards, no editing the page, no stacking the deck. Red team, keep your exploits on the cards. Blue team, prove the controls work.
>
> When the match ends, it is audited: tampering with the deck or the game state shows up in the recap. Peeking doesn't — that part runs on honor.
>
> [ I solemnly swear to play fair ]  [ Leave match ]

After accepting, a player sees "Waiting for your opponent to take the pledge…". Choosing Leave ends the match for both. The modal is shown once per match; reconnecting does not re-show it. It is a `<dialog>` like the existing modals, keyboard operable, and shown to screen readers as a dialog with a heading.

### Jointly generated seed (commit–reveal)

1. On first guest join, host picks a random 128-bit `hostSecret` and sends `seedCommit = SHA-256(hostSecret)`.
2. Guest replies with its own random `guestSecret`. Because the host already committed, it cannot pick a `hostSecret` to steer the result after seeing the guest's value.
3. Host computes `seed = SHA-256(hostSecret ‖ guestSecret)` and creates the `Game` with `seededRandom(seed)`. The first player is derived from the seed too, so the "random roll" is fair.
4. Guest stores `seedCommit` and `guestSecret`.

SHA-256 uses `crypto.subtle`, which is available on GitHub Pages (HTTPS) and on `localhost`.

### Action log and audit

- The host appends every applied action to a log: `{n, by: 0|1, type, args, timeout: bool}` in un-flipped (host) indices. Each entry is sent to the guest with the resulting view; the guest persists all entries plus `SHA-256` of each received view.
- When the match ends (win, loss, concede, or deck-out) the host sends `reveal {hostSecret}`.
- The guest's browser then audits:
  1. `SHA-256(hostSecret) === seedCommit`.
  2. Rebuild `seed`, create a fresh `Game`, replay the log in order. Any illegal action fails the audit.
  3. After each step, compute `viewFor(guest)` and compare its hash with the hash of the view actually received at that step.
  4. Every log entry with `by: guest` and `timeout: false` must match an intent the guest actually sent (by `seq`).
- Recap shows one of: **Verified — fair match**, **Tampering detected at turn N** (with what diverged: deck order, hand, life, or illegal action), or **Unverified** (host left without revealing, or the guest's saved log is incomplete, e.g. after clearing site data).
- The guest shares its verdict with the host (`audit {result}`) so both recaps show the same outcome.

What the audit catches: stacked or re-ordered decks, altered hands or life totals, actions the host never legally could have taken, forged guest actions. What it cannot catch: the host looking at the guest's hand in devtools, or the host deliberately letting its own clock run out. The guest cannot cheat in the first place.

### Clocks

- **Opening**: 60 s for each player to keep; on expiry the host keeps for them, bottoming the highest-cost cards if a mulligan was taken.
- **Turn clock (90 s)**: runs while the active player is the actor. It is per turn, not per decision.
- **Response clock (20 s)**: restarts each time the non-active player becomes the actor; the turn clock is paused meanwhile.
- **On expiry** the host acts for the timed-out player: priority → `pass`; attack → no attackers; block → no blockers; cleanup → discard highest-cost cards. After the turn clock expires, the active player is auto-passed for the rest of that turn.
- **Pause**: both clocks pause while the guest is disconnected, and resume with the remaining time. While the host is offline nothing runs, and saved remaining time resumes on restore.

### Persistence and reconnect

- Host stores `bnd:<matchId>` = `{role:'host', game: toJSON(), clocks (remaining ms), guestToken, hostToken, seq}` after each change. Reloading `#host=<matchId>` restores it and re-registers the peer ID.
- Host snapshot also includes `hostSecret`, `guestSecret`, and the action log.
- Guest stores `{role:'guest', guestToken, hostToken, seedCommit, guestSecret, log, viewHashes, sentIntents}`. Reloading `#join=<matchId>` reconnects; the host resends the log from the guest's last known entry and a fresh view.
- Snapshots are removed when the match ends or the player leaves. Snapshots older than 7 days are pruned on load.
- `localStorage` access is wrapped in try/catch; if unavailable, the match still works but cannot survive a reload, and the invite panel says so.

## Error handling

| Situation | Behavior |
|---|---|
| PeerJS script or signaling server unreachable | "Couldn't reach the matchmaking server. Try again, or play the computer." |
| WebRTC connection can't be established (strict NAT/firewall; no TURN) | After 20 s: "Couldn't connect to your opponent directly. Some networks block peer-to-peer games." |
| Opponent disconnects mid-match | Banner "Opponent disconnected — waiting for them to return"; clocks paused; **Leave match** available. No automatic forfeit. |
| Host's peer ID still held after reload | Retry with backoff for up to 30 s, then show the error with a retry button. |
| Join link for unknown/finished match | "This match isn't available. Ask your friend for a new link." |
| Third person opens the link | "This match already has two players." |
| Illegal intent (race, stale view) | Host rejects with engine's error message; guest shows it via `toast` and re-renders from the host's current view. |
| Guest clock drift | Deadlines come from the host; guest display is advisory; the host alone enforces expiry. |

## Known limitations

- The host's browser holds full game state. Tampering is detected after the match, not prevented, and peeking at the guest's hand is undetectable. The Honor game pledge covers the rest.
- No TURN relay, so some corporate or mobile networks will fail to connect.
- The public PeerJS server has no uptime guarantee.
- If the host clears site data, the match is lost.

## Testing

All under `node --test`, no new dependencies.

- **rng**: same seed → same sequence; state save/restore continues the sequence.
- **engine**: `first` option; per-player mulligan/keep and opening flow; `toJSON`/`fromJSON` round trip mid-combat and with a non-empty stack, including identical subsequent shuffles; `labels:'factions'` log text; existing 100-match simulation also run with `first = 1` and both players keeping via the new API.
- **audit**: an honest full match verifies; each tampering kind is detected at the right turn — reordered deck, swapped hand card, edited life, injected illegal action, forged guest action, wrong `hostSecret`; missing reveal → Unverified.
- **pledge**: game and clocks do not start until both pledge; Leave from the modal ends the match for both; not re-shown on reconnect.
- **match** (with `FakeTransport` and fake clock): guest cannot act out of turn or for the host; redaction leaks no opponent hand `id`/`uid` or deck order; flip is its own inverse and targets map correctly; every clock expiry case; pause on disconnect; `seq` de-duplication; token checks for third party and impostor host; save → restore → continue produces the same state.
- **remote**: read-only queries answer from the flipped view; mutating calls send intents and reject with host errors.
- **Full match**: two seeded policies play complete matches through host `match` ↔ `FakeTransport` ↔ guest `remote`, checking card-count conservation and no deadlocks, including a forced disconnect/reload of each side mid-match.
- **Manual browser check**: two browser profiles on `node serve.cjs` and on the deployed Pages URL — create, copy link, join, mulligans, a full turn each, reload host, reload guest, clock expiry, leave match.

## Documentation

Update `README.md`: remove "multiplayer" from the simplifications list, add a "Play a friend" section describing invite links, reconnect, clocks, and the limitations above.
