# Backend API

Base path: `/api/v1`. Protected requests use `Authorization: Bearer <token>`. Created resources return 201; current-session deletion and invitation revocation return 204.

| Method | Path | Controller action | Purpose |
| --- | --- | --- | --- |
| POST | `/users` | `UsersController.store` | Register an organizer or member login |
| GET | `/users/me` | `UsersController.show` | Read the authenticated user's profile |
| POST | `/sessions` | `SessionsController.store` | Log in and issue a 30-day access token |
| DELETE | `/sessions/current` | `SessionsController.destroy` | Revoke the current token |
| GET | `/organization` | `OrganizationsController.show` | Read the organizer's own organization |
| GET | `/organization/members` | `OrganizationMembersController.index` | List participants in the organizer's organization |
| GET | `/memberships` | `MembershipsController.index` | List the authenticated user's memberships and roles |
| POST | `/memberships` | `MembershipsController.store` | Accept an invitation and create a member membership |
| POST | `/organization/invitations` | `InvitationsController.store` | Create an invitation for a username or phone |
| DELETE | `/organization/invitations/:invitationId` | `InvitationsController.destroy` | Revoke an unused invitation |

Only user registration and session creation are public. List endpoints accept a positive `page` and return up to 25 rows with pagination metadata. Responses are wrapped in `data` and exclude password/token hashes. Database timestamp sessions and API timestamp reads use UTC. The mobile client converts timestamp instants to the user's timezone for display. Date-only fields stay `YYYY-MM-DD` and are never shifted.

## Registration and login

Register an organizer:

```json
{
  "accountType": "organizer",
  "organizationName": "Ahmed's committees",
  "fullName": "Ahmed",
  "username": "ahmed",
  "phone": "03001234567",
  "password": "your-password",
  "passwordConfirmation": "your-password"
}
```

- At least one of `username` or `phone` is required. Both may be provided and must be unique.
- Usernames are case-sensitive, 3–30 characters, start with a letter, and use letters, digits, or underscores.
- Phone numbers accept Pakistani `03...` format or international E.164. `03001234567` is stored as `+923001234567`.
- `fullName` may be null. Passwords are 8–32 characters.
- `accountType` is onboarding intent, not a global user role. Organizer registration atomically creates a user, one organization, and an `organizer` membership. `organizationName` is optional and defaults to `My committees`.
- Member registration uses `accountType: "member"` and creates only a login. That login joins organizations through invitations. Adding organizer onboarding to an existing member-only login is outside this backend increment.
- A user who organizes one organization may also hold `member` memberships in other organizations.
- Email is not part of registration or login. No admin creates organizers and there is no staff-access or organization-management API.

Registration returns the public user profile and a token. Login accepts:

```json
{ "identifier": "ahmed", "password": "your-password" }
```

The same `identifier` field accepts a stored phone or Pakistani local-format phone.

## Invitations

The organizer sends `{ "identifier": "03001234567" }` to `POST /organization/invitations`. A registered username is also accepted; phone invitations can be issued before signup. The response includes an invitation ID, expiry, and a secret token for manual sharing. The token is returned once; only its SHA-256 hash is stored.

The recipient registers or logs in, then sends `{ "token": "<invitation-secret>" }` to `POST /memberships`. The intended username or phone must match their authenticated profile. Acceptance creates a `member` role regardless of any supplied role/user/organization fields.

Invitations expire after 72 hours. Reissuing to the same identifier revokes previous pending invitations. Accepted, revoked, expired, or already-linked invitations return a conflict. Organization locks and unique membership constraints prevent concurrent requests from creating duplicate links. Organizers can only revoke invitations within their own organization.

Invalid input returns 422; unauthenticated requests return 401. Missing or unauthorized resources return 404. Adonis's invalid-credentials response is 400. Incoming contribution tracking and lucky-draw execution are not implemented yet. Outgoing payout handovers are supported below.

## Current limits

Phone/password signup does not prove phone ownership. The organizer must share the invitation secret with the intended person through a trusted channel. SMS verification, password recovery, rate limiting, and mobile API integration remain to be implemented before production use. No invitations are sent automatically.

## Committee setup

The committee setup uses three tables: `committees`, `committee_members`, and `committee_payouts`. A committee-member row represents one numbered slot; the same organization member may own several slots. Payout rows represent scheduled turns, recipient selections, and paid totals. Individual handovers are preserved in `committee_payout_payments`.

All paths below start with `/api/v1/organization/committees`. Controllers load the organization through the authenticated user, authorize with Bouncer, and scope committee lookup to that organization before calling a service. These endpoints are organizer-only; member-facing committee views remain pending.

| Method | Suffix | Controller action | Purpose |
| --- | --- | --- | --- |
| GET | `/` | `CommitteesController.index` | Paginated committee list |
| POST | `/` | `CommitteesController.store` | Create a draft, N slots, and N payout turns |
| GET | `/:committeeId` | `CommitteesController.show` | Read settings and assigned-member slot count |
| PUT | `/:committeeId` | `CommitteesController.update` | Replace draft settings |
| GET | `/:committeeId/members` | `CommitteeMembersController.index` | Read slots and their assigned members |
| PUT | `/:committeeId/members` | `CommitteeMembersController.update` | Replace all slot-to-member assignments |
| GET | `/:committeeId/payouts` | `CommitteePayoutsController.index` | Read scheduled turns, amounts, and recipient slots |
| PUT | `/:committeeId/payouts` | `CommitteePayoutsController.update` | Replace draft fixed-turn assignments |
| GET | `/:committeeId/schedule` | `CommitteeSchedulesController.show` | Preview schedule and activation issues |
| POST | `/:committeeId/activations` | `CommitteeActivationsController.store` | Finalize setup and lock settings/assignments |

Create or replace draft settings:

```json
{
  "name": "Family committee",
  "contributionAmount": "10000.00",
  "slotCount": 3,
  "selectionType": "fixed",
  "frequency": "monthly",
  "firstDueDate": "2028-01-31",
  "overdueDrawAllowed": null
}
```

- Amounts are PKR `decimal(14,2)` in PostgreSQL and strings in requests/responses. `"10000.00"` means Rs 10,000. Values with zero, negative amounts, more than two decimal places, scientific notation, or JSON numeric types are rejected. Accepted whole/one-decimal strings are normalized to two decimal places.
- Contributions range from `"0.01"` to `"9999999999.99"`. With at most 100 slots, the maximum payout is `"999999999999.00"`, within the database column's precision. Calculations use integer minor units internally, never floating-point arithmetic.
- `slotCount` is 1–100. Each slot owes the contribution in every round and has one payout entitlement. A person may own multiple slots.
- `selectionType` is `fixed` or `draw`; `frequency` is `weekly` or `monthly`.
- `firstDueDate` is an actual `YYYY-MM-DD` date, with a start year between 1900 and 2100. Calendar dates are not timezone-converted. Monthly schedules retain the original anchor: Jan 31 → Feb 29 → Mar 31 in 2028. Weekly dates advance seven calendar days.
- `overdueDrawAllowed` is explicitly `true`, `false`, or `null`. Draw drafts may leave it null; activation requires a boolean. Fixed committees store null.
- Organization, status, timestamps, and expected amounts are controlled by the backend. New committees are drafts. Fixed payout turns initially reference the matching numbered slots; draw recipients are null. All draft payout rows remain `scheduled`, with null `selectedAt`.

Replace member assignments with every slot exactly once:

```json
{
  "members": [
    { "slotNumber": 1, "organizationMemberId": "<organization-membership-uuid>" },
    { "slotNumber": 2, "organizationMemberId": "<organization-membership-uuid>" },
    { "slotNumber": 3, "organizationMemberId": null }
  ]
}
```

`organizationMemberId` references `organization_members.id`, not a user ID. Null leaves a slot unassigned during draft setup. Only members of this organization may be assigned. Slot IDs stay unchanged when assignments change. `assignedMemberCount` counts assigned slots, not distinct people.

Replace fixed payout turns with every round exactly once:

```json
{
  "payouts": [
    { "roundNumber": 1, "committeeMemberId": "<slot-2-uuid>" },
    { "roundNumber": 2, "committeeMemberId": "<slot-1-uuid>" },
    { "roundNumber": 3, "committeeMemberId": null }
  ]
}
```

`committeeMemberId` references a slot in this committee. A slot can receive at most one payout turn. Null allows an incomplete fixed draft; draw recipients must all stay null. Swapping turns is atomic. Invalid member/turn replacements leave existing assignments unchanged.

Changing slot count or selection mode requires clearing all member assignments first. Resizing recreates the unassigned slots and scheduled payout rows; fetch their new IDs afterward. Changing selection mode resets turn assignments. Other draft settings refresh dates/expected amounts while retaining custom fixed turns.

Schedule preview returns `readyToActivate`, `issues`, `contributionAmount`, `slotCount`, `totalContributionPerSlot`, and `payouts`. Each payout contains its date, recipient slot/member IDs, expected amount, and selection state. Expected contribution obligations are calculated from committee settings and scheduled rounds; there is no installments table. Preview does not write records.

Activation requires an assigned member for every slot, complete fixed-turn recipients, and an explicit draw eligibility rule. Fixed turns become `selected` with a UTC `selectedAt`; draw turns remain `scheduled` with null recipients. `selected` means the recipient was finalized, not that money was paid. Activation locks all settings, member assignments, and payout-turn assignments. First activation returns 201; concurrent/retried activation returns the existing state with 200 and creates no duplicates.

Invalid input/assignments return 422, incomplete activation or active edits return 409, and missing/foreign/unauthorized resources return 404. All event timestamps remain UTC; the client handles display in the user's timezone. Calendar dates remain date-only strings.

Incoming contributions, transfers, draw execution, cancellation, and committee completion remain deferred. Outgoing handovers use the payment records below.

## Record a payout handover

A selected monthly or weekly payout is completed by recording the actual money handed to its recipient. Selection and payment are separate actions:

```text
scheduled → selected → partially_paid → paid
```

A full first handover moves directly from `selected` to `paid`. Recording a paid round does not complete the entire committee.

| Method | Path after `/api/v1` | Controller action | Purpose |
| --- | --- | --- | --- |
| POST | `/organization/committees/:committeeId/payouts/:payoutId/payments` | `CommitteePayoutPaymentsController.store` | Record a full or partial handover |
| GET | `/organization/committees/:committeeId/payouts/:payoutId/payments` | `CommitteePayoutPaymentsController.index` | Paginated handover history |

```json
{
  "requestId": "<client-generated-uuid>",
  "amount": "25000.00",
  "paidOn": "2026-10-19",
  "paymentMethod": "bank_transfer",
  "reference": "bank-reference-123"
}
```

- The committee must be active and the round must have a finalized recipient. An unselected lucky-draw round cannot be paid. Draw execution remains pending.
- `amount` is a positive decimal PKR string with at most two fractional digits and 12 integer digits. It must not exceed the round's remaining entitlement. Values are normalized to two decimal places; numeric JSON values and scientific notation are rejected.
- `paidOn` is the handover's calendar date in `YYYY-MM-DD`, validated between the start years 1900 and 2100. It is distinct from the UTC recording timestamp and is not timezone-converted. The organizer supplies the actual date; it does not have to equal the scheduled due date.
- `paymentMethod` is `cash`, `bank_transfer`, `easypaisa`, `jazzcash`, or `other`.
- `reference` is optional, nullable, and at most 120 characters. References are trimmed; blank references are stored as null. Repeated references are allowed because they are not reliable unique payment identifiers.
- The backend determines the organization, committee, payout, recipient organization membership, actor, and recording time. Supplied recipient/actor/status fields are ignored.
- Generate `requestId` before sending and reuse it for retries. The same organization, payout, amount, date, method, and reference return the original payment with 200, even after the round is fully paid. A new payment returns 201. Reusing the request ID for a different payload or payout returns 409. Request IDs are unique within an organization.
- Transactions lock the committee and payout, compare the history sum with the stored paid total, prevent overpayment under concurrent requests, and commit the handover, total, and status together. A mismatched history total returns 409 rather than silently overwriting it.

Each payment response contains `id`, `committeeId`, `payoutId`, `organizationMemberId` (recipient snapshot), `amount`, `paidOn`, `paymentMethod`, `reference`, `recordedBy`, `requestId`, and UTC `createdAt`. History uses the standard `page` pagination with 25 records, ordered by handover date and recording time descending.

Payout lists and schedule previews now expose `paidAmount`, `remainingAmount`, `paidAt`, and the updated status. `paidAt` is the UTC time the final handover was recorded, not the claimed handover calendar date. It stays null for unpaid/partially paid rounds. `selectedAt` remains the original recipient-finalization time.

There are no payment update/delete routes. Corrections, reversals, receipt uploads, recipient acknowledgment, and incoming contribution tracking remain pending. Handovers are manual records; this API does not transfer money or verify bank/wallet settlement. Available cash cannot yet be checked against contribution/funding records, so this increment does not provide cash reconciliation.
