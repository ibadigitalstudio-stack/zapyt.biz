/* zapyt.biz — клієнтська частина (без фреймворків, маршрути через location.hash) */
(function () {
  'use strict';

  const CATS = {
    auto: ['buy_car', 'parts', 'repair'],
    realty: ['buy', 'rent'],
    charity: ['need'],
    jobs: ['job', 'worker'],
    dating: ['partner'],
  };
  const NO_PRICE = ['charity', 'dating'];
  const CURRENCIES = ['UAH', 'PLN', 'USD', 'EUR'];
  const PHONE_RE = /(?:\+?\d[\s\-().]{0,2}){9,}/;

  const ICONS = {
    auto: '<path d="M5 17h14M6.5 17v2M17.5 17v2M4 13l1.8-5.2A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.3L20 13v4H4v-4Z"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
    realty: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10.5V19h12v-8.5"/><path d="M10 19v-5h4v5"/>',
    charity: '<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v7h13v-7M12 9v11"/><path d="M12 9c-1.5-4-6-4-5.500-1.500C7 9 12 9 12 9Zm0 0c1.500-4 6-4 5.500-1.500C17 9 12 9 12 9Z"/>',
    jobs: '<rect x="3.500" y="8" width="17" height="11" rx="2"/><path d="M9 8V6.500A1.500 1.500 0 0 1 10.500 5h3A1.500 1.500 0 0 1 15 6.500V8M3.500 13h17"/>',
    dating: '<path d="M12 19.500s-7-4.300-7-9.300A3.900 3.900 0 0 1 12 8a3.900 3.900 0 0 1 7 2.200c0 5-7 9.300-7 9.300Z"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.500-4.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400"/>',
    moon: '<path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500Z"/>',
    pin: '<path d="M12 21s-6-5.500-6-10.500a6 6 0 0 1 12 0C18 15.500 12 21 12 21Z"/><circle cx="12" cy="10.500" r="2"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
    shield: '<path d="M12 3.500 5 6v5.500c0 4.300 3 7.600 7 9 4-1.400 7-4.700 7-9V6l-7-2.500Z"/><path d="m9 12 2.200 2.200L15 10.400"/>',
    telegram: '<path d="M20.500 4.500 3.500 11l5 2 2 6 3-4 4.500 3.500 2.500-14Z"/><path d="m8.500 13 9-6.500"/>',
  };
  const icon = (name, cls) =>
    `<svg class="icon ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const state = { user: null, config: { devLogin: false, botUsername: null, maxPhotos: 6 }, lang: 'uk', afterLogin: null };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* приватний режим */ } },
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const app = $('#app');

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function t(key, vars) {
    let text = (I18N[state.lang] && I18N[state.lang][key]) || I18N.uk[key] || key;
    Object.keys(vars || {}).forEach((k) => { text = text.replace('{' + k + '}', vars[k]); });
    return text;
  }

  const locale = () => (state.lang === 'pl' ? 'pl-PL' : 'uk-UA');
  const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });

  function fmtRelative(ts) {
    const diff = Date.now() / 1000 - ts;
    const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    if (diff < 7 * 86400) return rtf.format(-Math.round(diff / 86400), 'day');
    return fmtDate(ts);
  }

  function priceLabel(item) {
    if (item.cat === 'charity') return t('price.free');
    if (item.cat === 'dating') {
      return item.attrs && item.attrs.age ? `${t('gender.' + item.attrs.gender)}, ${t('dating.age', { n: item.attrs.age })}` : '';
    }
    if (item.price == null) return t(item.cat === 'jobs' ? 'price.salaryNone' : 'price.negotiable');
    const amount = new Intl.NumberFormat(locale()).format(item.price) + ' ' + item.currency;
    // Для запитів у сумі вказано бюджет («до …»), для роботи — зарплату.
    return item.cat === 'jobs' ? amount : t('price.upTo', { amount });
  }

  async function api(path, method, body) {
    if (state.demo) return DemoApi.call(path, method, body);
    const res = await fetch('/api' + path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : (method && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : (method && method !== 'GET' ? '{}' : undefined),
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* не JSON */ }
    if (!res.ok) throw new Error(data.error || 'server');
    return data;
  }

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' toast-error' : '');
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  const toastError = (err) => toast(t('err.' + (err && err.message in errCodes() ? err.message : 'server')), 'error');
  const errCodes = () => Object.keys(I18N.uk).filter((k) => k.startsWith('err.')).reduce((acc, k) => { acc[k.slice(4)] = 1; return acc; }, {});

  // ---------- Шапка, підвал, тема, мова ----------

  function avatar(person, cls) {
    const letter = esc((person.name || '?').trim().charAt(0).toUpperCase());
    return person.photo
      ? `<img class="avatar ${cls || ''}" src="${esc(person.photo)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="avatar ${cls || ''}">${letter}</span>`;
  }

  function renderChrome() {
    document.documentElement.lang = state.lang;
    $('#demo-banner').hidden = !state.demo;
    $('#demo-banner').textContent = t('demo.banner');
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#header-actions').innerHTML = `
      <div class="lang" role="group" aria-label="${esc(t('nav.lang'))}">
        <button class="${state.lang === 'uk' ? 'on' : ''}" data-lang="uk">UA</button>
        <button class="${state.lang === 'pl' ? 'on' : ''}" data-lang="pl">PL</button>
      </div>
      <button class="icon-btn" id="theme-btn" title="${esc(t('nav.theme'))}" aria-label="${esc(t('nav.theme'))}">${icon(dark ? 'sun' : 'moon')}</button>
      ${state.user
        ? `<a class="user-chip" href="#/me" title="${esc(t('nav.profile'))}">${avatar(state.user)}<span>${esc(state.user.name)}</span></a>`
        : `<button class="btn btn-ghost" id="login-btn">${esc(t('nav.login'))}</button>`}
      <button class="btn btn-primary" id="create-btn">${icon('plus')}<span>${esc(t('nav.create'))}</span></button>`;
    $('#footer').innerHTML = `
      <nav class="footer-links">
        ${['pricing', 'terms', 'privacy', 'sitemap'].map((p) => `<a href="#/${p}">${esc(t('footer.' + p))}</a>`).join('')}
      </nav>
      <div class="footer-note"><span>© ${new Date().getFullYear()} ${esc(t('footer.about'))}</span><span>${esc(t('footer.rules'))}</span></div>`;

    $$('[data-lang]').forEach((btn) => btn.addEventListener('click', () => {
      state.lang = btn.dataset.lang;
      store.set('lang', state.lang);
      renderChrome();
      route();
    }));
    $('#theme-btn').addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set('theme', next);
      renderChrome();
    });
    $('#create-btn').addEventListener('click', () => requireLogin(() => { location.hash = '#/new'; }));
    const loginBtn = $('#login-btn');
    if (loginBtn) loginBtn.addEventListener('click', () => openLogin());
  }

  // ---------- Вхід ----------

  // Дія доступна лише після входу через Telegram і підтвердження номера кодом із SMS.
  function requireLogin(then) {
    if (state.user && state.user.verified) return then();
    state.afterLogin = then;
    if (state.user) openVerify(); else openLogin();
  }

  function closeModal() { $('#modal-root').innerHTML = ''; }

  function onLoggedIn(data) {
    state.user = data.user;
    closeModal();
    renderChrome();
    toast(t('toast.welcome', { name: state.user.name }));
    if (!state.user.verified) return openVerify();
    const then = state.afterLogin;
    state.afterLogin = null;
    if (then) then(); else route();
  }

  function openLogin() {
    const dev = state.config.devLogin;
    $('#modal-root').innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <button class="icon-btn modal-close" id="modal-close" aria-label="${esc(t('login.close'))}">${icon('close')}</button>
          <div class="modal-icon">${icon('telegram')}</div>
          <h2 id="login-title">${esc(t('login.title'))}</h2>
          <p class="muted">${esc(t('login.text'))}</p>
          ${dev ? `
            <div class="notice"><b>${esc(t('login.devTitle'))}.</b> ${esc(t('login.devText'))}</div>
            <form id="dev-login" class="stack">
              <label class="field"><span>${esc(t('login.nick'))}</span>
                <div class="input-prefix"><i>@</i><input name="username" required minlength="5" maxlength="32" pattern="[A-Za-z][A-Za-z0-9_]{4,31}" autocomplete="off" autocapitalize="off"></div>
              </label>
              <button class="btn btn-primary btn-block">${esc(t('login.submit'))}</button>
            </form>` : '<div id="tg-widget" class="tg-widget"></div>'}
        </div>
      </div>`;
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });

    if (dev) {
      const form = $('#dev-login');
      form.username.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { onLoggedIn(await api('/auth/dev', 'POST', { username: form.username.value })); } catch (err) { toastError(err); }
      });
    } else {
      // Офіційний віджет входу Telegram: повертає підписані дані, які перевіряє сервер.
      window.onTelegramAuth = async (user) => {
        try { onLoggedIn(await api('/auth/telegram', 'POST', user)); } catch (err) { toastError(err); }
      };
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.dataset.telegramLogin = state.config.botUsername;
      script.dataset.size = 'large';
      script.dataset.radius = '10';
      script.dataset.lang = state.lang;
      script.dataset.onauth = 'onTelegramAuth(user)';
      script.dataset.requestAccess = 'write';
      $('#tg-widget').appendChild(script);
    }
  }

  // ---------- Підтвердження номера через SMS ----------

  function openVerify() {
    let phone = '';
    let timer = null;
    const shell = (inner) => {
      $('#modal-root').innerHTML = `
        <div class="modal-backdrop" id="modal-backdrop">
          <div class="modal" role="dialog" aria-modal="true" aria-labelledby="verify-title">
            <button class="icon-btn modal-close" id="modal-close" aria-label="${esc(t('login.close'))}">${icon('close')}</button>
            <div class="modal-icon">${icon('shield')}</div>
            ${inner}
          </div>
        </div>`;
      $('#modal-close').addEventListener('click', () => { clearInterval(timer); closeModal(); });
    };

    const stepPhone = () => {
      clearInterval(timer);
      shell(`
        <h2 id="verify-title">${esc(t('verify.title'))}</h2>
        <p class="muted">${esc(t('verify.text'))}</p>
        <form id="phone-form" class="stack">
          <label class="field"><span>${esc(t('verify.phone'))}</span>
            <input name="phone" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" placeholder="${state.lang === 'pl' ? '+48 501 234 567' : '+380 50 123 45 67'}" value="${esc(phone)}"></label>
          <button class="btn btn-primary btn-block">${esc(t('verify.send'))}</button>
        </form>`);
      const form = $('#phone-form');
      form.phone.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        phone = form.phone.value.trim();
        try { stepCode(await api('/auth/phone/start', 'POST', { phone })); } catch (err) { toastError(err); }
      });
    };

    const stepCode = (sent) => {
      shell(`
        <h2 id="verify-title">${esc(t('verify.codeTitle'))}</h2>
        <p class="muted">${esc(t('verify.codeText', { phone }))}</p>
        ${sent.devCode ? `<div class="notice"><b>${esc(t('verify.devTitle'))}.</b> ${esc(t('verify.devText'))} <b class="dev-code">${esc(sent.devCode)}</b></div>` : ''}
        <form id="code-form" class="stack">
          <label class="field"><span>${esc(t('verify.code'))}</span>
            <input name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" required maxlength="6" pattern="[0-9]{6}" placeholder="••••••"></label>
          <button class="btn btn-primary btn-block">${esc(t('verify.confirm'))}</button>
        </form>
        <div class="verify-links">
          <button class="link-btn" id="resend-btn" disabled></button>
          <button class="link-btn" id="change-btn">${esc(t('verify.change'))}</button>
        </div>`);
      const form = $('#code-form');
      form.code.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const data = await api('/auth/phone/verify', 'POST', { code: form.code.value });
          clearInterval(timer);
          state.user = data.user;
          closeModal();
          renderChrome();
          toast(t('verify.done'));
          const then = state.afterLogin;
          state.afterLogin = null;
          if (then) then(); else route();
        } catch (err) {
          toastError(err);
          form.code.select();
        }
      });
      $('#change-btn').addEventListener('click', stepPhone);
      const resend = $('#resend-btn');
      let left = sent.resendAfter || 60;
      const tick = () => {
        resend.disabled = left > 0;
        resend.textContent = left > 0 ? t('verify.resendIn', { n: left }) : t('verify.resend');
        if (left <= 0) clearInterval(timer);
        left -= 1;
      };
      clearInterval(timer);
      tick();
      timer = setInterval(tick, 1000);
      resend.addEventListener('click', async () => {
        try { stepCode(await api('/auth/phone/start', 'POST', { phone })); } catch (err) { toastError(err); }
      });
    };

    stepPhone();
  }

  // ---------- Спільні шматки розмітки ----------

  function card(item, extra) {
    const media = item.photo
      ? `<img src="${esc(item.photo)}" alt="" loading="lazy">`
      : `<div class="card-placeholder">${icon(item.cat)}</div>`;
    return `
      <a class="card ${item.status === 'closed' ? 'is-closed' : ''}" href="#/r/${item.id}">
        <div class="card-media">${media}
          <span class="badge">${esc(t(`sub.${item.cat}.${item.sub}`))}</span>
          ${item.status === 'closed' ? `<span class="badge badge-closed">${esc(t('status.closed'))}</span>` : ''}
        </div>
        <div class="card-body">
          <h3>${esc(item.title)}</h3>
          <div class="card-price">${esc(priceLabel(item))}</div>
          <div class="card-meta">${icon('pin')}<span>${esc(item.city)}, ${esc(t('country.' + item.country))}</span><span class="dot">·</span><span>${esc(fmtRelative(item.created_at))}</span></div>
          ${extra || ''}
        </div>
      </a>`;
  }

  const empty = (title, hint) => `<div class="empty"><div class="empty-icon">${icon('search')}</div><h3>${esc(title)}</h3>${hint ? `<p class="muted">${esc(hint)}</p>` : ''}</div>`;
  const loading = () => '<div class="loading"><span></span><span></span><span></span></div>';

  function listHash(params) {
    const clean = {};
    Object.keys(params).forEach((k) => { if (params[k]) clean[k] = params[k]; });
    const qs = new URLSearchParams(clean).toString();
    return '#/list' + (qs ? '?' + qs : '');
  }

  // ---------- Головна ----------

  async function viewHome() {
    app.innerHTML = `
      <section class="hero">
        <h1>${esc(t('hero.title'))}</h1>
        <p>${esc(t('hero.text'))}</p>
        <form class="search" id="home-search">
          ${icon('search')}
          <input name="q" type="search" placeholder="${esc(t('search.placeholder'))}" aria-label="${esc(t('search.placeholder'))}">
          <button class="btn btn-primary">${esc(t('search.button'))}</button>
        </form>
      </section>
      <section>
        <h2 class="section-title">${esc(t('how.title'))}</h2>
        <ol class="how">
          ${[1, 2, 3].map((n) => `<li><span class="how-num">${n}</span><b>${esc(t(`how.${n}t`))}</b><p class="muted">${esc(t(`how.${n}d`))}</p></li>`).join('')}
        </ol>
      </section>
      <section>
        <h2 class="section-title">${esc(t('home.categories'))}</h2>
        <div class="cat-grid">
          ${Object.keys(CATS).map((cat) => `
            <div class="cat-card">
              <a class="cat-head" href="${listHash({ cat })}"><span class="cat-icon">${icon(cat)}</span><b>${esc(t('cat.' + cat))}</b></a>
              <div class="cat-subs">${CATS[cat].map((sub) => `<a href="${listHash({ cat, sub })}">${esc(t(`sub.${cat}.${sub}`))}</a>`).join('')}</div>
            </div>`).join('')}
        </div>
      </section>
      <section>
        <div class="section-head"><h2 class="section-title">${esc(t('home.latest'))}</h2><a class="link" href="#/list">${esc(t('home.all'))} →</a></div>
        <div id="latest">${loading()}</div>
      </section>`;
    $('#home-search').addEventListener('submit', (e) => {
      e.preventDefault();
      location.hash = listHash({ q: e.target.q.value.trim() });
    });
    try {
      const data = await api('/requests');
      $('#latest').innerHTML = data.items.length
        ? `<div class="grid">${data.items.slice(0, 12).map((i) => card(i)).join('')}</div>`
        : empty(t('list.empty'), t('list.emptyHint'));
    } catch (err) { toastError(err); }
  }

  // ---------- Список із фільтрами ----------

  async function viewList(params) {
    const f = {
      cat: CATS[params.get('cat')] ? params.get('cat') : '',
      sub: params.get('sub') || '', q: params.get('q') || '', country: params.get('country') || '',
      city: params.get('city') || '', price_min: params.get('price_min') || '', price_max: params.get('price_max') || '',
      sort: params.get('sort') || '', page: params.get('page') || '',
    };
    if (!f.cat || !CATS[f.cat].includes(f.sub)) f.sub = '';
    const showPrice = !NO_PRICE.includes(f.cat);
    const go = (patch) => { location.hash = listHash(Object.assign({}, f, { page: '' }, patch)); };

    app.innerHTML = `
      <form class="search search-compact" id="list-search">
        ${icon('search')}
        <input name="q" type="search" value="${esc(f.q)}" placeholder="${esc(t('search.placeholder'))}" aria-label="${esc(t('search.placeholder'))}">
        <button class="btn btn-primary">${esc(t('search.button'))}</button>
      </form>
      <div class="tabs">
        <a class="tab ${f.cat ? '' : 'on'}" href="${listHash(Object.assign({}, f, { cat: '', sub: '', page: '' }))}">${esc(t('cat.all'))}</a>
        ${Object.keys(CATS).map((cat) => `<a class="tab ${f.cat === cat ? 'on' : ''}" href="${listHash(Object.assign({}, f, { cat, sub: '', page: '' }))}">${icon(cat)}${esc(t('cat.' + cat))}</a>`).join('')}
      </div>
      ${f.cat && CATS[f.cat].length > 1 ? `
        <div class="chips">
          <a class="chip ${f.sub ? '' : 'on'}" href="${listHash(Object.assign({}, f, { sub: '', page: '' }))}">${esc(t('sub.all'))}</a>
          ${CATS[f.cat].map((sub) => `<a class="chip ${f.sub === sub ? 'on' : ''}" href="${listHash(Object.assign({}, f, { sub, page: '' }))}">${esc(t(`sub.${f.cat}.${sub}`))}</a>`).join('')}
        </div>` : ''}
      <form class="filters" id="filters">
        <label class="field"><span>${esc(t('filter.country'))}</span>
          <select name="country">
            <option value="">${esc(t('filter.anyCountry'))}</option>
            ${['UA', 'PL'].map((c) => `<option value="${c}" ${f.country === c ? 'selected' : ''}>${esc(t('country.' + c))}</option>`).join('')}
          </select></label>
        <label class="field"><span>${esc(t('filter.city'))}</span><input name="city" value="${esc(f.city)}" maxlength="60"></label>
        ${showPrice ? `
          <label class="field field-narrow"><span>${esc(t('filter.priceFrom'))}</span><input name="price_min" inputmode="numeric" value="${esc(f.price_min)}"></label>
          <label class="field field-narrow"><span>${esc(t('filter.priceTo'))}</span><input name="price_max" inputmode="numeric" value="${esc(f.price_max)}"></label>
          <label class="field"><span>${esc(t('filter.sort'))}</span>
            <select name="sort">${['new', 'cheap', 'expensive'].map((s) => `<option value="${s === 'new' ? '' : s}" ${(f.sort || 'new') === s ? 'selected' : ''}>${esc(t('sort.' + s))}</option>`).join('')}</select></label>` : ''}
        <a class="btn btn-ghost" href="${listHash({ cat: f.cat, sub: f.sub })}">${esc(t('filter.reset'))}</a>
      </form>
      <div id="results">${loading()}</div>`;

    $('#list-search').addEventListener('submit', (e) => { e.preventDefault(); go({ q: e.target.q.value.trim() }); });
    const filters = $('#filters');
    const applyFilters = () => {
      const patch = {};
      $$('input, select', filters).forEach((el) => {
        patch[el.name] = el.name.startsWith('price') ? el.value.replace(/\D/g, '') : el.value.trim();
      });
      go(patch);
    };
    filters.addEventListener('change', applyFilters);
    filters.addEventListener('submit', (e) => { e.preventDefault(); applyFilters(); });

    try {
      const query = {};
      Object.keys(f).forEach((k) => { if (f[k]) query[k] = f[k]; });
      const data = await api('/requests?' + new URLSearchParams(query));
      $('#results').innerHTML = data.items.length ? `
        <p class="muted results-count">${esc(t('list.found', { n: data.total }))}</p>
        <div class="grid">${data.items.map((i) => card(i)).join('')}</div>
        ${data.pages > 1 ? `
          <nav class="pager">
            ${data.page > 1 ? `<a class="btn btn-ghost" href="${listHash(Object.assign({}, f, { page: data.page - 1 }))}">← ${esc(t('list.prev'))}</a>` : '<span></span>'}
            <span class="muted">${esc(t('list.page', { page: data.page, pages: data.pages }))}</span>
            ${data.page < data.pages ? `<a class="btn btn-ghost" href="${listHash(Object.assign({}, f, { page: data.page + 1 }))}">${esc(t('list.next'))} →</a>` : '<span></span>'}
          </nav>` : ''}` : empty(t('list.empty'), t('list.emptyHint'));
    } catch (err) { toastError(err); }
  }

  // ---------- Сторінка запиту ----------

  async function viewDetail(id) {
    app.innerHTML = loading();
    let r;
    try { r = await api('/requests/' + id); } catch (err) {
      app.innerHTML = empty(t('err.not_found'));
      return;
    }
    const photos = r.photos || [];
    const tgLink = (username) => `https://t.me/${encodeURIComponent(username)}`;

    let side;
    if (r.is_owner) {
      side = '';
    } else if (r.contact) {
      side = `
        <a class="btn btn-primary btn-block" href="${tgLink(r.contact)}" target="_blank" rel="noopener noreferrer">${icon('telegram')}<span>${esc(t('detail.contact'))}</span></a>
        <div class="contact-nick">@${esc(r.contact)}</div>`;
    } else {
      side = `<button class="btn btn-primary btn-block" id="contact-login">${icon('telegram')}<span>${esc(t('detail.loginForContact'))}</span></button>`;
    }

    let respond = '';
    if (r.is_owner) {
      respond = `
        <section class="panel">
          <h2>${esc(t('detail.responses', { n: r.responses.length }))}</h2>
          <p class="muted small">${esc(t('detail.responsesPrivate'))}</p>
          ${r.responses.length ? r.responses.map((s) => `
            <div class="response">
              ${avatar(s)}
              <div>
                <div class="response-head"><b>${esc(s.name)}</b><span class="muted small">${esc(fmtRelative(s.created_at))}</span></div>
                <p class="pre">${esc(s.text)}</p>
                <a class="link" href="${tgLink(s.username)}" target="_blank" rel="noopener noreferrer">${icon('telegram')} @${esc(s.username)}</a>
              </div>
            </div>`).join('') : `<p class="muted">${esc(t('detail.noResponses'))}</p>`}
        </section>`;
    } else if (r.status === 'active') {
      respond = r.my_response ? `
        <section class="panel">
          <h2>${esc(t('detail.responded'))}</h2>
          <p class="pre quote">${esc(r.my_response.text)}</p>
        </section>` : `
        <section class="panel">
          <h2>${esc(t('detail.respondTitle'))}</h2>
          <p class="muted small">${esc(t('detail.respondHint'))}</p>
          <form id="respond-form" class="stack">
            <textarea name="text" rows="4" required minlength="2" maxlength="1000" placeholder="${esc(t('detail.respondPlaceholder'))}"></textarea>
            <button class="btn btn-primary">${esc(t('detail.respondSend'))}</button>
          </form>
        </section>`;
    }

    app.innerHTML = `
      <a class="back" href="${listHash({ cat: r.cat, sub: r.sub })}">${icon('back')}${esc(t('cat.' + r.cat))} / ${esc(t(`sub.${r.cat}.${r.sub}`))}</a>
      <div class="detail">
        <div class="detail-main">
          <div class="gallery">
            ${photos.length ? `<img id="gallery-main" src="${esc(photos[0])}" alt="">` : `<div class="card-placeholder gallery-placeholder">${icon(r.cat)}</div>`}
            ${photos.length > 1 ? `<div class="thumbs">${photos.map((p, i) => `<button class="${i ? '' : 'on'}" data-photo="${esc(p)}"><img src="${esc(p)}" alt=""></button>`).join('')}</div>` : ''}
          </div>
          <section class="panel">
            <h2>${esc(t('detail.description'))}</h2>
            <p class="pre">${esc(r.description)}</p>
          </section>
          ${respond}
        </div>
        <aside class="detail-side">
          <div class="panel">
            ${r.status === 'closed' ? `<span class="badge badge-closed static">${esc(t('status.closed'))}</span>` : ''}
            <h1>${esc(r.title)}</h1>
            <div class="detail-price">${esc(priceLabel(r))}</div>
            <div class="card-meta">${icon('pin')}<span>${esc(r.city)}, ${esc(t('country.' + r.country))}</span></div>
            <div class="muted small">${esc(t('detail.posted', { date: fmtDate(r.created_at) }))}</div>
          </div>
          <div class="panel">
            <div class="author">${avatar(r.author, 'avatar-lg')}<div><b>${esc(r.author.name)}</b><div class="muted small">${esc(t('detail.since', { date: fmtDate(r.author.since) }))}</div></div></div>
            ${side}
            <p class="muted small">${esc(t('detail.noPhones'))}</p>
          </div>
          ${r.can_manage ? `
            <div class="panel manage">
              ${r.is_owner ? `<a class="btn btn-ghost btn-block" href="#/edit/${r.id}">${esc(t('detail.edit'))}</a>` : ''}
              <button class="btn btn-ghost btn-block" id="toggle-status">${esc(t(r.status === 'active' ? 'detail.close' : 'detail.reopen'))}</button>
              <button class="btn btn-danger btn-block" id="delete-request">${esc(t('detail.delete'))}</button>
            </div>` : ''}
        </aside>
      </div>`;

    $$('.thumbs button').forEach((btn) => btn.addEventListener('click', () => {
      $('#gallery-main').src = btn.dataset.photo;
      $$('.thumbs button').forEach((b) => b.classList.toggle('on', b === btn));
    }));
    const contactLogin = $('#contact-login');
    if (contactLogin) contactLogin.addEventListener('click', () => requireLogin(() => viewDetail(id)));

    const form = $('#respond-form');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = form.text.value.trim();
      if (PHONE_RE.test(text)) return toast(t('err.phone'), 'error');
      requireLogin(async () => {
        try {
          await api(`/requests/${id}/responses`, 'POST', { text });
          toast(t('toast.responseSent'));
        } catch (err) { toastError(err); }
        viewDetail(id);
      });
    });

    const toggle = $('#toggle-status');
    if (toggle) toggle.addEventListener('click', async () => {
      try {
        await api(`/requests/${id}/status`, 'POST', { status: r.status === 'active' ? 'closed' : 'active' });
        toast(t('toast.saved'));
        viewDetail(id);
      } catch (err) { toastError(err); }
    });
    const del = $('#delete-request');
    if (del) del.addEventListener('click', async () => {
      if (!confirm(t('detail.deleteConfirm'))) return;
      try {
        await api('/requests/' + id, 'DELETE');
        toast(t('toast.deleted'));
        location.hash = '#/me';
      } catch (err) { toastError(err); }
    });
  }

  // ---------- Створення та редагування ----------

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  async function viewForm(editId) {
    if (!state.user || !state.user.verified) {
      app.innerHTML = empty(t('err.auth'));
      return requireLogin(() => viewForm(editId));
    }
    let r = { cat: 'auto', sub: 'buy_car', title: '', description: '', country: state.lang === 'pl' ? 'PL' : 'UA', city: '', price: null, currency: state.lang === 'pl' ? 'PLN' : 'UAH', attrs: {}, photos: [] };
    if (editId) {
      app.innerHTML = loading();
      try { r = await api('/requests/' + editId); } catch (err) { app.innerHTML = empty(t('err.not_found')); return; }
      if (!r.is_owner) { app.innerHTML = empty(t('err.forbidden')); return; }
    }
    const photos = (r.photos || []).slice();
    const max = state.config.maxPhotos;

    app.innerHTML = `
      <form class="form panel" id="request-form" novalidate>
        <h1>${esc(t(editId ? 'form.editTitle' : 'form.newTitle'))}</h1>
        <div class="row">
          <label class="field"><span>${esc(t('form.category'))}</span>
            <select name="cat">${Object.keys(CATS).map((c) => `<option value="${c}" ${r.cat === c ? 'selected' : ''}>${esc(t('cat.' + c))}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('form.subcategory'))}</span><select name="sub"></select></label>
        </div>
        <label class="field"><span>${esc(t('form.title'))}</span>
          <input name="title" value="${esc(r.title)}" maxlength="80" required placeholder="${esc(t('form.titlePlaceholder'))}"><small>${esc(t('form.titleHint'))}</small></label>
        <label class="field"><span>${esc(t('form.description'))}</span>
          <textarea name="description" rows="7" maxlength="4000" required>${esc(r.description)}</textarea><small>${esc(t('form.descriptionHint'))}</small></label>
        <div class="row" id="dating-fields" hidden>
          <label class="field"><span>${esc(t('form.age'))}</span>
            <input name="age" type="number" min="18" max="99" value="${esc(r.attrs.age || '')}"><small>${esc(t('form.ageHint'))}</small></label>
          <label class="field"><span>${esc(t('form.gender'))}</span>
            <select name="gender">${['f', 'm', 'o'].map((g) => `<option value="${g}" ${r.attrs.gender === g ? 'selected' : ''}>${esc(t('gender.' + g))}</option>`).join('')}</select></label>
        </div>
        <div class="row" id="price-fields">
          <label class="field"><span id="price-label"></span>
            <input name="price" inputmode="numeric" value="${r.price == null ? '' : esc(r.price)}"><small>${esc(t('form.priceHint'))}</small></label>
          <label class="field"><span>${esc(t('form.currency'))}</span>
            <select name="currency">${CURRENCIES.map((c) => `<option ${r.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        </div>
        <div class="row">
          <label class="field"><span>${esc(t('form.country'))}</span>
            <select name="country">${['UA', 'PL'].map((c) => `<option value="${c}" ${r.country === c ? 'selected' : ''}>${esc(t('country.' + c))}</option>`).join('')}</select></label>
          <label class="field"><span>${esc(t('form.city'))}</span><input name="city" value="${esc(r.city)}" maxlength="60" required></label>
        </div>
        <div class="field"><span>${esc(t('form.photos'))}</span>
          <div class="photo-list" id="photo-list"></div>
          <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp" multiple hidden>
          <small>${esc(t('form.photosHint', { n: max }))}</small></div>
        <div class="contact-box">
          <div class="contact-icon">${icon('telegram')}</div>
          <div><span class="muted small">${esc(t('form.contact'))}</span><b>@${esc(state.user.username)}</b><small>${esc(t('form.contactHint'))}</small></div>
        </div>
        <div class="form-actions">
          <a class="btn btn-ghost" href="${editId ? '#/r/' + editId : '#/'}">${esc(t('form.cancel'))}</a>
          <button class="btn btn-primary" id="submit-btn">${esc(t(editId ? 'form.save' : 'form.publish'))}</button>
        </div>
      </form>`;

    const form = $('#request-form');
    const syncCategory = (keepSub) => {
      const cat = form.cat.value;
      form.sub.innerHTML = CATS[cat].map((s) => `<option value="${s}" ${keepSub === s ? 'selected' : ''}>${esc(t(`sub.${cat}.${s}`))}</option>`).join('');
      $('#price-fields').hidden = NO_PRICE.includes(cat);
      $('#dating-fields').hidden = cat !== 'dating';
      $('#price-label').textContent = t(cat === 'jobs' ? 'form.salary' : 'form.price');
    };
    syncCategory(r.sub);
    form.cat.addEventListener('change', () => syncCategory());

    const renderPhotos = () => {
      $('#photo-list').innerHTML = photos.map((p, i) => `
        <div class="photo"><img src="${esc(p)}" alt=""><button type="button" data-remove="${i}" aria-label="×">${icon('close')}</button></div>`).join('')
        + (photos.length < max ? `<button type="button" class="photo photo-add" id="photo-add">${icon('plus')}<span>${esc(t('form.addPhoto'))}</span></button>` : '');
      $$('[data-remove]').forEach((btn) => btn.addEventListener('click', () => { photos.splice(Number(btn.dataset.remove), 1); renderPhotos(); }));
      const add = $('#photo-add');
      if (add) add.addEventListener('click', () => $('#photo-input').click());
    };
    renderPhotos();
    $('#photo-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files).slice(0, max - photos.length);
      e.target.value = '';
      for (const file of files) {
        try {
          const uploaded = await api('/upload', 'POST', { data: await resizeImage(file) });
          photos.push(uploaded.url);
          renderPhotos();
        } catch (err) { toastError(err); }
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = form.cat.value;
      const body = {
        cat, sub: form.sub.value, title: form.title.value, description: form.description.value,
        country: form.country.value, city: form.city.value, photos,
        price: NO_PRICE.includes(cat) ? null : form.price.value.replace(/\s/g, ''),
        currency: form.currency.value,
        attrs: cat === 'dating' ? { age: form.age.value, gender: form.gender.value } : {},
      };
      if (PHONE_RE.test(body.title) || PHONE_RE.test(body.description) || PHONE_RE.test(body.city)) {
        return toast(t('err.phone'), 'error');
      }
      const btn = $('#submit-btn');
      btn.disabled = true;
      try {
        const saved = editId ? await api('/requests/' + editId, 'PUT', body) : await api('/requests', 'POST', body);
        toast(t(editId ? 'toast.saved' : 'toast.published'));
        location.hash = '#/r/' + saved.id;
      } catch (err) {
        toastError(err);
        btn.disabled = false;
      }
    });
  }

  // ---------- Кабінет ----------

  async function viewMe() {
    if (!state.user) {
      app.innerHTML = empty(t('err.auth'));
      return requireLogin(viewMe);
    }
    app.innerHTML = `
      <div class="me-head panel">
        <div class="author">${avatar(state.user, 'avatar-lg')}<div><h1>${esc(state.user.name)}</h1><div class="muted">@${esc(state.user.username)}</div></div></div>
        <button class="btn btn-ghost" id="logout-btn">${esc(t('nav.logout'))}</button>
      </div>
      ${state.user.verified
        ? `<p class="verified-line">${icon('shield')}${esc(t('verify.verified', { mask: state.user.phoneMask || '✓' }))}</p>`
        : `<div class="banner"><span>${esc(t('verify.banner'))}</span><button class="btn btn-primary" id="verify-btn">${esc(t('verify.bannerBtn'))}</button></div>`}
      <h2 class="section-title">${esc(t('me.requests'))}</h2>
      <div id="my-requests">${loading()}</div>
      <h2 class="section-title">${esc(t('me.responses'))}</h2>
      <div id="my-responses">${loading()}</div>`;
    const verifyBtn = $('#verify-btn');
    if (verifyBtn) verifyBtn.addEventListener('click', () => requireLogin(viewMe));
    $('#logout-btn').addEventListener('click', async () => {
      try { await api('/auth/logout', 'POST'); } catch (err) { /* сесія вже недійсна */ }
      state.user = null;
      renderChrome();
      toast(t('toast.loggedOut'));
      location.hash = '#/';
    });
    try {
      const [mine, responses] = await Promise.all([api('/requests?mine=1'), api('/my/responses')]);
      $('#my-requests').innerHTML = mine.items.length
        ? `<div class="grid">${mine.items.map((i) => card(i, `<div class="card-extra">${esc(t('me.responsesCount', { n: i.responses_count }))}</div>`)).join('')}</div>`
        : `<p class="muted">${esc(t('me.noRequests'))}</p>`;
      $('#my-responses').innerHTML = responses.items.length
        ? `<div class="grid">${responses.items.map((i) => card(i, `<div class="card-extra"><b>${esc(t('me.yourResponse'))}:</b> ${esc(i.response_text)}</div>`)).join('')}</div>`
        : `<p class="muted">${esc(t('me.noResponses'))}</p>`;
    } catch (err) { toastError(err); }
  }

  // ---------- Інформаційні сторінки ----------

  function viewPage(key) {
    const page = (PAGES[state.lang] || PAGES.uk)[key];
    app.innerHTML = `<article class="prose panel"><h1>${esc(page.title)}</h1><p class="muted small">${esc(page.updated)}</p>${page.html}</article>`;
  }

  function viewSitemap() {
    const link = (href, text) => `<li><a href="${href}">${esc(text)}</a></li>`;
    app.innerHTML = `
      <div class="prose panel">
        <h1>${esc(t('footer.sitemap'))}</h1>
        <div class="sitemap">
          <div><h2>${esc(t('sitemap.main'))}</h2><ul>
            ${link('#/', t('sitemap.home'))}${link('#/list', t('home.all'))}${link('#/new', t('nav.create'))}${link('#/me', t('nav.profile'))}
          </ul></div>
          ${Object.keys(CATS).map((cat) => `<div><h2><a href="${listHash({ cat })}">${esc(t('cat.' + cat))}</a></h2><ul>
            ${CATS[cat].map((sub) => link(listHash({ cat, sub }), t(`sub.${cat}.${sub}`))).join('')}
          </ul></div>`).join('')}
          <div><h2>${esc(t('sitemap.info'))}</h2><ul>
            ${link('#/pricing', t('footer.pricing'))}${link('#/terms', t('footer.terms'))}${link('#/privacy', t('footer.privacy'))}${link('#/sitemap', t('footer.sitemap'))}
          </ul></div>
        </div>
      </div>`;
  }

  // Ціни пакетів: гривні для української версії, злоті для польської.
  const PLANS = [
    { id: 'start', price: { uk: 0, pl: 0 } },
    { id: 'standard', price: { uk: 199, pl: 19 }, popular: true },
    { id: 'business', price: { uk: 599, pl: 59 } },
  ];

  function viewPricing() {
    const currency = state.lang === 'pl' ? 'zł' : 'грн';
    app.innerHTML = `
      <div class="pricing-head"><h1>${esc(t('pricing.title'))}</h1><p class="muted">${esc(t('pricing.text'))}</p></div>
      <div class="plans">
        ${PLANS.map((plan) => {
          const price = plan.price[state.lang] || plan.price.uk;
          return `
          <div class="plan panel ${plan.popular ? 'plan-popular' : ''}">
            ${plan.popular ? `<span class="plan-tag">${esc(t('pricing.popular'))}</span>` : ''}
            <h2>${esc(t(`plan.${plan.id}.name`))}</h2>
            <p class="muted small">${esc(t(`plan.${plan.id}.desc`))}</p>
            <div class="plan-price">${price ? `<b>${price} ${currency}</b><span class="muted small">${esc(t('pricing.perMonth'))}</span>` : `<b>${esc(t('pricing.free'))}</b>`}</div>
            <ul>${[1, 2, 3, 4].map((n) => `<li>${icon('check')}<span>${esc(t(`plan.${plan.id}.f${n}`))}</span></li>`).join('')}</ul>
            <button class="btn ${plan.popular ? 'btn-primary' : 'btn-ghost'} btn-block" data-plan="${plan.id}">${esc(t(price ? 'pricing.choose' : 'pricing.startBtn'))}</button>
          </div>`;
        }).join('')}
      </div>
      <p class="muted small pricing-note">${esc(t('pricing.note'))}</p>`;
    $$('[data-plan]').forEach((btn) => btn.addEventListener('click', () => {
      if (btn.dataset.plan === 'start') return requireLogin(() => { location.hash = '#/new'; });
      toast(t('pricing.soon'));
    }));
  }

  // ---------- Маршрутизація ----------

  function route() {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [path, query] = hash.split('?');
    const params = new URLSearchParams(query || '');
    window.scrollTo(0, 0);
    let m;
    if (path === '/') return viewHome();
    if (path === '/list') return viewList(params);
    if ((m = path.match(/^\/r\/(\d+)$/))) return viewDetail(m[1]);
    if (path === '/new') return viewForm(null);
    if ((m = path.match(/^\/edit\/(\d+)$/))) return viewForm(m[1]);
    if (path === '/me') return viewMe();
    if (path === '/privacy' || path === '/terms') return viewPage(path.slice(1));
    if (path === '/sitemap') return viewSitemap();
    if (path === '/pricing') return viewPricing();
    location.hash = '#/';
  }

  async function init() {
    const saved = store.get('lang');
    state.lang = saved === 'uk' || saved === 'pl' ? saved : ((navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'uk');
    // На статичному хостингу (GitHub Pages) сервера немає — вмикаємо демо-режим із даними в браузері.
    state.demo = /\.github\.io$/.test(location.hostname) || location.protocol === 'file:' || new URLSearchParams(location.search).has('demo');
    renderChrome();
    try {
      const [config, me] = await Promise.all([api('/config'), api('/me')]);
      state.config = config;
      state.user = me.user;
    } catch (err) { toastError(err); }
    renderChrome();
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    route();
  }

  init();
})();
