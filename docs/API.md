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

Only user registration and session creation are public. List endpoints accept a positive `page` and return up to 25 rows with pagination metadata. Responses are wrapped in `data` and exclude password/token hashes.

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

Invalid input returns 422; unauthenticated requests return 401. Missing or unauthorized resources return 404. Adonis's invalid-credentials response is 400. Financial and committee endpoints are not implemented yet.

## Current limits

Phone/password signup does not prove phone ownership. The organizer must share the invitation secret with the intended person through a trusted channel. SMS verification, password recovery, rate limiting, and mobile API integration remain to be implemented before production use. No invitations are sent automatically.
