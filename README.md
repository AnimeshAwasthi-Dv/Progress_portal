# Who Is Doing What?

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

Use **Daily Reports** to review one report row per team member for a selected date. Each person can submit completed work, the next work planned, and optional blockers; a person's report can be edited for that date. Reports are stored by employee and date. Daily reports are check-ins attributed to the selected team member; this app does not currently require individual sign-in.

## Build

```sh
npm run build
```
