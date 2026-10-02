/* =========================================================================
 * BLACKOUT :: i18n-extra.js
 * Lets content packs (arsenal, campaign, postfx) register extra strings
 * without touching i18n.js. Lookup order: pack[lang] -> base[lang] ->
 * pack[en] -> base[en] -> key.
 * ========================================================================= */
'use strict';
(function (BO) {
  const I18N = BO.I18N;
  if (!I18N || I18N.extend) return;
  const EXTRA = { en: Object.create(null), fa: Object.create(null) };
  const baseT = I18N.t.bind(I18N);

  function fill(s, params) {
    if (params) for (const p in params) s = s.split('{' + p + '}').join(String(params[p]));
    return I18N.lang === 'fa' ? I18N.digits(s) : s;
  }

  I18N.extend = function (lang, table) {
    if (!EXTRA[lang]) EXTRA[lang] = Object.create(null);
    Object.assign(EXTRA[lang], table);
  };

  I18N.t = function (key, params) {
    const own = EXTRA[I18N.lang];
    if (own && own[key] !== undefined) return fill(own[key], params);
    const base = baseT(key, params);
    if (base !== key) return base;
    if (EXTRA.en[key] !== undefined) return fill(EXTRA.en[key], params);
    return key;
  };
})(window.BO);
