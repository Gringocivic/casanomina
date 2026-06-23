# Accounts & Portals — Development Plan

**Status:** Approved direction, not yet started.
**Decisions locked in:**
- Auth provider: **Clerk** (email + phone OTP, sessions, role metadata).
- Worker–employer linking: **Bidirectional invite & claim.** Either side can originate an employment relationship and invite the other — an employer can invite a worker (as originally planned), *or* a worker can invite an employer they already work for. This matters for the project's growth strategy: workers often work for several employers and may be the ones bringing the app to an employer as a way of formalizing/protecting their own rights, not just the other way around.

This document breaks the work into phases. Each phase produces something runnable/testable before moving to the next. Phases 0–2 are foundational and block almost everything after them — do them in order. Phases 3–6 can be reordered or parallelized somewhat once the foundation is in.

---

## What we're building

Today, CasaNomina has no authentication at all — every request is silently attributed to a hardcoded `"dev-employer"` string, and any caller can read or modify any worker's data by guessing a UUID. There's one flat app with one sidebar showing everything.

The target shape:

- **Public area** (no login required): payroll calculator, a sample/demo contract, and the Laws & Rights section. Reachable by anyone, including search engines and people just evaluating the tool.
- **Employer portal** (login required, role = employer): dashboard, worker/employee list, worker profiles + contract download, run payroll, payment history, payslip download, calendar.
- **Worker portal** (login required, role = worker, new): a worker logs in once and sees *every employer they work for*, with payslip history and contract download per employment.

A single worker (a real person) can be employed by multiple employers. Critically, *either side can be the one who shows up first*: an employer might create a worker record before that worker has an account (original plan), or a worker might sign up first and add an employer they work for before that employer has ever heard of CasaNomina (the growth-driven case). The invite/claim flow has to work in both directions and reconcile down to the same underlying employment record either way.

---

## Phase 0 — Data model foundation

Nothing in later phases works without this. No user-facing change yet.

1. **Add an `employers` table.** Today `workers.employer_id` is a free-text field with a comment saying "Clerk user ID" but no actual table, no foreign key, no real account behind it. Add `employers (id uuid pk, clerk_user_id text unique, business_name text nullable, created_at)`. Backfill: existing `dev-employer` rows get a placeholder employer row so local dev data isn't orphaned.

2. **Add a `worker_accounts` table.** This is the worker's own identity, separate from any single employment: `worker_accounts (id uuid pk, clerk_user_id text unique, full_name text, phone text nullable, email text nullable, created_at)`.

3. **Make `workers.employer_id` nullable and link both sides via the existing `workers` table** (no separate join table needed). Because either party can originate the relationship now, neither account FK can be required at creation time. Add: `worker_account_id` (FK → worker_accounts.id, nullable), `initiated_by` (enum: `employer` | `worker`, not null — who created this record), `employment_status` (enum: `proposed` | `active` — `proposed` means only one side is linked; `active` means both are), `invite_contact` (phone or email of *the other party*, entered by whoever initiated), `invite_status` (enum: `not_invited` | `pending` | `claimed`), `invite_token`, `invited_at`. Application-level invariant (enforce in code, document clearly): at least one of `employer_id` / `worker_account_id` must always be set. A worker can have many `workers` rows (one per employer), all eventually pointing at the same `worker_account_id` — that's the multi-employer relationship.

4. **Gate payroll runs and contract generation on `employment_status = 'active'`.** Running real payroll or generating a contract off a one-sided, unconfirmed employment record is premature — both sides should be linked first. When a worker self-initiates and enters terms they believe apply (salary, schedule), mark those as self-reported in the UI; the employer reviews/edits them on claiming, at which point the record flips to `active`.

5. **Foreign-key `workers.employer_id`** to the new `employers.id` (it's currently a bare unconstrained text column — tighten it up while we're touching this table; just remember it's now nullable per #3).

6. **Handle the double-invite edge case at the data level.** If an employer invites a worker by phone, and separately that worker independently invites that same employer by the same phone/email before either claims, the claim logic needs to detect the matching reciprocal pending record (same contact info, opposite direction) and merge into one employment row rather than creating two dangling ones.

7. **Write the Drizzle migration**, update the seed script to create a placeholder employer for local dev, and confirm `npm run db:migrate && npm run db:seed` still works end to end on a fresh database.

---

## Phase 1 — Clerk integration

8. **Set up Clerk project(s).** Create the Clerk application (or two — one might eventually want separate "employer" and "worker" Clerk instances, but starting with one app and a role flag is simpler and recommended). Get publishable + secret keys into `.env.example` and document them in the README's Quick Start.

9. **Wrap the frontend in `<ClerkProvider>`** (`packages/web/src/main.tsx` or `App.tsx`), using the existing (currently unused) `@clerk/clerk-react` dependency.

10. **Build a role-selection step.** On first sign-up, Clerk doesn't know if someone is an employer or a worker. Add a short "I'm an employer" / "I'm a worker" choice screen immediately after signup that calls a new backend endpoint to create the matching `employers` or `worker_accounts` row and stamps `role` into the Clerk user's `publicMetadata`. Given the growth strategy, the worker option shouldn't read like an afterthought — treat both as equally primary entry points in the signup copy/UX.

11. **Add Clerk verification to the API.** Install `@clerk/backend` (or the Fastify-specific Clerk plugin if available) in `packages/api`. Replace the placeholder `getEmployerId(req)` function (currently `req.user?.sub ?? "dev-employer"`, used nowhere meaningfully) with real session verification that resolves to either an `employers` row or a `worker_accounts` row, attached to `req`.

12. **Remove the now-unused `@fastify/jwt` plugin** registration in `server.ts` (it was a placeholder for exactly this, per its own comment) once Clerk verification replaces it — or keep it only if some internal service-to-service call still needs it (unlikely).

---

## Phase 2 — API authorization hardening

This is the most security-sensitive phase. Right now nothing checks that the caller owns the data they're requesting.

13. **Workers/employment routes** (`routes/workers.ts`): every handler must verify the authenticated employer's id matches `workers.employer_id` *or* the authenticated worker's id matches `workers.worker_account_id` (whichever role is calling) before returning/modifying a row — not just trust the URL.

14. **Payroll routes** (`routes/payroll.ts`): `GET /api/payroll/:workerId` and the create/approve/mark-paid routes currently trust whatever ID is in the URL. Add an ownership check, and gate run-creation on `employment_status = 'active'` per Phase 0/#4.

15. **Documents routes** (`routes/documents.ts`): same gap — payslip/contract generation and download need an ownership check tying the requested worker/payroll-run back to the authenticated caller (employer or worker, whichever side is linked).

16. **Decide and document the public vs. protected route boundary** explicitly in `server.ts`: `calculate/*`, `holidays/*`, `content/*` (Laws & Rights) stay public; everything under `workers`, `payroll`, `documents` requires auth; a new sample-contract endpoint (Phase 3) is public but never touches real data.

---

## Phase 3 — Public area

17. **Public layout/shell.** A simple header/nav for unauthenticated visitors (logo, language toggle, "Log in" / "Sign up" buttons, links to Calculator / Sample Contract / Laws & Rights) — distinct from the employer sidebar (`components/ui/Layout.tsx`), which should only render for logged-in employers.

18. **Make the Payroll Calculator public.** `Calculators.tsx` already exists and only depends on `/api/calculate/*`, which is already unauthenticated. Move it to a public route outside the employer-only route group.

19. **Build a "sample contract" feature.** This needs to generate a contract PDF from fixed demo data (a fictional worker), not a real database record — add a public endpoint, e.g. `GET /api/documents/sample-contract`, that calls the existing `renderContractToBuffer` with hardcoded demo values instead of a DB lookup. Add a "View Sample Contract" button on the public area that hits it.

20. **Make Laws & Rights public.** `LawsAndRights.tsx` already only depends on `/api/content/*`, already unauthenticated — just move its route outside the employer-only group.

21. **Restructure `App.tsx` routing** into three explicit groups: public routes (no auth check), employer routes (wrapped in a route guard requiring role = employer), worker routes (guard requiring role = worker). Logged-out users hitting an employer/worker URL get redirected to login; logged-in users of the wrong role get redirected to their own portal.

---

## Phase 4 — Employer portal (adapt what exists + fill the real gaps)

22. **Gate the existing employer pages** (Dashboard, Workers, WorkerProfile, Payroll, Calendar) behind the employer route guard from Phase 3/#21, and replace every remaining `getEmployerId` placeholder call-site with the real authenticated employer id from Phase 1/#11.

23. **Build a real Payment History view.** The backend (`GET /api/payroll/:workerId`) already returns all past runs for a worker, but no frontend page lists them — today you only ever see the single run you just created. Add a history list (per worker, and/or an all-workers view) with status (draft/approved/paid) and a payslip-download link per row.

24. **Add the "invite worker" step to worker creation.** When an employer fills out `WorkerProfile.tsx` for a new worker, add phone/email fields for the invite, and a "Send Invite" action that generates the `invite_token` and delivers the claim link. Show invite/employment status (proposed / pending / active) on the worker's profile and in the Workers list.

25. **Build the employer-side "respond to a worker's invite" entry point.** Since a worker can now invite an employer first, an employer signing up via that kind of invite link needs to land on a screen showing the proposed employment terms (entered by the worker) with the ability to edit them before confirming — this is the mirror image of #24, and shares the claim-screen work in Phase 5.

---

## Phase 5 — Invite & claim flow (bidirectional)

26. **Backend claim endpoint, generalized for either direction.** `POST /api/employments/claim` (authenticated as either an employer or a worker account): given an `invite_token`, find the matching `workers` row, verify it's still `pending`, link the caller's account to whichever side is still null, and flip `employment_status` to `active`. The same endpoint serves both "worker claims an employer-initiated invite" and "employer claims a worker-initiated invite" — the only difference is which account type is making the call.

27. **Frontend claim screen, shared by both roles.** After signing up or logging in via an invite link (`/claim/:token`), show the proposed employment details (whoever's data is already filled in) with an edit option for the claiming side, then a confirm button that calls the claim endpoint and routes into the appropriate portal.

28. **"Add an employer" flow on the worker side**, mirroring #24 on the employer side: a worker can create a `workers` row with `initiated_by = 'worker'`, self-report the terms they believe apply, enter the employer's phone/email, and send the invite.

29. **Implement the double-invite de-duplication** designed in Phase 0/#6: when sending an invite, check for a matching reciprocal pending record by contact info and link directly instead of creating a duplicate.

30. **Handle "already has an account" and "invite expired/invalid" edge cases** explicitly in the UI rather than letting them surface as raw API errors, for both directions.

---

## Phase 6 — Worker portal (new)

31. **Worker Dashboard.** Lists every `workers` row where `worker_account_id` = the authenticated worker — i.e., every employer they work for, regardless of who initiated the relationship — with status (proposed/active) and basic info per employment.

32. **"Add an employer" action**, surfacing the Phase 5/#28 flow directly from the worker dashboard — this is the worker-side equivalent of "Add Worker" on the employer side, and is a primary entry point given the growth strategy, not a secondary feature.

33. **Per-employment payslip history.** Reuse the same payroll-history list UI pattern from Phase 4/#23, scoped to read-only for the worker's own active employments, with download links.

34. **Per-employment contract download.** Reuse the existing contract download flow, scoped to the worker's own active employments.

35. **Worker-side language/profile settings** if needed (likely just reuse the existing `useLanguage` hook — no new work, just confirm it's available in the worker portal's layout too).

---

## Phase 7 — Polish & hardening

36. **Write integration tests for authorization boundaries** specifically — i.e., confirm employer A cannot fetch employer B's workers/payroll/documents, a worker cannot fetch another worker's employment data, and a `proposed` (unconfirmed) employment cannot be used to run payroll or generate a real contract.

37. **Update `README.md` and `ROADMAP.md`** to reflect the new account model, Clerk setup steps (including the publishable/secret key env vars), and move "Clerk authentication with multi-employer support" from the v1.0 wishlist to "done."

38. **Update `docs/CALCULATIONS.md` or add a new `docs/ACCOUNTS.md`** documenting the data model (employers / worker_accounts / the bidirectional invite-claim relationship) for future contributors, since this is exactly the kind of design decision that's confusing to reverse-engineer from schema alone later.

---

## Suggested order of attack

Phase 0 → Phase 1 → Phase 2 → (Phase 3 and Phase 4 can run in parallel, they don't depend on each other) → Phase 5 → Phase 6 → Phase 7.

Realistically, Phases 0–2 are the unglamorous but mandatory foundation — nothing else is safe to build until the data model and real authorization exist, since right now the API has zero ownership checks on any route.
