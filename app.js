import { ENTITIES } from './schema.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { LANGS, LOCALES, translateText } from './i18n.js';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
// Language: chosen in Settings (or on the sign-in page) and remembered; changing it reloads the app.
const LANG = (() => { try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; } })();
const LOC = LOCALES[LANG] || LOCALES.en;
const tr = (s) => translateText(s, LANG);
let ME = null; // the signed-in user's profile row
let SETTINGS = { company_name: 'RAYAAN Transportation & Logistics', currency: 'USD' };
let LOOK = { vehicles: [], clients: [], missions: [] }; // lookup lists used to label links

// ---------- Helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Money: USD, GBP and SLSH (Somaliland shilling). `money` shows the company currency; `moneyIn` shows a record's own currency.
const CURRENCIES = [['USD', 'US Dollar', '$'], ['GBP', 'British Pound', '£'], ['SLSH', 'Somaliland Shilling', 'SLSH']];
const makeMoney = (cur) => {
  if (cur === 'SLSH') return { format: (n) => `${n < 0 ? '-' : ''}SLSH ${Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}` };
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }); } catch { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }); }
};
let fmtMoney = makeMoney('USD');
const FMT = Object.fromEntries(CURRENCIES.map(([c]) => [c, makeMoney(c)]));
const money = (n) => fmtMoney.format(Number(n) || 0);
const moneyIn = (n, cur) => (FMT[cur] || fmtMoney).format(Number(n) || 0);
const DEFAULT_RATES = { USD: 1, GBP: 0.78, SLSH: 9000 };
const ratesNow = () => ({ ...DEFAULT_RATES, ...(SETTINGS.rates || {}) });
// Converts an amount in `cur` into the company currency (rates are units per 1 USD).
const toBase = (n, cur) => { const r = ratesNow(); return ((Number(n) || 0) / (r[cur] || 1)) * (r[SETTINGS.currency] || 1); };
const curSymbol = (cur = SETTINGS.currency) => (CURRENCIES.find((c) => c[0] === cur) || CURRENCIES[0])[2];
const num = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const iso = (d) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const fmtDate = (d) => (d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString(LOC, { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const fmtStamp = (t) => (t ? new Date(t).toLocaleString(LOC, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const ago = (t) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(t)) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return fmtDate(t);
};
const badge = (s) => (s ? `<span class="badge ${esc(s).replace(/ /g, '-')}">${esc(s)}</span>` : '');
const signed = (n) => `<span class="${n < 0 ? 'neg' : 'pos'}">${money(n)}</span>`;
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const initials = (s) => (s || '?').split(/\s+|@/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const greetName = () => ME.full_name?.trim().split(/\s+/)[0] || (ME.role === 'admin' ? 'Admin' : ME.email.split('@')[0]);
const fullName = () => ME.full_name?.trim() || (ME.role === 'admin' ? 'Administrator' : ME.email);
const avatarHtml = (cls = '') => (ME.avatar_url
  ? `<img class="avatar ${cls}" src="${esc(ME.avatar_url)}" alt="">`
  : `<div class="avatar ${cls}">${esc(initials(ME.full_name || greetName()))}</div>`);

function dbMsg(e) {
  if (e.code === '23503') return 'This record is linked to other records (missions, fuel, payments…). Remove or change those first.';
  if (e.code === '23505') return 'That already exists (for example, a duplicate plate number or client name).';
  if (e.code === '42501') return 'You do not have permission to do that.';
  if (e.code === '23514') return 'One of the values is not allowed (check dates and amounts).';
  return e.message || 'Something went wrong';
}
const ok = (res) => { if (res.error) throw new Error(dbMsg(res.error)); return res.data; };

// The API returns at most 1000 rows per request, so read in pages.
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = ok(await build().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---------- Icons ----------
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  truck: '<path d="M2 6h11v10H2zM13 9.5h4l3.5 3.5V16H13z"/><circle cx="6.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  building: '<path d="M5 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M3 21h18M9 7h2M9 11h2M9 15h2"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  fuel: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M3 21h12M14 10h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V8l-3-3M6.5 8h5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  out: '<path d="M7 17 17 7M8 7h9v9"/>',
  in: '<path d="M17 7 7 17M16 17H7V8"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13.2A8.5 8.5 0 1 1 10.8 3a6.8 6.8 0 0 0 10.2 10.2z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  alert: '<path d="M12 4 2.5 20h19zM12 10v4M12 17h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  panel: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9 4.5v15"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
};
const icon = (n) => `<svg class="i${n === 'chevR' || n === 'back' ? ' flip' : ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;

// ---------- Language ----------
function setLang(code) {
  try { localStorage.setItem('lang', code); } catch { /* storage may be blocked */ }
  location.reload();
}
const langButtons = (cls = '') => LANGS.map(([c, n]) => `<button type="button" class="${cls} ${c === LANG ? 'active' : ''}" data-lang="${c}" lang="${c}">${n}</button>`).join('');
// Everything on screen is written in English; for other languages each piece of text is swapped for its translation as it is drawn.
function initI18n() {
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  if (LANG === 'en') return;
  const skip = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE']);
  const doText = (n) => {
    const p = n.parentElement;
    const v = n.nodeValue;
    if (!p || skip.has(p.tagName) || p.closest('[data-count]') || !/[A-Za-z]/.test(v)) return;
    const out = translateText(v, LANG);
    if (out !== v) n.nodeValue = out;
  };
  const doAttrs = (el) => {
    for (const a of ['placeholder', 'title', 'aria-label', 'data-ph']) {
      const v = el.getAttribute(a);
      if (v && /[A-Za-z]/.test(v)) { const out = translateText(v, LANG); if (out !== v) el.setAttribute(a, out); }
    }
  };
  const walk = (root) => {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  };
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(walk))).observe(document.body, { childList: true, subtree: true });
  walk(document.body);
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b && b.dataset.lang !== LANG) setLang(b.dataset.lang); });

// ---------- Install as an app ----------
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; refreshInstallUI(); });
window.addEventListener('appinstalled', () => { installPrompt = null; refreshInstallUI(); toast('App installed'); });
// A card/row that lets the user install the app (or explains how on an iPhone).
function installHtml(cls) {
  if (isStandalone()) return '';
  if (installPrompt) return `<div class="${cls} install-box"><div><b>Install app</b><span>Add RAYAAN to your home screen or desktop and open it like a normal app.</span></div><button class="btn primary" data-install>Install</button></div>`;
  if (isIOS()) return `<div class="${cls} install-box"><div><b>Install app</b><span>On iPhone or iPad: tap the Share button, then “Add to Home Screen”.</span></div></div>`;
  return '';
}
function refreshInstallUI() { document.querySelectorAll('[data-install-slot]').forEach((el) => { el.innerHTML = installHtml(el.dataset.installSlot); }); }
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-install]') || !installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  refreshInstallUI();
});
window.addEventListener('offline', () => toast('You are offline. Some things will not load until you reconnect.'));
window.addEventListener('online', () => toast('Back online'));
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ }));
}

// ---------- Theme (light / dark / follow system) ----------
const themePref = () => { try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; } };
const resolveTheme = (p) => (p === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : p);
function syncThemeUI() {
  document.querySelectorAll('[data-theme-btn]').forEach((b) => { b.innerHTML = icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon'); });
  document.querySelectorAll('[data-pref]').forEach((b) => b.classList.toggle('active', b.dataset.pref === themePref()));
}
function applyTheme(pref) {
  try { localStorage.setItem('theme', pref); } catch { /* storage may be blocked */ }
  document.documentElement.dataset.theme = resolveTheme(pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolveTheme(pref) === 'dark' ? '#171a23' : '#08080b');
  syncThemeUI();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themePref() === 'system') { document.documentElement.dataset.theme = resolveTheme('system'); syncThemeUI(); }
});
// The new theme spreads out as a circle from the clicked control.
// Browsers without View Transitions (or users who prefer less motion) get a soft cross-fade instead.
function setThemeAnimated(pref, e) {
  const root = document.documentElement;
  if (resolveTheme(pref) === root.dataset.theme || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-fade');
    applyTheme(pref);
    setTimeout(() => root.classList.remove('theme-fade'), 500);
    return;
  }
  const r = e?.currentTarget?.getBoundingClientRect?.();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : innerHeight / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(() => applyTheme(pref));
  t.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
    { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
}
const toggleTheme = (e) => setThemeAnimated(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', e);

// ---------- Entities, labels, cells ----------
const ID_PREFIX = { missions: 'M-', fuel: 'F-', maintenance: 'R-', expenses: 'E-', payments: 'P-' };
const PROFILE = { vehicles: true, clients: true };
const DESC = {
  vehicles: 'Every vehicle you own or rent, with its driver and status.',
  clients: 'Organisations and customers you transport for.',
  missions: 'Transport jobs assigned to a vehicle for a client.',
  fuel: 'Fuel purchases and consumption per vehicle.',
  maintenance: 'Service and repair history per vehicle.',
  expenses: 'Money paid out: salaries, rent, permits and other costs.',
  payments: 'Money received from clients.',
};
const LABEL = {
  vehicles: (r) => `${r.name} · ${r.plate}`,
  clients: (r) => r.name,
  missions: (r) => `M-${r.id} · ${r.origin} → ${r.destination}`,
};
const refLabel = (ref, id) => { const r = LOOK[ref]?.find((x) => x.id === id); return r ? LABEL[ref](r) : ''; };

async function loadLookups() {
  const [v, c, m] = await Promise.all([
    sb.from('vehicles').select('id,name,plate').order('name'),
    sb.from('clients').select('id,name').order('name'),
    sb.from('missions').select('id,origin,destination').order('id', { ascending: false }).limit(1000),
  ]);
  LOOK = { vehicles: ok(v), clients: ok(c), missions: ok(m) };
}

const fieldOf = (table, key) => (key === 'id' ? { key: 'id', label: 'No.', type: 'id' } : ENTITIES[table].fields.find((f) => f.key === key));
const isNum = (f) => f.type === 'money' || f.type === 'number';

// HTML for one table cell; `plain` gives text for search and CSV export.
function cell(table, f, row, plain = false) {
  const v = row[f.key];
  if (f.type === 'id') return (ID_PREFIX[table] || '') + v;
  if (f.type === 'ref') {
    const label = refLabel(f.ref, v);
    if (plain || !v || !PROFILE[f.ref]) return plain ? label : esc(label);
    return `<a href="#/${f.ref}/${v}" onclick="event.stopPropagation()">${esc(label)}</a>`;
  }
  if (f.type === 'money') return plain ? (v ?? '') : moneyIn(v, row.currency);
  if (f.type === 'number') return plain ? (v ?? '') : num(v);
  if (f.type === 'date') return plain ? (v ?? '') : fmtDate(v);
  if (f.key === 'status') return plain ? (v ?? '') : badge(v);
  return plain ? (v ?? '') : esc(v);
}

function saveFile(name, type, content) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadCsv(name, header, rows) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  saveFile(`${name}-${today()}.csv`, 'text/csv', '﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n'));
}

function cleanInput(table, raw) {
  const out = {};
  for (const f of ENTITIES[table].fields) {
    let v = raw[f.key];
    if (typeof v === 'string') v = v.trim();
    if (v === '' || v === undefined) { out[f.key] = null; continue; }
    if (isNum(f) || f.type === 'ref') {
      v = Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(v)) throw new Error(`${f.label} must be a number`);
    }
    out[f.key] = v;
  }
  return out;
}

// ---------- Boot & sign-in ----------
// ---------- Sign-in verification (a code sent by email) ----------
let authNote = ''; // message to show on the sign-in page after a failed attempt
const sessionId = async () => {
  const { data: { session } } = await sb.auth.getSession();
  try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id || ''; } catch { return ''; }
};
const mailError = (e) => (/rate limit|too many|security purposes|seconds/i.test(e?.message || '')
  ? 'Too many emails were sent. Wait a few minutes and try again.'
  : 'Could not send the code. Check the email address and try again.');
const sendCode = (email) => sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

async function start(fresh = false) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; return authScreen(); }
  // A session only counts once the database has marked it verified (password, plus the emailed code when that is on).
  const gate = await sb.rpc('session_verified');
  if (gate.error || !gate.data) { await sb.auth.signOut(); return; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !data) {
    $app.innerHTML = `<div class="card wait"><h2>Account not ready</h2><p class="sub">${esc(error?.message || 'No profile found for this account.')}</p><button class="btn" id="so">Sign out</button></div>`;
    $app.querySelector('#so').onclick = signOut;
    return;
  }
  ME = data;
  ME.email = session.user.email;
  ME.last_sign_in_at = session.user.last_sign_in_at;
  if (ME.role === 'pending') return pendingScreen();
  const s = await sb.from('settings').select('*').eq('id', 1).single();
  if (s.data) SETTINGS = s.data;
  fmtMoney = makeMoney(SETTINGS.currency);
  shell();
  await route();
  if (fresh) toast(`Welcome back, ${greetName()}`);
}
async function signOut() { await sb.auth.signOut(); ME = null; start(); }
sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') start(); });

const markHtml = (cls = '') => `<div class="mark ${cls}">${esc((SETTINGS.company_name || 'R')[0].toUpperCase())}</div>`;
const brandHtml = () => {
  const [first, ...rest] = (SETTINGS.company_name || 'RAYAAN').split(' ');
  return `<div class="brand">${markHtml()}<div><b>${esc(first.toUpperCase())}</b><small>${esc(rest.join(' ') || 'Management System')}</small></div></div>`;
};

function authScreen() {
  $app.innerHTML = `
    <div class="auth"><div class="auth-frame">
      <div class="auth-form">
        <button class="icon-btn theme-float" data-theme-btn aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        ${brandHtml()}
        <h1>Welcome back</h1>
        <p class="lead">Sign in to your administrator account.</p>
        <form class="form">
          <label>Email<input name="email" type="email" required autocomplete="email" placeholder="you@company.com"></label>
          <label>Password<span class="pw"><input name="password" type="password" required autocomplete="current-password" placeholder="Your password"><button type="button" data-show>Show</button></span></label>
          <button class="btn primary" type="submit">Sign in</button>
        </form>
        <div class="error"></div>
        <p class="meta">Accounts are created by your administrator. Forgot your password? Reset it from your Supabase dashboard.</p>
        <div class="lang-row">${langButtons('lang-link')}</div>
      </div>
      <div class="auth-art">
        <span class="orb o1"></span><span class="orb o2"></span>
        <h2>Fleet operations and accounting in one place.</h2>
        <p class="lead2">Track every vehicle, mission, litre of fuel and payment, and know your profit at any moment.</p>
        <div class="feat">
          <div><span class="ic">${icon('truck')}</span><p><b>Fleet &amp; missions</b><span class="d">Vehicles, drivers and every job per client.</span></p></div>
          <div><span class="ic">${icon('wallet')}</span><p><b>Payments &amp; balances</b><span class="d">What each client has paid and still owes.</span></p></div>
          <div><span class="ic">${icon('chart')}</span><p><b>Profit per vehicle</b><span class="d">Revenue minus fuel, maintenance and expenses.</span></p></div>
        </div>
      </div>
    </div></div>`;
  $app.querySelector('[data-theme-btn]').onclick = toggleTheme;
  const pw = $app.querySelector('input[name=password]');
  $app.querySelector('[data-show]').onclick = (e) => { pw.type = pw.type === 'password' ? 'text' : 'password'; e.target.textContent = pw.type === 'password' ? 'Show' : 'Hide'; };
  const form = $app.querySelector('form');
  const err = $app.querySelector('.error');
  err.textContent = authNote;
  authNote = '';
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const btn = form.querySelector('.btn.primary');
    btn.disabled = true;
    const v = Object.fromEntries(new FormData(form));
    const email = v.email.trim();
    const { error } = await sb.auth.signInWithPassword({ email, password: v.password });
    if (error) {
      err.textContent = /Invalid login/i.test(error.message) ? 'Wrong email or password.' : error.message;
      btn.disabled = false;
      return;
    }
    // Password accepted. Ask the database whether an emailed code is also needed.
    const gate = await sb.rpc('begin_login');
    if (gate.error) { authNote = dbMsg(gate.error); await sb.auth.signOut(); return; }
    if (!gate.data.need_code) return start(true);
    const sent = await sendCode(email);
    if (sent.error) { authNote = mailError(sent.error); await sb.auth.signOut(); return; }
    codeScreen(email);
  };
}

// Second step of sign-in: enter the code that was emailed.
function codeScreen(email) {
  authScreen();
  const f = $app.querySelector('.auth-form');
  f.innerHTML = `
    <button class="icon-btn theme-float" data-theme-btn aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
    ${brandHtml()}
    <h1>Check your email</h1>
    <p class="lead"><span>We sent a verification code to</span> <b>${esc(email)}</b>. <span>Enter it to finish signing in.</span></p>
    <form class="form" id="code-form"><label>Verification code<input class="code-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••" required></label>
      <button class="btn primary" type="submit">Verify</button></form>
    <div class="error"></div>
    <div class="code-links"><button type="button" class="lang-link" id="resend" disabled>Resend code</button><button type="button" class="lang-link" id="other">Use a different account</button></div>`;
  $app.querySelector('[data-theme-btn]').onclick = toggleTheme;
  const form = f.querySelector('#code-form');
  const err = f.querySelector('.error');
  const btn = form.querySelector('.btn.primary');
  const resend = f.querySelector('#resend');
  let left = 45;
  const tick = () => {
    if (!document.body.contains(resend)) return;
    resend.disabled = left > 0;
    resend.textContent = left > 0 ? `Resend code in ${left}s` : 'Resend code';
    if (left-- > 0) setTimeout(tick, 1000);
  };
  tick();
  resend.onclick = async () => {
    err.textContent = '';
    left = 45;
    tick();
    const r = await sendCode(email);
    if (r.error) err.textContent = mailError(r.error); else toast('A new code was sent.');
  };
  f.querySelector('#other').onclick = () => signOut();
  form.code.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    const { error } = await sb.auth.verifyOtp({ email, token: form.code.value.replace(/\s/g, ''), type: 'email' });
    if (error) { err.textContent = 'That code is wrong or has expired.'; btn.disabled = false; return; }
    const done = await sb.rpc('complete_login');
    if (done.error) { authNote = done.error.message; await sb.auth.signOut(); return; }
    start(true);
  };
}

function pendingScreen() {
  $app.innerHTML = `<div class="card wait">${brandHtml()}
    <h1 style="font-size:22px;margin-top:18px">No access yet</h1>
    <p class="sub" style="font-size:14px">This account has no access to the system. Ask the administrator to enable it.</p>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:18px"><button class="btn primary" id="again">Check again</button><button class="btn" id="so">Sign out</button></div></div>`;
  $app.querySelector('.brand').style.cssText = 'justify-content:center;color:var(--ink);padding-bottom:0';
  $app.querySelector('#again').onclick = () => start();
  $app.querySelector('#so').onclick = signOut;
}

// ---------- Shell ----------
const NAV = [
  { items: [['dashboard', 'Dashboard', 'home']] },
  { id: 'ops', label: 'Operations', items: [['vehicles', 'Vehicles', 'truck'], ['clients', 'Clients', 'building'], ['missions', 'Missions', 'route']] },
  { id: 'fin', label: 'Finance', items: [['fuel', 'Fuel', 'fuel'], ['maintenance', 'Maintenance', 'wrench'], ['expenses', 'Payments made', 'out'], ['payments', 'Payments received', 'in']] },
  { id: 'rep', label: 'Reports', items: [['report/history', 'History', 'clock'], ['report/revenue', 'Revenue', 'trend'], ['report/costs', 'Costs', 'out'], ['report/profit', 'Net profit', 'chart'], ['report/receivables', 'Client balances', 'wallet']] },
  { id: 'acct', label: 'Account', items: [['profile', 'My profile', 'user'], ['settings', 'Settings', 'gear']] },
];
const TABS = [['dashboard', 'Home', 'home'], ['vehicles', 'Vehicles', 'truck'], ['missions', 'Missions', 'route'], ['clients', 'Clients', 'building']];
const NEW_ITEMS = [['missions', 'Mission', 'route'], ['fuel', 'Fuel record', 'fuel'], ['expenses', 'Expense', 'out'], ['payments', 'Payment received', 'in'], ['vehicles', 'Vehicle', 'truck'], ['clients', 'Client', 'building']];
const PAGE_TITLES = { dashboard: 'Dashboard', profile: 'My profile', settings: 'Settings', more: 'More' };

const closedGroups = () => { try { return JSON.parse(localStorage.getItem('navgroups') || '[]'); } catch { return []; } };
function navHtml() {
  const closed = closedGroups();
  let n = 0;
  const link = ([k, label, ic]) => `<a href="#/${k}" data-page="${k}" title="${esc(label)}" style="--n:${n++}">${icon(ic)}<span>${label}</span>${k === 'missions' ? '<span class="count" id="badge-missions"></span>' : ''}</a>`;
  return NAV.map((g) => (g.id
    ? `<div class="grp ${closed.includes(g.id) ? 'collapsed' : ''}" data-g="${g.id}"><button class="grp-h" data-grp="${g.id}"><span>${g.label}</span>${icon('chevron')}</button><div class="grp-b"><div>${g.items.map(link).join('')}</div></div></div>`
    : g.items.map(link).join(''))).join('');
}

const meHtml = () => `<a class="me-main" href="#/profile">${avatarHtml()}<div><b>${esc(fullName())}</b><small>${ME.role === 'admin' ? 'Administrator' : 'Staff'}</small></div></a>
  <button class="icon-btn" data-signout title="Sign out" aria-label="Sign out">${icon('logout')}</button>`;
const userMenuHtml = () => `
  <button class="user-btn" data-dd aria-label="Account menu">${avatarHtml()}</button>
  <div class="dd-menu">
    <div class="who"><b>${esc(fullName())}</b><small>${esc(ME.email)}</small></div>
    <div class="sep"></div>
    <a href="#/profile">${icon('user')} My profile</a>
    <a href="#/settings">${icon('gear')} Settings</a>
    <div class="sep"></div>
    <button data-signout>${icon('logout')} Sign out</button>
  </div>`;
function renderUserMenu() {
  const me = document.getElementById('me');
  const um = document.getElementById('usermenu');
  if (me) me.innerHTML = meHtml();
  if (um) um.innerHTML = userMenuHtml();
  document.querySelectorAll('[data-signout]').forEach((b) => (b.onclick = signOut));
}

function shell() {
  $app.innerHTML = `
    <div class="app" id="app-root">
      <aside class="side">
        ${brandHtml()}
        <nav class="nav">${navHtml()}</nav>
        <div class="me" id="me"></div>
      </aside>
      <div class="content">
        <header class="topbar">
          <button class="icon-btn d-only" id="side-toggle" aria-label="Collapse menu" title="Collapse menu">${icon('panel')}</button>
          <button class="icon-btn m-only" id="back-btn" aria-label="Back">${icon('back')}</button>
          <span class="m-brand m-only">${markHtml('sm')}<b>${esc((SETTINGS.company_name || 'RAYAAN').split(' ')[0].toUpperCase())}</b></span>
          <div class="crumb" id="crumb"></div>
          <span class="grow"></span>
          <div class="search dd d-only" id="gsearch">${icon('search')}<input id="gs-in" type="search" placeholder="Search vehicles, clients, missions…" autocomplete="off" aria-label="Search"><kbd>/</kbd><div class="dd-menu" id="gs-menu"></div></div>
          <div class="dd new-dd">
            <button class="btn primary new" data-dd aria-label="New">${icon('plus')}<span class="t">New</span>${icon('chevron')}</button>
            <div class="dd-menu">${NEW_ITEMS.map((n) => `<button data-new="${n[0]}">${icon(n[2])} ${n[1]}</button>`).join('')}</div>
          </div>
          <button class="icon-btn" data-theme-btn aria-label="Toggle dark mode">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
          <div class="dd m-only" id="usermenu"></div>
        </header>
        <main class="main" id="main"></main>
      </div>
      <nav class="tabbar">
        <a href="#/dashboard" data-page="dashboard">${icon('home')}<span>Home</span></a>
        <a href="#/vehicles" data-page="vehicles">${icon('truck')}<span>Vehicles</span></a>
        <button class="tab-fab" id="fab" aria-label="Create new">${icon('plus')}</button>
        <a href="#/missions" data-page="missions">${icon('route')}<span>Missions</span></a>
        <a href="#/more" data-page="more">${icon('grid')}<span>More</span></a>
      </nav>
    </div>`;
  $app.querySelector('.nav').onclick = (e) => {
    const g = e.target.closest('[data-grp]');
    if (!g) return;
    g.closest('.grp').classList.toggle('collapsed');
    try { localStorage.setItem('navgroups', JSON.stringify([...$app.querySelectorAll('.grp.collapsed')].map((x) => x.dataset.g))); } catch { /* ignore */ }
  };
  $app.querySelector('#fab').onclick = openNewSheet;
  // Collapse the sidebar to an icon-only strip; the choice is remembered.
  const appRoot = $app.querySelector('#app-root');
  const toggle = $app.querySelector('#side-toggle');
  const applySide = (collapsed) => {
    appRoot.classList.toggle('collapsed', collapsed);
    const label = tr(collapsed ? 'Expand menu' : 'Collapse menu');
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    try { localStorage.setItem('sidecollapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
  };
  try { if (localStorage.getItem('sidecollapsed') === '1') applySide(true); } catch { /* ignore */ }
  toggle.onclick = () => applySide(!appRoot.classList.contains('collapsed'));
  $app.querySelector('#back-btn').onclick = () => { location.hash = parentHash(); };
  $app.querySelector('[data-theme-btn]').onclick = toggleTheme;
  $app.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => openForm(b.dataset.new, null, {}, route)));
  renderUserMenu();
  initSearch();
}

// Where the phone's back button goes from the current page.
function parentHash() {
  const [page, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (page === 'settings' && id) return '#/settings';
  if ((page === 'vehicles' || page === 'clients') && id) return `#/${page}`;
  if (page === 'settings' || page === 'profile') return '#/more';
  if (page === 'report') return '#/dashboard';
  return '#/dashboard';
}

// The "+" button on the phone opens a sheet of things to create.
function openNewSheet() {
  const m = h(`<div class="overlay"><div class="modal sheet"><div class="grab"></div><h2>Create new</h2>
    <div class="set-list flat">${NEW_ITEMS.map(([k, label, ic]) => `<button data-k="${k}"><span class="act-ic">${icon(ic)}</span><div><b>${label}</b></div>${icon('chevR')}</button>`).join('')}</div></div></div>`);
  $modal.replaceChildren(m);
  m.onclick = (e) => {
    const b = e.target.closest('[data-k]');
    if (b) { $modal.replaceChildren(); openForm(b.dataset.k, null, {}, route); } else if (e.target === m) $modal.replaceChildren();
  };
}

// "More" page on the phone: everything that does not fit in the bottom bar.
function moreMenu(main) {
  const list = (items) => `<div class="card set-list">${items.map(([k, label, ic, tone]) => `<a href="#/${k}"><span class="act-ic ${tone || ''}">${icon(ic)}</span><div><b>${label}</b></div>${icon('chevR')}</a>`).join('')}</div>`;
  main.innerHTML = `
    <div class="page-head"><div><h1>More</h1></div></div>
    <a class="card set-profile lift" href="#/profile">${avatarHtml()}<div><b>${esc(fullName())}</b><span class="s">${esc(ME.email)}</span></div>${icon('chevR')}</a>
    <div class="section-label">Operations</div>${list([['vehicles', 'Vehicles', 'truck'], ['clients', 'Clients', 'building'], ['missions', 'Missions', 'route']])}
    <div class="section-label">Finance</div>${list([['fuel', 'Fuel', 'fuel', 'warn'], ['maintenance', 'Maintenance', 'wrench', 'warn'], ['expenses', 'Payments made', 'out', 'bad'], ['payments', 'Payments received', 'in', 'good']])}
    <div data-install-slot="card set-list install-card">${installHtml('card set-list install-card')}</div>
    <div class="section-label">Account</div>${list([['settings', 'Settings', 'gear']])}
    <div class="card set-list"><button class="danger-row" id="more-so">${icon('logout')} Sign out</button></div>`;
  main.querySelector('#more-so').onclick = signOut;
}

// Global search across vehicles, clients and missions.
function initSearch() {
  const input = document.getElementById('gs-in');
  const box = document.getElementById('gsearch');
  const menu = document.getElementById('gs-menu');
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.classList.remove('open'); return; }
    const hit = (x) => String(x ?? '').toLowerCase().includes(q);
    const sec = (title, list, mk) => (list.length ? `<div class="grp-t">${title}</div>${list.map(mk).join('')}` : '');
    menu.innerHTML =
      sec('Vehicles', LOOK.vehicles.filter((x) => hit(x.name) || hit(x.plate)).slice(0, 4), (x) => `<a href="#/vehicles/${x.id}">${icon('truck')}<span>${esc(LABEL.vehicles(x))}</span></a>`) +
      sec('Clients', LOOK.clients.filter((x) => hit(x.name)).slice(0, 4), (x) => `<a href="#/clients/${x.id}">${icon('building')}<span>${esc(x.name)}</span></a>`) +
      sec('Missions', LOOK.missions.filter((x) => hit(x.origin) || hit(x.destination) || hit('m-' + x.id)).slice(0, 4), (x) => `<a href="#/missions">${icon('route')}<span>${esc(LABEL.missions(x))}</span></a>`) ||
      '<div class="hint">No matches</div>';
    box.classList.add('open');
  };
  input.oninput = run;
  input.onfocus = run;
  menu.onclick = () => { input.value = ''; box.classList.remove('open'); input.blur(); };
}
document.addEventListener('keydown', (e) => {
  const input = document.getElementById('gs-in');
  if (!input) return;
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); input.focus(); }
  if (e.key === 'Escape' && document.activeElement === input) { input.value = ''; input.blur(); document.getElementById('gsearch').classList.remove('open'); }
});

// Dropdown menus (New, account): open on click, close on outside click or after choosing an item.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.dd.open').forEach((d) => { if (!d.contains(e.target)) d.classList.remove('open'); });
  const trigger = e.target.closest('[data-dd]');
  if (trigger) trigger.closest('.dd').classList.toggle('open');
  else e.target.closest('.dd-menu')?.closest('.dd').classList.remove('open');
});

const setCrumb = (parent, child) => {
  const c = document.getElementById('crumb');
  if (!c) return;
  c.classList.toggle('has-s', !!child);
  c.innerHTML = `<span class="c-p">${esc(parent)}</span>${child ? `<span class="c-s"><i> / </i>${esc(child)}</span>` : ''}`;
};
const skeleton = () => `<div class="skel t"></div><div class="skel s"></div>
  <div class="kpi-row"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>
  <div class="g3"><div class="skel span2" style="min-height:250px"></div><div class="skel" style="min-height:250px"></div></div>`;

async function updateBadges() {
  const r = await sb.from('missions').select('id', { count: 'exact', head: true }).eq('status', 'Ongoing');
  const el = document.getElementById('badge-missions');
  if (el) el.textContent = r.count || '';
}

let routeToken = 0;
async function route() {
  if (!ME || ME.role === 'pending') return;
  const token = ++routeToken;
  $modal.replaceChildren();
  const [rawPage, id] = location.hash.replace(/^#\/?/, '').split('/');
  const page = rawPage || 'dashboard';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === (page === 'report' ? `report/${id}` : page)));
  const tabPage = page === 'report' ? 'dashboard' : ['dashboard', 'vehicles', 'missions'].includes(page) && !id ? page : (page === 'vehicles' || page === 'missions') ? page : 'more';
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.page === tabPage));
  document.getElementById('app-root')?.classList.toggle('detail', page === 'profile' || page === 'settings' || page === 'report' || (!!id && (page === 'vehicles' || page === 'clients')));
  document.querySelector(`.nav a[data-page="${page}"]`)?.closest('.grp')?.classList.remove('collapsed');
  const main = document.getElementById('main');
  if (!main) return;
  setCrumb(PAGE_TITLES[page] || ENTITIES[page]?.title || '');
  main.innerHTML = '<div class="main-in rise" id="page"></div>';
  const pg = main.firstElementChild;
  pg.innerHTML = skeleton();
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    await loadLookups();
    if (token !== routeToken) return;
    updateBadges();
    if (page === 'dashboard') await dashboardPage(pg);
    else if (page === 'report') await reportPage(pg, id);
    else if (page === 'more') moreMenu(pg);
    else if (page === 'profile') myProfilePage(pg);
    else if (page === 'settings') settingsPage(pg, id);
    else if (page === 'vehicles' && id) await vehicleProfile(pg, id);
    else if (page === 'clients' && id) await clientProfile(pg, id);
    else if (ENTITIES[page]) {
      pg.innerHTML = `<div class="page-head"><div><h1>${esc(ENTITIES[page].title)}</h1><p>${esc(DESC[page] || '')}</p></div></div><div id="list"></div>`;
      await listView(pg.querySelector('#list'), page);
    } else pg.innerHTML = '<div class="empty">Page not found</div>';
  } catch (e) {
    pg.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}
window.addEventListener('hashchange', route);

// ---------- App-style rows (used on phones in place of tables) ----------
const plateOf = (id) => LOOK.vehicles.find((x) => x.id === id)?.plate || '';
const ROWS = {
  vehicles: (r) => ({ ic: 'truck', title: r.plate, sub: [r.name, r.driver_name].filter(Boolean).join(' · '), top: '', bottom: badge(r.status) }),
  clients: (r) => ({ ic: 'building', title: r.name, sub: [r.type, r.contact_person].filter(Boolean).join(' · ') || 'Client', top: '', bottom: '' }),
  missions: (r) => ({ ic: 'route', title: `${r.origin} → ${r.destination}`, sub: `${refLabel('clients', r.client_id)} · ${fmtDate(r.start_date)}`, top: moneyIn(r.amount, r.currency), bottom: badge(r.status) }),
  fuel: (r) => ({ ic: 'fuel', tone: 'warn', title: plateOf(r.vehicle_id) || 'Fuel', sub: `${fmtDate(r.date)}${r.liters ? ' · ' + num(r.liters) + ' L' : ''}`, top: moneyIn(r.cost, r.currency), bottom: '' }),
  maintenance: (r) => ({ ic: 'wrench', tone: 'warn', title: r.description, sub: [r.type, plateOf(r.vehicle_id), fmtDate(r.date)].filter(Boolean).join(' · '), top: moneyIn(r.cost, r.currency), bottom: '' }),
  expenses: (r) => ({ ic: 'out', tone: 'bad', title: r.description, sub: `${r.category} · ${fmtDate(r.date)}`, top: moneyIn(r.amount, r.currency), bottom: '' }),
  payments: (r) => ({ ic: 'in', tone: 'good', title: `From ${refLabel('clients', r.client_id)}`, sub: [fmtDate(r.date), r.method].filter(Boolean).join(' · '), top: moneyIn(r.amount, r.currency), bottom: '' }),
};
function appList(table, list, sum) {
  const rows = list.map((r) => {
    const x = ROWS[table](r);
    return `<div class="arow" data-id="${r.id}"><span class="act-ic ${x.tone || ''}">${icon(x.ic)}</span><div class="body"><b>${esc(x.title)}</b><span>${esc(x.sub)}</span></div><div class="trail">${x.top ? `<b>${x.top}</b>` : ''}${x.bottom}</div>${icon('chevR')}</div>`;
  }).join('');
  const total = sum ? `<div class="app-total"><span>Total (${list.length})</span><span>${money(list.reduce((a, r) => a + toBase(r[sum.key], r.currency), 0))}</span></div>` : '';
  return `<div class="app-list">${rows}${total}</div>`;
}

// ---------- Generic list ----------
// `fixed` filters (e.g. { vehicle_id: 3 }) are used on profile pages; those columns are hidden.
async function listView(el, table, { fixed = {}, onChange } = {}) {
  const ent = ENTITIES[table];
  const cols = ent.columns.map((k) => fieldOf(table, k)).filter((f) => !(f.key in fixed));
  const selectFilters = ent.fields.filter((f) => f.type === 'select' && !(f.key in fixed));
  const state = { search: '', from: '', to: '' };

  el.innerHTML = `
    <div class="filters">
      <input type="search" placeholder="Search ${esc(ent.title.toLowerCase())}…">
      ${ent.dateField ? '<label>From <input type="date" data-k="from" data-ph="Any date"></label><label>To <input type="date" data-k="to" data-ph="Any date"></label>' : ''}
      ${selectFilters.map((f) => `<select data-k="${f.key}"><option value="">All ${esc(f.label.toLowerCase())}</option>${f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`).join('')}
      <span class="grow"></span>
      <button class="btn" data-act="csv">${icon('download')} Export CSV</button>
      <button class="btn primary" data-act="add">${icon('plus')} Add ${esc(ent.singular)}</button>
    </div>
    <div class="table-wrap lv"></div>`;
  upgradeControls(el, true);
  const wrap = el.querySelector('.table-wrap');
  let rows = [];

  const visible = () => {
    const s = state.search.toLowerCase();
    return s ? rows.filter((r) => cols.some((f) => String(cell(table, f, r, true)).toLowerCase().includes(s))) : rows;
  };

  const draw = () => {
    const list = visible();
    if (!list.length) { wrap.innerHTML = `<div class="empty">No ${esc(ent.title.toLowerCase())} found. Click “Add ${esc(ent.singular)}” to create one.</div>`; return; }
    const sum = ent.sumField && cols.find((f) => f.key === ent.sumField);
    wrap.innerHTML = `<table>
      <thead><tr>${cols.map((f) => `<th class="${isNum(f) ? 'num' : ''}">${esc(f.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>${list.map((r) => `<tr class="click" data-id="${r.id}">${cols.map((f) => `<td data-label="${esc(f.label)}" class="${isNum(f) ? 'num' : ''}">${cell(table, f, r)}</td>`).join('')}
        <td class="actions"><button class="btn small" data-edit="${r.id}">Edit</button></td></tr>`).join('')}</tbody>
      ${sum ? `<tfoot><tr>${cols.map((f, i) => `<td class="${isNum(f) ? 'num' : ''}">${f === sum ? money(list.reduce((a, r) => a + toBase(r[f.key], r.currency), 0)) : i === 0 ? `Total (${list.length})` : ''}</td>`).join('')}<td></td></tr></tfoot>` : ''}
    </table>${appList(table, list, sum)}`;
  };

  const load = async () => {
    const build = () => {
      let q = sb.from(table).select('*');
      for (const [k, v] of Object.entries(fixed)) q = q.eq(k, Number(v));
      for (const f of selectFilters) if (state[f.key]) q = q.eq(f.key, state[f.key]);
      if (ent.dateField) {
        if (state.from) q = q.gte(ent.dateField, state.from);
        if (state.to) q = q.lte(ent.dateField, state.to);
      }
      if (ent.orderBy) { const [c, d] = ent.orderBy.split(' '); return q.order(c, { ascending: d !== 'DESC' }); }
      return q.order(ent.dateField, { ascending: false }).order('id', { ascending: false });
    };
    rows = await fetchAll(build);
    draw();
  };
  const changed = async () => { await loadLookups(); await load(); onChange?.(); };

  el.querySelector('input[type=search]').oninput = (e) => { state.search = e.target.value; draw(); };
  el.querySelectorAll('[data-k]').forEach((i) => (i.onchange = () => { state[i.dataset.k] = i.value; load().catch((e) => toast(e.message)); }));
  el.querySelector('[data-act=add]').onclick = () => openForm(table, null, fixed, changed);
  el.querySelector('[data-act=csv]').onclick = () =>
    downloadCsv(table, [...cols.map((f) => f.label), ...(ent.fields.some((f) => f.type === 'currency') ? ['Currency'] : [])],
      visible().map((r) => [...cols.map((f) => cell(table, f, r, true)), ...(ent.fields.some((f) => f.type === 'currency') ? [r.currency] : [])]));
  wrap.onclick = (e) => {
    const edit = e.target.closest('[data-edit]');
    const tr = e.target.closest('tr[data-id], .arow[data-id]');
    if (!tr) return;
    const row = rows.find((r) => String(r.id) === tr.dataset.id);
    if (!edit && PROFILE[table]) location.hash = `#/${table}/${row.id}`;
    else openForm(table, row, {}, changed);
  };
  await load();
}

// ---------- Input controls: dropdown, calendar, number fields ----------
const monthName = (i, style = 'long') => new Date(2026, i, 1).toLocaleDateString(LOC, { month: style });
const weekdayNames = () => Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 2 + i).toLocaleDateString(LOC, { weekday: LANG === 'ar' ? 'narrow' : 'short' }));
let POP = null;
function closePop(refocus) {
  if (!POP) return;
  const { el, scrim, anchor } = POP;
  POP = null;
  el.remove();
  scrim?.remove();
  anchor.classList.remove('open');
  if (refocus) anchor.focus();
}
function placePop(el, anchor) {
  const r = anchor.getBoundingClientRect();
  const w = Math.max(r.width, el.classList.contains('cal') ? 300 : 230);
  const below = innerHeight - r.bottom - 14, above = r.top - 14;
  const flip = el.offsetHeight > below && above > below;
  Object.assign(el.style, {
    width: w + 'px',
    left: Math.min(Math.max(8, r.left), innerWidth - w - 8) + 'px',
    maxHeight: Math.max(180, flip ? above : below) + 'px',
    top: flip ? 'auto' : r.bottom + 6 + 'px',
    bottom: flip ? innerHeight - r.top + 6 + 'px' : 'auto',
  });
}
// Opens a popover under the field on desktop, or a bottom sheet on a phone.
function openPop(anchor, cls, build) {
  if (POP && POP.anchor === anchor) { closePop(); return; }
  closePop();
  const phone = isPhone();
  const el = document.createElement('div');
  el.className = `ui-pop ${cls}${phone ? ' sheet' : ''}`;
  let scrim = null;
  if (phone) { scrim = document.createElement('div'); scrim.className = 'ui-scrim'; scrim.onclick = () => closePop(); document.body.append(scrim); }
  document.body.append(el);
  POP = { el, scrim, anchor };
  anchor.classList.add('open');
  build(el, phone, () => { if (!phone) placePop(el, anchor); });
  if (!phone) placePop(el, anchor);
}
document.addEventListener('mousedown', (e) => { if (POP && !POP.el.contains(e.target) && !POP.anchor.contains(e.target)) closePop(); }, true);
window.addEventListener('resize', () => { if (!isPhone()) closePop(); });
window.addEventListener('scroll', (e) => { if (POP && !isPhone() && !POP.el.contains(e.target)) closePop(); }, true);

function fieldShell(el, compact, kind) {
  const wrap = document.createElement('div');
  wrap.className = `${kind}${compact ? ' compact' : ''}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ui-field';
  if (el.id) { btn.id = el.id; el.removeAttribute('id'); }
  el.replaceWith(wrap);
  wrap.append(btn, el);
  el.classList.add('native-hidden');
  el.tabIndex = -1;
  return { wrap, btn };
}

function upgradeSelect(sel, compact) {
  if (sel.dataset.up) return;
  sel.dataset.up = '1';
  const { wrap, btn } = fieldShell(sel, compact, 'ui-select');
  const empty = [...sel.options].find((o) => o.value === '');
  const ph = sel.dataset.ph || (empty && empty.textContent.trim() !== '—' ? empty.textContent.trim() : 'Select…');
  const render = () => {
    const o = sel.selectedOptions[0];
    const has = !!o && o.value !== '';
    btn.innerHTML = `<span class="${has ? '' : 'ph'}">${esc(tr(has ? o.textContent : ph))}</span>${icon('chevron')}`;
    wrap.classList.toggle('has-val', has);
  };
  render();
  sel.addEventListener('change', render);
  btn.onclick = () => openPop(btn, 'pick', (el, phone) => {
    const opts = [...sel.options].filter((o) => !(o.value === '' && sel.required));
    const title = tr(wrap.closest('.fld')?.querySelector('.lab')?.textContent.replace('*', '').trim() || ph);
    const rows = opts.map((o) => {
      const on = o.value === sel.value && (o.value !== '' || !sel.value);
      const none = o.value === '';
      const text = none && o.textContent.trim() === '—' ? 'None' : o.textContent;
      return `<button type="button" class="opt ${on ? 'on' : ''} ${none ? 'none' : ''}" data-v="${esc(o.value)}">${esc(tr(text))}${on ? icon('check') : ''}</button>`;
    }).join('');
    const searchable = opts.length > 7;
    el.innerHTML = `${phone ? `<div class="grab"></div><div class="pop-title">${esc(title)}</div>` : ''}
      ${searchable ? `<div class="pop-search">${icon('search')}<input type="search" placeholder="Search…" autocomplete="off"></div>` : ''}
      <div class="pop-list">${rows}</div><div class="pop-empty" hidden>No matches</div>`;
    const list = el.querySelector('.pop-list');
    const buttons = () => [...list.querySelectorAll('.opt:not([hidden])')];
    const choose = (v) => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); closePop(true); };
    list.onclick = (e) => { const b = e.target.closest('.opt'); if (b) choose(b.dataset.v); };
    const search = el.querySelector('.pop-search input');
    if (search) {
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        list.querySelectorAll('.opt').forEach((b) => { b.hidden = q && !b.textContent.toLowerCase().includes(q); });
        el.querySelector('.pop-empty').hidden = buttons().length > 0;
      };
    }
    el.onkeydown = (e) => {
      const items = buttons();
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0])?.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? items[i - 1] : items[items.length - 1])?.focus(); }
      if (e.key === 'Enter' && search && document.activeElement === search && items[0]) { e.preventDefault(); choose(items[0].dataset.v); }
    };
    const on = list.querySelector('.opt.on');
    on?.scrollIntoView({ block: 'center' });
    if (!phone) (search || on || list.querySelector('.opt'))?.focus({ preventScroll: true });
  });
}

function upgradeDate(inp, compact) {
  if (inp.dataset.up) return;
  inp.dataset.up = '1';
  const { wrap, btn } = fieldShell(inp, compact, 'ui-date');
  const render = () => {
    btn.innerHTML = `<span class="${inp.value ? '' : 'ph'}">${inp.value ? esc(fmtDate(inp.value)) : esc(tr(inp.dataset.ph || 'Select date'))}</span>${icon('calendar')}`;
    wrap.classList.toggle('has-val', !!inp.value);
  };
  render();
  inp.addEventListener('change', render);
  btn.onclick = () => openPop(btn, 'cal', (el, phone, reposition) => {
    const start = inp.value ? new Date(inp.value + 'T00:00:00') : new Date();
    let y = start.getFullYear(), m = start.getMonth(), view = 'days';
    const pad = (n) => String(n).padStart(2, '0');
    const todayIso = today();
    const draw = () => {
      const top = phone ? '<div class="grab"></div>' : '';
      if (view === 'months') {
        el.innerHTML = `${top}<div class="cal-head"><button type="button" data-yr="-1" aria-label="Previous year">${icon('back')}</button><button type="button" class="cal-title" data-view="days">${y}</button><button type="button" data-yr="1" aria-label="Next year">${icon('chevR')}</button></div>
          <div class="cal-months">${Array.from({ length: 12 }, (_, i) => `<button type="button" data-m="${i}" class="${inp.value && inp.value.startsWith(`${y}-${pad(i + 1)}`) ? 'sel' : ''}">${monthName(i, 'short')}</button>`).join('')}</div>`;
      } else {
        const offset = (new Date(y, m, 1).getDay() + 6) % 7;
        const days = new Date(y, m + 1, 0).getDate();
        const cells = [...Array(offset).fill(''), ...Array.from({ length: days }, (_, i) => i + 1)];
        el.innerHTML = `${top}<div class="cal-head"><button type="button" data-nav="-1" aria-label="Previous month">${icon('back')}</button><button type="button" class="cal-title" data-view="months">${monthName(m)} ${y} ${icon('chevron')}</button><button type="button" data-nav="1" aria-label="Next month">${icon('chevR')}</button></div>
          <div class="cal-dow">${weekdayNames().map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="cal-grid">${cells.map((c) => { if (!c) return '<i></i>'; const d = `${y}-${pad(m + 1)}-${pad(c)}`; return `<button type="button" data-d="${d}" class="${d === inp.value ? 'sel' : ''} ${d === todayIso ? 'today' : ''}">${c}</button>`; }).join('')}</div>
          <div class="cal-foot"><button type="button" data-today>Today</button>${inp.required ? '' : '<button type="button" data-clear>Clear</button>'}</div>`;
      }
      reposition();
    };
    const setVal = (v) => { inp.value = v; inp.dispatchEvent(new Event('change', { bubbles: true })); closePop(true); };
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.d) return setVal(b.dataset.d);
      if ('today' in b.dataset) return setVal(todayIso);
      if ('clear' in b.dataset) return setVal('');
      if (b.dataset.nav) { m += Number(b.dataset.nav); if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } }
      if (b.dataset.yr) y += Number(b.dataset.yr);
      if (b.dataset.view) view = b.dataset.view;
      if (b.dataset.m) { m = Number(b.dataset.m); view = 'days'; }
      draw();
    };
    draw();
  });
}

function upgradeControls(root, compact = false) {
  root.querySelectorAll('select:not([data-native])').forEach((x) => upgradeSelect(x, compact));
  root.querySelectorAll('input[type=date]:not([data-native])').forEach((x) => upgradeDate(x, compact));
}

// Money and number fields: digits only, thousands separators when you leave the field.
function attachNumeric(root) {
  root.querySelectorAll('input[data-num]').forEach((inp) => {
    const fmt = () => {
      const n = Number(inp.value.replace(/,/g, ''));
      if (inp.value.trim() && Number.isFinite(n)) inp.value = n.toLocaleString('en-US', { minimumFractionDigits: Number(inp.dataset.num), maximumFractionDigits: Number(inp.dataset.max || 2) });
    };
    inp.addEventListener('input', () => {
      let v = inp.value.replace(/[^0-9.]/g, '');
      const dot = v.indexOf('.');
      if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
      inp.value = v;
    });
    inp.addEventListener('focus', () => { inp.value = inp.value.replace(/,/g, ''); inp.select(); });
    inp.addEventListener('blur', fmt);
    fmt();
  });
}

// ---------- Add / edit form ----------
const UNITS = { liters: 'L', odometer: 'km' };

function openForm(table, row, prefill = {}, onSaved) {
  const ent = ENTITIES[table];
  const val = (f) => (row ? row[f.key] : (prefill[f.key] ?? f.default ?? (f.type === 'currency' ? SETTINGS.currency : f.type === 'date' && f.required ? today() : '')));
  const curVal = row?.currency ?? prefill.currency ?? SETTINGS.currency;

  const input = (f) => {
    const v = val(f) ?? '';
    const req = f.required ? 'required' : '';
    const id = `f_${f.key}`;
    if (f.type === 'currency') {
      return `<div class="chips-in" id="${id}" role="radiogroup">${CURRENCIES.map(([c, n]) => `<button type="button" class="chip-opt ${c === v ? 'on' : ''}" data-v="${c}">${c} · ${esc(n)}</button>`).join('')}<input type="hidden" name="${f.key}" value="${esc(v)}"></div>`;
    }
    if (f.type === 'select' && f.options.length <= 4) {
      return `<div class="chips-in" id="${id}" role="radiogroup">${f.options.map((o) => `<button type="button" class="chip-opt ${o === v ? 'on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}<input type="hidden" name="${f.key}" value="${esc(v)}"></div>`;
    }
    if (f.type === 'select') return `<select id="${id}" name="${f.key}" ${req}><option value="">—</option>${f.options.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (f.type === 'ref') return `<select id="${id}" name="${f.key}" ${req}><option value="">—</option>${LOOK[f.ref].map((o) => `<option value="${o.id}" ${String(o.id) === String(v) ? 'selected' : ''}>${esc(LABEL[f.ref](o))}</option>`).join('')}</select>`;
    if (f.type === 'textarea') return `<textarea id="${id}" name="${f.key}" rows="3" placeholder="Add a note…">${esc(v)}</textarea>`;
    if (f.type === 'date') return `<input id="${id}" name="${f.key}" type="date" value="${esc(v)}" ${req} data-ph="Select date">`;
    if (f.type === 'money') return `<div class="affix"><span class="pre">${esc(curSymbol(curVal))}</span><input id="${id}" name="${f.key}" type="text" inputmode="decimal" data-num="2" value="${esc(v)}" placeholder="0.00" autocomplete="off" ${req}></div>`;
    if (f.type === 'number') return `<div class="affix"><input id="${id}" name="${f.key}" type="text" inputmode="decimal" data-num="0" value="${esc(v)}" placeholder="0" autocomplete="off" ${req}>${UNITS[f.key] ? `<span class="suf">${UNITS[f.key]}</span>` : ''}</div>`;
    const type = { tel: 'tel', email: 'email' }[f.type] || 'text';
    const ph = { tel: '+252 …', email: 'name@company.com' }[f.type] || '';
    return `<input id="${id}" name="${f.key}" type="${type}" ${f.type === 'tel' ? 'inputmode="tel"' : ''} value="${esc(v)}" placeholder="${ph}" autocomplete="off" ${req}>`;
  };

  const audit = row ? `<span>Created ${fmtStamp(row.created_at)}${row.created_by ? ' by ' + esc(row.created_by) : ''}</span>${row.updated_at ? ` · <span>Last edited ${fmtStamp(row.updated_at)} by ${esc(row.updated_by)}</span>` : ''}` : '';
  const m = h(`<div class="overlay"><div class="modal form-modal">
    <div class="m-head"><div><h2>${row ? 'Edit' : 'Add'} ${esc(ent.singular)}${row && ID_PREFIX[table] ? ' ' + ID_PREFIX[table] + row.id : ''}</h2>
      <p class="sub">${row ? 'Update the details and save.' : 'Fill in the details below. Fields marked * are required.'}</p></div>
      <button type="button" class="icon-btn" data-act="cancel" aria-label="Close">${icon('x')}</button></div>
    <div class="m-body">
      <form class="form" novalidate>
        ${ent.fields.map((f) => `<div class="fld ${f.type === 'textarea' || f.type === 'currency' ? 'full' : ''}" data-key="${f.key}"><label class="lab" for="f_${f.key}">${esc(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>${input(f)}${f.hint ? `<div class="fhint">${esc(f.hint)}</div>` : ''}<div class="ferr"></div></div>`).join('')}
      </form>
      <div class="error"></div>
      ${audit ? `<div class="meta">${audit}</div>` : ''}
    </div>
    <div class="m-foot">
      ${row && ME.role === 'admin' ? '<button class="btn danger" data-act="del" style="margin-right:auto">Delete</button>' : ''}
      <button class="btn" data-act="cancel">Cancel</button>
      <button class="btn primary" data-act="save">${row ? 'Save changes' : `Add ${esc(ent.singular)}`}</button>
    </div>
  </div></div>`);
  $modal.replaceChildren(m);
  const form = m.querySelector('form');
  const err = m.querySelector('.error');
  const close = () => { closePop(); $modal.replaceChildren(); };
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-act=cancel]').forEach((b) => (b.onclick = close));

  upgradeControls(form);
  attachNumeric(form);
  // The currency symbol sits inside the amount field, so make room for it (SLSH is wider than $).
  const fitPrefix = () => form.querySelectorAll('.affix').forEach((a) => { const pre = a.querySelector('.pre'); if (pre) a.querySelector('input').style.paddingInlineStart = pre.offsetWidth + 24 + 'px'; });
  fitPrefix();
  form.querySelectorAll('textarea').forEach((t) => {
    const grow = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; };
    t.addEventListener('input', grow);
    grow();
  });
  form.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-opt');
    if (!chip) return;
    const box = chip.closest('.chips-in');
    const hidden = box.querySelector('input');
    const f = ent.fields.find((x) => x.key === hidden.name);
    const wasOn = chip.classList.contains('on');
    box.querySelectorAll('.chip-opt').forEach((c) => c.classList.remove('on'));
    if (wasOn && !f.required) hidden.value = ''; else { chip.classList.add('on'); hidden.value = chip.dataset.v; }
    chip.closest('.fld').classList.remove('invalid');
    if (hidden.name === 'currency') { const pre = form.querySelector('.affix .pre'); if (pre) { pre.textContent = curSymbol(hidden.value); fitPrefix(); } }
  });
  const clearInvalid = (e) => e.target.closest?.('.fld')?.classList.remove('invalid');
  form.addEventListener('input', clearInvalid);
  form.addEventListener('change', clearInvalid);
  if (!isPhone()) form.querySelector('input:not([type=hidden]):not(.native-hidden), .ui-field')?.focus();

  // Checks required fields and shows the message under each one.
  const validate = () => {
    const data = new FormData(form);
    let first = null;
    const flag = (key, msg) => {
      const fld = form.querySelector(`.fld[data-key="${key}"]`);
      fld.classList.toggle('invalid', !!msg);
      fld.querySelector('.ferr').textContent = msg;
      if (msg && !first) first = fld;
    };
    for (const f of ent.fields) flag(f.key, f.required && !String(data.get(f.key) ?? '').trim() ? 'This field is required' : '');
    const [a, b] = [data.get('start_date'), data.get('end_date')];
    if (a && b && b < a) flag('end_date', 'End date can’t be before the start date');
    if (first) {
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (!isPhone()) first.querySelector('input:not([type=hidden]):not(.native-hidden), .ui-field, textarea')?.focus({ preventScroll: true });
    }
    return !first;
  };

  const saveBtn = m.querySelector('[data-act=save]');
  const save = async () => {
    err.textContent = '';
    if (!validate()) return;
    saveBtn.disabled = true;
    try {
      const body = cleanInput(table, Object.fromEntries(new FormData(form)));
      ok(row ? await sb.from(table).update(body).eq('id', row.id) : await sb.from(table).insert(body));
      close();
      toast(`${ent.singular} saved`);
      await onSaved?.();
    } catch (e) { err.textContent = e.message; saveBtn.disabled = false; }
  };
  saveBtn.onclick = save;
  form.onsubmit = (e) => { e.preventDefault(); save(); };
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.closest('.pop-search')) { e.preventDefault(); save(); } });
  const del = m.querySelector('[data-act=del]');
  if (del) del.onclick = async () => {
    if (!confirm(tr('Delete this record? This cannot be undone.'))) return;
    try {
      const gone = ok(await sb.from(table).delete().eq('id', row.id).select('id'));
      if (!gone.length) throw new Error('You do not have permission to delete this.');
      close();
      toast('Deleted');
      if (PROFILE[table] && location.hash.startsWith(`#/${table}/`)) location.hash = `#/${table}`;
      else await onSaved?.();
    } catch (e) { err.textContent = e.message; }
  };
}

// ---------- Period picker ----------
const PERIODS = [['month', 'This month'], ['last', 'Last month'], ['year', 'This year'], ['all', 'All time'], ['custom', 'Custom']];
function rangeFor(kind) {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  if (kind === 'month') return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (kind === 'last') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (kind === 'year') return [`${y}-01-01`, `${y}-12-31`];
  return ['', ''];
}
function prevRange(from, to) {
  const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00');
  const days = Math.round((t - f) / 864e5) + 1;
  const pt = new Date(f); pt.setDate(pt.getDate() - 1);
  const pf = new Date(pt); pf.setDate(pf.getDate() - days + 1);
  return [iso(pf), iso(pt)];
}
function periodPicker(initial, onChange) {
  const el = h(`<div class="period">
    <div class="seg">${PERIODS.map(([v, l]) => `<button data-v="${v}" class="${v === initial ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="filters" data-custom style="display:none;margin:10px 0 0"><input type="date"><span class="sub">to</span><input type="date"></div>
  </div>`);
  const custom = el.querySelector('[data-custom]');
  const [from, to] = custom.querySelectorAll('input');
  el.querySelector('.seg').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    el.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('active', x === b));
    custom.style.display = b.dataset.v === 'custom' ? 'flex' : 'none';
    if (b.dataset.v !== 'custom') onChange(...rangeFor(b.dataset.v));
  };
  from.onchange = to.onchange = () => { if (from.value && to.value) onChange(from.value, to.value); };
  from.dataset.ph = to.dataset.ph = 'Pick date';
  upgradeControls(el, true);
  return el;
}

// ---------- Dashboard ----------
const abbr = (n) => { const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k' : Math.round(a)); };
const niceStep = (x) => { const mag = 10 ** Math.floor(Math.log10(x)); const r = x / mag; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag; };

// Figures count up from zero (skipped when the user prefers reduced motion).
function countUps(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const end = Number(el.dataset.count);
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      el.textContent = money(end * (1 - (1 - p) ** 3));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function deltaPill(cur, prev, inverse = false) {
  if (prev == null) return '';
  if (prev === 0) return cur === 0 ? '<span class="delta flat">0%</span>' : '<span class="delta flat">New</span>';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.05) return '<span class="delta flat">0%</span>';
  const up = pct > 0;
  return `<span class="delta ${up !== inverse ? 'up' : 'down'}">${icon(up ? 'up' : 'down')} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function sparkline(monthly) {
  const vals = monthly.map((m) => m.revenue - m.costs);
  if (vals.length < 2) return '';
  const W = 300, H = 78, min = Math.min(...vals), span = (Math.max(...vals) - min) || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 8 - ((v - min) / span) * (H - 30)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="spg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8f5c" stop-opacity=".42"/><stop offset="1" stop-color="#ff8f5c" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${W},${H} L0,${H} Z" fill="url(#spg)"/><path class="pline" pathLength="1" d="${line}" fill="none" stroke="#ffa57c" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function trendChart(monthly) {
  const W = 720, H = 280, L = 54, R = 12, T = 14, B = 30;
  const data = monthly.map((m) => ({ ...m, profit: m.revenue - m.costs, label: new Date(m.month + '-01T00:00:00').toLocaleDateString(LOC, { month: 'short' }) }));
  const maxV = Math.max(1, ...data.flatMap((d) => [d.revenue, d.costs, d.profit]));
  const minV = Math.min(0, ...data.map((d) => d.profit));
  const step = niceStep((maxV - minV) / 4);
  const top = Math.ceil(maxV / step) * step, bot = Math.floor(minV / step) * step;
  const y = (v) => T + (H - T - B) * (1 - (v - bot) / (top - bot));
  const slot = (W - L - R) / data.length;
  const bw = Math.min(24, slot * 0.28);
  const cx = (i) => L + slot * i + slot / 2;
  let grid = '';
  for (let v = bot; v <= top + 1e-9; v += step) grid += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${abbr(v)}</text>`;
  const bars = data.map((d, i) => `
    <rect class="bar" style="--d:${i};fill:var(--c1)" x="${cx(i) - bw - 2}" y="${y(Math.max(d.revenue, 0))}" width="${bw}" height="${Math.max(2, y(0) - y(Math.max(d.revenue, 0)))}" rx="4"><title>${d.label} revenue ${money(d.revenue)}</title></rect>
    <rect class="bar" style="--d:${i};fill:var(--c2)" x="${cx(i) + 2}" y="${y(Math.max(d.costs, 0))}" width="${bw}" height="${Math.max(2, y(0) - y(Math.max(d.costs, 0)))}" rx="4"><title>${d.label} costs ${money(d.costs)}</title></rect>
    <text x="${cx(i)}" y="${H - 9}" text-anchor="middle">${d.label}</text>`).join('');
  const line = data.map((d, i) => `${cx(i)},${y(d.profit)}`).join(' ');
  const dots = data.map((d, i) => `<circle class="dot" style="--d:${i};fill:var(--surface);stroke:var(--good);stroke-width:2" cx="${cx(i)}" cy="${y(d.profit)}" r="3.5"><title>${d.label} profit ${money(d.profit)}</title></circle>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue, costs and profit for the last six months">${grid}${bars}<polyline class="pline" pathLength="1" points="${line}" fill="none" style="stroke:var(--good);stroke-width:2.4" stroke-linejoin="round" stroke-linecap="round"/>${dots}</svg>`;
}

function donut(items, midValue, midLabel) {
  const total = items.reduce((a, i) => a + i.value, 0);
  let off = 0;
  const segs = total ? items.filter((i) => i.value > 0).map((i) => {
    const p = (i.value / total) * 100;
    const s = `<circle class="seg" cx="18" cy="18" r="15.9155" fill="none" stroke-width="4.2" style="stroke:${i.color}" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${-off}"><title>${esc(i.label)} ${money(i.value)}</title></circle>`;
    off += p;
    return s;
  }).join('') : '';
  return `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9155" fill="none" stroke-width="4.2" style="stroke:var(--surface-2)"/>${segs}</svg>
    <div class="mid"><b>${midValue}</b><span>${midLabel}</span></div></div>
    <div class="dlist">${items.map((i) => `<div><i style="background:${i.color}"></i>${esc(i.label)}<b>${total ? Math.round((i.value / total) * 100) : 0}%</b></div>`).join('')}</div></div>`;
}

async function activityFeed(per = 6, take = 7) {
  const get = (t) => sb.from(t).select('*').order('created_at', { ascending: false }).limit(per);
  const [ms, ps, es, fs, rs] = (await Promise.all(['missions', 'payments', 'expenses', 'fuel', 'maintenance'].map(get))).map(ok);
  const items = [
    ...ms.map((r) => ({ type: 'missions', at: r.created_at, ic: 'route', tone: '', title: `${r.origin} → ${r.destination}`, sub: `Mission · ${refLabel('clients', r.client_id)}`, amt: r.amount, cur: r.currency, href: '#/missions' })),
    ...ps.map((r) => ({ type: 'payments', at: r.created_at, ic: 'in', tone: 'good', title: `Payment from ${refLabel('clients', r.client_id)}`, sub: r.method || 'Payment received', amt: r.amount, cur: r.currency, href: '#/payments' })),
    ...es.map((r) => ({ type: 'expenses', at: r.created_at, ic: 'out', tone: 'bad', title: r.description, sub: `Expense · ${r.category}`, amt: -r.amount, cur: r.currency, href: '#/expenses' })),
    ...fs.map((r) => ({ type: 'fuel', at: r.created_at, ic: 'fuel', tone: 'warn', title: `Fuel · ${refLabel('vehicles', r.vehicle_id)}`, sub: r.liters ? `${num(r.liters)} L` : 'Fuel purchase', amt: -r.cost, cur: r.currency, href: '#/fuel' })),
    ...rs.map((r) => ({ type: 'maintenance', at: r.created_at, ic: 'wrench', tone: 'warn', title: r.description, sub: `${r.type} · ${refLabel('vehicles', r.vehicle_id)}`, amt: -r.cost, cur: r.currency, href: '#/maintenance' })),
  ];
  return items.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, take);
}

// ---------- Reports: each one is its own page, opened from a button ----------
const REPORTS = {
  history: { title: 'History', ic: 'clock', tone: '', desc: 'Everything that happened, newest first' },
  revenue: { title: 'Revenue', ic: 'trend', tone: '', desc: 'Money earned from completed missions' },
  costs: { title: 'Costs', ic: 'out', tone: 'warn', desc: 'Fuel, maintenance and expenses' },
  profit: { title: 'Net profit', ic: 'chart', tone: 'good', desc: 'Revenue minus costs' },
  received: { title: 'Payments received', ic: 'wallet', tone: 'good', desc: 'Cash in from clients' },
  receivables: { title: 'Client balances', ic: 'building', tone: 'bad', desc: 'Who still owes you money' },
  vehicles: { title: 'Vehicle performance', ic: 'truck', tone: '', desc: 'Profit for each vehicle' },
  fleet: { title: 'Fleet status', ic: 'route', tone: '', desc: 'Working, available and in repair' },
  attention: { title: 'Needs attention', ic: 'alert', tone: 'warn', desc: 'Things to follow up' },
};
const PERIOD_REPORTS = ['revenue', 'costs', 'profit', 'received', 'vehicles'];
const rpcOk = (name, args) => sb.rpc(name, args).then(ok);
const sumKey = (list, k) => list.reduce((a, v) => a + Number(v[k]), 0);
const vCosts = (v) => Number(v.fuel) + Number(v.maintenance) + Number(v.expenses);
const prevArgs = (prev) => (prev ? { p_from: prev[0], p_to: prev[1] } : null);
const vsPrevTxt = '<span>vs previous period</span>';

const barRows = (items) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return items.length
    ? `<div class="bars">${items.map((i) => `<div class="bar-row"><span class="bl">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.value / max) * 100}%"></div></div><b>${money(i.value)}</b></div>`).join('')}</div>`
    : '<div class="sub">Nothing to show for this period.</div>';
};
const statCard = (label, ic, tone, value, foot = '') => `<div class="card kpi lift"><div class="kpi-top"><span class="k">${label}</span><span class="ico ${tone}">${icon(ic)}</span></div><div class="v" data-count="${value}">${money(value)}</div><div class="foot">${foot}</div></div>`;
const plainCard = (label, value, foot = '') => `<div class="card kpi"><div class="k">${label}</div><div class="v">${value}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
const goBtn = (href, label, ic) => `<a class="btn" href="${href}">${icon(ic)} ${label} ${icon('chevR')}</a>`;
const cardOf = (title, body, sub = '') => `<div class="card"><div class="card-head"><h2>${title}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="card-body">${body}</div></div>`;
const legend3 = '<div class="legend" style="margin-bottom:12px"><span><i style="background:var(--c1)"></i>Revenue</span><span><i style="background:var(--c2)"></i>Costs</span><span><i style="background:var(--good)"></i>Net profit</span></div>';
const vehicleRow = (v, top, bottom) => `<a class="arow" href="#/vehicles/${v.id}"><span class="act-ic">${icon('truck')}</span><div class="body"><b>${esc(v.plate)}</b><span>${esc(v.name)}</span></div><div class="trail">${top ? `<b>${top}</b>` : ''}${bottom || ''}</div>${icon('chevR')}</a>`;
const clientRow = (c) => `<a class="arow" href="#/clients/${c.id}"><span class="act-ic">${icon('building')}</span><div class="body"><b>${esc(c.name)}</b><span>${c.missions} mission${c.missions === 1 ? '' : 's'} · ${money(c.billed)} billed · ${money(c.received)} paid</span></div><div class="trail"><b class="${c.balance > 0 ? 'neg' : ''}">${money(c.balance)}</b><span class="sub">owed</span></div>${icon('chevR')}</a>`;
const empty = (t) => `<div class="empty">${t}</div>`;

function costParts(d, exp) {
  const byCat = {};
  exp.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
  const parts = [{ label: 'Fuel', value: d.fuel }, { label: 'Maintenance', value: d.maintenance }, ...cats.slice(0, 2).map(([label, value]) => ({ label, value }))];
  const rest = cats.slice(2).reduce((a, [, v]) => a + v, 0);
  if (rest > 0) parts.push({ label: 'Other expenses', value: rest });
  parts.forEach((x, i) => { x.color = colors[i % colors.length]; });
  return parts;
}
const dayLabel = (t) => {
  const d = new Date(t), now = new Date(), y = new Date();
  y.setDate(now.getDate() - 1);
  return d.toDateString() === now.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : fmtDate(String(t).slice(0, 10));
};
const feedRow = (f) => `<a class="arow" href="${f.href}" data-type="${f.type}"><span class="act-ic ${f.tone}">${icon(f.ic)}</span><div class="body"><b>${esc(f.title)}</b><span>${esc(f.sub)} · ${new Date(f.at).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}</span></div><div class="trail"><b class="${f.amt < 0 ? '' : 'pos'}">${moneyIn(f.amt, f.cur)}</b></div>${icon('chevR')}</a>`;

const BUILD = {
  history: async () => {
    const feed = await activityFeed(30, 60);
    if (!feed.length) return empty('Nothing has happened yet. Add a mission, fuel record or payment to see it here.');
    const groups = [];
    feed.forEach((f) => { const l = dayLabel(f.at); const g = groups.find((x) => x.l === l) || groups[groups.push({ l, items: [] }) - 1]; g.items.push(f); });
    const types = [['all', 'All'], ['missions', 'Missions'], ['payments', 'Payments'], ['expenses', 'Expenses'], ['fuel', 'Fuel'], ['maintenance', 'Repairs']];
    return `<div class="seg" id="hf">${types.map(([k, l], i) => `<button data-t="${k}" class="${i ? '' : 'active'}">${l}</button>`).join('')}</div>
      ${groups.map((g) => `<div class="dgroup"><div class="day-label">${g.l}</div><div class="rlist">${g.items.map(feedRow).join('')}</div></div>`).join('')}`;
  },

  revenue: async ({ p, prev }) => {
    const [d, vr, cr, pd] = await Promise.all([rpcOk('dashboard', p), rpcOk('vehicle_report', p), rpcOk('client_report', p), prev ? rpcOk('dashboard', prevArgs(prev)) : null]);
    const n = sumKey(vr, 'missions');
    return `<div class="stats">${statCard('Revenue', 'trend', '', d.revenue, pd ? deltaPill(d.revenue, pd.revenue) + vsPrevTxt : `${n} completed mission${n === 1 ? '' : 's'}`)}${plainCard('Completed missions', n)}${plainCard('Average per mission', money(n ? d.revenue / n : 0))}</div>
      ${cardOf('Revenue, costs and profit', legend3 + trendChart(d.monthly || []), 'Last 6 months')}
      <div class="g3" style="margin-top:16px">
        <div class="card span2"><div class="card-head"><h2>By vehicle</h2></div><div class="card-body">${barRows(vr.filter((v) => v.revenue > 0).sort((a, b) => b.revenue - a.revenue).map((v) => ({ label: v.plate, value: Number(v.revenue) })))}</div></div>
        <div class="card"><div class="card-head"><h2>By client</h2></div><div class="card-body">${barRows(cr.filter((c) => c.billed > 0).sort((a, b) => b.billed - a.billed).map((c) => ({ label: c.name, value: Number(c.billed) })))}</div></div>
      </div><div class="btn-row">${goBtn('#/missions', 'Open missions', 'route')}</div>`;
  },

  costs: async ({ p, prev, from, to }) => {
    const [d, vr, exp, pd] = await Promise.all([
      rpcOk('dashboard', p), rpcOk('vehicle_report', p),
      fetchAll(() => { let q = sb.from('expenses').select('category,amount').order('id'); if (from) q = q.gte('date', from); if (to) q = q.lte('date', to); return q; }),
      prev ? rpcOk('dashboard', prevArgs(prev)) : null,
    ]);
    const total = d.fuel + d.maintenance + d.expenses;
    const parts = costParts(d, exp);
    return `<div class="stats">${statCard('Total costs', 'out', 'warn', total, pd ? deltaPill(total, pd.fuel + pd.maintenance + pd.expenses, true) + vsPrevTxt : '')}${plainCard('Fuel', money(d.fuel))}${plainCard('Maintenance', money(d.maintenance))}${plainCard('Other expenses', money(d.expenses))}</div>
      <div class="g3"><div class="card">${`<div class="card-head"><h2>Where the money goes</h2></div><div class="card-body">${donut(parts, money(total), 'total costs')}</div>`}</div>
        <div class="card span2"><div class="card-head"><h2>Costs by vehicle</h2></div><div class="card-body">${barRows(vr.filter((v) => vCosts(v) > 0).sort((a, b) => vCosts(b) - vCosts(a)).map((v) => ({ label: v.plate, value: vCosts(v) })))}</div></div></div>
      <div class="btn-row">${goBtn('#/fuel', 'Fuel', 'fuel')}${goBtn('#/maintenance', 'Maintenance', 'wrench')}${goBtn('#/expenses', 'Payments made', 'out')}</div>`;
  },

  profit: async ({ p, prev }) => {
    const [d, vr, pd] = await Promise.all([rpcOk('dashboard', p), rpcOk('vehicle_report', p), prev ? rpcOk('dashboard', prevArgs(prev)) : null]);
    const cost = (x) => x.fuel + x.maintenance + x.expenses;
    const profit = d.revenue - cost(d);
    const margin = d.revenue ? (profit / d.revenue) * 100 : 0;
    return `<div class="stats"><div class="card kpi hero-card ${profit < 0 ? 'neg' : ''}"><div class="kpi-top"><span class="k">Net profit</span><span class="ico">${icon('chart')}</span></div><div class="v" data-count="${profit}">${money(profit)}</div>
        <div class="foot">${pd ? deltaPill(profit, pd.revenue - cost(pd)) + vsPrevTxt : ''}<span>${margin.toFixed(1)}% margin</span></div>${sparkline(d.monthly || [])}</div>
        ${plainCard('Revenue', money(d.revenue))}${plainCard('Costs', money(cost(d)))}</div>
      ${cardOf('Revenue, costs and profit', legend3 + trendChart(d.monthly || []), 'Last 6 months')}
      <div class="section-label">Profit by vehicle</div>
      ${vr.length ? `<div class="rlist">${vr.slice().sort((a, b) => b.profit - a.profit).map((v) => vehicleRow(v, signed(v.profit), `<span class="sub">${money(v.revenue)} revenue</span>`)).join('')}</div>` : empty('No vehicles yet.')}`;
  },

  received: async ({ p, prev, from, to }) => {
    const [d, cr, pd, pays] = await Promise.all([
      rpcOk('dashboard', p), rpcOk('client_report', p), prev ? rpcOk('dashboard', prevArgs(prev)) : null,
      (async () => { let q = sb.from('payments').select('*').order('date', { ascending: false }).limit(10); if (from) q = q.gte('date', from); if (to) q = q.lte('date', to); return ok(await q); })(),
    ]);
    return `<div class="stats">${statCard('Payments received', 'wallet', 'good', d.received, pd ? deltaPill(d.received, pd.received) + vsPrevTxt : '')}${plainCard('Still owed by clients', money(d.outstanding), 'All time')}</div>
      <div class="g3"><div class="card">${`<div class="card-head"><h2>By client</h2></div><div class="card-body">${barRows(cr.filter((c) => c.received > 0).sort((a, b) => b.received - a.received).map((c) => ({ label: c.name, value: Number(c.received) })))}</div>`}</div>
        <div class="card span2"><div class="card-head"><h2>Latest payments</h2><a href="#/payments">View all</a></div><div class="card-body">${pays.length ? `<div class="rlist">${pays.map((r) => `<a class="arow" href="#/payments"><span class="act-ic good">${icon('in')}</span><div class="body"><b>${esc(refLabel('clients', r.client_id))}</b><span>${fmtDate(r.date)}${r.method ? ' · ' + esc(r.method) : ''}</span></div><div class="trail"><b class="pos">${moneyIn(r.amount, r.currency)}</b></div>${icon('chevR')}</a>`).join('')}</div>` : '<div class="sub">No payments in this period.</div>'}</div></div></div>`;
  },

  receivables: async () => {
    const [d, cr] = await Promise.all([rpcOk('dashboard', {}), rpcOk('client_report', {})]);
    const owing = cr.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
    const settled = cr.filter((c) => c.balance <= 0);
    return `<div class="stats">${statCard('Total owed to you', 'wallet', 'bad', d.outstanding, 'All time')}${plainCard('Clients owing', owing.length)}${plainCard('Clients fully paid', settled.length)}</div>
      <div class="section-label">Owing</div>${owing.length ? `<div class="rlist">${owing.map(clientRow).join('')}</div>` : empty('Nobody owes you anything.')}
      ${settled.length ? `<div class="section-label">Fully paid</div><div class="rlist">${settled.map(clientRow).join('')}</div>` : ''}`;
  },

  vehicles: async ({ p }) => {
    const vr = await rpcOk('vehicle_report', p);
    const rev = sumKey(vr, 'revenue'), cost = vr.reduce((a, v) => a + vCosts(v), 0);
    return `<div class="stats">${plainCard('Revenue', money(rev))}${plainCard('Costs', money(cost))}${plainCard('Profit', signed(rev - cost))}</div>
      ${vr.length ? `<div class="rlist">${vr.slice().sort((a, b) => b.profit - a.profit).map((v) => vehicleRow(v, signed(v.profit), `<span class="sub">${v.missions} mission${v.missions === 1 ? '' : 's'} · ${money(v.revenue)}</span>`)).join('')}</div>` : empty('No vehicles registered yet.')}`;
  },

  fleet: async () => {
    const veh = await fetchAll(() => sb.from('vehicles').select('*').order('name'));
    const groups = [['Working', 'var(--c1)'], ['Available', 'var(--c4)'], ['Under Maintenance', 'var(--c3)']];
    const by = (st) => veh.filter((v) => v.status === st);
    if (!veh.length) return empty('No vehicles registered yet.');
    return `${cardOf('Fleet', `<div class="stackbar">${groups.map(([st, c]) => `<span style="width:${(by(st).length / veh.length) * 100}%;background:${c}"></span>`).join('')}</div>
        <div class="dlist">${groups.map(([st, c]) => `<div><i style="background:${c}"></i>${st}<b>${by(st).length}</b></div>`).join('')}</div>
        <div class="sub" style="margin-top:12px">Utilisation ${Math.round((by('Working').length / veh.length) * 100)}% of ${veh.length} vehicle${veh.length === 1 ? '' : 's'}</div>`)}
      ${groups.map(([st]) => by(st).length ? `<div class="section-label">${st} (${by(st).length})</div><div class="rlist">${by(st).map((v) => vehicleRow(v, '', badge(v.status))).join('')}</div>` : '').join('')}`;
  },

  attention: async () => {
    const [d, cr, veh, ms] = await Promise.all([
      rpcOk('dashboard', {}), rpcOk('client_report', {}),
      fetchAll(() => sb.from('vehicles').select('*').eq('status', 'Under Maintenance').order('name')),
      fetchAll(() => sb.from('missions').select('*').in('status', ['Ongoing', 'Planned']).order('start_date')),
    ]);
    const owing = cr.filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance);
    const missionRow = (r) => `<a class="arow" href="#/missions"><span class="act-ic">${icon('route')}</span><div class="body"><b>${esc(r.origin)} → ${esc(r.destination)}</b><span>${esc(refLabel('clients', r.client_id))} · ${fmtDate(r.start_date)}</span></div><div class="trail"><b>${moneyIn(r.amount, r.currency)}</b>${badge(r.status)}</div>${icon('chevR')}</a>`;
    const sections = [
      veh.length && `<div class="section-label">Vehicles under maintenance (${veh.length})</div><div class="rlist">${veh.map((v) => vehicleRow(v, '', badge(v.status))).join('')}</div>`,
      owing.length && `<div class="section-label">Clients who owe you (${owing.length})</div><div class="rlist">${owing.map(clientRow).join('')}</div>`,
      ms.filter((m) => m.status === 'Ongoing').length && `<div class="section-label">Missions in progress</div><div class="rlist">${ms.filter((m) => m.status === 'Ongoing').map(missionRow).join('')}</div>`,
      ms.filter((m) => m.status === 'Planned').length && `<div class="section-label">Planned missions not started</div><div class="rlist">${ms.filter((m) => m.status === 'Planned').map(missionRow).join('')}</div>`,
    ].filter(Boolean);
    return sections.length ? sections.join('') : empty('Nothing needs attention right now.');
  },
};

async function reportPage(main, key) {
  const meta = REPORTS[key];
  if (!meta) { main.innerHTML = '<div class="empty">Report not found</div>'; return; }
  setCrumb('Reports', meta.title);
  main.innerHTML = `<div class="page-head"><div><h1>${meta.title}</h1><p>${meta.desc}</p></div><span class="grow"></span><div id="period"></div></div><div id="rep" class="rise"><div class="stats"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></div>`;
  const box = main.querySelector('#rep');
  const load = async (from, to) => {
    const html = await BUILD[key]({ p: { p_from: from || null, p_to: to || null }, prev: from && to ? prevRange(from, to) : null, from, to });
    box.innerHTML = html;
    countUps(box);
  };
  box.onclick = (e) => {
    const b = e.target.closest('#hf [data-t]');
    if (!b) return;
    box.querySelectorAll('#hf button').forEach((x) => x.classList.toggle('active', x === b));
    box.querySelectorAll('.arow[data-type]').forEach((a) => { a.hidden = b.dataset.t !== 'all' && a.dataset.type !== b.dataset.t; });
    box.querySelectorAll('.dgroup').forEach((g) => { g.hidden = ![...g.querySelectorAll('.arow')].some((a) => !a.hidden); });
  };
  if (PERIOD_REPORTS.includes(key)) {
    const stored = (() => { try { return localStorage.getItem('period'); } catch { return null; } })();
    const initial = PERIODS.some(([v]) => v === stored) && stored !== 'custom' ? stored : 'year';
    main.querySelector('#period').append(periodPicker(initial, (f, t) => load(f, t).catch((e) => toast(e.message))));
    await load(...rangeFor(initial));
  } else {
    await load('', '');
  }
}

// ---------- Home on a phone: figures and buttons, each opening its own page ----------
async function homeHub(main) {
  const hour = new Date().getHours();
  main.innerHTML = `
    <div class="page-head"><div><h1>Welcome back, ${esc(greetName())}</h1>
      <p><span>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</span>. <span>Tap anything to open it.</span></p></div><span class="grow"></span><div id="period"></div></div>
    <div id="hub" class="rise"><div class="kpi-row"><div class="skel"></div><div class="skel"></div></div></div>`;
  const box = main.querySelector('#hub');
  const load = async (from, to) => {
    const p = { p_from: from || null, p_to: to || null };
    const prev = from && to ? prevRange(from, to) : null;
    const [d, pd, all, cr, feed] = await Promise.all([rpcOk('dashboard', p), prev ? rpcOk('dashboard', prevArgs(prev)) : null, rpcOk('dashboard', {}), rpcOk('client_report', {}), activityFeed(3, 3)]);
    const cost = (x) => x.fuel + x.maintenance + x.expenses;
    const profit = d.revenue - cost(d);
    const margin = d.revenue ? (profit / d.revenue) * 100 : 0;
    const vs = d.vehicle_status, ms = d.mission_status;
    const fleet = (vs.Available || 0) + (vs.Working || 0) + (vs['Under Maintenance'] || 0);
    const owing = cr.filter((c) => c.balance > 0).length;
    const alerts = (vs['Under Maintenance'] ? 1 : 0) + (owing ? 1 : 0) + (all.mission_status.Ongoing ? 1 : 0) + (all.mission_status.Planned ? 1 : 0);
    const tile = (href, ic, tone, title, sub, badgeN) => `<a class="tile" href="${href}"><span class="act-ic ${tone}">${icon(ic)}</span><b>${title}</b><span class="s">${sub}</span>${badgeN ? `<span class="tbadge">${badgeN}</span>` : ''}</a>`;
    const fig = (href, label, ic, tone, value, cur, prv, inv) => `<a class="card kpi lift" href="${href}"><div class="kpi-top"><span class="k">${label}</span><span class="ico ${tone}">${icon(ic)}</span></div><div class="v" data-count="${value}">${money(value)}</div><div class="foot">${prev ? deltaPill(cur, prv, inv) : ''}</div></a>`;
    box.innerHTML = `
      <a class="card kpi hero-card lift ${profit < 0 ? 'neg' : ''}" href="#/report/profit" style="margin-bottom:12px"><div class="kpi-top"><span class="k">Net profit</span><span class="ico">${icon('chart')}</span></div>
        <div class="v" data-count="${profit}">${money(profit)}</div>
        <div class="foot">${prev ? deltaPill(profit, pd && pd.revenue - cost(pd)) : ''}<span>${margin.toFixed(1)}% margin</span></div>${sparkline(d.monthly || [])}</a>
      <div class="kpi-row hub-figs">
        ${fig('#/report/revenue', 'Revenue', 'trend', '', d.revenue, d.revenue, pd?.revenue, false)}
        ${fig('#/report/costs', 'Costs', 'out', 'warn', cost(d), cost(d), pd && cost(pd), true)}
        ${fig('#/report/received', 'Received', 'wallet', 'good', d.received, d.received, pd?.received, false)}
        ${fig('#/report/receivables', 'Owed to you', 'building', 'bad', all.outstanding, 0, null, false)}
      </div>
      <div class="section-label">Reports</div>
      <div class="tiles">
        ${tile('#/report/history', 'clock', '', 'History', 'All activity')}
        ${tile('#/report/revenue', 'trend', '', 'Revenue', money(d.revenue))}
        ${tile('#/report/costs', 'out', 'warn', 'Costs', money(cost(d)))}
        ${tile('#/report/profit', 'chart', 'good', 'Net profit', money(profit))}
        ${tile('#/report/receivables', 'building', 'bad', 'Client balances', money(all.outstanding))}
        ${tile('#/report/vehicles', 'truck', '', 'Vehicle performance', `${LOOK.vehicles.length} vehicle${LOOK.vehicles.length === 1 ? '' : 's'}`)}
        ${tile('#/report/fleet', 'route', '', 'Fleet status', fleet ? `${vs.Working || 0} of ${fleet} working` : 'No vehicles')}
        ${tile('#/report/attention', 'alert', 'warn', 'Needs attention', alerts ? `${alerts} item${alerts === 1 ? '' : 's'}` : 'All clear', alerts)}
      </div>
      <div class="section-label">Manage</div>
      <div class="tiles">
        ${tile('#/vehicles', 'truck', '', 'Vehicles', `${LOOK.vehicles.length} registered`)}
        ${tile('#/clients', 'building', '', 'Clients', `${LOOK.clients.length} registered`)}
        ${tile('#/missions', 'route', '', 'Missions', `${all.mission_status.Ongoing || 0} in progress`, all.mission_status.Ongoing)}
        ${tile('#/fuel', 'fuel', 'warn', 'Fuel', 'Fuel records')}
        ${tile('#/maintenance', 'wrench', 'warn', 'Maintenance', 'Service and repairs')}
        ${tile('#/expenses', 'out', 'bad', 'Payments made', 'Money paid out')}
        ${tile('#/payments', 'in', 'good', 'Payments received', 'Money received')}
      </div>
      <div class="section-label">Recent activity</div>
      ${feed.length ? `<div class="rlist">${feed.map(feedRow).join('')}</div><a class="btn" href="#/report/history" style="width:100%;margin-top:4px">See all history ${icon('chevR')}</a>` : '<div class="card"><div class="empty">No activity yet. Tap + to add your first record.</div></div>'}`;
    countUps(box);
  };
  const stored = (() => { try { return localStorage.getItem('period'); } catch { return null; } })();
  const initial = PERIODS.some(([v]) => v === stored) && stored !== 'custom' ? stored : 'year';
  main.querySelector('#period').append(periodPicker(initial, (f, t) => load(f, t).catch((e) => toast(e.message))));
  await load(...rangeFor(initial));
}

async function dashboardPage(main) {
  if (isPhone()) return homeHub(main);
  const hour = new Date().getHours();
  main.innerHTML = `
    <div class="page-head">
      <div><h1>Welcome back, ${esc(greetName())}</h1>
      <p><span>${new Date().toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span> · <span>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</span>. <span>Here is how ${esc(SETTINGS.company_name)} is performing.</span></p></div>
      <span class="grow"></span><div id="period"></div>
    </div>
    <div id="dash" class="rise"><div class="kpi-row"><div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div></div></div>`;
  const box = main.querySelector('#dash');

  const load = async (from, to) => {
    const p = { p_from: from || null, p_to: to || null };
    const prev = from && to ? prevRange(from, to) : null;
    const [d, vr, cr, feed, exp, pd] = await Promise.all([
      sb.rpc('dashboard', p).then(ok), sb.rpc('vehicle_report', p).then(ok), sb.rpc('client_report', p).then(ok), activityFeed(),
      fetchAll(() => { let q = sb.from('expenses').select('category,amount').order('id'); if (from) q = q.gte('date', from); if (to) q = q.lte('date', to); return q; }),
      prev ? sb.rpc('dashboard', { p_from: prev[0], p_to: prev[1] }).then(ok) : null,
    ]);
    const costs = (x) => x.fuel + x.maintenance + x.expenses;
    const profit = (x) => x.revenue - costs(x);
    const missionsN = vr.reduce((a, v) => a + Number(v.missions), 0);
    const vs = d.vehicle_status, ms = d.mission_status;
    const fleet = (vs.Available || 0) + (vs.Working || 0) + (vs['Under Maintenance'] || 0);
    const debtors = cr.filter((c) => c.balance > 0);
    const vsPrev = '<span>vs previous period</span>';
    const margin = d.revenue ? (profit(d) / d.revenue) * 100 : 0;

    // Cost breakdown: fuel, maintenance and the largest expense categories.
    const byCat = {};
    exp.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
    const parts = [{ label: 'Fuel', value: d.fuel }, { label: 'Maintenance', value: d.maintenance }, ...cats.slice(0, 2).map(([label, value]) => ({ label, value }))];
    const rest = cats.slice(2).reduce((a, [, v]) => a + v, 0);
    if (rest > 0) parts.push({ label: 'Other expenses', value: rest });
    parts.forEach((x, i) => { x.color = colors[i % colors.length]; });

    const kpi = (label, ic, tone, value, cur, prv, inv, fallback) => `
      <div class="card kpi lift"><div class="kpi-top"><span class="k">${label}</span><span class="ico ${tone}">${icon(ic)}</span></div>
      <div class="v" data-count="${value}">${money(value)}</div>
      <div class="foot">${prev ? deltaPill(cur, prv, inv) + vsPrev : fallback}</div></div>`;

    const alerts = [];
    if (vs['Under Maintenance']) alerts.push(['warn', 'wrench', `${vs['Under Maintenance']} vehicle${vs['Under Maintenance'] > 1 ? 's' : ''} under maintenance`, '#/vehicles']);
    if (debtors.length) alerts.push(['bad', 'wallet', `${money(d.outstanding)} owed by ${debtors.length} client${debtors.length > 1 ? 's' : ''}`, '#/clients']);
    if (ms.Ongoing) alerts.push(['', 'route', `${ms.Ongoing} mission${ms.Ongoing > 1 ? 's' : ''} in progress`, '#/missions']);
    if (ms.Planned) alerts.push(['', 'clock', `${ms.Planned} planned mission${ms.Planned > 1 ? 's' : ''} not started`, '#/missions']);
    const pct = (n) => (fleet ? ((n || 0) / fleet) * 100 : 0);

    box.innerHTML = `
      <div class="kpi-row">
        <div class="card kpi hero-card lift ${profit(d) < 0 ? 'neg' : ''}"><div class="kpi-top"><span class="k">Net profit</span><span class="ico">${icon('chart')}</span></div>
          <div class="v" data-count="${profit(d)}">${money(profit(d))}</div>
          <div class="foot">${prev ? deltaPill(profit(d), pd && profit(pd)) + vsPrev : ''}<span>${margin.toFixed(1)}% margin</span></div>
          ${sparkline(d.monthly || [])}</div>
        ${kpi('Revenue', 'trend', '', d.revenue, d.revenue, pd?.revenue, false, `${missionsN} completed mission${missionsN === 1 ? '' : 's'}`)}
        ${kpi('Total costs', 'out', 'warn', costs(d), costs(d), pd && costs(pd), true, 'Fuel, maintenance, expenses')}
        ${kpi('Payments received', 'wallet', 'good', d.received, d.received, pd?.received, false, `${money(d.outstanding)} still owed`)}
      </div>
      <div class="g3">
        <div class="card span2 lift"><div class="card-head"><h2>Revenue, costs and profit</h2><span class="sub">Last 6 months</span></div>
          <div class="card-body"><div class="legend" style="margin-bottom:12px"><span><i style="background:var(--c1)"></i>Revenue</span><span><i style="background:var(--c2)"></i>Costs</span><span><i style="background:var(--good)"></i>Net profit</span></div>
          ${trendChart(d.monthly || [])}</div></div>
        <div class="card lift"><div class="card-head"><h2>Where the money goes</h2></div>
          <div class="card-body">${donut(parts.length ? parts : [{ label: 'No costs yet', value: 0, color: 'var(--c5)' }], money(costs(d)), 'total costs')}</div></div>
      </div>
      <div class="g3">
        <div class="stack span2">
          <div class="card"><div class="card-head"><h2>Vehicle performance</h2><a href="#/vehicles">View all</a></div><div class="table-wrap lv">${vehicleTable(vr)}</div></div>
          <div class="card"><div class="card-head"><h2>Client balances</h2><a href="#/clients">View all</a></div><div class="table-wrap lv">${clientTable(cr)}</div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Fleet status</h2></div><div class="card-body">
          <div class="stackbar"><span style="width:${pct(vs.Working)}%;background:var(--c1)"></span><span style="width:${pct(vs.Available)}%;background:var(--c4)"></span><span style="width:${pct(vs['Under Maintenance'])}%;background:var(--c3)"></span></div>
          <div class="dlist"><div><i style="background:var(--c1)"></i>Working<b>${vs.Working || 0}</b></div><div><i style="background:var(--c4)"></i>Available<b>${vs.Available || 0}</b></div><div><i style="background:var(--c3)"></i>Under maintenance<b>${vs['Under Maintenance'] || 0}</b></div></div>
          <div class="sub" style="margin-top:12px">Utilisation ${Math.round(pct(vs.Working))}% of ${fleet} vehicle${fleet === 1 ? '' : 's'}</div>
          <div class="section-title">Needs attention</div>
          <div class="alerts">${alerts.map(([t, ic, text, href]) => `<a href="${href}"><span class="act-ic ${t}">${icon(ic)}</span><span>${esc(text)}</span></a>`).join('') || `<div class="sub">${icon('check')} Nothing needs attention.</div>`}</div>
        </div></div>
          <div class="card"><div class="card-head"><h2>Recent activity</h2></div><div class="card-body" style="padding-top:8px;padding-bottom:10px">
          <div class="rows">${feed.map((f) => `<a href="${f.href}"><span class="act-ic ${f.tone}">${icon(f.ic)}</span><span class="grow"><b>${esc(f.title)}</b><span>${esc(f.sub)} · ${ago(f.at)}</span></span><span class="amt">${moneyIn(f.amt, f.cur)}</span></a>`).join('') || '<div class="sub" style="padding:14px 0">No activity yet.</div>'}</div>
        </div></div>
        </div>
      </div>`;
    countUps(box);
  };

  const stored = (() => { try { return localStorage.getItem('period'); } catch { return null; } })();
  const initial = PERIODS.some(([v]) => v === stored) && stored !== 'custom' ? stored : 'year';
  main.querySelector('#period').append(periodPicker(initial, (f, t) => load(f, t).catch((e) => toast(e.message))));
  await load(...rangeFor(initial));
}

function vehicleTable(list) {
  if (!list.length) return '<div class="empty">No vehicles registered yet.</div>';
  const tot = (k) => list.reduce((a, v) => a + Number(v[k]), 0);
  const costs = (v) => Number(v.fuel) + Number(v.maintenance) + Number(v.expenses);
  return `<table><thead><tr><th>Vehicle</th><th>Status</th><th class="num">Missions</th><th class="num">Revenue</th><th class="num">Costs</th><th class="num">Profit</th></tr></thead>
    <tbody>${list.map((v) => `<tr class="click" onclick="location.hash='#/vehicles/${v.id}'"><td data-label="Vehicle"><b>${esc(v.plate)}</b><div class="sub">${esc(v.name)}</div></td><td data-label="Status">${badge(v.status)}</td><td data-label="Missions" class="num">${v.missions}</td><td data-label="Revenue" class="num">${money(v.revenue)}</td><td data-label="Costs" class="num">${money(costs(v))}</td><td data-label="Profit" class="num">${signed(v.profit)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td></td><td data-label="Missions" class="num">${tot('missions')}</td><td data-label="Revenue" class="num">${money(tot('revenue'))}</td><td data-label="Costs" class="num">${money(list.reduce((a, v) => a + costs(v), 0))}</td><td data-label="Profit" class="num">${signed(tot('profit'))}</td></tr></tfoot></table>
    <div class="app-list">${list.map((v) => `<div class="arow" onclick="location.hash='#/vehicles/${v.id}'"><span class="act-ic">${icon('truck')}</span><div class="body"><b>${esc(v.plate)}</b><span>${esc(v.name)}</span></div><div class="trail"><b>${signed(v.profit)}</b>${badge(v.status)}</div>${icon('chevR')}</div>`).join('')}</div>`;
}
function clientTable(list) {
  if (!list.length) return '<div class="empty">No clients registered yet.</div>';
  return `<table><thead><tr><th>Client</th><th>Type</th><th class="num">Missions</th><th class="num">Billed</th><th class="num">Received</th><th class="num">Balance owed</th></tr></thead>
    <tbody>${list.map((c) => `<tr class="click" onclick="location.hash='#/clients/${c.id}'"><td data-label="Client"><b>${esc(c.name)}</b></td><td data-label="Type">${esc(c.type)}</td><td data-label="Missions" class="num">${c.missions}</td><td data-label="Billed" class="num">${money(c.billed)}</td><td data-label="Received" class="num">${money(c.received)}</td><td data-label="Balance owed" class="num ${c.balance > 0 ? 'neg' : ''}">${money(c.balance)}</td></tr>`).join('')}</tbody></table>
    <div class="app-list">${list.map((c) => `<div class="arow" onclick="location.hash='#/clients/${c.id}'"><span class="act-ic">${icon('building')}</span><div class="body"><b>${esc(c.name)}</b><span>${c.missions} mission${c.missions === 1 ? '' : 's'} · ${money(c.received)} received</span></div><div class="trail"><b class="${c.balance > 0 ? 'neg' : ''}">${money(c.balance)}</b><span class="sub">owed</span></div>${icon('chevR')}</div>`).join('')}</div>`;
}

// ---------- Vehicle and client profiles ----------
const detailsHtml = (table, row) => `<div class="details">${ENTITIES[table].fields.filter((f) => row[f.key] != null && row[f.key] !== '').map((f) =>
  `<div><div class="k">${esc(f.label)}</div><div class="v">${cell(table, f, row)}</div></div>`).join('') || '<div class="sub">No details.</div>'}</div>`;

async function entityProfile(main, table, id, { title, kpis, tabs, report, param }) {
  const ent = ENTITIES[table];
  const getRow = async () => ok(await sb.from(table).select('*').eq('id', Number(id)).single());
  let row;
  try { row = await getRow(); } catch { main.innerHTML = `<div class="empty">${esc(ent.singular)} not found</div>`; return; }
  setCrumb(ent.title, LABEL[table](row));
  main.innerHTML = `
    <a class="back" href="#/${table}">← All ${esc(ent.title.toLowerCase())}</a>
    <div class="page-head"><h1></h1><span class="grow"></span>
      <div id="period"></div>
      <button class="btn" data-act="print">Print</button><button class="btn primary" data-act="edit">Edit ${esc(ent.singular)}</button></div>
    <div class="card card-pad" id="details"></div>
    <div class="g4" id="kpis" style="margin-top:16px;margin-bottom:0"></div>
    <div class="tabs">${tabs.map((t, i) => `<button data-i="${i}" class="${i ? '' : 'active'}">${esc(ENTITIES[t].title)}</button>`).join('')}</div>
    <div id="tab"></div>`;
  let period = ['', ''];
  const drawHead = () => {
    main.querySelector('h1').innerHTML = title(row);
    main.querySelector('#details').innerHTML = detailsHtml(table, row);
  };
  const loadKpis = async () => {
    const [r] = ok(await sb.rpc(report, { p_from: period[0] || null, p_to: period[1] || null, [param]: Number(id) }));
    main.querySelector('#kpis').innerHTML = kpis(r).map(([k, v, cls = '']) => `<div class="card kpi ${cls === 'bad' ? 'neg' : ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
  };
  const refresh = async () => { row = await getRow(); drawHead(); await loadKpis(); };
  const showTab = (i) => {
    main.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.i === String(i)));
    const fk = table === 'vehicles' ? 'vehicle_id' : 'client_id';
    listView(main.querySelector('#tab'), tabs[i], { fixed: { [fk]: id }, onChange: refresh }).catch((e) => toast(e.message));
  };
  drawHead();
  main.querySelector('#period').append(periodPicker('all', (f, t) => { period = [f, t]; loadKpis().catch((e) => toast(e.message)); }));
  main.querySelector('[data-act=edit]').onclick = () => openForm(table, row, {}, refresh);
  main.querySelector('[data-act=print]').onclick = () => window.print();
  main.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('button'); if (b) showTab(Number(b.dataset.i)); };
  await loadKpis();
  showTab(0);
}

const vehicleProfile = (main, id) => entityProfile(main, 'vehicles', id, {
  report: 'vehicle_report', param: 'p_vehicle',
  title: (v) => `${esc(v.name)} <span class="sub" style="font-size:16px">${esc(v.plate)}</span> ${badge(v.status)}`,
  kpis: (r) => [
    ['Completed missions', r.missions],
    ['Revenue', money(r.revenue)],
    ['Fuel', `${money(r.fuel)}<div class="foot sub" style="margin-top:6px">${num(r.liters)} L</div>`],
    ['Maintenance', money(r.maintenance)],
    ['Other expenses', money(r.expenses)],
    ['Profit', money(r.profit), r.profit < 0 ? 'bad' : ''],
  ],
  tabs: ['missions', 'fuel', 'maintenance', 'expenses'],
});

const clientProfile = (main, id) => entityProfile(main, 'clients', id, {
  report: 'client_report', param: 'p_client',
  title: (c) => esc(c.name),
  kpis: (r) => [
    ['Completed missions', r.missions],
    ['Total billed', money(r.billed)],
    ['Payments received', money(r.received)],
    ['Balance owed', money(r.balance), r.balance > 0 ? 'bad' : ''],
  ],
  tabs: ['missions', 'payments'],
});

// ---------- My profile ----------
async function resizeToSquare(file, size = 320) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
}
const avatarPath = (url) => (url && url.includes('/avatars/') ? decodeURIComponent(url.split('/avatars/')[1].split('?')[0]) : null);

function myProfilePage(main) {
  main.innerHTML = `
    <div class="page-head"><div><h1>My profile</h1><p>Your personal details and photo.</p></div></div>
    <div class="pf-grid">
      <div class="card pf-side">
        <div id="pf-avatar">${avatarHtml('lg')}</div>
        <h2 id="pf-name">${esc(fullName())}</h2>
        <p>${esc(ME.job_title || (ME.role === 'admin' ? 'Administrator' : 'Staff'))}</p>
        <div class="pf-actions">
          <button class="btn primary small" id="up-btn">${icon('camera')} Upload photo</button>
          <button class="btn small" id="rm-btn" ${ME.avatar_url ? '' : 'disabled'}>Remove</button>
          <input type="file" id="up-file" accept="image/png,image/jpeg,image/webp" hidden>
        </div>
        <div class="sub">JPG, PNG or WebP. Cropped to a square.</div>
        <div class="facts">
          <div><span>Role</span>${badge(ME.role)}</div>
          <div><span>Member since</span><b>${fmtDate(ME.created_at)}</b></div>
          <div><span>Last sign-in</span><b>${fmtStamp(ME.last_sign_in_at)}</b></div>
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>Personal information</h2></div><div class="card-body">
        <form class="form" id="pf-form">
          <label>Full name<input name="full_name" value="${esc(ME.full_name || '')}" autocomplete="name" placeholder="Your name"></label>
          <label>Job title<input name="job_title" value="${esc(ME.job_title || '')}" placeholder="e.g. Operations Manager"></label>
          <label>Email<input value="${esc(ME.email)}" readonly></label>
          <label>Phone<input name="phone" type="tel" value="${esc(ME.phone || '')}" autocomplete="tel" placeholder="+252 …"></label>
        </form>
        <div class="error"></div>
        <div class="modal-actions"><button class="btn primary" id="pf-save">Save changes</button></div>
      </div></div>
    </div>`;
  const err = main.querySelector('.error');
  const refreshAvatar = () => {
    main.querySelector('#pf-avatar').innerHTML = avatarHtml('lg');
    main.querySelector('#pf-name').textContent = fullName();
    main.querySelector('#rm-btn').disabled = !ME.avatar_url;
    renderUserMenu();
  };

  main.querySelector('#pf-save').onclick = async () => {
    err.textContent = '';
    const v = Object.fromEntries(new FormData(main.querySelector('#pf-form')));
    const body = { full_name: v.full_name.trim() || null, job_title: v.job_title.trim() || null, phone: v.phone.trim() || null };
    try {
      ok(await sb.from('profiles').update(body).eq('id', ME.id));
      Object.assign(ME, body);
      refreshAvatar();
      toast('Profile saved');
    } catch (e) { err.textContent = e.message; }
  };

  const file = main.querySelector('#up-file');
  main.querySelector('#up-btn').onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files[0];
    if (!f) return;
    err.textContent = '';
    try {
      if (f.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
      const blob = await resizeToSquare(f);
      const path = `${ME.id}/${Date.now()}.jpg`;
      const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      ok(await sb.from('profiles').update({ avatar_url: url }).eq('id', ME.id));
      const old = avatarPath(ME.avatar_url);
      if (old) await sb.storage.from('avatars').remove([old]);
      ME.avatar_url = url;
      refreshAvatar();
      toast('Photo updated');
    } catch (e) { err.textContent = e.message || 'Could not upload the photo.'; }
    file.value = '';
  };
  main.querySelector('#rm-btn').onclick = async () => {
    try {
      ok(await sb.from('profiles').update({ avatar_url: null }).eq('id', ME.id));
      const old = avatarPath(ME.avatar_url);
      if (old) await sb.storage.from('avatars').remove([old]);
      ME.avatar_url = null;
      refreshAvatar();
      toast('Photo removed');
    } catch (e) { err.textContent = e.message; }
  };
}

// ---------- Settings ----------
const SET_TABS = [
  ['general', 'Company', 'building', '', 'Company name, contact details and currency'],
  ['preferences', 'Preferences', 'sliders', 'warn', 'Appearance and dashboard defaults'],
  ['security', 'Security', 'shield', 'good', 'Email, password and sessions'],
  ['data', 'Data & backup', 'db', '', 'Export your data or download a backup'],
];
const isPhone = () => matchMedia('(max-width: 900px)').matches;

// On a phone, Settings opens as a list of sections (like a phone's Settings app); each row opens its own page.
function settingsMenu(main) {
  setCrumb('Settings');
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <a class="card set-profile lift" href="#/profile">${avatarHtml()}<div><b>${esc(fullName())}</b><span class="s">${esc(ME.email)}</span></div>${icon('chevR')}</a>
    <div class="card set-list">${SET_TABS.map(([k, label, ic, tone, desc]) =>
      `<a href="#/settings/${k}"><span class="act-ic ${tone}">${icon(ic)}</span><div><b>${label}</b><span class="s">${desc}</span></div>${icon('chevR')}</a>`).join('')}</div>
    <div class="card set-list"><button class="danger-row" id="set-so">${icon('logout')} Sign out</button></div>`;
  main.querySelector('#set-so').onclick = signOut;
}

function settingsPage(main, tab) {
  const known = SET_TABS.some(([k]) => k === tab);
  if (!known && isPhone()) return settingsMenu(main);
  if (!known) tab = 'general';
  const cur = SET_TABS.find(([k]) => k === tab);
  setCrumb('Settings', cur[1]);
  main.innerHTML = `
    <a class="back m-block" href="#/settings">${icon('back')} Settings</a>
    <div class="page-head"><div><h1><span class="d-only">Settings</span><span class="m-block">${cur[1]}</span></h1><p class="d-only">Manage your company, preferences, security and data.</p><p class="m-block">${cur[4]}</p></div></div>
    <div class="set-grid">
      <nav class="set-nav">${SET_TABS.map(([k, l, ic]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${icon(ic)} ${l}</button>`).join('')}</nav>
      <div class="set-section" id="set-body"></div>
    </div>`;
  main.querySelector('.set-nav').onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    history.replaceState(null, '', `#/settings/${b.dataset.t}`);
    settingsPage(main, b.dataset.t);
  };
  ({ general: settingsGeneral, preferences: settingsPrefs, security: settingsSecurity, data: settingsData })[tab](main.querySelector('#set-body'));
}

function settingsGeneral(body) {
  const can = ME.role === 'admin';
  const dis = can ? '' : 'disabled';
  const r = ratesNow();
  body.innerHTML = `
    <div class="card"><div class="card-head"><h2>Company details</h2></div><div class="card-body">
      <form class="form" id="co-form">
        <label class="full">Company name<input name="company_name" value="${esc(SETTINGS.company_name)}" required ${dis}></label>
        <label>Phone<input name="phone" type="tel" value="${esc(SETTINGS.phone || '')}" ${dis}></label>
        <label>Email<input name="email" type="email" value="${esc(SETTINGS.email || '')}" ${dis}></label>
        <label class="full">Address<input name="address" value="${esc(SETTINGS.address || '')}" ${dis}></label>
      </form>
      <div class="error" id="co-err"></div>
      ${can ? '<div class="modal-actions"><button class="btn primary" id="co-save">Save changes</button></div>' : ''}
    </div></div>
    <div class="card"><div class="card-head"><h2>Currency and exchange rates</h2></div><div class="card-body">
      <p class="sub" style="margin:0 0 14px;font-size:13px">Each record is saved in the currency you choose for it. Totals and reports add everything together in the company currency, using the rates below.</p>
      <form class="form" id="fx-form">
        <label class="full">Company currency<select name="currency" ${dis}>${CURRENCIES.map(([c, n]) => `<option value="${c}" ${c === SETTINGS.currency ? 'selected' : ''}>${c} · ${n}</option>`).join('')}</select></label>
        <div class="full fx-title"><b>Exchange rates</b><span class="sub">1 USD equals</span></div>
        <label>British Pound<span class="affix"><input name="rate_GBP" data-num="0" data-max="6" inputmode="decimal" value="${r.GBP}" autocomplete="off" ${dis}><span class="suf">GBP</span></span></label>
        <label>Somaliland Shilling<span class="affix"><input name="rate_SLSH" data-num="0" data-max="6" inputmode="decimal" value="${r.SLSH}" autocomplete="off" ${dis}><span class="suf">SLSH</span></span></label>
      </form>
      <div class="error" id="fx-err"></div>
      ${can ? '<div class="modal-actions"><button class="btn primary" id="fx-save">Save currency settings</button></div>' : ''}
      <div class="meta"><span>Update the rates whenever the exchange rate changes. Reports always use the current rates.</span>${SETTINGS.updated_at ? ` <span>Last changed ${fmtStamp(SETTINGS.updated_at)}${SETTINGS.updated_by ? ' by ' + esc(SETTINGS.updated_by) : ''}.</span>` : ''}</div>
    </div></div>`;
  upgradeControls(body);
  attachNumeric(body);
  if (!can) return;

  const commit = async (patch, errEl) => {
    errEl.textContent = '';
    try {
      const rows = ok(await sb.from('settings').update(patch).eq('id', 1).select());
      if (!rows.length) throw new Error('You do not have permission to change settings.');
      SETTINGS = rows[0];
      fmtMoney = makeMoney(SETTINGS.currency);
      document.querySelector('.side .brand').outerHTML = brandHtml();
      document.querySelector('.mark:not(.sm)').outerHTML = markHtml();
      toast('Settings saved');
      settingsGeneral(body);
    } catch (e) { errEl.textContent = e.message; }
  };
  body.querySelector('#co-save').onclick = () => {
    const v = Object.fromEntries(new FormData(body.querySelector('#co-form')));
    if (!v.company_name.trim()) { body.querySelector('#co-err').textContent = 'Company name is required'; return; }
    commit({ company_name: v.company_name.trim(), phone: v.phone.trim() || null, email: v.email.trim() || null, address: v.address.trim() || null }, body.querySelector('#co-err'));
  };
  body.querySelector('#fx-save').onclick = () => {
    const v = Object.fromEntries(new FormData(body.querySelector('#fx-form')));
    const rate = (x) => Number(String(x).replace(/,/g, ''));
    const gbp = rate(v.rate_GBP), slsh = rate(v.rate_SLSH);
    if (!(gbp > 0) || !(slsh > 0)) { body.querySelector('#fx-err').textContent = 'Enter an exchange rate greater than zero for each currency.'; return; }
    commit({ currency: v.currency, rates: { USD: 1, GBP: gbp, SLSH: slsh } }, body.querySelector('#fx-err'));
  };
}

function settingsPrefs(body) {
  const stored = (() => { try { return localStorage.getItem('period'); } catch { return null; } })();
  body.innerHTML = `<div class="card"><div class="card-head"><h2>Preferences</h2></div><div class="card-body">
    <div class="set-row"><div><b>Appearance</b><span>Choose light, dark, or match your device.</span></div>
      <div class="seg"><button data-pref="light">Light</button><button data-pref="dark">Dark</button><button data-pref="system">System</button></div></div>
    <div class="set-row"><div><b>Language</b><span>Choose the language of the app. The page reloads when you change it.</span></div>
      <div class="seg" id="lang-seg">${langButtons()}</div></div>
    <div data-install-slot="set-row">${installHtml('set-row')}</div>
    <div class="set-row"><div><b>Default dashboard period</b><span>What the dashboard shows when you open it.</span></div>
      <select id="def-period">${PERIODS.filter(([v]) => v !== 'custom').map(([v, l]) => `<option value="${v}" ${v === (stored || 'year') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  </div></div>`;
  syncThemeUI();
  upgradeControls(body);
  body.querySelectorAll('[data-pref]').forEach((b) => (b.onclick = (e) => setThemeAnimated(b.dataset.pref, e)));
  body.querySelector('#def-period').onchange = (e) => { try { localStorage.setItem('period', e.target.value); } catch { /* ignore */ } toast('Saved'); };
}

// Re-check the current password before changing the email or password.
async function verifyPassword(pw) {
  // Uses a throwaway client so the session you are signed in with is left untouched.
  const probe = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'rayaan-probe' } });
  const { error } = await probe.auth.signInWithPassword({ email: ME.email, password: pw });
  if (error) throw new Error('Your current password is wrong.');
}

function settingsSecurity(body) {
  body.innerHTML = `
    <div class="card"><div class="card-head"><h2>Sign-in verification</h2></div><div class="card-body">
      <div class="set-row"><div><b>Email code at sign-in</b><span>${SETTINGS.require_login_code ? 'Every sign-in needs a 6-digit code sent to your email, as well as your password.' : 'Add a second step: a 6-digit code sent to your email each time you sign in.'}</span></div>
        <div class="row-act"><span class="badge ${SETTINGS.require_login_code ? 'Available' : 'pending'}">${SETTINGS.require_login_code ? 'On' : 'Off'}</span><button class="btn ${SETTINGS.require_login_code ? '' : 'primary'}" id="gate-btn">${SETTINGS.require_login_code ? 'Turn off…' : 'Turn on…'}</button></div></div>
    </div></div>
    <div class="card" id="em-card"><div class="card-head"><h2>Sign-in email</h2></div><div class="card-body">
      <p class="sub" style="margin:0 0 6px;font-size:13px"><span>Your current email is</span> <b>${esc(ME.email)}</b></p><p class="sub" style="margin:0 0 14px;font-size:13px">Enter the new address and your current password. We send a verification code to the new address to confirm the change.</p>
      <form class="form" id="em-form">
        <label>New email<input name="email" type="email" required autocomplete="email" placeholder="new@company.com"></label>
        <label>Current password<input name="current" type="password" required autocomplete="current-password"></label>
      </form>
      <div class="error" id="em-err"></div><div class="notice" id="em-ok"></div>
      <div class="modal-actions"><button class="btn primary" id="em-save">Update email</button></div>
    </div></div>
    <div class="card"><div class="card-head"><h2>Change password</h2></div><div class="card-body">
      <form class="form" id="pw-form">
        <label class="full">Current password<input name="current" type="password" required autocomplete="current-password"></label>
        <label>New password<input name="next" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
        <label>Confirm new password<input name="again" type="password" required minlength="8" autocomplete="new-password"></label>
      </form>
      <div class="error" id="pw-err"></div>
      <div class="modal-actions"><button class="btn primary" id="pw-save">Update password</button></div>
    </div></div>
    <div class="card"><div class="card-head"><h2>Sessions</h2></div><div class="card-body">
      <div class="set-row"><div><b>Signed in as ${esc(ME.email)}</b><span>Last sign-in ${fmtStamp(ME.last_sign_in_at)}</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="so-here">Sign out</button><button class="btn danger" id="so-all">Sign out everywhere</button></div></div>
    </div></div>`;

  const run = async (btn, errEl, task) => {
    errEl.textContent = '';
    btn.disabled = true;
    try { await task(); } catch (e) { errEl.textContent = e.message; }
    btn.disabled = false;
  };

  const emForm = body.querySelector('#em-form');
  const emBtn = body.querySelector('#em-save');
  emBtn.onclick = () => run(emBtn, body.querySelector('#em-err'), async () => {
    body.querySelector('#em-ok').textContent = '';
    if (!emForm.reportValidity()) return;
    const next = emForm.email.value.trim().toLowerCase();
    if (next === ME.email.toLowerCase()) throw new Error('That is already your email.');
    await verifyPassword(emForm.current.value);
    const { error } = await sb.auth.updateUser({ email: next });
    if (error) throw error;
    showEmailCode(body, next);
  });
  body.querySelector('#gate-btn').onclick = () => (SETTINGS.require_login_code ? openDisableCodeDialog(body) : openEnableCodeDialog(body));

  const pwForm = body.querySelector('#pw-form');
  const pwBtn = body.querySelector('#pw-save');
  pwBtn.onclick = () => run(pwBtn, body.querySelector('#pw-err'), async () => {
    if (!pwForm.reportValidity()) return;
    if (pwForm.next.value !== pwForm.again.value) throw new Error('The two new passwords do not match.');
    if (pwForm.next.value === pwForm.current.value) throw new Error('Choose a password different from the current one.');
    await verifyPassword(pwForm.current.value);
    const { error } = await sb.auth.updateUser({ password: pwForm.next.value });
    if (error) throw error;
    pwForm.reset();
    toast('Password updated');
  });

  body.querySelector('#so-here').onclick = signOut;
  body.querySelector('#so-all').onclick = async () => { await sb.auth.signOut({ scope: 'global' }); };
}

// Changing the sign-in email: the new address must prove it is yours with a code.
function showEmailCode(body, next) {
  const card = body.querySelector('#em-card .card-body');
  card.innerHTML = `
    <p class="sub" style="margin:0 0 14px;font-size:13px"><span>We sent a verification code to</span> <b>${esc(next)}</b>. <span>Enter it to confirm the change.</span></p>
    <form class="form" id="ec-form" style="grid-template-columns:1fr"><label>Verification code<input class="code-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••"></label></form>
    <div class="error" id="ec-err"></div>
    <div class="modal-actions"><button class="btn" id="ec-cancel">Cancel</button><button class="btn" id="ec-resend">Resend code</button><button class="btn primary" id="ec-ok">Confirm email change</button></div>`;
  const form = card.querySelector('#ec-form');
  const err = card.querySelector('#ec-err');
  form.code.focus();
  card.querySelector('#ec-cancel').onclick = () => settingsSecurity(body);
  card.querySelector('#ec-resend').onclick = async () => {
    err.textContent = '';
    const r = await sb.auth.resend({ type: 'email_change', email: next });
    if (r.error) err.textContent = mailError(r.error); else toast('A new code was sent.');
  };
  const okBtn = card.querySelector('#ec-ok');
  okBtn.onclick = async () => {
    err.textContent = '';
    okBtn.disabled = true;
    try {
      const old = await sessionId();
      const { error } = await sb.auth.verifyOtp({ email: next, token: form.code.value.replace(/\s/g, ''), type: 'email_change' });
      if (error) throw new Error('That code is wrong or has expired.');
      ok(await sb.rpc('carry_over_session', { p_old: old }));
      const { data: { session } } = await sb.auth.getSession();
      ME.email = session.user.email;
      renderUserMenu();
      if (ME.email.toLowerCase() !== next.toLowerCase()) { err.textContent = 'Almost done: also confirm the message sent to your current email.'; okBtn.disabled = false; return; }
      toast('Email updated');
      settingsSecurity(body);
    } catch (e) { err.textContent = e.message; okBtn.disabled = false; }
  };
}

// Turning verification on first proves that emails reach you, so you cannot lock yourself out.
async function openEnableCodeDialog(body) {
  const email = ME.email;
  const m = h(`<div class="overlay"><div class="modal form-modal">
    <div class="m-head"><div><h2>Turn on sign-in verification</h2><p class="sub">We send a test code to make sure emails reach you before this is switched on.</p></div>
      <button type="button" class="icon-btn" data-act="cancel" aria-label="Close">${icon('x')}</button></div>
    <div class="m-body">
      <p class="sub" style="margin:0 0 14px;font-size:13px"><span>We sent a test code to</span> <b>${esc(email)}</b>.</p>
      <div class="form" style="grid-template-columns:1fr"><div class="fld"><label class="lab" for="en-in">Verification code</label><input id="en-in" class="code-in" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••"></div></div>
      <div class="error"></div>
      <p class="meta">If no email arrives, email codes are not set up yet. Nothing changes until you enter the code.</p>
    </div>
    <div class="m-foot"><button type="button" class="btn" data-act="cancel">Cancel</button><button type="button" class="btn" id="en-resend">Resend code</button><button type="button" class="btn primary" id="en-ok">Verify and turn on</button></div>
  </div></div>`);
  $modal.replaceChildren(m);
  const close = () => $modal.replaceChildren();
  const err = m.querySelector('.error');
  const input = m.querySelector('#en-in');
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-act=cancel]').forEach((b) => (b.onclick = close));
  const send = async () => { const r = await sendCode(email); err.textContent = r.error ? mailError(r.error) : ''; return !r.error; };
  send();
  m.querySelector('#en-resend').onclick = async () => { if (await send()) toast('A new code was sent.'); };
  if (!isPhone()) input.focus();
  const go = m.querySelector('#en-ok');
  go.onclick = async () => {
    err.textContent = '';
    go.disabled = true;
    try {
      const old = await sessionId();
      const { error } = await sb.auth.verifyOtp({ email, token: input.value.replace(/\s/g, ''), type: 'email' });
      if (error) throw new Error('That code is wrong or has expired.');
      ok(await sb.rpc('carry_over_session', { p_old: old }));
      const rows = ok(await sb.from('settings').update({ require_login_code: true }).eq('id', 1).select());
      if (!rows.length) throw new Error('You do not have permission to change settings.');
      SETTINGS = rows[0];
      close();
      toast('Sign-in verification turned on');
      settingsSecurity(body);
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  };
}

function openDisableCodeDialog(body) {
  const m = h(`<div class="overlay"><div class="modal form-modal">
    <div class="m-head"><div><h2>Turn off sign-in verification</h2><p class="sub">Enter your password to turn off the emailed code at sign-in.</p></div>
      <button type="button" class="icon-btn" data-act="cancel" aria-label="Close">${icon('x')}</button></div>
    <div class="m-body"><div class="form" style="grid-template-columns:1fr"><div class="fld"><label class="lab" for="dis-pw">Current password</label><input id="dis-pw" type="password" autocomplete="current-password"></div></div><div class="error"></div></div>
    <div class="m-foot"><button type="button" class="btn" data-act="cancel">Cancel</button><button type="button" class="btn danger-solid" id="dis-ok">Turn off</button></div>
  </div></div>`);
  $modal.replaceChildren(m);
  const close = () => $modal.replaceChildren();
  const err = m.querySelector('.error');
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-act=cancel]').forEach((b) => (b.onclick = close));
  const go = m.querySelector('#dis-ok');
  go.onclick = async () => {
    err.textContent = '';
    go.disabled = true;
    try {
      await verifyPassword(m.querySelector('#dis-pw').value);
      const rows = ok(await sb.from('settings').update({ require_login_code: false }).eq('id', 1).select());
      if (!rows.length) throw new Error('You do not have permission to change settings.');
      SETTINGS = rows[0];
      close();
      toast('Sign-in verification turned off');
      settingsSecurity(body);
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  };
}

function settingsData(body) {
  const tables = Object.keys(ENTITIES);
  body.innerHTML = `
    <div class="card"><div class="card-head"><h2>Full backup</h2></div><div class="card-body">
      <div class="set-row"><div><b>Download everything</b><span>All vehicles, clients, missions, fuel, maintenance, expenses, payments and settings in one file.</span></div>
        <button class="btn primary" id="bk-btn">${icon('download')} Download backup (JSON)</button></div></div></div>
    <div class="card"><div class="card-head"><h2>Export a table</h2></div><div class="card-body">
      <div class="export-grid">${tables.map((t) => `<button class="btn" data-exp="${t}">${icon('download')} ${esc(ENTITIES[t].title)}</button>`).join('')}</div>
      <div class="meta">CSV files open in Excel or Google Sheets.</div></div></div>
    ${ME.role === 'admin' ? `<div class="card danger-card"><div class="card-head"><h2>Danger zone</h2></div><div class="card-body">
      <div class="set-row"><div><b>Erase all data and start fresh</b><span>Deletes every vehicle, client, mission, fuel, maintenance, expense and payment. Your login, profile and company settings are kept.</span></div>
        <button class="btn danger" id="erase-btn">Erase all data…</button></div></div></div>` : ''}`;
  const cols = (t) => ['id', ...ENTITIES[t].fields.map((f) => f.key), 'created_at', 'created_by', 'updated_at', 'updated_by'];
  body.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = async () => {
    const t = b.dataset.exp;
    b.disabled = true;
    try {
      const rows = await fetchAll(() => sb.from(t).select('*').order('id'));
      downloadCsv(t, cols(t), rows.map((r) => cols(t).map((c) => r[c])));
    } catch (e) { toast(e.message); }
    b.disabled = false;
  }));
  body.querySelector('#bk-btn').onclick = (e) => runBackup(e.currentTarget);
  body.querySelector('#erase-btn')?.addEventListener('click', openEraseDialog);
}

async function runBackup(btn) {
  btn.disabled = true;
  try {
    const out = { exported_at: new Date().toISOString(), company: SETTINGS };
    for (const t of Object.keys(ENTITIES)) out[t] = await fetchAll(() => sb.from(t).select('*').order('id'));
    saveFile(`rayaan-backup-${today()}.json`, 'application/json', JSON.stringify(out, null, 2));
    toast('Backup downloaded');
  } catch (err) { toast(err.message); }
  btn.disabled = false;
}

// Start fresh: shows what will be deleted and asks the admin to type ERASE.
async function openEraseDialog() {
  const tables = Object.keys(ENTITIES);
  let counts;
  try {
    counts = await Promise.all(tables.map(async (t) => [t, (await sb.from(t).select('id', { count: 'exact', head: true })).count || 0]));
  } catch (e) { toast(e.message); return; }
  const total = counts.reduce((a, [, n]) => a + n, 0);
  const m = h(`<div class="overlay"><div class="modal form-modal">
    <div class="m-head"><div><h2>Erase all data?</h2><p class="sub">This starts the system fresh and cannot be undone.</p></div>
      <button type="button" class="icon-btn" data-act="cancel" aria-label="Close">${icon('x')}</button></div>
    <div class="m-body">
      <div class="warn-box"><b>${total} record${total === 1 ? '' : 's'} will be permanently deleted</b>
        <ul>${counts.map(([t, n]) => `<li><span>${esc(ENTITIES[t].title)}</span><b>${n}</b></li>`).join('')}</ul>
        <p>Your login, profile and company settings are kept. Numbers such as M-1 and F-1 start again from 1.</p></div>
      <button type="button" class="btn" id="er-bk">${icon('download')} Download a backup first</button>
      <div class="form" style="grid-template-columns:1fr;margin-top:18px"><div class="fld"><label class="lab" for="er-in">Type ERASE to confirm</label><input id="er-in" autocomplete="off" autocapitalize="characters" placeholder="ERASE"></div></div>
      <div class="error"></div>
    </div>
    <div class="m-foot"><button type="button" class="btn" data-act="cancel">Cancel</button><button type="button" class="btn danger-solid" id="er-go" disabled>Erase everything</button></div>
  </div></div>`);
  $modal.replaceChildren(m);
  const close = () => $modal.replaceChildren();
  const input = m.querySelector('#er-in');
  const go = m.querySelector('#er-go');
  m.onclick = (e) => { if (e.target === m) close(); };
  m.querySelectorAll('[data-act=cancel]').forEach((b) => (b.onclick = close));
  m.querySelector('#er-bk').onclick = (e) => runBackup(e.currentTarget);
  input.oninput = () => { go.disabled = input.value.trim() !== 'ERASE'; };
  input.onkeydown = (e) => { if (e.key === 'Enter' && !go.disabled) go.click(); };
  go.onclick = async () => {
    go.disabled = true;
    go.textContent = 'Erasing…';
    try {
      ok(await sb.rpc('erase_all_data'));
      close();
      toast('All data erased. You are starting fresh.');
      if (location.hash === '#/dashboard') route(); else location.hash = '#/dashboard';
    } catch (e) {
      m.querySelector('.error').textContent = e.message;
      go.textContent = 'Erase everything';
      go.disabled = input.value.trim() !== 'ERASE';
    }
  };
  if (!isPhone()) input.focus();
}

initI18n();
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (POP) closePop(true); else $modal.replaceChildren(); } });
start();
