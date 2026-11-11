# Drawspace

A self-hosted home for sketches, diagrams, and shared ideas. Built with **Next.js App Router**, the actual **open-source Excalidraw editor**, **shadcn/ui-style Radix components**, Tailwind CSS, and PostgreSQL. Uses **pnpm** and **Prettier with `semi: false`**.

## Included

- Email/password registration and sign-in; hashed passwords, database-backed sessions, profile settings, password changes, and sign-out.
- With [email delivery](#email-delivery-optional) configured: **Forgot password?** reset links and passwordless **email sign-in links** for existing accounts.
- Optional Discord OAuth sign-in and account linking, including email-confirmed connection of existing accounts through Amazon SES, using the same database-backed sessions.
- Multiple workspaces with server-enforced owner, admin, editor, and viewer roles.
- Add registered users to workspaces by email, change roles, and remove members.
- Create, rename, duplicate, delete, search, sort, and favorite drawings; grid/list views.
- The complete Excalidraw drawing experience, including images, libraries, importing files, and PNG/SVG/`.excalidraw` exports.
- Debounced autosave, canvas thumbnails, browser recovery, retry states, and optimistic concurrency checks. Stale tabs cannot silently overwrite a newer save.
- Guest mode: one browser-local drawing, no account required. Copy it into a workspace after signing in.
- Read-only public share links with 7-day, 30-day, or no expiry; immediate server-side revocation.
- Responsive navigation, empty states, starter templates, accessible dialogs, and a calm violet/paper UI.
- Docker Compose deployment with a persistent PostgreSQL volume, health checks, a non-root application container, and automatic transactional migrations.
- Excalidraw font assets served locally, not fetched from a CDN.

## Run with Docker Compose

Requirements: Docker Engine and Docker Compose v2.

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
POSTGRES_PASSWORD=your-long-random-hex-password
APP_URL=http://localhost:3000
COOKIE_SECURE=false
ALLOW_REGISTRATION=true
PORT=3000
```

Generate a URL-safe password with `openssl rand -hex 32`. The Compose connection URL interpolates this password, so use hex characters rather than URL-reserved characters. `DATABASE_URL` in `.env.example` is only used for development outside Docker; Compose supplies its own connection URL.

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f app
```

Open **http://localhost:3000** and create an account. Every new user gets their own workspace; there are no default credentials. The application applies migrations before starting. `/api/health` verifies database connectivity.

If port 3000 is occupied, set both `PORT=3100` and `APP_URL=http://localhost:3100`. **`APP_URL` must exactly match the browser-facing origin**, including the port. Mutating API requests validate the `Origin` header against this value.

### Internet-facing deployment

Place the application behind an HTTPS reverse proxy (Caddy, Traefik, or Nginx), set `APP_URL=https://draw.example.com`, and set `COOKIE_SECURE=true`. Configure the proxy to allow request bodies up to 16 MB. Add edge rate limiting for registration/login. The database is not published to the host by the default Compose configuration.

`ALLOW_REGISTRATION=false` disables new registrations without affecting existing accounts or guest mode. Members must have an account on this instance before they can be added; there is no email delivery service or invitation email dependency.

Shared links are bearer credentials. Anyone who has a link can view and download its drawing until it expires or is revoked. Avoid recording full `/share/…` URLs in proxy analytics/access logs. Share pages use `Referrer-Policy: no-referrer` and tokens are stored hashed in the database. A user who already downloaded a drawing retains their copy after revocation.

### Discord login (optional)

Authentication is implemented in the application with Next.js route handlers, Node.js `scrypt` password hashing, and PostgreSQL-backed sessions; it does not use NextAuth/Auth.js or Better Auth. Discord adds an OAuth2 authorization-code flow with PKCE and short-lived, single-use, browser-bound state to this existing system.

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **OAuth2**, add the exact redirect URI **`https://draw.example.com/api/auth/discord/callback`**, replacing the origin with your `APP_URL`. For local development, use `http://localhost:3000/api/auth/discord/callback` (or your configured port).
3. Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in `.env`, using the application's OAuth2 client ID and secret, **not a bot token**. Keep the secret private; do not use `NEXT_PUBLIC_` variables. Compose forwards both variables to the application.
4. Restart/redeploy the application using your normal deployment process. **Continue with Discord** appears on sign-in and registration pages only when both values are configured. No bot, guild membership, or privileged scopes are required; only `identify` and `email` are requested.

Discord must provide a verified email address. New Discord users receive their own workspace and do not have a local password. Existing Discord users sign in by their stable Discord user ID, even if their Discord email changes. `ALLOW_REGISTRATION=false` blocks new Discord accounts, but existing Discord logins and linking from existing accounts still work.

**Existing email/password users** can connect Discord in either of two ways:

- Sign in with your password, open **Account settings**, and choose **Connect Discord**.
- Choose **Continue with Discord**. If Discord's verified email matches an existing account and [email delivery](#email-delivery-optional) is configured, Drawspace emails a confirmation link to that address, valid for 30 minutes and usable once. Opening it shows a confirmation page; choosing **Connect Discord** there connects the account and signs you in. Without email delivery, Drawspace asks you to sign in with your password and connect from settings instead.

Accounts are never merged on a matching email alone, because local email addresses are not verified at registration: the email route requires both Discord's verified email **and** control of the mailbox. Confirming signs out every existing session for the account. Because someone else could have registered your address and chosen its password, the confirmation page also offers to **turn off password sign-in**. Linking preserves your profile, workspaces, and memberships, and the password unless you turn it off. Existing accounts can connect Discord even with `ALLOW_REGISTRATION=false`. One Discord account can connect to only one Drawspace account, and each Drawspace account can connect to only one Discord account. Self-service unlinking is not currently supported. Discord-only accounts can add a password with **Forgot password?** when email delivery is configured.

Provider access/refresh tokens are not persisted. Existing sessions retain their normal 30-day lifetime and sign-out behavior. Avoid logging query strings on `/api/auth/discord/callback`, `/auth/discord/confirm`, `/auth/email/confirm`, and `/reset-password`, which carry temporary authorization codes and emailed tokens. Apply edge rate limiting to `/api/auth/discord` as well as password login and registration. Removing the Discord configuration hides the option and disables Discord authentication; provide another access path before doing so for Discord-only users.

### Email delivery (optional)

Drawspace sends three kinds of email: Discord connection confirmations, password reset links, and sign-in links. It uses the [Amazon SES v2 `SendEmail` API](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html). Configure it with:

```dotenv
EMAIL_FROM=auth@example.com
AWS_REGION=us-east-1
SES_CONFIGURATION_SET=          # optional
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Email is enabled only when `EMAIL_FROM`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` are all set. The sender must be a verified SES identity, and the account needs SES production access to email arbitrary recipients. Use a dedicated IAM identity limited to `ses:SendEmail` (optionally conditioned on `ses:FromAddress` and the configuration set). Credentials are read only by the server; never use `NEXT_PUBLIC_` variables. On hosts without EC2 instance metadata, also set `AWS_EC2_METADATA_DISABLED=true`.

Without email delivery, the **Forgot password?** and **Email me a sign-in link** options are hidden and their endpoints return 404.

**Password reset.** **Forgot password?** on the sign-in page asks for an email address and always gives the same "if an account exists" answer. The link is valid for 30 minutes and can be used once. Setting a new password signs out every session, invalidates other emailed links, and signs you in.

**Email sign-in.** **Email me a sign-in link** emails existing accounts a 15-minute, single-use link; it doesn't create accounts. Opening a link (including Discord confirmations) only shows a confirmation page, so mail scanners that prefetch links can't use it; the button completes the action with a same-origin request.

**Verified email addresses.** Drawspace records when an account's address is first proven: by a reset or sign-in link, a Discord email confirmation, or an account created through Discord. Addresses registered with a password are not verified at signup, so someone could register your address first and know its password. The first time an email sign-in link verifies an address, it signs out every other session and offers to **turn off password sign-in**. A password reset replaces the password and signs out everywhere.

**Limits.** Each address can request at most 3 links of each kind per hour, counted whether or not an account exists, and each account at most 3 Discord confirmations per hour. The instance sends at most 200 emails per hour. A new link of the same kind invalidates the previous one. Tokens are stored hashed. Signup already reveals whether an address is registered, so request responses don't attempt timing-level secrecy; a delivery failure is reported as an error. Delivery errors are not logged verbatim, and Drawspace does not process bounce or complaint notifications.

### Backups and upgrades

Back up the database, which contains users, sessions, workspaces, scenes, embedded image files, and share metadata:

```bash
docker compose exec -T db pg_dump -U drawspace drawspace > drawspace-backup.sql
```

Restore to a fresh database:

```bash
docker compose exec -T db psql -U drawspace drawspace < drawspace-backup.sql
```

Rebuild to deploy updates:

```bash
docker compose up --build -d
```

Migrations are applied in filename order under a PostgreSQL advisory lock. `docker compose down` retains the named volume. **`docker compose down -v` deletes the database permanently.** Guest drawings and unsaved local recovery copies are only in the browser and are not included in server backups.

## Published container images

Stable releases are published to **`cr.guneet.dev/drawspace/drawspace`** for both **`linux/amd64`** and **`linux/arm64`**. Docker automatically selects the platform for your machine.

To deploy the prebuilt image instead of building locally (Docker Compose 2.24+):

```bash
docker login cr.guneet.dev
docker compose -f compose.yaml -f compose.release.yaml pull
docker compose -f compose.yaml -f compose.release.yaml up -d
```

Use the same `.env` configuration as the local-build deployment. The override removes `build`, keeps the PostgreSQL volume and health checks, and defaults to the version committed in `compose.release.yaml`. Back up the database before upgrading. Override the image with `DRAWSPACE_IMAGE=cr.guneet.dev/drawspace/drawspace:v0.4.0` to select a particular release, preferably pinned by digest (`:v0.4.0@sha256:…`). Moving tags such as `latest` and `v0.4` are convenient for trying Drawspace, but production deployments should pin an exact version.

Published tags (version tags always use the `v` prefix of the Git tag):

- `vX.Y.Z` (for example `v0.4.0`): exact release version.
- `vX.Y`: latest patch in that minor line, and, from `1.0.0`, `vX`: latest release in that major line. These move only when the release is the latest stable GitHub release.
- `latest`: latest stable GitHub release.
- `sha-<12-character-commit>`: the exact release source revision.

Every tag points to a multi-architecture index whose `linux/amd64` and `linux/arm64` images carry SBOM and provenance attestations (inspect them with `docker buildx imagetools inspect cr.guneet.dev/drawspace/drawspace:vX.Y.Z --format '{{json .Provenance}}'`, or `.SBOM`). Releases up to `v0.4.0` were published without attestations and also as unprefixed (`0.4.0`, `0.4`) and per-platform (`0.4.0-amd64`) tags; those tags remain in the registry, but later releases publish only the tags above.

## CI/CD and automatic releases

The workflows in `.github/workflows/` use pinned action commit SHAs:

1. **CI** runs formatting, lint, TypeScript, unit tests, production builds, migrations, and Playwright tests against a disposable PostgreSQL service on pushes to `main` and pull requests. It can also be dispatched manually or called by another workflow.
2. **Release Please** analyzes conventional commits on `main`, maintains a release PR, and updates `package.json`, `CHANGELOG.md`, `.release-please-manifest.json`, and the default image version in `compose.release.yaml`. The first release is **`0.1.0`**; this initial-version setting does not pin later releases to the same version.
3. **Merge the release PR** when ready. Release Please creates the `vX.Y.Z` tag and GitHub release, then calls the publishing workflow directly. This works with the built-in `GITHUB_TOKEN`; no personal access token is required.
4. **Publish Docker image** (called only by Release Please; it has no manual trigger) checks the release tag/version and reruns CI on that exact commit. On a native GitHub runner per platform, it builds the image with SBOM and provenance attestations and pushes it **by digest only** (no tag). It then checks the attestations, pulls that exact digest, and starts it against PostgreSQL to verify startup, migrations, and health. Only after both platforms pass does it create the release tags from the tested digests with `docker buildx imagetools create` and verify the multi-architecture index.

Conventional commit examples:

| Commit                                                           | Bump                      |
| ---------------------------------------------------------------- | ------------------------- |
| `fix: correct drawing autosave`                                  | Patch (`0.1.0` → `0.1.1`) |
| `feat: add drawing history`                                      | Minor (`0.1.0` → `0.2.0`) |
| `feat!: change the workspace API` or a `BREAKING CHANGE:` footer | Major (`0.1.0` → `1.0.0`) |
| `docs:`, `chore:`, or `ci:` without a breaking change            | No release on their own   |

Use conventional commit messages on the commits that land on `main` (including the squash-merge title). Release PRs remain manually mergeable; future releases are not auto-merged.

### GitHub configuration

In **Settings → Environments → `release`**, configure the environment secrets **`DOCKER_USERNAME`** and **`DOCKER_PASSWORD`** (a registry key with pull + push on the `drawspace` project). Publishing jobs pass them only to the credential check and registry login steps; using secrets ensures GitHub masks their values in logs. Only publishing jobs use this environment and these credentials. Credentials are not passed to Docker builds or exposed to pull-request CI.

The repository must allow GitHub Actions to create pull requests. The Release Please job requests `contents: write`, `issues: write`, `pull-requests: write`, and `actions: write` (for dispatching CI on the release PR). All other jobs use read-only GitHub permissions. Environment approvals, if configured, gate registry publication.

GitHub does not run `pull_request` workflows for PRs created with `GITHUB_TOKEN`. Release Please explicitly dispatches CI on the bot PR's branch, which runs the checks on its actual commit without requiring a PAT. Similarly, Docker publication is a reusable job in the release workflow, not a separate tag event that GitHub would suppress.

There is no manual publishing path: neither Release Please nor Publish Docker image can be dispatched by hand. If publication fails, fix the cause (for example the `release` environment secrets) and use **Re-run failed jobs** on the failed Release Please run. The re-run publishes the same release commit without creating or bumping another version; platforms that already passed reuse their tested digests, and no tag is created until every platform passes. Once a run can no longer be re-run, republishing an existing release requires a reviewed, one-off workflow change. Publishing is serialized to avoid overlapping updates to release aliases.

## Local development

Requirements: Node.js 22+, pnpm 10, and PostgreSQL 17.

```bash
corepack enable
pnpm install
cp .env.example .env
```

Set `DATABASE_URL` to your local PostgreSQL database, and ensure `APP_URL` matches the dev server. Next.js loads `.env` automatically; the migration script needs the variables explicitly supplied:

```bash
node --env-file=.env scripts/migrate.mjs
pnpm dev
```

`pnpm install` copies Excalidraw's font assets into `public/excalidraw-assets`. They are also copied before every build. The generated folder is ignored by Git.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Discord's integration tests exercise real PostgreSQL transactions and mock only provider HTTP calls and Next.js request/session adapters. Run them against a **migrated, disposable database**, never production:

```bash
DATABASE_URL=postgres://drawspace:test-password@localhost:5432/drawspace_test pnpm db:migrate
TEST_DATABASE_URL=postgres://drawspace:test-password@localhost:5432/drawspace_test pnpm test:integration
```

CI runs these tests against its disposable PostgreSQL service. No real Discord credentials or network calls to Discord are needed for the automated tests.

For end-to-end tests, first start the application and database on the configured origin:

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
# For a non-default port:
E2E_BASE_URL=http://localhost:3100 pnpm test:e2e
```

The end-to-end suite creates uniquely named test accounts in the running database. Run it against a disposable test instance, not your production database. It checks authentication, tenant isolation, viewer/editor permissions, CSRF protection, scene/image persistence, version conflicts, share revocation, the signup/editor UI, and guest persistence.

## Role matrix

| Capability                            | Owner | Admin | Editor | Viewer |
| ------------------------------------- | :---: | :---: | :----: | :----: |
| View and export drawings              |   ✓   |   ✓   |   ✓    |   ✓    |
| Personal favorites                    |   ✓   |   ✓   |   ✓    |   ✓    |
| Create/edit/duplicate/delete drawings |   ✓   |   ✓   |   ✓    |        |
| Create/revoke public share links      |   ✓   |   ✓   |   ✓    |        |
| Rename workspace                      |   ✓   |   ✓   |        |        |
| Add/manage editors and viewers        |   ✓   |   ✓   |        |        |
| Add/manage admins                     |   ✓   |       |        |        |
| Delete workspace                      |   ✓   |       |        |        |

The owner cannot be removed or demoted. Admins cannot promote themselves or other members to admin/owner. Permission checks run on the server for every protected operation. Workspace mutations and membership changes are serialized in a transaction to avoid revocation races.

## Project map

```text
src/app/                    Next.js pages and catch-all JSON API
src/components/ui/          shadcn/ui-pattern components built on Radix
src/components/             dashboard, workspace management, and Excalidraw integration
src/lib/                    auth, SQL data access, permissions, validation, and templates
migrations/                 versioned PostgreSQL migrations
scripts/                    migration runner and local asset copying
tests/unit/                 permissions, credentials, and validation tests
tests/e2e/                  browser and API integration tests
Dockerfile + compose.yaml   deployment
```

## Scope

This is shared **persistent workspace storage**, not simultaneous multiplayer editing. Shared viewers see the latest drawing after reloading. Concurrent edits are protected by version checks; on a conflict, export your local work and reload rather than overwriting another person's save. Apart from optional Discord OAuth, the app has no other SSO providers, email verification at signup, owner transfer, drawing history, or soft-delete/trash. Drawings have a 16 MB API payload limit. Guest mode uses browser storage, whose capacity depends on the browser.

## Credits

Drawspace is an independent application, not the official Excalidraw service or Excalidraw+. The editor is provided by [`@excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw), licensed under MIT. UI components follow [shadcn/ui](https://ui.shadcn.com/) conventions and use [Radix UI](https://www.radix-ui.com/) primitives. These projects and their dependencies retain their respective licenses.
