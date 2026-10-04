# Drawspace

A self-hosted home for sketches, diagrams, and shared ideas. Built with **Next.js App Router**, the actual **open-source Excalidraw editor**, **shadcn/ui-style Radix components**, Tailwind CSS, and PostgreSQL. Uses **pnpm** and **Prettier with `semi: false`**.

## Included

- Email/password registration and sign-in; hashed passwords, database-backed sessions, profile settings, password changes, and sign-out.
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

Use the same `.env` configuration as the local-build deployment. The override removes `build`, keeps the PostgreSQL volume and health checks, and defaults to the version committed in `compose.release.yaml`. Back up the database before upgrading. Override the image with `DRAWSPACE_IMAGE=cr.guneet.dev/drawspace/drawspace:0.1.0` to select a particular release, or `:latest` to follow the latest stable release.

Published tags include:

- `0.1.0` and `v0.1.0`: exact release version.
- `0.1`: latest patch in that minor line, updated when that release is the latest stable release.
- `latest`: latest stable GitHub release.
- `sha-<12-character-commit>`: the exact release source revision.
- `0.1.0-amd64` / `0.1.0-arm64`: the individual tested platform images.

Re-publishing an older release does not move `latest` or the minor-line alias backwards.

## CI/CD and automatic releases

The workflows in `.github/workflows/` use pinned action commit SHAs:

1. **CI** runs formatting, lint, TypeScript, unit tests, production builds, migrations, and Playwright tests against a disposable PostgreSQL service on pushes to `main` and pull requests. It can also be dispatched manually or called by another workflow.
2. **Release Please** analyzes conventional commits on `main`, maintains a release PR, and updates `package.json`, `CHANGELOG.md`, `.release-please-manifest.json`, and the default image version in `compose.release.yaml`. The first release is **`0.1.0`**; this initial-version setting does not pin later releases to the same version.
3. **Merge the release PR** when ready. Release Please creates the `vX.Y.Z` tag and GitHub release, then calls the publishing workflow directly. This works with the built-in `GITHUB_TOKEN`; no personal access token is required.
4. **Publish Docker image** checks the release tag/version, reruns CI on that exact commit, builds each platform on a native GitHub runner, starts each container against PostgreSQL to verify startup and migrations, pushes the tested platform images, and publishes/verifies the multi-architecture manifest.

Conventional commit examples:

| Commit                                                           | Bump                      |
| ---------------------------------------------------------------- | ------------------------- |
| `fix: correct drawing autosave`                                  | Patch (`0.1.0` → `0.1.1`) |
| `feat: add drawing history`                                      | Minor (`0.1.0` → `0.2.0`) |
| `feat!: change the workspace API` or a `BREAKING CHANGE:` footer | Major (`0.1.0` → `1.0.0`) |
| `docs:`, `chore:`, or `ci:` without a breaking change            | No release on their own   |

Use conventional commit messages on the commits that land on `main` (including the squash-merge title). Release PRs remain manually mergeable; future releases are not auto-merged.

### GitHub configuration

In **Settings → Environments → `release`**, configure the environment secrets **`DOCKER_USERNAME`** and **`DOCKER_PASSWORD`**. Publishing jobs expose them as environment variables with the same names; using secrets ensures GitHub masks their values in logs. Only publishing jobs use this environment and these credentials. Credentials are not passed to Docker builds or exposed to pull-request CI.

The repository must allow GitHub Actions to create pull requests. The Release Please job requests `contents: write`, `issues: write`, `pull-requests: write`, and `actions: write` (for dispatching CI on the release PR). All other jobs use read-only GitHub permissions. Environment approvals, if configured, gate registry publication.

GitHub does not run `pull_request` workflows for PRs created with `GITHUB_TOKEN`. Release Please explicitly dispatches CI on the bot PR's branch, which runs the checks on its actual commit without requiring a PAT. Similarly, Docker publication is a reusable job in the release workflow, not a separate tag event that GitHub would suppress.

To retry a failed image publication, dispatch **Publish Docker image** in the Actions tab with the existing GitHub release tag (for example `v0.1.0`). This validates the tag and republishes the same released source, without creating or bumping another version. Publishing is serialized to avoid overlapping updates to release aliases.

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

This is shared **persistent workspace storage**, not simultaneous multiplayer editing. Shared viewers see the latest drawing after reloading. Concurrent edits are protected by version checks; on a conflict, export your local work and reload rather than overwriting another person's save. The app has no SSO, email verification, password-reset email, owner transfer, drawing history, or soft-delete/trash. Drawings have a 16 MB API payload limit. Guest mode uses browser storage, whose capacity depends on the browser.

## Credits

Drawspace is an independent application, not the official Excalidraw service or Excalidraw+. The editor is provided by [`@excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw), licensed under MIT. UI components follow [shadcn/ui](https://ui.shadcn.com/) conventions and use [Radix UI](https://www.radix-ui.com/) primitives. These projects and their dependencies retain their respective licenses.
