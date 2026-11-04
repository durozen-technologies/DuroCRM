# Durozen CRM

Sales lead management CRM for Durozen Technologies.

## Run locally

1. Install PostgreSQL locally and create the database named in `DATABASE_URL` in `backend/.env.example` (currently `durozen_crm`).
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private `JWT_SECRET`. Configure JWT lifetime with `JWT_EXPIRES_IN_MINUTES` (positive whole minutes; defaults to 480).
3. Install backend dependencies: `npm install --prefix backend`.
4. Install frontend dependencies: `npm install --prefix frontend`.
5. Apply pending Prisma migrations and generate Prisma Client: `npm run prisma:migrate --prefix backend` followed by `npm run prisma:generate --prefix backend`. Migrations preserve existing users, protect CLI-created admins from management by other users, and add payment dates to logged payments.
6. Create an admin securely from an interactive terminal: `npm run admin:create --prefix backend`. Enter a full name and email, then a password of at least 12 characters twice. Password entry is hidden and the password is stored as a hash.
7. From the `frontend` directory, start the API with `npm run dev:backend`.
8. In a separate terminal, from the `frontend` directory, start the web app with `npm run dev`.

## Install with Docker

Install Docker Desktop (or Docker Engine with the Compose plugin), then from the repository root:

1. Copy the Docker environment template: `Copy-Item .env.docker.example .env.docker` (PowerShell), or `cp .env.docker.example .env.docker` (macOS/Linux).
2. Edit `.env.docker`. Set a long random `POSTGRES_PASSWORD` and use the same value in `DATABASE_URL`; set a private `JWT_SECRET` of at least 32 characters. For local use, keep `DATABASE_URL` pointed at `db` and `NEXT_PUBLIC_API_URL` at `http://localhost:4000/api`.
3. Build and start the database, API, and web app: `docker compose --env-file .env.docker up --build -d`.
4. After the backend has completed its startup migrations, create the first admin interactively:

   ```powershell
   docker compose --env-file .env.docker run --rm --entrypoint node backend dist/admin/create-admin.js
   ```

   Enter the admin's name and email, then a password of at least 12 characters twice. Password entry is hidden. Open `http://localhost:3000/login` and sign in with those credentials. The command connects to the same database used by the running API.

See [DOCKER.md](./DOCKER.md) for Docker configuration, useful Compose commands, and production deployment notes. Do not commit `.env.docker` or place secrets in `NEXT_PUBLIC_*` variables.

Open `http://localhost:3000/login` and sign in with the account's email and password. Custom roles define module permissions and subordinate roles; team accounts inherit permissions from their assigned role. A role sees and manages its own records and users in subordinate roles, including nested subordinate roles. Admin is a predefined system role with unrestricted access and is not configurable through Custom Roles. Admin accounts can only be provisioned using `npm run admin:create --prefix backend` and cannot be changed through team management. Use **Team → Custom Roles** to configure role permissions and hierarchy, then **Team → User Management** to create accounts and assign a configured role. JWTs remain valid until their configured expiry after logout or password changes; role permissions and hierarchy are loaded from the database for each authenticated request, expired tokens prompt a sign-in alert, and deactivated accounts are rejected on authenticated requests.

Lead assignment and reassignment are available in the Leads workspace and are limited to active users in the manager's subordinate hierarchy (Admin can target any active user). Moving a lead from New Lead to Contacted or from Contacted to Interested requires contact and qualification details; these are saved to the lead and its activity history. Grant `manage_team` to roles that should administer subordinate user accounts and custom roles.

## Architecture

- `frontend`: Next.js responsive dashboard.
- `backend`: NestJS REST API with JWT authentication and per-user permission authorization, including the local PostgreSQL schema.
- `/login`: shared login for all users.
- `/dashboard`: workspace navigation and content are determined by each user's permissions.

The API requires every active lead to have an assigned user, next action, and follow-up date. You can run the app locally or use the Docker Compose setup described above.

Meetings support scheduled, completed, and cancelled history. Rescheduling updates the existing meeting and records the previous time in the lead activity history. Meeting lifecycle records are scoped through the associated lead; the meeting lifecycle migration preserves existing meetings as scheduled and does not backfill historical activity or follow-up associations.
