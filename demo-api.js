/* Демо-режим для статичного хостингу (GitHub Pages): той самий API, що й у server.py,
   але дані лежать у localStorage цього браузера. Справжнього входу, SMS і спільної бази тут немає. */
const DemoApi = (function () {
  'use strict';

  const KEY = 'zapyt-demo-v2';
  const CATS = {auto: ['buy_car', 'parts', 'repair'], realty: ['buy', 'rent'], charity: ['need'], jobs: ['job', 'worker'], dating: ['partner']};
  const NO_PRICE = ['charity', 'dating'];
  const PHONE_RE = /(?:\+?\d[\s\-().]{0,2}){9,}/;
  const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
  const PAGE_SIZE = 20;
  const MAX_PHOTOS = 3;

  const now = () => Math.floor(Date.now() / 1000);
  const fail = (code) => { throw new Error(code); };

  function seed() {
    const ts = now();
    const users = [
      { id: 1, username: 'olena_demo', name: 'Олена' }, { id: 2, username: 'marek_demo', name: 'Marek' },
      { id: 3, username: 'taras_demo', name: 'Тарас' }, { id: 4, username: 'kasia_demo', name: 'Kasia' },
    ].map((u) => Object.assign(u, { photo: null, verified: true, phone: null, created_at: ts - 90 * 86400 }));
    const rows = [
      [3, "auto", "buy_car", "Куплю Toyota RAV4 2018–2021, гібрид або бензин", "Шукаю RAV4 у хорошому стані, бажано один власник і сервісна історія. Розгляну варіанти з Польщі. Готовий подивитися авто протягом тижня.", "UA", "Київ", 25000, "USD", {}],
      [2, "auto", "parts", "Szukam zderzaka przedniego do Skody Octavii III", "Potrzebny zderzak przedni w kolorze srebrnym, rocznik 2016, wersja przed liftem. Może być używany, bez pęknięć.", "PL", "Kraków", 600, "PLN", {}],
      [1, "auto", "repair", "Потрібен ремонт кондиціонера в авто", "Не холодить кондиціонер у Hyundai Tucson 2017. Потрібна діагностика й заправка, бажано з гарантією. Можу приїхати в будній день.", "UA", "Львів", 3000, "UAH", {}],
      [4, "realty", "rent", "Szukam mieszkania 2-pokojowego do wynajęcia", "Para bez zwierząt, oboje pracujemy. Interesuje nas Mokotów lub Ochota, blisko metra, od listopada na dłużej.", "PL", "Warszawa", 3800, "PLN", {}],
      [1, "realty", "buy", "Куплю 1-кімнатну квартиру в новобудові", "Розглядаю новобудови з ремонтом або під ремонт, до 45 м², не вище 10 поверху. Без посередників, готова до швидкої угоди.", "UA", "Київ", 60000, "USD", {}],
      [3, "realty", "rent", "Орендую гараж або паркомісце біля центру", "Потрібне місце для легкового авто на тривалий термін, бажано під охороною. Розгляну варіанти в радіусі 2 км від центру.", "UA", "Тернопіль", 1500, "UAH", {}],
      [1, "charity", "need", "Потрібні теплі речі для дитини 2 років", "Ми переселенці, шукаємо теплий одяг на зиму та взуття 24 розміру для хлопчика. Будемо вдячні за будь-яку допомогу.", "PL", "Warszawa", null, null, {}],
      [2, "charity", "need", "Potrzebuję łóżka i szafy do pokoju", "Urządzam pokój dla mamy po przeprowadzce. Chętnie przyjmę używane meble, odbiorę sam w weekend.", "PL", "Poznań", null, null, {}],
      [2, "jobs", "worker", "Szukam magazyniera od zaraz, umowa o pracę", "Praca dwuzmianowa, szkolenie na wózki widłowe na nasz koszt, pomoc w zakwaterowaniu. Odpowiedz, jeśli szukasz stałej pracy.", "PL", "Łódź", 5200, "PLN", {}],
      [3, "jobs", "job", "Шукаю роботу електриком, досвід 8 років", "Монтаж проводки, щитків, освітлення. Маю допуски та власний інструмент. Розгляну пропозиції в Україні та Польщі.", "UA", "Тернопіль", 35000, "UAH", {}],
      [1, "dating", "partner", "Шукаю людину для серйозних стосунків", "Люблю гори, книжки та довгі прогулянки містом. Працюю дизайнеркою. Напишіть, якщо вам теж цікаво.", "UA", "Львів", null, null, {"age": 29, "gender": "f"}],
      [2, "dating", "partner", "Poznam kogoś do wspólnych wypadów rowerowych", "Lubię rower, kino i dobrą kawę. Szukam osoby z poczuciem humoru, która nie boi się długich tras.", "PL", "Gdańsk", null, null, {"age": 34, "gender": "m"}],
    ];
    // Порядок перемішано, щоб на головній одразу було видно різні категорії.
    const order = [0, 6, 3, 8, 10, 1, 4, 7, 9, 2, 11, 5];
    const requests = order.map((index, i) => {
      const r = rows[index];
      return { id: i + 1, user_id: r[0], cat: r[1], sub: r[2], title: r[3], description: r[4], country: r[5], city: r[6],
        price: r[7], currency: r[8], attrs: r[9], photos: [], status: 'active', created_at: ts - (order.length - i) * 5400 };
    }).reverse();
    return { users, requests, responses: [], session: null, pending: null, nextId: 100 };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* сховище недоступне — працюємо в пам'яті */ }
    return seed();
  }
  let db = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { fail('too_large'); }
  }

  const me = () => db.users.find((u) => u.id === db.session) || null;
  const userJson = (u) => ({ id: u.id, username: u.username, name: u.name, photo: u.photo, admin: false,
    verified: !!u.verified, phoneMask: u.phone ? '•••' + u.phone.slice(-2) : null });
  const requireUser = () => me() || fail('auth');
  const requireVerified = () => { const u = requireUser(); if (!u.verified) fail('unverified'); return u; };

  function text(value, min, max, code) {
    const out = String(value == null ? '' : value).replace(/[ \t]+/g, ' ').trim();
    if (out.length < min || out.length > max) fail(code);
    return out;
  }

  function clean(data) {
    if (!CATS[data.cat] || !CATS[data.cat].includes(data.sub)) fail('category');
    const out = {
      cat: data.cat, sub: data.sub, title: text(data.title, 5, 80, 'title'),
      description: text(data.description, 10, 4000, 'description'), city: text(data.city, 2, 60, 'city'),
      country: ['UA', 'PL'].includes(data.country) ? data.country : fail('invalid'),
      price: null, currency: null, attrs: {},
      photos: Array.isArray(data.photos) ? data.photos.slice(0, MAX_PHOTOS) : [],
    };
    if (PHONE_RE.test(out.title) || PHONE_RE.test(out.description) || PHONE_RE.test(out.city)) fail('phone');
    if (!NO_PRICE.includes(out.cat) && data.price !== null && data.price !== '' && data.price !== undefined) {
      const price = Number(data.price);
      if (!Number.isInteger(price) || price < 0 || price > 1e11 || !['UAH', 'PLN', 'USD', 'EUR'].includes(data.currency)) fail('price');
      out.price = price;
      out.currency = data.currency;
    }
    if (out.cat === 'dating') {
      const age = Number((data.attrs || {}).age);
      if (!Number.isInteger(age) || age < 18 || age > 99) fail('age');
      if (!['m', 'f', 'o'].includes((data.attrs || {}).gender)) fail('invalid');
      out.attrs = { age, gender: data.attrs.gender };
    }
    return out;
  }

  const brief = (r) => ({ id: r.id, cat: r.cat, sub: r.sub, title: r.title, country: r.country, city: r.city, price: r.price,
    currency: r.currency, attrs: r.attrs, photo: r.photos[0] || null, status: r.status, created_at: r.created_at });
  const findRequest = (id) => db.requests.find((r) => r.id === Number(id)) || fail('not_found');

  function list(q) {
    const user = me();
    let items = db.requests.slice();
    if (q.get('mine') === '1') { const u = requireUser(); items = items.filter((r) => r.user_id === u.id); }
    else items = items.filter((r) => r.status === 'active');
    const cat = q.get('cat');
    if (CATS[cat]) {
      items = items.filter((r) => r.cat === cat);
      if (CATS[cat].includes(q.get('sub'))) items = items.filter((r) => r.sub === q.get('sub'));
    }
    if (q.get('country')) items = items.filter((r) => r.country === q.get('country'));
    const term = (q.get('q') || '').trim().toLowerCase();
    if (term) items = items.filter((r) => (r.title + ' ' + r.description + ' ' + r.city).toLowerCase().includes(term));
    const city = (q.get('city') || '').trim().toLowerCase();
    if (city) items = items.filter((r) => r.city.toLowerCase().includes(city));
    if (/^\d+$/.test(q.get('price_min') || '')) items = items.filter((r) => r.price !== null && r.price >= Number(q.get('price_min')));
    if (/^\d+$/.test(q.get('price_max') || '')) items = items.filter((r) => r.price !== null && r.price <= Number(q.get('price_max')));
    const sort = q.get('sort');
    if (sort === 'cheap') items.sort((a, b) => (a.price === null) - (b.price === null) || a.price - b.price);
    else if (sort === 'expensive') items.sort((a, b) => (b.price || 0) - (a.price || 0));
    else items.sort((a, b) => b.created_at - a.created_at || b.id - a.id);
    const page = Math.max(1, parseInt(q.get('page'), 10) || 1);
    return {
      total: items.length, page, pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
      items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => Object.assign(brief(r),
        user && q.get('mine') === '1' ? { responses_count: db.responses.filter((s) => s.request_id === r.id).length } : {})),
    };
  }

  function detail(id) {
    const r = findRequest(id);
    const user = me();
    const owner = !!user && user.id === r.user_id;
    if (r.status !== 'active' && !owner) fail('not_found');
    const author = db.users.find((u) => u.id === r.user_id);
    const responses = db.responses.filter((s) => s.request_id === r.id);
    const out = Object.assign(brief(r), {
      description: r.description, photos: r.photos, is_owner: owner, can_manage: owner,
      author: { name: author.name, photo: author.photo, since: author.created_at },
      contact: user && user.verified ? author.username : null, responses_count: responses.length,
    });
    if (owner) {
      out.responses = responses.sort((a, b) => b.created_at - a.created_at).map((s) => {
        const u = db.users.find((x) => x.id === s.user_id);
        return { id: s.id, text: s.text, created_at: s.created_at, name: u.name, photo: u.photo, username: u.username };
      });
    } else if (user) {
      const mine = responses.find((s) => s.user_id === user.id);
      out.my_response = mine ? { text: mine.text, created_at: mine.created_at } : null;
    }
    return out;
  }

  function handle(path, method, body) {
    const [route, query] = path.split('?');
    const q = new URLSearchParams(query || '');
    let m;

    if (route === '/config') return { botUsername: null, devLogin: true, categories: CATS, maxPhotos: MAX_PHOTOS, smsDev: true, demo: true };
    if (route === '/me') return { user: me() ? userJson(me()) : null };

    if (route === '/auth/dev') {
      const username = String(body.username || '').trim().replace(/^@/, '');
      if (!USERNAME_RE.test(username)) fail('no_username');
      let user = db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) {
        user = { id: db.nextId++, username, name: username, photo: null, verified: false, phone: null, created_at: now() };
        db.users.push(user);
      }
      db.session = user.id;
      save();
      return { user: userJson(user) };
    }
    if (route === '/auth/logout') { db.session = null; save(); return { ok: true }; }
    if (route === '/auth/phone/start') {
      const user = requireUser();
      const phone = String(body.phone || '').replace(/[\s\-()]/g, '');
      if (!/^\+[1-9]\d{8,14}$/.test(phone)) fail('phone_format');
      if (db.users.some((u) => u.phone === phone && u.id !== user.id)) fail('phone_taken');
      const code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
      db.pending = { user_id: user.id, phone, code, expires_at: now() + 600 };
      save();
      return { ok: true, resendAfter: 60, devCode: code };
    }
    if (route === '/auth/phone/verify') {
      const user = requireUser();
      const p = db.pending;
      if (!p || p.user_id !== user.id || p.expires_at < now()) fail('code_expired');
      if (String(body.code || '').replace(/\D/g, '') !== p.code) fail('code_wrong');
      user.phone = p.phone;
      user.verified = true;
      db.pending = null;
      save();
      return { user: userJson(user) };
    }

    if (route === '/requests' && method === 'GET') return list(q);
    if (route === '/requests' && method === 'POST') {
      const user = requireVerified();
      const r = Object.assign(clean(body), { id: db.nextId++, user_id: user.id, status: 'active', created_at: now() });
      db.requests.push(r);
      save();
      return { id: r.id };
    }
    if (route === '/my/responses') {
      const user = requireUser();
      return { items: db.responses.filter((s) => s.user_id === user.id).sort((a, b) => b.created_at - a.created_at)
        .map((s) => Object.assign(brief(findRequest(s.request_id)), { response_text: s.text, responded_at: s.created_at })) };
    }
    if (route === '/upload') { requireVerified(); return { url: String(body.data || '') }; }

    if ((m = route.match(/^\/requests\/(\d+)$/))) {
      if (method === 'GET') return detail(m[1]);
      const user = requireUser();
      const r = findRequest(m[1]);
      if (r.user_id !== user.id) fail('forbidden');
      if (method === 'PUT') { Object.assign(r, clean(body)); save(); return { id: r.id }; }
      if (method === 'DELETE') {
        db.requests = db.requests.filter((x) => x.id !== r.id);
        db.responses = db.responses.filter((s) => s.request_id !== r.id);
        save();
        return { ok: true };
      }
    }
    if ((m = route.match(/^\/requests\/(\d+)\/status$/))) {
      const user = requireUser();
      const r = findRequest(m[1]);
      if (r.user_id !== user.id) fail('forbidden');
      if (!['active', 'closed'].includes(body.status)) fail('invalid');
      r.status = body.status;
      save();
      return { ok: true };
    }
    if ((m = route.match(/^\/requests\/(\d+)\/responses$/))) {
      const user = requireVerified();
      const r = findRequest(m[1]);
      if (r.user_id === user.id) fail('own');
      const value = text(body.text, 2, 1000, 'response');
      if (PHONE_RE.test(value)) fail('phone');
      if (db.responses.some((s) => s.request_id === r.id && s.user_id === user.id)) fail('duplicate');
      db.responses.push({ id: db.nextId++, request_id: r.id, user_id: user.id, text: value, created_at: now() });
      save();
      return { ok: true };
    }
    return fail('not_found');
  }

  return {
    // Асинхронний, як справжній fetch, щоб решта коду не відрізняла режими.
    call(path, method, body) {
      return new Promise((resolve, reject) => {
        try { resolve(JSON.parse(JSON.stringify(handle(path, method || 'GET', body || {})))); } catch (err) {
          db = load();
          reject(err);
        }
      });
    },
  };
})();
