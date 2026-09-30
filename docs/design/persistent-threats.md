# Breach & Defend: Persistent Threats

Expansion design · Draft 2 · 30 September 2026

**50 new cards: 25 red, 25 blue.** Persistent Threats (set code **PT1**) is an opt-in expansion to the shipped **First Breach** set (FB1). First Breach and its two starter decks remain the default and the introductory experience. Players who opt in play with both sets at once: the Persistent Threats decks mix cards from both sets, and every First Breach card works alongside the new mechanics.

This document is a complete first-pass card design, not an implemented expansion or a claim of tested balance. Costs, stats, and copy counts are playtest starting points. All card names and cybersecurity treatments below are original designs for Breach & Defend.

### Changes from Draft 1

- The base set keeps its shipped name, First Breach (FB1), instead of being renamed Foundation.
- Keywords use the game's own terms: Rapid deploy, Always-on, Stealth, Detection, Overflow, Recharge and Firewall. Flying became Stealth and reach became Detection.
- New terms were renamed to avoid clashing with First Breach cards: Foothold → **Backdoor** (Rebuild Foothold), Evidence → **Indicator** (Erase Evidence), Replay → **Reuse** (Token Replay), Escalate → **Overclock** (Privilege Escalation). Sacrifice → **retire**, dies → **is defeated**, spell → **card cast**.
- Four cards were renamed for being too close to First Breach names: Session Containment Team → Lockdown Coordinator, Case Investigator → Case Analyst, Recovery Orchestrator → Restoration Lead, Behavioral Sensor → Behavioral Monitor. Evidence Workbench became Analysis Workbench.
- Staged Loader and Dead-Drop Courier are now 2/1s, so neither strictly outclasses a First Breach card.
- New sections cover the opt-in, how the sets combine, lore and art requirements, and multiplayer.
- The engine section now reflects the current code in `public/`.

## Intent and identity

First Breach teaches resources, combat, priority, and individual answers. Persistent Threats teaches planning across turns: investing in information, converting preparation into pressure, using the discard strategically, and deciding when a larger response is worth holding compute open.

- **Red — establish, exploit, rebuild.** Small incursions create Backdoors. Spend those Backdoors to push damage, trade for removal, or sustain a campaign. Committing too many resources to one attack creates an opening for blue.
- **Blue — observe, contain, recover.** Indicators turn observations into later cards. Blocking and temporary containment buy time to spend them. Collecting Indicators alone does not win: blue must eventually deploy a threat and attack.
- **Shared decisions.** Probe improves future draws and sets up Reuse. Overclock makes an early card useful late. Spending compute on tokens competes with developing the board or holding a Response.
- **Compatibility.** Keep 20 starting operational capacity, 60-card decks, generic compute, one Infrastructure play per turn, existing phases, and First Breach keywords. No extra turns, infrastructure destruction, alternate victory condition, or repeatable hard counter lock in this set.

More advanced means more decisions and synergies, not a blanket increase in card efficiency. First Breach cards should remain attractive for reliable stats, immediate compute, and unconditional answers. No Persistent Threats card should be strictly better than a First Breach card of the same cost.

## Opting in and mixing sets

### Card pool

A match's **card pool** is either `first-breach` (the default) or `first-breach+persistent-threats`. The pool is fixed when the match is created and applies to both players.

- **First Breach only.** Everything behaves exactly as it does today: the same starter decks, the same deck-list order, and therefore the same shuffles for the same seed. Existing tests, saved matches and audits must not change.
- **With Persistent Threats.** Each player uses their faction's Persistent Threats deck (below). Both decks mix the two sets, so every match exercises cross-set interactions.
- The Persistent Threats rules (tokens, archive, triggers, choices) run in every match, but nothing can trigger them in a First Breach-only match. The engine must not branch on the pool except when building decks.

### Where the choice appears

- **Training match.** The start screen gets an **Include Persistent Threats** checkbox next to **Guide my first game**. It is off by default and remembered per browser, like other preferences (stored in a try/catch, so it falls back to off).
- **Guided first game.** The tutorial teaches First Breach only. While **Guide my first game** is checked, the expansion checkbox is disabled and says why.
- **Play a friend.** The host chooses the card pool when creating the invite. The lobby shows the pool to both players before they take the pledge, so the guest knows what they are agreeing to.
- **Library.** Always shows both sets, with a set filter (All sets / First Breach / Persistent Threats). Each card shows its set code; set and deck counts are derived from the catalog rather than hardcoded.
- **In a match.** The match header says which pool is in play, and the card footer shows each card's set code (`RED / FB1` or `RED / PT1`).

### How First Breach cards interact with the new rules

| First Breach card | Interaction |
|---|---|
| Token Replay, Revoke Sessions | Target units only, so they cannot return tokens. They can return your own Lockdown Coordinator to reuse its entry ability (see balance risks). |
| Disable Safeguard, Configuration Audit | Can destroy a Backdoor or Indicator, since tokens are Tools. Destroying a token is not retiring it, so "whenever you retire" abilities do not trigger. |
| Erase Evidence, Isolate Host | Destroy units only. They cannot target Indicators. |
| Rebuild Foothold, Clean Rebuild | Return any unit card from discard to hand. Archive effects deny them targets. A recovered card is a new object and remembers nothing from its previous trip. |
| Disrupt Telemetry, Block Execution | Counter any Response or Operation, including cards cast with Reuse (which are then archived) and Overclocked cards (neither payment is refunded). They cannot counter triggered or activated abilities. |
| Command Channel, Privilege Escalation, Least Privilege | Modify new units normally and stack with Backdoor boosts. |
| Botnet Reserve, Immutable Backup | Their start-of-turn gains stay automatic and never use the stack. No Persistent Threats card triggers at the start of a turn, so there is nothing to order them against. |
| Phishing-Resistant MFA | Still stops only Phishing-tagged damage. No new card has the Phishing tag; Phishing Courier keeps its tag in the red Persistent Threats deck. |
| Recharge, Overflow | Apply to damage boosted by Backdoors, Overclock or Overflow granted by new cards. |

## Mechanics and rules vocabulary

### Probe N

Privately look at the top N cards of your deck. Put any number of them into your discard, then return the rest to the top in any order. If the deck has fewer than N cards, look at all of them. Probing an empty deck does not make you lose; drawing from it still does.

**Decision:** keep a future draw, or put a Reuse card into discard to cast later. Only cards put into discard become public; the cards you keep and their order remain private.

### Overclock N

When casting this card, you may pay N extra compute once to use its Overclock text. Decide before paying, and show the choice on the stack. Unless the card says "instead", the Overclock effect is added to the normal effect. Every card below that uses "instead" replaces exactly the stated effect.

Overclock does not change the printed cost. Reuse and Overclock can be combined: pay the Reuse cost plus the Overclock cost. A countered card refunds neither payment.

### Reuse N

You may cast this Operation or Response from your discard for N compute instead of its normal cost. Its usual timing, target restrictions and additional costs still apply. When a card cast with Reuse leaves the stack for any reason, it goes to the **archive** instead of any other zone.

The archive is a public, face-up zone, separate from hand, battlefield, deck and discard. Nothing in either set can get archived cards back. Reuse works on cards put straight into discard by Probe or another discard effect; they do not need to have been cast before. A countered or fully invalidated Reuse card is still archived.

### Backdoor token

A red **Tool token**, printed cost 0, with:

> 1 compute, retire this Tool: Target unit you control gets +2/+0 until end of turn. Activate only during your main phase while the stack is empty.

Backdoors are preparation, not extra Infrastructure or free compute. They can also pay costs that ask you to retire a Tool or a Backdoor. First Breach's Tool removal can destroy them.

### Indicator token

A blue **Tool token**, printed cost 0, with:

> 2 compute, retire this Tool: Draw a card. Activate only during your main phase while the stack is empty.

Indicators are delayed card advantage. Creating one does not draw a card; the player must find the time and compute to analyze it.

### Supporting rules

- **Card cast.** Casting means putting any non-Infrastructure card on the stack: Units, Tools, Controls, Operations and Responses. Playing Infrastructure and activating an ability are not casts. A Reuse cast counts as one cast, and so does an Overclocked cast.
- **Enters / leaves / is defeated.** "Enters" means enters the battlefield, including a returned unit. "Is defeated" means a unit moves from the battlefield to discard, whether through damage, destruction or retiring. Being archived or returned to hand is not being defeated.
- **Retire.** Move a permanent you control to its owner's discard. Retiring is not destruction. A retire cost is paid before anyone can respond, and is not refunded if the effect fails. Effects never retire an opponent's permanent.
- **Tokens.** Tokens are real battlefield objects with their own identities. They can be targeted and retired, and trigger the usual leave events. Once they leave the battlefield they stop existing (after any events are recorded); they never become cards in hand or discard. Tokens never count as deck cards.
- **Ready and tap costs.** Ready means untapped. A tapped card cannot pay a tap cost. Every activated ability in this set, except Infrastructure's compute ability, is main-phase and empty-stack only, and its effect uses the stack. Tool and Infrastructure tap abilities can be used the turn they enter if they are ready. No new Unit has a tap ability.
- **Compute.** "Tap: Add 1 compute" keeps First Breach's automatic payment. Each ready Infrastructure pays one compute by tapping; unused compute is not saved. When an Infrastructure ability costs compute and also taps that Infrastructure, pay the compute with other ready Infrastructure. Show the resources being spent before confirming.
- **Enters tapped.** First Breach Infrastructure enters ready. The four new Infrastructure cards enter tapped, trading tempo for utility.
- **Temporary lockdown.** "Doesn't untap during its controller's next untap step" stops the unit untapping at the start of that player's next turn, then expires. Several lockdowns applied before that step all expire together; skipped turns never pile up. Another effect can untap the unit sooner. Lockdown does not remove an attacker that has already been declared.
- **Targets and modes.** Choose modes, Overclock, targets and costs when casting or activating. "Choose one" means exactly one option. Targets are checked again on resolution. With several targets, the effect resolves against whichever are still legal; if none are, nothing happens. Optional "up to" targets can be zero, and a card deliberately cast with zero targets still resolves. If a unit's targeted entry ability fails, the unit stays.
- **"Opposing" targets.** First Breach target restrictions are unchanged: "target unit" can be either player's unit. New cards that say "target opposing unit" or "target unit you control" narrow that.
- **Triggers.** Entry, attack, defeat and end-step triggers go onto the stack after the current action finishes and any resulting defeats are processed. The active player orders their simultaneous triggers first, then the other player puts theirs on top in their chosen order. Either player can respond normally. A trigger already on the stack still resolves if its source is removed. Optional costs inside a resolving trigger are paid on resolution and cannot be responded to.
- **Frequency limits.** "Only once each turn" applies to each battlefield object separately and resets every turn. The first qualifying event counts even if its trigger is countered. Changing zones creates a new object. No card in either set can counter triggered abilities.
- **Reuse and archive triggers.** Casting from discard can trigger abilities even if the card is later countered. Archiving a card from discard is not retiring it. Cards in discard can be archived in response to a recovery card, but not once they have moved to the stack to be cast.
- **New arrival.** Returned and newly created units follow the existing new-arrival rule. Temporary stat changes, damage and battlefield-only restrictions do not follow a card through a zone change.
- **Ownership.** "You" on a permanent means its controller; on a card being cast or an ability, it means whoever cast or activated it. Neither set changes control of permanents.
- **Phishing.** Only effects explicitly tagged Phishing count as Phishing.

## Red cards — establish, exploit, rebuild

Costs are generic compute. Infrastructure has no casting cost but still uses the one-per-turn Infrastructure play. Unit stats are power/toughness. IDs are stable catalog IDs for this set; First Breach IDs (`r0`–`r24`, `b0`–`b24`) are unchanged.

| ID | Card | Cost | Type / stats | Rules text | Learning theme |
|---|---|---:|---|---|---|
| pt-r01 | Ghost Relay | — | Infrastructure | Enters tapped. Tap: Add 1 compute. **3 compute, Tap, retire Ghost Relay:** Create two Backdoors. | Retiring infrastructure may preserve other campaign resources; the trade has a real cost. |
| pt-r02 | Reconnaissance Outpost | — | Infrastructure | Enters tapped. Tap: Add 1 compute. When this enters, **Probe 1**. | Preparation improves decisions but takes time away from immediate action. |
| pt-r03 | Attack Surface Mapper | 1 | Unit — Operator · 1/1 | When this enters, **Probe 1**. | Discovery helps prioritize exposed systems; information is not yet access. |
| pt-r04 | Beachhead Scout | 2 | Unit — Operator · 2/1 | Whenever this deals combat damage to the opponent, create a Backdoor. This triggers only once each turn. | An initial compromise can support subsequent activity. |
| pt-r05 | Staged Loader | 2 | Unit — Malware · 2/1 | Has **Rapid deploy** while you control a Backdoor. | Prepared access can shorten the time between deployment and action. |
| pt-r06 | Dead-Drop Courier | 3 | Unit — Network · 2/1 | **Stealth.** When this is defeated, **Probe 1**. | Losing a delivery path can still reveal information useful to a campaign. |
| pt-r07 | Access Broker | 3 | Unit — Identity · 3/2 | Whenever you retire a Tool, this gets +1/+0 until end of turn. This triggers only once each turn. | Access and supporting resources can be traded for immediate impact. |
| pt-r08 | Dormant Implant | 3 | Unit — Malware · 2/3 | When this enters, create a Backdoor. | A quiet foothold may matter before it produces visible disruption. |
| pt-r09 | Living-off-the-Land Operator | 4 | Unit — Operator · 3/3 | Whenever you cast a card from your discard, draw a card, then discard a card. This triggers only once each turn. | Reusing available capabilities changes what defenders need to investigate. |
| pt-r10 | Redundant Handler | 4 | Unit — Operator · 3/4 | When this is defeated, if this card is still in your discard, you may retire a Backdoor. If you do, return this card to your hand. | Persistent access can enable re-entry unless the underlying foothold is removed. |
| pt-r11 | Coordinated Intrusion Lead | 5 | Unit — Operator · 4/4 | **1 compute, retire a Backdoor:** Target unit you control gets +1/+0 and **Overflow** until end of turn. | Coordination can turn limited access into broader impact. |
| pt-r12 | Long-Haul Campaign | 6 | Unit — Operator · 5/5 | **Overflow.** When this enters, create two Backdoors. | Mature campaigns combine a visible threat with supporting access. |
| pt-r13 | Map Trust Relationships | 1 | Operation | **Probe 2. Reuse 3.** | Trust relationships can matter as much as individual exposed machines. |
| pt-r14 | Seed Access | 2 | Operation | Create two Backdoors. | Distributed preparation gives later actions more options. |
| pt-r15 | Coordinated Pressure | 3 | Operation | Deal 4 damage to target opposing unit. **Overclock 2:** Deal 6 damage instead. | Greater commitment can overwhelm a stronger defense, at the expense of flexibility. |
| pt-r16 | Burn the Channel | 2 | Operation | As an additional cost, retire a Tool. Destroy target opposing unit. | An attacker may abandon a useful channel to achieve an immediate objective. |
| pt-r17 | Cascading Outage | 4 | Operation | Deal 2 damage to every unit. **Overclock 2:** Deal 4 damage to every unit instead. | Broad disruption can damage an attacker's own dependencies as well as the defender's. |
| pt-r18 | Adaptive Payload | 1 | Response | Target unit you control gets +2/+0 until end of turn. **Overclock 2:** It gets +2/+2 and **Overflow** until end of turn instead. | Adaptation changes the impact of an existing foothold; it still requires resources. |
| pt-r19 | Exploit the Handoff | 2 | Response | Deal 2 damage to target opposing unit, or 4 damage if it is tapped as this resolves. | Busy or transitioning systems can present different risks from ready defenses. |
| pt-r20 | Signal Spoof | 2 | Response | Counter target Response or Operation unless its controller pays 2 compute. **Probe 1.** | Deception can consume response capacity without guaranteeing success. |
| pt-r21 | Reopened Connection | 2 | Response | Return target unit you control to its owner's hand. Draw a card. **Reuse 4.** | Preserving an asset can require withdrawing and rebuilding access. |
| pt-r22 | Burn Credentials | 1 | Response | Archive up to two target cards from a single player's discard. **Probe 1.** | Retiring compromised material can deny later reuse; visibility and attribution still matter. |
| pt-r23 | Disposable Cache | 2 | Tool | When this enters, create a Backdoor. **2 compute, Tap, retire another Tool:** Draw two cards, then discard a card. | Campaign resources can be consumed to support a change of approach. |
| pt-r24 | Exfiltration Buffer | 3 | Tool | Whenever one or more units you control deal combat damage to the opponent, draw a card. This triggers only once each turn. | Successful access can create an ongoing information advantage. |
| pt-r25 | Distributed Command | 4 | Control | Whenever you retire a Tool, deal 1 damage to the opponent. This triggers only once each turn. At the beginning of your end step, if you attacked with at least two units this turn, create a Backdoor. | Coordinated campaigns reward repeated activity, but their supporting systems remain attackable. |

## Blue cards — observe, contain, recover

| ID | Card | Cost | Type / stats | Rules text | Learning theme |
|---|---|---:|---|---|---|
| pt-b01 | Forensic Repository | — | Infrastructure | Enters tapped. Tap: Add 1 compute. **3 compute, Tap, retire Forensic Repository:** Create two Indicators. | Preserving information may require dedicating resources that could otherwise run services. |
| pt-b02 | Instrumented Datacenter | — | Infrastructure | Enters tapped. Tap: Add 1 compute. When this enters, **Probe 1**. | Instrumentation improves decisions but carries an operational cost. |
| pt-b03 | Alert Triage Analyst | 1 | Unit — Analyst · 1/1 | When this enters, **Probe 1**. | Triage separates promising evidence from distracting noise. |
| pt-b04 | Canary Service | 2 | Unit — Service · 0/3 | **Firewall.** When this is defeated, create two Indicators. | A monitored decoy can reveal hostile activity even when it is lost. |
| pt-b05 | Telemetry Curator | 2 | Unit — Analyst · 1/2 | When this enters, create an Indicator. | Collection creates potential insight; analysis requires additional effort. |
| pt-b06 | Behavioral Monitor | 3 | Unit — Service · 1/4 | **Detection.** Whenever this blocks, create an Indicator. This triggers only once each turn. | Observing activity during containment can inform the next response. |
| pt-b07 | Case Analyst | 3 | Unit — Analyst · 2/3 | Whenever you retire an Indicator, this gets +1/+1 until end of turn. This triggers only once each turn. | Analyzed evidence can improve the quality of an intervention. |
| pt-b08 | Lockdown Coordinator | 3 | Unit — Analyst · 2/2 | When this enters, tap target opposing unit. That unit doesn't untap during its controller's next untap step. | Containment creates time for investigation without guaranteeing eradication. |
| pt-b09 | Restoration Lead | 4 | Unit — Analyst · 3/3 | When this enters, return target unit card with printed cost 2 or less from your discard to your hand. | Recovery plans should identify useful components and dependencies before an incident. |
| pt-b10 | Adaptive Perimeter | 4 | Unit — Service · 2/5 | **Detection.** Has **Always-on** while you control an Indicator. | Context can support a defense that remains available while acting proactively. |
| pt-b11 | Incident Commander | 5 | Unit — Analyst · 4/4 | **Always-on.** Whenever you retire an Indicator, untap target unit you control. This triggers only once each turn. | Analysis helps coordinate the next available response. |
| pt-b12 | Resilient Service Mesh | 6 | Unit — Service · 4/6 | **Always-on.** When this enters, create two Indicators. | Resilient services pair continued operation with useful observations. |
| pt-b13 | Reconstruct the Timeline | 2 | Operation | **Probe 2**, then draw a card. **Reuse 4.** | Reconstructing events improves the order and focus of an investigation. |
| pt-b14 | Preserve the Scene | 2 | Operation | Create two Indicators. | Preserving evidence retains options for later analysis. |
| pt-b15 | Scoped Remediation | 3 | Operation | Destroy target opposing unit with printed cost 3 or less. **Overclock 2:** You may target and destroy any opposing unit instead. | A narrow response is cheaper; a broader one needs more resources. |
| pt-b16 | Restore Trusted State | 4 | Operation | Return target unit card with printed cost 3 or less from your discard to the battlefield tapped. **Overclock 2:** Return it ready instead. | Recovery can restore service before it is ready for full operational use. |
| pt-b17 | Emergency Segmentation | 4 | Operation | Tap all opposing units. They don't untap during their controller's next untap step. | Broad containment buys a window; it does not remove the underlying threats. |
| pt-b18 | Verify Provenance | 2 | Response | Counter target Response or Operation unless its controller pays 2 compute. If they pay, create an Indicator. | Validation can prevent an action or produce material for follow-up investigation. |
| pt-b19 | Live Response | 2 | Response | Choose one — Return target opposing unit to its owner's hand; or untap target unit you control and it gets +0/+2 until end of turn. | Response choices balance disruption of the threat against keeping a defense available. |
| pt-b20 | Break the Chain | 2 | Response | Destroy target Tool or Control. **Overclock 2:** Also archive up to two target cards from that permanent's controller's discard. | Removing a support mechanism and addressing reusable material can reduce recurrence. |
| pt-b21 | Clean-Room Analysis | 1 | Response | Archive up to two target cards from a single player's discard. Gain 2 operational capacity. | Separating suspect material from reusable resources supports safer recovery. |
| pt-b22 | Continuity Plan | 2 | Response | Target unit you control gets +0/+3 until end of turn. Create an Indicator. **Reuse 4.** | Keeping a service available while collecting evidence supports a more informed recovery. |
| pt-b23 | Analysis Workbench | 2 | Tool | When this enters, create an Indicator. **2 compute, Tap, retire an Indicator:** Draw two cards, then discard a card. | A structured analysis process extracts more value from a limited observation. |
| pt-b24 | Recovery Runbook | 3 | Tool | **2 compute, Tap, archive a unit card from your discard:** Gain 3 operational capacity. | Recovery procedures consume finite trusted resources and require deliberate maintenance. |
| pt-b25 | Continuous Validation | 4 | Control | Whenever an opponent casts their second card in a turn, create an Indicator. Whenever you retire an Indicator, gain 1 operational capacity. This second ability triggers only once each turn. | Repeated verification can generate useful signals, but collecting signals alone does not resolve incidents. |

## Lore and art

Every catalog card needs the same material as First Breach cards before it can be shipped:

- **A `LORE` entry** in `public/lore.mjs`, keyed by card name, with `flavor` (a short in-world quote), `by` (the speaker), and `learn` (a full learning paragraph). The learning themes above are starting points, not the finished text. Learning text explains the real concept and its defenses, never how to perform an attack. Where a mechanic abstracts reality (Reuse, Overclock, tokens), say so, as Credential Broker's text already does for Recharge.
- **The two tokens** need the same treatment, because they show up in the library, previews and the lore panel.
- **Dedicated art** at `public/art/cards/<slug>.webp`, with source prompts in `art-source/cards/persistent-threats/generation-prompts.json`, matching the First Breach layout. Backdoor artwork uses a red access marker; Indicator uses a blue sealed record. Neither should look like a compute resource.
- Visual direction: red emphasizes concealed access routes, modular relays and coordinated operators; blue emphasizes evidence handling, observable systems and organized response. Six-cost units depict the coordinated operation rather than a physically larger person.

The opt-in stays hidden until all 50 cards and both tokens have their lore and art.

## Play patterns and counterplay

### Red: Backdoor tempo

Beachhead Scout has to connect to create value. Dormant Implant is slower but supplies a Backdoor on entry. Staged Loader rewards keeping one in reserve; spending your last Backdoor before declaring it as an attacker removes its Rapid deploy. Once it has been legally declared, losing Rapid deploy does not remove it from combat.

A Backdoor can become a main-phase damage boost, pay Burn the Channel's removal cost, or return Redundant Handler to hand. Those uses compete for the same token. Blue can destroy a Backdoor before a later play, but cannot undo a retire cost already paid. Responding to the Backdoor boost by removing the targeted unit still wastes red's investment.

### Red: Reuse attrition

Probe can trade an immediate draw for access to Map Trust Relationships or Reopened Connection in discard. Living-off-the-Land Operator turns Reuse casts into hand selection. Reuse is deliberately limited to one extra cast, with no free casts, copies, cost reductions or access to archived cards.

Blue can archive a card before red casts it from discard. Once it is on the stack, blue needs a counter or a way to invalidate its target. First Breach's Block Execution remains an efficient answer.

### Blue: Indicator midrange

Telemetry Curator guarantees an Indicator; Behavioral Monitor earns more by blocking. Turning Indicators into cards costs compute that could otherwise cast a unit or hold up a Response. Case Analyst turns analysis into a stronger attack. Incident Commander can untap an attacker in Main II, but because Indicators can only be used in a main phase, blue cannot analyze by surprise during combat.

Red can race while blue spends compute, remove the collectors, or retire a Tool to Burn the Channel. First Breach's Command Channel makes red's smaller bodies more threatening without any new mechanics.

### Blue: containment and recovery

Lockdown Coordinator and Emergency Segmentation create windows to attack or recover. Tapping a unit after it attacks does not prevent its combat damage. Restore Trusted State returns only a small unit, so it cannot repeatedly cheat the six-cost finishers into play. An Overclocked return is ready to block but still has new-arrival delay.

Red's Exploit the Handoff punishes tapped units; blue's Always-on units never tap to attack, which limits its reach. Archive effects interrupt blue's recovery targets. Both factions have ordinary Tool/Control removal for the opponent's persistent value cards.

### First Breach cards still have jobs

- Relay Node and Secure Datacenter enter ready. All four new Infrastructure cards give up immediate tempo for utility.
- SOC Trainee and Recon Operator remain 1/2 for one compute; the new one-cost Probe units are only 1/1.
- Payload Runner (2/2 for two) is still the sturdier body; Staged Loader is a 2/1 that needs a Backdoor for Rapid deploy.
- Rogue Access Point (2/2 Stealth for three) survives trades that Dead-Drop Courier (2/1) does not.
- Incident Responder supplies unconditional Always-on and a 2/2 body for two; Telemetry Curator gives up combat strength for delayed value.
- Exploit Window and Emergency Patch remain efficient, unconditional three-damage Responses. Exploit the Handoff needs a tapped target to beat them.
- Block Execution and Disrupt Telemetry remain unconditional counters for two. The expansion's counters are conditional and offer information instead.
- Isolate Host and Erase Evidence remain unconditional four-cost unit removal. Scoped Remediation needs five compute to remove larger units; Burn the Channel consumes a second resource.
- First Breach's three-cost recovery can return any unit to hand. The expansion's recovery either limits printed cost or needs additional setup.

## Persistent Threats decks

Both decks mix First Breach and Persistent Threats cards. Deck rules: one faction, exactly 60 cards, at most two copies of each card other than the faction's basic First Breach Infrastructure, which is unlimited. The First Breach starters already follow these rules. Tokens are created during play and do not take deck slots. The deck lists are fixed and public, like the starters; there is no deck building or sideboarding.

Each list has 24 Infrastructure, 20 Units and 16 other cards. Neither includes every expansion card. "×2 each" means two copies **of each named card**.

### Red — Persistent Access

| Quantity | Cards | Subtotal |
|---|---|---:|
| 20 | First Breach: Relay Node | 20 |
| ×2 each | Ghost Relay; Reconnaissance Outpost | 4 |
| ×2 each | Attack Surface Mapper; Beachhead Scout; Staged Loader; Dormant Implant; Access Broker; Living-off-the-Land Operator; Redundant Handler; Coordinated Intrusion Lead; Long-Haul Campaign; First Breach: Phishing Courier | 20 |
| ×2 each | Map Trust Relationships; Seed Access; Burn the Channel; Exploit the Handoff; Signal Spoof; Reopened Connection; Exfiltration Buffer; Distributed Command | 16 |
| | **Total** | **60** |

Mulligan toward two or three Infrastructure, an early unit, and either a Backdoor generator or an answer. Decide whether a Backdoor is worth more as pressure, as a removal payment, or as insurance.

Playtest variants (same size): against recovery-heavy opponents, swap the two Signal Spoof for two Burn Credentials. Against Tool/Control-heavy opponents, swap the two Reopened Connection for two First Breach Disable Safeguard.

### Blue — Indicators to Action

| Quantity | Cards | Subtotal |
|---|---|---:|
| 20 | First Breach: Secure Datacenter | 20 |
| ×2 each | Forensic Repository; Instrumented Datacenter | 4 |
| ×2 each | Alert Triage Analyst; Canary Service; Telemetry Curator; Behavioral Monitor; Case Analyst; Lockdown Coordinator; Restoration Lead; Incident Commander; Resilient Service Mesh; First Breach: Incident Responder | 20 |
| ×2 each | Reconstruct the Timeline; Preserve the Scene; Scoped Remediation; Verify Provenance; Live Response; Break the Chain; Analysis Workbench; Continuous Validation | 16 |
| | **Total** | **60** |

Mulligan toward two or three Infrastructure and an early blocker or collector. Establish a board before spending a whole turn analyzing Indicators.

Playtest variants: against Reuse-heavy opponents, swap the two Preserve the Scene for two Clean-Room Analysis. Against wide boards, swap the two Analysis Workbench for two Emergency Segmentation.

### Example opening decisions

Red can play Relay Node and Attack Surface Mapper on turn one, probing toward a future answer. On turn two, a second Relay Node enables Beachhead Scout. On turn three, a third enables Dormant Implant; its Backdoor can be held for Staged Loader's Rapid deploy or for removal instead of being spent immediately. If Scout later connects, red gains another choice, not free compute.

Blue can spend two compute on Telemetry Curator, gaining a 1/2 and an Indicator. On the next turn, three ready compute can pay for Behavioral Monitor, or pay two to analyze the Indicator while leaving one ready. It cannot do both. This resource tension is central to the set.

## Presentation and accessibility

- Keep card text, counters and status visible in enlarged previews on either battlefield. Show modified stats, "skips next untap", token identity and whether an ability can be activated. Never rely on color alone.
- Tokens visibly say **Tool · Token** and show their activation cost.
- Group identical tokens visually with a count, but let players inspect and select each token individually when paying a cost. A highlighted token keeps a stable identity.
- Casting a card with Overclock offers **Standard — total cost** and **Overclocked — total cost**, with the resulting rules visible. Choose targets and retire/archive costs before committing resources. Cancelling this preparation spends nothing.
- Dragging a card from hand never silently chooses Overclock, a mode or a retire cost. Required decisions use the existing target picker. Tokens and Tools on the battlefield are never drag sources: drag-to-block applies to units only, and abilities are activated with an explicit button.
- The discard viewer marks playable Reuse cards, shows total costs, and explains missing timing, compute or targets. A separate read-only viewer shows the archive.
- Probe is shown only to the choosing player, with move-to-discard, reorder and confirm available by keyboard and touch. The opponent sees the cards that reached discard and that the choice finished.
- Pause automatic passing while a choice is pending. Soft counters include "choose not to pay"; when paying is impossible, explain why instead of showing a pointless picker.
- The tutorial stays First Breach-only. Advanced mechanics get optional short lessons that are shown only in matches with Persistent Threats.
- The Field Guide gains a Persistent Threats section. Its "rules scope" section currently says there are no token mechanics and that start-of-turn gains don't use the stack; update it so it stays accurate for both card pools.

## Engine work required before release

The current engine (`public/engine.mjs`) resolves each card by a flat `effect` field with a single `target`, and stack entries are `{card, p, target}`. This expansion needs a rules extension, not just new rows in `public/cards.mjs`.

1. **Catalog, sets and card pools.**
   - Add a `set` field (`first-breach` / `persistent-threats`) and a printed set code (`FB1` / `PT1`) to every card.
   - `add()` currently derives IDs from each card's position within its faction; give new cards the explicit IDs listed above, so First Breach IDs never shift.
   - `CARDS` holds the 100 real cards. `BY_ID` also holds `pt-backdoor` and `pt-indicator`; `TOKENS` exposes their definitions.
   - `deck(faction, pool = 'first-breach')` returns today's starter list unchanged for the default pool, and the explicit lists above otherwise.
   - `new Game(faction, random, {first, mode, pool})` keeps today's defaults.
   - Library counts, the card-footer set code and deck descriptions are derived from the catalog.
2. **Choices that can be saved and replayed.** Pending modes, Probe ordering, optional payments, target lists and optional trigger costs become explicit actions and a serializable `pendingChoice`. `toJSON`/`fromJSON` must round-trip mid-choice. `actor()` returns the player who has to choose.
3. **Costs and payment.** Separate checking availability, preparing targets and modes, paying everything at once, and resolving the effect. Support tap, retire, archive, the Reuse alternative cost and the Overclock additional cost. If any chosen cost has become invalid, nothing is paid.
4. **Stack entries, abilities and events.** Triggered and activated abilities go on the stack with their source, controller, targets and label. Stack entries may have no `card`; update `arena-view.mjs`, `motion.mjs` and `tutorial.mjs`, which read `s.card` today. Process defeats before queueing triggers. Counters continue to target only Responses and Operations.
5. **Zones and objects.** Each player gets a public `archive` alongside `grave`. Tokens are temporary objects. Every zone change creates a new object identity; the engine already gives bounced and recovered cards new uids, and defeat triggers must follow the same rule.
6. **Turn tracking.** Track cards cast per player per turn, which units were declared as attackers, per-object trigger limits, conditional Rapid deploy and Always-on, and skip-next-untap effects. `canAttack` and `attackers()` currently read keywords from static card data; they must use the current, dynamic keywords.
7. **Auto-pass.** `app.mjs` skips your response windows when no card in hand is legal. It must also count castable Reuse cards in discard and pending choices, or players will be skipped past plays they could make.
8. **Computer opponent.** Add decisions for spending tokens, Probe, modes, alternative costs, optional payments and the combat value of lockdown. `aiAction()` resolves pending choices first. It must stay deterministic for a given seed, and must not read hidden information.
9. **Interface.** Token activation, cost selection, discard/Reuse and archive viewers, stack descriptions for abilities, the opt-in checkbox and lobby display, and optional advanced lessons. Keep drag-to-play, drag-to-block and the shared requirement explanations working.

Recommended order: catalog and pools with First Breach unchanged; costs, choices and token actions; event processing and Probe; Overclock; Reuse and archive; dynamic keywords and lockdown; multiplayer protocol; cards, decks, lore, art, the computer opponent and lessons. Do not expose the opt-in until every card is complete.

## Multiplayer (play a friend)

The host runs the authoritative game (`public/match.mjs`). The guest receives redacted views (`viewFor`), checks their shape (`sanitizeView`), and audits the whole match from the revealed seed at the end (`public/audit.mjs`). Every new piece of state and every new action has to fit that model.

- **Match setup.** The invite and saved `Match` state record the card pool. `versusGame(seed, hostFaction, pool)` builds the decks, and the audit replays with the same pool. Invites and saved matches without a pool mean First Breach. Deck lists are public, so both players can know them.
- **Actions.** `applyAction` gains `activate` and `choose`, and `play` forwards its options (Reuse, Overclock, mode, targets, costs). `actionFields` must keep the new fields so the log, sequence de-duplication and the audit's `same()` comparison see them. `unflipAction` and `flip` must swap player indices inside nested targets, trigger entries and `pendingChoice`; flipping twice must return the original state.
- **View validation.** `sanitizeView` accepts only exact field lists. Extend it for `archive`, the new stack-entry shapes, `pendingChoice` and token IDs. Events are currently validated against real cards' lessons; decide how tokens and triggers are represented in `events` and validate those too.
- **Hidden information.**
  - Each player's deck and the opponent's hand stay hidden, as today.
  - Probe: the choosing player sees the probed cards; the opponent sees only that a choice is pending and which cards reached discard.
  - **Probe leaks the host's deck through the log.** Uids follow the public deck lists, so logging the host's Probe order and kept cards would tell the guest which cards the host has on top. Handle it like mulligan bottoms: redact the host's Probe choices in the guest's log to counts, commit to them with a hash salted with the host secret, reveal them at the end, and have the audit check them.
  - The host can see the guest's Probe cards, just as it can see the guest's hand today. That is covered by the existing honor pledge, not prevented.
- **Clocks.** A pending choice belongs to its chooser. `runningClock` must follow `actor()`, so a soft-counter payment decision runs the non-active player's response clock.
- **Timeouts.** Every choice type needs one fixed automatic move, because the audit accepts only the exact `timeoutAction`:
  - Probe: keep every card in its current order.
  - Soft counter: don't pay.
  - Optional retire: decline.
  - Discard after drawing: discard the highest-cost card, like cleanup.
  - Trigger order: the order the triggers were created in.
  - A required target: the legal candidate with the lowest uid.

## Balance review and release checks

### Primary risks

| Risk | Why it matters | First adjustment if playtests confirm it |
|---|---|---|
| Repeated Indicator generation dominates long games | Behavioral Monitor and Continuous Validation can create more cards than red can answer. | Raise a generator's cost or shrink its body before weakening Indicators globally. |
| Early Backdoors make red too explosive | Seed Access plus Rapid deploy or Overflow may produce large attacks. | Increase Seed Access's cost or reduce the Backdoor boost to +1/+0. |
| A two-cost removal card is too reliable | Burn the Channel can be fed cheap tokens. | Raise its compute cost to 3 and keep the retire cost. |
| Containment chains deny too many turns | Lockdown Coordinator plus First Breach's Revoke Sessions locks a unit down every turn for 5 compute (cast, return, recast). Repeated Emergency Segmentation is also oppressive. | Raise Lockdown Coordinator to 4 and test how often the combo comes up. Never let lockdown duration accumulate. |
| Repeated entry effects overwhelm First Breach units | Reuse protection and cheap recovery can recycle token-making bodies. | Tune the recursion cards rather than removing entry effects from the whole set. |
| Too many tapped Infrastructure draws | Utility Infrastructure can make otherwise good hands stall. | Keep four utility Infrastructure per deck; reduce to two before adding stronger compute effects. |
| Information actions make turns drag | Multiple Probe and token decisions slow both solo and multiplayer, and eat into the 20-second response clock. | Batch simultaneous choices where the rules allow, while keeping explicit confirmation and opponent response windows. |

### Rules checks

- All 50 IDs and names are distinct and don't collide with First Breach names or keyword terms. The set has 25 cards per faction: 2 Infrastructure, 10 Units, 5 Operations, 5 Responses, 2 Tools and 1 Control.
- Every card and token has lore and art.
- With the First Breach pool, decks, shuffles, saved matches and audits are identical to the current release.
- Each Persistent Threats deck is exactly 60 cards and respects faction and copy limits. Tokens are not counted as deck cards.
- A token retired to pay a cost cannot also pay another cost or be targeted. Countering the resulting effect does not bring it back.
- The First Breach interaction table above holds in tests.
- Probe handles empty and short decks, private ordering, and Reuse cards deliberately put into discard.
- Reuse obeys timing and target checks, combines correctly with Overclock, and archives the card when it resolves, is countered, or loses all its targets.
- Soft counters offer one all-or-nothing payment choice. Tapped Infrastructure cannot pay again, and declining spends nothing.
- Break the Chain's Overclock archive targets are chosen when casting, from the targeted permanent's controller's discard. If the permanent becomes an illegal target but an archive target is still legal, the legal archive effects still resolve. If every target is illegal, nothing resolves.
- Redundant Handler only returns its original card if it is still in discard. Archiving the card before the trigger resolves prevents the return, and the optional retire is not offered once returning is impossible.
- Combat damage and Recharge gains remain simultaneous. Defeat triggers are queued after the whole combat-damage batch and the resulting defeats. A pending trigger cannot undo a loss.
- A restored ready unit still cannot attack without Rapid deploy. Tapping an attacker does not undo its attack, and neither does losing conditional Rapid deploy after it was declared.
- Conditional Always-on is checked when declaring attackers, and conditional Rapid deploy when validating that declaration. A Backdoor retired as a cost is already gone for those checks on a later action.
- All choice actions round-trip through saved and multiplayer state; each client sees only what it is allowed to. Replaying the same actions and seed gives the same state. Audits verify honest mixed-pool matches and detect tampered Probe choices.

### Playtest plan

Start with fixed-seed games to find illegal actions, deadlocks, runaway triggers, hidden-information leaks and card-conservation failures. Count original cards separately from tokens when checking conservation. Then run human matches with the Persistent Threats pool, for both factions and both starting players. The test harness should also run First Breach starter vs Persistent Threats deck, to check whether the expansion decks simply overpower the starters.

Record win rate by starting player and deck, turns to finish, unspent tokens, tokens converted into cards or damage, Reuse casts, turns unable to deploy because of tapped Infrastructure, and time spent in choices (including clock timeouts in play-a-friend). Report sample sizes and uncertainty; computer-opponent win rates are not proof of balance. Tune a small number of costs or bodies between rounds. Release only when both factions have understandable counterplay and complete solo and play-a-friend matches without unresolved choices.

## Design inspirations

These are design references, not claims that this game reproduces another game's rules.

- **Probe** borrows the decision structure of Magic's surveil: choosing future draws while deciding what enters discard. See Wizards' [Guilds of Ravnica mechanics](https://magic.wizards.com/en/news/feature/guilds-ravnica-mechanics-2018-09-04).
- **Overclock** is inspired by kicker's optional extra payment; **Reuse** by flashback's single extra cast from discard followed by removal from circulation. See Wizards' [Modern Horizons 3 mechanics](https://magic.wizards.com/en/news/feature/modern-horizons-3-mechanics).
- **Indicators** draw on investigate and Clue tokens: collecting a resource now and paying later for a card. See Wizards' [Innistrad Remastered mechanics](https://magic.wizards.com/en/news/feature/innistrad-remastered-mechanics).
- The broader set uses entry triggers, retire trade-offs, modal responses and conditional threats as building blocks. Backdoors, faction packages, costs, learning themes and deck lists are tailored to First Breach and use the game's own terminology.
