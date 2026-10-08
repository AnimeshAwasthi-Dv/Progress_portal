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

On startup, the API creates the `employees` and `project_allotments` tables when missing, and adds missing assignment fields without changing existing employee data. Project allotments are inserted idempotently from `server/seedProjectAllotments.ts`. The dashboard shows each task's employee, project, assigned work, progress, and assigner. Use **Add Task** to assign a task to one or more team members and choose its initial progress. Update progress from the status control in the task table; progress changes are saved to PostgreSQL. Existing tasks receive the initial progress value `Not Started`.

## Build

```sh
npm run build
```
