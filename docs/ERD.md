# Committee Manager — ERD and Backend Actions

Database design for [PLAN.md](./PLAN.md). Users, organizations, organization memberships, and invitations are implemented; committee and financial tables remain planned. See [README.md](./README.md) for the current scaffold.

Amounts are integer paisa in PostgreSQL `bigint`. Financial calculations must preserve integer precision in backend and mobile code. Domain IDs are UUIDs; the starter authentication users use integer IDs. Event timestamps are timezone-aware, and installment due dates are local calendar dates.

## 1. Accounts, committees, and shares

An organizer signs up independently. Signup creates their organization and their `organizer` row in `organization_members` atomically. Members use the same `users` table and join through an invitation. A user can organize their own group and participate in others; there is no administrator-created organizer or staff-access flow. `AUTH_USERS` represents the AdonisJS `users` table; its access-token table is omitted. User IDs are integers and domain IDs are UUIDs.

```mermaid
erDiagram
    AUTH_USERS ||--o| ORGANIZATIONS : owns
    AUTH_USERS ||--o{ ORGANIZATION_MEMBERS : participates
    ORGANIZATIONS ||--|{ ORGANIZATION_MEMBERS : includes
    ORGANIZATIONS ||--o{ COMMITTEES : manages
    COMMITTEES ||--o{ SHARES : contains
    SHARES ||--o{ SHARE_OWNERSHIPS : has_history
    ORGANIZATION_MEMBERS ||--o{ SHARE_OWNERSHIPS : holds
    COMMITTEES ||--o{ ROUNDS : schedules
    SHARES o|--o{ ROUNDS : assigned_recipient
    ROUNDS ||--o{ INSTALLMENTS : requires
    SHARES ||--o{ INSTALLMENTS : owes
    SHARE_OWNERSHIPS ||--o{ INSTALLMENTS : responsible_for

    AUTH_USERS {
        int id PK
        string username "nullable; unique"
        string phone "nullable; unique; normalized"
        string password "hashed; never serialized"
    }
    ORGANIZATIONS {
        uuid id PK
        int owner_id FK,UK
        string name
        timestamptz created_at
    }
    ORGANIZATION_MEMBERS {
        uuid id PK
        uuid organization_id FK
        int user_id FK
        string role "organizer or member"
        timestamptz created_at
    }
    COMMITTEES {
        uuid id PK
        uuid organization_id FK
        string name
        string status "draft, active, completed, cancelled"
        string selection_type "fixed or draw"
        string frequency "weekly or monthly"
        date first_due_date
        bigint contribution_paisa
        int share_count
        boolean overdue_draw_allowed
        timestamptz activated_at
        timestamptz archived_at
    }
    SHARES {
        uuid id PK
        uuid committee_id FK
        int share_number
    }
    SHARE_OWNERSHIPS {
        uuid id PK
        uuid share_id FK
        uuid organization_member_id FK
        timestamptz starts_at
        timestamptz ends_at "nullable while current"
        string transfer_reason
        int created_by FK
    }
    ROUNDS {
        uuid id PK
        uuid committee_id FK
        int round_number
        date due_date
        uuid assigned_share_id FK "nullable until selected"
        string status "scheduled, selected, settled"
        bigint expected_payout_paisa
    }
    INSTALLMENTS {
        uuid id PK
        uuid committee_id FK
        uuid round_id FK
        uuid share_id FK
        uuid responsible_ownership_id FK
        bigint amount_due_paisa
    }
```

### Constraints

- Each user owns at most one organization. Each `(organization_id, user_id)` membership is unique. The owner has the `organizer` membership; invitation acceptance only creates `member` memberships. No public role-edit endpoint exists.
- A user must have a unique username or phone number; both may be provided. Passwords are hashed and login identifiers are separate from membership roles.
- Unique `(committee_id, share_number)`, `(committee_id, round_number)`, and `(round_id, share_id)`.
- A share can be assigned to at most one round in its committee. Multiple null assignments are allowed before draws.
- Every related share, round, installment, and ownership must belong to the same committee; members and committees must belong to the same organization. Enforce with composite foreign keys or controlled database functions, not UI checks alone.
- No overlapping ownership periods for a share. Activation requires exactly one current owner per share.
- Activation creates N rounds and N × N installments for N shares. All fixed-number rounds must have recipients.
- Completed rounds retain their recipient. An audited swap is allowed only between unpaid-out fixed-number rounds.
- Installment responsibility is explicit. Transfers must name which outstanding/future obligations move; they cannot silently rewrite the previous owner's debt or historical payments.

## 2. Financial records and payment proof

Use one financial ledger for actual cash movements. A positive entry increases cash held; a negative entry decreases it. Payment allocations explain which installments a receipt or refund affects. A proof submission is a request for verification, not a financial entry.

```mermaid
erDiagram
    COMMITTEES ||--o{ MONEY_ENTRIES : records
    ORGANIZATION_MEMBERS o|--o{ MONEY_ENTRIES : member_counterparty
    AUTH_USERS ||--o{ MONEY_ENTRIES : records
    MONEY_ENTRIES ||--o{ PAYMENT_ALLOCATIONS : allocates
    INSTALLMENTS ||--o{ PAYMENT_ALLOCATIONS : receives
    ROUNDS o|--o{ MONEY_ENTRIES : payout_for
    SHARES o|--o{ MONEY_ENTRIES : payout_share
    SHARE_OWNERSHIPS o|--o{ MONEY_ENTRIES : payout_recipient_snapshot
    MONEY_ENTRIES o|--o{ MONEY_ENTRIES : reverses
    MONEY_ENTRIES o|--o{ MONEY_ENTRIES : repays_advance
    COMMITTEES ||--o{ PAYMENT_SUBMISSIONS : receives
    ORGANIZATION_MEMBERS ||--o{ PAYMENT_SUBMISSIONS : submits_for
    PAYMENT_SUBMISSIONS o|--o| MONEY_ENTRIES : verified_as
    PAYMENT_SUBMISSIONS o|--o{ DOCUMENTS : has_proof
    MONEY_ENTRIES o|--o{ DOCUMENTS : has_receipt

    MONEY_ENTRIES {
        uuid id PK
        uuid committee_id FK
        string kind "contribution, refund, payout, advance, advance_repayment, reversal"
        bigint signed_amount_paisa
        uuid organization_member_id FK "nullable; counterparty"
        int advance_provider_user_id FK "nullable; organizer funding"
        uuid round_id FK "required for payout"
        uuid share_id FK "required for payout"
        uuid recipient_ownership_id FK "required for payout"
        uuid reverses_entry_id FK "nullable; unique"
        uuid source_advance_id FK "nullable; repayment source"
        uuid source_submission_id FK "nullable; unique"
        string payment_method
        string reference
        date occurred_on
        uuid request_id UK "retry protection"
        int created_by FK
        timestamptz created_at
        string reason
    }
    PAYMENT_ALLOCATIONS {
        uuid id PK
        uuid money_entry_id FK
        uuid installment_id FK
        bigint signed_amount_paisa
    }
    PAYMENT_SUBMISSIONS {
        uuid id PK
        uuid committee_id FK
        uuid organization_member_id FK
        bigint proposed_amount_paisa
        date claimed_payment_date
        string reference
        string status "pending, approved, rejected"
        int submitted_by FK
        int reviewed_by FK
        timestamptz reviewed_at
        string review_reason
    }
    DOCUMENTS {
        uuid id PK
        uuid organization_id FK
        uuid submission_id FK "nullable"
        uuid money_entry_id FK "nullable"
        string storage_path UK "private object path"
        string content_type
        bigint byte_size
        int uploaded_by FK
        timestamptz created_at
    }
```

### Ledger rules

- Contributions and organizer advances are positive. Payouts, member refunds, and organizer advance repayments are negative. Reject zero amounts.
- A reversal is the exact opposite of its original entry and copies the original attribution. It reverses allocations atomically as well. One original entry can be reversed once; corrections use reversal plus replacement. A refund is an actual new outgoing movement, not a correction.
- Entries and allocations are append-only through controlled backend functions. No direct client update/delete access.
- Allocation totals cannot exceed the receipt amount. Unallocated net member receipts represent credit. Refunds reduce unallocated credit or explicitly reverse installment allocations; prevent over-refunds and over-allocation under concurrent requests.
- Positive allocation means contribution paid; negative allocation undoes that payment. Sum allocations against installments to calculate remaining obligations.
- Payout entries must reference the selected round, share, and recipient ownership. Partial payouts are allowed; net payouts cannot exceed the round's entitlement without a separately designed amendment.
- Every advance repayment references its original advance. Prevent repayments exceeding the outstanding advance, including corrections.
- Verify cash availability under a committee lock. If the organizer funds a shortfall, record the advance explicitly before or in the same transaction as the payout.
- An approved submission creates exactly one contribution entry in the same transaction. The submitter must be authorized for the member and committee.
- Request IDs are generated before submission. Reusing an ID with the same input returns the existing result; reusing it with different input is rejected.
- Each document has exactly one parent: submission or money entry. Access follows that parent's permissions, not a public storage URL.
- Cash held is the sum of signed ledger amounts. Collections, payouts, credits, advances, and arrears are separate derived totals; do not add expected installments to cash held.
- Reject a reversal that would violate existing allocations, payout entitlement, advance repayment, or cash constraints. Correct dependent records explicitly in a controlled transaction.

## 3. Draws, invitations, and history

```mermaid
erDiagram
    ROUNDS ||--o| DRAW_RESULTS : has
    DRAW_RESULTS ||--|{ DRAW_CANDIDATES : snapshots
    SHARES ||--o{ DRAW_CANDIDATES : evaluated_as
    SHARE_OWNERSHIPS ||--o{ DRAW_CANDIDATES : owner_at_draw
    SHARES ||--o{ DRAW_RESULTS : selected
    AUTH_USERS ||--o{ DRAW_RESULTS : confirms
    ORGANIZATIONS ||--o{ INVITATIONS : issues
    AUTH_USERS o|--o{ INVITATIONS : accepts
    ORGANIZATIONS ||--o{ AUDIT_EVENTS : retains
    AUTH_USERS o|--o{ AUDIT_EVENTS : performs

    DRAW_RESULTS {
        uuid id PK
        uuid round_id FK,UK
        uuid selected_share_id FK
        string method "app, in_person, automatic"
        uuid request_id UK
        int confirmed_by FK
        timestamptz confirmed_at
    }
    DRAW_CANDIDATES {
        uuid draw_result_id PK,FK
        uuid share_id PK,FK
        uuid ownership_id FK
        boolean eligible
        string eligibility_reason
        bigint arrears_paisa
    }
    INVITATIONS {
        uuid id PK
        uuid organization_id FK
        string recipient_identifier "username or normalized phone"
        string token_hash UK
        timestamptz expires_at
        timestamptz accepted_at
        timestamptz revoked_at
        int accepted_by FK
        int created_by FK
        timestamptz created_at
    }
    AUDIT_EVENTS {
        uuid id PK
        uuid organization_id FK
        uuid committee_id FK "nullable"
        int actor_user_id FK "nullable for system actions"
        string action
        string entity_type
        uuid entity_id
        jsonb before_data
        jsonb after_data
        string reason
        timestamptz created_at
    }
```

- Lock the committee while evaluating eligibility and confirming a draw. Serialize relevant financial changes against that lock so the eligibility snapshot is coherent.
- Snapshot all not-yet-selected shares with their eligibility decision, ownership, and arrears. Pick only from eligible shares using secure backend randomness.
- Save candidate snapshots, draw result, round assignment, and audit event together. If no share qualifies, create no confirmed result.
- A selected share must appear as eligible in its snapshot. An in-person result must also pass the declared eligibility rules.
- Draw results and snapshots are immutable. Refreshing the app cannot reroll a result.
- Invitations are expiring, revocable, single-use credentials. Store a token hash, not the raw token; accept and create the organization membership transactionally. The invitation must match the logged-in user's username or phone and its single-use secret. Organizers share secrets manually with the intended recipient; passwords alone do not verify phone ownership.
- Audit data is written by trusted backend code or triggers. Members cannot read organization-wide audit logs. Avoid storing secrets or unnecessary personal data in snapshots.

## Backend action flow

The backend is one self-hosted Node.js/AdonisJS API with PostgreSQL, running on a paid VPS. The mobile app connects only to the API over HTTPS. We are building our own backend rather than self-hosting the Supabase platform.

```mermaid
flowchart TD
    A[Expo mobile app] --> P[Caddy HTTPS proxy]
    P --> B[AdonisJS API: verify access token]
    B --> C[Authorized reads scoped to organization or member]
    B --> D[Authenticated backend action]
    D --> E[Validate input and check user permissions]
    E --> F[PostgreSQL transaction: lock, recheck rules, write]
    F --> G[Ledger and related records]
    F --> H[Audit history]
    F --> I[Committed result returned to app]
    D --> J[Private uploads or external service integration]
```

| Action | Backend responsibility |
| --- | --- |
| Create/edit draft committee | Verify organizer access; validate settings and ownership |
| Activate committee | Lock settings; create schedule and installments atomically |
| Record contribution | Verify organizer; write ledger entry, allocations, and history together |
| Approve payment proof | Lock pending submission; create one verified contribution |
| Correct financial record | Verify dependencies; append reversal and any replacement atomically |
| Run/record draw | Lock committee; snapshot eligibility; select and persist one result |
| Swap fixed turns | Verify both turns remain unpaid; update both and preserve history |
| Record payout | Validate recipient, entitlement, available funds, and duplicate request ID |
| Transfer share | Preserve ownership periods; explicitly transfer agreed obligations |
| Accept invitation | Validate single-use token and intended login; create membership |
| Complete/cancel committee | Reconcile obligations, cash, credits, and advances; require explicit settlement |
| Prepare WhatsApp reminder | Authorized read of current balance; app opens share UI for organizer to send |

Implement actions as AdonisJS controllers backed by small action services. Use a Lucid managed transaction, lock the relevant records, check business rules, and commit financial records and audit history together. Use Lucid models or its query builder with bound parameters. Use a database function only when it is the smallest way to enforce a shared invariant; no separate worker or function-hosting platform is needed initially.

The app may validate forms for convenience, but the API repeats all trust-boundary checks using VineJS validators. Validate AdonisJS access tokens and organization/member permissions on every protected request. Keep PostgreSQL off the public network and deny direct mobile database access. Use a restricted runtime database role, separate migration credentials, and authorized file routes over a private upload volume. Database row-level security may be added as defense in depth; the initial design relies on tested API authorization and database constraints.

Private receipt files and database volumes must be backed up off-server. Caddy handles HTTPS, while Docker Compose manages the API, database, and proxy on one VPS. Health checks, restart policies, disk monitoring, and backup alerts are part of production readiness. One VPS remains a single point of failure.

## Implementation order and limits

1. Implement self-signup, organizations, organization memberships, and invitations; then create committee, share, ownership, round, and installment migrations.
2. Add ledger constraints and transactional contribution/payout functions with reconciliation tests.
3. Add transactional draws and concurrent-request tests.
4. Add invitations, proof review, private documents, and member-access tests.
5. Add controlled transfers, settlement/closure actions, and restoration verification before the pilot.

This design assumes whole shares, one payout entitlement per share, fixed contribution amounts after activation, and online financial writes. Fractional shares, fees, penalties, and automated settlement rules need separate decisions before extending the schema.
