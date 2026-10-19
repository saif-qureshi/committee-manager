# Mobile app

The Expo app uses one set of screens for Urdu and English. Translation resources change the text; shared components apply fonts, text direction, alignment, and spacing. Phone numbers, usernames, references, and amounts keep left-to-right text direction.

## Stack and structure

- Expo Router manages authentication guards and stack routes. `AppScreen` supplies one shared signed-in layout with the app header and Committees/Members bottom navigation on lists, forms, committee dashboards, and member/slot pickers. `PageHeader` only adds a back/title row under that shared header. Account opens from the shared header's circular profile icon; it is not duplicated in the bottom bar. The header also provides an icon-only Urdu/English switch and spans the screen width independently of body padding.
- Zustand holds session state and language preferences. TanStack Query owns API records, pagination, loading/errors, and refresh behavior; records are not duplicated in stores.
- NativeWind 4 with Tailwind CSS 3 styles the app. `src/theme.ts` supplies semantic colors, spacing, corner radii, and font names to shared components and the Tailwind configuration.
- Custom shared UI uses React Native controls. English uses bundled Manrope fonts; Urdu uses bundled Noto Sans Arabic. Screen components are shared, not duplicated by language.

```text
mobile/
  src/
    app/                  Thin routes, protected navigation, bottom tabs
    components/ui/        Text, Button, Input, DateField, Screen, Card, StatusBadge
    features/
      auth/               Sign-in, organizer registration, account, session store
      committees/         Committee list, draft creation, dashboard, exact currency display
      members/            Paginated organization member list
    i18n/                 Shared translation setup and en/ur resources
    lib/                  API requests, query client, providers
    stores/               Persisted language preference
    theme.ts              Shared visual tokens
```

Types belong beside their feature. Mobile API types describe public responses; no database models or server runtime code are imported into the app.

## Running

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to the backend origin, without `/api/v1`. Use `http://localhost:3333` for web, `http://10.0.2.2:3333` for the Android emulator, or the computer's LAN address for a phone. Restart Expo after changing it.

```sh
pnpm dev:backend
# In a separate terminal:
pnpm dev:web
```

Open the localhost URL printed by Expo. For the native app, use `pnpm dev:mobile` instead. New native dependencies require rebuilding an existing development client.

## Implemented flow

- Register an organizer with a username or phone and password, sign in, and sign out.
- Load the authenticated organizer's committees and members with API pagination and pull-to-refresh.
- Create and edit draft committees with numbering/lucky-draw settings, exact payout preview, and a calendar date picker. Native uses the system date picker; web uses the browser date control. Due dates stay date-only strings without UTC conversion. Draft dashboards provide Edit committee; updates refresh settings, slots, schedules, and the main list. Slot count and payout order stay locked while members are assigned. The backend rejects edits after activation.
- Open a committee dashboard with Overview, Members, and Schedule tabs. Drafts show setup progress; active committees show the next unsettled payout, handed-over/remaining amounts, and expandable full-cycle totals. Member slots and payout schedules use separate lists.
- Add members by name and phone from the Members screen or slot picker. The backend creates a pending user with a required password hash and user link, so app signup is optional for participation.
- Assign or clear draft slots from the committee Members tab using the paginated organization member picker. A member can hold multiple slots. Tapping a member selects it locally; Save confirms the assignment or removal, and Cancel discards it. Saving refreshes setup progress.
- Activate drafts from Overview after the server reports setup is ready. Activate stays disabled until every slot is assigned and server readiness is confirmed. A confirmation explains that activation locks settings, members, and payout order. Backend validation remains authoritative; failed/uncertain writes refresh server state.
- Read the account profile and switch Urdu/English from the header. Only the language preference is persisted in AsyncStorage.
- Store the access token with Expo SecureStore on native devices. Web previews keep it in memory, so reloading requires signing in again. Passwords and financial records are not persisted in device storage.
- Clear the query cache between sessions and cancel requests when queries are removed. Native app focus and network changes inform query refetching.

Sign-out revokes the current server token when reachable and clears local credentials. Offline sign-out clears the device; an unreachable server token expires according to the backend token policy. If secure-storage deletion fails, the UI reports failure and keeps the session state rather than claiming sign-out succeeded.

Invitation sharing/claim screens, member-specific views, contribution recording, payout handovers, draw actions, and reminders are not integrated into the mobile UI yet. Financial details are currently read-only.

## Verification

```sh
pnpm typecheck
pnpm test:mobile
pnpm --dir mobile exec expo install --check
pnpm --dir mobile exec expo export --platform web
pnpm --dir mobile exec expo export --platform android
```

Tests cover committee form validation, exact payout calculation, date-only handling, exact amount formatting, translation key/interpolation parity, and API request authorization/error handling. Exporting checks bundle compilation; it does not replace a device test. Urdu shaping, RTL tabs, keyboard behavior, accessibility font scaling, SecureStore, and Android system navigation need physical-device validation before release.

For pnpm's dependency isolation, `react-native-css-interop` is an explicit mobile dependency because NativeWind's Babel transform generates imports to it. Tailwind uses class-based dark-mode configuration to match NativeWind's web runtime; the app currently ships a light theme.

Short labels stay visible; question-mark buttons open dismissible help tooltips. Disabled actions use a neutral background.
