#!/usr/bin/env python3
"""zapyt.biz — платформа запитів. Сервер без зовнішніх залежностей (Python 3.9+).

Запуск:  python3 server.py          (http://localhost:8000)
         python3 server.py --seed   (додати демо-запити в порожню базу)
"""
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(ROOT, "public")
# На хостингу DATA_DIR вказує на постійний диск, щоб база й фото не зникали після оновлення сайту.
DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_PATH = os.path.join(DATA_DIR, "zapyt.db")


def load_env():
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")
SITE_URL = os.environ.get("SITE_URL", "https://zapyt.biz").rstrip("/")
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "") == "1"
ADMINS = {a.strip().lstrip("@").lower() for a in os.environ.get("ADMIN_USERNAMES", "").split(",") if a.strip()}
# Без токена бота справжній вхід через Telegram неможливий — вмикається тестовий вхід.
DEV_LOGIN = not (BOT_TOKEN and BOT_USERNAME)

# SMS-підтвердження номера під час реєстрації (Twilio). Без ключів код показується на екрані — лише для перевірки.
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM = os.environ.get("TWILIO_FROM", "").strip()
SMS_DEV = not (TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)
SMS_CODE_TTL = 600
SMS_RESEND_AFTER = 60
SMS_PER_HOUR = 5
SMS_MAX_ATTEMPTS = 5

CATEGORIES = {
    "auto": ["buy_car", "parts", "repair", "tires", "moto", "truck", "rent_car", "transport"],
    "realty": ["buy", "rent", "buy_house", "room", "daily", "commercial", "land", "garage", "renovation"],
    "charity": ["need", "clothes", "kids", "furniture", "food", "medicine", "housing", "animals", "volunteers"],
    "jobs": ["job", "worker", "parttime", "remote", "master", "nanny", "tutor", "driver"],
    "dating": ["partner", "friends", "hobby", "travel", "sport", "chat"],
}
NO_PRICE_CATS = {"charity", "dating"}
CURRENCIES = {"UAH", "PLN", "USD", "EUR"}
COUNTRIES = {"UA", "PL"}
SESSION_TTL = 30 * 24 * 3600
PAGE_SIZE = 20
MAX_PHOTOS = 6
MAX_JSON_BODY = 64 * 1024
MAX_UPLOAD_BODY = 6 * 1024 * 1024

USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{4,31}$")
# 9+ цифр поспіль (з пробілами, дефісами, дужками між ними) вважаємо номером телефону.
PHONE_RE = re.compile(r"(?:\+?\d[\s\-().]{0,2}){9,}")
PHONE_NUMBER_RE = re.compile(r"^\+[1-9]\d{8,14}$")
PHOTO_RE = re.compile(r"^/uploads/[a-f0-9]{32}\.(?:jpg|png|webp)$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    tg_id INTEGER UNIQUE,
    username TEXT NOT NULL,
    name TEXT NOT NULL,
    photo_url TEXT,
    created_at INTEGER NOT NULL,
    phone TEXT,
    phone_verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS phone_codes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL,
    window_start INTEGER NOT NULL,
    sent_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cat TEXT NOT NULL,
    sub TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT NOT NULL,
    price INTEGER,
    currency TEXT,
    attrs TEXT NOT NULL DEFAULT '{}',
    photos TEXT NOT NULL DEFAULT '[]',
    search TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_list ON requests(status, cat, sub, created_at);
CREATE INDEX IF NOT EXISTS requests_user ON requests(user_id);
CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(request_id, user_id)
);
CREATE TABLE IF NOT EXISTS likes (
    request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (request_id, user_id)
);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comments_request ON comments(request_id, created_at);
"""


def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    # LIKE у SQLite не знає регістру кирилиці, тому порівнюємо вже приведені до нижнього регістру рядки.
    db.create_function("lc", 1, lambda s: (s or "").lower())
    return db


def init_db():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    db = connect()
    db.execute("PRAGMA journal_mode = WAL")
    db.executescript(SCHEMA)
    columns = {row["name"] for row in db.execute("PRAGMA table_info(users)")}
    for column, kind in (("phone", "TEXT"), ("phone_verified_at", "INTEGER")):
        if column not in columns:
            db.execute("ALTER TABLE users ADD COLUMN %s %s" % (column, kind))
    db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_phone ON users(phone)")
    # Запити тепер описують, що людина шукає: старі розділи переносимо в нові.
    for cat, old, new in [('auto', 'car_sale', 'buy_car'), ('realty', 'sale', 'buy'), ('charity', 'give', 'need'), ('jobs', 'vacancy', 'worker'), ('jobs', 'resume', 'job'), ('dating', 'profile', 'partner')]:
        db.execute("UPDATE requests SET sub = ? WHERE cat = ? AND sub = ?", (new, cat, old))
    db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    db.commit()
    db.close()


class ApiError(Exception):
    def __init__(self, status, code):
        super().__init__(code)
        self.status = status
        self.code = code


def now():
    return int(time.time())


def has_phone(*texts):
    return any(PHONE_RE.search(t or "") for t in texts)


def clean_text(value, min_len, max_len, code):
    if not isinstance(value, str):
        raise ApiError(400, code)
    value = re.sub(r"[ \t]+", " ", value.replace("\r\n", "\n")).strip()
    value = re.sub(r"\n{3,}", "\n\n", value)
    if not (min_len <= len(value) <= max_len):
        raise ApiError(400, code)
    return value


def clean_request(data):
    cat, sub = data.get("cat"), data.get("sub")
    if cat not in CATEGORIES or sub not in CATEGORIES[cat]:
        raise ApiError(400, "category")
    title = clean_text(data.get("title"), 5, 80, "title").replace("\n", " ")
    description = clean_text(data.get("description"), 10, 4000, "description")
    city = clean_text(data.get("city"), 2, 60, "city").replace("\n", " ")
    country = data.get("country")
    if country not in COUNTRIES:
        raise ApiError(400, "invalid")
    if has_phone(title, description, city):
        raise ApiError(400, "phone")

    price, currency = None, None
    if cat not in NO_PRICE_CATS and data.get("price") not in (None, ""):
        try:
            price = int(data["price"])
        except (TypeError, ValueError):
            raise ApiError(400, "price")
        currency = data.get("currency")
        if not (0 <= price <= 10 ** 11) or currency not in CURRENCIES:
            raise ApiError(400, "price")

    attrs = {}
    if cat == "dating":
        raw = data.get("attrs") if isinstance(data.get("attrs"), dict) else {}
        try:
            age = int(raw.get("age"))
        except (TypeError, ValueError):
            raise ApiError(400, "age")
        if not (18 <= age <= 99):
            raise ApiError(400, "age")
        if raw.get("gender") not in ("m", "f", "o"):
            raise ApiError(400, "invalid")
        attrs = {"age": age, "gender": raw["gender"]}

    photos = data.get("photos") or []
    if not isinstance(photos, list) or len(photos) > MAX_PHOTOS or not all(
        isinstance(p, str) and PHOTO_RE.match(p) for p in photos
    ):
        raise ApiError(400, "photos")

    return {
        "cat": cat, "sub": sub, "title": title, "description": description,
        "country": country, "city": city, "price": price, "currency": currency,
        "attrs": json.dumps(attrs), "photos": json.dumps(photos),
        "search": " ".join([title, description, city]).lower(),
    }


def user_json(row):
    return {
        "id": row["id"], "username": row["username"], "name": row["name"],
        "photo": row["photo_url"], "admin": row["username"].lower() in ADMINS,
        "verified": bool(row["phone_verified_at"]),
        # Номер потрібен лише для підтвердження; назовні віддаємо тільки останні дві цифри.
        "phoneMask": ("•••" + row["phone"][-2:]) if row["phone"] else None,
    }


def request_json(row, full=False):
    photos = json.loads(row["photos"])
    out = {
        "id": row["id"], "cat": row["cat"], "sub": row["sub"], "title": row["title"],
        "country": row["country"], "city": row["city"], "price": row["price"],
        "currency": row["currency"], "attrs": json.loads(row["attrs"]),
        "photo": photos[0] if photos else None, "status": row["status"],
        "created_at": row["created_at"],
        "excerpt": row["description"][:180],
    }
    if full:
        out["description"] = row["description"]
        out["photos"] = photos
    return out


def verify_telegram(data):
    allowed = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")
    fields = {k: data[k] for k in allowed if data.get(k) is not None}
    check = "\n".join("%s=%s" % (k, fields[k]) for k in sorted(fields))
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    try:
        fresh = now() - int(fields.get("auth_date", 0)) < 86400
        tg_id = int(fields["id"])
    except (KeyError, TypeError, ValueError):
        raise ApiError(401, "tg_verify")
    if not fresh or not hmac.compare_digest(calc, str(data.get("hash", ""))):
        raise ApiError(401, "tg_verify")
    return tg_id, fields


def notify_author(tg_id, request_id, title):
    """Повідомляє автора запиту в Telegram (спрацює, якщо він запускав бота)."""
    if not BOT_TOKEN or not tg_id:
        return

    def send():
        text = "zapyt.biz: нова пропозиція / nowa oferta\n«%s»\n%s/#/r/%d" % (title, SITE_URL, request_id)
        body = urllib.parse.urlencode({"chat_id": tg_id, "text": text}).encode()
        try:
            urllib.request.urlopen("https://api.telegram.org/bot%s/sendMessage" % BOT_TOKEN, body, timeout=10)
        except Exception:
            pass

    threading.Thread(target=send, daemon=True).start()


def send_sms(phone, text):
    if SMS_DEV:
        sys.stderr.write("[SMS, тестовий режим] %s: %s\n" % (phone, text))
        return
    url = "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json" % TWILIO_SID
    req = urllib.request.Request(url, urllib.parse.urlencode({"To": phone, "From": TWILIO_FROM, "Body": text}).encode())
    auth = base64.b64encode(("%s:%s" % (TWILIO_SID, TWILIO_TOKEN)).encode()).decode()
    req.add_header("Authorization", "Basic " + auth)
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write("SMS error: %r\n" % (e,))
        raise ApiError(502, "sms_failed")


def code_hash(user_id, code):
    return hashlib.sha256(("%d:%s" % (user_id, code)).encode()).hexdigest()


# ---------- API ----------

def api_config(h):
    return {"botUsername": BOT_USERNAME if not DEV_LOGIN else None, "devLogin": DEV_LOGIN,
            "categories": CATEGORIES, "maxPhotos": MAX_PHOTOS, "smsDev": SMS_DEV}


def api_me(h):
    return {"user": user_json(h.user) if h.user else None}


def start_session(h, user_id):
    token = secrets.token_hex(32)
    h.db.execute("INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)",
                 (token, user_id, now() + SESSION_TTL))
    h.db.commit()
    h.out_cookies.append("sid=%s; Path=/; HttpOnly; SameSite=Lax; Max-Age=%d%s" % (
        token, SESSION_TTL, "; Secure" if COOKIE_SECURE else ""))
    row = h.db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return {"user": user_json(row)}


def api_auth_telegram(h):
    if DEV_LOGIN:
        raise ApiError(400, "invalid")
    tg_id, f = verify_telegram(h.body)
    username = str(f.get("username") or "")
    if not USERNAME_RE.match(username):
        raise ApiError(400, "no_username")
    name = (" ".join(str(f.get(k) or "") for k in ("first_name", "last_name")).strip() or username)[:80]
    photo = str(f.get("photo_url") or "") or None
    if photo and not photo.startswith("https://t.me/"):
        photo = None
    row = h.db.execute("SELECT id FROM users WHERE tg_id = ?", (tg_id,)).fetchone()
    if row:
        h.db.execute("UPDATE users SET username=?, name=?, photo_url=? WHERE id=?", (username, name, photo, row["id"]))
        user_id = row["id"]
    else:
        user_id = h.db.execute(
            "INSERT INTO users(tg_id, username, name, photo_url, created_at) VALUES (?,?,?,?,?)",
            (tg_id, username, name, photo, now())).lastrowid
    return start_session(h, user_id)


def api_auth_dev(h):
    if not DEV_LOGIN:
        raise ApiError(404, "not_found")
    username = str(h.body.get("username") or "").strip().lstrip("@")
    if not USERNAME_RE.match(username):
        raise ApiError(400, "no_username")
    row = h.db.execute("SELECT id FROM users WHERE tg_id IS NULL AND username = ? COLLATE NOCASE",
                       (username,)).fetchone()
    user_id = row["id"] if row else h.db.execute(
        "INSERT INTO users(username, name, created_at) VALUES (?,?,?)", (username, username, now())).lastrowid
    return start_session(h, user_id)


def api_phone_start(h):
    h.require_user()
    if h.user["phone_verified_at"]:
        raise ApiError(400, "invalid")
    phone = re.sub(r"[\s\-()]", "", str(h.body.get("phone") or ""))
    if not PHONE_NUMBER_RE.match(phone):
        raise ApiError(400, "phone_format")
    if h.db.execute("SELECT 1 FROM users WHERE phone = ? AND id != ?", (phone, h.user["id"])).fetchone():
        raise ApiError(409, "phone_taken")
    ts = now()
    prev = h.db.execute("SELECT * FROM phone_codes WHERE user_id = ?", (h.user["id"],)).fetchone()
    window_start, sent_count = ts, 1
    if prev:
        if ts - prev["sent_at"] < SMS_RESEND_AFTER:
            raise ApiError(429, "sms_wait")
        if ts - prev["window_start"] < 3600:
            if prev["sent_count"] >= SMS_PER_HOUR:
                raise ApiError(429, "rate")
            window_start, sent_count = prev["window_start"], prev["sent_count"] + 1
    code = "%06d" % secrets.randbelow(10 ** 6)
    send_sms(phone, "zapyt.biz: %s — код підтвердження / kod potwierdzenia" % code)
    h.db.execute(
        "INSERT OR REPLACE INTO phone_codes(user_id, phone, code_hash, expires_at, attempts, sent_at, window_start,"
        " sent_count) VALUES (?,?,?,?,0,?,?,?)",
        (h.user["id"], phone, code_hash(h.user["id"], code), ts + SMS_CODE_TTL, ts, window_start, sent_count))
    h.db.commit()
    return {"ok": True, "resendAfter": SMS_RESEND_AFTER, "devCode": code if SMS_DEV else None}


def api_phone_verify(h):
    h.require_user()
    row = h.db.execute("SELECT * FROM phone_codes WHERE user_id = ?", (h.user["id"],)).fetchone()
    if not row or row["expires_at"] < now() or row["attempts"] >= SMS_MAX_ATTEMPTS:
        raise ApiError(400, "code_expired")
    code = re.sub(r"\D", "", str(h.body.get("code") or ""))
    if not hmac.compare_digest(row["code_hash"], code_hash(h.user["id"], code)):
        h.db.execute("UPDATE phone_codes SET attempts = attempts + 1 WHERE user_id = ?", (h.user["id"],))
        h.db.commit()
        raise ApiError(400, "code_wrong")
    try:
        h.db.execute("UPDATE users SET phone = ?, phone_verified_at = ? WHERE id = ?",
                     (row["phone"], now(), h.user["id"]))
    except sqlite3.IntegrityError:
        raise ApiError(409, "phone_taken")
    h.db.execute("DELETE FROM phone_codes WHERE user_id = ?", (h.user["id"],))
    h.db.commit()
    return {"user": user_json(h.db.execute("SELECT * FROM users WHERE id = ?", (h.user["id"],)).fetchone())}


def api_logout(h):
    if h.session_token:
        h.db.execute("DELETE FROM sessions WHERE token = ?", (h.session_token,))
        h.db.commit()
    h.out_cookies.append("sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
    return {"ok": True}


def api_list(h):
    q = h.query
    where, args = [], []
    if q.get("mine") == "1":
        h.require_user()
        where.append("r.user_id = ?")
        args.append(h.user["id"])
    else:
        where.append("r.status = 'active'")
    if q.get("cat") in CATEGORIES:
        where.append("r.cat = ?")
        args.append(q["cat"])
        if q.get("sub") in CATEGORIES[q["cat"]]:
            where.append("r.sub = ?")
            args.append(q["sub"])
    if q.get("country") in COUNTRIES:
        where.append("r.country = ?")
        args.append(q["country"])
    for key, column in (("q", "r.search"), ("city", "lc(r.city)")):
        term = (q.get(key) or "").strip().lower()[:80]
        if term:
            like = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where.append("%s LIKE ? ESCAPE '\\'" % column)
            args.append(like)
    for key, op in (("price_min", ">="), ("price_max", "<=")):
        if (q.get(key) or "").isdigit():
            where.append("r.price %s ?" % op)
            args.append(int(q[key]))
    order = {"cheap": "r.price IS NULL, r.price ASC", "expensive": "r.price DESC"}.get(
        q.get("sort"), "r.created_at DESC")
    page = max(1, int(q["page"])) if (q.get("page") or "").isdigit() else 1
    sql_where = " AND ".join(where)
    total = h.db.execute("SELECT COUNT(*) FROM requests r WHERE " + sql_where, args).fetchone()[0]
    rows = h.db.execute(
        "SELECT r.*, (SELECT COUNT(*) FROM responses s WHERE s.request_id = r.id) AS responses_count, "
        + SOCIAL_SQL + " FROM requests r WHERE %s ORDER BY %s, r.id DESC LIMIT ? OFFSET ?" % (sql_where, order),
        [h.user["id"] if h.user else 0] + args + [PAGE_SIZE, (page - 1) * PAGE_SIZE]).fetchall()
    items = []
    for row in rows:
        item = request_json(row)
        item.update(likes=row["likes_count"], comments=row["comments_count"], liked=bool(row["liked"]))
        if q.get("mine") == "1":
            item["responses_count"] = row["responses_count"]
        items.append(item)
    return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // PAGE_SIZE))}


# Лічильники лайків і коментарів та чи лайкнув запит поточний користувач (параметр — id користувача або 0).
SOCIAL_SQL = (
    "(SELECT COUNT(*) FROM likes l WHERE l.request_id = r.id) AS likes_count, "
    "(SELECT COUNT(*) FROM comments c WHERE c.request_id = r.id) AS comments_count, "
    "EXISTS(SELECT 1 FROM likes l2 WHERE l2.request_id = r.id AND l2.user_id = ?) AS liked"
)


def get_request(h, request_id):
    row = h.db.execute("SELECT * FROM requests WHERE id = ?", (int(request_id),)).fetchone()
    if not row:
        raise ApiError(404, "not_found")
    return row


def can_manage(h, row):
    return bool(h.user) and (row["user_id"] == h.user["id"] or h.user["username"].lower() in ADMINS)


def api_get(h, request_id):
    row = get_request(h, request_id)
    owner = bool(h.user) and row["user_id"] == h.user["id"]
    if row["status"] != "active" and not can_manage(h, row):
        raise ApiError(404, "not_found")
    author = h.db.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    out = request_json(row, full=True)
    out["author"] = {"name": author["name"], "photo": author["photo_url"], "since": author["created_at"]}
    out["is_owner"] = owner
    out["can_manage"] = can_manage(h, row)
    # Контакт (нік Telegram) бачать лише зареєстровані користувачі з підтвердженим номером.
    out["contact"] = author["username"] if h.user and h.user["phone_verified_at"] else None
    out["responses_count"] = h.db.execute(
        "SELECT COUNT(*) FROM responses WHERE request_id = ?", (row["id"],)).fetchone()[0]
    social = h.db.execute("SELECT " + SOCIAL_SQL + " FROM requests r WHERE r.id = ?",
                          (h.user["id"] if h.user else 0, row["id"])).fetchone()
    out.update(likes=social["likes_count"], comments=social["comments_count"], liked=bool(social["liked"]))
    if owner:
        out["responses"] = [
            {"id": r["id"], "text": r["text"], "created_at": r["created_at"],
             "name": r["name"], "photo": r["photo_url"], "username": r["username"]}
            for r in h.db.execute(
                "SELECT s.*, u.name, u.photo_url, u.username FROM responses s JOIN users u ON u.id = s.user_id "
                "WHERE s.request_id = ? ORDER BY s.created_at DESC", (row["id"],))
        ]
    elif h.user:
        mine = h.db.execute("SELECT text, created_at FROM responses WHERE request_id = ? AND user_id = ?",
                            (row["id"], h.user["id"])).fetchone()
        out["my_response"] = dict(mine) if mine else None
    return out


def rate_limit(h, table, limit):
    count = h.db.execute("SELECT COUNT(*) FROM %s WHERE user_id = ? AND created_at > ?" % table,
                         (h.user["id"], now() - 3600)).fetchone()[0]
    if count >= limit:
        raise ApiError(429, "rate")


def api_create(h):
    h.require_verified()
    rate_limit(h, "requests", 10)
    d = clean_request(h.body)
    ts = now()
    cur = h.db.execute(
        "INSERT INTO requests(user_id, cat, sub, title, description, country, city, price, currency, attrs, photos,"
        " search, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (h.user["id"], d["cat"], d["sub"], d["title"], d["description"], d["country"], d["city"], d["price"],
         d["currency"], d["attrs"], d["photos"], d["search"], ts, ts))
    h.db.commit()
    return {"id": cur.lastrowid}


def api_update(h, request_id):
    h.require_user()
    row = get_request(h, request_id)
    if row["user_id"] != h.user["id"]:
        raise ApiError(403, "forbidden")
    d = clean_request(h.body)
    h.db.execute(
        "UPDATE requests SET cat=?, sub=?, title=?, description=?, country=?, city=?, price=?, currency=?, attrs=?,"
        " photos=?, search=?, updated_at=? WHERE id=?",
        (d["cat"], d["sub"], d["title"], d["description"], d["country"], d["city"], d["price"], d["currency"],
         d["attrs"], d["photos"], d["search"], now(), row["id"]))
    h.db.commit()
    return {"id": row["id"]}


def api_status(h, request_id):
    h.require_user()
    row = get_request(h, request_id)
    status = h.body.get("status")
    if not can_manage(h, row):
        raise ApiError(403, "forbidden")
    if status not in ("active", "closed"):
        raise ApiError(400, "invalid")
    h.db.execute("UPDATE requests SET status=?, updated_at=? WHERE id=?", (status, now(), row["id"]))
    h.db.commit()
    return {"ok": True}


def api_delete(h, request_id):
    h.require_user()
    row = get_request(h, request_id)
    if not can_manage(h, row):
        raise ApiError(403, "forbidden")
    h.db.execute("DELETE FROM requests WHERE id = ?", (row["id"],))
    h.db.commit()
    for photo in json.loads(row["photos"]):
        try:
            os.remove(os.path.join(UPLOAD_DIR, os.path.basename(photo)))
        except OSError:
            pass
    return {"ok": True}


def active_request(h, request_id):
    row = get_request(h, request_id)
    if row["status"] != "active":
        raise ApiError(404, "not_found")
    return row


def comments_count(h, request_id):
    return h.db.execute("SELECT COUNT(*) FROM comments WHERE request_id = ?", (request_id,)).fetchone()[0]


# Лайкати й коментувати можуть лише зареєстровані користувачі (Telegram + підтверджений номер).
def api_like(h, request_id):
    h.require_verified()
    row = active_request(h, request_id)
    try:
        h.db.execute("INSERT INTO likes(request_id, user_id, created_at) VALUES (?,?,?)",
                     (row["id"], h.user["id"], now()))
        liked = True
    except sqlite3.IntegrityError:
        h.db.execute("DELETE FROM likes WHERE request_id = ? AND user_id = ?", (row["id"], h.user["id"]))
        liked = False
    h.db.commit()
    likes = h.db.execute("SELECT COUNT(*) FROM likes WHERE request_id = ?", (row["id"],)).fetchone()[0]
    return {"liked": liked, "likes": likes}


def api_comments(h, request_id):
    row = get_request(h, request_id)
    if row["status"] != "active" and not can_manage(h, row):
        raise ApiError(404, "not_found")
    admin = bool(h.user) and h.user["username"].lower() in ADMINS
    items = []
    for c in h.db.execute(
            "SELECT c.*, u.name, u.photo_url FROM comments c JOIN users u ON u.id = c.user_id "
            "WHERE c.request_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 300", (row["id"],)):
        items.append({
            "id": c["id"], "text": c["text"], "created_at": c["created_at"], "name": c["name"], "photo": c["photo_url"],
            "is_author": c["user_id"] == row["user_id"],
            # Видалити коментар може його автор, автор запиту або адміністратор.
            "can_delete": bool(h.user) and (c["user_id"] == h.user["id"] or row["user_id"] == h.user["id"] or admin),
        })
    return {"items": items, "count": len(items)}


def api_comment_create(h, request_id):
    h.require_verified()
    row = active_request(h, request_id)
    text = clean_text(h.body.get("text"), 1, 500, "comment")
    if has_phone(text):
        raise ApiError(400, "phone")
    rate_limit(h, "comments", 30)
    h.db.execute("INSERT INTO comments(request_id, user_id, text, created_at) VALUES (?,?,?,?)",
                 (row["id"], h.user["id"], text, now()))
    h.db.commit()
    return {"ok": True, "count": comments_count(h, row["id"])}


def api_comment_delete(h, comment_id):
    h.require_user()
    c = h.db.execute("SELECT c.*, r.user_id AS owner_id FROM comments c JOIN requests r ON r.id = c.request_id "
                     "WHERE c.id = ?", (int(comment_id),)).fetchone()
    if not c:
        raise ApiError(404, "not_found")
    if h.user["id"] not in (c["user_id"], c["owner_id"]) and h.user["username"].lower() not in ADMINS:
        raise ApiError(403, "forbidden")
    h.db.execute("DELETE FROM comments WHERE id = ?", (c["id"],))
    h.db.commit()
    return {"ok": True, "count": comments_count(h, c["request_id"])}


def api_respond(h, request_id):
    h.require_verified()
    row = get_request(h, request_id)
    if row["status"] != "active":
        raise ApiError(404, "not_found")
    if row["user_id"] == h.user["id"]:
        raise ApiError(400, "own")
    text = clean_text(h.body.get("text"), 2, 1000, "response")
    if has_phone(text):
        raise ApiError(400, "phone")
    rate_limit(h, "responses", 30)
    try:
        h.db.execute("INSERT INTO responses(request_id, user_id, text, created_at) VALUES (?,?,?,?)",
                     (row["id"], h.user["id"], text, now()))
        h.db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "duplicate")
    author = h.db.execute("SELECT tg_id FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    notify_author(author["tg_id"], row["id"], row["title"])
    return {"ok": True}


def api_my_responses(h):
    h.require_user()
    rows = h.db.execute(
        "SELECT s.text, s.created_at AS responded_at, r.* FROM responses s JOIN requests r ON r.id = s.request_id "
        "WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100", (h.user["id"],)).fetchall()
    return {"items": [dict(request_json(r), response_text=r["text"], responded_at=r["responded_at"]) for r in rows]}


def api_upload(h):
    h.require_verified()
    data = str(h.body.get("data") or "")
    try:
        raw = base64.b64decode(data.split(",", 1)[1] if data.startswith("data:") else data, validate=True)
    except Exception:
        raise ApiError(400, "image")
    if raw[:3] == b"\xff\xd8\xff":
        ext = "jpg"
    elif raw[:8] == b"\x89PNG\r\n\x1a\n":
        ext = "png"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise ApiError(400, "image")
    name = "%s.%s" % (secrets.token_hex(16), ext)
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(raw)
    return {"url": "/uploads/" + name}


ROUTES = [
    ("GET", r"/api/config", api_config),
    ("GET", r"/api/me", api_me),
    ("POST", r"/api/auth/telegram", api_auth_telegram),
    ("POST", r"/api/auth/dev", api_auth_dev),
    ("POST", r"/api/auth/phone/start", api_phone_start),
    ("POST", r"/api/auth/phone/verify", api_phone_verify),
    ("POST", r"/api/auth/logout", api_logout),
    ("GET", r"/api/requests", api_list),
    ("POST", r"/api/requests", api_create),
    ("GET", r"/api/requests/(\d+)", api_get),
    ("PUT", r"/api/requests/(\d+)", api_update),
    ("DELETE", r"/api/requests/(\d+)", api_delete),
    ("POST", r"/api/requests/(\d+)/status", api_status),
    ("POST", r"/api/requests/(\d+)/responses", api_respond),
    ("GET", r"/api/my/responses", api_my_responses),
    ("POST", r"/api/upload", api_upload),
    ("POST", r"/api/requests/(\d+)/like", api_like),
    ("GET", r"/api/requests/(\d+)/comments", api_comments),
    ("POST", r"/api/requests/(\d+)/comments", api_comment_create),
    ("DELETE", r"/api/comments/(\d+)", api_comment_delete),
]
ROUTES = [(m, re.compile("^%s$" % p), fn) for m, p, fn in ROUTES]


class Handler(BaseHTTPRequestHandler):
    server_version = "zapyt"

    def require_user(self):
        if not self.user:
            raise ApiError(401, "auth")

    def require_verified(self):
        self.require_user()
        if not self.user["phone_verified_at"]:
            raise ApiError(403, "unverified")

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for cookie in self.out_cookies:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, path, cache):
        if not os.path.isfile(path):
            self.send_error(404)
            return
        ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, method, path, query):
        self.out_cookies = []
        self.user = None
        self.session_token = None
        self.query = {k: v[0] for k, v in urllib.parse.parse_qs(query).items()}
        self.body = {}
        self.db = connect()
        try:
            for route_method, pattern, fn in ROUTES:
                match = pattern.match(path)
                if match and route_method == method:
                    break
            else:
                raise ApiError(404, "not_found")
            if method != "GET":
                # JSON-only тіло захищає від міжсайтових форм (разом із SameSite cookie).
                if "application/json" not in (self.headers.get("Content-Type") or ""):
                    raise ApiError(400, "invalid")
                length = int(self.headers.get("Content-Length") or 0)
                if length > (MAX_UPLOAD_BODY if fn is api_upload else MAX_JSON_BODY):
                    raise ApiError(413, "too_large")
                try:
                    self.body = json.loads(self.rfile.read(length) or b"{}")
                except ValueError:
                    raise ApiError(400, "invalid")
                if not isinstance(self.body, dict):
                    raise ApiError(400, "invalid")
            cookie = re.search(r"(?:^|;\s*)sid=([a-f0-9]{64})", self.headers.get("Cookie") or "")
            if cookie:
                self.session_token = cookie.group(1)
                self.user = self.db.execute(
                    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?",
                    (self.session_token, now())).fetchone()
            self.send_json(fn(self, *match.groups()))
        except ApiError as e:
            self.send_json({"error": e.code}, e.status)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write("API error on %s %s: %r\n" % (method, path, e))
            self.send_json({"error": "server"}, 500)
        finally:
            self.db.close()

    def route(self, method):
        parsed = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(parsed.path)
        if path.startswith("/api/"):
            return self.handle_api(method, path, parsed.query)
        if method != "GET":
            return self.send_error(405)
        if path.startswith("/uploads/"):
            name = os.path.basename(path)
            if not PHOTO_RE.match("/uploads/" + name):
                return self.send_error(404)
            return self.send_file(os.path.join(UPLOAD_DIR, name), "public, max-age=31536000, immutable")
        rel = "index.html" if path == "/" else path.lstrip("/")
        full = os.path.realpath(os.path.join(PUBLIC_DIR, rel))
        if not full.startswith(os.path.realpath(PUBLIC_DIR) + os.sep):
            return self.send_error(404)
        return self.send_file(full, "no-cache")

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")


def seed():
    db = connect()
    if db.execute("SELECT COUNT(*) FROM requests").fetchone()[0]:
        print("База не порожня — демо-дані не додано.")
        return
    users = {}
    for username, name in (("olena_demo", "Олена"), ("marek_demo", "Marek"), ("taras_demo", "Тарас"),
                           ("kasia_demo", "Kasia")):
        users[username] = db.execute(
            "INSERT INTO users(username, name, created_at, phone_verified_at) VALUES (?,?,?,?)",
            (username, name, now() - 90 * 86400, now() - 90 * 86400)).lastrowid
    demo = [
        ('taras_demo', 'auto', 'buy_car', 'Куплю Toyota RAV4 2018–2021, гібрид або бензин', 'Шукаю RAV4 у хорошому стані, бажано один власник і сервісна історія. Розгляну варіанти з Польщі. Готовий подивитися авто протягом тижня.', 'UA', 'Київ', 25000, 'USD', {}),
        ('olena_demo', 'charity', 'kids', 'Потрібні теплі речі для дитини 2 років', 'Ми переселенці, шукаємо теплий одяг на зиму та взуття 24 розміру для хлопчика. Будемо вдячні за будь-яку допомогу.', 'PL', 'Warszawa', None, None, {}),
        ('kasia_demo', 'realty', 'rent', 'Szukam mieszkania 2-pokojowego do wynajęcia', 'Para bez zwierząt, oboje pracujemy. Interesuje nas Mokotów lub Ochota, blisko metra, od listopada na dłużej.', 'PL', 'Warszawa', 3800, 'PLN', {}),
        ('marek_demo', 'jobs', 'worker', 'Szukam magazyniera od zaraz, umowa o pracę', 'Praca dwuzmianowa, szkolenie na wózki widłowe na nasz koszt, pomoc w zakwaterowaniu. Odpowiedz, jeśli szukasz stałej pracy.', 'PL', 'Łódź', 5200, 'PLN', {}),
        ('olena_demo', 'dating', 'partner', 'Шукаю людину для серйозних стосунків', 'Люблю гори, книжки та довгі прогулянки містом. Працюю дизайнеркою. Напишіть, якщо вам теж цікаво.', 'UA', 'Львів', None, None, {'age': 29, 'gender': 'f'}),
        ('marek_demo', 'auto', 'parts', 'Szukam zderzaka przedniego do Skody Octavii III', 'Potrzebny zderzak przedni w kolorze srebrnym, rocznik 2016, wersja przed liftem. Może być używany, bez pęknięć.', 'PL', 'Kraków', 600, 'PLN', {}),
        ('olena_demo', 'realty', 'buy', 'Куплю 1-кімнатну квартиру в новобудові', 'Розглядаю новобудови з ремонтом або під ремонт, до 45 м², не вище 10 поверху. Без посередників, готова до швидкої угоди.', 'UA', 'Київ', 60000, 'USD', {}),
        ('marek_demo', 'charity', 'furniture', 'Potrzebuję łóżka i szafy do pokoju', 'Urządzam pokój dla mamy po przeprowadzce. Chętnie przyjmę używane meble, odbiorę sam w weekend.', 'PL', 'Poznań', None, None, {}),
        ('taras_demo', 'jobs', 'job', 'Шукаю роботу електриком, досвід 8 років', 'Монтаж проводки, щитків, освітлення. Маю допуски та власний інструмент. Розгляну пропозиції в Україні та Польщі.', 'UA', 'Тернопіль', 35000, 'UAH', {}),
        ('olena_demo', 'auto', 'repair', 'Потрібен ремонт кондиціонера в авто', 'Не холодить кондиціонер у Hyundai Tucson 2017. Потрібна діагностика й заправка, бажано з гарантією. Можу приїхати в будній день.', 'UA', 'Львів', 3000, 'UAH', {}),
        ('marek_demo', 'dating', 'partner', 'Poznam kogoś do wspólnych wypadów rowerowych', 'Lubię rower, kino i dobrą kawę. Szukam osoby z poczuciem humoru, która nie boi się długich tras.', 'PL', 'Gdańsk', None, None, {'age': 34, 'gender': 'm'}),
        ('taras_demo', 'realty', 'garage', 'Орендую гараж або паркомісце біля центру', 'Потрібне місце для легкового авто на тривалий термін, бажано під охороною. Розгляну варіанти в радіусі 2 км від центру.', 'UA', 'Тернопіль', 1500, 'UAH', {}),
    ]
    for i, (username, cat, sub, title, description, country, city, price, currency, attrs) in enumerate(demo):
        ts = now() - (len(demo) - i) * 5400
        db.execute(
            "INSERT INTO requests(user_id, cat, sub, title, description, country, city, price, currency, attrs,"
            " search, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (users[username], cat, sub, title, description, country, city, price, currency, json.dumps(attrs),
             " ".join([title, description, city]).lower(), ts, ts))
    db.commit()
    db.close()
    print("Додано %d демо-запитів." % len(demo))


if __name__ == "__main__":
    init_db()
    if "--seed" in sys.argv:
        seed()
    mode = "ТЕСТОВИЙ вхід (без Telegram)" if DEV_LOGIN else "вхід через Telegram (@%s)" % BOT_USERNAME
    print("zapyt.biz працює: http://localhost:%d — %s; SMS: %s" % (
        PORT, mode, "ТЕСТОВИЙ режим (код на екрані)" if SMS_DEV else "Twilio"))
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
