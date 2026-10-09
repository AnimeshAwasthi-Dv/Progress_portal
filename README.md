# Task Manager Portal

Internal team dashboard backed by a local PostgreSQL database.

## Local setup

1. Install Node.js and make sure PostgreSQL is running.
2. Create the PostgreSQL database named `task` if it does not already exist.
3. Copy `.env.example` to `.env` and set `DATABASE_URL` to the connection string for that database. Keep the connection string private; `.env` is git-ignored.
4. Install dependencies and start the app:

   ```sh
   npm install
   npm run dev
   ```

The development command starts the Vite frontend and the local API. The API listens on `127.0.0.1:3001`; Vite proxies `/api` requests to it.

On startup, the API creates the `employees`, `project_allotments`, and `daily_progress_reports` tables when missing, and adds missing assignment fields without changing existing employee data. Existing assistance contacts are preserved when the assistance list is initialized. Project allotments are inserted idempotently from `server/seedProjectAllotments.ts`. The home dashboard presents the task register as a spreadsheet-style worksheet with employee, project, assigned work, multiple assistance contacts, and optional Git repository link. Use **Add Task** to assign a task to one or more team members, add one or more assistance contacts, and choose its initial progress. Add or edit a task's assistance list or Git repository URL from any task row. Update progress from the status control in the task details; progress changes are saved to PostgreSQL. Existing tasks receive the initial progress value `Not Started`.

Use **Daily Reports** to review the reports visible to the active user for a selected date. Individual reports are attributed to the active profile; managers see reports within their authorized team/project scope.

## Identity and access control

The current `x-user-id`/local-storage identity selector is a development simulator, not production authentication. API routes enforce role and project/team membership against PostgreSQL, but a client can spoof another active user ID. Replace the simulator with verified credentials and server-managed sessions before exposing the application to untrusted users.

Employee deactivation is a soft removal that preserves historical records. Active assigned tasks must be reassigned before the account can be deactivated.

## Build

```sh
npm run build
```

Run database-backed authorization checks with:

```sh
npm run test:authorization
```
