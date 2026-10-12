# EC2 deployment

This setup runs the React build from Nginx and keeps the Node API bound to localhost behind Nginx. PostgreSQL should be on RDS or another private database host.

## 1. Prepare AWS networking

- Allow inbound SSH only from your admin IP. Allow inbound HTTP/HTTPS on ports 80 and 443.
- Do not open API port 3001 to the internet. The API listens on `127.0.0.1` for the local Nginx proxy.
- Put the database in a private subnet. Allow its PostgreSQL port from the EC2 instance security group only.
- Create the PostgreSQL database named `task`; the application validates this database name.

## 2. Build and install the app

Install a supported Node.js LTS release, PostgreSQL client tools if needed, and Nginx on the EC2 instance. Copy or clone the project into `/opt/task-manager`, then run:

```bash
cd /opt/task-manager
npm ci
npm run build
npm prune --omit=dev
```

The build creates `dist/` (the browser app) and `server-dist/` (the compiled API). `npm start` starts the compiled API.

Create a dedicated service account and secure environment file:

```bash
sudo useradd --system --home /opt/task-manager --shell /usr/sbin/nologin task-manager
sudo install -d -o root -g task-manager -m 0750 /etc/task-manager
sudo install -o root -g task-manager -m 0640 /dev/null /etc/task-manager/task-manager.env
sudo nano /etc/task-manager/task-manager.env
```

Set the following values in that file. URL encode special characters in the database username and password.

```ini
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://DB_USER:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/task?sslmode=require
INITIAL_ADMIN_PASSWORD=USE_A_UNIQUE_RANDOM_VALUE_AT_LEAST_16_CHARACTERS_LONG
```

`INITIAL_ADMIN_PASSWORD` is used only when an empty database is initialized. It creates only the Admin profile and the Sales and Technical teams; employee profiles, projects, tasks, and allotments are added manually. Keep the value private and remove it from the environment file after the first successful initialization. Existing databases retain their current credentials.

If deploying a database previously used for development, change every seeded account password before allowing public access. Earlier versions reset those accounts to the shared development password `@12345` on startup; this build no longer changes production passwords during startup.

Install the service unit:

```bash
sudo cp /opt/task-manager/deploy/task-manager.service.example /etc/systemd/system/task-manager.service
sudo systemctl daemon-reload
sudo systemctl enable --now task-manager
sudo systemctl status task-manager
```

If Node is installed outside `/usr/bin/node`, update `ExecStart` in the unit to the path returned by `command -v node`.

## 3. Configure Nginx

Set `server_name` in `deploy/nginx.conf.example` to your domain or EC2 public DNS name, then install it as an Nginx site. On Ubuntu, use `/etc/nginx/sites-available/task-manager` and link it from `sites-enabled`; Amazon Linux commonly uses `/etc/nginx/conf.d/task-manager.conf`.

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

Confirm `http://127.0.0.1:3001/api/health` returns `{"status":"ok",...}` on the instance and that the site loads through Nginx. Configure HTTPS for the domain before sharing the app. Production authentication cookies are marked `Secure`, so sign-in requires HTTPS in a browser.

### Existing HTTPS deployment (Lighthouse report fixes)

Use `deploy/nginx.https.conf.example` as the production site definition for `task.admindectrocel.online`. Preserve the installed certificate paths and set `root` to the actual deployed `dist` directory. Replace the existing matching site definition; do not create a second site with the same hostname. Apply the cache and gzip directives to the **443 server block** that serves the application, not only the port 80 redirect block.

The template uses `http2 on` for Nginx 1.25.1 and later (the audited server reports 1.28.3). For an older installation, use `listen 443 ssl http2` and `listen [::]:443 ssl http2` instead, and omit `http2 on`. See the [official HTTP/2 documentation](https://nginx.org/en/docs/http/ngx_http_v2_module.html).

After rebuilding the application and updating that site definition:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl --http2 -I https://task.admindectrocel.online/
curl -i https://task.admindectrocel.online/robots.txt
# Substitute a current hashed .js asset path from the deployed index.html:
curl -I -H 'Accept-Encoding: gzip' https://task.admindectrocel.online/assets/ACTUAL-BUNDLE.js
```

Expect HTTP/2, a plain-text robots file, and `Cache-Control: public, max-age=31536000, immutable` plus `Content-Encoding: gzip` on JavaScript. The [gzip MIME types](https://nginx.org/en/docs/http/ngx_http_gzip_module.html#gzip_types) include both JavaScript MIME types. Missing assets must return 404 rather than the SPA document. HTML revalidates; personalized API responses remain private/no-store. Robots directives are crawler hints, not access controls; API authorization remains enforced.

## 4. Updating the deployment

Copy the updated source to the instance and rebuild with the same commands in step 2. Then restart the API and reload Nginx if its configuration changed:

```bash
sudo systemctl restart task-manager
sudo journalctl -u task-manager -n 100 --no-pager
```

Keep `.env`, the systemd environment file, database credentials, and TLS private keys out of source control and public directories.
