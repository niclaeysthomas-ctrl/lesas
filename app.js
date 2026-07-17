/* ============================================================
   LE SAS — front screen : cockpit + friction + rituels
   Locale-first (localStorage), mobile-first, offline.
   ============================================================ */
'use strict';

const DAY = 86400000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const yesterdayStr = () => new Date(Date.now() - DAY).toISOString().slice(0, 10);
const FOCUS_LEN = 25 * 60; // pomodoro 25 min

const BASE = 'https://niclaeysthomas-ctrl.github.io';
const DEFAULT = {
  xp: 0, streak: 0, lastValid: null,
  today: null,
  tomorrowOneThing: '',
  quests: [
    { id: 'en',  em: '🇬🇧', label: 'Anglais (990)',        url: BASE + '/990/',        active: true },
    { id: 'es',  em: '🇪🇸', label: 'Espagnol (CUMBRE)',    url: BASE + '/cumbre/',     active: true },
    { id: 'sp',  em: '💪', label: 'Sport (FORGE)',         url: BASE + '/forge/',      active: true },
    { id: 'of',  em: '🎯', label: 'Candidature (OFFENSIVE)', url: BASE + '/offensive/', active: true },
    { id: 'fi',  em: '💼', label: 'Finance (CLOSING)',     url: BASE + '/closing/',    active: false },
    { id: 'gu',  em: '🎸', label: 'Guitare (SHRED)',       url: BASE + '/shred/',      active: false },
    { id: 'pi',  em: '🎹', label: 'Piano (PIANO-DOJO)',    url: BASE + '/piano-dojo/', active: false },
    { id: 'tt',  em: '🏓', label: 'Ping (TOPSPIN)',        url: BASE + '/topspin/',    active: false },
    { id: 'lec', em: '📖', label: 'Lecture 20 min',        url: '',                    active: false },
    { id: 'med', em: '🧘', label: 'Respiration 5 min',     url: '',                    active: false }
  ],
  blocksText: [
    '07:00-08:30 Réveil, langues, café',
    '08:30-12:30 Deep work / cours',
    '12:30-14:00 Pause déjeuner',
    '14:00-18:00 Travail, stage, projets',
    '18:00-19:30 Sport',
    '19:30-21:30 Perso, musique, dîner',
    '21:30-23:00 Clôture, lecture, dodo'
  ].join('\n'),
  fricApps: [
    { label: 'Instagram', url: 'https://www.instagram.com' },
    { label: 'TikTok',    url: 'https://www.tiktok.com' },
    { label: 'YouTube',   url: 'https://www.youtube.com' },
    { label: 'X',         url: 'https://x.com' },
    { label: 'Reddit',    url: 'https://www.reddit.com' }
  ],
  history: [],
  log: {},      // { 'YYYY-MM-DD': { questId: 1 } } — constance par app
  journal: {},  // { 'YYYY-MM-DD': [ { t, done, c, ts } ] } — journal quotidien archivé
  firstRun: true
};

function newDay() {
  return { date: todayStr(), intention: '', oneThing: { text: S && S.tomorrowOneThing ? S.tomorrowOneThing : '', done: false },
           boss: { text: '', done: false }, quests: {}, focusSec: 0, evening: false, fric: {}, awarded: {} };
}

let S = load();
function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('lesas') || '{}');
    const s = Object.assign({}, DEFAULT, raw);
    if (!s.log) s.log = {};
    if (!s.journal) s.journal = {};
    return s;
  } catch (e) { return Object.assign({}, DEFAULT); }
}
function save() { localStorage.setItem('lesas', JSON.stringify(S)); }

function resetDayIfNeeded() {
  if (!S.today || S.today.date !== todayStr()) {
    if (S.today) {
      // snapshot des quêtes du jour écoulé dans le log de constance
      const prev = S.today.date;
      S.log[prev] = S.log[prev] || {};
      Object.keys(S.today.quests).forEach(id => { if (S.today.quests[id]) S.log[prev][id] = 1; });
      // report des entrées de journal non faites → aujourd'hui, marquées J+n
      const carry = (S.journal[prev] || []).filter(it => !it.done);
      if (carry.length) {
        const nd = todayStr();
        S.journal[nd] = (S.journal[nd] || []).concat(
          carry.map(it => ({ t: it.t, done: false, c: (it.c || 0) + 1, ts: Date.now() }))
        );
      }
      S.history.push({
        date: S.today.date, intention: S.today.intention,
        oneThing: S.today.oneThing.text, oneThingDone: S.today.oneThing.done,
        quests: Object.values(S.today.quests).filter(Boolean).length,
        focusMin: Math.round(S.today.focusSec / 60)
      });
      if (S.history.length > 120) S.history = S.history.slice(-120);
    }
    S.today = newDay();
    S.tomorrowOneThing = '';
    save();
  }
}

/* ---------- XP / niveau / streak ---------- */
function levelFromXp(xp) {
  let lv = 1, need = 120, acc = 0;
  while (xp >= acc + need) { acc += need; lv++; need = Math.round(need * 1.3); }
  return { lv, into: xp - acc, need };
}
function addXp(n) {
  const before = levelFromXp(S.xp).lv;
  S.xp += n; save();
  const after = levelFromXp(S.xp).lv;
  if (after > before) toast(`⭐ Niveau ${after}`);
}
function awardOnce(key, n) {
  if (S.today.awarded[key]) return;
  S.today.awarded[key] = 1; addXp(n);
}
function validateDay() {
  if (S.lastValid === todayStr()) return;
  S.lastValid === yesterdayStr() ? S.streak += 1 : S.streak = 1;
  S.lastValid = todayStr(); save();
  toast(`🔥 Journée validée · série ${S.streak}`);
}
function checkPerfect() {
  const active = S.quests.filter(q => q.active);
  const allQ = active.length > 0 && active.every(q => S.today.quests[q.id]);
  if (allQ && S.today.oneThing.done) awardOnce('perfect', 25);
}

/* ---------- Blocs horaires ---------- */
function parseBlocks() {
  return S.blocksText.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s+(.*)$/);
    return m ? { start: m[1], end: m[2], label: m[3] } : null;
  }).filter(Boolean);
}
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function currentBlock() {
  const now = new Date(); const n = now.getHours() * 60 + now.getMinutes();
  return parseBlocks().find(b => n >= toMin(b.start) && n < toMin(b.end)) || null;
}

/* ---------- Rendu ---------- */
const app = document.getElementById('app');
const ovEl = document.getElementById('overlay');

function greet() {
  const h = new Date().getHours();
  if (h < 6) return 'Il est tard';
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
function fmtTime(s) {
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}

function render() {
  resetDayIfNeeded();
  const T = S.today, L = levelFromXp(S.xp);
  const blk = currentBlock();
  const active = S.quests.filter(q => q.active);
  const doneQ = active.filter(q => T.quests[q.id]).length;
  const fricTotal = Object.values(T.fric).reduce((a, b) => a + b, 0);

  app.innerHTML = `
    <header>
      <div class="clock" id="clock">--:--</div>
      <div class="date">${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="hstats">
        <span class="chip">🔥 Série <b>${S.streak}</b></span>
        <span class="chip">Niv. <b>${L.lv}</b></span>
        <span class="chip">Focus <b>${Math.round(T.focusSec / 60)}′</b></span>
        <span class="chip">Quêtes <b>${doneQ}/${active.length}</b></span>
      </div>
      <div class="xpbar"><i style="width:${Math.round(L.into / L.need * 100)}%"></i></div>
    </header>

    <section>
      <div class="sec-h"><h2>${greet()} · ton intention</h2></div>
      <textarea class="intention" id="intent" rows="1" placeholder="Aujourd'hui, je…">${esc(T.intention)}</textarea>
      <div class="int-hint">Une phrase. Elle te regardera à chaque déverrouillage.</div>
    </section>

    <section>
      <div class="sec-h"><h2>Maintenant</h2></div>
      <div class="block ${blk ? '' : 'off'}">
        <div class="now">${blk ? esc(blk.label) : 'Hors planning'}</div>
        <div class="time">${blk ? blk.start + ' → ' + blk.end : 'Aucun bloc défini à cette heure'}</div>
      </div>
    </section>

    <section>
      <div class="sec-h"><h2>La quête du jour</h2></div>
      <div class="task ${T.oneThing.done ? 'done' : ''}">
        <button class="box" onclick="toggleOne()">${T.oneThing.done ? '✓' : ''}</button>
        <div class="tin">
          <div class="lab">One Thing</div>
          <input class="ttxt" id="one" placeholder="La seule chose qui compte aujourd'hui" value="${esc(T.oneThing.text)}">
        </div>
      </div>
      <div class="task boss ${T.boss.done ? 'done' : ''}" style="margin-top:8px">
        <button class="box" onclick="toggleBoss()">${T.boss.done ? '✓' : ''}</button>
        <div class="tin">
          <div class="lab">Le boss (ce que tu évites)</div>
          <input class="ttxt" id="boss" placeholder="La tâche que tu repousses…" value="${esc(T.boss.text)}">
        </div>
      </div>
    </section>

    <section>
      <div class="sec-h"><h2>Quêtes du jour</h2><button class="linkbtn" onclick="openSettings()">Régler</button></div>
      ${active.length ? active.map((q, i) => `
        <div class="quest ${T.quests[q.id] ? 'done' : ''}">
          <button class="box" onclick="toggleQuest('${q.id}')">${T.quests[q.id] ? '✓' : ''}</button>
          <span class="qem">${q.em}</span>
          <span class="qlab">${esc(q.label)}</span>
          ${q.url ? `<a class="go" href="${q.url}" target="_blank" rel="noopener">Ouvrir</a>` : ''}
        </div>`).join('') : `<div class="int-hint">Aucune quête active — touche « Régler ».</div>`}
    </section>

    <section class="constance">
      <div>
        <div class="sec-h"><h2>Constance · ${GRID_DAYS} jours</h2><button class="linkbtn" onclick="exportData()">Exporter</button></div>
        <div class="cpanel">
          <div class="crow chead">
            <span class="clab"></span>
            ${gridDays().map(o => { const d = new Date(Date.now() - o * DAY); return `<span class="cell hd ${o === 0 ? 'hdnow' : ''}">${'DLMMJVS'[d.getDay()]}</span>`; }).join('')}
            <span class="cstreak"></span>
          </div>
          ${active.map(q => `
            <div class="crow">
              <span class="clab">${q.em} ${esc(q.label.split(' (')[0])}</span>
              ${gridDays().map(o => {
                const done = o === 0 ? !!T.quests[q.id] : !!((S.log[dstr(o)] || {})[q.id]);
                return o === 0
                  ? `<button class="cell today ${done ? 'on' : ''}" onclick="toggleQuest('${q.id}')"></button>`
                  : `<span class="cell ${done ? 'on' : ''}"></span>`;
              }).join('')}
              <span class="cstreak">${questStreak(q.id) > 0 ? '🔥' + questStreak(q.id) : ''}</span>
            </div>`).join('')}
        </div>
        <div class="int-hint" style="margin-top:8px">Seule la case du jour est cliquable. Le passé ne se rattrape pas.</div>
      </div>
      <div class="jcol">
        <div class="sec-h"><h2>Journal du jour</h2></div>
        <div class="cpanel">
          ${jToday().length ? jToday().map((it, i) => `
            <div class="jrow ${it.done ? 'done' : ''}">
              <button class="box" onclick="togJournal(${i})">${it.done ? '✓' : ''}</button>
              <span class="jtxt">${esc(it.t)}</span>
              ${it.c ? `<span class="jcarry">J+${it.c}</span>` : ''}
              <button class="jdel" onclick="delJournal(${i})">✕</button>
            </div>`).join('') : `<div class="int-hint">Rien pour l'instant. Note ce que tu as fait, ou ce qu'il reste à faire.</div>`}
          <div class="jadd">
            <input class="field" id="jin" placeholder="Ajouter — Entrée pour valider">
            <button class="btn primary jaddbtn" onclick="addJournal()">+</button>
          </div>
          <div class="int-hint" style="margin-top:8px">Non coché ce soir = reporté demain, marqué J+n. Tout est archivé par date.</div>
        </div>
      </div>
    </section>

    <section>
      <div class="sec-h"><h2>Focus</h2></div>
      <div class="focus">
        <div class="ftime" id="ftime">${fmtTime(FT.left)}</div>
        <div class="frow">
          <button class="primary" onclick="toggleFocus()" id="fbtn">${FT.running ? 'Pause' : 'Démarrer'}</button>
          <button onclick="resetFocus()">Réinitialiser</button>
        </div>
        <div class="fmin">${Math.round(T.focusSec / 60)} min de deep work aujourd'hui</div>
      </div>
    </section>

    <section>
      <div class="sec-h"><h2>Lancer</h2></div>
      <div class="launch">
        ${S.quests.filter(q => q.url).map(q => `<a class="app" href="${q.url}" target="_blank" rel="noopener"><span class="em">${q.em}</span>${esc(q.label.split(' (')[0])}</a>`).join('')}
      </div>
    </section>

    <section>
      <div class="sec-h"><h2>Zone rouge</h2></div>
      <div class="fric">
        ${S.fricApps.map((f, i) => `<button onclick="openFric(${i})">${esc(f.label)}</button>`).join('')}
      </div>
      <div class="fric-count">${fricTotal === 0 ? 'Zéro passage aujourd\'hui. Impeccable.' : `${fricTotal} passage(s) aujourd'hui.`}</div>
    </section>

    <section>
      <div class="sec-h"><h2>Clôture</h2></div>
      <button class="btn ${T.evening ? 'ghost' : 'primary'}" onclick="openEvening()">
        ${T.evening ? '✓ Journée clôturée' : '🌙 Clôturer ma journée'}
      </button>
    </section>
  `;

  // intention : auto-grow + sauvegarde
  const it = document.getElementById('intent');
  requestAnimationFrame(() => grow(it));   // on mesure une fois le layout posé
  it.addEventListener('input', () => {
    grow(it); S.today.intention = it.value; save();
    if (it.value.trim()) awardOnce('intent', 5);
  });
  document.getElementById('one').addEventListener('input', e => { S.today.oneThing.text = e.target.value; save(); });
  document.getElementById('boss').addEventListener('input', e => { S.today.boss.text = e.target.value; save(); });
  const jin = document.getElementById('jin');
  if (jin) jin.addEventListener('keydown', e => { if (e.key === 'Enter') addJournal(); });
  tickClock();
}
function grow(el) { el.style.height = '0px'; el.style.height = Math.max(34, el.scrollHeight) + 'px'; }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- Actions ---------- */
function toggleOne() {
  const t = S.today.oneThing;
  t.done = !t.done;
  if (t.done) { addXp(30); validateDay(); checkPerfect(); }
  save(); render();
}
function toggleBoss() {
  const b = S.today.boss;
  b.done = !b.done;
  if (b.done) { addXp(50); toast('👊 Boss battu'); }
  save(); render();
}
function toggleQuest(id) {
  S.today.quests[id] = !S.today.quests[id];
  const d = todayStr();
  S.log[d] = S.log[d] || {};
  if (S.today.quests[id]) { S.log[d][id] = 1; addXp(10); } else delete S.log[d][id];
  checkPerfect(); save(); render();
}

/* ---------- Constance (grille) ---------- */
const GRID_DAYS = 14;
function dstr(off) { return new Date(Date.now() - off * DAY).toISOString().slice(0, 10); }
function gridDays() { const a = []; for (let i = GRID_DAYS - 1; i >= 0; i--) a.push(i); return a; }
function questStreak(id) {
  let off = (S.log[dstr(0)] || {})[id] ? 0 : 1, n = 0;
  while ((S.log[dstr(off)] || {})[id]) { n++; off++; }
  return n;
}

/* ---------- Journal du jour ---------- */
function jToday() { const d = todayStr(); return S.journal[d] = S.journal[d] || []; }
function addJournal() {
  const el = document.getElementById('jin');
  const v = (el && el.value || '').trim();
  if (!v) return;
  jToday().push({ t: v, done: false, c: 0, ts: Date.now() });
  save(); render();
  const n = document.getElementById('jin'); if (n) n.focus();
}
function togJournal(i) {
  const j = jToday();
  j[i].done = !j[i].done;
  if (j[i].done) awardOnce('journal', 5);
  save(); render();
}
function delJournal(i) { jToday().splice(i, 1); save(); render(); }

function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'lesas-export-' + todayStr() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('📦 Export téléchargé');
}

/* ---------- Horloge ---------- */
function tickClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  el.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
setInterval(() => { tickClock(); }, 15000);

/* ---------- Focus timer ---------- */
let FT = { left: FOCUS_LEN, running: false, iv: null };
function toggleFocus() {
  FT.running ? pauseFocus() : startFocus();
}
function startFocus() {
  FT.running = true;
  document.getElementById('fbtn').textContent = 'Pause';
  FT.iv = setInterval(() => {
    FT.left--; S.today.focusSec++;
    const el = document.getElementById('ftime'); if (el) el.textContent = fmtTime(FT.left);
    if (FT.left % 15 === 0) save();
    if (FT.left <= 0) { pauseFocus(); FT.left = FOCUS_LEN; addXp(15); beep(); toast('✅ 25 min de focus'); save(); render(); }
  }, 1000);
}
function pauseFocus() {
  FT.running = false; clearInterval(FT.iv); save();
  const b = document.getElementById('fbtn'); if (b) b.textContent = 'Démarrer';
}
function resetFocus() { pauseFocus(); FT.left = FOCUS_LEN; const el = document.getElementById('ftime'); if (el) el.textContent = fmtTime(FT.left); }
function beep() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 660; o.type = 'sine';
    g.gain.setValueAtTime(.25, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .7);
    o.start(); o.stop(c.currentTime + .7);
  } catch (e) {}
}

/* ---------- Friction ---------- */
let fricIdx = null, fricCd = null;
function openFric(i) {
  fricIdx = i;
  const f = S.fricApps[i];
  let left = 5;
  ovEl.innerHTML = `
    <div class="ov">
      <div class="ovbox">
        <h3>Pourquoi ${esc(f.label)} ?</h3>
        <p>Écris-le. Si tu n'as pas de raison, tu as ta réponse.</p>
        <textarea class="field" id="fricwhy" rows="2" placeholder="Parce que…"></textarea>
        <button class="btn primary" id="fricgo" disabled onclick="goFric()">Ouvrir quand même</button>
        <div class="cd" id="friccd">disponible dans ${left} s</div>
        <button class="btn ghost" onclick="closeOv()">Laisser tomber</button>
      </div>
    </div>`;
  clearInterval(fricCd);
  fricCd = setInterval(() => {
    left--;
    const cd = document.getElementById('friccd'), go = document.getElementById('fricgo');
    if (!cd) { clearInterval(fricCd); return; }
    if (left <= 0) {
      clearInterval(fricCd); cd.textContent = 'À toi de voir.';
      if (go) go.disabled = false;
    } else cd.textContent = `disponible dans ${left} s`;
  }, 1000);
}
function goFric() {
  const f = S.fricApps[fricIdx];
  const why = (document.getElementById('fricwhy') || {}).value || '';
  S.today.fric[f.label] = (S.today.fric[f.label] || 0) + 1;
  save();
  window.open(f.url, '_blank', 'noopener');
  closeOv(); render();
}

/* ---------- Rituel du soir ---------- */
function openEvening() {
  const T = S.today;
  ovEl.innerHTML = `
    <div class="ov">
      <div class="ovbox">
        <h3>🌙 Clôture</h3>
        <p>Trois minutes pour fermer la journée proprement.</p>
        <div class="task" style="margin-bottom:12px;background:var(--card2)">
          <div class="tin">
            <div class="lab">Ton intention était</div>
            <div style="font-size:15px;font-weight:600;margin-top:3px">${T.intention ? esc(T.intention) : '— (aucune posée)'}</div>
          </div>
        </div>
        <label class="int-hint">Qu'as-tu accompli aujourd'hui ?</label>
        <textarea class="field" id="evwin" rows="3" placeholder="Même une petite victoire compte…"></textarea>
        <label class="int-hint">Le One Thing de demain</label>
        <input class="field" id="evtom" placeholder="Demain, la seule chose qui compte…" value="${esc(S.tomorrowOneThing)}">
        <button class="btn primary" onclick="saveEvening()">Clôturer (+20 XP)</button>
        <button class="btn ghost" onclick="closeOv()">Plus tard</button>
      </div>
    </div>`;
}
function saveEvening() {
  const win = (document.getElementById('evwin') || {}).value || '';
  const tom = (document.getElementById('evtom') || {}).value || '';
  S.tomorrowOneThing = tom.trim();
  S.today.evening = true;
  S.today.win = win.trim();
  awardOnce('evening', 20);
  save(); closeOv(); render();
  toast('🌙 Journée clôturée. Repose-toi.');
}

/* ---------- Réglages ---------- */
function openSettings() {
  ovEl.innerHTML = `
    <div class="ov" style="align-items:flex-start;overflow:auto">
      <div class="ovbox" style="margin:20px 0">
        <h3>Réglages</h3>
        <p>Choisis tes quêtes quotidiennes et tes blocs.</p>
        <h2 style="margin:16px 0 4px">Quêtes</h2>
        ${S.quests.map((q, i) => `
          <div class="setrow">
            <span>${q.em}</span><span class="qlab">${esc(q.label)}</span>
            <button class="tog ${q.active ? 'on' : ''}" onclick="togQuest(${i})"><i></i></button>
          </div>`).join('')}
        <h2 style="margin:18px 0 6px">Blocs horaires</h2>
        <textarea class="field" id="setblocks" rows="8" placeholder="07:00-09:00 Deep work">${esc(S.blocksText)}</textarea>
        <div class="int-hint" style="margin-bottom:12px">Un bloc par ligne : <b>HH:MM-HH:MM Libellé</b></div>
        <button class="btn primary" onclick="saveSettings()">Enregistrer</button>
        <button class="btn ghost" onclick="closeOv()">Fermer</button>
        <button class="btn danger" onclick="resetAll()">Tout réinitialiser</button>
      </div>
    </div>`;
}
function togQuest(i) {
  S.quests[i].active = !S.quests[i].active; save();
  const b = ovEl.querySelectorAll('.tog')[i];
  if (b) b.classList.toggle('on', S.quests[i].active);
}
function saveSettings() {
  const b = document.getElementById('setblocks');
  if (b) S.blocksText = b.value;
  save(); closeOv(); render(); toast('Réglages enregistrés');
}
function resetAll() {
  if (confirm('Tout effacer (XP, série, historique, réglages) ?')) {
    localStorage.removeItem('lesas'); location.reload();
  }
}
function closeOv() { clearInterval(fricCd); ovEl.innerHTML = ''; }

/* ---------- Utilitaires ---------- */
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- Boot ---------- */
resetDayIfNeeded();
if (S.firstRun) { S.firstRun = false; save(); }
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
