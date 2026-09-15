# Emdad Phone API — softphone update

Use this document to update the softphone client after **operator was removed**. Identity is now **User + Member**. Reservations and occupancy are keyed by **national code**, not operator id.

Base path (Laravel `api` middleware, JSON, no CSRF):

```
{APP_URL}/ecrc/api/emdad-phone
```

Example: `https://example.com/ecrc/api/emdad-phone/login`

| Method | Path | Name |
| --- | --- | --- |
| `GET` | `/server-time` | Clock probe (no auth) |
| `POST` | `/login` | Password login |
| `POST` | `/shift-info` | Today’s shift by national code |
| `POST` | `/extensions/reserve` | Reserve an extension |
| `GET` | `/extensions/status` | Free/used list for a province |
| `POST` | `/logout-extension` | Release a reservation |

Send `Accept: application/json` and `Content-Type: application/json` on POST bodies.

These six routes are **public**. Login still issues a Sanctum Bearer token (`data.token`). The other routes do **not** require `Authorization` today. Do not send a CSRF cookie.

National codes are **10-digit strings**. Keep leading zeros (`"0012345678"`, not `12345678`).

---

## Breaking changes (must update)

| Old client assumption | Current API |
| --- | --- |
| `data.operator` / `operator_id` | **Removed.** Use `data.member` for the person and `data.user` for the login account. |
| Reserve / logout / occupancy keyed by `operator_id` | Keyed by `national_code` (10 digits). |
| Status row `operator_id` | Status row `national_code` (`null` when free). |
| Login success nested shifts at `data.data` | Today’s shift items are `data.shifts`. Current shift summary is `data.shift`. |
| Login `data.user` was the shift payload | `data.user` is the SSO user. Shift fields live under `data.shift`. |

**Stable id for telephony:** `data.member.national_code` (same value as `data.shift.nationalCode` when present).

**Do not send:** `operator`, `operator_id`, or `member_id` on reserve / logout / shift-info.

---

## 1. `GET /server-time`

Trusted `Asia/Tehran` clock. Call this before login if the client compares local time to shift windows.

**200**

```json
{
  "status": "success",
  "data": {
    "datetime": "2026-09-15T10:30:00+03:30",
    "timezone": "Asia/Tehran",
    "unix": 1757918400,
    "epoch_ms": 1757918400000
  }
}
```

`epoch_ms` is `unix * 1000` (seconds precision).

---

## 2. `POST /login`

Envelope is **not** `{ status: success|error }`. Success uses `result: 1`. Failures use `result: -1` plus `error` / `error_code`.

### Request

```json
{
  "username": "0012345678",
  "password": "secret"
}
```

`username` is email **or** username (often the national code).

### Success — `200`

```json
{
  "result": 1,
  "message": "ورود با موفقیت انجام شد.",
  "data": {
    "token": "1|xxxxxxxx",
    "token_type": "Bearer",
    "user": {
      "id": 1,
      "name": "مهدی احمدی",
      "username": "0012345678",
      "email": "user@example.com",
      "mobile": "09120000000",
      "avatar_url": "https://..."
    },
    "member": {
      "id": 10,
      "national_code": "0012345678",
      "full_name": "مهدی احمدی",
      "relief_level": "...",
      "avatar_url": "https://..."
    },
    "shift": {
      "has_shift": true,
      "hasShift": true,
      "nationalCode": "0012345678",
      "firstName": "مهدی",
      "lastName": "احمدی",
      "imageUrl": "https://...",
      "shiftHour": "08:00-16:00",
      "startDateTime": "2026-09-15 08:00",
      "endDateTime": "2026-09-15 16:00",
      "province_id": 21,
      "province_title": "...",
      "branch_id": 1,
      "branch_title": "...",
      "shift_slot_rule": 1,
      "order_shift": 1
    },
    "shift_access": {
      "allowed": true,
      "isWithinShift": true,
      "reason": "...",
      "shiftStart": "2026-09-15 08:00:00",
      "shiftEnd": "2026-09-15 16:00:00"
    },
    "has_shift": true,
    "shifts": [],
    "post_titles": {}
  }
}
```

Client mapping after login:

1. Store `data.member.national_code` — use it on shift-info, reserve, logout.
2. Store `data.shift.province_id` (when present) — use it on reserve / status.
3. Store `data.token` if you persist a session.
4. Treat `data.has_shift === false` as **allowed login with no assigned shift** (`shift_access.reason` is typically `User has no assigned shift.`).

`data.shift` null fields are omitted. `shifts` is today’s shift-item list (may be empty). Extra keys from the shift service (`member_id`, `post_title`, `shift_time`, …) may appear on `shift` / `shifts[]`.

### Errors

Laravel validation (missing `username` / `password`) is standard `{ "message", "errors": { ... } }` with **422**.

Business errors:

| HTTP | `error_code` | Meaning |
| --- | --- | --- |
| 429 | `RATE_LIMITED` | Too many failed attempts; `error` is the lock reason. |
| 422 | `INVALID_CREDENTIALS` | Wrong username/password. |
| 422 | `MEMBER_NOT_FOUND` | Account has no relief member profile. |
| 422 | `SHIFT_LOOKUP_FAILED` | Could not load today’s shift. |
| 403 | `OUTSIDE_SHIFT_HOURS` | Member has a shift but is outside the window. **No token.** |

**403 body** (no `token`):

```json
{
  "result": -1,
  "error": "You are outside your assigned shift hours.",
  "error_code": "OUTSIDE_SHIFT_HOURS",
  "data": {
    "user": { "id": 1, "username": "0012345678", "name": "...", "email": null, "mobile": null, "avatar_url": null },
    "member": { "id": 10, "national_code": "0012345678", "full_name": "...", "relief_level": "...", "avatar_url": "..." },
    "shift": { "nationalCode": "0012345678", "has_shift": true, "shift_slot_rule": 1, "order_shift": 1 },
    "shift_access": {
      "allowed": false,
      "isWithinShift": false,
      "reason": "You are outside your assigned shift hours.",
      "shiftStart": "2026-09-15 08:00:00",
      "shiftEnd": "2026-09-15 16:00:00"
    }
  }
}
```

Other business failures look like:

```json
{
  "result": -1,
  "error": "نام کاربری یا رمز عبور اشتباه است.",
  "error_code": "INVALID_CREDENTIALS"
}
```

---

## 3. `POST /shift-info`

Envelope: `{ status, data }` (not login’s `result`).

### Request

```json
{
  "national_code": "0012345678"
}
```

Must be exactly 10 characters.

### Success — `200`

```json
{
  "status": "success",
  "data": {
    "result": 1,
    "has_shift": true,
    "user": {
      "nationalCode": "0012345678",
      "firstName": "مهدی",
      "lastName": "احمدی"
    },
    "data": [
      { "post_title": "اپراتور 112" }
    ],
    "post_titles": { "1": "اپراتور 112" }
  }
}
```

Here `data.user` is the **shift member summary** (same shape as login `data.shift`), not the SSO user. Inner `data.data` is the shift-item list.

### Errors

- Validation (not 10 digits): Laravel `{ message, errors.national_code }` — **422**
- Member missing / lookup failure:

```json
{
  "status": "error",
  "message": "عضو با این کدملی یافت نشد",
  "data": {
    "result": -1,
    "error": "عضو با این کدملی یافت نشد"
  }
}
```

---

## 4. `POST /extensions/reserve`

One **active** reservation per national code. One occupier per province + extension.

### Request

```json
{
  "province_id": 21,
  "national_code": "0012345678",
  "extension": "200"
}
```

### Success — `200`

```json
{
  "status": "success",
  "message": "داخلی با موفقیت ثبت شد",
  "data": {
    "reservation_id": 15,
    "province_id": 21,
    "extension": "200",
    "national_code": "0012345678",
    "reserved_at": "2026-09-15 10:30:00",
    "ip": "10.20.30.40",
    "username": "user200",
    "password": "pass200"
  }
}
```

Use `ip` / `username` / `password` to register on the province SIP server. If the extension has no stored SIP user, `username` falls back to the extension number and `password` may be `null`.

### Business errors — `422`

```json
{
  "status": "error",
  "message": "این داخلی قبلاً ثبت شده و آزاد نیست"
}
```

| `message` | Cause |
| --- | --- |
| `برای این استان داخلی تعریف نشده است` | No extensions configured for `province_id`. |
| `این داخلی برای استان انتخاب‌شده تعریف نشده است` | Unknown extension. |
| `این داخلی قبلاً ثبت شده و آزاد نیست` | Extension already reserved. |
| `این کدملی قبلاً یک داخلی فعال دارد` | This national code already holds an active extension. |
| `خطا در ثبت داخلی` | Server/transaction failure. |

Validation failures (missing/invalid fields) use Laravel `{ message, errors }`.

---

## 5. `GET /extensions/status?province_id=21`

`province_id` is required (query string).

### Success — `200`

```json
{
  "status": "success",
  "data": [
    { "extension": "200", "status": "free", "national_code": null },
    { "extension": "201", "status": "used", "national_code": "0012345678" },
    { "extension": "202", "status": "free", "national_code": null }
  ]
}
```

`status` is only `free` or `used`. Occupied rows expose the holder’s **national code**, not an operator id.

### Error — `422`

No extensions for that province:

```json
{
  "status": "error",
  "message": "برای این استان داخلی تعریف نشده است",
  "data": []
}
```

---

## 6. `POST /logout-extension`

### Request

```json
{
  "national_code": "0012345678",
  "extension": "200",
  "province_id": 21
}
```

`province_id` is optional. If sent, it must match the active reservation.

### Success — `200`

```json
{
  "status": "success",
  "message": "داخلی با موفقیت آزاد شد",
  "data": {
    "reservation_id": 15,
    "province_id": 21,
    "extension": "200",
    "national_code": "0012345678",
    "released_at": "2026-09-15 18:00:00"
  }
}
```

### Error — `422`

```json
{
  "status": "error",
  "message": "رزرو فعالی برای این کدملی و داخلی یافت نشد"
}
```

---

## Suggested client flow

1. `GET /server-time` — align clock.
2. `POST /login` — if `result === 1`, keep `member.national_code`, `shift.province_id`, token.
3. `GET /extensions/status?province_id=` — pick a `free` extension.
4. `POST /extensions/reserve` — SIP connect with returned `ip` / `username` / `password`.
5. On hang-up / app close: `POST /logout-extension` with the same `national_code` + `extension`.

If login returns `OUTSIDE_SHIFT_HOURS`, show `data.shift_access.shiftStart` / `shiftEnd` and do not reserve an extension.

---

## Two JSON envelopes

Do not parse login with the same helper as the other five routes.

| Surface | Success | Failure |
| --- | --- | --- |
| Login | `{ result: 1, message, data }` | `{ result: -1, error, error_code, data? }` |
| Time / shift / extensions | `{ status: "success", data, message? }` | `{ status: "error", message, data? }` HTTP 422 |

Laravel field validation (any route) may still return `{ "message": "...", "errors": { "field": ["..."] } }` with HTTP 422.
