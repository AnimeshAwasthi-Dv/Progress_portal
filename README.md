# DecTrack

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

On startup, the API creates the required tables when missing and adds missing assignment fields without changing existing employee data. It does not create demo employees, projects, tasks, notifications, or allotments. On a fresh database, it creates only the initial Admin profile and the Sales and Technical teams so an administrator can sign in and add organization data manually. Set `INITIAL_ADMIN_PASSWORD` in `.env` before starting with an empty database; use a unique password of at least 12 characters.

Use **Daily Reports** to review the reports visible to the active user for a selected date. Individual reports are attributed to the active profile; managers see reports within their authorized team/project scope.

## Identity and access control

Users sign in with their profile credentials. Passwords and session tokens are stored as hashes, sessions are managed by the API, and cookies use `Secure` when `NODE_ENV=production`. Keep the API behind HTTPS and do not expose port 3001 directly.

Employee deactivation is a soft removal that preserves historical records. Active assigned tasks must be reassigned before the account can be deactivated.

## EC2 deployment

See [deploy/EC2.md](deploy/EC2.md) for the production build, systemd service, Nginx reverse proxy, secure environment file, and AWS network setup. The build produces a static frontend in `dist/` and a compiled API in `server-dist/`.

## Build

```sh
npm run build
```

Run database-backed authorization checks with:

```sh
npm run test:authorization
```
