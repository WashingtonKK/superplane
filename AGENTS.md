# Repository Guidelines

## Project Structure & Module Organization

- Backend (GoLang): cmd/ with pkg/ (GoLang code), and test/.
- Frontend (TypeScript/React): web_src/ built with Vite.
- Tooling: Makefile (common tasks), protos/ (protobuf definitions for the API), scripts/ (protobuf generation), db/ (database structure and migrations).
- Documentation: Markdown files in docs/.
- gRPC API implementation in in pkg/grpc/actions
- Database models in pkg/models
- Integration component implementations: pkg/integrations/<integration>/
- Workflow v2 UI component mappers: web_src/src/pages/workflowv2/mappers/<integration>/

## Pull Request Guidelines

- PR titles must follow Conventional Commits and include a release-type prefix: `feat:`, `fix:`, `chore:`, or `docs:` (CI enforces this).

## Build, Test, and Development Commands

- Setup dev environment: `make dev.setup`
- Run server: `make dev.start` - UI at http://localhost:8000
- One-shot backend tests: `make test` (Golang).
- Targeted backend tests: `make test PKG_TEST_PACKAGES=./pkg/workers`
- Targeted E2E tests: `make e2e E2E_TEST_PACKAGES=./test/e2e/workflows`
- For E2E test authoring, see [docs/development/e2e_tests.md](docs/development/e2e_tests.md)
- After updating UI code, always run `make check.build.ui` to verify everything is correct
- After editing JS code, always run `make format.js` to make sure that the files are consistently formatted
- After editing Golang code, always run `make format.go` to make sure that files are consistently formatted
- After updating GoLang code, always check it with `make lint && make check.build.app`
- **NEVER MANUALLY CREATE MIGRATION FILES**. ALWAYS use `make db.migration.create NAME=<name>` to generate DB migrations. Always use dashes instead of underscores in the name. We do not write migrations to rollback, so leave the `*.down.sql` files empty. After adding a migration, run `make db.migrate DB_NAME=<DB_NAME>`, where DB_NAME can be `superplane_dev` or `superplane_test`
- When validating enum fields in protobuf requests, ensure that the enums are properly mapped to constants in the `pkg/models` package. Check the `Proto*` and `*ToProto` functions in pkg/grpc/actions/common.go.
- When adding a new worker in pkg/workers, always add its startup to `cmd/server/main.go`, and update the docker compose files with the new environment variables that are needed.
- After adding new API endpoints, ensure the new endpoints have their authorization covered in `pkg/authorization/interceptor.go`
- For UI component workflow, see [web_src/AGENTS.md](web_src/AGENTS.md)
- For new components or triggers, see [docs/contributing/component-implementations.md](docs/contributing/component-implementations.md)
- For component design guidelines and quality standards, see [docs/contributing/component-design.md](docs/contributing/component-design.md)
- Whenever adding or updating components/triggers that should be AI-assisted, always create or update the matching skill file in `templates/skills/` (for example `templates/skills/<component-or-trigger>.md`).
- After updating the proto definitions in protos/, always regenerate them, the OpenAPI spec for the API, and SDKs for the CLI and the UI:
  - `make pb.gen` to regenerate protobuf files
  - `make openapi.spec.gen` to generate OpenAPI spec for the API
  - `make openapi.client.gen` to generate GoLang SDK for the API
  - `make openapi.web.client.gen` to generate TypeScript SDK for the UI

## Coding Style & Naming Conventions

- Tests end with \_test.go
- Always prefer early returns over else blocks when possible
- GoLang: prefer `any` over `interface{}` types
- GoLang: when checking for the existence of an item on a list, use `slice.Contains` or `slice.ContainsFunc`
- When naming variables, avoid names like `*Str` or `*UUID`; Go is a typed language, we don't need types in the variables names
- When writing tests that require specific timestamps to be used, always use timestamps based off of `time.Now()`, instead of absolute times created with `time.Date`
- The name of the application is "SuperPlane", not "Superplane" in all user-facing text (user interfaces, emails, notifications, documentation, etc.).
- Frontend: do not create or use `web_src/src/utils/*` or `utils.ts` files. Put shared non-React helpers in `web_src/src/lib/`, and put React-specific reusable logic in `web_src/src/hooks/`.

## Database Transaction Guidelines

When working with database transactions, follow these rules to ensure data consistency:

- **NEVER** call `database.Conn()` inside a function that receives a `tx *gorm.DB` parameter

  - ❌ Bad: `func process(tx *gorm.DB) { user, _ := models.FindUser(id) }` where FindUser calls `database.Conn()`
  - ✅ Good: `func process(tx *gorm.DB) { user, _ := models.FindUserInTransaction(tx, id) }`

- **Always propagate** the transaction context through the entire call chain

  - Pass `tx` as the first parameter to all functions that need database access
  - If a model method is used within a transaction, create an `*InTransaction()` variant that accepts `tx`

- **Context constructors** must accept `tx *gorm.DB` if they perform database queries

  - ❌ Bad: `NewAuthContext(orgID, service)` that internally calls `database.Conn()`
  - ✅ Good: `NewAuthContext(tx, orgID, service)` that uses the passed transaction

- **When creating new model methods**:
  - Create both variants: `FindUser()` and `FindUserInTransaction(tx *gorm.DB)`
  - The non-transaction variant should call the transaction variant: `return FindUserInTransaction(database.Conn(), ...)`

**Why this matters**: Using `database.Conn()` inside transaction contexts breaks isolation, causes data inconsistency on rollback, and can lead to race conditions.

## Cursor Cloud specific instructions

### Services overview

All development runs inside Docker containers orchestrated via `docker-compose.dev.yml`:

| Service | Purpose | Port(s) |
|---------|---------|---------|
| `app` | Go backend + Vite frontend (hot-reload via `air` + `npm run dev`) | 8000 (HTTP/API), 50051 (gRPC), 5173 (Vite HMR) |
| `agent` | Python AI agent (FastAPI/uvicorn, hot-reload) | 8090 |
| `db` | PostgreSQL 17.5 | 5432 |
| `rabbitmq` | Message broker | 5672, 15672 (mgmt UI) |

### Starting the environment

After the update script runs, start services with:

```sh
make dev.start   # starts containers + waits for health at http://localhost:8000
```

### Running tests

Backend tests require the `superplane_test` database to exist. If it doesn't, create it:

```sh
make db.create DB_NAME=superplane_test
make db.migrate DB_NAME=superplane_test
make -C agent db.create DB_NAME=agents_test DB_PASSWORD=the-cake-is-a-lie
make -C agent db.migrate DB_NAME=agents_test DB_PASSWORD=the-cake-is-a-lie
```

Then run tests per the Build, Test, and Development Commands section above.

### Key gotchas

- `make format.js` and `make format.js.check` run **outside** Docker (directly on the host). They require Node.js 22.x and `npm ci` in `web_src/` to be run on the host.
- `make lint`, `make check.build.app`, `make check.build.ui`, and `make test` all run **inside** Docker via `docker compose exec` or `docker compose run`.
- The `dev.setup` Makefile target only creates `superplane_dev` and `agents_dev` databases. You must separately create `superplane_test` and `agents_test` databases (see above) before running unit/integration tests.
- Owner setup is required on a fresh database. POST to `/api/v1/setup-owner` with `{"email":"...","first_name":"...","last_name":"...","password":"..."}`.
- Login uses form-encoded POST to `/login` (not JSON, not `/api/v1/login`).
- gRPC gateway API calls require `X-Organization-ID` header and the `account_token` cookie from login.
- Docker must be running before any `make` commands that use containers. Start dockerd if not already running.
