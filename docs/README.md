# Committee Manager

Android-first committee savings app with a planned Urdu/English experience. This repository currently contains the base Expo mobile app and an AdonisJS API with Lucid/PostgreSQL, username/phone authentication, organizer ownership, and invitation-based memberships. Committee drafts, numbered member slots, scheduled payout turns, schedule previews, and activation are implemented using three committee tables. Amounts use decimal PKR strings. Full/partial payout handovers and immutable API payment history are implemented. Incoming contribution tracking, payment corrections, cash reconciliation, and lucky-draw execution remain planned.

## Requirements

- Node.js 24 or newer and pnpm 11 or newer (`.nvmrc` selects Node 24).
- Docker with Docker Compose for the local PostgreSQL database.
- Expo Go or an Android development environment to run the mobile app.

## First setup

Run from the repository root:

```sh
pnpm install
cp backend/.env.example backend/.env
cp backend/.env.test.example backend/.env.test
cp mobile/.env.example mobile/.env
cd backend
node ace generate:key
cd ..
pnpm db:up
pnpm db:migrate
```

The database listens on `127.0.0.1:5436` to avoid common local PostgreSQL ports. Database sessions and API timestamps use UTC; `TZ=UTC` keeps the process clock in UTC. The mobile client formats timestamps in the user's timezone. Calendar dates stay `YYYY-MM-DD` and must not be shifted. Example credentials are for local development only. Database data persists in a named Docker volume; `pnpm db:down` stops the database without deleting it.

Start the apps in separate terminals:

```sh
pnpm dev:backend
```

```sh
pnpm dev:mobile
```

API: `http://localhost:3333`. `GET /health` is a process liveness check, not a database readiness check.

For an Android emulator, set `EXPO_PUBLIC_API_URL=http://10.0.2.2:3333` in `mobile/.env`. For a physical phone, use your computer's LAN IP and the same Wi-Fi network. Restart Expo after changing environment settings. The API URL is reserved for the upcoming client integration; the starter mobile screen does not call the API yet. Never put secrets in `EXPO_PUBLIC_*` variables.

## Directory structure

```text
backend/
  app/
    controllers/       HTTP endpoints
    middleware/        Authentication and request handling
    models/            Lucid models
    policies/          Bouncer resource permission checks
    services/          Authentication and membership actions
    transformers/      Public response fields
    validators/        Request validation
  config/              AdonisJS configuration, including PostgreSQL
  database/
    migrations/        TypeScript migrations with up/down methods
    schema.ts          Generated model schema classes
  start/               Routes, environment validation, middleware
  storage/             Reserved private uploads; ignored except .gitkeep
  tests/               Japa tests
mobile/
  src/
    app/               Expo Router screens and layouts
    components/        Reusable UI
    features/          Future committee, payment, and draw features
    i18n/              Initial English and Urdu translation resources
    lib/               Future API/auth clients
    theme/             Future shared styling
  assets/fonts/        Reserved bundled fonts
deploy/                Reserved production deployment configuration
docs/
  README.md            Setup and project structure
  API.md               Current REST endpoints
  PLAN.md              Product scope and delivery phases
  ERD.md               Proposed data model and backend actions
  DEPLOYMENT.md        Hosting scope and deployment notes
compose.yaml           Development and isolated test PostgreSQL
pnpm-workspace.yaml    Backend and mobile workspace packages
pnpm-lock.yaml         Shared dependency lockfile
```

Keep AdonisJS's conventional directories. Add a controller, validator, and action service when a feature needs them; do not create a second module hierarchy. Mobile authentication route groups will be added with their screens.

### Type placement

- Infer backend types from Lucid models and VineJS validators where possible. Keep generated types in AdonisJS's standard locations.
- Keep feature-specific types beside the code that uses them; a feature may have its own `types.ts` once it needs one.
- Do not create a global catch-all `types/` folder or expose database models to the mobile app.
- Add a `packages/contracts/` workspace only when API integration needs shared public request/response definitions. Shared TypeScript definitions do not replace runtime input validation or response-field filtering.

## Database changes

```sh
cd backend
node ace make:migration create_committees
node ace migration:run
```

Write schema changes through the TypeScript schema builder. Running migrations regenerates `database/schema.ts`; do not edit that generated file manually. The initial user and access-token tables retain the official starter's integer identifiers. Future committee domain tables are planned to use UUIDs.

## Checks

```sh
pnpm typecheck
pnpm lint:backend
pnpm test
pnpm build:backend
```

Adonis generates controller and route types during application boot and build. The backend typecheck command also runs code generation so a fresh checkout can be checked after environment setup.

The REST API is documented in [API.md](./API.md). Controllers only use resource methods and delegate input validation to VineJS validators and business actions to services. Controllers load the organization through the authenticated user, authorize actions through Bouncer policies, and pass the organization to services. Transaction queries and locks stay in services, and transformers whitelist response fields. Identity verification, password recovery, and rate limiting remain required before production.

`pnpm test` starts a separate temporary PostgreSQL instance on port 5437. The runner refuses to migrate any database other than `committee_manager_test`; tests never reset the development database.

Urdu resources and a font directory are present; language switching, RTL integration, and a bundled Urdu font are not implemented yet. VPS deployment and off-server backups are planned, not provisioned.
