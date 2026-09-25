/* ============================================================
   TALLYVERSE — 50 tiny trackers, one offline app.
   Everything is local. No network calls. No accounts. No nonsense.
   ============================================================ */
(function () {
'use strict';

/* ---------------- storage ---------------- */
var KEY = 'tallyverse.v1';
var DB = { data: {}, favs: [], opts: { sound: true, haptic: true, confetti: true }, meta: {} };

function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var p = JSON.parse(raw);
      DB.data = p.data || {};
      DB.favs = p.favs || [];
      DB.meta = p.meta || {};
      DB.opts = Object.assign(DB.opts, p.opts || {});
    }
  } catch (e) { console.warn('load failed', e); }
}
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); }
    catch (e) { toast('Storage is full — export a backup!'); }
  }, 60);
}
function recs(id) { if (!DB.data[id]) DB.data[id] = []; return DB.data[id]; }
function setRecs(id, arr) { DB.data[id] = arr; save(); }
function meta(id) { if (!DB.meta[id]) DB.meta[id] = {}; return DB.meta[id]; }

/* ---------------- tiny utils ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function today() { return dayKey(); }
function parseDay(k) { var p = String(k || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 864e5); }
function daysAgo(k) { return daysBetween(k, today()); }
function addDays(k, n) { var d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); }
function nowTime() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function prettyDay(k) {
  if (!k) return '';
  var n = daysAgo(k);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n === -1) return 'tomorrow';
  if (n < 0) return 'in ' + (-n) + ' days';
  if (n < 7) return n + ' days ago';
  var d = parseDay(k);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
}
function pretty12(t) {
  if (!t) return '';
  var p = t.split(':'), h = +p[0], m = p[1];
  var ap = h >= 12 ? 'pm' : 'am'; h = h % 12; if (h === 0) h = 12;
  return h + ':' + m + ap;
}
function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
function money(n) { return '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: (n % 1 ? 2 : 0), maximumFractionDigits: 2 }); }
function round(n, d) { var f = Math.pow(10, d || 0); return Math.round(n * f) / f; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function sum(a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
function uniqDays(a) { var s = {}; a.forEach(function (r) { if (r.day) s[r.day] = 1; }); return Object.keys(s); }

/* streak from a set of day-keys (counts today or yesterday as alive) */
function streakOf(days) {
  if (!days.length) return 0;
  var set = {}; days.forEach(function (d) { set[d] = 1; });
  var cur = today();
  if (!set[cur]) { cur = addDays(cur, -1); if (!set[cur]) return 0; }
  var n = 0;
  while (set[cur]) { n++; cur = addDays(cur, -1); }
  return n;
}
function bestStreak(days) {
  var s = days.slice().sort(), best = 0, run = 0, prev = null;
  s.forEach(function (d) {
    if (prev && daysBetween(prev, d) === 1) run++; else run = 1;
    prev = d; if (run > best) best = run;
  });
  return best;
}

/* ---------------- feedback: sound, haptics, toast, confetti ---------------- */
var AC = null;
function actx() {
  if (!AC) { var C = window.AudioContext || window.webkitAudioContext; if (C) AC = new C(); }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freqs, dur, vol) {
  if (!DB.opts.sound) return;
  var c = actx(); if (!c) return;
  var t0 = c.currentTime;
  freqs.forEach(function (f, i) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t0 + i * 0.075);
    g.gain.setValueAtTime(0, t0 + i * 0.075);
    g.gain.linearRampToValueAtTime((vol || 0.16), t0 + i * 0.075 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.075 + (dur || 0.34));
    o.connect(g); g.connect(c.destination);
    o.start(t0 + i * 0.075); o.stop(t0 + i * 0.075 + (dur || 0.34) + 0.05);
  });
}
function soundSave() { tone([392, 523.25], 0.4, 0.14); }
function soundTap() { tone([330], 0.18, 0.09); }
function soundWin() { tone([523.25, 659.25, 783.99, 1046.5], 0.5, 0.13); }
function soundOops() { tone([196, 155], 0.35, 0.12); }
function buzz(ms) { if (DB.opts.haptic && navigator.vibrate) navigator.vibrate(ms || 12); }

var toastT = null;
function toast(msg) {
  var el = $('#toast');
  el.textContent = msg; el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(function () { el.hidden = true; }, 2100);
}
function confetti() {
  if (!DB.opts.confetti) return;
  var cols = ['#ffc46b', '#ff9f45', '#5fd0a0', '#a98bff', '#eef2ff'];
  for (var i = 0; i < 26; i++) {
    (function (i) {
      var d = document.createElement('div');
      d.className = 'conf';
      d.style.background = pick(cols);
      d.style.left = (10 + Math.random() * 80) + 'vw';
      d.style.top = '-20px';
      document.body.appendChild(d);
      var dur = 1100 + Math.random() * 900;
      d.animate([
        { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
        { transform: 'translateY(' + (window.innerHeight + 60) + 'px) rotate(' + (360 + Math.random() * 720) + 'deg)', opacity: 0.1 }
      ], { duration: dur, easing: 'cubic-bezier(.25,.6,.4,1)', delay: i * 18 })
        .onfinish = function () { d.remove(); };
    })(i);
  }
}

/* ---------------- form field rendering ---------------- */
var STARS = ['\u2606', '\u2605'];
function fieldHTML(f, val) {
  var v = val == null ? '' : val;
  var id = 'f_' + f.k;
  var inner = '';
  if (f.t === 'textarea') {
    inner = '<textarea id="' + id + '" data-k="' + f.k + '"' + (f.max ? ' maxlength="' + f.max + '"' : '') +
      ' placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>' +
      (f.max ? '<div class="charcount" data-for="' + f.k + '">' + String(v).length + '/' + f.max + '</div>' : '');
  } else if (f.t === 'select') {
    inner = '<select id="' + id + '" data-k="' + f.k + '">' +
      (f.blank ? '<option value=""></option>' : '') +
      f.opts.map(function (o) {
        var ov = typeof o === 'string' ? o : o.v;
        var ol = typeof o === 'string' ? o : o.l;
        return '<option value="' + esc(ov) + '"' + (String(v) === String(ov) ? ' selected' : '') + '>' + esc(ol) + '</option>';
      }).join('') + '</select>';
  } else if (f.t === 'rating') {
    var n = f.n || 5, cur = num(v) || 0;
    inner = '<div class="toggle-row" data-rating="' + f.k + '">';
    for (var i = 1; i <= n; i++) inner += '<button type="button" data-val="' + i + '" class="' + (cur === i ? 'on' : '') + '">' + i + '</button>';
    inner += '</div><input type="hidden" data-k="' + f.k + '" value="' + esc(cur || '') + '" />';
  } else if (f.t === 'choice') {
    inner = '<div class="toggle-row" data-choice="' + f.k + '">';
    inner += f.opts.map(function (o) {
      var ov = typeof o === 'string' ? o : o.v, ol = typeof o === 'string' ? o : o.l;
      return '<button type="button" data-val="' + esc(ov) + '" class="' + (String(v) === String(ov) ? 'on' : '') + '">' + esc(ol) + '</button>';
    }).join('');
    inner += '</div><input type="hidden" data-k="' + f.k + '" value="' + esc(v) + '" />';
  } else if (f.t === 'bool') {
    inner = '<div class="toggle-row" data-choice="' + f.k + '">' +
      '<button type="button" data-val="1" class="' + (v == 1 ? 'on' : '') + '">Yes</button>' +
      '<button type="button" data-val="" class="' + (v != 1 ? 'on' : '') + '">No</button>' +
      '</div><input type="hidden" data-k="' + f.k + '" value="' + esc(v) + '" />';
  } else {
    var type = f.t === 'num' ? 'number' : f.t === 'date' ? 'date' : f.t === 'time' ? 'time' : 'text';
    inner = '<input id="' + id + '" data-k="' + f.k + '" type="' + type + '"' +
      (f.t === 'num' ? ' inputmode="decimal" step="' + (f.step || 'any') + '"' + (f.min != null ? ' min="' + f.min + '"' : '') : '') +
      ' placeholder="' + esc(f.ph || '') + '" value="' + esc(v) + '" />';
  }
  return '<div class="field' + (f.w === 'half' ? ' half' : '') + '">' +
    (f.l ? '<label for="' + id + '">' + esc(f.l) + '</label>' : '') + inner + '</div>';
}

function formHTML(t, vals) {
  vals = vals || {};
  var fs = t.fields || [];
  var out = '', i = 0;
  while (i < fs.length) {
    if (fs[i].w === 'half' && fs[i + 1] && fs[i + 1].w === 'half') {
      if (fs[i + 2] && fs[i + 2].w === 'half' && fs[i].trio) {
        out += '<div class="three">' + fieldHTML(fs[i], vals[fs[i].k]) + fieldHTML(fs[i + 1], vals[fs[i + 1].k]) + fieldHTML(fs[i + 2], vals[fs[i + 2].k]) + '</div>';
        i += 3; continue;
      }
      out += '<div class="two">' + fieldHTML(fs[i], vals[fs[i].k]) + fieldHTML(fs[i + 1], vals[fs[i + 1].k]) + '</div>';
      i += 2; continue;
    }
    out += fieldHTML(fs[i], vals[fs[i].k]); i++;
  }
  return '<form class="panel form" id="entryForm" autocomplete="off">' + out +
    '<button type="submit" class="primary-btn" id="submitBtn">' + esc(t.cta || 'Add entry') + '</button></form>';
}

function readForm() {
  var o = {};
  $$('#entryForm [data-k]').forEach(function (el) { o[el.getAttribute('data-k')] = el.value; });
  return o;
}
function defaults(t) {
  var o = {};
  (t.fields || []).forEach(function (f) {
    o[f.k] = typeof f.def === 'function' ? f.def() : (f.def != null ? f.def : '');
  });
  return o;
}

/* ---------------- shared render helpers ---------------- */
function statsHTML(list) {
  if (!list || !list.length) return '';
  return '<div class="stats">' + list.map(function (s) {
    return '<div class="stat ' + (s.c || '') + '"><div class="v">' + s.v + '</div><div class="k">' + esc(s.k) + '</div></div>';
  }).join('') + '</div>';
}
function itemHTML(r, L, idx) {
  return '<div class="item' + (L.tone ? ' tone-' + L.tone : '') + '" data-id="' + r.id + '">' +
    (L.lead || '') +
    '<div class="it-main"><div class="it-title">' + (L.rawTitle ? L.title : esc(L.title)) + '</div>' +
    (L.sub ? '<div class="it-sub">' + (L.rawSub ? L.sub : esc(L.sub)) + '</div>' : '') +
    (L.btns && L.btns.length ? '<div class="row-btns">' + L.btns.map(function (b) {
      return '<button class="mini-btn ' + (b.c || '') + '" data-act="' + b.a + '" data-id="' + r.id + '">' + esc(b.l) + '</button>';
    }).join('') + '</div>' : '') +
    '</div>' +
    (L.right ? '<div class="it-right">' + esc(L.right) + (L.rightSub ? '<small>' + esc(L.rightSub) + '</small>' : '') + '</div>' : '') +
    '<button class="del-x" data-act="__del" data-id="' + r.id + '" aria-label="Delete">\u2715</button>' +
    '</div>';
}
function listHTML(t, rs) {
  if (!rs.length) return '<div class="empty-note">' + esc(t.empty || 'Nothing logged yet. The void awaits.') + '</div>';
  return '<div class="list">' + rs.map(function (r, i) {
    return itemHTML(r, t.line ? t.line(r, rs, i) : defaultLine(r, t), i);
  }).join('') + '</div>';
}
function defaultLine(r, t) {
  var fs = t.fields || [];
  var title = r[fs[0] && fs[0].k] || '(untitled)';
  var sub = fs.slice(1).filter(function (f) { return f.t !== 'date' && r[f.k]; })
    .map(function (f) { return f.l + ': ' + r[f.k]; }).join(' · ');
  return { title: title, sub: sub, right: prettyDay(r.day) };
}

/* expose internals to the rest of the app */
window.TV = {
  DB: DB, load: load, save: save, recs: recs, setRecs: setRecs, meta: meta,
  $: $, $$: $$, esc: esc, uid: uid, pad: pad, dayKey: dayKey, today: today, parseDay: parseDay,
  daysBetween: daysBetween, daysAgo: daysAgo, addDays: addDays, nowTime: nowTime,
  prettyDay: prettyDay, pretty12: pretty12, num: num, money: money, round: round, pick: pick,
  sum: sum, uniqDays: uniqDays, streakOf: streakOf, bestStreak: bestStreak,
  tone: tone, soundSave: soundSave, soundTap: soundTap, soundWin: soundWin, soundOops: soundOops,
  buzz: buzz, toast: toast, confetti: confetti,
  fieldHTML: fieldHTML, formHTML: formHTML, readForm: readForm, defaults: defaults,
  statsHTML: statsHTML, itemHTML: itemHTML, listHTML: listHTML, defaultLine: defaultLine
};
})();
/* ============================================================
   TRACKER DEFINITIONS — part A : Habits (10) + Health (10)
   ============================================================ */
(function () {
'use strict';
var U = window.TV;
var TRACKERS = window.TRACKERS || (window.TRACKERS = []);
function add(t) { TRACKERS.push(t); }
var H = { w: 'half' };

var f = {
  t: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'text' }, o || {}); },
  a: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'textarea' }, o || {}); },
  n: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'num' }, o || {}); },
  d: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'date', def: U.today }, o || {}); },
  tm: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'time', def: U.nowTime }, o || {}); },
  s: function (k, l, opts, o) { return Object.assign({ k: k, l: l, t: 'select', opts: opts }, o || {}); },
  c: function (k, l, opts, o) { return Object.assign({ k: k, l: l, t: 'choice', opts: opts }, o || {}); },
  r: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'rating' }, o || {}); },
  b: function (k, l, o) { return Object.assign({ k: k, l: l, t: 'bool' }, o || {}); }
};
window.TVF = f;
var DAY = f.d('day', 'Date', H);

/* helper: jar svg */
function jarSVG(pct, color) {
  var h = 60 * Math.max(0, Math.min(1, pct));
  var id = 'jc' + Math.random().toString(36).slice(2, 7);
  return '<svg class="jar-svg" viewBox="0 0 60 84">' +
    '<defs><clipPath id="' + id + '"><rect x="8" y="16" width="44" height="60" rx="9"/></clipPath>' +
    '<linearGradient id="g' + id + '" x1="0" y1="1" x2="0" y2="0">' +
    '<stop offset="0" stop-color="' + (color || '#ff9f45') + '"/><stop offset="1" stop-color="' + (color === '#5fd0a0' ? '#9ef0c9' : '#ffd79a') + '"/></linearGradient></defs>' +
    '<rect x="17" y="6" width="26" height="11" rx="4" fill="#ffffff18" stroke="#ffffff26"/>' +
    '<rect x="8" y="16" width="44" height="60" rx="9" fill="#ffffff08" stroke="#ffffff26"/>' +
    '<g clip-path="url(#' + id + ')"><rect x="8" y="' + (76 - h) + '" width="44" height="' + h + '" fill="url(#g' + id + ')">' +
    '<animate attributeName="y" from="76" to="' + (76 - h) + '" dur="0.6s" fill="freeze"/>' +
    '<animate attributeName="height" from="0" to="' + h + '" dur="0.6s" fill="freeze"/></rect></g>' +
    '<rect x="8" y="16" width="44" height="60" rx="9" fill="none" stroke="#ffffff1a"/></svg>';
}
window.TVJAR = jarSVG;

/* ============================================================
   HABITS & SELF-IMPROVEMENT
   ============================================================ */

/* 1 — Streakly */
add({
  id: 'streakly', name: 'Streakly', emoji: '\uD83D\uDD25', cat: 'Habits',
  blurb: 'One habit, one tap, one tragically resettable number.',
  cta: 'Add habit', empty: 'No habits yet. Add one you can plausibly survive.',
  fields: [f.t('name', 'Habit', { ph: 'Floss like an adult' })],
  onAdd: function (r) { r.dates = []; },
  stats: function (rs) {
    var best = 0; rs.forEach(function (r) { best = Math.max(best, U.streakOf(r.dates || [])); });
    var alive = rs.filter(function (r) { return (r.dates || []).indexOf(U.today()) >= 0; }).length;
    return [
      { k: 'habits', v: rs.length },
      { k: 'done today', v: alive + '/' + rs.length, c: alive === rs.length && rs.length ? 'good' : '' },
      { k: 'best streak', v: best, c: 'amber' }
    ];
  },
  line: function (r) {
    var d = r.dates || [], on = d.indexOf(U.today()) >= 0, s = U.streakOf(d);
    return {
      title: r.name,
      sub: s ? s + '-day streak · best ' + U.bestStreak(d) + ' · ' + d.length + ' total' : (d.length ? 'streak dead. last: ' + U.prettyDay(d[d.length - 1]) : 'never done. bold.'),
      tone: on ? 'good' : (s ? 'amber' : ''),
      right: String(s), rightSub: 'streak',
      btns: [{ l: on ? '\u2713 Done today' : 'Mark done', a: 'tap', c: on ? 'go' : '' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'tap') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.dates = r.dates || [];
    var i = r.dates.indexOf(U.today());
    if (i >= 0) { r.dates.splice(i, 1); U.soundOops(); U.toast('Streak surrendered.'); }
    else {
      r.dates.push(U.today()); r.dates.sort(); U.soundSave(); U.buzz();
      var s = U.streakOf(r.dates);
      if (s % 7 === 0) { U.confetti(); U.soundWin(); U.toast(s + ' days. Genuinely impressive.'); }
      else U.toast('Day ' + s + '. Keep it alive.');
    }
    return true;
  },
  cols: [{ l: 'Habit', k: 'name' }, { l: 'Streak', f: function (r) { return U.streakOf(r.dates || []); } }, { l: 'Total days', f: function (r) { return (r.dates || []).length; } }]
});

/* 2 — DidIt */
add({
  id: 'didit', name: 'DidIt', emoji: '\u2705', cat: 'Habits',
  blurb: "Today's checklist. Self-destructs at midnight so you can't gloat.",
  cta: 'Add to today', empty: 'Empty list. Either very zen or very avoidant.',
  fields: [f.t('text', 'Task', { ph: 'Reply to the email from Tuesday' })],
  prep: function (rs) { return rs.filter(function (r) { return r.day === U.today(); }); },
  stats: function (rs) {
    var d = rs.filter(function (r) { return r.done; }).length;
    return [
      { k: 'done', v: d + '/' + rs.length, c: rs.length && d === rs.length ? 'good' : 'amber' },
      { k: 'left', v: rs.length - d },
      { k: 'wipes in', v: hoursToMidnight() + 'h' }
    ];
  },
  line: function (r) {
    return {
      title: (r.done ? '\u2713 ' : '') + r.text, tone: r.done ? 'good' : '',
      sub: r.done ? 'done' : 'pending judgment',
      btns: [{ l: r.done ? 'Undo' : 'Mark done', a: 'done', c: r.done ? '' : 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'done') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.done = !r.done;
    if (r.done) { U.soundSave(); U.buzz(); if (rs.every(function (x) { return x.done; })) { U.confetti(); U.soundWin(); U.toast('Entire list cleared. Touch grass.'); } }
    return true;
  },
  cols: [{ l: 'Task', k: 'text' }, { l: 'Done', f: function (r) { return r.done ? 'yes' : 'no'; } }]
});
function hoursToMidnight() { var n = new Date(); return 23 - n.getHours(); }

/* 3 — Water You Doing */
add({
  id: 'water', name: 'Water You Doing', emoji: '\uD83D\uDCA7', cat: 'Habits',
  blurb: 'Tap a glass. Watch a jar fill. Feel smug.',
  noForm: true,
  panel: function (rs) {
    var m = U.meta('water'); var goal = m.goal || 8;
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    var n = t ? t.n : 0;
    return '<div class="panel"><div class="jar">' + jarSVG(n / goal) +
      '<div><div class="big-num amber">' + n + '</div><div class="tagline">of ' + goal + ' glasses today</div>' +
      '<div class="bar-wrap" style="width:120px"><div class="bar" style="width:' + Math.min(100, n / goal * 100) + '%"></div></div></div></div>' +
      '<div class="toggle-row" style="margin-top:14px">' +
      '<button data-act="minus">\u2212 1</button>' +
      '<button data-act="plus" class="on">+ 1 glass</button>' +
      '<button data-act="goal">Goal: ' + goal + '</button></div>' +
      '<div class="quip">' + waterQuip(n, goal) + '</div></div>';
  },
  act: function (n, el, rs) {
    var m = U.meta('water'), goal = m.goal || 8;
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    if (n === 'goal') {
      var g = prompt('Glasses per day:', goal); if (g && U.num(g) > 0) { m.goal = U.num(g); U.soundTap(); }
      return true;
    }
    if (!t) { t = { id: U.uid(), day: U.today(), n: 0, ts: Date.now() }; rs.unshift(t); }
    if (n === 'plus') {
      t.n++; U.soundSave(); U.buzz();
      if (t.n === goal) { U.confetti(); U.soundWin(); U.toast('Hydration goal met. Your kidneys applaud.'); }
      else if (t.n === goal * 2) U.toast('That is a concerning amount of water.');
      return true;
    }
    if (n === 'minus') { t.n = Math.max(0, t.n - 1); U.soundTap(); return true; }
  },
  stats: function (rs) {
    var goal = U.meta('water').goal || 8;
    var hit = rs.filter(function (r) { return r.n >= goal; }).map(function (r) { return r.day; });
    return [
      { k: 'goal streak', v: U.streakOf(hit), c: 'amber' },
      { k: 'days logged', v: rs.length },
      { k: 'daily avg', v: rs.length ? U.round(U.sum(rs, function (r) { return r.n; }) / rs.length, 1) : 0, c: 'good' }
    ];
  },
  line: function (r) {
    var goal = U.meta('water').goal || 8;
    return { title: r.n + ' glasses', sub: r.n >= goal ? 'goal met' : (goal - r.n) + ' short', tone: r.n >= goal ? 'good' : 'warn', right: U.prettyDay(r.day) };
  },
  empty: 'No water logged. You are basically a raisin.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Glasses', k: 'n' }]
});
function waterQuip(n, g) {
  if (n === 0) return 'Zero glasses. Bold strategy for a bag of mostly water.';
  if (n < g / 2) return 'A respectable start. A cactus would be proud.';
  if (n < g) return 'Getting there. ' + (g - n) + ' more and you may legally feel superior.';
  return 'Goal met. You are the most hydrated person in this conversation.';
}

/* 4 — NoBuy */
add({
  id: 'nobuy', name: 'NoBuy', emoji: '\uD83D\uDEAB', cat: 'Habits',
  blurb: 'Log what you ALMOST bought. Watch the savings counter lie beautifully.',
  cta: 'Log the near-miss',
  fields: [f.t('item', 'What you almost bought', { ph: 'Third mechanical keyboard' }), f.n('amt', 'Price ($)', Object.assign({ ph: '129' }, H)), DAY],
  stats: function (rs) {
    var total = U.sum(rs, function (r) { return U.num(r.amt); });
    var mo = rs.filter(function (r) { return r.day >= U.today().slice(0, 7) + '-01'; });
    return [
      { k: 'not spent', v: U.money(total), c: 'good' },
      { k: 'this month', v: U.money(U.sum(mo, function (r) { return U.num(r.amt); })), c: 'amber' },
      { k: 'temptations', v: rs.length }
    ];
  },
  line: function (r) { return { title: r.item, sub: 'resisted ' + U.prettyDay(r.day), right: U.money(U.num(r.amt)), tone: 'good' }; },
  panel: function (rs) {
    var total = U.sum(rs, function (r) { return U.num(r.amt); });
    return total > 0 ? '<div class="panel tight"><div class="quip">Your "money saved" counter reads ' + U.money(total) +
      '. Your bank account has not been notified of this achievement.</div></div>' : '';
  },
  empty: 'No resisted purchases. Suspicious.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Item', k: 'item' }, { l: 'Price', k: 'amt' }]
});

/* 5 — Mood Ring */
var MOODS = [
  { v: 'great', c: '#5fd0a0', l: 'Great' }, { v: 'good', c: '#9ad86f', l: 'Good' },
  { v: 'meh', c: '#ffd166', l: 'Meh' }, { v: 'rough', c: '#ff9f45', l: 'Rough' },
  { v: 'awful', c: '#ff7a7a', l: 'Awful' }, { v: 'weird', c: '#a98bff', l: 'Weird' }
];
add({
  id: 'mood', name: 'Mood Ring', emoji: '\uD83C\uDFA8', cat: 'Habits',
  blurb: 'Tap one of six circles a day. Collect a mood mosaic.',
  noForm: true,
  panel: function (rs) {
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    var h = '<div class="panel"><h4>How is today?</h4><div class="dots">' +
      MOODS.map(function (m) {
        return '<button class="dot ' + (t && t.mood === m.v ? 'on' : '') + '" style="background:' + m.c + '" data-act="m:' + m.v + '" aria-label="' + m.l + '"></button>';
      }).join('') + '</div>' +
      '<div class="quip" style="text-align:center">' + (t ? 'Today: ' + moodLabel(t.mood) : 'Untapped. Mysterious.') + '</div></div>';
    /* month mosaic */
    var d = new Date(), y = d.getFullYear(), mo = d.getMonth();
    var first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    var map = {}; rs.forEach(function (r) { map[r.day] = r.mood; });
    var cells = '';
    for (var i = 0; i < first; i++) cells += '<div style="background:transparent"></div>';
    for (var dd = 1; dd <= days; dd++) {
      var key = y + '-' + U.pad(mo + 1) + '-' + U.pad(dd);
      var m = map[key], col = m ? moodColor(m) : '';
      cells += '<div style="' + (col ? 'background:' + col + ';color:#00000070' : '') + '">' + dd + '</div>';
    }
    h += '<div class="panel"><h4>' + d.toLocaleDateString(undefined, { month: 'long' }) + ' mosaic</h4><div class="mosaic">' + cells + '</div></div>';
    return h;
  },
  act: function (n, el, rs) {
    if (n.indexOf('m:') !== 0) return;
    var v = n.slice(2);
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    if (!t) { t = { id: U.uid(), day: U.today(), ts: Date.now() }; rs.unshift(t); }
    t.mood = v; U.soundSave(); U.buzz(); U.toast('Logged: ' + moodLabel(v));
    return true;
  },
  stats: function (rs) {
    var c = {}; rs.forEach(function (r) { c[r.mood] = (c[r.mood] || 0) + 1; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return [
      { k: 'days logged', v: rs.length },
      { k: 'streak', v: U.streakOf(rs.map(function (r) { return r.day; })), c: 'amber' },
      { k: 'most common', v: top ? moodLabel(top) : '—', c: 'violet' }
    ];
  },
  line: function (r) { return { title: r.mood ? moodLabel(r.mood) : 'Untapped day', lead: '<span class="dot" style="width:26px;height:26px;background:' + moodColor(r.mood) + '"></span>', right: U.prettyDay(r.day) }; },
  empty: 'No moods recorded. Emotionally off the grid.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Mood', k: 'mood' }]
});
function moodColor(v) { var m = MOODS.filter(function (x) { return x.v === v; })[0]; return m ? m.c : '#888'; }
function moodLabel(v) { var m = MOODS.filter(function (x) { return x.v === v; })[0]; return m ? m.l : (v || 'Untapped'); }

/* 6 — Sleep Debt */
add({
  id: 'sleep', name: 'Sleep Debt', emoji: '\uD83D\uDE34', cat: 'Habits',
  blurb: 'Log bed and wake times. The universe keeps the receipts.',
  cta: 'Log the night',
  fields: [DAY, f.tm('bed', 'Bedtime', Object.assign({ def: function () { return '23:00'; } }, H)), f.tm('wake', 'Wake up', Object.assign({ def: function () { return '07:00'; } }, H))],
  onAdd: function (r) { r.hrs = sleepHours(r.bed, r.wake); },
  stats: function (rs) {
    var debt = U.sum(rs, function (r) { return Math.max(0, 8 - (r.hrs || 0)); });
    var avg = rs.length ? U.sum(rs, function (r) { return r.hrs || 0; }) / rs.length : 0;
    return [
      { k: 'sleep owed', v: U.round(debt, 1) + 'h', c: 'bad' },
      { k: 'nightly avg', v: U.round(avg, 1) + 'h', c: avg >= 7.5 ? 'good' : 'amber' },
      { k: 'nights', v: rs.length }
    ];
  },
  panel: function (rs) {
    var debt = U.sum(rs, function (r) { return Math.max(0, 8 - (r.hrs || 0)); });
    if (!rs.length) return '';
    return '<div class="panel tight"><div class="quip">You owe the universe <b>' + U.round(debt, 1) +
      ' hours</b> \u2014 roughly ' + U.round(debt / 8, 1) + ' full nights. This balance does not go down. That is the joke. That is also the medicine.</div></div>';
  },
  line: function (r) {
    var h = r.hrs || 0;
    return { title: U.round(h, 1) + ' hours', sub: U.pretty12(r.bed) + ' \u2192 ' + U.pretty12(r.wake) + (h < 6 ? ' · rough' : h >= 8 ? ' · luxurious' : ''), tone: h >= 8 ? 'good' : h < 6 ? 'bad' : 'warn', right: U.prettyDay(r.day) };
  },
  empty: 'No nights logged. Sleep is a myth anyway.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Bed', k: 'bed' }, { l: 'Wake', k: 'wake' }, { l: 'Hours', f: function (r) { return U.round(r.hrs || 0, 1); } }]
});
function sleepHours(bed, wake) {
  if (!bed || !wake) return 0;
  var b = +bed.split(':')[0] + (+bed.split(':')[1]) / 60;
  var w = +wake.split(':')[0] + (+wake.split(':')[1]) / 60;
  var h = w - b; if (h <= 0) h += 24; return h;
}

/* 7 — Screen Shame */
add({
  id: 'screen', name: 'Screen Shame', emoji: '\uD83D\uDCF1', cat: 'Habits',
  blurb: 'Manually log your doom-scrolling. Honesty-based. Brutal.',
  cta: 'Confess',
  fields: [DAY, f.n('min', 'Minutes scrolled', Object.assign({ ph: '90' }, H)), f.c('app', 'Main culprit', ['Social', 'News', 'Video', 'Shopping', 'Other'], { def: 'Social' })],
  stats: function (rs) {
    var wk = rs.slice(0, 7), avg = wk.length ? U.sum(wk, function (r) { return U.num(r.min); }) / wk.length : 0;
    var worst = rs.reduce(function (m, r) { return Math.max(m, U.num(r.min)); }, 0);
    return [
      { k: '7-day avg', v: U.round(avg) + 'm', c: avg > 180 ? 'bad' : 'amber' },
      { k: 'worst day', v: U.round(worst / 60, 1) + 'h', c: 'bad' },
      { k: 'lifetime', v: U.round(U.sum(rs, function (r) { return U.num(r.min); }) / 60) + 'h' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '';
    var t = U.sum(rs, function (r) { return U.num(r.min); }) / 60;
    return '<div class="panel tight"><div class="quip">' + shameQuip(rs[0] ? U.num(rs[0].min) : 0) +
      '<br><span style="color:var(--ink3)">Total: ' + U.round(t, 1) + ' hours \u2248 ' + U.round(t / 2, 1) + ' feature films you did not watch on purpose.</span></div></div>';
  },
  line: function (r) {
    var m = U.num(r.min);
    return { title: U.round(m / 60, 1) + ' hours', sub: r.app + ' · ' + m + ' minutes', tone: m > 180 ? 'bad' : m > 90 ? 'warn' : 'good', right: U.prettyDay(r.day) };
  },
  empty: 'Nothing confessed. The phone knows the truth though.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Minutes', k: 'min' }, { l: 'Culprit', k: 'app' }]
});
function shameQuip(m) {
  if (m >= 300) return 'Five-plus hours. At this point the phone is logging <i>you</i>.';
  if (m >= 180) return 'Three hours. You could have learned a chord progression. Any of them.';
  if (m >= 90) return 'Ninety minutes. Officially "a movie\'s worth of nothing."';
  if (m > 0) return 'Modest. Almost suspiciously modest.';
  return 'Zero minutes logged today. Sure.';
}

/* 8 — One Line a Day */
add({
  id: 'oneline', name: 'One Line a Day', emoji: '\u270D\uFE0F', cat: 'Habits',
  blurb: 'A journal with a hard 140-character limit, so you actually write in it.',
  cta: 'Save the line', daily: true,
  fields: [f.a('text', "Today, in one line", { ph: 'Ate a sandwich standing up. Transcendent.', max: 140 }), DAY],
  stats: function (rs) {
    return [
      { k: 'entries', v: rs.length },
      { k: 'streak', v: U.streakOf(rs.map(function (r) { return r.day; })), c: 'amber' },
      { k: 'avg length', v: rs.length ? U.round(U.sum(rs, function (r) { return (r.text || '').length; }) / rs.length) : 0 }
    ];
  },
  line: function (r) { return { title: r.text, right: U.prettyDay(r.day), tone: 'amber' }; },
  empty: 'Blank book. Very Hemingway of you.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Line', k: 'text' }]
});

/* 9 — Gratitude Jar */
add({
  id: 'gratitude', name: 'Gratitude Jar', emoji: '\uD83E\uDED9', cat: 'Habits',
  blurb: 'Three good things a day, dropped in a jar you can shake later.',
  cta: 'Drop in the jar', daily: true,
  fields: [f.t('g1', 'Good thing #1', { ph: 'Coffee was correct' }), f.t('g2', 'Good thing #2'), f.t('g3', 'Good thing #3'), DAY],
  validate: function (v) { return (v.g1 || v.g2 || v.g3) ? null : 'At least one good thing. Surely.'; },
  panel: function (rs) {
    var notes = rs.length * 3;
    var fill = Math.min(1, rs.length / 60);
    return '<div class="panel"><div class="jar">' + jarSVG(fill, '#5fd0a0') +
      '<div><div class="big-num amber">' + rs.length + '</div><div class="tagline">days of good things</div>' +
      '<button class="ghost-btn" style="margin-top:10px" data-act="shake">Shake the jar</button></div></div>' +
      '<div class="quip" id="shakeOut" style="text-align:center">' + (U.meta('gratitude').last || 'Shake it for a random good thing.') + '</div></div>';
  },
  act: function (n, el, rs) {
    if (n !== 'shake') return;
    if (!rs.length) { U.toast('Jar is empty. Add something first.'); return; }
    var all = [];
    rs.forEach(function (r) { ['g1', 'g2', 'g3'].forEach(function (k) { if (r[k]) all.push({ t: r[k], d: r.day }); }); });
    var p = U.pick(all);
    U.meta('gratitude').last = '\u201C' + U.esc(p.t) + '\u201D \u2014 ' + U.prettyDay(p.d);
    U.soundWin(); U.buzz(20);
    return true;
  },
  stats: function (rs) {
    return [
      { k: 'days', v: rs.length },
      { k: 'good things', v: U.sum(rs, function (r) { return ['g1', 'g2', 'g3'].filter(function (k) { return r[k]; }).length; }), c: 'good' },
      { k: 'streak', v: U.streakOf(rs.map(function (r) { return r.day; })), c: 'amber' }
    ];
  },
  line: function (r) {
    var list = ['g1', 'g2', 'g3'].map(function (k) { return r[k]; }).filter(Boolean);
    return { title: list[0] || '', sub: list.slice(1).join(' · '), right: U.prettyDay(r.day), tone: 'good' };
  },
  empty: 'Empty jar. Rattles ominously.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'One', k: 'g1' }, { l: 'Two', k: 'g2' }, { l: 'Three', k: 'g3' }]
});

/* 10 — Cold Plunge Counter */
add({
  id: 'cold', name: 'Cold Plunge Counter', emoji: '\uD83E\uDDCA', cat: 'Habits',
  blurb: 'Counts cold showers. Generates increasingly unimpressed commentary.',
  cta: 'Log the suffering',
  fields: [DAY, f.n('sec', 'Seconds endured', Object.assign({ ph: '90' }, H)), f.c('type', 'Type', ['Shower', 'Tub', 'Lake', 'Ocean'], { def: 'Shower' })],
  stats: function (rs) {
    return [
      { k: 'plunges', v: rs.length, c: 'violet' },
      { k: 'streak', v: U.streakOf(rs.map(function (r) { return r.day; })), c: 'amber' },
      { k: 'total time', v: U.round(U.sum(rs, function (r) { return U.num(r.sec); }) / 60, 1) + 'm' }
    ];
  },
  panel: function (rs) {
    return '<div class="panel tight"><div class="quip">' + coldQuip(rs.length) + '</div></div>';
  },
  line: function (r) { return { title: U.num(r.sec) + ' seconds', sub: r.type, right: U.prettyDay(r.day), tone: U.num(r.sec) >= 120 ? 'good' : '' }; },
  empty: 'No plunges. Warm, cozy, unremarkable.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Seconds', k: 'sec' }, { l: 'Type', k: 'type' }]
});
function coldQuip(n) {
  if (n === 0) return 'Zero plunges. The water remains undefeated.';
  if (n < 3) return 'A few plunges. You have mentioned this to someone already, haven\u2019t you.';
  if (n < 10) return n + ' plunges. Cool. Literally.';
  if (n < 30) return n + ' plunges. Your personality is starting to include this.';
  if (n < 75) return n + ' plunges. We get it. You are hardy.';
  return n + ' plunges. At this point you are simply a person who is cold.';
}

/* ============================================================
   HEALTH & BODY
   ============================================================ */

/* 11 — RepCount */
add({
  id: 'rep', name: 'RepCount', emoji: '\uD83C\uDFCB\uFE0F', cat: 'Health',
  blurb: 'Exercise, weight, reps. No social feed. No influencers. No mercy.',
  cta: 'Log set',
  fields: [f.t('ex', 'Exercise', { ph: 'Bench press' }), f.n('wt', 'Weight', Object.assign({ ph: '135', trio: true }, H)), f.n('reps', 'Reps', Object.assign({ ph: '8' }, H)), f.n('sets', 'Sets', Object.assign({ ph: '3', def: 1 }, H)), DAY],
  onAdd: function (r) { r.vol = U.num(r.wt) * U.num(r.reps) * (U.num(r.sets) || 1); },
  stats: function (rs) {
    var days = U.uniqDays(rs);
    return [
      { k: 'sessions', v: days.length },
      { k: 'total volume', v: Math.round(U.sum(rs, function (r) { return r.vol || 0; })).toLocaleString(), c: 'amber' },
      { k: 'streak', v: U.streakOf(days), c: 'good' }
    ];
  },
  line: function (r) {
    return { title: r.ex, sub: (U.num(r.sets) || 1) + ' \u00D7 ' + U.num(r.reps) + ' @ ' + U.num(r.wt) + ' · volume ' + Math.round(r.vol || 0), right: U.prettyDay(r.day) };
  },
  empty: 'No sets logged. The bar is still on the floor.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Exercise', k: 'ex' }, { l: 'Weight', k: 'wt' }, { l: 'Reps', k: 'reps' }, { l: 'Sets', k: 'sets' }]
});

/* 12 — Stretch Roulette */
var STRETCHES = ['Hamstring fold', 'Pigeon pose', 'Couch stretch', 'Thoracic opener', 'Calf wall push', 'Hip 90/90',
  'Child\u2019s pose', 'Doorway chest stretch', 'Neck side-bend', 'Cat-cow', 'Seated spinal twist', 'Quad pull',
  'Downward dog', 'Wrist flexor stretch', 'Ankle circles', 'Figure-4 glute', 'Lat hang', 'Shoulder pass-through'];
add({
  id: 'stretch', name: 'Stretch Roulette', emoji: '\uD83C\uDFB2', cat: 'Health',
  blurb: 'Spin for a random stretch. Log the ones you actually did.',
  noForm: true,
  panel: function (rs) {
    var cur = U.meta('stretch').cur || '\u2014 spin the wheel \u2014';
    return '<div class="panel" style="text-align:center"><h4>Your fate</h4>' +
      '<div class="big-num" style="font-size:24px;line-height:1.25;min-height:60px;display:grid;place-items:center">' + U.esc(cur) + '</div>' +
      '<div class="toggle-row" style="margin-top:12px"><button data-act="spin" class="on">Spin</button>' +
      '<button data-act="did">I did it</button></div>' +
      '<div class="hint">' + STRETCHES.length + ' stretches in the wheel. No escape.</div></div>';
  },
  act: function (n, el, rs) {
    var m = U.meta('stretch');
    if (n === 'spin') {
      var next; do { next = U.pick(STRETCHES); } while (next === m.cur && STRETCHES.length > 1);
      m.cur = next; U.soundTap(); U.buzz(); return true;
    }
    if (n === 'did') {
      if (!m.cur) { U.toast('Spin first.'); return; }
      rs.unshift({ id: U.uid(), day: U.today(), name: m.cur, ts: Date.now() });
      U.soundSave(); U.buzz(); U.toast('Logged: ' + m.cur); return true;
    }
  },
  stats: function (rs) {
    var c = {}; rs.forEach(function (r) { c[r.name] = (c[r.name] || 0) + 1; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return [
      { k: 'stretches done', v: rs.length, c: 'good' },
      { k: 'streak', v: U.streakOf(U.uniqDays(rs)), c: 'amber' },
      { k: 'favorite', v: top ? (top.length > 12 ? top.slice(0, 11) + '\u2026' : top) : '—' }
    ];
  },
  line: function (r) { return { title: r.name || 'A stretch', right: U.prettyDay(r.day), tone: 'good' }; },
  empty: 'Nothing stretched. Your hamstrings have opinions.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Stretch', k: 'name' }]
});

/* 13 — Headache Map */
var ZONES = [
  { k: 'forehead', l: 'Forehead', d: 'M30,28 h60 v20 h-60 z' },
  { k: 'ltemple', l: 'Left temple', d: 'M14,48 h26 v24 h-26 z' },
  { k: 'rtemple', l: 'Right temple', d: 'M80,48 h26 v24 h-26 z' },
  { k: 'eyes', l: 'Behind eyes', d: 'M40,48 h40 v18 h-40 z' },
  { k: 'crown', l: 'Crown', d: 'M30,6 h60 v20 h-60 z' },
  { k: 'sinus', l: 'Sinuses', d: 'M40,68 h40 v16 h-40 z' },
  { k: 'jaw', l: 'Jaw', d: 'M34,86 h52 v18 h-52 z' },
  { k: 'base', l: 'Base of skull', d: 'M28,106 h64 v20 h-64 z' }
];
add({
  id: 'headache', name: 'Headache Map', emoji: '\uD83E\uDD15', cat: 'Health',
  blurb: 'Tap where it hurts, log the trigger, find the pattern.',
  cta: 'Log headache',
  fields: [f.c('sev', 'Severity', [{ v: '1', l: 'Mild' }, { v: '2', l: 'Medium' }, { v: '3', l: 'Awful' }], { def: '2' }),
  f.s('trig', 'Likely trigger', ['Unknown', 'Sleep', 'Screen', 'Caffeine', 'Dehydration', 'Stress', 'Weather', 'Food', 'Hormonal'], { def: 'Unknown' }),
    DAY, f.tm('time', 'Time', H)],
  validate: function () { return U.meta('headache').zone ? null : 'Tap a spot on the head diagram first.'; },
  onAdd: function (r) { r.zone = U.meta('headache').zone; },
  panel: function (rs) {
    var sel = U.meta('headache').zone;
    var heat = {}; rs.forEach(function (r) { heat[r.zone] = (heat[r.zone] || 0) + 1; });
    var max = Math.max.apply(null, [1].concat(Object.keys(heat).map(function (k) { return heat[k]; })));
    var svg = '<svg class="bodymap" viewBox="0 0 120 136">' +
      '<ellipse cx="60" cy="62" rx="52" ry="60" fill="#ffffff06" stroke="#ffffff1c"/>' +
      ZONES.map(function (z) {
        var h = heat[z.k] || 0, cls = sel === z.k ? 'sel' : (h ? 'heat' + Math.min(3, Math.ceil(h / max * 3)) : '');
        return '<path class="zone ' + cls + '" d="' + z.d + '" rx="4" data-act="z:' + z.k + '"><title>' + z.l + '</title></path>';
      }).join('') + '</svg>';
    return '<div class="panel"><h4>Where does it hurt?</h4>' + svg +
      '<div class="hint">' + (sel ? 'Selected: <b>' + zoneLabel(sel) + '</b>' : 'Tap a region \u2014 red means it happens there a lot.') + '</div></div>';
  },
  act: function (n, el, rs) {
    if (n.indexOf('z:') !== 0) return;
    U.meta('headache').zone = n.slice(2); U.soundTap(); U.buzz(); return true;
  },
  stats: function (rs) {
    var c = {}; rs.forEach(function (r) { c[r.trig] = (c[r.trig] || 0) + 1; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    var last = rs[0] ? U.daysAgo(rs[0].day) : null;
    return [
      { k: 'logged', v: rs.length },
      { k: 'days since', v: last == null ? '—' : last, c: 'good' },
      { k: 'top trigger', v: top || '—', c: 'bad' }
    ];
  },
  line: function (r) {
    return { title: zoneLabel(r.zone), sub: ['sev ' + (r.sev || '?') + '/3', r.trig, U.pretty12(r.time)].filter(Boolean).join(' · '), right: U.prettyDay(r.day), tone: r.sev === '3' ? 'bad' : r.sev === '2' ? 'warn' : '' };
  },
  empty: 'No headaches logged. Enviable skull.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Spot', f: function (r) { return zoneLabel(r.zone); } }, { l: 'Severity', k: 'sev' }, { l: 'Trigger', k: 'trig' }]
});
function zoneLabel(k) { var z = ZONES.filter(function (x) { return x.k === k; })[0]; return z ? z.l : 'somewhere'; }

/* 14 — Caffeine Curve */
add({
  id: 'caffeine', name: 'Caffeine Curve', emoji: '\u2615', cat: 'Health',
  blurb: 'Log coffees. Watch the decay curve predict your crash.',
  cta: 'Log the cup',
  fields: [f.s('drink', 'Drink', [
    { v: '95', l: 'Drip coffee (95mg)' }, { v: '64', l: 'Espresso shot (64mg)' }, { v: '128', l: 'Double shot (128mg)' },
    { v: '47', l: 'Black tea (47mg)' }, { v: '28', l: 'Green tea (28mg)' }, { v: '80', l: 'Energy drink (80mg)' },
    { v: '150', l: 'Cold brew (150mg)' }, { v: '200', l: 'Very bad decision (200mg)' }], { def: '95' }),
    DAY, f.tm('time', 'Time', H)],
  onAdd: function (r) { r.mg = U.num(r.drink); },
  panel: function (rs) {
    var todayDoses = rs.filter(function (r) { return r.day === U.today(); });
    var now = new Date(), nowH = now.getHours() + now.getMinutes() / 60;
    function level(h) {
      return U.sum(todayDoses, function (r) {
        var t = r.time ? +r.time.split(':')[0] + (+r.time.split(':')[1]) / 60 : 8;
        return h < t ? 0 : U.num(r.mg) * Math.pow(0.5, (h - t) / 5);
      });
    }
    var pts = [], maxL = Math.max(60, level(nowH));
    for (var h = 6; h <= 26; h += 0.5) { maxL = Math.max(maxL, level(h)); }
    for (var h2 = 6; h2 <= 26; h2 += 0.5) {
      var x = (h2 - 6) / 20 * 300, y = 100 - (level(h2) / maxL) * 92;
      pts.push(U.round(x, 1) + ',' + U.round(y, 1));
    }
    var nowX = Math.max(0, Math.min(300, (nowH - 6) / 20 * 300));
    var cur = level(nowH);
    /* find crash: when level drops under 40% of today's peak after peak */
    var crash = '—';
    for (var h3 = nowH; h3 <= 26; h3 += 0.25) { if (level(h3) < 40) { crash = fmtHour(h3); break; } }
    var sleepSafe = '—';
    for (var h4 = nowH; h4 <= 30; h4 += 0.25) { if (level(h4) < 25) { sleepSafe = fmtHour(h4); break; } }
    return '<div class="panel"><h4>Today\u2019s caffeine curve</h4>' +
      '<svg class="curve" viewBox="0 0 300 105" preserveAspectRatio="none">' +
      '<defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc46b" stop-opacity=".55"/><stop offset="1" stop-color="#ffc46b" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon points="0,100 ' + pts.join(' ') + ' 300,100" fill="url(#cg)"/>' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#ffc46b" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<line x1="' + nowX + '" y1="0" x2="' + nowX + '" y2="100" stroke="#ffffff55" stroke-dasharray="3 3"/>' +
      '</svg>' +
      '<div class="hint">6am \u2192 2am · dashed line is now · half-life assumed 5 hours</div>' +
      U.statsHTML([{ k: 'in you now', v: Math.round(cur) + 'mg', c: 'amber' }, { k: 'crash ~', v: crash, c: 'bad' }, { k: 'sleep-safe', v: sleepSafe, c: 'good' }]) +
      '</div>';
  },
  stats: function (rs) {
    var t = rs.filter(function (r) { return r.day === U.today(); });
    var days = U.uniqDays(rs);
    return [
      { k: 'cups today', v: t.length },
      { k: 'mg today', v: Math.round(U.sum(t, function (r) { return U.num(r.mg); })) },
      { k: 'daily avg mg', v: days.length ? Math.round(U.sum(rs, function (r) { return U.num(r.mg); }) / days.length) : 0, c: 'amber' }
    ];
  },
  line: function (r) { return { title: U.num(r.mg) + 'mg', sub: U.pretty12(r.time), right: U.prettyDay(r.day) }; },
  empty: 'No caffeine logged. How are you even reading this.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Time', k: 'time' }, { l: 'mg', k: 'mg' }]
});
function fmtHour(h) { h = h % 24; var hh = Math.floor(h), mm = Math.round((h - hh) * 60 / 15) * 15; if (mm === 60) { mm = 0; hh++; } return U.pretty12(U.pad(hh % 24) + ':' + U.pad(mm)); }

/* 15 — Step Guess */
add({
  id: 'steps', name: 'Step Guess', emoji: '\uD83D\uDC5F', cat: 'Health',
  blurb: 'No pedometer. Just you, guessing, and a permanent record of your optimism.',
  cta: 'Submit guess', daily: true,
  fields: [DAY, f.n('guess', 'Steps (your honest guess)', Object.assign({ ph: '7500' }, H)), f.c('vibe', 'Confidence', [{ v: 'sure', l: 'Certain' }, { v: 'eh', l: 'Ehh' }, { v: 'lie', l: 'Lying' }], { def: 'eh' })],
  stats: function (rs) {
    var avg = rs.length ? U.sum(rs, function (r) { return U.num(r.guess); }) / rs.length : 0;
    var lies = rs.filter(function (r) { return r.vibe === 'lie'; }).length;
    return [
      { k: 'avg guess', v: Math.round(avg).toLocaleString(), c: 'amber' },
      { k: 'days', v: rs.length },
      { k: 'admitted lies', v: lies + (rs.length ? ' (' + Math.round(lies / rs.length * 100) + '%)' : ''), c: 'bad' }
    ];
  },
  panel: function (rs) {
    if (rs.length < 3) return '';
    var avg = U.sum(rs, function (r) { return U.num(r.guess); }) / rs.length;
    var round0 = rs.filter(function (r) { return U.num(r.guess) % 1000 === 0; }).length;
    return '<div class="panel tight"><div class="quip">' + Math.round(round0 / rs.length * 100) +
      '% of your guesses are suspiciously round numbers. The delusion index is holding steady.</div></div>';
  },
  line: function (r) { return { title: U.num(r.guess).toLocaleString() + ' steps', sub: { sure: 'certain', eh: 'ehh', lie: 'openly lying' }[r.vibe] || '', right: U.prettyDay(r.day), tone: r.vibe === 'lie' ? 'bad' : '' }; },
  empty: 'No guesses. Statistically you walked zero steps.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Guess', k: 'guess' }, { l: 'Confidence', k: 'vibe' }]
});

/* 16 — Symptom Timeline */
add({
  id: 'symptom', name: 'Symptom Timeline', emoji: '\uD83E\uDE7A', cat: 'Health',
  blurb: 'So you stop telling the doctor "uh, a few weeks?"',
  cta: 'Log symptom',
  fields: [f.t('name', 'Symptom', { ph: 'Left knee ache' }), f.r('sev', 'Severity (1\u20135)', { def: 3 }), f.a('note', 'Context', { ph: 'Worse after stairs, better in the morning', max: 240 }), DAY],
  stats: function (rs) {
    var names = {}; rs.forEach(function (r) { names[(r.name || '').toLowerCase()] = 1; });
    var first = rs.length ? rs[rs.length - 1].day : null;
    return [
      { k: 'entries', v: rs.length },
      { k: 'distinct', v: Object.keys(names).length },
      { k: 'tracking since', v: first ? U.daysAgo(first) + 'd' : '—', c: 'amber' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '';
    var g = {}; rs.forEach(function (r) { var k = (r.name || '').toLowerCase(); (g[k] = g[k] || []).push(r); });
    var rows = Object.keys(g).sort(function (a, b) { return g[b].length - g[a].length; }).slice(0, 4).map(function (k) {
      var arr = g[k], firstD = arr[arr.length - 1].day, lastD = arr[0].day;
      return '<div class="it-sub" style="margin:5px 0"><b style="color:var(--ink)">' + U.esc(arr[0].name) + '</b> \u2014 ' +
        arr.length + ' entries over ' + (U.daysBetween(firstD, lastD) + 1) + ' days (since ' + U.prettyDay(firstD) + ')</div>';
    }).join('');
    return '<div class="panel tight"><h4>Doctor-ready summary</h4>' + rows + '</div>';
  },
  line: function (r) {
    return { title: r.name, sub: (r.note || ''), right: U.prettyDay(r.day), rightSub: 'sev ' + (r.sev || '?'), tone: U.num(r.sev) >= 4 ? 'bad' : U.num(r.sev) >= 3 ? 'warn' : '' };
  },
  empty: 'No symptoms. Magnificent meat vessel.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Symptom', k: 'name' }, { l: 'Severity', k: 'sev' }, { l: 'Note', k: 'note' }]
});

/* 17 — Medication Marks */
add({
  id: 'meds', name: 'Medication Marks', emoji: '\uD83D\uDC8A', cat: 'Health',
  blurb: 'Daily checkboxes with a rolling 30-day grid. No nagging, just a grid.',
  cta: 'Add medication', empty: 'No meds tracked. Add one to start the grid.',
  fields: [f.t('name', 'Medication or supplement', { ph: 'Vitamin D' }), f.t('dose', 'Dose (optional)', { ph: '2000 IU' })],
  onAdd: function (r) { r.dates = []; },
  stats: function (rs) {
    var t = U.today();
    var took = rs.filter(function (r) { return (r.dates || []).indexOf(t) >= 0; }).length;
    var adherence = 0;
    if (rs.length) {
      var hit = 0, poss = 0;
      rs.forEach(function (r) {
        for (var i = 0; i < 30; i++) { poss++; if ((r.dates || []).indexOf(U.addDays(t, -i)) >= 0) hit++; }
      });
      adherence = Math.round(hit / poss * 100);
    }
    return [
      { k: 'today', v: took + '/' + rs.length, c: rs.length && took === rs.length ? 'good' : 'amber' },
      { k: '30-day adherence', v: adherence + '%', c: adherence >= 80 ? 'good' : 'bad' },
      { k: 'tracked', v: rs.length }
    ];
  },
  line: function (r) {
    var d = r.dates || [], on = d.indexOf(U.today()) >= 0, t = U.today();
    var cells = '';
    for (var i = 29; i >= 0; i--) {
      var k = U.addDays(t, -i);
      cells += '<div class="' + (d.indexOf(k) >= 0 ? 'hit' : '') + (i === 0 ? ' today' : '') + '"></div>';
    }
    return {
      title: r.name + (r.dose ? ' · ' + r.dose : ''),
      rawSub: true, sub: '<div class="grid30" style="margin-top:6px">' + cells + '</div>',
      tone: on ? 'good' : '',
      btns: [{ l: on ? '\u2713 Taken today' : 'Mark taken', a: 'tap', c: on ? 'go' : '' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'tap') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.dates = r.dates || [];
    var i = r.dates.indexOf(U.today());
    if (i >= 0) { r.dates.splice(i, 1); U.soundTap(); }
    else { r.dates.push(U.today()); r.dates.sort(); U.soundSave(); U.buzz(); }
    return true;
  },
  cols: [{ l: 'Medication', k: 'name' }, { l: 'Dose', k: 'dose' }, { l: 'Days taken', f: function (r) { return (r.dates || []).length; } }]
});

/* 18 — Plate Log */
add({
  id: 'plate', name: 'Plate Log', emoji: '\uD83C\uDF7D\uFE0F', cat: 'Health',
  blurb: 'Photo-free meal logging. Three buttons: Great, Fine, Regret.',
  cta: 'Log meal',
  fields: [f.c('meal', 'Meal', ['Breakfast', 'Lunch', 'Dinner', 'Snack'], { def: 'Lunch' }),
  f.c('v', 'Verdict', [{ v: 'great', l: '\uD83D\uDE0A Great' }, { v: 'fine', l: '\uD83D\uDE10 Fine' }, { v: 'regret', l: '\uD83D\uDE2C Regret' }], { def: 'fine' }),
  f.t('what', 'What was it? (optional)', { ph: 'Leftover pad thai' }), DAY],
  stats: function (rs) {
    var g = rs.filter(function (r) { return r.v === 'great'; }).length;
    var reg = rs.filter(function (r) { return r.v === 'regret'; }).length;
    return [
      { k: 'meals', v: rs.length },
      { k: 'great', v: g + (rs.length ? ' · ' + Math.round(g / rs.length * 100) + '%' : ''), c: 'good' },
      { k: 'regret rate', v: (rs.length ? Math.round(reg / rs.length * 100) : 0) + '%', c: 'bad' }
    ];
  },
  line: function (r) {
    var em = { great: '\uD83D\uDE0A', fine: '\uD83D\uDE10', regret: '\uD83D\uDE2C' }[r.v] || '';
    return { title: em + ' ' + r.meal + (r.what ? ' \u2014 ' + r.what : ''), sub: r.v, right: U.prettyDay(r.day), tone: r.v === 'great' ? 'good' : r.v === 'regret' ? 'bad' : '' };
  },
  empty: 'No meals logged. Sustained by vibes.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Meal', k: 'meal' }, { l: 'Verdict', k: 'v' }, { l: 'What', k: 'what' }]
});

/* 19 — Posture Ping */
add({
  id: 'posture', name: 'Posture Ping', emoji: '\uD83E\uDDCD', cat: 'Health',
  blurb: 'A random ping. You answer honestly: upright human, or gremlin?',
  noForm: true,
  panel: function (rs) {
    var t = rs.filter(function (r) { return r.day === U.today(); });
    var good = t.filter(function (r) { return r.v === 'good'; }).length;
    return '<div class="panel" style="text-align:center"><h4>Right now, be honest</h4>' +
      '<div class="toggle-row"><button data-act="good" class="on">\uD83E\uDDCD Upright</button><button data-act="bad">\uD83D\uDC79 Gremlin</button></div>' +
      '<button class="ghost-btn wide" style="margin-top:10px" data-act="ping">Ping me in 10\u201340 minutes</button>' +
      '<div class="hint">' + (t.length ? good + ' of ' + t.length + ' checks today were upright.' : 'No checks today. Sit up. Or don\u2019t. I\u2019m a tracker, not a parent.') + '</div></div>';
  },
  act: function (n, el, rs) {
    if (n === 'ping') {
      var mins = 10 + Math.floor(Math.random() * 30);
      if ('Notification' in window) {
        Notification.requestPermission().then(function (p) {
          if (p === 'granted') {
            setTimeout(function () { try { new Notification('Posture check', { body: 'Upright human, or gremlin?', icon: './icons/icon-192.png' }); } catch (e) { } }, mins * 60000);
            U.toast('Ping scheduled in ' + mins + ' min (keep the app open).');
          } else U.toast('No notification permission \u2014 set a phone timer for ' + mins + ' min.');
        });
      } else U.toast('Set a timer for ' + mins + ' minutes.');
      U.soundTap(); return;
    }
    if (n === 'good' || n === 'bad') {
      rs.unshift({ id: U.uid(), day: U.today(), time: U.nowTime(), v: n === 'good' ? 'good' : 'gremlin', ts: Date.now() });
      if (n === 'good') { U.soundSave(); U.toast('Noted. Majestic.'); } else { U.soundOops(); U.toast('Gremlin logged. No judgment. Some judgment.'); }
      U.buzz(); return true;
    }
  },
  stats: function (rs) {
    var g = rs.filter(function (r) { return r.v === 'good'; }).length;
    return [
      { k: 'checks', v: rs.length },
      { k: 'upright', v: (rs.length ? Math.round(g / rs.length * 100) : 0) + '%', c: 'good' },
      { k: 'gremlin', v: rs.length - g, c: 'bad' }
    ];
  },
  line: function (r) { return { title: r.v === 'good' ? '\uD83E\uDDCD Upright' : '\uD83D\uDC79 Gremlin', sub: U.pretty12(r.time), right: U.prettyDay(r.day), tone: r.v === 'good' ? 'good' : 'bad' }; },
  empty: 'No posture checks. Shoulders currently unaccounted for.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Time', k: 'time' }, { l: 'Verdict', k: 'v' }]
});

/* 20 — PR Vault */
add({
  id: 'pr', name: 'PR Vault', emoji: '\uD83C\uDFC6', cat: 'Health',
  blurb: 'Personal records only. One number per lift. Updating it feels incredible.',
  cta: 'Add record', empty: 'Empty vault. Go move something heavy.',
  fields: [f.t('lift', 'Lift or feat', { ph: 'Deadlift' }), f.n('val', 'Number', Object.assign({ ph: '315' }, H)), f.c('unit', 'Unit', ['lb', 'kg', 'reps', 'sec', 'mi'], Object.assign({ def: 'lb' }, H))],
  onAdd: function (r) { r.hist = [{ v: U.num(r.val), d: U.today() }]; },
  stats: function (rs) {
    var ups = U.sum(rs, function (r) { return (r.hist || []).length - 1; });
    var recent = rs.filter(function (r) { var h = (r.hist || [])[(r.hist || []).length - 1]; return h && U.daysAgo(h.d) <= 30; }).length;
    return [
      { k: 'records', v: rs.length, c: 'amber' },
      { k: 'times beaten', v: ups, c: 'good' },
      { k: 'fresh (30d)', v: recent }
    ];
  },
  line: function (r) {
    var h = r.hist || [], first = h[0], last = h[h.length - 1];
    var gain = first && last ? last.v - first.v : 0;
    return {
      title: r.lift, right: U.num(r.val) + ' ' + (r.unit || ''),
      sub: (gain > 0 ? '+' + U.round(gain, 1) + ' since ' + U.prettyDay(first.d) : 'set ' + U.prettyDay(last ? last.d : r.day)) + ' · beaten ' + Math.max(0, h.length - 1) + '\u00D7',
      tone: 'amber',
      btns: [{ l: 'New PR', a: 'up', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'up') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    var v = prompt('New ' + r.lift + ' record (' + (r.unit || '') + '):', r.val);
    if (v == null || v === '') return;
    var nv = U.num(v);
    if (nv <= U.num(r.val)) { U.soundOops(); U.toast('That is not a record. That is a Tuesday.'); return; }
    r.val = nv; (r.hist = r.hist || []).push({ v: nv, d: U.today() });
    U.soundWin(); U.confetti(); U.buzz(30); U.toast('NEW PR: ' + nv + ' ' + (r.unit || '') + '. Incredible.');
    return true;
  },
  cols: [{ l: 'Lift', k: 'lift' }, { l: 'Record', k: 'val' }, { l: 'Unit', k: 'unit' }]
});

})();
/* ============================================================
   TRACKER DEFINITIONS — part B : Life Admin (10) + Media (10)
   ============================================================ */
(function () {
'use strict';
var U = window.TV, f = window.TVF;
var TRACKERS = window.TRACKERS;
function add(t) { TRACKERS.push(t); }
var H = { w: 'half' };
var DAY = f.d('day', 'Date', H);

/* shared: "due" math for maintenance-style items */
function dueInfo(last, days) {
  if (!last) return { left: null, tone: '', txt: 'never logged' };
  var left = days - U.daysAgo(last);
  return {
    left: left,
    tone: left < 0 ? 'bad' : left <= Math.max(1, days * 0.2) ? 'warn' : 'good',
    txt: left < 0 ? Math.abs(left) + ' days overdue' : left === 0 ? 'due today' : 'due in ' + left + ' days'
  };
}
function dueSort(a, b) {
  var la = a.last ? (a.every - U.daysAgo(a.last)) : -9999;
  var lb = b.last ? (b.every - U.daysAgo(b.last)) : -9999;
  return la - lb;
}

/* ============================================================
   LIFE ADMIN
   ============================================================ */

/* 21 — Fridge Clock */
var FRIDGE_LIFE = { Leftovers: 4, Produce: 7, Dairy: 10, Meat: 3, Condiment: 120, 'Mystery jar': 14, Freezer: 180 };
add({
  id: 'fridge', name: 'Fridge Clock', emoji: '\uD83E\uDDCA', cat: 'Life Admin',
  blurb: 'What went in, and when. Prevents leftover archaeology.',
  cta: 'Put it in the fridge', empty: 'Fridge empty. Or unmonitored. Both are frightening.',
  fields: [f.t('item', 'What is it', { ph: 'Chili, large batch' }),
  f.s('kind', 'Category', Object.keys(FRIDGE_LIFE), Object.assign({ def: 'Leftovers' }, H)),
  f.d('in', 'Went in', Object.assign({ def: U.today }, H))],
  sort: function (a, b) { return (U.daysAgo(b.in) / (FRIDGE_LIFE[b.kind] || 7)) - (U.daysAgo(a.in) / (FRIDGE_LIFE[a.kind] || 7)); },
  stats: function (rs) {
    var bad = rs.filter(function (r) { return U.daysAgo(r.in) > (FRIDGE_LIFE[r.kind] || 7); }).length;
    return [
      { k: 'items in', v: rs.length },
      { k: 'past prime', v: bad, c: bad ? 'bad' : 'good' },
      { k: 'oldest', v: rs.length ? Math.max.apply(null, rs.map(function (r) { return U.daysAgo(r.in); })) + 'd' : '—', c: 'amber' }
    ];
  },
  line: function (r) {
    var age = U.daysAgo(r.in), life = FRIDGE_LIFE[r.kind] || 7, left = life - age;
    return {
      title: r.item, sub: r.kind + ' · in ' + U.prettyDay(r.in) + ' · ' + (left < 0 ? 'science project' : left + ' days of dignity left'),
      right: age + 'd', rightSub: 'old', tone: left < 0 ? 'bad' : left <= 1 ? 'warn' : 'good',
      btns: [{ l: 'Eaten', a: 'gone', c: 'go' }, { l: 'Tossed', a: 'gone', c: 'del' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'gone') return;
    var i = rs.findIndex(function (x) { return x.id === el.dataset.id; });
    if (i >= 0) { rs.splice(i, 1); U.soundTap(); U.toast('Removed from the fridge.'); return true; }
  },
  cols: [{ l: 'Item', k: 'item' }, { l: 'Category', k: 'kind' }, { l: 'Went in', k: 'in' }]
});

/* 22 — WarrantyBox */
add({
  id: 'warranty', name: 'WarrantyBox', emoji: '\uD83D\uDCDC', cat: 'Life Admin',
  blurb: 'Purchase date plus warranty length, sorted by "about to expire."',
  cta: 'Add warranty', empty: 'No warranties logged. Everything is out of warranty, spiritually.',
  fields: [f.t('item', 'Item', { ph: 'Dishwasher' }), f.t('brand', 'Brand / model', { ph: 'Bosch 300' }),
  f.d('bought', 'Purchased', Object.assign({ def: U.today }, H)), f.n('months', 'Warranty (months)', Object.assign({ def: 12, ph: '12' }, H))],
  sort: function (a, b) { return expDays(a) - expDays(b); },
  stats: function (rs) {
    var live = rs.filter(function (r) { return expDays(r) >= 0; }).length;
    var soon = rs.filter(function (r) { var d = expDays(r); return d >= 0 && d <= 60; }).length;
    return [
      { k: 'active', v: live, c: 'good' },
      { k: 'expiring <60d', v: soon, c: soon ? 'warn' : '' },
      { k: 'expired', v: rs.length - live, c: 'bad' }
    ];
  },
  line: function (r) {
    var d = expDays(r);
    return {
      title: r.item + (r.brand ? ' \u2014 ' + r.brand : ''),
      sub: 'bought ' + U.prettyDay(r.bought) + ' · ' + U.num(r.months) + 'mo coverage · expires ' + U.prettyDay(expiry(r)),
      right: d >= 0 ? d + 'd' : 'expired', rightSub: d >= 0 ? 'left' : '',
      tone: d < 0 ? 'bad' : d <= 60 ? 'warn' : 'good'
    };
  },
  cols: [{ l: 'Item', k: 'item' }, { l: 'Brand', k: 'brand' }, { l: 'Bought', k: 'bought' }, { l: 'Expires', f: expiry }]
});
function expiry(r) { var d = U.parseDay(r.bought); d.setMonth(d.getMonth() + (U.num(r.months) || 0)); return U.dayKey(d); }
function expDays(r) { return -U.daysAgo(expiry(r)); }

/* 23 — Plant Parent */
add({
  id: 'plants', name: 'Plant Parent', emoji: '\uD83E\uDEB4', cat: 'Life Admin',
  blurb: 'Watering schedule per plant, with guilt-based color coding.',
  cta: 'Adopt plant', empty: 'No plants. No guilt. Balanced, honestly.',
  fields: [f.t('name', 'Plant', { ph: 'Monstera, the ungrateful' }),
  f.n('every', 'Water every (days)', Object.assign({ def: 7, ph: '7' }, H)),
  f.d('last', 'Last watered', Object.assign({ def: U.today }, H))],
  sort: dueSort,
  stats: function (rs) {
    var over = rs.filter(function (r) { return dueInfo(r.last, U.num(r.every)).left < 0; }).length;
    return [
      { k: 'plants', v: rs.length, c: 'good' },
      { k: 'thirsty', v: over, c: over ? 'bad' : 'good' },
      { k: 'next due', v: rs.length ? Math.min.apply(null, rs.map(function (r) { return Math.max(0, dueInfo(r.last, U.num(r.every)).left || 0); })) + 'd' : '—', c: 'amber' }
    ];
  },
  line: function (r) {
    var d = dueInfo(r.last, U.num(r.every));
    return {
      title: r.name, sub: 'every ' + U.num(r.every) + ' days · last ' + U.prettyDay(r.last) + ' · ' + d.txt,
      right: d.left < 0 ? 'THIRSTY' : d.left + 'd', tone: d.tone,
      btns: [{ l: '\uD83D\uDCA7 Watered', a: 'water', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'water') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.last = U.today(); U.soundSave(); U.buzz(); U.toast(r.name + ' has been forgiven.');
    return true;
  },
  cols: [{ l: 'Plant', k: 'name' }, { l: 'Every (days)', k: 'every' }, { l: 'Last watered', k: 'last' }]
});

/* 24 — Chore Wheel */
add({
  id: 'chores', name: 'Chore Wheel', emoji: '\uD83E\uDDF9', cat: 'Life Admin',
  blurb: 'Who last did what. Ends arguments. Starts better ones.',
  cta: 'Add chore', empty: 'No chores tracked. The dust is winning quietly.',
  fields: [f.t('name', 'Chore', { ph: 'Take out recycling' }),
  f.t('who', 'Who did it last', Object.assign({ ph: 'Me, obviously' }, H)),
  f.n('every', 'Every (days)', Object.assign({ def: 7 }, H)), f.d('last', 'Last done', { def: U.today })],
  sort: dueSort,
  stats: function (rs) {
    var c = {}; rs.forEach(function (r) { if (r.who) c[r.who] = (c[r.who] || 0) + ((r.log || []).length + 1); });
    var mvp = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    var over = rs.filter(function (r) { return dueInfo(r.last, U.num(r.every)).left < 0; }).length;
    return [
      { k: 'chores', v: rs.length },
      { k: 'overdue', v: over, c: over ? 'bad' : 'good' },
      { k: 'current MVP', v: mvp || '—', c: 'amber' }
    ];
  },
  line: function (r) {
    var d = dueInfo(r.last, U.num(r.every));
    return {
      title: r.name, sub: 'last by <b style="color:var(--ink)">' + U.esc(r.who || '???') + '</b> ' + U.prettyDay(r.last) + ' · ' + d.txt, rawSub: true,
      right: d.left < 0 ? 'OVERDUE' : d.left + 'd', tone: d.tone,
      btns: [{ l: 'I did it', a: 'me', c: 'go' }, { l: 'Someone else did it', a: 'other' }]
    };
  },
  act: function (n, el, rs) {
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    if (n === 'me') {
      var me = U.meta('chores').me || prompt('Your name (saved for next time):', 'Me') || 'Me';
      U.meta('chores').me = me;
      r.who = me; r.last = U.today(); (r.log = r.log || []).push({ who: me, d: U.today() });
      U.soundSave(); U.buzz(); U.toast('Logged. Mention it casually later.');
      return true;
    }
    if (n === 'other') {
      var w = prompt('Who did it?', r.who || ''); if (!w) return;
      r.who = w; r.last = U.today(); (r.log = r.log || []).push({ who: w, d: U.today() });
      U.soundTap(); return true;
    }
  },
  cols: [{ l: 'Chore', k: 'name' }, { l: 'Last by', k: 'who' }, { l: 'Last done', k: 'last' }, { l: 'Every', k: 'every' }]
});

/* 25 — Battery Graveyard */
add({
  id: 'battery', name: 'Battery Graveyard', emoji: '\uD83D\uDD0B', cat: 'Life Admin',
  blurb: 'Smoke detectors, remotes, and that one clock. Logged at last.',
  cta: 'Add device', empty: 'No devices logged. The chirping will find you.',
  fields: [f.t('name', 'Device', { ph: 'Hallway smoke detector' }),
  f.s('size', 'Battery', ['AA', 'AAA', '9V', 'CR2032', 'C', 'D', 'Rechargeable', 'Other'], Object.assign({ def: 'AA' }, H)),
  f.n('every', 'Replace every (months)', Object.assign({ def: 12 }, H)), f.d('last', 'Last replaced', { def: U.today })],
  sort: function (a, b) { return (U.num(a.every) * 30 - U.daysAgo(a.last)) - (U.num(b.every) * 30 - U.daysAgo(b.last)); },
  stats: function (rs) {
    var over = rs.filter(function (r) { return U.daysAgo(r.last) > U.num(r.every) * 30; }).length;
    return [{ k: 'devices', v: rs.length }, { k: 'due now', v: over, c: over ? 'bad' : 'good' },
    { k: 'swaps logged', v: U.sum(rs, function (r) { return (r.hist || []).length + 1; }), c: 'amber' }];
  },
  line: function (r) {
    var d = dueInfo(r.last, U.num(r.every) * 30);
    return {
      title: r.name, sub: r.size + ' · replaced ' + U.prettyDay(r.last) + ' · ' + d.txt,
      right: d.left < 0 ? 'DUE' : Math.round(d.left / 30) + 'mo', tone: d.tone,
      btns: [{ l: 'Replaced today', a: 'swap', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'swap') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    (r.hist = r.hist || []).push(r.last); r.last = U.today();
    U.soundSave(); U.buzz(); U.toast('Logged. The chirping is defeated.'); return true;
  },
  cols: [{ l: 'Device', k: 'name' }, { l: 'Battery', k: 'size' }, { l: 'Last replaced', k: 'last' }]
});

/* 26 — Filter Life */
add({
  id: 'filters', name: 'Filter Life', emoji: '\uD83C\uDF2C\uFE0F', cat: 'Life Admin',
  blurb: 'HVAC, water, vacuum. Nobody remembers. This remembers.',
  cta: 'Add filter', empty: 'No filters tracked. Breathing optimistically.',
  fields: [f.t('name', 'Filter', { ph: 'Furnace 16x25x1' }),
  f.s('type', 'Type', ['HVAC', 'Water', 'Vacuum', 'Fridge', 'Air purifier', 'Range hood', 'Other'], Object.assign({ def: 'HVAC' }, H)),
  f.n('every', 'Change every (months)', Object.assign({ def: 3 }, H)), f.d('last', 'Last changed', { def: U.today })],
  sort: function (a, b) { return (U.num(a.every) * 30 - U.daysAgo(a.last)) - (U.num(b.every) * 30 - U.daysAgo(b.last)); },
  stats: function (rs) {
    var over = rs.filter(function (r) { return U.daysAgo(r.last) > U.num(r.every) * 30; }).length;
    return [{ k: 'filters', v: rs.length }, { k: 'overdue', v: over, c: over ? 'bad' : 'good' },
    { k: 'changes', v: U.sum(rs, function (r) { return (r.hist || []).length + 1; }), c: 'amber' }];
  },
  line: function (r) {
    var d = dueInfo(r.last, U.num(r.every) * 30);
    var pct = Math.max(0, Math.min(100, 100 - (U.daysAgo(r.last) / (U.num(r.every) * 30) * 100)));
    return {
      title: r.name, rawSub: true,
      sub: r.type + ' · ' + d.txt + '<div class="bar-wrap"><div class="bar ' + (pct < 20 ? 'bad' : pct > 60 ? 'good' : '') + '" style="width:' + pct + '%"></div></div>',
      right: Math.round(pct) + '%', rightSub: 'life left', tone: d.tone,
      btns: [{ l: 'Changed today', a: 'swap', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'swap') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    (r.hist = r.hist || []).push(r.last); r.last = U.today();
    U.soundSave(); U.buzz(); U.toast('Fresh filter logged.'); return true;
  },
  cols: [{ l: 'Filter', k: 'name' }, { l: 'Type', k: 'type' }, { l: 'Last changed', k: 'last' }]
});

/* 27 — Car Log */
add({
  id: 'car', name: 'Car Log', emoji: '\uD83D\uDE97', cat: 'Life Admin',
  blurb: 'Oil, mileage, tires, and gas fill-ups with the MPG math done for you.',
  cta: 'Log it',
  fields: [f.c('type', 'Type', ['Gas', 'Oil', 'Tires', 'Repair', 'Other'], { def: 'Gas' }),
  f.n('miles', 'Odometer', Object.assign({ ph: '84320' }, H)), f.n('gal', 'Gallons (gas only)', Object.assign({ ph: '11.2' }, H)),
  f.n('cost', 'Cost ($)', Object.assign({ ph: '42.10' }, H)), DAY, f.t('note', 'Note', { ph: 'Left rear tire looked sad' })],
  sort: function (a, b) { return U.num(b.miles) - U.num(a.miles) || (b.day < a.day ? -1 : 1); },
  onAdd: function (r, rs) {
    if (r.type === 'Gas') {
      var prev = rs.filter(function (x) { return x.type === 'Gas' && U.num(x.miles) < U.num(r.miles); })
        .sort(function (a, b) { return U.num(b.miles) - U.num(a.miles); })[0];
      if (prev && U.num(r.gal) > 0) r.mpg = U.round((U.num(r.miles) - U.num(prev.miles)) / U.num(r.gal), 1);
    }
  },
  stats: function (rs) {
    var mpgs = rs.filter(function (r) { return r.mpg; });
    var spent = U.sum(rs, function (r) { return U.num(r.cost); });
    var oil = rs.filter(function (r) { return r.type === 'Oil'; })[0];
    return [
      { k: 'avg MPG', v: mpgs.length ? U.round(U.sum(mpgs, function (r) { return r.mpg; }) / mpgs.length, 1) : '—', c: 'good' },
      { k: 'total spent', v: U.money(spent), c: 'amber' },
      { k: 'since oil', v: oil ? (U.num(rs[0] && rs[0].miles) - U.num(oil.miles)).toLocaleString() + 'mi' : '—', c: 'bad' }
    ];
  },
  line: function (r) {
    return {
      title: r.type + (r.mpg ? ' \u2014 ' + r.mpg + ' MPG' : ''),
      sub: [U.num(r.miles).toLocaleString() + ' mi', r.gal ? U.num(r.gal) + ' gal' : '', r.note].filter(Boolean).join(' · '),
      right: r.cost ? U.money(U.num(r.cost)) : '', rightSub: U.prettyDay(r.day),
      tone: r.type === 'Oil' ? 'amber' : r.type === 'Repair' ? 'bad' : ''
    };
  },
  empty: 'No car entries. The check-engine light is a suggestion anyway.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Type', k: 'type' }, { l: 'Odometer', k: 'miles' }, { l: 'Gallons', k: 'gal' }, { l: 'Cost', k: 'cost' }, { l: 'MPG', k: 'mpg' }]
});

/* 28 — Lent Out */
add({
  id: 'lent', name: 'Lent Out', emoji: '\uD83E\uDD1D', cat: 'Life Admin',
  blurb: 'What you loaned, to whom, and for how appallingly long.',
  cta: 'Log the loan', empty: 'Nothing lent out. Either wise or friendless.',
  fields: [f.t('what', 'Item', { ph: 'Impact driver' }), f.t('who', 'Lent to', Object.assign({ ph: 'Dave' }, H)), f.d('when', 'On', Object.assign({ def: U.today }, H))],
  sort: function (a, b) { return U.daysAgo(b.when) - U.daysAgo(a.when); },
  stats: function (rs) {
    var worst = rs.length ? Math.max.apply(null, rs.map(function (r) { return U.daysAgo(r.when); })) : 0;
    return [
      { k: 'out there', v: rs.length, c: rs.length ? 'bad' : 'good' },
      { k: 'longest', v: worst + 'd', c: 'bad' },
      { k: 'returned', v: (U.meta('lent').returned || 0), c: 'good' }
    ];
  },
  line: function (r) {
    var d = U.daysAgo(r.when);
    return {
      title: r.what, sub: 'with ' + (r.who || 'someone') + ' since ' + U.prettyDay(r.when) + (d > 90 ? ' · this is now a gift' : ''),
      right: d, rightSub: 'days gone', tone: d > 90 ? 'bad' : d > 30 ? 'warn' : '',
      btns: [{ l: 'Returned', a: 'back', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'back') return;
    var i = rs.findIndex(function (x) { return x.id === el.dataset.id; }); if (i < 0) return;
    var d = U.daysAgo(rs[i].when);
    rs.splice(i, 1);
    U.meta('lent').returned = (U.meta('lent').returned || 0) + 1;
    U.soundWin(); U.buzz();
    U.toast(d > 60 ? 'Returned after ' + d + ' days. A miracle.' : 'Returned. Friendship intact.');
    return true;
  },
  cols: [{ l: 'Item', k: 'what' }, { l: 'Lent to', k: 'who' }, { l: 'Since', k: 'when' }, { l: 'Days gone', f: function (r) { return U.daysAgo(r.when); } }]
});

/* 29 — Subscription Autopsy */
add({
  id: 'subs', name: 'Subscription Autopsy', emoji: '\uD83D\uDC80', cat: 'Life Admin',
  blurb: 'Every recurring charge, the annual damage, and a "do I use this?" flag.',
  cta: 'Add subscription', empty: 'No subscriptions. Suspiciously frugal.',
  fields: [f.t('name', 'Service', { ph: 'Streaming thing #4' }),
  f.n('amt', 'Amount ($)', Object.assign({ ph: '15.99' }, H)),
  f.c('cycle', 'Billing', [{ v: 'm', l: 'Monthly' }, { v: 'y', l: 'Yearly' }, { v: 'w', l: 'Weekly' }], Object.assign({ def: 'm' }, H)),
  f.c('use', 'Do you use it?', [{ v: 'yes', l: 'Yes' }, { v: 'meh', l: 'Rarely' }, { v: 'no', l: 'No' }], { def: 'yes' })],
  sort: function (a, b) { return annual(b) - annual(a); },
  stats: function (rs) {
    var tot = U.sum(rs, annual);
    var waste = U.sum(rs.filter(function (r) { return r.use !== 'yes'; }), annual);
    return [
      { k: 'per year', v: U.money(tot), c: 'bad' },
      { k: 'per month', v: U.money(tot / 12), c: 'amber' },
      { k: 'wasted/yr', v: U.money(waste), c: 'bad' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '';
    var waste = U.sum(rs.filter(function (r) { return r.use === 'no'; }), annual);
    return waste > 0 ? '<div class="panel tight"><div class="quip">You are paying <b>' + U.money(waste) +
      '/year</b> for things you have flagged as unused. Cancelling them would take eleven minutes.</div></div>' : '';
  },
  line: function (r) {
    return {
      title: r.name, sub: U.money(U.num(r.amt)) + ' ' + { m: 'monthly', y: 'yearly', w: 'weekly' }[r.cycle] + ' · uses it: ' + (r.use === 'yes' ? 'yes' : r.use === 'meh' ? 'rarely' : 'no'),
      right: U.money(annual(r)), rightSub: 'per year',
      tone: r.use === 'no' ? 'bad' : r.use === 'meh' ? 'warn' : 'good',
      btns: [{ l: 'Toggle usage', a: 'flip' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'flip') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.use = r.use === 'yes' ? 'meh' : r.use === 'meh' ? 'no' : 'yes';
    U.soundTap(); return true;
  },
  cols: [{ l: 'Service', k: 'name' }, { l: 'Amount', k: 'amt' }, { l: 'Cycle', k: 'cycle' }, { l: 'Annual', f: annual }, { l: 'Used', k: 'use' }]
});
function annual(r) { var a = U.num(r.amt); return r.cycle === 'y' ? a : r.cycle === 'w' ? a * 52 : a * 12; }

/* 30 — Home Inventory */
add({
  id: 'inventory', name: 'Home Inventory', emoji: '\uD83D\uDCE6', cat: 'Life Admin',
  blurb: 'Room-by-room list for insurance. Boring until it is the most important app you own.',
  cta: 'Add item', empty: 'Nothing inventoried. Hope nothing happens!',
  fields: [f.t('item', 'Item', { ph: '65" TV' }),
  f.s('room', 'Room', ['Living room', 'Kitchen', 'Bedroom', 'Office', 'Garage', 'Basement', 'Bathroom', 'Storage', 'Outdoor'], Object.assign({ def: 'Living room' }, H)),
  f.n('val', 'Value ($)', Object.assign({ ph: '900' }, H)), f.t('serial', 'Serial / model (optional)'), f.d('bought', 'Purchased', { def: U.today })],
  sort: function (a, b) { return U.num(b.val) - U.num(a.val); },
  stats: function (rs) {
    var rooms = {}; rs.forEach(function (r) { rooms[r.room] = (rooms[r.room] || 0) + U.num(r.val); });
    var top = Object.keys(rooms).sort(function (a, b) { return rooms[b] - rooms[a]; })[0];
    return [
      { k: 'items', v: rs.length },
      { k: 'total value', v: U.money(U.sum(rs, function (r) { return U.num(r.val); })), c: 'good' },
      { k: 'priciest room', v: top || '—', c: 'amber' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '';
    var rooms = {}; rs.forEach(function (r) { rooms[r.room] = (rooms[r.room] || 0) + U.num(r.val); });
    var max = Math.max.apply(null, Object.keys(rooms).map(function (k) { return rooms[k]; }));
    return '<div class="panel"><h4>Value by room</h4>' + Object.keys(rooms).sort(function (a, b) { return rooms[b] - rooms[a]; }).map(function (k) {
      return '<div style="margin-bottom:8px"><div class="it-sub" style="display:flex;justify-content:space-between"><span>' + U.esc(k) + '</span><span>' + U.money(rooms[k]) + '</span></div>' +
        '<div class="bar-wrap"><div class="bar" style="width:' + (rooms[k] / max * 100) + '%"></div></div></div>';
    }).join('') + '</div>';
  },
  line: function (r) {
    return { title: r.item, sub: r.room + (r.serial ? ' · ' + r.serial : '') + ' · bought ' + U.prettyDay(r.bought), right: U.money(U.num(r.val)) };
  },
  cols: [{ l: 'Item', k: 'item' }, { l: 'Room', k: 'room' }, { l: 'Value', k: 'val' }, { l: 'Serial', k: 'serial' }, { l: 'Purchased', k: 'bought' }]
});

/* ============================================================
   MEDIA & HOBBIES
   ============================================================ */

/* 31 — Watchlist Purgatory */
add({
  id: 'watchlist', name: 'Watchlist Purgatory', emoji: '\uD83D\uDCFA', cat: 'Media',
  blurb: 'How long each show has sat unwatched. Shame-sorted.',
  cta: 'Add to purgatory', empty: 'Empty watchlist. Unheard of.',
  fields: [f.t('title', 'Show or film', { ph: 'That prestige drama' }),
  f.t('where', 'Where', Object.assign({ ph: 'Netflix' }, H)), f.d('added', 'Added', Object.assign({ def: U.today }, H))],
  sort: function (a, b) { return U.daysAgo(b.added) - U.daysAgo(a.added); },
  stats: function (rs) {
    var worst = rs.length ? Math.max.apply(null, rs.map(function (r) { return U.daysAgo(r.added); })) : 0;
    return [
      { k: 'in purgatory', v: rs.length, c: 'amber' },
      { k: 'oldest', v: worst + 'd', c: worst > 180 ? 'bad' : '' },
      { k: 'watched', v: U.meta('watchlist').done || 0, c: 'good' }
    ];
  },
  line: function (r) {
    var d = U.daysAgo(r.added);
    return {
      title: r.title, sub: (r.where || 'somewhere') + ' · added ' + U.prettyDay(r.added) + (d > 365 ? ' · you are never watching this' : ''),
      right: d, rightSub: 'days waiting', tone: d > 180 ? 'bad' : d > 60 ? 'warn' : '',
      btns: [{ l: 'Watched it', a: 'done', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'done') return;
    var i = rs.findIndex(function (x) { return x.id === el.dataset.id; }); if (i < 0) return;
    var d = U.daysAgo(rs[i].added); rs.splice(i, 1);
    U.meta('watchlist').done = (U.meta('watchlist').done || 0) + 1;
    U.soundWin(); U.buzz(); U.toast('Watched after only ' + d + ' days. Efficient.');
    return true;
  },
  cols: [{ l: 'Title', k: 'title' }, { l: 'Where', k: 'where' }, { l: 'Added', k: 'added' }, { l: 'Days waiting', f: function (r) { return U.daysAgo(r.added); } }]
});

/* 32 — BookSlog */
add({
  id: 'book', name: 'BookSlog', emoji: '\uD83D\uDCD6', cat: 'Media',
  blurb: 'Current page, total pages, and a projected finish date in the far future.',
  cta: 'Start book', empty: 'No books in progress. Suspiciously well-rested.',
  fields: [f.t('title', 'Book', { ph: 'Infinite Jest (again)' }),
  f.n('page', 'Current page', Object.assign({ def: 0, ph: '0' }, H)), f.n('pages', 'Total pages', Object.assign({ ph: '1079' }, H)),
  f.d('start', 'Started', { def: U.today })],
  stats: function (rs) {
    var pgs = U.sum(rs, function (r) { return U.num(r.page); });
    return [
      { k: 'in progress', v: rs.length },
      { k: 'pages read', v: pgs.toLocaleString(), c: 'good' },
      { k: 'pages/day', v: rs.length ? U.round(pgs / Math.max(1, U.sum(rs, function (r) { return U.daysAgo(r.start) + 1; })), 1) : 0, c: 'amber' }
    ];
  },
  line: function (r) {
    var p = U.num(r.page), tot = U.num(r.pages) || 1, days = Math.max(1, U.daysAgo(r.start) + 1);
    var rate = p / days, left = tot - p;
    var eta = rate > 0.05 ? U.addDays(U.today(), Math.ceil(left / rate)) : null;
    var etaTxt = eta ? U.parseDay(eta).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'the heat death of the universe';
    var pct = Math.min(100, p / tot * 100);
    return {
      title: r.title, rawSub: true,
      sub: p + ' / ' + tot + ' pages · ' + U.round(rate, 1) + ' pages/day · finishing <b style="color:var(--ink)">' + U.esc(etaTxt) + '</b>' +
        '<div class="bar-wrap"><div class="bar ' + (pct > 75 ? 'good' : '') + '" style="width:' + pct + '%"></div></div>',
      right: Math.round(pct) + '%', tone: rate < 1 ? 'bad' : pct > 75 ? 'good' : 'warn',
      btns: [{ l: 'Update page', a: 'pg', c: 'go' }, { l: 'Finished!', a: 'fin' }]
    };
  },
  act: function (n, el, rs) {
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    if (n === 'pg') {
      var v = prompt('Current page of "' + r.title + '":', r.page); if (v == null) return;
      r.page = U.num(v); U.soundSave(); U.buzz();
      if (r.page >= U.num(r.pages)) { U.confetti(); U.soundWin(); U.toast('Finished. Tell everyone immediately.'); }
      return true;
    }
    if (n === 'fin') {
      var i = rs.indexOf(r); rs.splice(i, 1);
      U.meta('book').done = (U.meta('book').done || 0) + 1;
      U.confetti(); U.soundWin(); U.toast('Book ' + (U.meta('book').done) + ' complete.');
      return true;
    }
  },
  cols: [{ l: 'Book', k: 'title' }, { l: 'Page', k: 'page' }, { l: 'Pages', k: 'pages' }, { l: 'Started', k: 'start' }]
});

/* 33 — Rewatch Counter */
add({
  id: 'rewatch', name: 'Rewatch Counter', emoji: '\uD83C\uDF7F', cat: 'Media',
  blurb: 'How many times you have seen each comfort movie. No judgment. Some judgment.',
  cta: 'Add film', empty: 'No comfort films logged. What do you even do when sad?',
  fields: [f.t('title', 'Film or show', { ph: 'The Mummy (1999)' }), f.n('n', 'Times seen', Object.assign({ def: 1, ph: '1' }, H)), f.d('last', 'Last watched', Object.assign({ def: U.today }, H))],
  sort: function (a, b) { return U.num(b.n) - U.num(a.n); },
  stats: function (rs) {
    var tot = U.sum(rs, function (r) { return U.num(r.n); });
    var top = rs.slice().sort(function (a, b) { return U.num(b.n) - U.num(a.n); })[0];
    return [
      { k: 'titles', v: rs.length },
      { k: 'total rewatches', v: tot, c: 'amber' },
      { k: 'champion', v: top ? (top.title.length > 11 ? top.title.slice(0, 10) + '\u2026' : top.title) : '—', c: 'violet' }
    ];
  },
  line: function (r) {
    var n = U.num(r.n);
    return {
      title: r.title, sub: 'last seen ' + U.prettyDay(r.last) + (n >= 10 ? ' · you have it memorized' : n >= 5 ? ' · you quote this at parties' : ''),
      right: '\u00D7' + n, tone: n >= 10 ? 'violet' : n >= 5 ? 'amber' : '',
      btns: [{ l: '+1 rewatch', a: 'inc', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    if (n !== 'inc') return;
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    r.n = U.num(r.n) + 1; r.last = U.today();
    U.soundSave(); U.buzz();
    if (U.num(r.n) % 10 === 0) { U.confetti(); U.soundWin(); U.toast(r.n + ' viewings. That is a relationship.'); }
    return true;
  },
  cols: [{ l: 'Title', k: 'title' }, { l: 'Times seen', k: 'n' }, { l: 'Last watched', k: 'last' }]
});

/* 34 — Vinyl Vault */
add({
  id: 'vinyl', name: 'Vinyl Vault', emoji: '\uD83C\uDFB5', cat: 'Media',
  blurb: 'Album, artist, condition, what you paid, and what you said you paid.',
  cta: 'Add to vault', empty: 'Empty vault. The turntable is just furniture.',
  fields: [f.t('album', 'Album', { ph: 'Rumours' }), f.t('artist', 'Artist', { ph: 'Fleetwood Mac' }),
  f.s('cond', 'Condition', ['Mint', 'Near Mint', 'VG+', 'VG', 'Good', 'Played to death'], Object.assign({ def: 'VG+' }, H)),
  f.n('paid', 'Actually paid ($)', Object.assign({ ph: '45' }, H)),
  f.n('told', 'What you said you paid ($)', Object.assign({ ph: '20' }, H)), f.d('got', 'Acquired', { def: U.today })],
  sort: function (a, b) { return U.num(b.paid) - U.num(a.paid); },
  stats: function (rs) {
    var paid = U.sum(rs, function (r) { return U.num(r.paid); });
    var told = U.sum(rs, function (r) { return U.num(r.told || r.paid); });
    return [
      { k: 'records', v: rs.length, c: 'violet' },
      { k: 'actually spent', v: U.money(paid), c: 'bad' },
      { k: 'the official story', v: U.money(told), c: 'good' }
    ];
  },
  panel: function (rs) {
    var gap = U.sum(rs, function (r) { return U.num(r.paid) - U.num(r.told || r.paid); });
    return gap > 0 ? '<div class="panel tight"><div class="quip">The discrepancy currently stands at <b>' + U.money(gap) +
      '</b>. This app will take that to the grave.</div></div>' : '';
  },
  line: function (r) {
    return { title: r.album, sub: r.artist + ' · ' + r.cond + ' · got ' + U.prettyDay(r.got), right: U.money(U.num(r.paid)), rightSub: r.told ? 'said ' + U.money(U.num(r.told)) : '' };
  },
  cols: [{ l: 'Album', k: 'album' }, { l: 'Artist', k: 'artist' }, { l: 'Condition', k: 'cond' }, { l: 'Paid', k: 'paid' }]
});

/* 35 — Game Backlog */
add({
  id: 'games', name: 'Game Backlog', emoji: '\uD83C\uDFAE', cat: 'Media',
  blurb: 'Hours in, status, and a brutally honest "never finishing this" toggle.',
  cta: 'Add game', empty: 'No backlog. Liar.',
  fields: [f.t('title', 'Game', { ph: 'Elden Ring' }),
  f.n('hrs', 'Hours in', Object.assign({ def: 0, ph: '0' }, H)),
  f.c('status', 'Status', [{ v: 'new', l: 'Unopened' }, { v: 'playing', l: 'Playing' }, { v: 'stalled', l: 'Stalled' }, { v: 'done', l: 'Finished' }], { def: 'new' }),
  f.b('never', 'Never finishing this?')],
  sort: function (a, b) { return U.num(b.hrs) - U.num(a.hrs); },
  stats: function (rs) {
    var never = rs.filter(function (r) { return r.never == 1; }).length;
    return [
      { k: 'games', v: rs.length },
      { k: 'hours sunk', v: U.round(U.sum(rs, function (r) { return U.num(r.hrs); }), 1), c: 'amber' },
      { k: 'never finishing', v: never, c: never ? 'bad' : 'good' }
    ];
  },
  line: function (r) {
    var st = { new: 'Unopened', playing: 'Playing', stalled: 'Stalled', done: 'Finished' }[r.status] || r.status;
    return {
      title: r.title + (r.never == 1 ? ' \uD83D\uDC80' : ''),
      sub: st + ' · ' + U.num(r.hrs) + 'h' + (r.never == 1 ? ' · officially abandoned' : ''),
      right: U.num(r.hrs) + 'h', tone: r.status === 'done' ? 'good' : r.never == 1 ? 'bad' : r.status === 'playing' ? 'amber' : '',
      btns: [{ l: '+1 hour', a: 'h1' }, { l: '+5 hours', a: 'h5' }, { l: 'Cycle status', a: 'st' }]
    };
  },
  act: function (n, el, rs) {
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    if (n === 'h1' || n === 'h5') { r.hrs = U.num(r.hrs) + (n === 'h5' ? 5 : 1); if (r.status === 'new') r.status = 'playing'; U.soundSave(); U.buzz(); return true; }
    if (n === 'st') {
      var order = ['new', 'playing', 'stalled', 'done'];
      r.status = order[(order.indexOf(r.status) + 1) % order.length];
      if (r.status === 'done') { U.confetti(); U.soundWin(); U.toast('Finished a game. Historic.'); } else U.soundTap();
      return true;
    }
  },
  cols: [{ l: 'Game', k: 'title' }, { l: 'Hours', k: 'hrs' }, { l: 'Status', k: 'status' }, { l: 'Never finishing', f: function (r) { return r.never == 1 ? 'yes' : ''; } }]
});

/* 36 — Recipe Scorecard */
add({
  id: 'recipe', name: 'Recipe Scorecard', emoji: '\uD83D\uDC69\u200D\uD83C\uDF73', cat: 'Media',
  blurb: 'Rate every dish you cook so you stop remaking the bad pasta.',
  cta: 'Score the dish',
  fields: [f.t('dish', 'Dish', { ph: 'Lemon garlic pasta' }), f.t('src', 'Source', Object.assign({ ph: 'NYT / Grandma / chaos' }, H)),
  f.r('rate', 'Rating', Object.assign({ def: 3 }, H)), f.b('again', 'Make it again?'), f.a('note', 'Fix next time', { ph: 'Half the lemon. HALF.', max: 200 }), DAY],
  sort: function (a, b) { return U.num(b.rate) - U.num(a.rate); },
  stats: function (rs) {
    var avg = rs.length ? U.sum(rs, function (r) { return U.num(r.rate); }) / rs.length : 0;
    return [
      { k: 'dishes', v: rs.length },
      { k: 'avg score', v: U.round(avg, 1) + '/5', c: avg >= 4 ? 'good' : 'amber' },
      { k: 'keepers', v: rs.filter(function (r) { return r.again == 1; }).length, c: 'good' }
    ];
  },
  line: function (r) {
    return {
      title: r.dish + ' ' + '\u2605'.repeat(U.num(r.rate)) , sub: [r.src, r.again == 1 ? 'would remake' : 'never again', r.note].filter(Boolean).join(' · '),
      right: U.num(r.rate) + '/5', rightSub: U.prettyDay(r.day),
      tone: U.num(r.rate) >= 4 ? 'good' : U.num(r.rate) <= 2 ? 'bad' : ''
    };
  },
  empty: 'No dishes scored. The bad pasta lives to strike again.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Dish', k: 'dish' }, { l: 'Rating', k: 'rate' }, { l: 'Remake', f: function (r) { return r.again == 1 ? 'yes' : 'no'; } }, { l: 'Note', k: 'note' }]
});

/* 37 — Podcast Nuggets */
add({
  id: 'podcast', name: 'Podcast Nuggets', emoji: '\uD83C\uDF99\uFE0F', cat: 'Media',
  blurb: 'One takeaway per episode, so the listening actually sticks.',
  cta: 'Save the nugget',
  fields: [f.t('show', 'Show', { ph: 'Some Very Long Interview Podcast' }), f.t('ep', 'Episode / guest', { ph: 'Ep. 402 \u2014 the octopus one' }),
  f.a('take', 'The one takeaway', { ph: 'Octopuses taste with their arms. Rethinking everything.', max: 280 }), DAY],
  stats: function (rs) {
    var shows = {}; rs.forEach(function (r) { shows[r.show] = (shows[r.show] || 0) + 1; });
    var top = Object.keys(shows).sort(function (a, b) { return shows[b] - shows[a]; })[0];
    return [
      { k: 'nuggets', v: rs.length, c: 'good' },
      { k: 'shows', v: Object.keys(shows).length },
      { k: 'most mined', v: top ? (top.length > 11 ? top.slice(0, 10) + '\u2026' : top) : '—', c: 'amber' }
    ];
  },
  line: function (r) { return { title: r.take, sub: r.show + (r.ep ? ' · ' + r.ep : ''), right: U.prettyDay(r.day), tone: 'amber' }; },
  empty: 'No nuggets. All those hours, simply gone.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Show', k: 'show' }, { l: 'Episode', k: 'ep' }, { l: 'Takeaway', k: 'take' }]
});

/* 38 — Concert Ledger */
add({
  id: 'concert', name: 'Concert Ledger', emoji: '\uD83C\uDFA4', cat: 'Media',
  blurb: 'Band, venue, date, who you went with, one line of review.',
  cta: 'Log the show',
  fields: [f.t('band', 'Band', { ph: 'Local opener who was better' }), f.t('venue', 'Venue', Object.assign({ ph: 'Metro' }, H)),
    DAY, f.t('who', 'Went with', { ph: 'Sam, who left early' }), f.r('rate', 'Rating', { def: 4 }), f.t('review', 'One-line review', { ph: 'Loud in the correct way.' })],
  stats: function (rs) {
    var venues = {}; rs.forEach(function (r) { venues[r.venue] = (venues[r.venue] || 0) + 1; });
    var top = Object.keys(venues).sort(function (a, b) { return venues[b] - venues[a]; })[0];
    var yr = rs.filter(function (r) { return (r.day || '').slice(0, 4) === String(new Date().getFullYear()); }).length;
    return [
      { k: 'shows', v: rs.length, c: 'violet' },
      { k: 'this year', v: yr, c: 'amber' },
      { k: 'home venue', v: top || '—' }
    ];
  },
  line: function (r) {
    return { title: r.band + ' ' + '\u2605'.repeat(U.num(r.rate)), sub: [r.venue, r.who ? 'with ' + r.who : '', r.review].filter(Boolean).join(' · '), right: U.prettyDay(r.day) };
  },
  empty: 'No shows logged. Ears in excellent condition.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Band', k: 'band' }, { l: 'Venue', k: 'venue' }, { l: 'With', k: 'who' }, { l: 'Review', k: 'review' }]
});

/* 39 — Practice Timer */
add({
  id: 'practice', name: 'Practice Timer', emoji: '\uD83C\uDFB8', cat: 'Media',
  blurb: 'Minutes practiced, weekly totals, and a streak you will defend violently.',
  cta: 'Log session',
  fields: [f.t('inst', 'Instrument / skill', { ph: 'Guitar', def: function () { return U.meta('practice').lastInst || ''; } }),
  f.n('min', 'Minutes', Object.assign({ ph: '30' }, H)), DAY, f.t('what', 'Worked on', { ph: 'That one barre chord, still' })],
  onAdd: function (r) { U.meta('practice').lastInst = r.inst; },
  panel: function (rs) {
    var m = U.meta('practice');
    var running = !!m.start;
    var el = running ? Math.floor((Date.now() - m.start) / 1000) : 0;
    return '<div class="panel" style="text-align:center"><h4>Live timer</h4>' +
      '<div class="timer-num" id="timerNum">' + fmtDur(el) + '</div>' +
      '<div class="toggle-row" style="margin-top:10px">' +
      '<button data-act="' + (running ? 'stop' : 'start') + '" class="' + (running ? '' : 'on') + '">' + (running ? 'Stop &amp; log' : 'Start') + '</button>' +
      (running ? '<button data-act="cancel">Cancel</button>' : '') + '</div>' +
      '<div class="hint">Or just type the minutes in below like a normal person.</div></div>';
  },
  tick: function () {
    var m = U.meta('practice'); var el = document.getElementById('timerNum');
    if (el && m.start) el.textContent = fmtDur(Math.floor((Date.now() - m.start) / 1000));
  },
  act: function (n, el, rs) {
    var m = U.meta('practice');
    if (n === 'start') { m.start = Date.now(); U.soundTap(); U.buzz(); return true; }
    if (n === 'cancel') { delete m.start; U.soundOops(); return true; }
    if (n === 'stop') {
      var mins = Math.max(1, Math.round((Date.now() - m.start) / 60000)); delete m.start;
      rs.unshift({ id: U.uid(), day: U.today(), inst: m.lastInst || 'Practice', min: mins, what: '', ts: Date.now() });
      U.soundSave(); U.buzz(); U.toast(mins + ' minutes logged. Fingers hurt, spirit strong.');
      return true;
    }
  },
  stats: function (rs) {
    var wk = rs.filter(function (r) { return U.daysAgo(r.day) < 7; });
    return [
      { k: 'this week', v: U.sum(wk, function (r) { return U.num(r.min); }) + 'm', c: 'good' },
      { k: 'streak', v: U.streakOf(U.uniqDays(rs)), c: 'amber' },
      { k: 'lifetime', v: U.round(U.sum(rs, function (r) { return U.num(r.min); }) / 60, 1) + 'h', c: 'violet' }
    ];
  },
  line: function (r) { return { title: U.num(r.min) + ' min · ' + (r.inst || ''), sub: r.what || '', right: U.prettyDay(r.day), tone: U.num(r.min) >= 30 ? 'good' : '' }; },
  empty: 'No practice logged. The instrument is dusty and it knows.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Instrument', k: 'inst' }, { l: 'Minutes', k: 'min' }, { l: 'Worked on', k: 'what' }]
});
function fmtDur(s) { var m = Math.floor(s / 60); return U.pad(m) + ':' + U.pad(s % 60); }

/* 40 — Board Game Record */
add({
  id: 'boardgame', name: 'Board Game Record', emoji: '\uD83C\uDFB2', cat: 'Media',
  blurb: 'Who won, what game, and precisely how mad everyone got.',
  cta: 'Record the carnage',
  fields: [f.t('game', 'Game', { ph: 'Catan' }), f.t('winner', 'Winner', Object.assign({ ph: 'Dana, again' }, H)),
  f.n('players', 'Players', Object.assign({ def: 4 }, H)), f.r('rage', 'Rage level', { def: 2 }), DAY, f.t('note', 'Incident report', { ph: 'Someone flipped a card. Passive-aggressively.' })],
  stats: function (rs) {
    var w = {}; rs.forEach(function (r) { if (r.winner) w[r.winner] = (w[r.winner] || 0) + 1; });
    var top = Object.keys(w).sort(function (a, b) { return w[b] - w[a]; })[0];
    var rage = rs.length ? U.sum(rs, function (r) { return U.num(r.rage); }) / rs.length : 0;
    return [
      { k: 'games played', v: rs.length },
      { k: 'reigning champ', v: top ? top + ' (' + w[top] + ')' : '—', c: 'amber' },
      { k: 'avg rage', v: U.round(rage, 1) + '/5', c: rage >= 3.5 ? 'bad' : 'good' }
    ];
  },
  line: function (r) {
    return {
      title: r.game + ' \u2014 ' + (r.winner || '?') + ' won',
      sub: [U.num(r.players) + ' players', 'rage ' + U.num(r.rage) + '/5', r.note].filter(Boolean).join(' · '),
      right: U.prettyDay(r.day), tone: U.num(r.rage) >= 4 ? 'bad' : ''
    };
  },
  empty: 'No games recorded. Friendships intact but undocumented.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Game', k: 'game' }, { l: 'Winner', k: 'winner' }, { l: 'Players', k: 'players' }, { l: 'Rage', k: 'rage' }]
});

})();
/* ============================================================
   TRACKER DEFINITIONS — part C : Food (5) + Work & Brain (5)
   ============================================================ */
(function () {
'use strict';
var U = window.TV, f = window.TVF;
var TRACKERS = window.TRACKERS;
function add(t) { TRACKERS.push(t); }
var H = { w: 'half' };
var DAY = f.d('day', 'Date', H);

/* ============================================================
   FOOD & DRINK
   ============================================================ */

/* 41 — Coffee Map */
add({
  id: 'coffee', name: 'Coffee Map', emoji: '\uD83D\uDDFA\uFE0F', cat: 'Food',
  blurb: 'Every shop, every order, rated 1\u20135. Your private Yelp with no strangers in it.',
  cta: 'Log the cup',
  fields: [f.t('shop', 'Shop', { ph: 'Sawada Coffee' }), f.t('hood', 'Neighborhood', Object.assign({ ph: 'West Loop' }, H)),
  f.r('rate', 'Rating', Object.assign({ def: 4 }, H)), f.t('order', 'What you ordered', { ph: 'Military latte' }),
    DAY, f.t('note', 'Note', { ph: 'Seating: hostile. Coffee: sublime.' })],
  sort: function (a, b) { return U.num(b.rate) - U.num(a.rate); },
  stats: function (rs) {
    var shops = {}; rs.forEach(function (r) { shops[r.shop] = 1; });
    var best = rs.slice().sort(function (a, b) { return U.num(b.rate) - U.num(a.rate); })[0];
    var avg = rs.length ? U.sum(rs, function (r) { return U.num(r.rate); }) / rs.length : 0;
    return [
      { k: 'shops', v: Object.keys(shops).length, c: 'amber' },
      { k: 'avg rating', v: U.round(avg, 1) + '/5' },
      { k: 'top pick', v: best ? (best.shop.length > 11 ? best.shop.slice(0, 10) + '\u2026' : best.shop) : '—', c: 'good' }
    ];
  },
  line: function (r) {
    return {
      title: r.shop + ' ' + '\u2605'.repeat(U.num(r.rate)),
      sub: [r.hood, r.order, r.note].filter(Boolean).join(' · '),
      right: U.num(r.rate) + '/5', rightSub: U.prettyDay(r.day),
      tone: U.num(r.rate) >= 4 ? 'good' : U.num(r.rate) <= 2 ? 'bad' : ''
    };
  },
  empty: 'No coffee logged. Impossible. Log the coffee.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Shop', k: 'shop' }, { l: 'Neighborhood', k: 'hood' }, { l: 'Order', k: 'order' }, { l: 'Rating', k: 'rate' }]
});

/* 42 — Hot Sauce Index */
add({
  id: 'hotsauce', name: 'Hot Sauce Index', emoji: '\uD83C\uDF36\uFE0F', cat: 'Food',
  blurb: 'Name, heat level, and a "would repeat" flag written through tears.',
  cta: 'Add sauce', empty: 'No sauces indexed. Life is bland and documented as such.',
  fields: [f.t('name', 'Sauce', { ph: 'Secret Aardvark' }), f.t('brand', 'Brand / origin', Object.assign({ ph: 'Portland' }, H)),
  f.n('heat', 'Heat (1\u201310)', Object.assign({ def: 5, min: 1, ph: '7' }, H)),
  f.c('rep', 'Would repeat?', [{ v: 'yes', l: '\uD83D\uDD25 Yes' }, { v: 'no', l: '\uD83D\uDE2D Never' }], { def: 'yes' }),
  f.t('note', 'Flavor note', { ph: 'Mango, then regret, then joy' })],
  sort: function (a, b) { return U.num(b.heat) - U.num(a.heat); },
  stats: function (rs) {
    var avg = rs.length ? U.sum(rs, function (r) { return U.num(r.heat); }) / rs.length : 0;
    var hot = rs.slice().sort(function (a, b) { return U.num(b.heat) - U.num(a.heat); })[0];
    return [
      { k: 'sauces', v: rs.length },
      { k: 'avg heat', v: U.round(avg, 1) + '/10', c: 'bad' },
      { k: 'hottest', v: hot ? hot.heat + '/10' : '—', c: 'bad' }
    ];
  },
  line: function (r) {
    var h = U.num(r.heat);
    return {
      title: r.name + ' ' + '\uD83C\uDF36\uFE0F'.repeat(Math.max(1, Math.min(5, Math.round(h / 2)))),
      sub: [r.brand, 'heat ' + h + '/10', r.rep === 'yes' ? 'would repeat' : 'never again', r.note].filter(Boolean).join(' · '),
      right: h + '/10', tone: r.rep === 'yes' ? 'good' : 'bad'
    };
  },
  cols: [{ l: 'Sauce', k: 'name' }, { l: 'Brand', k: 'brand' }, { l: 'Heat', k: 'heat' }, { l: 'Repeat', k: 'rep' }, { l: 'Note', k: 'note' }]
});

/* 43 — Taco Ranking */
add({
  id: 'taco', name: 'Taco Ranking', emoji: '\uD83C\uDF2E', cat: 'Food',
  blurb: 'A pure ranked list. Drag to reorder. Defend loudly at parties.',
  cta: 'Add to the ranking', empty: 'No tacos ranked. A vacuum of moral authority.',
  rank: true,
  fields: [f.t('name', 'Taco / spot', { ph: 'Al pastor \u2014 Carnitas Uruapan' }), f.t('note', 'Why', { ph: 'The pineapple is not optional' })],
  stats: function (rs) {
    return [
      { k: 'ranked', v: rs.length, c: 'amber' },
      { k: 'champion', v: rs[0] ? (rs[0].name.length > 12 ? rs[0].name.slice(0, 11) + '\u2026' : rs[0].name) : '—', c: 'good' },
      { k: 'last place', v: rs.length > 1 ? '#' + rs.length : '—', c: 'bad' }
    ];
  },
  line: function (r, rs, i) {
    return {
      lead: '<span class="rank-no">' + (i + 1) + '</span>',
      title: r.name, sub: r.note || '',
      tone: i === 0 ? 'amber' : '',
      btns: [{ l: '\u25B2', a: 'up' }, { l: '\u25BC', a: 'down' }, { l: 'To #1', a: 'top', c: 'go' }]
    };
  },
  act: function (n, el, rs) {
    var i = rs.findIndex(function (x) { return x.id === el.dataset.id; }); if (i < 0) return;
    if (n === 'up' && i > 0) { rs.splice(i - 1, 0, rs.splice(i, 1)[0]); U.soundTap(); return true; }
    if (n === 'down' && i < rs.length - 1) { rs.splice(i + 1, 0, rs.splice(i, 1)[0]); U.soundTap(); return true; }
    if (n === 'top' && i > 0) { rs.unshift(rs.splice(i, 1)[0]); U.soundWin(); U.toast('New champion crowned.'); return true; }
  },
  panel: function () { return '<div class="panel tight"><div class="quip">Press and hold a row to drag it, or use the arrows. New entries land at the bottom and must earn their way up.</div></div>'; },
  cols: [{ l: 'Rank', f: function (r, i) { return i + 1; } }, { l: 'Taco', k: 'name' }, { l: 'Why', k: 'note' }]
});

/* 44 — Beer Notes */
add({
  id: 'beer', name: 'Beer Notes', emoji: '\uD83C\uDF7A', cat: 'Food',
  blurb: 'Style, brewery, ABV, and a tasting note like "tastes like bread mistakes."',
  cta: 'Log the pour',
  fields: [f.t('name', 'Beer', { ph: 'Daisy Cutter' }), f.t('brewery', 'Brewery', Object.assign({ ph: 'Half Acre' }, H)),
  f.t('style', 'Style', Object.assign({ ph: 'Pale ale' }, H)),
  f.n('abv', 'ABV %', Object.assign({ ph: '5.2', step: '0.1' }, H)), f.r('rate', 'Rating', Object.assign({ def: 4 }, H)),
  f.t('note', 'Tasting note', { ph: 'Tastes like a lawn, affectionately' }), DAY],
  sort: function (a, b) { return U.num(b.rate) - U.num(a.rate); },
  stats: function (rs) {
    var styles = {}; rs.forEach(function (r) { if (r.style) styles[r.style] = (styles[r.style] || 0) + 1; });
    var top = Object.keys(styles).sort(function (a, b) { return styles[b] - styles[a]; })[0];
    var abv = rs.filter(function (r) { return U.num(r.abv); });
    return [
      { k: 'beers', v: rs.length, c: 'amber' },
      { k: 'avg ABV', v: abv.length ? U.round(U.sum(abv, function (r) { return U.num(r.abv); }) / abv.length, 1) + '%' : '—' },
      { k: 'house style', v: top || '—', c: 'good' }
    ];
  },
  line: function (r) {
    return {
      title: r.name + ' ' + '\u2605'.repeat(U.num(r.rate)),
      sub: [r.brewery, r.style, r.abv ? U.num(r.abv) + '%' : '', r.note].filter(Boolean).join(' · '),
      right: U.num(r.rate) + '/5', rightSub: U.prettyDay(r.day),
      tone: U.num(r.rate) >= 4 ? 'good' : U.num(r.rate) <= 2 ? 'bad' : ''
    };
  },
  empty: 'No beers noted. The palate remains undocumented.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Beer', k: 'name' }, { l: 'Brewery', k: 'brewery' }, { l: 'Style', k: 'style' }, { l: 'ABV', k: 'abv' }, { l: 'Rating', k: 'rate' }, { l: 'Note', k: 'note' }]
});

/* 45 — Restaurant Shortlist */
add({
  id: 'restaurant', name: 'Restaurant Shortlist', emoji: '\uD83C\uDF7D\uFE0F', cat: 'Food',
  blurb: 'Places you want to try, filtered by neighborhood and craving.',
  cta: 'Add to shortlist', empty: 'Shortlist empty. You will end up at the usual place again.',
  fields: [f.t('name', 'Restaurant', { ph: 'Kasama' }), f.t('hood', 'Neighborhood', Object.assign({ ph: 'Ukrainian Village' }, H)),
  f.s('crave', 'Craving', ['Any', 'Tacos', 'Noodles', 'Pizza', 'Sushi', 'BBQ', 'Sandwich', 'Brunch', 'Fancy', 'Comfort', 'Veg'], Object.assign({ def: 'Any' }, H)),
  f.t('why', 'Why / who recommended', { ph: 'Coworker would not stop talking about it' })],
  sort: function (a, b) { return (a.tried ? 1 : 0) - (b.tried ? 1 : 0); },
  stats: function (rs) {
    var tried = rs.filter(function (r) { return r.tried; }).length;
    var hoods = {}; rs.forEach(function (r) { if (r.hood) hoods[r.hood] = 1; });
    return [
      { k: 'on the list', v: rs.length - tried, c: 'amber' },
      { k: 'tried', v: tried, c: 'good' },
      { k: 'neighborhoods', v: Object.keys(hoods).length }
    ];
  },
  panel: function (rs) {
    var un = rs.filter(function (r) { return !r.tried; });
    if (!un.length) return '';
    return '<div class="panel" style="text-align:center"><h4>Can\u2019t decide?</h4>' +
      '<div class="big-num" style="font-size:20px;min-height:32px">' + U.esc(U.meta('restaurant').pickd || '\u2014') + '</div>' +
      '<button class="ghost-btn wide" style="margin-top:10px" data-act="roll">Pick one for me</button></div>';
  },
  act: function (n, el, rs) {
    var r;
    if (n === 'roll') {
      var un = rs.filter(function (x) { return !x.tried; });
      if (!un.length) return;
      r = U.pick(un); U.meta('restaurant').pickd = r.name + (r.hood ? ' (' + r.hood + ')' : '');
      U.soundWin(); U.buzz(); return true;
    }
    if (n === 'tried') {
      r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
      r.tried = !r.tried; if (r.tried) { r.triedOn = U.today(); U.soundSave(); U.toast('Crossed off. Growth.'); } else U.soundTap();
      return true;
    }
  },
  line: function (r) {
    return {
      title: (r.tried ? '\u2713 ' : '') + r.name,
      sub: [r.hood, r.crave !== 'Any' ? r.crave : '', r.why, r.tried ? 'tried ' + U.prettyDay(r.triedOn) : ''].filter(Boolean).join(' · '),
      tone: r.tried ? 'good' : '',
      btns: [{ l: r.tried ? 'Undo' : 'Been there', a: 'tried', c: r.tried ? '' : 'go' }]
    };
  },
  cols: [{ l: 'Restaurant', k: 'name' }, { l: 'Neighborhood', k: 'hood' }, { l: 'Craving', k: 'crave' }, { l: 'Tried', f: function (r) { return r.tried ? 'yes' : ''; } }]
});

/* ============================================================
   WORK & BRAIN
   ============================================================ */

/* 46 — Ticket Tally */
add({
  id: 'tickets', name: 'Ticket Tally', emoji: '\uD83C\uDFAB', cat: 'Work',
  blurb: 'Your own daily count of what you closed, for the week you need receipts.',
  noForm: true,
  panel: function (rs) {
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    var n = t ? t.n : 0;
    var wk = rs.filter(function (r) { return U.daysAgo(r.day) < 7; });
    var wkTot = U.sum(wk, function (r) { return r.n; });
    var max = Math.max.apply(null, [1].concat(rs.slice(0, 14).map(function (r) { return r.n; })));
    var bars = rs.slice(0, 14).reverse().map(function (r) {
      return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:60px">' +
        '<div style="height:' + (r.n / max * 100) + '%;background:linear-gradient(180deg,var(--amber),var(--amber2));border-radius:4px 4px 0 0" title="' + r.day + ': ' + r.n + '"></div></div>';
    }).join('');
    return '<div class="panel" style="text-align:center">' +
      '<div class="big-num amber">' + n + '</div><div class="tagline">closed today · ' + wkTot + ' this week</div>' +
      '<div class="toggle-row" style="margin-top:12px"><button data-act="minus">\u2212 1</button><button data-act="plus" class="on">+ 1 closed</button><button data-act="note">Add note</button></div>' +
      (rs.length ? '<div style="display:flex;gap:3px;align-items:flex-end;margin-top:14px">' + bars + '</div><div class="hint">last 14 logged days</div>' : '') +
      '</div>';
  },
  act: function (n, el, rs) {
    var t = rs.filter(function (r) { return r.day === U.today(); })[0];
    if (!t) { t = { id: U.uid(), day: U.today(), n: 0, ts: Date.now() }; rs.unshift(t); }
    if (n === 'plus') {
      t.n++; U.soundSave(); U.buzz();
      if (t.n % 10 === 0) { U.confetti(); U.soundWin(); U.toast(t.n + ' closed today. Screenshot this.'); }
      return true;
    }
    if (n === 'minus') { t.n = Math.max(0, t.n - 1); U.soundTap(); return true; }
    if (n === 'note') { var v = prompt('Note for today:', t.note || ''); if (v != null) { t.note = v; U.soundTap(); } return true; }
  },
  stats: function (rs) {
    var wk = rs.filter(function (r) { return U.daysAgo(r.day) < 7; });
    var best = rs.reduce(function (m, r) { return Math.max(m, r.n); }, 0);
    return [
      { k: 'this week', v: U.sum(wk, function (r) { return r.n; }), c: 'amber' },
      { k: 'daily avg', v: rs.length ? U.round(U.sum(rs, function (r) { return r.n; }) / rs.length, 1) : 0, c: 'good' },
      { k: 'personal best', v: best, c: 'violet' }
    ];
  },
  line: function (r) { return { title: r.n + ' closed', sub: r.note || '', right: U.prettyDay(r.day), tone: r.n >= 10 ? 'good' : '' }; },
  empty: 'Nothing tallied. The queue disagrees.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Closed', k: 'n' }, { l: 'Note', k: 'note' }]
});

/* 47 — Win Log */
add({
  id: 'wins', name: 'Win Log', emoji: '\uD83E\uDD47', cat: 'Work',
  blurb: 'Log wins as they happen so review season is not a memory heist.',
  cta: 'Bank the win',
  fields: [f.a('win', 'What you did', { ph: 'Automated the access-request workflow', max: 300 }),
  f.a('impact', 'Impact / numbers', { ph: 'Cut ticket intake ~40%, fulfillment down to 1 day', max: 300 }),
  f.s('tag', 'Type', ['Delivery', 'Automation', 'Leadership', 'Cost saving', 'Customer', 'Learning', 'Firefight'], Object.assign({ def: 'Delivery' }, H)), DAY],
  stats: function (rs) {
    var q = rs.filter(function (r) { return U.daysAgo(r.day) <= 90; }).length;
    var tags = {}; rs.forEach(function (r) { tags[r.tag] = (tags[r.tag] || 0) + 1; });
    var top = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; })[0];
    return [
      { k: 'wins banked', v: rs.length, c: 'good' },
      { k: 'last 90 days', v: q, c: 'amber' },
      { k: 'strength', v: top || '—', c: 'violet' }
    ];
  },
  panel: function (rs) {
    var q = rs.filter(function (r) { return U.daysAgo(r.day) <= 90; }).length;
    return '<div class="panel tight"><div class="quip">' + (rs.length
      ? 'You have ' + q + ' win' + (q === 1 ? '' : 's') + ' from the last 90 days sitting right here. Export to PDF before your next review and watch yourself become alarmingly articulate.'
      : 'Nothing banked yet. Future-you, sweating in a review meeting, is counting on present-you.') + '</div></div>';
  },
  line: function (r) {
    return { title: r.win, sub: [r.impact, r.tag].filter(Boolean).join(' · '), right: U.prettyDay(r.day), tone: 'good' };
  },
  empty: 'No wins logged. They happened. You just forgot. That is the whole problem.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Type', k: 'tag' }, { l: 'Win', k: 'win' }, { l: 'Impact', k: 'impact' }]
});

/* 48 — Meeting Cost */
add({
  id: 'meeting', name: 'Meeting Cost', emoji: '\uD83D\uDCB8', cat: 'Work',
  blurb: 'Attendees \u00D7 minutes \u00D7 a rough rate. Displays a number that will haunt you.',
  cta: 'Log this meeting',
  fields: [f.t('title', 'Meeting', { ph: 'Weekly sync (recurring, eternal)' }),
  f.n('people', 'Attendees', Object.assign({ def: 6, ph: '6' }, H)), f.n('mins', 'Minutes', Object.assign({ def: 60, ph: '60' }, H)),
  f.n('rate', 'Avg hourly rate ($)', Object.assign({ def: function () { return U.meta('meeting').rate || 75; } }, H)),
  f.c('worth', 'Worth it?', [{ v: 'yes', l: 'Yes' }, { v: 'meh', l: 'Meh' }, { v: 'no', l: 'Email' }], Object.assign({ def: 'meh' }, H)), DAY],
  onAdd: function (r) {
    r.cost = U.num(r.people) * (U.num(r.mins) / 60) * U.num(r.rate);
    U.meta('meeting').rate = U.num(r.rate);
  },
  afterAdd: function (r) { if (r.cost > 1000) { U.soundOops(); U.toast(U.money(r.cost) + '. That was an email.'); } },
  stats: function (rs) {
    var tot = U.sum(rs, function (r) { return r.cost || 0; });
    var waste = U.sum(rs.filter(function (r) { return r.worth === 'no'; }), function (r) { return r.cost || 0; });
    var hrs = U.sum(rs, function (r) { return U.num(r.mins) * U.num(r.people) / 60; });
    return [
      { k: 'total burned', v: U.money(tot), c: 'bad' },
      { k: 'should be email', v: U.money(waste), c: 'bad' },
      { k: 'human-hours', v: U.round(hrs) + 'h', c: 'amber' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '<div class="panel tight"><div class="quip">Log one meeting. See the number. Never recover.</div></div>';
    var tot = U.sum(rs, function (r) { return r.cost || 0; });
    return '<div class="panel" style="text-align:center"><h4>Cumulative damage</h4>' +
      '<div class="big-num" style="color:var(--bad)">' + U.money(tot) + '</div>' +
      '<div class="quip">' + meetingQuip(tot) + '</div></div>';
  },
  line: function (r) {
    return {
      title: r.title || 'Untitled meeting',
      sub: U.num(r.people) + ' people \u00D7 ' + U.num(r.mins) + ' min @ ' + U.money(U.num(r.rate)) + '/h · ' + ({ yes: 'worth it', meh: 'meh', no: 'should have been an email' }[r.worth] || ''),
      right: U.money(r.cost || 0), rightSub: U.prettyDay(r.day),
      tone: r.worth === 'no' ? 'bad' : r.worth === 'yes' ? 'good' : 'warn'
    };
  },
  empty: 'No meetings costed. Ignorance, briefly, is bliss.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Meeting', k: 'title' }, { l: 'People', k: 'people' }, { l: 'Minutes', k: 'mins' }, { l: 'Rate', k: 'rate' }, { l: 'Cost', f: function (r) { return U.money(r.cost || 0); } }, { l: 'Worth it', k: 'worth' }]
});
function meetingQuip(t) {
  if (t > 25000) return 'That is a car. You have held a car\u2019s worth of meetings.';
  if (t > 10000) return 'That is a very nice vacation, held hostage by a recurring invite.';
  if (t > 3000) return 'That is a laptop. A good one.';
  if (t > 500) return 'That is a month of groceries, spoken aloud into a headset.';
  return 'Modest so far. Keep logging. It compounds.';
}

/* 49 — Decision Journal */
add({
  id: 'decision', name: 'Decision Journal', emoji: '\uD83E\uDDED', cat: 'Work',
  blurb: 'The decision, your reasoning, your prediction. Revisit in 90 days. Humbling.',
  cta: 'Record decision',
  fields: [f.a('what', 'The decision', { ph: 'Move the intake process to a form instead of email', max: 300 }),
  f.a('why', 'Reasoning at the time', { ph: 'Email loses context and nobody can report on it', max: 400 }),
  f.a('predict', 'Predicted outcome', { ph: 'Intake drops ~30% and people stop DMing me at 9pm', max: 300 }),
  f.r('conf', 'Confidence', Object.assign({ def: 3 }, H)), DAY],
  onAdd: function (r) { r.revisit = U.addDays(r.day || U.today(), 90); },
  sort: function (a, b) {
    var ad = a.outcome ? 1 : 0, bd = b.outcome ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return U.daysAgo(b.revisit) - U.daysAgo(a.revisit);
  },
  stats: function (rs) {
    var due = rs.filter(function (r) { return !r.outcome && U.daysAgo(r.revisit) >= 0; }).length;
    var scored = rs.filter(function (r) { return r.outcome; });
    var right = scored.filter(function (r) { return r.outcome === 'right'; }).length;
    return [
      { k: 'decisions', v: rs.length },
      { k: 'ready to review', v: due, c: due ? 'amber' : 'good' },
      { k: 'called it', v: scored.length ? Math.round(right / scored.length * 100) + '%' : '—', c: 'violet' }
    ];
  },
  line: function (r) {
    var due = !r.outcome && U.daysAgo(r.revisit) >= 0;
    var lab = { right: '\u2713 Called it', wrong: '\u2717 Wrong', mixed: '\u2248 Mixed' }[r.outcome];
    return {
      title: (lab ? lab + ' \u2014 ' : '') + r.what,
      sub: ['confidence ' + U.num(r.conf) + '/5', 'predicted: ' + (r.predict || '—'), r.why ? 'because: ' + r.why : '',
        r.outcome ? 'reviewed ' + U.prettyDay(r.reviewed) + (r.actual ? ' · ' + r.actual : '') : 'revisit ' + U.prettyDay(r.revisit)].filter(Boolean).join(' · '),
      right: U.prettyDay(r.day),
      tone: r.outcome === 'right' ? 'good' : r.outcome === 'wrong' ? 'bad' : due ? 'amber' : '',
      btns: r.outcome ? [{ l: 'Re-open', a: 'reopen' }] : (due ? [{ l: 'Nailed it', a: 'o:right', c: 'go' }, { l: 'Mixed', a: 'o:mixed' }, { l: 'Nope', a: 'o:wrong', c: 'del' }] : [{ l: 'Review early', a: 'early' }])
    };
  },
  act: function (n, el, rs) {
    var r = rs.filter(function (x) { return x.id === el.dataset.id; })[0]; if (!r) return;
    if (n === 'early') { r.revisit = U.today(); U.soundTap(); return true; }
    if (n === 'reopen') { delete r.outcome; delete r.reviewed; U.soundTap(); return true; }
    if (n.indexOf('o:') === 0) {
      r.outcome = n.slice(2); r.reviewed = U.today();
      var a = prompt('What actually happened?', r.actual || ''); if (a != null) r.actual = a;
      if (r.outcome === 'right') { U.soundWin(); U.confetti(); U.toast('Correct. Insufferable, but correct.'); }
      else if (r.outcome === 'wrong') { U.soundOops(); U.toast('Logged. This is how calibration happens.'); }
      else U.soundSave();
      return true;
    }
  },
  empty: 'No decisions logged. Every choice currently unfalsifiable.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Decision', k: 'what' }, { l: 'Reasoning', k: 'why' }, { l: 'Prediction', k: 'predict' }, { l: 'Confidence', k: 'conf' }, { l: 'Revisit', k: 'revisit' }, { l: 'Outcome', k: 'outcome' }, { l: 'What happened', k: 'actual' }]
});

/* 50 — Learning Ledger */
add({
  id: 'learning', name: 'Learning Ledger', emoji: '\uD83D\uDCDA', cat: 'Work',
  blurb: 'One thing learned per day, tagged by topic, exportable to PDF.',
  cta: 'Log the lesson', daily: false,
  fields: [f.a('thing', 'What you learned', { ph: 'Conditional access policies evaluate in an order that is not the order you expect', max: 400 }),
  f.t('topic', 'Topic tag', Object.assign({ ph: 'Entra ID', def: function () { return U.meta('learning').lastTopic || ''; } }, H)),
  f.s('src', 'Source', ['Work', 'Reading', 'Video', 'Person', 'Mistake', 'Course'], Object.assign({ def: 'Work' }, H)), DAY],
  onAdd: function (r) { U.meta('learning').lastTopic = r.topic; },
  stats: function (rs) {
    var topics = {}; rs.forEach(function (r) { if (r.topic) topics[r.topic] = (topics[r.topic] || 0) + 1; });
    var top = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; })[0];
    return [
      { k: 'lessons', v: rs.length, c: 'good' },
      { k: 'streak', v: U.streakOf(U.uniqDays(rs)), c: 'amber' },
      { k: 'deepest topic', v: top ? (top.length > 11 ? top.slice(0, 10) + '\u2026' : top) : '—', c: 'violet' }
    ];
  },
  panel: function (rs) {
    if (!rs.length) return '';
    var topics = {}; rs.forEach(function (r) { if (r.topic) topics[r.topic] = (topics[r.topic] || 0) + 1; });
    var keys = Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; }).slice(0, 8);
    return '<div class="panel tight"><h4>Topics</h4><div class="chips" style="flex-wrap:wrap">' +
      keys.map(function (k) { return '<span class="chip">' + U.esc(k) + ' · ' + topics[k] + '</span>'; }).join('') + '</div></div>';
  },
  line: function (r) {
    return { title: r.thing, sub: [r.topic, r.src].filter(Boolean).join(' · '), right: U.prettyDay(r.day), tone: 'amber' };
  },
  empty: 'Nothing learned. Statistically unlikely. Write one down.',
  cols: [{ l: 'Date', k: 'day' }, { l: 'Topic', k: 'topic' }, { l: 'Source', k: 'src' }, { l: 'Lesson', k: 'thing' }]
});

})();
/* ============================================================
   APP ENGINE — routing, rendering, saving, exporting
   ============================================================ */
(function () {
'use strict';
var U = window.TV, T = window.TRACKERS;
var $ = U.$, $$ = U.$$, esc = U.esc;
var CATS = ['Habits', 'Health', 'Life Admin', 'Media', 'Food', 'Work'];
var CAT_EMOJI = { 'Habits': '\uD83E\uDDE0', 'Health': '\uD83D\uDCAA', 'Life Admin': '\uD83C\uDFE0', 'Media': '\uD83C\uDFAC', 'Food': '\uD83C\uDF54', 'Work': '\uD83C\uDFAF' };
var cur = null, filter = 'all', tickTimer = null;

function byId(id) { return T.filter(function (t) { return t.id === id; })[0]; }

/* ---------------- HOME ---------------- */
function renderHome() {
  var q = ($('#search').value || '').trim().toLowerCase();
  var list = T.filter(function (t) {
    if (filter === 'fav' && U.DB.favs.indexOf(t.id) < 0) return false;
    if (filter !== 'all' && filter !== 'fav' && t.cat !== filter) return false;
    if (!q) return true;
    return (t.name + ' ' + t.blurb + ' ' + t.cat).toLowerCase().indexOf(q) >= 0;
  });
  var html = '';
  if (!list.length) {
    html = '<div class="empty-note">No trackers match that. Try fewer letters.</div>';
  } else {
    CATS.forEach(function (c) {
      var g = list.filter(function (t) { return t.cat === c; });
      if (!g.length) return;
      html += '<div class="cat-head"><h3>' + CAT_EMOJI[c] + ' ' + esc(c) + '</h3><span>' + g.length + '</span></div><div class="grid">' +
        g.map(cardHTML).join('') + '</div>';
    });
  }
  $('#homeList').innerHTML = html;
  var used = T.filter(function (t) { return (U.DB.data[t.id] || []).length; }).length;
  var entries = T.reduce(function (s, t) { return s + (U.DB.data[t.id] || []).length; }, 0);
  $('#footStat').textContent = used + ' of ' + T.length + ' trackers in use · ' + entries + ' entries stored locally';
}
function cardHTML(t) {
  var n = (U.DB.data[t.id] || []).length;
  var fav = U.DB.favs.indexOf(t.id) >= 0;
  return '<button class="card" data-go="' + t.id + '">' +
    '<span class="emo">' + t.emoji + '</span>' +
    '<span class="nm">' + esc(t.name) + '</span>' +
    '<span class="bl">' + esc(t.blurb) + '</span>' +
    (n ? '<span class="cnt">' + n + '</span>' : '') +
    (fav ? '<span class="fav">\u2605</span>' : '') +
    '</button>';
}
function renderChips() {
  var all = [{ v: 'all', l: 'All 50' }, { v: 'fav', l: '\u2605 Favorites' }].concat(CATS.map(function (c) { return { v: c, l: CAT_EMOJI[c] + ' ' + c }; }));
  $('#chips').innerHTML = all.map(function (c) {
    return '<button class="chip' + (filter === c.v ? ' on' : '') + '" data-chip="' + esc(c.v) + '">' + esc(c.l) + '</button>';
  }).join('');
}

/* ---------------- TRACKER SCREEN ---------------- */
function openTracker(id) {
  var t = byId(id); if (!t) return go('');
  cur = t;
  $('#home').classList.remove('active');
  $('#tracker').classList.add('active');
  $('#tName').textContent = t.emoji + '  ' + t.name;
  $('#tBlurb').textContent = t.blurb;
  $('#btnStar').classList.toggle('on', U.DB.favs.indexOf(t.id) >= 0);
  $('#btnStar').innerHTML = U.DB.favs.indexOf(t.id) >= 0 ? '\u2605' : '\u2606';
  window.scrollTo(0, 0);
  renderTracker(true);
}
function getRecs(t) {
  var rs = U.recs(t.id);
  if (t.prep) {
    var f = t.prep(rs);
    if (f.length !== rs.length) { U.setRecs(t.id, f); rs = U.recs(t.id); }
  }
  return rs;
}
function sorted(t, rs) {
  var a = rs.slice();
  if (t.rank) return a;
  if (t.sort) a.sort(t.sort);
  else a.sort(function (x, y) { return (y.day || '').localeCompare(x.day || '') || (y.ts || 0) - (x.ts || 0); });
  return a;
}
function renderTracker(resetForm) {
  var t = cur; if (!t) return;
  var rs = getRecs(t);
  var keep = null;
  if (!resetForm && $('#entryForm')) keep = U.readForm();
  var html = '';
  if (t.panel) html += t.panel(rs, t);
  if (!t.noForm) html += U.formHTML(t, keep || U.defaults(t));
  if (t.stats) html += U.statsHTML(t.stats(rs));
  html += U.listHTML(t, sorted(t, rs));
  $('#tBody').innerHTML = html;
  clearInterval(tickTimer);
  if (t.tick) tickTimer = setInterval(t.tick, 1000);
  if (t.rank) wireDrag();
}

/* delegated clicks inside the tracker body */
$('#tBody').addEventListener('click', function (e) {
  var t = cur; if (!t) return;
  var rateBtn = e.target.closest('[data-rating] button, [data-choice] button');
  if (rateBtn) {
    e.preventDefault();
    var wrap = rateBtn.parentNode;
    $$('button', wrap).forEach(function (b) { b.classList.remove('on'); });
    rateBtn.classList.add('on');
    wrap.nextElementSibling.value = rateBtn.getAttribute('data-val');
    U.soundTap(); U.buzz(8);
    return;
  }
  var btn = e.target.closest('[data-act]');
  if (!btn) return;
  e.preventDefault();
  var act = btn.getAttribute('data-act');
  var rs = U.recs(t.id);
  if (act === '__del') {
    var i = rs.findIndex(function (x) { return x.id === btn.dataset.id; });
    if (i >= 0) {
      var el = btn.closest('.item');
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0'; el.style.transform = 'translateX(30px)';
      rs.splice(i, 1); U.save(); U.soundOops(); U.buzz(8);
      setTimeout(function () { renderTracker(false); }, 180);
    }
    return;
  }
  if (t.act && t.act(act, btn, rs) === true) { U.save(); renderTracker(false); }
});

/* character counters */
$('#tBody').addEventListener('input', function (e) {
  var el = e.target;
  if (el.tagName === 'TEXTAREA' && el.maxLength > 0) {
    var cc = $('.charcount[data-for="' + el.getAttribute('data-k') + '"]');
    if (cc) {
      cc.textContent = el.value.length + '/' + el.maxLength;
      cc.classList.toggle('over', el.value.length >= el.maxLength);
    }
  }
});

/* form submit */
$('#tBody').addEventListener('submit', function (e) {
  e.preventDefault();
  var t = cur; if (!t) return;
  var v = U.readForm();
  var first = (t.fields || [])[0];
  if (t.validate) { var err = t.validate(v); if (err) { U.soundOops(); U.toast(err); return; } }
  else if (first && !String(v[first.k] || '').trim()) { U.soundOops(); U.toast('Fill in ' + (first.l || 'the first field') + ' first.'); return; }

  var rs = U.recs(t.id);
  var r = Object.assign({ id: U.uid(), ts: Date.now() }, v);
  if (!r.day) r.day = U.today();

  if (t.daily) {
    var ex = rs.filter(function (x) { return x.day === r.day; })[0];
    if (ex) { Object.assign(ex, v, { ts: Date.now() }); r = ex; }
    else rs.unshift(r);
  } else if (t.rank) {
    rs.push(r);
  } else {
    if (t.onAdd) t.onAdd(r, rs);
    rs.unshift(r);
  }
  if (t.onAdd && (t.daily || t.rank)) t.onAdd(r, rs);
  U.save();
  U.soundSave(); U.buzz(14);
  var btn = $('#submitBtn'); if (btn) { btn.classList.add('pulse'); }
  if (t.afterAdd) t.afterAdd(r, rs);
  else U.toast(t.rank ? 'Added at #' + rs.length + '. Climb, champion.' : 'Saved.');
  renderTracker(true);
  var body = $('#tBody');
  var firstItem = $('.item', body);
  if (firstItem) firstItem.style.animation = 'slideIn .42s cubic-bezier(.2,.9,.25,1.15)';
});

/* ---------------- drag to reorder (rank trackers) ---------------- */
function wireDrag() {
  var list = $('.list', $('#tBody')); if (!list) return;
  $$('.item', list).forEach(function (el) { el.classList.add('drag-item'); });
  var dragEl = null, holdT = null;
  list.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    var el = e.target.closest('.item'); if (!el) return;
    holdT = setTimeout(function () {
      dragEl = el; el.classList.add('dragging'); U.buzz(18); U.soundTap();
      el.setPointerCapture(e.pointerId);
    }, 220);
  });
  list.addEventListener('pointermove', function (e) {
    if (!dragEl) { clearTimeout(holdT); return; }
    e.preventDefault();
    var items = $$('.item', list);
    for (var i = 0; i < items.length; i++) {
      if (items[i] === dragEl) continue;
      var r = items[i].getBoundingClientRect();
      if (e.clientY > r.top && e.clientY < r.bottom) {
        var after = e.clientY > r.top + r.height / 2;
        list.insertBefore(dragEl, after ? items[i].nextSibling : items[i]);
        break;
      }
    }
  });
  function end() {
    clearTimeout(holdT);
    if (!dragEl) return;
    dragEl.classList.remove('dragging'); dragEl = null;
    var ids = $$('.item', list).map(function (el) { return el.dataset.id; });
    var rs = U.recs(cur.id);
    rs.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
    U.save(); U.soundSave(); renderTracker(false);
  }
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

/* ---------------- routing ---------------- */
function go(hash) { location.hash = hash ? '#/t/' + hash : '#/'; }
function route() {
  var h = location.hash || '#/';
  var m = h.match(/^#\/t\/([\w-]+)$/);
  if (m) { openTracker(m[1]); }
  else {
    cur = null; clearInterval(tickTimer);
    $('#tracker').classList.remove('active');
    $('#home').classList.add('active');
    renderChips(); renderHome();
  }
}
window.addEventListener('hashchange', route);

$('#homeList').addEventListener('click', function (e) {
  var c = e.target.closest('[data-go]'); if (!c) return;
  U.soundTap(); U.buzz(8); go(c.getAttribute('data-go'));
});
$('#chips').addEventListener('click', function (e) {
  var c = e.target.closest('[data-chip]'); if (!c) return;
  filter = c.getAttribute('data-chip'); U.soundTap();
  renderChips(); renderHome();
});
$('#search').addEventListener('input', renderHome);
$('#clearSearch').addEventListener('click', function () { $('#search').value = ''; renderHome(); $('#search').blur(); });
$('#btnBack').addEventListener('click', function () { history.length > 1 ? history.back() : go(''); });
$('#btnStar').addEventListener('click', function () {
  if (!cur) return;
  var i = U.DB.favs.indexOf(cur.id);
  if (i >= 0) { U.DB.favs.splice(i, 1); U.toast('Unstarred.'); }
  else { U.DB.favs.push(cur.id); U.toast('Starred. It will surface first.'); }
  U.save(); U.soundTap();
  $('#btnStar').classList.toggle('on', i < 0);
  $('#btnStar').innerHTML = i < 0 ? '\u2605' : '\u2606';
});
$('#btnClear').addEventListener('click', function () {
  if (!cur) return;
  if (!confirm('Delete every entry in ' + cur.name + '? This cannot be undone.')) return;
  U.setRecs(cur.id, []); U.DB.meta[cur.id] = {}; U.save();
  U.soundOops(); U.toast('Wiped clean.');
  renderTracker(true);
});

/* ---------------- PDF export (via print) ---------------- */
function tableFor(t) {
  var rs = sorted(t, U.recs(t.id));
  if (!rs.length) return '';
  var cols = t.cols || (t.fields || []).map(function (f) { return { l: f.l || f.k, k: f.k }; });
  var head = '<tr>' + cols.map(function (c) { return '<th>' + esc(c.l) + '</th>'; }).join('') + '</tr>';
  var body = rs.map(function (r, i) {
    return '<tr>' + cols.map(function (c) {
      var v = c.f ? c.f(r, i) : r[c.k];
      return '<td>' + esc(v == null ? '' : v) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table>' + head + body + '</table>';
}
function printDoc(title, inner) {
  $('#printArea').innerHTML = '<h1>' + esc(title) + '</h1><div class="pmeta">Tallyverse export · ' +
    new Date().toLocaleString() + '</div>' + inner;
  setTimeout(function () { window.print(); }, 60);
}
$('#btnExport').addEventListener('click', function () {
  if (!cur) return;
  var tbl = tableFor(cur);
  if (!tbl) { U.soundOops(); U.toast('Nothing to export yet.'); return; }
  var st = cur.stats ? cur.stats(U.recs(cur.id)) : [];
  var statLine = st.length ? '<div class="pmeta">' + st.map(function (s) { return esc(s.k) + ': ' + esc(String(s.v).replace(/<[^>]+>/g, '')); }).join('  ·  ') + '</div>' : '';
  printDoc(cur.name, statLine + tbl);
  U.soundTap();
  U.toast('Print sheet ready \u2014 choose "Save to Files" for a PDF.');
});
$('#btnExportAll').addEventListener('click', function () {
  var inner = '';
  T.forEach(function (t) {
    var tbl = tableFor(t);
    if (tbl) inner += '<h2>' + t.emoji + ' ' + esc(t.name) + '</h2>' + tbl;
  });
  if (!inner) { U.soundOops(); U.toast('No data anywhere yet.'); return; }
  closeSheet();
  printDoc('Tallyverse \u2014 everything', inner);
});

/* ---------------- backup / restore ---------------- */
$('#btnBackup').addEventListener('click', function () {
  var json = JSON.stringify(U.DB, null, 2);
  var name = 'tallyverse-backup-' + U.today() + '.json';
  var blob = new Blob([json], { type: 'application/json' });
  var file = null;
  try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Tallyverse backup' }).catch(function () { });
  } else {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  U.soundSave(); U.toast('Backup created. Put it somewhere safe.');
});
$('#btnRestore').addEventListener('click', function () { $('#fileRestore').click(); });
$('#fileRestore').addEventListener('change', function (e) {
  var f = e.target.files[0]; if (!f) return;
  var fr = new FileReader();
  fr.onload = function () {
    try {
      var p = JSON.parse(fr.result);
      if (!p || typeof p !== 'object' || !p.data) throw new Error('bad file');
      if (!confirm('Replace all current data with this backup?')) return;
      U.DB.data = p.data || {}; U.DB.favs = p.favs || []; U.DB.meta = p.meta || {};
      U.DB.opts = Object.assign(U.DB.opts, p.opts || {});
      U.save(); U.soundWin(); U.toast('Restored. Welcome back.');
      closeSheet(); route();
    } catch (err) { U.soundOops(); U.toast('That file is not a Tallyverse backup.'); }
  };
  fr.readAsText(f);
  e.target.value = '';
});
$('#btnNuke').addEventListener('click', function () {
  if (!confirm('Delete ALL data in ALL 50 trackers? There is no undo.')) return;
  if (!confirm('Really? Every streak, every taco ranking, gone forever?')) return;
  U.DB.data = {}; U.DB.meta = {}; U.DB.favs = [];
  U.save(); U.soundOops(); U.toast('Everything erased. Fresh start.');
  closeSheet(); route();
});

/* ---------------- settings sheet ---------------- */
function openSheet() {
  $('#optSound').checked = !!U.DB.opts.sound;
  $('#optHaptic').checked = !!U.DB.opts.haptic;
  $('#optConfetti').checked = !!U.DB.opts.confetti;
  $('#sheet').hidden = false;
}
function closeSheet() { $('#sheet').hidden = true; }
$('#btnSettings').addEventListener('click', function () { U.soundTap(); openSheet(); });
$('#btnCloseSheet').addEventListener('click', function () { U.soundTap(); closeSheet(); });
$('#sheet').addEventListener('click', function (e) { if (e.target.id === 'sheet') closeSheet(); });
['optSound', 'optHaptic', 'optConfetti'].forEach(function (id) {
  $('#' + id).addEventListener('change', function (e) {
    U.DB.opts[id.replace('opt', '').toLowerCase()] = e.target.checked;
    U.save();
    if (e.target.checked) { if (id === 'optConfetti') U.confetti(); else U.soundSave(); }
  });
});

/* ---------------- taglines ---------------- */
var TAGS = ['50 tiny trackers. Zero cloud.', 'Your data never leaves this phone.',
  'Offline by design, not by accident.', 'Tracking things is 90% of self-improvement.',
  'No accounts. No ads. No feed. No streak guilt push notifications at 9pm.'];

/* ---------------- boot ---------------- */
U.load();
$('#tagline').textContent = U.pick(TAGS);
route();

/* unlock audio on first interaction (iOS) */
document.addEventListener('touchstart', function unlock() {
  U.tone([0], 0.01, 0.0001);
  document.removeEventListener('touchstart', unlock);
}, { passive: true });

/* re-render at midnight so "today" stays honest */
setInterval(function () {
  var d = U.today();
  if (window.__tvDay && window.__tvDay !== d) { window.__tvDay = d; route(); }
  else window.__tvDay = d;
}, 60000);
window.__tvDay = U.today();

/* service worker + offline-ready badge */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').then(function () {
      return navigator.serviceWorker.ready;
    }).then(function () {
      var f = $('#footStat');
      if (f && f.textContent.indexOf('offline') < 0) f.textContent += ' \u00B7 offline ready \u2713';
    }).catch(function (e) { console.warn('SW failed', e); });
  });
}
})();
