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
