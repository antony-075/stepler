# ADR 0019 — E-mail + Password Authentication

Status: Accepted (supersedes the magic-link part of ADR 0006)
Date: 2026-10-16

## Context

The owner replaced the magic-link sign-in with e-mail + password, keeping Google:

- the address must be confirmed at registration;
- the password is typed twice;
- the policy: at least 8 characters, an uppercase letter, a lowercase letter, a digit and a special character;
- an animated strength meter says what is still missing.

E-mailed links stay, but only for confirming the address and resetting the password.

Sessions, CSRF, `AuthAccount` linking, Turnstile (ADR 0012), legal acceptance (ADR 0016) and the trial start (ADR 0018 [B7]) stay as they are.

## Decision

### Hashing

- Passwords are hashed with **Argon2id** (`@node-rs/argon2`) at m = 19 MiB, t = 2, p = 1, the OWASP minimum.
- The PHC string goes to `PasswordCredential(userId PK, passwordHash)`. A CHECK constraint (`LIKE '$argon2id$%'`) keeps anything else out.
- The policy is shared in `@stepler/contracts`: `passwordChecks`, `PASSWORD_RULES`, max 128 characters and no control characters.
  - Letters and digits are Unicode-aware (`\p{Lu}`, `\p{Ll}`, `\p{Nd}`).
  - "Special" means anything that is not a letter, a digit or whitespace.
  - The API validates the policy; the browser only mirrors it for the meter.

### Mailed tokens

- `AuthEmailToken` has two purposes, `VERIFY_EMAIL` (24 h) and `RESET_PASSWORD` (60 min).
- A token is 32 random bytes, and only its SHA-256 is stored.
- It is used up by one conditional `UPDATE … RETURNING`, so two concurrent uses yield one success.
- Issuing a token retires the account's unused tokens of the same purpose: only the newest mail works.

### Registration

`POST /auth/register` takes the e-mail, password, Turnstile token, locale and legal versions. It always returns `202 {status:"sent"}`, so it reveals nothing about the address.

| The address belongs to… | What happens |
|---|---|
| nobody | The account is created unverified, the legal acceptance is recorded, and the confirmation mail is sent. |
| an **unverified** account | Its password is replaced and a new confirmation is mailed. The mailbox was never proven, so the earlier password protects nothing. |
| a **verified** account | Nothing changes. A notice «you already have an account» goes to the mailbox (at most hourly) with a link to sign in, where «Забули пароль?» is. |
| a **blocked** account | The blocked notice goes out (slice 9). |

### Confirmation

- `/auth/verify?token=` first previews the token (read-only; scanners prefetch links).
- Then «Підтвердити пошту» calls `POST /auth/verification/confirm`. This sets `emailVerifiedAt`, starts the trial and signs in.
- An unverified account cannot sign in. With the right password, `POST /auth/login` answers `403 EMAIL_NOT_VERIFIED`, and the card offers «Надіслати лист ще раз». A wrong password still gets the generic 401.

### Sign-in and enumeration

- An unknown address and a wrong password both get **`401 INVALID_CREDENTIALS`** with the same body.
- Both cost the same Argon2 work: unknown addresses verify against a dummy hash.
- Forgot-password and resend always return `202`.

### Limits and lockout

| Limit | Default | Notes |
|---|---|---|
| Login attempts per IP | 60 / hour | |
| Failures per address + IP | 10 / 15 min | |
| Failures per address | 30 / hour | |
| Mails per address | 5 / hour | from token rows |
| Mails per IP | 20 / hour | after Turnstile |
| Token checks per IP | 60 / hour | |

- The two failure windows are in-memory (single instance, as the throttler; ADR 0014). Reaching either answers `429` even for the right password, and success clears the address + IP window.
- There is no permanent lockout: an attacker could otherwise lock any victim out. The per-address + IP window stops guessing from one place. The per-address cap bounds distributed guessing without locking the owner out for long.

### Reset

- `POST /auth/password/forgot` mails a single-use link to any account, including Google-only ones. This is how they set a first password.
- `POST /auth/password/reset` sets the password and confirms the address (the mailbox was just proven).
- It also **ends every session** and signs in afresh.

### Change

- `POST /auth/password` (signed in) requires the current password; wrong current passwords are limited per user (a 15-minute window). It ends every other session and keeps this one.
- An account without a password gets `400 CURRENT_PASSWORD_INVALID` and is pointed to the reset mail. A stolen session alone therefore cannot attach a password.

### Google

- Linking still needs Google's verified e-mail.
- Linking to an **unverified** password account deletes that account's unproven password and marks the address confirmed. Someone who pre-registered a victim's address cannot keep a way in.
- The Google button on `/login` no longer carries legal versions. A new account created that way meets `/accept-terms` (ADR 0016's fallback). The button on `/register` carries them as before.

### Audit

`account.register`, `account.email_verify`, `account.password_reset` and `account.password_change` are audit entries. They never contain the password or the token.

### Data migration

- `MagicLinkToken` is dropped; its links were short-lived.
- Existing accounts have no password. They sign in with Google, or set a password through «Забули пароль?».

## Alternatives considered

- **Keep the magic link as a third method.** The owner chose password + Google. Fewer paths also mean fewer flows to secure and test.
- **bcrypt.** It truncates at 72 bytes and is not memory-hard. Argon2id is OWASP's first choice.
- **`argon2` (node-gyp) instead of `@node-rs/argon2`.** The node-gyp package needs a toolchain at install. `@node-rs/argon2` ships napi prebuilt binaries, Linux x64 glibc included (Render), and is maintained.
- **Permanent lockout after N failures.** It lets anyone lock out any account; the rolling windows above do not.
- **Sign in before the address is confirmed.** It is simpler, but the owner requires confirmation, and an unconfirmed account would hold an unproven address.
- **zxcvbn-style entropy scoring.** It needs a large dependency and gives a different answer from the stated rules. The meter counts the five rules instead.

## Consequences

- Credential stuffing becomes a threat; the rate limits and Turnstile on mail endpoints mitigate it.
- The in-memory failure windows reset on deploy and are per instance. A second API instance needs a shared store (ADR 0014 revisit trigger). *2026-10-22:* the windows are in PostgreSQL now, shared and kept across deploys (ADR 0021).
- The verification mail is on the sign-up path: mail deliverability now gates registration.
- Existing magic-link users must take one extra step (Google or reset) on their first password sign-in.
