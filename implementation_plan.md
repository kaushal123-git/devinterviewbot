# Two Fixes: Submit Guard + Password Auth

## Overview
Fix two issues:
1. **Submit bug** – "Submit Code" marks a problem as solved even when code hasn't been run
2. **Auth overhaul** – Replace OTP-only login with email + password, with persistent sessions (no re-login every time)

---

## Fix 1: Submit Code Guard

### Problem
`handleSubmit` in `CodeEditor.tsx` calls `onSubmitCode()` unconditionally — no check that the code was ever run or that output was successful.

### Fix
- Track a `hasRunSuccessfully` boolean in `CodeEditor` state
- Set it `true` only when `runCode()` returns `exitCode === 0` with non-empty stdout or no stderr
- Gate the **Submit Code** button: disabled + tooltip "Run your code first" until `hasRunSuccessfully` is true
- Reset `hasRunSuccessfully` to `false` whenever the code changes (so editing after a successful run forces re-run)

### Files Changed
#### [MODIFY] [CodeEditor.tsx](file:///c:/Users/Kaushal%20Dubey/Documents/ip_website/devinterviewbot/components/CodeEditor.tsx)

---

## Fix 2: Password-based Auth with Persistent Sessions

### Design
- **Registration**: First time a user enters email → prompt for a password → hash it with bcrypt and store in `users.json`
- **Login**: Email + password → verify hash → return user + session token
- **Session token**: A random UUID stored in `localStorage` as `devinterview-session-token`. On page load, validate the token with the server to auto-login
- **No OTP needed** for normal login (keep OTP endpoints for recovery only, or remove entirely)

### New Login Flow (LoginModal)
- **Step 1**: Enter email → "Continue"
- **Step 2a (New User)**: Set a password → "Create Account"
- **Step 2b (Returning User)**: Enter password → "Sign In"
- "Remember me" is automatic via session token in localStorage

### Backend Changes (server.js)
- Install `bcryptjs` (pure JS, no native binding needed on Windows)
- Add `sessionTokens` Map in memory (or persist to `sessions.json`)
- New endpoints:
  - `POST /api/auth/check-email` → returns `{ exists: bool }` so frontend can show register vs login form
  - `POST /api/auth/register` → hash password, create user, return session token + user
  - `POST /api/auth/login` → verify password hash, return session token + user
  - `POST /api/auth/validate-token` → validate session token, return user (for auto-login on page load)
  - `POST /api/auth/logout` → invalidate session token

### Updated App.tsx
- On mount: check `localStorage` for `devinterview-session-token`, call `/api/auth/validate-token` to auto-login
- On logout: call `/api/auth/logout`, clear localStorage

### Files Changed
#### [MODIFY] [server.js](file:///c:/Users/Kaushal%20Dubey/Documents/ip_website/devinterviewbot/server.js)
#### [MODIFY] [components/LoginModal.tsx](file:///c:/Users/Kaushal%20Dubey/Documents/ip_website/devinterviewbot/components/LoginModal.tsx)
#### [MODIFY] [App.tsx](file:///c:/Users/Kaushal%20Dubey/Documents/ip_website/devinterviewbot/App.tsx)

---

## Verification Plan
1. Run code → green output → Submit button becomes clickable → click → XP added ✅
2. Without running → Submit button is disabled / shows tooltip ✅
3. Login with new email + password → account created → page remembers user on refresh ✅
4. Login with existing email + password → session restored ✅
5. Wrong password → error shown ✅
6. Logout → token cleared → next visit shows login button ✅
