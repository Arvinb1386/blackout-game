/* =========================================================================
 * BLACKOUT :: profiles.js (v5)
 * Local multi-account support: several players can keep separate progress
 * (XP, credits, unlocks, settings) on the same PC / browser. Everything is
 * stored in localStorage. Profile 'p0' keeps the legacy save key so existing
 * saves migrate automatically. Must load before main.js.
 * ========================================================================= */
'use strict';
(function (BO) {
  const S = BO.SaveSystem;
  if (!S || !S.storage) return;
  const st = S.storage;
  const REG_KEY = 'blackout.profiles.v1';
  const MAX_PROFILES = 8;
  const COLORS = ['#ff8a1a', '#19c3dd', '#3ddc84', '#ff3355', '#ffd34d', '#b07cff', '#ff7ac8', '#9aa0b4'];

  const cleanName = (n, fb) => { const s = String(n == null ? '' : n).replace(/[<>]/g, '').trim().slice(0, 18); return s || fb; };
  const keyOf = id => (id === 'p0' ? S.LEGACY_KEY : S.LEGACY_KEY + '.p.' + id);

  function loadReg() {
    try {
      const r = JSON.parse(st.get(REG_KEY) || 'null');
      if (r && Array.isArray(r.list) && r.list.length) {
        r.list = r.list.filter(p => p && typeof p.id === 'string' && /^p[0-9a-z]+$/.test(p.id)).slice(0, MAX_PROFILES)
          .map((p, i) => ({ id: p.id, name: cleanName(p.name, 'Agent ' + (i + 1)), color: COLORS.indexOf(p.color) >= 0 ? p.color : COLORS[i % COLORS.length], created: +p.created || Date.now() }));
        if (r.list.length) return { active: r.active, list: r.list };
      }
    } catch (e) { /* corrupt registry: rebuild */ }
    return { active: 'p0', list: [{ id: 'p0', name: 'Agent 1', color: COLORS[0], created: Date.now() }] };
  }

  const reg = loadReg();
  if (!reg.list.some(p => p.id === reg.active)) reg.active = reg.list[0].id;
  const persist = () => st.set(REG_KEY, JSON.stringify(reg));
  persist();
  S.setKey(keyOf(reg.active));

  const Profiles = {
    list() { return reg.list.slice(); },
    active() { return reg.list.find(p => p.id === reg.active) || reg.list[0]; },
    keyOf,
    summary(id) { const d = S.peek(keyOf(id)); return { level: d.level, credits: d.credits, missions: d.completedMissions.length }; },
    create(name) {
      if (reg.list.length >= MAX_PROFILES) return null;
      let id;
      do { id = 'p' + Math.random().toString(36).slice(2, 8); } while (reg.list.some(p => p.id === id));
      const p = { id, name: cleanName(name, 'Agent ' + (reg.list.length + 1)), color: COLORS[reg.list.length % COLORS.length], created: Date.now() };
      reg.list.push(p);
      // New profiles inherit the current language so the UI stays readable.
      const d = S.defaults();
      if (S.data && S.data.settings) d.settings.lang = S.data.settings.lang;
      S.write(keyOf(id), d);
      persist();
      return p;
    },
    rename(id, name) { const p = reg.list.find(x => x.id === id); if (p) { p.name = cleanName(name, p.name); persist(); } return p; },
    remove(id) {
      if (id === reg.active || reg.list.length <= 1) return false;
      const i = reg.list.findIndex(p => p.id === id);
      if (i < 0) return false;
      reg.list.splice(i, 1);
      st.remove(keyOf(id));
      persist();
      return true;
    },
    switchTo(id) {
      if (!reg.list.some(p => p.id === id) || id === reg.active) return;
      try { if (BO.game && BO.game.state === 'menu') S.save(); } catch (e) { /* ignore */ }
      reg.active = id;
      persist();
      // Reload so every system boots cleanly from the new profile's save.
      window.location.reload();
    }
  };
  BO.Profiles = Profiles;

  BO.I18N.extend('en', {
    'prof.title': 'PROFILES', 'prof.switch': 'SWITCH', 'prof.new': '+ NEW PROFILE', 'prof.play': 'PLAY AS',
    'prof.active': 'ACTIVE', 'prof.rename': 'RENAME', 'prof.delete': 'DELETE', 'prof.close': 'CLOSE',
    'prof.namePrompt': 'Profile name:', 'prof.confirmDelete': 'Delete this profile and all its progress?',
    'prof.full': 'Profile limit reached', 'prof.lvl': 'LVL', 'prof.ops': 'OPS'
  });
  BO.I18N.extend('fa', {
    'prof.title': 'پروفایل‌ها', 'prof.switch': 'تعویض', 'prof.new': '+ پروفایل جدید', 'prof.play': 'بازی با این',
    'prof.active': 'فعال', 'prof.rename': 'تغییر نام', 'prof.delete': 'حذف', 'prof.close': 'بستن',
    'prof.namePrompt': 'نام پروفایل:', 'prof.confirmDelete': 'این پروفایل و همه پیشرفتش حذف شود؟',
    'prof.full': 'به سقف تعداد پروفایل رسیدی', 'prof.lvl': 'سطح', 'prof.ops': 'مأموریت'
  });

  /* ------------------------------- UI ------------------------------- */
  const CSS = '' +
    '.p-switch{display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--line);font-size:14px;color:var(--text);pointer-events:auto}' +
    '.p-switch i{width:10px;height:10px;border-radius:50%;display:inline-block}' +
    '.p-switch:hover{border-color:var(--blaze)}' +
    '#profiles-ov{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);pointer-events:auto}' +
    '#profiles-ov.show{display:flex}' +
    '#profiles-ov .pbox{width:min(520px,94vw);max-height:86vh;overflow:auto;background:var(--ink-3);border-top:3px solid var(--blaze);padding:22px}' +
    '#profiles-ov h2{margin:0 0 14px;font-family:var(--display);font-size:34px}' +
    '#profiles-ov .prow{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);margin-bottom:6px;flex-wrap:wrap}' +
    '#profiles-ov .prow.on{border-color:var(--blaze);background:rgba(255,138,26,.07)}' +
    '#profiles-ov .pname{flex:1;min-width:120px;font-weight:700}' +
    '#profiles-ov .pmeta{color:var(--muted);font-size:13px}' +
    '#profiles-ov .prow button{padding:6px 10px;font-size:13px;border:1px solid var(--line)}' +
    '#profiles-ov .prow button:hover{border-color:var(--blaze);color:var(--blaze)}' +
    '#profiles-ov .pfoot{display:flex;justify-content:space-between;gap:8px;margin-top:12px}';

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const t = k => BO.t(k);
  const num = n => (BO.I18N.num ? BO.I18N.num(n) : String(n));

  function renderList(ov) {
    const box = ov.querySelector('.pbox');
    box.textContent = '';
    box.appendChild(el('h2', null, t('prof.title')));
    reg.list.forEach(p => {
      const on = p.id === reg.active;
      const row = el('div', 'prow' + (on ? ' on' : ''));
      const dot = el('i'); dot.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + p.color;
      row.appendChild(dot);
      row.appendChild(el('span', 'pname', p.name));
      const s = Profiles.summary(p.id);
      row.appendChild(el('span', 'pmeta', t('prof.lvl') + ' ' + num(s.level) + ' \u00b7 ' + num(s.credits) + ' \u00b7 ' + t('prof.ops') + ' ' + num(s.missions)));
      if (on) row.appendChild(el('span', 'pmeta', t('prof.active')));
      else { const b = el('button', null, t('prof.play')); b.onclick = () => Profiles.switchTo(p.id); row.appendChild(b); }
      const rn = el('button', null, t('prof.rename'));
      rn.onclick = () => { const n = window.prompt(t('prof.namePrompt'), p.name); if (n != null) { Profiles.rename(p.id, n); renderList(ov); refreshChip(); } };
      row.appendChild(rn);
      if (!on) {
        const del = el('button', null, t('prof.delete'));
        del.onclick = () => { if (window.confirm(t('prof.confirmDelete'))) { Profiles.remove(p.id); renderList(ov); } };
        row.appendChild(del);
      }
      box.appendChild(row);
    });
    const foot = el('div', 'pfoot');
    const add = el('button', 'btn primary', t('prof.new'));
    add.disabled = reg.list.length >= MAX_PROFILES;
    add.onclick = () => {
      const n = window.prompt(t('prof.namePrompt'), 'Agent ' + (reg.list.length + 1));
      if (n == null) return;
      const p = Profiles.create(n);
      if (!p) { if (BO.game && BO.game.ui) BO.game.ui.toast(t('prof.full')); return; }
      renderList(ov);
    };
    const close = el('button', 'btn', t('prof.close'));
    close.onclick = () => ov.classList.remove('show');
    foot.appendChild(add); foot.appendChild(close);
    box.appendChild(foot);
  }

  let chip = null;
  function refreshChip() {
    if (!chip) return;
    const p = Profiles.active();
    chip.textContent = '';
    const dot = el('i'); dot.style.background = p.color;
    chip.appendChild(dot);
    chip.appendChild(el('span', null, p.name));
    chip.title = t('prof.switch');
  }

  function mount() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const ov = el('div'); ov.id = 'profiles-ov';
    ov.appendChild(el('div', 'pbox'));
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); });
    document.body.appendChild(ov);
    const footer = document.querySelector('[data-screen="menu"] .profile');
    if (footer) {
      chip = el('button', 'p-switch');
      chip.onclick = () => { renderList(ov); ov.classList.add('show'); };
      footer.insertBefore(chip, footer.firstChild);
      refreshChip();
    }
    window.addEventListener('keydown', e => { if (e.code === 'Escape' && ov.classList.contains('show')) ov.classList.remove('show'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window.BO);
