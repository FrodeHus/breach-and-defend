// public/arena-view.mjs
// Arena markup: opening hand, battlefield, command bar, tutorial panels and the match recap. Pure strings: each
// function takes the UI state `s` assembled by app.mjs, so it can be tested without a browser.
import {BY_ID, KEYWORDS, KEYWORD_NAMES} from './cards.mjs';
import {PHASE_NAMES, COMBAT_STEPS} from './engine.mjs';
import {LESSONS} from './tutorial.mjs';
import {lorePanel} from './lore-panel.mjs';
import * as versusUi from './versus-ui.mjs';
import {esc} from './html.mjs';
import {card, label, playStatus} from './card-view.mjs';

export function opening(s) {
  const {game, versus, selected} = s;
  return `<div class="start">${guidedPanel(s)}<div class="eyebrow">${label(game.players[0].faction).toUpperCase()} / OPENING HAND</div><h1>Plan your first move.</h1><p class="muted">Aim for two or three infrastructure cards and a few low-cost units. ${!versus || game.first === 0 ? 'You play first and skip your first draw.' : 'Your opponent plays first. You draw on your first turn.'}</p>${versus ? versusUi.matchStatus(versus, Date.now()) : ''}<div class="notice">${game.mulligans ? `<strong>Select ${game.mulligans} card${game.mulligans === 1 ? '' : 's'} to put on the bottom of your deck.</strong> Selected: ${selected.size}/${game.mulligans}` : 'Keep these seven cards, or shuffle and draw seven again. Each mulligan means putting one more card on the bottom when you keep.'}</div><div class="opening-hand">${game.players[0].hand.map(c => card(s, c, {zone: 'opening'})).join('')}</div>${versus && game.kept[0] ? '<p class="notice" role="status">Hand kept. Waiting for your opponent to keep theirs…</p>' : `<div class="toolbar"><button class="primary" id="keep" ${selected.size !== game.mulligans ? 'disabled' : ''}>Keep hand${game.mulligans ? ` · Bottom ${game.mulligans}` : ''}</button><button id="mulligan" ${game.mulligans === 7 ? 'disabled' : ''}>Mulligan${game.mulligans ? ` (${game.mulligans})` : ''}</button><button id="quit">${versus ? 'Leave match' : 'Choose another faction'}</button></div>`}<p class="footer-note">Click a card to inspect it${game.mulligans ? ' or choose it for the bottom of your deck' : ''}. You can inspect cards at any time in the card library.</p></div>`;
}
export function playerBar(s, p) {
  const {game, versus} = s;
  const q = game.players[p];
  return `<div data-player="${p}" class="player-bar ${p === 0 ? 'you' : ''} ${game.actor() === p ? 'has-priority' : ''}"><div class="avatar" style="color:var(--${q.faction})"><img class="faction-emblem" src="art/${q.faction}-emblem.png" alt="${label(q.faction)} emblem" width="64" height="64"></div><div class="player-info"><strong>${p === 0 ? 'YOU' : versus ? 'OPPONENT' : 'COMPUTER'} / ${label(q.faction)}</strong><small>${game.actor() === p ? 'Your action' : game.active === p ? 'Active turn' : 'On standby'} · ${q.hand.length} in hand</small></div><div class="hp" style="color:var(--${q.faction})" aria-label="${p === 0 ? 'Your' : versus ? 'Opponent' : 'Computer'} capacity ${q.life}">${q.life}<small>CAPACITY</small></div><div class="card-piles"><div class="pile deck-pile ${q.faction}" aria-label="${q.deck.length} cards in deck"><b>${q.deck.length}</b><span>Deck</span></div><button class="pile discard-pile" data-grave="${p}" aria-label="View ${p === 0 ? 'your' : 'opponent’s'} discard, ${q.grave.length} cards"><b>${q.grave.length}</b><span>Discard</span></button></div></div>`;
}
export function resources(s, p) {
  const {game} = s;
  const lands = game.players[p].field.filter(c => BY_ID[c.id].type === 'Infrastructure'),
    ready = game.mana(p),
    faction = game.players[p].faction,
    description = `${p === 0 ? 'Your' : 'Opponent’s'} compute: ${ready} available of ${lands.length} total.${p === 0 ? (game.players[0].landPlayed ? ' Infrastructure played this turn.' : ' You may play one infrastructure this turn.') : ''}`;
  return `<div class="resources compute-pile" style="--pile-width:${Math.max(94, 37 + (lands.length - 1) * 14)}px" role="img" tabindex="0" aria-label="${description}" title="${description}"><div class="compute-stack ${faction} ${lands.length ? '' : 'empty'}" aria-hidden="true">${lands.map((c, i) => `<span data-motion-uid="${c.uid}" class="resource stack-layer ${c.tapped ? 'used' : ''}" style="--offset:${i * 14}px"></span>`).join('')}</div><b class="compute-count" aria-hidden="true">${ready}<span>/${lands.length}</span></b></div>`;
}
export function zone(s, p) {
  const {game} = s;
  const field = game.players[p].field.filter(c => BY_ID[c.id].type !== 'Infrastructure');
  const name = p === 0 ? 'Your battlefield' : 'Opponent battlefield';
  return `<div class="zone-head battlefield-heading"><span class="lane-label"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/></svg>${name}</span><span class="deployed-counter" role="img" aria-label="${field.length} deployed cards" title="${field.length} deployed cards"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 16H3V3h12v2M9 20H7V7h12v2"/><rect x="11" y="11" width="10" height="12" rx="1"/></svg><strong aria-hidden="true">${field.length}</strong></span></div><div class="board-row">${field.length ? field.map(c => card(s, c, {zone: 'field', p})).join('') : `<div class="empty-zone"><span>${p === 0 ? 'Deploy units, tools, and controls from your hand.' : 'No opposing units or controls deployed.'}</span></div>`}</div>`;
}
export function phaseGroup(s) {
  const {game} = s;
  const p = game.phase;
  return ['upkeep', 'draw'].includes(p)
    ? 0
    : p === 'main1'
      ? 1
      : ['beginCombat', ...COMBAT_STEPS].includes(p)
        ? 2
        : p === 'main2'
          ? 3
          : 4;
}
export function hint(s) {
  const {game, versus, selected, blocker} = s;
  if (game.winner !== null) return 'Match complete. Review the lessons from your cards.';
  if (game.actor() === 1) return versus ? 'Waiting for your opponent…' : 'Computer is considering its next move…';
  if (game.phase === 'attack')
    return `Select ready units to attack. ${selected.size} selected. Units that attack usually tap and cannot block next turn.`;
  if (game.phase === 'block')
    return blocker
      ? 'Now select an opposing attacker to block.'
      : 'Select one of your untapped units, then select the attacker it should block. You may assign multiple blockers.';
  if (game.phase === 'cleanup')
    return `Select ${game.players[0].hand.length - 7} cards from your hand to discard. ${selected.size} selected.`;
  if (game.stack.length) return 'An effect is on the stack. Cast a Response, or pass priority to let it resolve.';
  if (['main1', 'main2'].includes(game.phase) && game.active === 0)
    return 'Play a card. Ready infrastructure pays its cost.';
  return 'You have priority. Cast a Response or continue to the next step.';
}
export function buttonLabel(s) {
  const {game, selected, blocks} = s;
  if (game.phase === 'attack') return selected.size ? `Attack with ${selected.size}` : 'Skip attack';
  if (game.phase === 'block') return Object.values(blocks).flat().length ? 'Confirm blocks' : 'Take unblocked damage';
  if (game.phase === 'cleanup') return 'Discard selected';
  if (game.stack.length) return 'Pass priority';
  if (game.phase === 'main1' && game.active === 0) return 'Go to combat';
  if (game.phase === 'main2' && game.active === 0) return 'End turn';
  return 'Continue';
}
export function guidedPanel(s) {
  const {game, selected, blocks, blocker, guidance} = s;
  const lesson = game ? guidance.step(game, {selected, blocks, blocker}) : null;
  if (!lesson) return '';
  const finished = lesson.id === 'complete' || lesson.id === 'ended';
  return `<section class="guided-tutorial" aria-label="First game tutorial"><div class="tutorial-copy" role="status" aria-live="polite" aria-atomic="true"><div class="eyebrow">FIRST PLAY / ${guidance.completed.size} OF ${LESSONS.length} LESSONS</div><h2>${lesson.title}</h2><p id="tutorialInstruction">${lesson.text}</p></div><div class="tutorial-progress"><progress aria-label="Tutorial lessons completed" value="${guidance.completed.size}" max="${LESSONS.length}"></progress><ol>${LESSONS.map(([id, label]) => `<li class="${guidance.completed.has(id) ? 'done' : ''}" ${lesson.id === id ? 'aria-current="step"' : ''}><span aria-hidden="true">${guidance.completed.has(id) ? '✓' : '○'}</span> ${label}<span class="sr-only">${guidance.completed.has(id) ? ' — completed' : ''}</span></li>`).join('')}</ol><button id="exitTutorial" class="small">${finished ? 'Continue playing' : 'Exit tutorial'}</button></div></section>`;
}
export function tutorialText(s) {
  const {game} = s;
  if (game.phase === 'block')
    return '<strong>Block smart.</strong> A blocker deals its power to its attacker while receiving damage back. A unit survives if damage stays below its toughness. Stealth needs Stealth or Detection to block.';
  if (game.stack.length)
    return '<strong>Responses resolve last in, first out.</strong> Players alternate priority. When both pass, the top effect resolves. You then get another chance to respond.';
  if (game.phase === 'attack')
    return '<strong>Choose your attackers.</strong> New units wait a turn unless they have Rapid deploy. Always-on lets a unit attack without tapping. Keep some units ready if you need blockers.';
  if (game.players[0].field.length === 0)
    return '<strong>First, build your resources.</strong> Play one Infrastructure card for free during your main phase. Each ready infrastructure pays for one compute.';
  if (!game.players[0].field.some(c => BY_ID[c.id].type === 'Unit'))
    return '<strong>Deploy a unit.</strong> The number at top right is its compute cost. Bottom-right numbers are power / toughness. Cards with bright borders can be played now.';
  return '<strong>Keep a Response ready.</strong> Spending all your compute leaves you unable to respond. Click any card to see its rules and security lesson.';
}
export function battlefield(s) {
  const {game, versus, inspectorOpen, tutorial, pauseAll, guidance} = s;
  const can = game.actor() === 0 && game.winner === null;
  return `<div class="workspace ${inspectorOpen ? 'inspector-open' : ''} ${guidance.enabled ? 'has-guidance' : ''}">${guidedPanel(s)}<section class="table" aria-label="Game arena"><div class="match-top"><div><div class="eyebrow">FIRST BREACH / ${versus ? 'VERSUS' : 'TRAINING'} MATCH</div><h2>Turn ${game.turn} <span class="muted">/ ${PHASE_NAMES[game.phase]}</span></h2>${versus ? versusUi.matchStatus(versus, Date.now()) : ''}</div><div class="toolbar"><button class="small" id="inspectorToggle" aria-expanded="${inspectorOpen}" aria-controls="intelligence">${inspectorOpen ? 'Close details' : 'Card details & log'}</button><button class="small" id="quit">Leave match</button></div></div>${tutorial ? `<div class="notice tutorial-step"><div>${tutorialText(s)}</div><button class="small" id="hideTutorial" aria-label="Hide tutorial">×</button></div>` : ''}<div class="player-end opponent-end">${playerBar(s, 1)}${resources(s, 1)}</div><section class="battle-lane opponent-lane" aria-label="Opponent battlefield">${zone(s, 1)}</section><div class="combat-divider"><span>${COMBAT_STEPS.includes(game.phase) ? 'COMBAT' : 'BREACH / DEFEND'}</span></div><section class="battle-lane your-lane" aria-label="Your battlefield">${zone(s, 0)}</section><div class="player-end your-end">${resources(s, 0)}${playerBar(s, 0)}</div>${
    game.stack.length
      ? `<div class="effect-stack" aria-label="Pending effects"><div class="eyebrow">STACK / RESOLVES TOP FIRST</div>${[
          ...game.stack,
        ]
          .reverse()
          .map(
            s =>
              `<div class="stack-item" data-motion-uid="${s.card.uid}"><strong>${BY_ID[s.card.id].name}</strong>${s.p === 0 ? 'You' : versus ? 'Opponent' : 'Computer'}${s.target ? ' → ' + esc(game.targetName(s.target)) : ''}</div>`,
          )
          .join('')}</div>`
      : ''
  }<div class="command-area"><div class="phase-bar" aria-label="Turn phases">${['Start', 'Main I', 'Combat', 'Main II', 'End'].map((t, i) => `<span class="phase ${phaseGroup(s) === i ? 'current' : ''}" ${phaseGroup(s) === i ? 'aria-current="step"' : ''}>${t}</span>`).join('')}</div><div class="action-bar"><div class="hint" aria-live="polite">${hint(s)}</div>${game.winner !== null ? '<button class="primary" id="recap">View recap</button>' : `<button class="primary" id="advance" ${!can ? 'disabled' : ''}>${buttonLabel(s)}</button>`}</div></div><div class="hand-dock"><div class="zone-head"><span>Your hand / ${game.players[0].hand.length} cards · Drag to your battlefield</span><button class="text-button" id="tutorialToggle">${tutorial ? 'Hide tips' : 'Quick tips'}</button></div><div class="hand">${game.players[0].hand.length ? game.players[0].hand.map(c => card(s, c, {zone: 'hand'})).join('') : '<p class="muted">Your hand is empty. Draw a card on your next turn.</p>'}</div><label class="muted priority-option"><input type="checkbox" id="pauseAll" ${pauseAll ? 'checked' : ''}> Pause at every priority window</label></div></section><aside class="sidebar" id="intelligence" ${inspectorOpen ? '' : 'hidden'}><div class="eyebrow">CARD INTELLIGENCE</div><div id="inspection">${inspection(s)}</div><div class="log"><div class="eyebrow">MATCH LOG</div><ol>${game.log
    .slice(0, 14)
    .map(l => `<li>${esc(l)}</li>`)
    .join('')}</ol></div></aside></div>`;
}
export function inspection(s) {
  const {inspect, loreSide} = s;
  const d = BY_ID[inspect];
  return `<div class="inspect">${card(s, d.id, {detail: true})}</div>${lorePanel(d, loreSide)}`;
}

// Dialogs. app.mjs puts these in the modal and wires their buttons.
export function cardDialog(s, id, c, zone) {
  const {game, loreSide} = s;
  const d = BY_ID[id],
    can = c && zone === 'hand' && game.legal(0, c);
  return `<div class="eyebrow">FIRST BREACH / ${d.faction.toUpperCase()} TEAM</div><div class="modal-card">${card(s, c || id, {detail: true})}<div><h2>${d.name}</h2>${lorePanel(d, loreSide)}${(d.keywords || []).map(k => `<p><strong>${KEYWORD_NAMES[k]}</strong><br>${KEYWORDS[k]}</p>`).join('')}${zone === 'hand' ? `<div id="castRequirements">${playStatus(s, c)}</div><button id="cast" class="primary" aria-describedby="castRequirements" ${can ? '' : 'disabled'}>${d.type === 'Infrastructure' ? 'Play infrastructure' : 'Cast card'}${d.cost ? ' · ' + d.cost + ' compute' : ''}</button>` : ''}</div></div>`;
}
export function targetDialog(s, d, ts) {
  const {game} = s;
  return `<div class="eyebrow">CAST ${d.name.toUpperCase()}</div><h2>Choose a target.</h2><p class="muted">${d.text}</p><div class="targets">${ts
    .map((t, i) => {
      const f = t.kind === 'card' ? game.find(t.uid) : null;
      return `<button data-target="${i}">${esc(game.targetName(t))}<small class="muted">${f ? ` · ${f.p === 0 ? 'Yours' : 'Opponent’s'} · ${f.zone === 'grave' ? 'Discard' : BY_ID[f.card.id].type}` : ' · On the stack'}</small></button>`;
    })
    .join('')}</div>`;
}
export function graveDialog(s, p) {
  const {game} = s;
  return `<h2>${p === 0 ? 'Your' : 'Opponent’s'} discard</h2><div class="grid">${game.players[p].grave.map(c => card(s, c)).join('') || '<p>No discarded cards yet.</p>'}</div>`;
}
export function leaveDialog(s) {
  const {versus} = s;
  return `<h2>Leave this match?</h2><p>${versus ? 'Leaving concedes the match to your opponent.' : 'Your current match will end. You can start a new match as either faction.'}</p><div class="toolbar"><button id="leave" class="primary">Leave match</button><button id="stay">Keep playing</button></div>`;
}
export function recapView(s) {
  const {game, versus} = s;
  const won = game.winner === 0;
  const unique = [...new Map(game.events.map(e => [e.name, e])).values()];
  return `<div class="result"><div class="eyebrow">${versus ? 'VERSUS' : 'TRAINING'} MATCH / COMPLETE</div><h2>${game.winner === 'draw' ? 'Mutual shutdown' : won ? 'Operation successful.' : 'Operation disrupted.'}</h2><p>${esc(game.reason)}</p><div class="tags" style="justify-content:center"><span class="tag">${game.turn} turns</span><span class="tag">${game.players[0].life} your capacity</span><span class="tag">${game.players[1].life} opponent capacity</span></div>${versus ? `<div id="auditResult">${versusUi.auditLine(versus.audit)}</div><button class="primary" id="versusDone">Back to arena</button>` : '<button class="primary" id="rematch">Play again</button> <button id="chooseSide">Change faction</button>'}</div><h3>Lessons from this match</h3>${
    unique.length
      ? unique
          .slice(-6)
          .map(e => `<div class="lesson"><strong>${esc(e.name)}</strong><p>${esc(e.lesson)}</p></div>`)
          .join('')
      : '<p class="muted">Play cards to discover their security lessons.</p>'
  }`;
}
