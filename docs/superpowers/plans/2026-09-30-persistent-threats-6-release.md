# Persistent Threats 6: Lore, Art, Guide, Lessons and Release — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Persistent Threats: every card and token gets lore and art, the Field Guide and optional in-match tips teach the new mechanics, hard-coded First Breach copy becomes set-aware, a playtest harness reports balance numbers, and the set is marked released.

**Architecture:** Content lives where First Breach's does: `LORE` in `public/lore.mjs` (tokens now read it too), art at `public/art/cards/<slug>.webp` with prompts in `art-source/cards/persistent-threats/generation-prompts.json`. A single `MECHANICS` glossary in `cards.mjs` feeds the Field Guide and card dialogs. Expansion tips extend the existing quick-tips panel and never appear in a First Breach match. Release is one flag (`SETS['persistent-threats'].released`) plus the tests that pinned it unreleased; it is the last task and waits for the author's art.

**Tech Stack:** Plain ES modules in `public/`, `node --test` (`npm test`), Prettier 3.9.9 (format only changed files), `npm run typecheck`. Art conversion uses macOS `sips` and `cwebp` (both installed).

**Spec:** `docs/design/persistent-threats.md` — "Lore and art", "Presentation and accessibility" (tutorial, Field Guide), "Opting in and mixing sets", "Balance review and release checks". Plan 5's Follow-ups (`docs/superpowers/plans/2026-09-30-persistent-threats-5-ui.md`) list what this plan picks up.

## Global Constraints

- **Lore:** `flavor` (a short in-world quote), `by` (the speaker), `learn` (a full learning paragraph). "Learning text explains the real concept and its defenses, never how to perform an attack. Where a mechanic abstracts reality (Reuse, Overclock, tokens), say so."
- **Art:** "Backdoor artwork uses a red access marker; Indicator uses a blue sealed record. Neither should look like a compute resource." "Red emphasizes concealed access routes, modular relays and coordinated operators; blue emphasizes evidence handling, observable systems and organized response. Six-cost units depict the coordinated operation rather than a physically larger person."
- **Art files:** 768×512 WebP at `public/art/cards/<slug>.webp`, slug = lower-case name with runs of non-alphanumerics turned into `-` (the rule in `add()`); PNG sources (1536×1024) at `art-source/cards/persistent-threats/<Card Name>.png` under Git LFS.
- **"The opt-in stays hidden until all 50 cards and both tokens have their lore and art."**
- **"The tutorial stays First Breach-only. Advanced mechanics get optional short lessons that are shown only in matches with Persistent Threats."**
- **"The Field Guide gains a Persistent Threats section. Its 'rules scope' section … update it so it stays accurate for both card pools."**
- **First Breach unchanged:** `tests/first-breach-golden.test.mjs` and every existing First Breach markup test pass unchanged. No expansion text appears in a First Breach match.
- **Never commit `public/cards.mjs` with `released: true` before Task 9.** Never use `git stash`. Commit messages are plain imperative sentences, no prefixes.
- **Art is supplied by the author:** agents write prompts, never generate images.

## Review Focus

1. **Lore with quotes, apostrophes or `<`** must render escaped in the lore panel, previews and recap, and never as "undefined" — Task 1 test renders every expansion entry through `lorePanel`.
2. **A First Breach match must never show expansion help** (glossary entries, tips) even when it contains cards whose text says "retire"-like words — Tasks 4 and 5 test First Breach cards and a First Breach game.
3. **Library search and filters must find tokens** ("backdoor" finds the Backdoor token; a Blue filter hides it) and must not count them as cards — Task 6 test.
4. **A mixed playtest matchup must really use a First Breach starter on one side** (60 First Breach cards, no expansion card in hand or deck) — Task 8 test.
5. **The longer header edition label must fit at 375px** without horizontal scroll — Task 6 test pins the text; the controller checks the width in the browser (Task 9).

## Files

| File | Responsibility |
|---|---|
| `public/lore.mjs` | 50 expansion entries plus `Backdoor` and `Indicator` (Tasks 1–2) |
| `public/cards.mjs` | tokens read lore (`loreOf`); `MECHANICS` + `mechanicsOf` (Task 4); `releasedTokens`, `edition` (Task 6); the release flag (Task 9) |
| `art-source/cards/persistent-threats/generation-prompts.json` (new) | 52 image prompts (Task 3) |
| `public/guide.mjs` | Persistent Threats section, set-aware eyebrow and rules scope (Task 4) |
| `public/arena-view.mjs` | glossary in the card dialog (Task 4); tips in `tutorialText` (Task 5) |
| `public/card-view.mjs` | glossary in the hover preview (Task 4) |
| `public/expansion-tips.mjs` (new) | `choiceTip`, `expansionTip` (Task 5) |
| `public/library.mjs`, `about.mjs`, `versus-ui.mjs`, `app.mjs`, `index.html`, `README.md` | set-aware copy, tokens in the library (Task 6) |
| `public/app.mjs`, `index.html`, `choices.mjs`, `expansion-view.mjs` | screen-reader announcements for rejected picks; `choiceIssue` (Task 7) |
| `tests/helpers/playtest.mjs`, `tests/helpers/playtest-cli.mjs` (new), `package.json` | balance harness and `npm run playtest` (Task 8) |
| `tests/pt-lore.test.mjs`, `tests/pt-art-prompts.test.mjs`, `tests/pt-playtest.test.mjs` (new), `tests/expansion-ui.test.mjs` | tests |

---

### Task 1: Red lore, Backdoor lore, and lore for tokens

**Files:**
- Modify: `public/lore.mjs` (append entries inside `LORE`)
- Modify: `public/cards.mjs` (`loreOf`, token lore, token lore check)
- Create: `tests/pt-lore.test.mjs`

**Interfaces:**
- Produces: `LORE[name]` for the 25 red expansion cards and `'Backdoor'`; tokens gain `flavor`, `flavorBy`, `lesson` like cards; `loreOf(name)` (module-private).

- [ ] **Step 1: Write the failing test**

Create `tests/pt-lore.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS, TOKENS} from '../public/cards.mjs';
import {LORE} from '../public/lore.mjs';
import {lorePanel} from '../public/lore-panel.mjs';

// Expansion cards and tokens of one faction.
const expansion = faction => [
  ...CARDS.filter(c => c.set === 'persistent-threats' && c.faction === faction),
  ...Object.values(TOKENS).filter(t => t.faction === faction),
];
// The design: where a mechanic abstracts reality (Reuse, Overclock, tokens), the learning text says so.
const ABSTRACTED = /\b(Reuse|Overclock)\b/;

function checkFaction(faction) {
  for (const c of expansion(faction)) {
    assert.ok(LORE[c.name], `${c.name} has lore`);
    assert.ok(c.flavor.length >= 15 && c.flavor.length <= 80, `${c.name} flavor length ${c.flavor.length}`);
    assert.ok(c.flavorBy.length >= 5 && c.flavorBy.length <= 30, `${c.name} speaker length ${c.flavorBy.length}`);
    assert.ok(c.lesson.length >= 200 && c.lesson.length <= 480, `${c.name} learning length ${c.lesson.length}`);
    if (c.token || ABSTRACTED.test(c.text)) assert.match(c.lesson, /in the game/, `${c.name} names its abstraction`);
    const html = lorePanel(c);
    assert.doesNotMatch(html, /undefined|arrive with its release/, `${c.name} renders its lore`);
  }
}

test('red Persistent Threats cards and the Backdoor token have lore', () => checkFaction('red'));

test('the lore panel escapes expansion lore', () => {
  const html = lorePanel({...TOKENS.backdoor, flavor: '"<b>"', flavorBy: '<i>', lesson: '<script>x</script>'});
  assert.doesNotMatch(html, /<script>|<b>|<i>/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/pt-lore.test.mjs`
Expected: FAIL — `Ghost Relay has lore` (no entry), and the Backdoor token has no `flavor`.

- [ ] **Step 3: Give tokens lore**

In `public/cards.mjs`, just above `export const TOKENS = {`, add:

```js
// A card's or token's lore fields, from LORE by name.
const loreOf = name => {
  const lore = LORE[name];
  return {flavor: lore?.flavor, flavorBy: lore?.by, lesson: lore?.learn};
};
```

In the `backdoor` literal add `...loreOf('Backdoor'),` after `art: 'cards/backdoor',`; in `indicator` add `...loreOf('Indicator'),` after `art: 'cards/indicator',`. Replace the line `for (const t of Object.values(TOKENS)) BY_ID[t.id] = t;` with:

```js
for (const t of Object.values(TOKENS)) {
  if (!t.lesson && SETS[t.set].released) throw Error(`${t.name} has no lore.`);
  BY_ID[t.id] = t;
}
```

Leave `add()` unchanged.

- [ ] **Step 4: Add the red lore**

In `public/lore.mjs`, before the closing `};` of `LORE`, add a `// Persistent Threats — red` comment and these entries (keep the existing entry format; Prettier will wrap):

```js
  'Ghost Relay': {
    flavor: 'Burn the relay before they map it. We have spares.',
    by: 'Infrastructure handler',
    learn:
      'Campaigns often rotate the servers and domains they rely on, abandoning one before defenders can block it. Rapidly changing infrastructure makes simple blocklists age quickly. Defenders respond with behavior-based detection, domain reputation and fast sharing of indicators, so each discarded relay still teaches them something about the campaign.',
  },
  'Reconnaissance Outpost': {
    flavor: 'Nothing here touches the target. Not yet.',
    by: 'Outpost analyst',
    learn:
      'Much reconnaissance happens without touching a target at all: public records, job postings, certificate logs and exposed service banners reveal a surprising amount. Organizations reduce this exposure by inventorying what they publish, limiting unnecessary detail, and checking their own attack surface the way an outsider would.',
  },
  'Attack Surface Mapper': {
    flavor: 'Every forgotten server is a door someone left unlocked.',
    by: 'Surface mapper',
    learn:
      'An attack surface is every system, service and account reachable from outside. Forgotten test servers, old subdomains and unmanaged cloud resources are common weak points because nobody patches what nobody knows about. Attack surface management gives defenders a continuous inventory, so exposed assets are found and fixed first.',
  },
  'Beachhead Scout': {
    flavor: 'Get one foot in. The rest of the body follows.',
    by: 'Entry team lead',
    learn:
      'Initial access is the first point where an intruder gets inside, often through one weak account, an unpatched edge device or a phishing message. Attackers treat it as a beachhead for everything after. Multi-factor authentication, prompt patching of internet-facing systems and alerts on unusual first logins make a single foothold much harder to keep quiet.',
  },
  'Staged Loader': {
    flavor: 'The first stage is harmless. That is the point.',
    by: 'Malware operator',
    learn:
      'Many infections arrive in stages. A small loader establishes itself first, then fetches a heavier payload later, so the first file looks almost harmless. Defenders counter staging with application allow-listing, endpoint detection that watches what a process does rather than what it looks like, and blocking unexpected downloads.',
  },
  'Dead-Drop Courier': {
    flavor: 'Leave it where everyone posts. No one reads the comments.',
    by: 'Courier contact',
    learn:
      'A dead drop hides instructions or data inside legitimate public services, such as a shared document or a social media profile, so malicious traffic blends in with ordinary use. Defenders look for unusual patterns, like a server reading a public page on a fixed schedule. Even a lost channel can reveal how a campaign communicates.',
  },
  'Access Broker': {
    flavor: 'I do not break in. I sell the keys to people who do.',
    by: 'Access broker',
    learn:
      'Initial access brokers specialize in getting into organizations and selling that access to other criminal groups, such as ransomware operators. One quiet compromise can later become a very loud attack. Monitoring for stolen credentials, removing stale accounts and investigating small intrusions promptly all reduce what a broker has to sell.',
  },
  'Dormant Implant': {
    flavor: 'Patience is a feature, not a bug.',
    by: 'Implant author',
    learn:
      'Persistence mechanisms let an intruder survive reboots and password changes, and some stay quiet for weeks before doing anything visible. Scheduled tasks, startup entries and new services are common hiding places. Defenders regularly review what starts automatically on their systems and compare it with a known-good baseline.',
  },
  'Living-off-the-Land Operator': {
    flavor: 'Why bring tools when the house already has them?',
    by: 'Intrusion operator',
    learn:
      'Living off the land means misusing tools that already exist on a system, such as scripting shells and administration utilities, instead of bringing obvious malware. Because the tools are legitimate, simple antivirus often ignores them. Defenders log how built-in tools are used, restrict who can run them, and alert on unusual command lines.',
  },
  'Redundant Handler': {
    flavor: 'Cut one line and the call comes in on another.',
    by: 'Campaign handler',
    learn:
      'Persistent campaigns often keep more than one way back in, like a second remote-access tool or a hidden account. Removing only the obvious foothold invites a quick return. Effective incident response scopes the whole intrusion first, removes every known access path at the same time, and keeps watching for reinfection afterwards.',
  },
  'Coordinated Intrusion Lead': {
    flavor: 'Three quiet doors at once make one loud problem.',
    by: 'Operations lead',
    learn:
      'Organized intrusion groups divide work across operators and coordinate timing, using several footholds together once the campaign is ready. Lateral movement from one system to others turns a small incident into a large one. Network segmentation, limited administrative access and alerts on unusual internal connections keep one machine from reaching the rest.',
  },
  'Long-Haul Campaign': {
    flavor: 'We measure this operation in quarters, not days.',
    by: 'Campaign director',
    learn:
      'Advanced persistent threats are well-resourced groups that pursue a target for months or years and return after setbacks. They combine visible attacks with quieter supporting access. Defending against them relies on layered controls, threat intelligence about their known behavior, and treating each incident as possibly part of a larger campaign.',
  },
  'Map Trust Relationships': {
    flavor: 'Their partner has a quieter door and a key to theirs.',
    by: 'Recon lead',
    learn:
      'Organizations trust suppliers, partners and connected domains, and those trust relationships can become routes in. An attacker who compromises a smaller partner may inherit its access. Defenders inventory third-party connections, limit what each partner can reach and review trust settings regularly. Reuse in the game represents mapping work paying off again later.',
  },
  'Seed Access': {
    flavor: 'Plant enough seeds and one of them will grow.',
    by: 'Access planner',
    learn:
      'Intruders often plant several small footholds early, such as extra accounts or access tokens, so losing one does not end the campaign. Each one is easy to miss on its own. Defenders review newly created accounts and credentials, alert on changes to privileged groups, and expire access that nobody can explain.',
  },
  'Coordinated Pressure': {
    flavor: 'Hit the same wall harder. It will give.',
    by: 'Pressure team',
    learn:
      'Some attacks succeed simply by applying more resources than a defense was built to absorb, such as a denial-of-service flood. Defenders plan capacity, use services that absorb traffic spikes, and rehearse escalation so a surge does not overwhelm them. Overclock in the game represents committing extra resources for a bigger effect.',
  },
  'Burn the Channel': {
    flavor: 'We will never use that route again. Make it count.',
    by: 'Operation lead',
    learn:
      'Attackers sometimes spend a valuable capability, such as an undisclosed vulnerability or a trusted channel, knowing it will be discovered once used. Afterwards defenders can patch, block and share details, so the same trick rarely works twice. Fast patching and shared threat intelligence make every burned channel expensive.',
  },
  'Cascading Outage': {
    flavor: 'Pull one dependency and watch the whole stack fall.',
    by: 'Disruption specialist',
    learn:
      'Modern systems depend on each other, so a failure in one shared service, such as sign-in or name resolution, can cascade into many outages at once, sometimes including the attacker’s own tools. Mapping dependencies and building redundancy for critical services limit how far a failure spreads. Overclock in the game represents a broader, costlier disruption.',
  },
  'Adaptive Payload': {
    flavor: 'Tell me what it runs on. I will ship the right module.',
    by: 'Payload engineer',
    learn:
      'Modular malware can download new components after infection and adapt to what it finds. The core stays small while its capability grows. Defenders watch for processes that suddenly load new code or contact new servers, and contain infected systems before extra modules arrive. Overclock in the game represents investing in a larger upgrade.',
  },
  'Exploit the Handoff': {
    flavor: 'Hit them during the shift change. Nobody owns the alert.',
    by: 'Timing specialist',
    learn:
      'Transitions create gaps: shift changes, maintenance windows, migrations and handovers between teams can leave an alert without a clear owner. Attackers often time activity for nights, weekends and holidays. Clear handover procedures, round-the-clock monitoring and extra care during changes keep busy moments from becoming blind spots.',
  },
  'Signal Spoof': {
    flavor: 'Give them a thousand alarms. They will miss the real one.',
    by: 'Deception operator',
    learn:
      'Attackers can generate noise, such as spoofed traffic or decoy activity, to distract defenders and exhaust their attention. Alert fatigue makes it easier to dismiss a real warning. Defenders tune detections to cut false positives, group related alerts into single incidents, and prioritize by impact so distractions do not bury the signal.',
  },
  'Reopened Connection': {
    flavor: 'Pull back, let them relax, then dial in again.',
    by: 'Access operator',
    learn:
      'When intruders sense detection, they may pause, remove visible tools and return later through the same weakness if it was never fixed. Closing an incident too early invites that return. Defenders fix the root cause, reset affected credentials and keep monitoring after recovery. Reuse in the game represents an old access route used one more time.',
  },
  'Burn Credentials': {
    flavor: 'If it can be traced back to us, it does not exist.',
    by: 'Cleanup crew',
    learn:
      'Intruders may destroy artifacts they no longer need, such as used credentials, tools and logs, to hinder investigators. Deleting evidence often leaves its own traces, like gaps in logging. Defenders send logs to a separate, protected system as they are created, so records survive a wiped machine, and treat missing logs as a warning sign.',
  },
  'Disposable Cache': {
    flavor: 'Use it once, wipe it, move on.',
    by: 'Tooling handler',
    learn:
      'Campaigns often keep tools and stolen data in temporary places, such as rented cloud storage or a compromised file share, and abandon them after use. Short-lived infrastructure is hard to block in advance. Defenders watch for unusual storage use, large transfers to unexpected locations and accounts on cloud services the organization does not use.',
  },
  'Exfiltration Buffer': {
    flavor: 'Collect quietly, compress tightly, leave slowly.',
    by: 'Exfiltration operator',
    learn:
      'Before data is stolen, attackers often gather it in one place and compress it, then send it out in small amounts to avoid notice. That staging is a chance to catch them. Data loss prevention, alerts on unusual archive creation and monitoring of outbound traffic volume help defenders stop exfiltration while there is still time.',
  },
  'Distributed Command': {
    flavor: 'No single server to seize. No single head to cut off.',
    by: 'Command architect',
    learn:
      'Command-and-control is how attackers send instructions to compromised systems. Distributed designs spread that control across many servers, so taking one down does not stop the campaign. Defenders focus on behavior common to all of them, such as regular check-in traffic, and coordinate takedowns with providers and law enforcement.',
  },
  Backdoor: {
    flavor: 'Keep it quiet, keep it open, keep it ready.',
    by: 'Persistence engineer',
    learn:
      'A backdoor is any hidden way back into a system that bypasses normal sign-in, such as an unauthorized account or a remote-access tool. Intruders plant them so losing one entry point does not end a campaign. Defenders audit accounts and remote-access software against known-good baselines. Backdoor tokens in the game abstract these footholds into a spendable resource.',
  },
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/pt-lore.test.mjs`
Expected: PASS. If a length check fails, shorten that entry's sentence (never loosen the bounds) and note it in the report.

Run: `npm test`
Expected: PASS, pristine output, `tests/first-breach-golden.test.mjs` unchanged.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/lore.mjs public/cards.mjs tests/pt-lore.test.mjs
git add public/lore.mjs public/cards.mjs tests/pt-lore.test.mjs
git commit -m "Write lore for the red Persistent Threats cards and the Backdoor"
```

---

### Task 2: Blue lore, Indicator lore, and distinct flavor

**Files:**
- Modify: `public/lore.mjs`
- Modify: `tests/pt-lore.test.mjs`, `tests/expansion-ui.test.mjs` (the "card without lore" test)

**Interfaces:**
- Consumes: `checkFaction` in `tests/pt-lore.test.mjs` (Task 1); token lore wiring (Task 1).
- Produces: `LORE` entries for all 25 blue cards and `'Indicator'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/pt-lore.test.mjs`:

```js
test('blue Persistent Threats cards and the Indicator token have lore', () => checkFaction('blue'));

test('every flavor quote is its own, across both sets', () => {
  const quotes = Object.values(LORE).map(l => l.flavor);
  assert.equal(new Set(quotes).size, quotes.length);
});
```

In `tests/expansion-ui.test.mjs`, the test `'a card without lore renders without “undefined”'` uses Seed Access, which now has lore. Replace its body so it keeps testing the missing-lore path with a card that has none:

```js
test('a card without lore renders without “undefined”', () => {
  const bare = {...BY_ID[pt('Seed Access')], flavor: undefined, flavorBy: undefined, lesson: undefined};
  assert.doesNotMatch(lorePanel(bare), /undefined/);
  assert.match(lorePanel(bare), /arrive with its release/);
});
```

(Import `BY_ID` from `../public/cards.mjs` if the file doesn't already.)

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/pt-lore.test.mjs`
Expected: FAIL — `Forensic Repository has lore`.

- [ ] **Step 3: Add the blue lore**

In `public/lore.mjs`, after the red entries, add a `// Persistent Threats — blue` comment and:

```js
  'Forensic Repository': {
    flavor: 'Copy everything first. Questions come after.',
    by: 'Evidence custodian',
    learn:
      'Investigations depend on preserved evidence: disk images, memory captures and logs copied before systems are cleaned or rebuilt. Storing these copies securely, with a record of who handled them, keeps them trustworthy. Preservation competes with restoring service for time and storage, so good response plans decide in advance what to keep.',
  },
  'Instrumented Datacenter': {
    flavor: 'Every rack reports. Every port has a voice.',
    by: 'Datacenter engineer',
    learn:
      'Instrumentation means collecting telemetry, such as logs, metrics and network flow records, so defenders can see what happened. Without it, investigations become guesswork. Collection has real costs in storage, processing and privacy, so teams choose the sources that matter most and synchronize clocks so events line up correctly.',
  },
  'Alert Triage Analyst': {
    flavor: 'Real, noise, or needs a second look. Next.',
    by: 'Triage analyst',
    learn:
      'Security teams receive far more alerts than they can investigate in depth. Triage quickly sorts them by likely impact and confidence, closing false positives and escalating real threats. Good triage relies on context, such as which system is involved and whether related alerts exist, plus feedback that improves noisy detections.',
  },
  'Canary Service': {
    flavor: 'Nobody should ever touch it. So when someone does, we know.',
    by: 'Deception engineer',
    learn:
      'Canaries and honeypots are decoy systems, files or credentials with no legitimate use. Because nobody should touch them, any interaction is a high-confidence warning that someone is exploring the network. They are cheap to deploy and rarely raise false alarms. Even when an intruder disables one, the attempt can reveal their presence.',
  },
  'Telemetry Curator': {
    flavor: 'Raw logs are noise until someone gives them shape.',
    by: 'Telemetry curator',
    learn:
      'Telemetry becomes useful when it is collected centrally, normalized into consistent fields and kept long enough to investigate. A curator decides which sources to collect, how long to keep them and how to protect them from tampering. Collection alone finds nothing; analysts still have to search, correlate and interpret the data.',
  },
  'Behavioral Monitor': {
    flavor: 'I do not care what it is called. I care what it does.',
    by: 'Detection engineer',
    learn:
      'Behavior-based detection looks at actions rather than known signatures: a document starting a command shell, an account signing in from two continents in an hour, or a process reading many files quickly. It catches new and disguised threats that signatures miss, and watching behavior during containment shows what an intruder was after.',
  },
  'Case Analyst': {
    flavor: 'Evidence first. Conclusions second. Always in that order.',
    by: 'Case analyst',
    learn:
      'Incident analysis turns scattered evidence into an understanding of what happened, how, and what is still at risk. Case management keeps findings, timelines and decisions in one record, so the whole team shares one picture. Well-analyzed evidence leads to targeted actions instead of guesses, and the record helps with reporting and later improvements.',
  },
  'Lockdown Coordinator': {
    flavor: 'Isolate it now. We will argue about blame later.',
    by: 'Response coordinator',
    learn:
      'Containment limits damage while an investigation continues: isolating a host, disabling a compromised account or blocking a malicious address. It buys time but does not remove the intruder. Teams prepare containment options in advance and weigh them carefully, since acting too loudly can warn an attacker before every access path is known.',
  },
  'Restoration Lead': {
    flavor: 'Know what you depend on before you need it back.',
    by: 'Recovery lead',
    learn:
      'Recovery goes faster when teams know in advance which systems matter most, what each one depends on and how to rebuild it. Restoring small, well-understood components first often brings critical services back sooner. Recovery plans, tested backups and dependency maps turn a stressful rebuild into a rehearsed procedure.',
  },
  'Adaptive Perimeter': {
    flavor: 'Same user, new country, new device. Ask again.',
    by: 'Access architect',
    learn:
      'Adaptive access control adjusts defenses to context, such as device health, location and recent behavior, instead of applying one fixed rule. A risky sign-in might need extra verification while a routine one passes smoothly. More context keeps defenses strict where it matters without blocking everyday work, as long as the signals are reliable.',
  },
  'Incident Commander': {
    flavor: 'One voice, one plan, one priority list.',
    by: 'Incident commander',
    learn:
      'During a major incident, an incident commander coordinates the response by assigning tasks, setting priorities and communicating decisions, rather than doing every technical step personally. A clear command structure prevents duplicated work and conflicting actions. Findings from investigators feed that coordination so the right team acts at the right time.',
  },
  'Resilient Service Mesh': {
    flavor: 'Lose a node, reroute, log it, keep serving.',
    by: 'Platform engineer',
    learn:
      'Resilient architectures keep services running when parts fail, using redundancy, automatic failover and limits on how failures spread. A service mesh manages traffic between application components and can add encryption and detailed telemetry along the way. Built this way, an attack or outage degrades a service instead of stopping it.',
  },
  'Reconstruct the Timeline': {
    flavor: 'Put every event in order and the story tells itself.',
    by: 'Forensic analyst',
    learn:
      'Timeline analysis arranges evidence from many sources, such as logs, file changes and alerts, into one chronological story. It reveals the first point of entry, what happened next and what may have been missed. Accurate timelines depend on synchronized clocks and preserved logs. Reuse in the game represents returning to an established timeline as new evidence appears.',
  },
  'Preserve the Scene': {
    flavor: 'Do not reboot it. Do not wipe it. Capture it.',
    by: 'First responder',
    learn:
      'Evidence can disappear quickly: memory is lost at shutdown and logs roll over. Preserving the scene means capturing volatile data and copying relevant logs before cleaning up, while recording who collected what and when. Preserved evidence keeps options open for analysis, legal action and learning, even when restoring service comes first.',
  },
  'Scoped Remediation': {
    flavor: 'Fix what we can prove. Then widen the net if we must.',
    by: 'Remediation lead',
    learn:
      'Remediation removes a threat and fixes the weakness it used. A narrowly scoped fix, such as cleaning one host, is fast and cheap; a broad one, such as resetting every credential, disrupts more but covers more. Teams choose the scope from what the evidence shows. Overclock in the game represents paying more for a broader response.',
  },
  'Restore Trusted State': {
    flavor: 'Roll back to the last state we can actually trust.',
    by: 'Recovery engineer',
    learn:
      'Restoring a trusted state means rebuilding systems from known-good backups or clean images instead of cleaning an infected machine in place. The backup must predate the intrusion and be protected from tampering, and restored systems are checked before going fully live. Overclock in the game represents extra effort to bring a service back ready for use.',
  },
  'Emergency Segmentation': {
    flavor: 'Close the internal gates. All of them. Now.',
    by: 'Network responder',
    learn:
      'Emergency segmentation cuts or restricts connections between parts of a network during an attack, such as blocking traffic between offices or isolating critical systems. It slows an intruder moving between systems and buys time. Because it also disrupts normal work, teams plan these steps in advance and know which connections must stay open.',
  },
  'Verify Provenance': {
    flavor: 'Signed, sourced and checked, or it does not run.',
    by: 'Release engineer',
    learn:
      'Provenance is the verifiable history of where software came from and how it was built. Code signing, software bills of materials and checked build pipelines help confirm that an update really came from its supplier unmodified. Verification can stop a tampered update, and a failed check is itself useful evidence for investigators.',
  },
  'Live Response': {
    flavor: 'Connect, collect, contain. Before it moves again.',
    by: 'Endpoint responder',
    learn:
      'Live response lets responders act directly on a running system: collecting evidence, stopping a malicious process or isolating the machine without waiting to image its disk. It is fast but needs care, because every action changes the system and may alert the intruder. Responders weigh disrupting the threat now against keeping a service available.',
  },
  'Break the Chain': {
    flavor: 'Remove the link it depends on and the rest falls apart.',
    by: 'Threat hunter',
    learn:
      'Attacks usually follow a chain of steps, and breaking any link can stop the sequence. Removing a supporting mechanism, such as a scheduled task that restarts malware, keeps a threat from coming back, and cleaning up leftover tools reduces recurrence. Overclock in the game represents taking the extra time to deal with that leftover material too.',
  },
  'Clean-Room Analysis': {
    flavor: 'Nothing leaves this network. Nothing enters it unchecked.',
    by: 'Malware analyst',
    learn:
      'Suspicious files are analyzed in isolated environments, such as sandboxes and clean-room networks, so they cannot harm production systems. Separating suspect material from trusted resources also makes recovery safer, because systems are rebuilt only from verified components. Isolation must be real: shared accounts or network links can undo it.',
  },
  'Continuity Plan': {
    flavor: 'The plan is boring. That is why it works at 3 a.m.',
    by: 'Continuity manager',
    learn:
      'Business continuity planning prepares an organization to keep essential services running during a disruption, with manual workarounds, alternate sites or reduced service. Plans are rehearsed so people know their roles under pressure, and keeping services up while investigating supports better recovery. Reuse in the game represents falling back on a prepared plan.',
  },
  'Analysis Workbench': {
    flavor: 'Same question, same steps, every time.',
    by: 'Senior analyst',
    learn:
      'Structured analysis, such as playbooks, checklists and shared investigation tools, helps analysts extract more from limited evidence and reach consistent conclusions. It reduces the chance of skipping a step under pressure and makes work easier to review. The process still depends on having good observations to analyze in the first place.',
  },
  'Recovery Runbook': {
    flavor: 'If the runbook is out of date, it is a story, not a plan.',
    by: 'Operations manager',
    learn:
      'A runbook is a step-by-step procedure for a known situation, such as restoring a database or replacing compromised keys. Good runbooks let people act quickly and correctly under stress. They rely on trusted resources, such as clean backups and spare capacity, and need regular testing as systems change, or they fail when they are needed most.',
  },
  'Continuous Validation': {
    flavor: 'Trust the control once. Then test it every day after.',
    by: 'Validation engineer',
    learn:
      'Continuous validation regularly tests whether security controls still work, for example by running safe simulations of known attack techniques and checking that alerts fire. Configurations drift and detections break silently, so repeated checks catch gaps early. Validation produces useful signals, but someone still has to act on what it finds.',
  },
  Indicator: {
    flavor: 'Small on its own. Decisive in the right hands.',
    by: 'Threat intelligence analyst',
    learn:
      'An indicator of compromise is evidence that suggests an intrusion, such as a malicious file fingerprint, a suspicious domain or an unusual sign-in. Indicators are most valuable when analyzed and shared: they help find other affected systems and block the same activity elsewhere. Indicator tokens in the game abstract observations that analysis turns into advantages.',
  },
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/pt-lore.test.mjs tests/expansion-ui.test.mjs`
Expected: PASS (shorten any entry that fails a length check; never loosen the bounds).

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/lore.mjs tests/pt-lore.test.mjs tests/expansion-ui.test.mjs
git add public/lore.mjs tests/pt-lore.test.mjs tests/expansion-ui.test.mjs
git commit -m "Write lore for the blue Persistent Threats cards and the Indicator"
```

---

### Task 3: Art prompts for the author's image model

**Files:**
- Create: `art-source/cards/persistent-threats/generation-prompts.json`
- Create: `tests/pt-art-prompts.test.mjs`

**Interfaces:**
- Produces: an array of 52 `{name, faction, prompt}` objects — the 50 expansion cards in catalog order, then `Backdoor`, then `Indicator` — in the exact format of `art-source/cards/foundation/generation-prompts.json`. The author generates `<name>.png` from each and puts them in `art-source/cards/persistent-threats/`; Task 9 converts them.

- [ ] **Step 1: Write the failing test**

Create `tests/pt-art-prompts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CARDS, TOKENS} from '../public/cards.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL(`../art-source/cards/${path}`, import.meta.url), 'utf8'));
const prompts = read('persistent-threats/generation-prompts.json');
const foundation = read('foundation/generation-prompts.json');
// Everything but the name, subject and accent colour is the First Breach template, word for word.
const template = p =>
  p
    .replace(/named [^;]+;/, 'named X;')
    .replace(/Subject: .*? Style:/, 'Subject: S Style:')
    .replace(/Faction accents: [a-z ]+\./, 'Faction accents: A.');
const subject = p => p.match(/Subject: (.*?) Style:/)[1];

test('there is one prompt per expansion card and token, in catalog order', () => {
  const expected = [...CARDS.filter(c => c.set === 'persistent-threats'), TOKENS.backdoor, TOKENS.indicator];
  assert.deepEqual(
    prompts.map(p => [p.name, p.faction]),
    expected.map(c => [c.name, c.faction]),
  );
  for (const p of prompts) assert.deepEqual(Object.keys(p), ['name', 'faction', 'prompt']);
});

test('every prompt uses the First Breach template with its faction accent', () => {
  for (const p of prompts) {
    assert.equal(template(p.prompt), template(foundation[0].prompt), p.name);
    assert.match(p.prompt, new RegExp(`named ${p.name}; do not render the name`));
    assert.match(p.prompt, p.faction === 'red' ? /Faction accents: crimson red\./ : /Faction accents: cyan blue\./);
  }
});

test('subjects are distinct, and tokens never look like a compute resource', () => {
  const subjects = prompts.map(p => subject(p.prompt));
  assert.equal(new Set(subjects).size, subjects.length);
  for (const s of subjects) assert.ok(s.length > 60, s);
  for (const name of ['Backdoor', 'Indicator'])
    assert.match(subject(prompts.find(p => p.name === name).prompt), /rather than a battery, coin or power source/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/pt-art-prompts.test.mjs`
Expected: FAIL — ENOENT for `generation-prompts.json`.

- [ ] **Step 3: Generate the prompt file**

Run this once from the repo root (it writes the file; don't commit the script):

```bash
mkdir -p art-source/cards/persistent-threats
node --input-type=module <<'EOF'
import fs from 'node:fs';
import {CARDS, TOKENS} from './public/cards.mjs';
const SUBJECTS = {
  'Ghost Relay': 'A half-dismantled rooftop relay mast in the rain, its crimson status lights fading one by one while a replacement relay case glows on a neighboring roof, cables coiled for a quick move, temporary disposable infrastructure.',
  'Reconnaissance Outpost': 'A quiet observation post in an abandoned high-rise office, long-lens optics and a passive antenna array aimed across the skyline at a distant corporate tower, crimson screen glow on empty desks, nothing yet touching the target.',
  'Attack Surface Mapper': 'A holographic map of a corporate network floating above a cluttered workbench, forgotten servers and open ports marked as small crimson beacons at its edges, one exposed node highlighted as the focal point.',
  'Beachhead Scout': 'A lone scout in a dark weatherproof jacket crouched at a breached perimeter fence of a corporate campus at night, planting a small crimson-lit relay device at the base of a post, the building glowing ahead.',
  'Staged Loader': 'A compact matte-black device on a loading dock unfolding in segments like a mechanical seed pod, its first small stage glowing faint crimson while larger dormant modules wait inside, industrial night lighting.',
  'Dead-Drop Courier': 'A hooded courier slipping a tiny crimson-lit data chip behind a loose panel of a public notice board in a crowded neon market, passersby oblivious, stealthy low-angle composition.',
  'Access Broker': 'A well-dressed broker in a private booth of a dim lounge sliding an ornate case of glowing crimson keycards across the table toward an unseen buyer, city lights through rain-streaked glass.',
  'Dormant Implant': 'A tiny crimson implant chip nested among ordinary components on a server motherboard, its light pulsing slowly as if asleep, macro perspective with dust and shallow depth of field.',
  'Living-off-the-Land Operator': 'An operator seated at a borrowed administrator workstation inside a corporate server room, using the facility’s own built-in consoles instead of bringing equipment, crimson reflections on their visor, calm and unhurried.',
  'Redundant Handler': 'A handler at a desk of several identical crimson-lit handsets and terminals, one cable visibly severed while a second line lights up, backup routes glowing across a wall map.',
  'Coordinated Intrusion Lead': 'A team leader at the center of a darkened operations van coordinating three operators through holographic displays, three separate crimson access routes converging on one target building on a tactical map.',
  'Long-Haul Campaign': 'A vast operations wall charting a months-long campaign, interconnected crimson routes across a city map, relay stations and many small operator silhouettes working in shifts, depicting a coordinated long-term operation rather than one large figure.',
  'Map Trust Relationships': 'A glowing crimson web of connections linking a large corporate tower to smaller partner and supplier buildings across a night city, one small partner office highlighted as the quiet way in, elevated panoramic view.',
  'Seed Access': 'An operator’s gloved hand scattering tiny crimson seed-like implant devices into the cracks of city infrastructure, each landing and glowing faintly, a few already sprouting thin glowing filaments.',
  'Coordinated Pressure': 'Streams of crimson data from many directions converging on a single armored corporate gate, sparks and strain where the pressure concentrates, dramatic forced perspective.',
  'Burn the Channel': 'A secret crimson-lit communications conduit in a maintenance tunnel burning out in a controlled flare as an operator walks away, the channel sacrificed to open one final door ahead.',
  'Cascading Outage': 'A night city seen from above as districts go dark in sequence like falling dominoes, crimson fault lines racing between power and data hubs, even the attacker’s own relay flickering out.',
  'Adaptive Payload': 'A small modular malware core on a clean workbench receiving interchangeable glowing crimson modules that slot in automatically, each module a different shape, the core adapting at the center.',
  'Exploit the Handoff': 'A security operations desk during a shift change, one analyst leaving and the next not yet seated, an unattended monitor pulsing with a crimson alert, the empty chair as the focal point.',
  'Signal Spoof': 'Dozens of false crimson radar blips flooding a defensive monitoring screen while one faint true signal slips between them, a decoy transmitter array on the rooftop outside the window.',
  'Reopened Connection': 'An old sealed maintenance port on a server rack being quietly reopened, a crimson cable reconnecting to a socket whose covering tape has been peeled back, close focused view.',
  'Burn Credentials': 'A compact incinerator in a hidden safehouse consuming glowing crimson access cards and data chips, embers rising, an operator’s silhouette watching from the shadows.',
  'Disposable Cache': 'A rented storage locker in a neon-lit self-storage corridor holding a temporary stack of crimson-lit drives and tools, a remote wipe light already blinking, clearly meant to be abandoned.',
  'Exfiltration Buffer': 'A compact crimson-lit staging drive quietly filling with compressed data cubes inside a server room, a thin trickle of light leaking out through a vent toward the night city.',
  'Distributed Command': 'A decentralized command network of many small crimson relay nodes on rooftops across a megacity, linked by thin signals with no central tower, wide aerial panorama.',
  'Forensic Repository': 'A secure evidence vault with rows of sealed drawers, each marked with a cyan seal, a custodian’s gloved hand placing a drive into a tamper-evident case, clean orderly perspective.',
  'Instrumented Datacenter': 'A datacenter aisle where every rack is wrapped in fine cyan sensor filaments and small telemetry lights, streams of light flowing toward a central collection node, symmetrical calm perspective.',
  'Alert Triage Analyst': 'An analyst at a curved console sorting floating cyan alert panels into three distinct holographic stacks, calm focused expression, a queue of faint alerts waiting above.',
  'Canary Service': 'A decoy server standing alone in an empty datacenter bay, faint cyan tripwire lines stretched around it, a small mechanical canary with glowing eyes perched on top, quiet tension.',
  'Telemetry Curator': 'A curator arranging flowing cyan data streams into neat parallel channels on a large holographic loom, raw noisy light entering on one side and orderly patterns leaving the other.',
  'Behavioral Monitor': 'A tall sensor pylon in a network corridor projecting a cyan scanning field that traces the glowing footprints of a moving process and highlights its unusual path, vigilant atmosphere.',
  'Case Analyst': 'An analyst at an evidence board connecting cyan-lit photographs, device fragments and records with glowing threads, one key connection illuminated as the focal point.',
  'Lockdown Coordinator': 'A coordinator raising a hand as heavy cyan containment shutters slam down around a single glowing compromised server, sealing it off from the rest of the room.',
  'Restoration Lead': 'A recovery lead in a clean workshop inspecting a small restored server module under cyan light, spare components laid out in order on the bench, a dependency diagram glowing behind.',
  'Adaptive Perimeter': 'A layered cyan energy perimeter around a corporate campus that thickens where a suspicious figure approaches and stays thin where staff pass normally, dusk aerial view.',
  'Incident Commander': 'An incident commander at the center of a busy response room directing teams with a clear gesture, cyan wall displays showing a prioritized plan as diagrams, organized motion all around.',
  'Resilient Service Mesh': 'A vast mesh of interconnected cyan service nodes spanning a datacenter hall, traffic smoothly rerouting around one darkened failed node while small engineer silhouettes watch, depicting a coordinated resilient system rather than one large figure.',
  'Reconstruct the Timeline': 'A long cyan holographic timeline suspended in a dark investigation room, events snapping into chronological order as an analyst slides the last fragment into place.',
  'Preserve the Scene': 'A first responder bagging a still-running laptop inside a cordoned-off office, cyan barrier lights and small evidence cones around the desk, careful and deliberate.',
  'Scoped Remediation': 'A precise cyan laser grid isolating and dissolving one infected server in a rack while the neighboring servers stay untouched, surgical clean composition.',
  'Restore Trusted State': 'A server rebuilding itself from a glowing cyan reference image projected out of a sealed backup vault, clean layers reassembling from the base upward.',
  'Emergency Segmentation': 'Heavy cyan bulkhead doors slamming shut in sequence along a long network corridor, dividing it into sealed segments, alarm light reflecting on the floor.',
  'Verify Provenance': 'Software packages moving on a conveyor through a cyan verification gate that scans each sealed signature, one tampered package halted beside it under a warning glow.',
  'Live Response': 'A responder’s gloved hands on a portable cyan-lit forensic kit plugged into a running workstation, live process streams reflected in the light, urgent close perspective.',
  'Break the Chain': 'A cyan-lit gauntleted hand snapping a glowing chain whose links are small malicious devices, broken links scattering, the chain anchored to a hidden restart mechanism.',
  'Clean-Room Analysis': 'A sealed glass clean-room lab where a malware sample floats in a cyan containment field, an analyst in protective gear observing from outside the glass.',
  'Continuity Plan': 'A calm operations team keeping essential services running from a backup site at night, cyan-lit workstations and an open binder on the table, the main building dark in the distance.',
  'Analysis Workbench': 'A tidy analyst workbench of organized cyan-lit tools, a magnifier over a small sealed evidence record, a structured holographic diagram of steps glowing above.',
  'Recovery Runbook': 'A worn but well-kept binder open on a console in a server room, cyan light tracing a sequence of abstract diagrams across its pages toward a spare backup drive and replacement parts.',
  'Continuous Validation': 'Automated cyan test probes pulsing steadily against a row of security controls in a datacenter, each control lighting up as it passes, one flickering where a gap is found.',
  Backdoor: 'A hidden access marker: a small door-shaped crimson glyph set into a server rack panel, slightly ajar with red light leaking from behind it, clearly a concealed entry point rather than a battery, coin or power source.',
  Indicator: 'A sealed record: a small cyan-lit evidence capsule with a tamper-evident seal holding a single glowing fragment of data on a dark surface, clearly a sealed evidence record rather than a battery, coin or power source.',
};
const [first] = JSON.parse(fs.readFileSync('art-source/cards/foundation/generation-prompts.json', 'utf8'));
const items = [...CARDS.filter(c => c.set === 'persistent-threats'), TOKENS.backdoor, TOKENS.indicator];
const out = items.map(({name, faction}) => ({
  name,
  faction,
  prompt: first.prompt
    .replace(/named [^;]+;/, `named ${name};`)
    .replace(/Subject: .*? Style:/, `Subject: ${SUBJECTS[name]} Style:`)
    .replace(/Faction accents: [a-z ]+\./, `Faction accents: ${faction === 'red' ? 'crimson red' : 'cyan blue'}.`),
}));
if (out.some(o => !SUBJECTS[o.name])) throw Error('missing subject');
fs.writeFileSync('art-source/cards/persistent-threats/generation-prompts.json', JSON.stringify(out, null, 2) + '\n');
EOF
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/pt-art-prompts.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write tests/pt-art-prompts.test.mjs
git add art-source/cards/persistent-threats/generation-prompts.json tests/pt-art-prompts.test.mjs
git commit -m "Write image prompts for the Persistent Threats cards and tokens"
```

- [ ] **Step 6: Hand the prompts to the author (controller)**

Tell the author the file path and what to deliver: one 1536×1024 PNG per entry, saved as `art-source/cards/persistent-threats/<name>.png` (for example `Ghost Relay.png`, `Backdoor.png`). Tasks 4–8 continue meanwhile; Task 9 waits for the images.

---

### Task 4: Rules vocabulary — glossary on cards and a Persistent Threats Field Guide

**Files:**
- Modify: `public/cards.mjs` (`MECHANICS`, `mechanicsOf`, next to `KEYWORDS`)
- Modify: `public/arena-view.mjs` (`cardDialog`)
- Modify: `public/card-view.mjs` (`hoverCard`)
- Modify: `public/guide.mjs`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Produces:
  - `MECHANICS: {[key]: [name, text]}` for `probe`, `overclock`, `reuse`, `retire`, `archive`, `backdoor`, `indicator`.
  - `mechanicsOf(d): string[]` — the keys whose name appears in an expansion card's rules text; `[]` for every First Breach card.
  - `guide({expansion = poolReleased(EXPANSION_POOL)} = {})`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs` (add `MECHANICS, mechanicsOf` to its `../public/cards.mjs` import, and `import {guide} from '../public/guide.mjs';`):

```js
test('expansion cards explain the rules terms they use; First Breach cards are unchanged', () => {
  assert.deepEqual(mechanicsOf(BY_ID[pt('Map Trust Relationships')]), ['probe', 'reuse']);
  assert.deepEqual(mechanicsOf(BY_ID[pt('Burn the Channel')]), ['retire']);
  assert.deepEqual(mechanicsOf(BY_ID[pt('Seed Access')]), ['backdoor']);
  for (const c of CARDS.filter(c => c.set === 'first-breach')) assert.deepEqual(mechanicsOf(c), [], c.name);
  const g = table();
  const dialog = arena.cardDialog(state(g), pt('Map Trust Relationships'), null, '');
  assert.match(dialog, new RegExp(`<strong>Probe</strong><br>${MECHANICS.probe[1]}`));
  assert.match(dialog, /<strong>Reuse<\/strong>/);
  const fb = CARDS.find(c => c.set === 'first-breach' && c.type === 'Operation');
  assert.doesNotMatch(arena.cardDialog(state(g), fb.id, null, ''), /Probe|Reuse|Overclock|Retire|Archive/);
});

test('the Field Guide teaches Persistent Threats once it is released', () => {
  const on = guide({expansion: true}),
    off = guide({expansion: false});
  assert.match(on, /FIELD GUIDE \/ ALL SETS/);
  assert.match(on, /<h2>Persistent Threats<\/h2>/);
  for (const [name] of Object.values(MECHANICS)) assert.match(on, new RegExp(`<strong>${name}\\.</strong>`));
  assert.match(on, /Triggered abilities/);
  assert.match(on, /Make your choice/);
  assert.doesNotMatch(on, /no exile, token, or sideboard/);
  assert.match(off, /FIELD GUIDE \/ FIRST BREACH/);
  assert.doesNotMatch(off, /Persistent Threats/);
  assert.match(off, /There are no exile, token, or sideboard mechanics in this set\./);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL — `mechanicsOf` is not exported.

- [ ] **Step 3: Add the glossary**

In `public/cards.mjs`, after `KEYWORD_NAMES`, add:

```js
// Persistent Threats rules terms: shown in the Field Guide and on the expansion cards that use them.
export const MECHANICS = {
  probe: [
    'Probe',
    'Look at the top N cards of your deck. Put any of them into your discard and the rest back on top in any order. Only you see them.',
  ],
  overclock: [
    'Overclock',
    'As you cast this card you may pay N more compute for its stronger effect. The cast dialog shows both total costs.',
  ],
  reuse: [
    'Reuse',
    'Cast this card from your discard by paying N compute instead of its cost. Afterwards it is archived, even if it is countered.',
  ],
  retire: [
    'Retire',
    'Put a card you control into your discard to pay a cost or for an effect. A retired token leaves the game. Destroying a card is not retiring it.',
  ],
  archive: [
    'Archive',
    'A public zone beside the discard for cards removed from the game for good. Nothing returns archived cards.',
  ],
  backdoor: [
    'Backdoor',
    'A red Tool token. 1 compute, retire it: a unit you control gets +2/+0 until end of turn. Use it in your main phase while the stack is empty.',
  ],
  indicator: [
    'Indicator',
    'A blue Tool token. 2 compute, retire it: draw a card. Use it in your main phase while the stack is empty.',
  ],
};
// The rules terms an expansion card's text uses. First Breach cards have none, so their markup never changes.
export const mechanicsOf = d =>
  d.set === 'persistent-threats'
    ? Object.keys(MECHANICS).filter(k => new RegExp(`\\b${MECHANICS[k][0]}`, 'i').test(d.text))
    : [];
```

Before relying on the Retire and Reuse wording, confirm it against the engine: a retired token is removed (search `retire` in `public/rules.mjs`), and a Reuse card is archived when countered (search `reuse` in `public/engine.mjs`). If either differs, change the text to match the engine and say so in the report.

- [ ] **Step 4: Show it in the card dialog and preview**

In `public/arena-view.mjs` `cardDialog`, right after the keywords `.map(...).join('')`, add:

```js
${mechanicsOf(d).map(k => `<p><strong>${MECHANICS[k][0]}</strong><br>${MECHANICS[k][1]}</p>`).join('')}
```

(import `MECHANICS, mechanicsOf` from `./cards.mjs`).

In `public/card-view.mjs` `hoverCard`, replace the keywords block

```js
${d.keywords?.length ? `<div class="preview-keywords">${d.keywords.map(k => `<p><strong>${esc(KEYWORD_NAMES[k])}.</strong> ${esc(KEYWORDS[k])}</p>`).join('')}</div>` : ''}
```

with

```js
${d.keywords?.length || mechanicsOf(d).length ? `<div class="preview-keywords">${(d.keywords ?? []).map(k => `<p><strong>${esc(KEYWORD_NAMES[k])}.</strong> ${esc(KEYWORDS[k])}</p>`).join('')}${mechanicsOf(d).map(k => `<p><strong>${esc(MECHANICS[k][0])}.</strong> ${esc(MECHANICS[k][1])}</p>`).join('')}</div>` : ''}
```

(import `MECHANICS, mechanicsOf`). First Breach output is byte-identical because `mechanicsOf` is `[]` for them.

- [ ] **Step 5: Extend the Field Guide**

In `public/guide.mjs`:

1. Import `{EXPANSION_POOL, MECHANICS, poolReleased}` alongside the existing imports.
2. Add before `guide`:

```js
// The expansion's rules, shown once Persistent Threats is released.
const expansionSection = () =>
  `<section><h2>Persistent Threats</h2><p>An opt-in expansion. Tick <strong>Include Persistent Threats</strong> on the start screen, or when inviting a friend, and both players use decks that mix First Breach and Persistent Threats cards. The guided first game always uses First Breach only.</p>${Object.values(
    MECHANICS,
  )
    .map(([name, text]) => `<p><strong>${name}.</strong> ${text}</p>`)
    .join(
      '',
    )}<p><strong>Triggered abilities.</strong> “When” and “whenever” abilities go on the stack like cards, so both players can respond. If several of yours trigger at once, you choose their order. Counters still target only Responses and Operations; abilities cannot be countered.</p><p><strong>Choices.</strong> Some effects stop to ask you something as they resolve: which probed cards to keep, what to discard, whether to pay for a counter. Automatic passing waits until you choose. Close the dialog to look at the board; <strong>Make your choice</strong> reopens it.</p></section>`;
```

3. Change the signature to `export function guide({expansion = poolReleased(EXPANSION_POOL)} = {}) {`.
4. Replace `FIELD GUIDE / FIRST BREACH` with `FIELD GUIDE / ${expansion ? 'ALL SETS' : 'FIRST BREACH'}`.
5. Insert `${expansion ? expansionSection() : ''}` immediately before `<section><h2>This edition’s rules scope</h2>`.
6. Replace `There are no exile, token, or sideboard mechanics in this set.` with `${expansion ? 'There are no sideboards. Persistent Threats adds tokens and the archive, a public zone for cards removed from the game.' : 'There are no exile, token, or sideboard mechanics in this set.'}`.

`app.mjs` calls `guide()` with no arguments, which picks the default.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS, pristine; existing card-dialog and preview tests unchanged.

- [ ] **Step 7: Commit**

```bash
npx --yes prettier@3.9.9 --write public/cards.mjs public/arena-view.mjs public/card-view.mjs public/guide.mjs tests/expansion-ui.test.mjs
git add public/cards.mjs public/arena-view.mjs public/card-view.mjs public/guide.mjs tests/expansion-ui.test.mjs
git commit -m "Explain Persistent Threats rules terms on cards and in the Field Guide"
```

---

### Task 5: Optional expansion tips in matches with Persistent Threats

**Files:**
- Create: `public/expansion-tips.mjs`
- Modify: `public/arena-view.mjs` (`tutorialText`)
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Produces:
  - `choiceTip(game): string | null` — a tip for the player's own pending choice.
  - `expansionTip(game): string | null` — a tip for expansion material the player has right now (Reuse, Overclock, Backdoor, Indicator, archive).
  - Both return `null` in a First Breach match. `tutorialText` shows `choiceTip` first and `expansionTip` in place of its last generic tip. These tips appear only while quick tips are on, so they are optional.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs` (import `{choiceTip, expansionTip}` from `../public/expansion-tips.mjs` and `{Game}` if not already imported):

```js
test('expansion tips follow what the player has, and never appear in a First Breach match', () => {
  const g = table();
  const fb = new Game('red', () => 0.5);
  assert.equal(expansionTip(fb), null);
  assert.equal(choiceTip(fb), null);
  g.phase = 'main1';
  g.players[0].field = g.players[0].field.filter(c => BY_ID[c.id].type !== 'Tool');
  put(g, 0, 'r7');
  assert.equal(expansionTip(g), null);
  g.createToken(0, 'pt-backdoor');
  assert.match(expansionTip(g), /<strong>Backdoors\.<\/strong>/);
  assert.match(arena.tutorialText(state(g)), /Backdoors/);
  g.players[1].archive.push(g.card(pt('Seed Access')));
  assert.match(expansionTip(g), /Backdoors/, 'your own tokens come before the archive');
});

test('a pending Probe gets its own tip, ahead of the stack tip', () => {
  const g = probing();
  assert.match(choiceTip(g), /<strong>Probe\.<\/strong>/);
  assert.match(arena.tutorialText(state(g)), /Probe/);
});
```

(`probing()` is the helper Task 5 of Plan 5 added to this file; `table`, `put`, `pt`, `state` and `arena` are the shared helpers at its top. If `table()` puts other material on the board that triggers a tip earlier than expected, clear that zone at the start of the test and say so in the report.)

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL — `expansion-tips.mjs` does not exist.

- [ ] **Step 3: Write the tips**

Create `public/expansion-tips.mjs`:

```js
// public/expansion-tips.mjs
// Short optional lessons for Persistent Threats, shown in the quick-tips panel of expansion matches only.
import {BY_ID, DEFAULT_POOL} from './cards.mjs';

// The player's own pending choice.
export function choiceTip(game) {
  const c = game.pending;
  if (game.pool === DEFAULT_POOL || c?.actor !== 0) return null;
  if (c.kind === 'probe')
    return '<strong>Probe.</strong> Only you see these cards. Discarding one is not always a loss: a card with Reuse can still be cast from your discard later.';
  if (c.kind === 'order')
    return '<strong>Order your triggers.</strong> The first one you place goes on the stack first, so it resolves last.';
  if (c.kind === 'pay')
    return '<strong>Pay or be countered.</strong> Paying taps ready infrastructure now, which leaves less compute for Responses this turn.';
  return '<strong>Make your choice.</strong> Automatic passing waits for your answer. Close the dialog to look at the board, then use Make your choice to reopen it.';
}

// Expansion material the player has right now, most actionable first.
export function expansionTip(game) {
  if (game.pool === DEFAULT_POOL) return null;
  const me = game.players[0];
  if (me.grave.some(c => BY_ID[c.id].reuse != null && !game.playIssues(0, c, {reuse: true}).length))
    return '<strong>Reuse.</strong> A card in your discard can be cast once more for its Reuse cost. Open your discard to cast it; afterwards it is archived.';
  if (me.hand.some(c => BY_ID[c.id].overclock && game.legal(0, c)))
    return '<strong>Overclock.</strong> Casting a card with Overclock offers a standard and a stronger version. Paying more now can leave you without a Response.';
  if (me.field.some(c => c.id === 'pt-backdoor'))
    return '<strong>Backdoors.</strong> Spend 1 compute and retire one to give a unit +2/+0, or keep them to pay costs such as Burn the Channel. They are Tools, so they can be destroyed.';
  if (me.field.some(c => c.id === 'pt-indicator'))
    return '<strong>Indicators.</strong> Spend 2 compute and retire one to draw a card. Some cards reward retiring them, so time it with your plan.';
  if (me.archive.length || game.players[1].archive.length)
    return '<strong>Archive.</strong> Archived cards are out of the game for good. Open an archive pile to see them.';
  return null;
}
```

- [ ] **Step 4: Use them in the quick tips**

In `public/arena-view.mjs` `tutorialText` (import `{choiceTip, expansionTip}` from `./expansion-tips.mjs`):

- As the first line after `const {game} = s;` add: `const choice = choiceTip(game); if (choice) return choice;`
- Replace the final `return '<strong>Keep a Response ready.</strong> …';` with `return expansionTip(game) ?? '<strong>Keep a Response ready.</strong> …';` keeping the existing string exactly.

A First Breach match gets `null` from both, so its tips are unchanged.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/expansion-ui.test.mjs tests/tutorial.test.mjs tests/views.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 6: Commit**

```bash
npx --yes prettier@3.9.9 --write public/expansion-tips.mjs public/arena-view.mjs tests/expansion-ui.test.mjs
git add public/expansion-tips.mjs public/arena-view.mjs tests/expansion-ui.test.mjs
git commit -m "Add optional Persistent Threats tips to expansion matches"
```

---

### Task 6: Set-aware copy, tokens in the library, and the README

**Files:**
- Modify: `public/cards.mjs` (`releasedTokens`, `edition`)
- Modify: `public/library.mjs` (tokens in the grid, per-pool deck note)
- Modify: `public/about.mjs` (card count), `public/versus-ui.mjs` (eyebrow)
- Modify: `public/app.mjs` (header edition and nav count at boot), `public/index.html` (no change to defaults)
- Modify: `README.md`
- Modify: `tests/expansion-ui.test.mjs` (append)

**Interfaces:**
- Produces:
  - `releasedTokens(): token[]` — tokens whose set is released.
  - `edition(): string` — the newest released set's name in capitals and its edition number, e.g. `FIRST BREACH / 01`, then `PERSISTENT THREATS / 02` once released.
  - `libraryGrid(s)` lists released tokens after released cards, filtered by the same `matches`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/expansion-ui.test.mjs` (import `{edition, releasedTokens, SETS}` from `../public/cards.mjs`, `{library, libraryGrid}` from `../public/library.mjs`, `{about}` from `../public/about.mjs`, `{lobby}`-style export from `../public/versus-ui.mjs` — use whichever function renders the lobby eyebrow, found with `grep -n "PLAY A FRIEND" public/versus-ui.mjs`):

```js
// Mark the expansion released (or not) for one test, restoring whatever it was.
const releaseFor = (t, released) => {
  const was = SETS['persistent-threats'].released;
  SETS['persistent-threats'].released = released;
  t.after(() => (SETS['persistent-threats'].released = was));
};
const filter = (extra = {}) => ({filter: {q: '', faction: 'all', type: 'all', set: 'all', ...extra}});

test('the header edition and library follow the released sets', t => {
  releaseFor(t, false);
  assert.equal(edition(), 'FIRST BREACH / 01');
  assert.deepEqual(releasedTokens(), []);
  assert.match(library(filter()), /Each starter contains 24 infrastructure/);
  releaseFor(t, true);
  assert.equal(edition(), 'PERSISTENT THREATS / 02');
  assert.equal(releasedTokens().length, 2);
  const html = library(filter());
  assert.match(html, /100 cards · 4 decks/, 'tokens are not counted as cards');
  assert.match(html, /First Breach decks have 24 infrastructure, 24 units and 12 other cards\./);
  assert.match(html, /First Breach \+ Persistent Threats decks have 24 infrastructure, 20 units and 16 other cards\./);
});

test('the library lists tokens, and search and filters apply to them', t => {
  releaseFor(t, true);
  assert.match(libraryGrid(filter()), /data-card="pt-backdoor"/);
  assert.match(libraryGrid(filter({q: 'backdoor'})), /data-card="pt-backdoor"/);
  assert.doesNotMatch(libraryGrid(filter({faction: 'blue'})), /data-card="pt-backdoor"/);
  assert.doesNotMatch(libraryGrid(filter({set: 'first-breach'})), /data-card="pt-indicator"/);
});

test('about counts the released cards', t => {
  releaseFor(t, false);
  assert.match(about(), /every one of the 50 cards/);
  releaseFor(t, true);
  assert.match(about(), /every one of the 100 cards/);
});
```

Also add one assertion to an existing versus-lobby test in `tests/versus-ui.test.mjs`: the lobby eyebrow reads `BREACH &amp; DEFEND / PLAY A FRIEND`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/expansion-ui.test.mjs tests/versus-ui.test.mjs`
Expected: FAIL — `edition` is not exported.

- [ ] **Step 3: Add the catalog helpers**

In `public/cards.mjs`, next to `releasedCards`:

```js
export const releasedTokens = () => Object.values(TOKENS).filter(t => SETS[t.set].released);
// The header's edition label: the newest released set and how many sets are out.
export function edition() {
  const sets = Object.keys(SETS).filter(id => SETS[id].released);
  return `${SETS[sets.at(-1)].name.toUpperCase()} / ${String(sets.length).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Update the library**

In `public/library.mjs` (import `BY_ID, POOLS, deck, releasedTokens` too):

```js
// What a pool's decks are made of, counted from the red list (both factions follow the same recipe).
function composition(pool) {
  const n = {Infrastructure: 0, Unit: 0, other: 0};
  for (const id of deck('red', pool)) {
    const type = BY_ID[id].type;
    n[type === 'Infrastructure' || type === 'Unit' ? type : 'other']++;
  }
  return n;
}
const deckNote = () => {
  const pools = releasedPools();
  if (pools.length === 1)
    return 'Each starter contains 24 infrastructure, two copies of each of its 12 units, and one copy of each of its 12 other cards.';
  return pools
    .map(id => {
      const n = composition(id);
      return `${esc(POOLS[id].name)} decks have ${n.Infrastructure} infrastructure, ${n.Unit} units and ${n.other} other cards.`;
    })
    .join(' ');
};
```

Replace the footer's literal text inside `<p class="footer-note">…</p>` with `${deckNote()}`, and change `libraryGrid` to list tokens after cards:

```js
export function libraryGrid(s) {
  const cs = [...releasedCards(), ...releasedTokens()].filter(c => matches(c, s.filter));
  return cs.length
    ? cs.map(c => card(s, c.id)).join('')
    : '<p class="muted">No matching cards. Try another search or filter.</p>';
}
```

Check `deck('red', 'first-breach')` really is 24/24/12 before trusting the note (the unreleased branch keeps the old exact sentence either way).

- [ ] **Step 5: Update the other copy**

- `public/about.mjs`: replace `every one of the 50 cards` with `every one of the ${releasedCards().length} cards` (import `releasedCards`).
- `public/versus-ui.mjs`: replace `FIRST BREACH / PLAY A FRIEND` with `BREACH &amp; DEFEND / PLAY A FRIEND`; the lobby already names the pool below.
- `public/app.mjs`: where the app first renders (next to the initial `render()` call at the end of the file), add:

```js
// The static header defaults to First Breach; show the released sets instead.
$('.edition').textContent = edition();
$('#libraryNav span').textContent = String(releasedCards().length);
```

(import `edition, releasedCards` from `./cards.mjs` if not already).

- `README.md`:
  - Title: `# Breach & Defend`.
  - Replace the first three "Included" bullets with:
    - `- 100 original card designs across two sets: First Breach (50) and the opt-in Persistent Threats expansion (50), plus two tokens.`
    - `- Fixed, public 60-card decks: two First Breach starters, and two Persistent Threats decks that mix both sets.`
    - `- An original illustration and a security lesson on every card and token.`
  - After the "Guided first game" section add:

    ```markdown
    ## Persistent Threats

    Tick **Include Persistent Threats** on the start screen, or when inviting a friend, to play the expansion. Both players use decks that mix First Breach and Persistent Threats cards. The expansion adds Probe, Overclock and Reuse, the Backdoor and Indicator tokens, retiring, the archive, triggered abilities and in-match choices; the Field Guide explains each, and quick tips in expansion matches point them out as they come up. The guided first game always uses First Breach.
    ```

  - In "Deliberate simplifications", replace `No multiple resource types, tokens, exile, sideboards, deck editor, or saved computer matches are included.` with `No multiple resource types, sideboards, deck editor, or saved computer matches are included.`
  - In "Source layout", add bullets for `public/persistent-threats.mjs` (expansion card definitions), `public/rules.mjs` (triggers, costs, choices and effects), `public/lore.mjs` (flavor and learning texts), `public/prepare.mjs`, `choices.mjs`, `expansion-view.mjs` and `expansion-tips.mjs` (the expansion interface), and `art-source/cards/*/generation-prompts.json` (image prompts).

- [ ] **Step 6: Run the tests**

Run: `node --test tests/expansion-ui.test.mjs tests/versus-ui.test.mjs tests/views.test.mjs tests/about.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 7: Commit**

```bash
npx --yes prettier@3.9.9 --write public/cards.mjs public/library.mjs public/about.mjs public/versus-ui.mjs public/app.mjs tests/expansion-ui.test.mjs tests/versus-ui.test.mjs
git add public/cards.mjs public/library.mjs public/about.mjs public/versus-ui.mjs public/app.mjs README.md tests/expansion-ui.test.mjs tests/versus-ui.test.mjs
git commit -m "Name the released sets in the header, library, about page and README"
```

---

### Task 7: Announce rejected picks to screen readers

Plan 5's final review deferred two accessibility gaps: the preparation dialog's rejection reason is inserted already filled in, so screen readers may not announce it, and the choice dialog can disable Confirm through `checkTargets` without saying why.

**Files:**
- Modify: `public/index.html` (a persistent live region)
- Modify: `public/app.mjs` (`announce`, calls in `showPrep` and `openChoice`)
- Modify: `public/choices.mjs` (`choiceIssue`), `public/expansion-view.mjs` (`#choice-issue`; drop `role="status"` from `#prep-issue`)
- Modify: `tests/expansion-ui.test.mjs`

**Interfaces:**
- Produces: `choiceIssue(game, st): string | null` — the `checkTargets` message for a complete target selection, else `null`. `choiceReady`'s targets branch becomes "all picks counted and `!choiceIssue(game, st)`".

- [ ] **Step 1: Write the failing test**

In `tests/expansion-ui.test.mjs`, find the test added by commit dc236c0 ("Check choice targets before confirming") — it builds a trigger whose targets `checkTargets` rejects. Append a new test that reuses its setup and asserts:

```js
  assert.equal(choiceIssue(g, st), '<the checkTargets message that test already expects>');
  const html = choiceDialog(state(g), st);
  assert.match(html, /<p class="action-reason" id="choice-issue">/);
  assert.match(html, /<button[^>]*id="choiceConfirm"[^>]*disabled[^>]*aria-describedby="choice-issue"|<button[^>]*id="choiceConfirm"[^>]*aria-describedby="choice-issue"[^>]*disabled/);
```

and for a valid selection `assert.equal(choiceIssue(g, okState), null)` with no `choice-issue` in the markup. Also assert that the preparation dialog's `#prep-issue` no longer carries `role="status"` (adapt the existing rejected-selection test in the same file).

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: FAIL — `choiceIssue` is not exported.

- [ ] **Step 3: Implement**

- `public/choices.mjs`: move the `checkTargets` call out of `choiceReady`'s targets branch into `export function choiceIssue(game, st)`, which returns `null` unless `game.pending.kind === 'targets'` and every required pick is made, and otherwise the message (or `null` when valid). `choiceReady` uses it.
- `public/expansion-view.mjs` `choiceDialog`: when `choiceIssue(game, st)` returns a message, render `<p class="action-reason" id="choice-issue">${esc(issue)}</p>` just before the Confirm toolbar and add `aria-describedby="choice-issue"` to `#choiceConfirm`. In `prepDialog`, remove `role="status"` from `#prep-issue` (the page-level live region below announces it instead).
- `public/index.html`: inside `<body>`, after the main app container, add `<div id="srStatus" class="sr-only" aria-live="polite"></div>`.
- `public/app.mjs`:

```js
// Tells screen-reader users why Confirm is disabled. The region lives outside the dialog, so re-rendering can't drop it.
let announced = '';
function announce(text = '') {
  if (text === announced) return;
  announced = text;
  $('#srStatus').textContent = text;
}
```

Call `announce($('#prep-issue')?.textContent ?? '')` at the end of `showPrep`, `announce($('#choice-issue')?.textContent ?? '')` at the end of `openChoice`, and `announce()` in `close()` and `confirmPrep`/`submitChoice`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/expansion-ui.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write public/choices.mjs public/expansion-view.mjs public/app.mjs public/index.html tests/expansion-ui.test.mjs
git add public/choices.mjs public/expansion-view.mjs public/app.mjs public/index.html tests/expansion-ui.test.mjs
git commit -m "Announce why a selection can't be confirmed"
```

The controller checks it in the browser with VoiceOver or the accessibility tree: picking one card from each discard for Burn Credentials updates `#srStatus`.

---

### Task 8: A playtest harness with the design's balance metrics

**Files:**
- Create: `tests/helpers/playtest.mjs`, `tests/helpers/playtest-cli.mjs`, `tests/pt-playtest.test.mjs`
- Modify: `package.json` (`"playtest"` script)

**Interfaces:**
- Produces:
  - `MATCHUPS` — `'PT vs PT'`, `'PT red vs FB blue'`, `'FB red vs PT blue'`.
  - `setupMatch(seed, sides, first): Game` — an expansion-pool game where an `'fb'` side has its First Breach starter and a fresh opening hand from it.
  - `playtestMatch(seed, sides, first, maxSteps = 20000)` → `{winner, first, turns, stalled, unspent, tokens, reuse, overclock, casts, choices}` (per-player arrays where it says so).
  - `playtest(seeds, matchups = MATCHUPS)` → rows; `interval(k, n)` → a 95% Wilson interval in percent; `report(rows)` → a Markdown table.
  - `npm run playtest -- <seeds>` prints the table (default 50 seeds × 2 starting players × 3 matchups).

- [ ] **Step 1: Write the failing test**

Create `tests/pt-playtest.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {BY_ID} from '../public/cards.mjs';
import {MATCHUPS, interval, playtest, report, setupMatch} from './helpers/playtest.mjs';

test('a First Breach side really plays its starter', () => {
  const g = setupMatch(1, MATCHUPS['PT red vs FB blue'], 0);
  const cards = p => [...g.players[p].deck, ...g.players[p].hand];
  assert.equal(cards(1).length, 60);
  assert.ok(cards(1).every(c => BY_ID[c.id].set === 'first-breach'));
  assert.equal(g.players[1].hand.length, 7);
  assert.ok(cards(0).some(c => BY_ID[c.id].set === 'persistent-threats'));
});

test('every matchup finishes and reports the design’s metrics', () => {
  const rows = playtest([1]);
  assert.deepEqual(rows.map(r => r.matchup), Object.keys(MATCHUPS));
  for (const r of rows) {
    assert.equal(r.games, 2);
    assert.equal(r.stalled, 0, `${r.matchup} stalled`);
    for (const k of ['turns', 'tokensMade', 'tokensUnspent', 'reuseCasts', 'overclocks', 'choices'])
      assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${r.matchup} ${k}`);
  }
  assert.match(report(rows), /\| PT vs PT \| 2 \|/);
});

test('win-rate intervals are sensible', () => {
  assert.deepEqual(interval(0, 0), [0, 0]);
  const [lo, hi] = interval(50, 100);
  assert.ok(lo < 50 && hi > 50 && lo >= 35 && hi <= 65);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/pt-playtest.test.mjs`
Expected: FAIL — cannot find `helpers/playtest.mjs`.

- [ ] **Step 3: Write the harness**

Create `tests/helpers/playtest.mjs`:

```js
// AI-vs-AI playtests for the balance report: the design's metrics per matchup. A measurement, not a correctness test.
import {BY_ID, EXPANSION_POOL, deck} from '../../public/cards.mjs';
import {Game} from '../../public/engine.mjs';

export const MATCHUPS = {
  'PT vs PT': {red: 'pt', blue: 'pt'},
  'PT red vs FB blue': {red: 'pt', blue: 'fb'},
  'FB red vs PT blue': {red: 'fb', blue: 'pt'},
};
const lcg = seed => {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 4294967296);
};

// Player 0 is red. A First Breach side gets its starter deck and an opening hand drawn from it.
export function setupMatch(seed, {red, blue}, first) {
  const g = new Game('red', lcg(seed), {first, pool: EXPANSION_POOL});
  [red, blue].forEach((kind, p) => {
    if (kind !== 'fb') return;
    const P = g.players[p];
    P.deck = g.shuffle(deck(P.faction).map(id => g.card(id)));
    P.hand = [];
    g.draw(p, 7);
  });
  return g;
}

export function playtestMatch(seed, sides, first, maxSteps = 20000) {
  const g = setupMatch(seed, sides, first);
  const m = {tokens: [0, 0], reuse: [0, 0], overclock: [0, 0], casts: [0, 0], choices: 0};
  const createToken = g.createToken.bind(g),
    emit = g.emit.bind(g),
    play = g.play.bind(g);
  g.createToken = (p, id) => (m.tokens[p]++, createToken(p, id));
  g.emit = e => {
    if (e.type === 'cast') {
      m.casts[e.p]++;
      if (e.fromGrave) m.reuse[e.p]++;
    }
    return emit(e);
  };
  g.play = (p, uid, target, options) => {
    if (options?.overclock) m.overclock[p]++;
    return play(p, uid, target, options);
  };
  g.keep([], 0);
  let seen = null;
  for (let step = 0; step < maxSteps && g.winner === null; step++) {
    if (g.pending && g.pending.id !== seen) {
      m.choices++;
      seen = g.pending.id;
    }
    g.aiAction(g.actor());
  }
  const unspent = g.players.map(P => P.field.filter(c => BY_ID[c.id].token).length);
  return {winner: g.winner, first, turns: g.turn, stalled: g.winner === null, unspent, ...m};
}

const sum = pair => pair[0] + pair[1];
export function playtest(seeds, matchups = MATCHUPS) {
  return Object.entries(matchups).map(([matchup, sides]) => {
    const games = seeds.flatMap(seed => [0, 1].map(first => playtestMatch(seed, sides, first)));
    const done = games.filter(g => !g.stalled);
    const avg = f => done.reduce((a, g) => a + f(g), 0) / Math.max(done.length, 1);
    return {
      matchup,
      games: games.length,
      stalled: games.length - done.length,
      redWins: done.filter(g => g.winner === 0).length,
      firstWins: done.filter(g => g.winner === g.first).length,
      turns: avg(g => g.turns),
      tokensMade: avg(g => sum(g.tokens)),
      tokensUnspent: avg(g => sum(g.unspent)),
      reuseCasts: avg(g => sum(g.reuse)),
      overclocks: avg(g => sum(g.overclock)),
      choices: avg(g => g.choices),
    };
  });
}

// A 95% Wilson interval for k wins in n games, in whole percent.
export function interval(k, n) {
  if (!n) return [0, 0];
  const z = 1.96,
    p = k / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.round((c - h) * 100), Math.round((c + h) * 100)];
}

const pct = (k, n) => {
  const [lo, hi] = interval(k, n);
  return `${n ? Math.round((100 * k) / n) : 0}% (${lo}–${hi})`;
};
export function report(rows) {
  const head =
    '| Matchup | Games | Stalled | Red wins | First player wins | Turns | Tokens made | Tokens unspent | Reuse casts | Overclocks | Choices |\n|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|';
  const body = rows.map(r => {
    const n = r.games - r.stalled;
    return `| ${r.matchup} | ${r.games} | ${r.stalled} | ${pct(r.redWins, n)} | ${pct(r.firstWins, n)} | ${r.turns.toFixed(1)} | ${r.tokensMade.toFixed(1)} | ${r.tokensUnspent.toFixed(1)} | ${r.reuseCasts.toFixed(1)} | ${r.overclocks.toFixed(1)} | ${r.choices.toFixed(1)} |`;
  });
  return [head, ...body].join('\n');
}
```

Create `tests/helpers/playtest-cli.mjs`:

```js
// npm run playtest -- [seeds]: prints the balance table for the given number of seeds (default 50).
import {playtest, report} from './playtest.mjs';

const n = Number(process.argv[2] ?? 50);
console.log(report(playtest(Array.from({length: n}, (_, i) => i + 1))));
```

Add to `package.json` scripts: `"playtest": "node tests/helpers/playtest-cli.mjs"`.

Before relying on the counters, confirm in `public/engine.mjs` that `aiAction` calls `this.play(...)`, `this.emit(...)` and that rules call `g.createToken(...)` (instance lookups, so the wrappers see them), and that the Overclock option is named `overclock` in `play()`'s options. Adjust the wrappers to the real names if not, and say so in the report.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/pt-playtest.test.mjs`
Expected: PASS.

Run: `npm run playtest -- 5`
Expected: a three-row Markdown table, no stalls.

Run: `npm test`
Expected: PASS, pristine.

- [ ] **Step 5: Commit**

```bash
npx --yes prettier@3.9.9 --write tests/helpers/playtest.mjs tests/helpers/playtest-cli.mjs tests/pt-playtest.test.mjs package.json
git add tests/helpers/playtest.mjs tests/helpers/playtest-cli.mjs tests/pt-playtest.test.mjs package.json
git commit -m "Add a playtest harness that reports the expansion's balance metrics"
```

---

### Task 9: Release Persistent Threats

**Blocked until** the author has put all 52 PNGs in `art-source/cards/persistent-threats/` (`<name>.png` for every entry in `generation-prompts.json`). If any are missing, stop and report BLOCKED with the list from Step 1.

**Files:**
- Create: `public/art/cards/<slug>.webp` × 52; add `art-source/cards/persistent-threats/*.png` (LFS)
- Modify: `public/cards.mjs` (`released: true`)
- Modify: `tests/engine.test.mjs`, `tests/lore-panel.test.mjs`, `tests/pt-set.test.mjs`, `tests/pt-pool.test.mjs`, `tests/catalog.test.mjs`, `tests/landing.test.mjs`, `tests/views.test.mjs`, `tests/session.test.mjs`
- Modify: this plan (Release section)

**Interfaces:**
- Consumes: lore (Tasks 1–2), prompts (Task 3), `releasedTokens` (Task 6), the harness (Task 8).

- [ ] **Step 1: Check the art is all there**

```bash
node -e '
const fs = require("fs");
const list = JSON.parse(fs.readFileSync("art-source/cards/persistent-threats/generation-prompts.json", "utf8"));
const missing = list.map(p => p.name).filter(n => !fs.existsSync(`art-source/cards/persistent-threats/${n}.png`));
console.log(missing.length ? "MISSING: " + missing.join(", ") : "all 52 present");'
```

Expected: `all 52 present`.

- [ ] **Step 2: Convert to web size**

```bash
node --input-type=module -e '
import {CARDS, TOKENS} from "./public/cards.mjs";
for (const c of [...CARDS.filter(c => c.set === "persistent-threats"), TOKENS.backdoor, TOKENS.indicator]) console.log(`${c.name}\t${c.art}`);' |
while IFS=$'\t' read -r name art; do
  sips -z 512 768 "art-source/cards/persistent-threats/$name.png" --out "$TMPDIR/pt-art.png" >/dev/null &&
    cwebp -quiet -q 80 "$TMPDIR/pt-art.png" -o "public/art/$art.webp"
done
ls public/art/cards | wc -l
```

Expected: `102`. Spot-check that the new files are 768×512 and roughly the size of the First Breach ones (`ls -l public/art/cards | sort -k5 -n | tail`); lower `-q` if they are much larger.

- [ ] **Step 3: Make the release tests cover tokens (failing first)**

`tests/engine.test.mjs`: rename the first test to `'50 First Breach cards, a legal 60-card starter per faction, and art for every released card and token'`, import `releasedTokens`, and change its loop to

```js
  for (const c of [...releasedCards(), ...releasedTokens()])
    assert.ok(fs.existsSync(new URL(`../public/art/${c.art}.webp`, import.meta.url)), c.name);
```

`tests/lore-panel.test.mjs`: import `releasedTokens` and loop over `[...releasedCards(), ...releasedTokens()]` in the first test.

Run: `node --test tests/engine.test.mjs tests/lore-panel.test.mjs` — expected PASS (tokens are unreleased until Step 4). Commit the art and these tests together in Step 6.

- [ ] **Step 4: Flip the flag and update the tests that pinned it**

In `public/cards.mjs`: `'persistent-threats': {name: 'Persistent Threats', code: 'PT1', released: true},`.

- `tests/pt-set.test.mjs`: title `…in order, and is released`; `assert.equal(SETS['persistent-threats'].released, true);`.
- `tests/pt-pool.test.mjs`, first test → `'the expansion pool uses both sets and is offered once released'`:

```js
  assert.deepEqual(releasedPools(), ['first-breach', EXPANSION_POOL]);
  assert.ok(releasedCards().some(c => c.set === 'persistent-threats'));
  assert.match(landing({mode: 'solo'}), /includeExpansion/);
  assert.match(library({filter: {q: '', faction: 'all', type: 'all', set: 'all'}}), /setFilter/);
```

- `tests/catalog.test.mjs` (import `EXPANSION_POOL`): `['first-breach']` → `['first-breach', EXPANSION_POOL]` and `['first-breach', 'mirror']` → `['first-breach', EXPANSION_POOL, 'mirror']`.
- `tests/landing.test.mjs`:
  - In `'the hero counts the released cards'`, add `const n = releasedCards().length;` before the push and match `new RegExp(\`${n + 1} cards · every card teaches\`)` instead of `/51 cards/`.
  - Keep `'no expansion opt-in while First Breach is the only released pool'` meaningful by unreleasing for that test: first line `SETS['persistent-threats'].released = false; t.after(() => (SETS['persistent-threats'].released = true));` (add `t` to its signature and import `SETS`).
- `tests/views.test.mjs`, the library test: expect `${releasedCards().length} cards · 4 decks`, replace `assert.doesNotMatch(html, /id="setFilter"/)` with `assert.match(html, /<option value="persistent-threats" >Persistent Threats<\/option>/)`, keep the `SETS.extra` part.
- `tests/session.test.mjs`: delete both `SETS['persistent-threats'].released = true;` lines and their `t.after(...)` teardowns (they would un-release the set for the rest of the file).

Run: `npm test`
Expected: PASS, pristine. If anything else fails because it assumed the set unreleased, update it the same way (assert the released behaviour; unrelease locally only where the test is about the unreleased case) and list it in the report.

- [ ] **Step 5: Browser walkthrough (controller)**

Serve the worktree (`npm start` or the `game-ui` launch entry pointed at this worktree) with **no temporary edits**:

1. Start screen: **Include Persistent Threats** visible in both modes, disabled with its note while **Guide my first game** is ticked; hero says 100 cards; header reads `PERSISTENT THREATS / 02`, nav `Card library 100`; at 375px the header fits with no horizontal scroll.
2. Library: 100 cards plus the two tokens, set filter works, token search works, expansion art and lore show in dialogs, deck note lists both pools.
3. Field Guide: Persistent Threats section and updated rules scope.
4. A red and a blue expansion training match, a few turns each with quick tips on: tips appear for Probe, Backdoors/Indicators, Reuse, Overclock; card dialogs show the glossary; the recap's "Lessons from this match" shows expansion lessons.
5. A plain First Breach match: no expansion tips, glossary or copy.
6. **Play a friend, two browsers, on a network that reaches the PeerJS broker** (ask the author which network they are on): an expansion invite shows "Cards: First Breach + Persistent Threats" in the lobby for both; the other player's private choice shows only "Your opponent is choosing…"; the guest's dialogs match the host's; a choice answered by the clock closes its dialog; a concede gives **Verified — fair match**.

Check the console for errors. Fix anything found in the module at fault, with a regression test where the logic is pure.

- [ ] **Step 6: Commit the release**

```bash
git add art-source/cards/persistent-threats/*.png public/art/cards/*.webp public/cards.mjs tests/engine.test.mjs tests/lore-panel.test.mjs tests/pt-set.test.mjs tests/pt-pool.test.mjs tests/catalog.test.mjs tests/landing.test.mjs tests/views.test.mjs tests/session.test.mjs
git commit -m "Release Persistent Threats"
```

(The PNGs go through Git LFS per `.gitattributes`. If an SSH push later hangs on the LFS upload, push over HTTPS with the gh credential helper; don't skip LFS for this branch, since it adds LFS files.)

- [ ] **Step 7: Playtest report**

Run: `npm run playtest -- 100`

Append a **Release** section to this plan with the table, the walkthrough results, and anything fixed. The design sets no numeric gate: flag for the author any matchup where a faction's or the first player's win-rate interval lies entirely outside 40–60%, or where the expansion decks beat the First Breach starters in more than 70% of games, as candidates for the design's "first adjustment" table. Tuning decisions are the author's.

---

## Finishing

- [ ] Run `npm test && npm run typecheck && npm run format:check` on the branch tip.
- [ ] Append "Follow-ups" to this plan: balance adjustments the author chooses from the playtest report; the Plan 5 deferred minors not taken here (`togglePick` and `pickChoiceTarget` share a rule; identical untouched tokens share a candidate label; test gaps in the `app.mjs` state machine).
- [ ] Use superpowers:finishing-a-development-branch.
