# Durozen CRM

Sales lead management CRM for Durozen Technologies.

## Run locally

1. Install PostgreSQL locally and create a database named `crm` (matching `backend/.env.example`).
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` and a private `JWT_SECRET`. Configure JWT lifetime with `JWT_EXPIRES_IN_MINUTES` (positive whole minutes; defaults to 480).
3. Install backend dependencies: `npm install --prefix backend`.
4. Install frontend dependencies: `npm install --prefix frontend`.
5. Apply pending Prisma migrations and generate Prisma Client: `npm run prisma:migrate --prefix backend` followed by `npm run prisma:generate --prefix backend`. The permissions migration preserves existing users by converting their old account types to custom role labels and their access to individual permissions. A follow-up migration renames the legacy Administrator label to Admin and protects CLI-created Admin accounts from changes by other team managers.
6. Create an Admin account securely from an interactive terminal: `npm run admin:create --prefix backend`. Enter a full name and email, then a password of at least 12 characters twice. Password entry is hidden and the password is stored as a hash.
7. From the `frontend` directory, start the API with `npm run dev:backend`.
8. In a separate terminal, from the `frontend` directory, start the web app with `npm run dev`.

## Install with Docker

Install Docker Desktop (or Docker Engine with the Compose plugin), then from the repository root:

1. Copy the Docker environment template: `Copy-Item .env.docker.example .env.docker` (PowerShell), or `cp .env.docker.example .env.docker` (macOS/Linux).
2. Edit `.env.docker`. Set a long random `POSTGRES_PASSWORD` and use the same value in `DATABASE_URL`; set a private `JWT_SECRET` of at least 32 characters. For local use, keep `DATABASE_URL` pointed at `db` and `NEXT_PUBLIC_API_URL` at `http://localhost:4000/api`.
3. Build and start the database, API, and web app: `docker compose --env-file .env.docker up --build -d`.
4. After the backend has completed its startup migrations, create the first Admin account interactively:

   ```powershell
   docker compose --env-file .env.docker run --rm --entrypoint node backend dist/admin/create-admin.js
   ```

   Enter the Admin's name and email, then a password of at least 12 characters twice. Password entry is hidden. Open `http://localhost:3000/login` and sign in with those credentials. The command connects to the same database used by the running API.

See [DOCKER.md](./DOCKER.md) for Docker configuration, useful Compose commands, and production deployment notes. Do not commit `.env.docker` or place secrets in `NEXT_PUBLIC_*` variables.

Open `http://localhost:3000/login` and sign in with the account's email and password. Access to pages and actions is controlled by permissions assigned to each person; custom roles are labels only and do not grant permissions. Admin accounts can only be provisioned using `npm run admin:create --prefix backend`; the initial Admin is given all permissions and protected from changes by other team managers. Use **Team → User Management** to create users, assign custom role labels, and select each person's permissions independently. Users granted access can view and work across all records; there is no manager/team-based data scoping. JWTs remain valid until their configured expiry after logout or password changes; expired tokens prompt a sign-in alert, and deactivated accounts are rejected on authenticated requests.

Lead assignment and reassignment are available in the Leads workspace and can target any active user. Moving a lead from New Lead to Contacted or from Contacted to Interested requires contact and qualification details; these are saved to the lead and its activity history. Grant `manage_team` to users who should administer user accounts and role labels.

## Architecture

- `frontend`: Next.js responsive dashboard.
- `backend`: NestJS REST API with JWT authentication and per-user permission authorization, including the local PostgreSQL schema.
- `/login`: shared login for all users.
- `/dashboard`: workspace navigation and content are determined by each user's permissions.

The API requires every active lead to have an assigned user, next action, and follow-up date. You can run the app locally or use the Docker Compose setup described above.

Meetings support scheduled, completed, and cancelled history. Rescheduling updates the existing meeting and records the previous time in the lead activity history. Meeting lifecycle records are scoped through the associated lead; the meeting lifecycle migration preserves existing meetings as scheduled and does not backfill historical activity or follow-up associations.
