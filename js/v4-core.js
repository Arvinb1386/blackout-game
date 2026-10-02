/* =========================================================================
 * BLACKOUT :: v4-core.js
 * v4 expansion bootstrap: extra persistent settings (enemy voices, blood)
 * that the strict save sanitiser would otherwise drop, plus shared helpers
 * used by the other v4 modules.
 * ========================================================================= */
'use strict';
(function (BO) {
  const EXTRA_TOGGLES = ['voice', 'blood'];

  const S = BO.SaveSystem;
  if (S && S.load) {
    const origLoad = S.load;
    S.load = function () {
      const data = origLoad.apply(this, arguments);
      // v5: read from the active profile key instead of a hard-coded one.
      const key = this.key || 'blackout.save.v1';
      let raw = null;
      try { raw = JSON.parse((this.storage ? this.storage.get(key) : window.localStorage.getItem(key)) || 'null'); } catch (e) { raw = null; }
      const rs = raw && raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
      EXTRA_TOGGLES.forEach(k => { data.settings[k] = typeof rs[k] === 'boolean' ? rs[k] : true; });
      return data;
    };
  }

  const settings = () => (BO.SaveSystem && BO.SaveSystem.data && BO.SaveSystem.data.settings) || {};

  BO.V4 = {
    setting(key) { return settings()[key] !== false; },
    settings
  };

  BO.I18N.extend('en', { 'set.voice': 'ENEMY VOICES (PERSIAN)', 'set.blood': 'BLOOD & GORE' });
  BO.I18N.extend('fa', { 'set.voice': 'صدای فارسی دشمن', 'set.blood': 'خون و جراحت' });
})(window.BO);
