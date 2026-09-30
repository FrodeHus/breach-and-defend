// public/card-view.mjs
// Card markup for the hand, battlefield, library and dialogs. Pure strings: each function takes the UI state `s`
// ({game, selected, blocks, blocker}) it needs, so it can be tested without a browser.
import {BY_ID, KEYWORDS, KEYWORD_NAMES} from './cards.mjs';
import {COMBAT_STEPS} from './engine.mjs';
import {esc} from './html.mjs';

export const label = f => f === 'blue' ? 'Blue team' : 'Red team';
const art = d => `art/${d.art}.webp`;
// Battlefield tiles follow MTG Arena: full-bleed art, a name bar, keyword icons and a power/toughness badge instead of status text.
const KEYWORD_ICONS={stealth:'M4 20c6-1 12-6 16-16-7 2-13 7-16 16Zm0 0 9-9',detection:'M12 20V5m-6 6 6-6 6 6',rapid:'M13 3 5 14h6l-1 7 8-11h-6z',alwaysOn:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',recharge:'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z',overflow:'M5 6l6 6-6 6m7-12 6 6-6 6',firewall:'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z'};
const icon=path=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
function tile(d,c,p,{stats,status,attacking,blocking,chosen}){
  const sick=d.type==='Unit'&&c.sick&&!d.keywords?.includes('rapid');
  const damage=c.damage||0,left=d.type==='Unit'?stats.toughness-damage:0;
  const states=[c.tapped&&'tapped',sick&&'new arrival',damage&&`${damage} damage`,attacking&&'attacking',blocking&&'blocking'].filter(Boolean);
  const combat=status.filter(s=>/^↳|blocker/.test(s));
  const label=`${d.name}${d.type==='Unit'?`, ${stats.power} power, ${left} of ${stats.toughness} toughness`:`, ${d.type}`}${(d.keywords||[]).map(k=>`, ${k}`).join('')}${states.length?`, ${states.join(', ')}`:''}`;
  return `<button class="card tile ${d.faction} ${p===0?'mine':'theirs'} ${attacking?'attack-selected':''} ${blocking?'block-selected':''} ${c.tapped?'tapped':''} ${chosen?'selected':''} ${sick?'sick':''}" data-motion-uid="${c.uid}" data-card="${d.id}" data-uid="${c.uid}" data-zone="field" aria-label="${esc(label)}"><div class="art" style="background-image:url('${art(d)}')"></div><div class="tile-name">${d.name}</div>${d.keywords?.length?`<div class="tile-keywords">${d.keywords.map(k=>`<span title="${esc(KEYWORD_NAMES[k])}: ${esc(KEYWORDS[k])}">${icon(KEYWORD_ICONS[k])}</span>`).join('')}</div>`:''}${d.type==='Unit'?`<span class="stats tile-pt">${stats.power}/<span class="${damage?'hurt':''}">${left}</span></span>`:`<span class="tile-kind">${d.type}</span>`}${sick?'<span class="tile-sick" title="New arrival: cannot attack this turn">z<small>z</small></span>':''}${combat.length?`<div class="card-status">${combat.join(' · ')}</div>`:''}</button>`;
}
export function card(s,c,{zone='',p=null,detail=false}={}){const {game,selected,blocks,blocker}=s;const d=BY_ID[c.id||c],live=c.uid!==undefined;let status=[];if(live&&zone==='field'){if(c.tapped)status.push('Tapped');if(d.type==='Unit'&&c.sick&&!d.keywords?.includes('rapid'))status.push('New arrival');if(c.damage)status.push(`${c.damage} damage`);if(game.attacks.includes(c.uid))status.push('↗ Attacking');const a=Object.entries(blocks).find(([,bs])=>bs.includes(c.uid));if(a){const target=game.find(Number(a[0]));status.push(`↳ Blocks ${target?BY_ID[target.card.id].name:"departed attacker"}`);}const count=(blocks[c.uid]||[]).length;if(count)status.push(`${count} blocker${count===1?"":"s"}`);}const chosen=live&&(selected.has(c.uid)||blocker===c.uid||Object.values(blocks).flat().includes(c.uid));const combatStep=game&&COMBAT_STEPS.includes(game.phase);const attacking=live&&zone==='field'&&combatStep&&(game.attacks.includes(c.uid)||(game.phase==='attack'&&selected.has(c.uid)));const blocking=live&&zone==='field'&&combatStep&&(blocker===c.uid||Object.values(blocks).flat().includes(c.uid)||Object.values(game.blocks).flat().includes(c.uid));const stats=live&&p!==null&&zone==='field'?game.stats(c,p):{power:d.power,toughness:d.toughness};if(live&&zone==='field'&&!detail)return tile(d,c,p,{stats,status,attacking,blocking,chosen});return `<${detail?'div':'button'} class="card ${d.faction} ${attacking?'attack-selected':''} ${blocking?'block-selected':''} ${c.tapped&&zone==='field'?'tapped':''} ${chosen?'selected':''} ${game&&zone==='hand'&&game.legal(0,c)?'playable':''}" ${detail?'':`data-motion-uid="${c.uid||''}" data-card="${d.id}" data-uid="${c.uid||''}" data-zone="${zone}" aria-label="${esc(d.name)}${d.type==='Unit'?`, ${stats.power} power, ${stats.toughness} toughness`:''}"`}><div class="card-top"><span class="card-title">${d.name}</span><span class="cost">${d.type==='Infrastructure'?'◇':d.cost}</span></div><div class="art" role="img" aria-label="${esc(d.name)} cyberpunk illustration" style="background-image:url('${art(d)}')"></div><div class="card-type">${d.type}${d.subtype?' · '+d.subtype:''}</div><div class="card-text">${d.text||'Deploy this unit to attack or block.'}</div>${status.length?`<div class="card-status">${status.join(' · ')}</div>`:''}<div class="card-bottom"><span>${d.faction.toUpperCase()} / FB1</span>${d.type==='Unit'?`<span class="stats">${stats.power}/${stats.toughness}</span>`:'<span>◇</span>'}</div></${detail?'div':'button'}>`;}
export function playStatus(s,c){const {game}=s;
  if(!game||!c)return '';
  const issues=game.playIssues(0,c);
  return issues.length?`<div class="play-status"><strong>Cannot play yet</strong><ul>${issues.map(issue=>`<li>${esc(issue.message)}</li>`).join('')}</ul></div>`:'<div class="play-status ready"><strong>Ready to play</strong></div>';
}
export function hoverCard(s,el){const {game}=s;
  const id=el.dataset.card,zone=el.dataset.zone,uid=Number(el.dataset.uid);
  const found=uid?game?.find(uid):null,c=found?.card,d=BY_ID[id];
  if(!d)return '';
  return `${card(s,c||id,{detail:true,zone,p:found?.p??null})}<blockquote class="preview-flavor">“${esc(d.flavor)}”</blockquote>${zone==='hand'?playStatus(s,c):''}${d.keywords?.length?`<div class="preview-keywords">${d.keywords.map(k=>`<p><strong>${esc(KEYWORD_NAMES[k])}.</strong> ${esc(KEYWORDS[k])}</p>`).join('')}</div>`:''}`;
}
