# Committee Manager — Mobile App Plan

Related documents: [setup](./README.md), [data model](./ERD.md), and [deployment](./DEPLOYMENT.md).

## Goal

Build an Android-first mobile app for managing Pakistani committee savings groups, with Urdu and English support. One organizer can manage multiple committees. Each committee uses fixed numbering or lucky draws to determine payout turns.

The app records contributions and payouts; the first release does not move money through banks or wallets. Keep the React Native code compatible with iOS, with iOS release validation scheduled separately.

## Technology

| Area | Choice |
| --- | --- |
| Mobile application | React Native, Expo, TypeScript |
| Navigation | Expo Router |
| Translation | i18next, react-i18next, expo-localization |
| Urdu font | Bundled Urdu font through expo-font; validate the font on devices before committing to it |
| Backend API | Node.js, AdonisJS, TypeScript; one REST API |
| Database | Self-hosted PostgreSQL with Lucid ORM and TypeScript schema-builder migrations |
| Authentication | AdonisJS Auth access tokens; secure device token storage |
| File storage | Private persistent upload volume, accessed through authorized API routes |
| Backend rules | AdonisJS actions using Lucid transactions, PostgreSQL row locks, and constraints |
| Hosting | Paid VPS running Docker Compose: API, PostgreSQL, and Caddy |
| Mobile builds | Expo EAS Build |
| Verification | Focused domain tests, database integration tests, and Android device checks |

The mobile app calls the API over HTTPS; it never connects directly to PostgreSQL. Keep one AdonisJS backend using Lucid models and its query builder. Write versioned TypeScript migrations with the schema builder; reserve raw SQL for specialized database features.

### Hosting and operations

- Run the API and PostgreSQL on a paid VPS with persistent database and upload volumes. Do not configure inactivity suspension.
- Use Caddy as the public HTTPS reverse proxy. Keep database and API container ports private to the Docker network; only Caddy is public, alongside restricted administrative access.
- Store production secrets outside source control. Run migrations explicitly as a deployment step with a separate database role; restrict the runtime role's permissions.
- Use AdonisJS Auth and its hashing service for passwords and access tokens rather than implementing cryptography. Configure identity verification, recovery, rate limits, and token expiration and revocation before production.
- Keep financial history append-only for the runtime role; corrections create reversal entries. Authorization checks run inside backend actions, including reads, file access, and transaction writes.
- Schedule encrypted off-server backups of PostgreSQL and receipt files. Alert on backup failures and test restoration before the pilot; persistent volumes alone are not backups.
- Add health checks, automatic process restart, disk-space monitoring, and error alerts. Maintain separate development and production data.
- A single VPS is the initial deployment limit: it is a single point of failure. Add failover only when measured availability needs justify it.

References: [AdonisJS access tokens](https://docs.adonisjs.com/guides/auth/access-tokens-guard), [Lucid migrations](https://lucid.adonisjs.com/docs/migrations), and [Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https).

## Users and access

- **Organizer:** Creates committees, manages members and shares, verifies contributions, runs draws, records payouts, and exports statements.
- **Member:** Sees their own participation, obligations, payment history, and payout status across committees.
- Organizers sign up independently; signup creates their organization and `organizer` membership together. Members register a user login and accept an invitation to create a `member` membership. Pending invitations exist before registration; there is no separate members/contact table or staff-access table.
- Organizations have one `owner_id`. Roles belong to `organization_members`, not `users`. The same login can organize one organization and participate in others.
- Use username or phone plus password for both organizer and member logins. Store Pakistani `03...` numbers as `+923...`; accept international E.164 numbers. Usernames are case-sensitive. Email and SMS OTP are not required in this release.
- Authenticate and authorize every backend action. Scope queries to the user's permitted organization/member records, validate resource ownership, and authorize private file downloads. Never ship database or server credentials in the mobile app.

## Core model and rules

### Committees and shares

- Each committee has its own members, contribution schedule, payout order or draw history, and financial records.
- A share is one contribution obligation and one payout entitlement. A person may hold several shares and participate in several committees.
- The initial model supports whole shares only. Fractional shares and joint ownership are deferred until their rules are agreed.
- For the initial fixed-contribution model, N shares produce N rounds. Every share contributes the same amount each round and receives one payout over the cycle.
- Expected payout per round equals contribution per share multiplied by share count. Show actual collections and any shortfall separately.
- Receiving a payout does not end future contribution obligations.
- Lifecycle: draft → active → completed, with a separate cancelled state and an archive action.
- Allow setup edits in draft. Lock share count, contribution amount, frequency, and selection type after activation.
- Do not silently transfer funds between committees.

### Schedule and money

- Initially support weekly and monthly installments, with explicit due dates and a preview before activation.
- For monthly schedules anchored to the 29th–31st, use the last available day in shorter months and return to the original anchor in later months.
- Use Asia/Karachi for committee due dates. Store audit timestamps in UTC and payment dates separately from entry timestamps.
- Store PKR amounts as integer paisa, with positive-amount validation and safe numeric bounds. Do not calculate balances using floating-point currency values.
- Derive balances from payment allocations, payouts, and linked reversals rather than editable balance fields.

## Functional scope

### 1. Committee setup

- Name, contribution per share, share count, weekly/monthly schedule, first due date, and selection type.
- Add members and allocate their shares.
- Preview installments, total contribution obligation, expected payout, and duration.
- Require complete setup before activation.

### 2. Fixed numbering

- Assign each share a unique payout round before activation.
- Show the complete payout schedule.
- Allow an organizer to swap two unpaid-out turns with a recorded reason and confirmation.
- Preserve previous assignments. Never reassign a completed payout.

### 3. Lucky draws

- Select from shares that have not already won, using the committee's declared overdue-payment eligibility rule.
- Support an app draw and recording an in-person draw. Clearly identify which method produced the result.
- Run app selection on trusted backend infrastructure using secure randomness.
- Check eligibility and persist the result in one transaction. Concurrent requests must return the existing result or a clear conflict, never create two winners.
- Record the eligible-share snapshot, round, selected share, method, actor, and timestamp.
- Persist a confirmed result through refreshes and retries. Do not expose a casual reroll button.
- If one eligible share remains, assign it and record that it was automatic. If none qualify, explain the blocking condition.
- Initially, require an offline support process for a mistaken confirmed draw rather than providing arbitrary in-app result editing.

### 4. Contributions

- Record full, partial, and advance payments, with payment date, method, optional reference, and optional proof.
- Explicitly allocate amounts to shares and installments. Offer oldest outstanding installment first as the default, with a visible allocation preview.
- Keep overpayments as identifiable credit or record an explicit refund; do not change the contribution requirement.
- Member-uploaded proof stays pending until an organizer verifies it. Pending proof does not count as collected money.
- Prevent duplicate submissions using request identifiers and database constraints. Flag matching references for review without rejecting legitimate equal amounts.
- Correct verified records using linked reversals and replacement entries, with a required reason.

### 5. Payouts and shortfalls

- Keep scheduled/selected recipient, amount owed, and actual disbursement separate.
- Record full or partial payouts, payment date, method, reference, and acknowledgment status.
- Show shortfalls and remaining payout obligations explicitly.
- If an organizer covers a shortfall, record an organizer advance separately from member contributions, including repayments.
- Never mark a payout complete solely because a draw was completed.

### 6. Dashboard and member statements

- Combined organizer view of active committees, upcoming dues, overdue amounts, upcoming payouts, and cash held.
- Per-committee view of expected collections, verified collections, arrears, disbursements, and advances.
- Member view across their shares and committees, restricted to their own financial information.
- Shareable Urdu/English statements and receipts, plus CSV export for organizer records.
- Do not expose other members' payment details by default.

### 7. Reminders

- First release: a WhatsApp share action with a prepared Urdu or English message. The organizer reviews and sends it.
- Cover upcoming, due-today, and overdue installments. Payment confirmations are receipts rather than collection reminders.
- Include committee name, due date, and remaining amount. Exclude settled installments and reflect partial payments.
- Opening WhatsApp is not proof of delivery. Do not label a reminder delivered without delivery evidence.
- Add optional push notifications after member accounts are available. Automated WhatsApp and SMS are deferred.

### 8. Records, recovery, and closure

- Preserve actor, timestamp, and reason for financial corrections, turn swaps, and membership transfers.
- Restrict direct edits/deletes to financial history through database permissions and controlled write functions.
- Configure backups before using real financial records and test a restoration. Include receipt files as well as database records.
- Completion requires every share's payout and all remaining balances to be settled or explicitly resolved with a reason.
- For cancellation, show collections, payouts, advances, credits, and remaining obligations before recording a reviewed settlement. Do not invent automatic refund rules.

## Urdu and mobile experience

- Offer Urdu and English at onboarding and in settings, retaining the user's selection.
- Translate screens, validation errors, receipts, statements, and reminder messages.
- Implement right-to-left layout deliberately, including navigation, icons, forms, and accessibility labels.
- Keep phone numbers, transaction references, and mixed-language amounts readable without reversing their contents.
- Test Urdu shaping, line height, clipping, larger text sizes, and exported documents on physical Android devices.
- Bundle fonts for reliable rendering without a network connection.
- Start with online financial writes. Show clear connection and retry states, preserve unsent form input where practical, and never show an unconfirmed write as successful.
- Do not persist sensitive statements or proof images in an offline cache by default. Handle logout and account changes safely.

## Edge cases and required behavior

| Case | Expected behavior |
| --- | --- |
| Member holds several shares | Separate obligations and payout eligibility for each share |
| Member belongs to several committees | Separate balances and clearly named reminders |
| Member receives payout then stops paying | Remaining installments stay due and become overdue normally |
| Partial or advance contribution | Preserve exact allocations and remaining amounts |
| Screenshot submitted twice | Pending proof never creates two verified payments |
| Repeated tap or network retry | One financial operation is committed |
| Two devices submit actions simultaneously | Database constraints and transactions preserve one valid outcome |
| Payment reversed after a draw | Preserve the historical eligibility snapshot and draw result; show resulting arrears |
| Member leaves or is replaced | No deletion of obligations or history; use an explicit transfer or settlement |
| Share transfer after payout | Require acknowledgment of remaining obligations and retain the original payout recipient |
| Payout exceeds cash held | Require an explicit funding source such as an organizer advance |
| No eligible draw shares | Stop the draw and explain the eligibility rule causing it |
| App closes during a draw or payout | Reload the stored operation; retry without repeating it |
| Month has no configured due-day number | Apply the documented month-end rule |
| Committee closes with unsettled balances | Block completion until settled or explicitly resolved |
| Unauthorized committee ID or file URL is supplied | Deny access in API authorization and resource ownership checks |

## Delivery phases

### Phase 1 — Foundation and Urdu prototype

- Scaffold Expo/TypeScript, navigation, AdonisJS API, Lucid TypeScript migrations, token authentication, and authorization checks.
- Prepare Docker Compose for local development and the VPS deployment, with private database networking and persistent volumes.
- Prototype Urdu/English screens with realistic names, amounts, and dates.
- Validate font rendering and direction switching on a physical Android device before building all screens.

**Done when:** An organizer can sign in, switch language, and access only their own test data.

### Phase 2 — Setup and scheduling

- Implement multiple committees, members, whole shares, schedule previews, and activation rules.
- Implement fixed numbering and unpaid-turn swaps.

**Done when:** Two committees with overlapping members remain independent, and invalid or incomplete schedules cannot activate.

### Phase 3 — Financial records

- Implement contributions, installment allocations, proof verification, credits/refunds, corrections, payouts, and organizer advances.
- Add committee balances, organizer dashboard, and audit history.

**Done when:** A complete sample committee reconciles from first contribution to final payout, including partial payments, a reversal, and a shortfall.

### Phase 4 — Lucky draws

- Implement eligibility rules, trusted selection, in-person result recording, immutable result history, and concurrency protection.

**Done when:** Concurrent and retried requests cannot produce duplicate winners, and a multi-share member retains eligibility on unselected shares.

### Phase 5 — Member access and communication

- Implement verified invitation acceptance and membership creation, private member views, bilingual statements, receipts, CSV export, and manual WhatsApp reminders.
- Add proof submissions and optional push notifications after access rules are verified.

**Done when:** A member can see only their own records and reminders reflect verified outstanding balances.

### Phase 6 — Pilot and release

- Implement controlled share transfers, cancellation settlement, and closure checks.
- Deploy the API, database, and HTTPS proxy to the VPS. Verify off-server backups/restoration, health alerts, receipt privacy, network interruption behavior, accessibility, and Urdu exports.
- Run a small organizer pilot using test records, then reconcile pilot records before production use.
- Produce an Android release build. Validate iOS separately before publishing an iOS version.

**Done when:** The pilot completes a full simulated cycle, financial totals reconcile, and access/privacy checks pass.

## Verification priorities

- Money: partial/advance allocation, credits, refunds, reversals, organizer advances, and payout reconciliation.
- Draws: eligibility by share, overdue rules, empty eligibility, final share, secure selection boundaries, and concurrent requests.
- Schedules: month-end anchors, leap years, and Karachi date boundaries.
- Security: organizer isolation, member isolation, invitation ownership, private files, and unauthorized function calls.
- Reliability: repeated taps, lost responses after successful writes, app restarts, and backup restoration.
- Language: Urdu/English switching, RTL navigation, mixed text, large text, and statement rendering.

Use focused tests for these rules rather than tests that merely mirror screen implementation.

## Decisions to confirm before dependent work

1. Whether overdue shares remain eligible for lucky draws. Store the chosen rule before activation.
2. Phone verification and password recovery experience; username/phone plus password is the chosen login method.
3. The group's rules for exits, replacements, defaults, and early cancellation. Do not automate an unspecified settlement policy.
4. Whether fractional or jointly owned shares are required; excluded from the initial whole-share model.
5. Whether organizer fees or penalties are required; excluded initially and never silently deducted from payouts.

## Deferred scope and main risk

Deferred: fractional/joint shares, bidding committees, bank/wallet payment integrations, automated WhatsApp/SMS, offline financial synchronization, and a separate web admin application.

Main risk: inaccurate money records or conflicting draw outcomes. Prioritize database-enforced rules, permission checks, correction history, and reconciliation before visual polish or automation.
