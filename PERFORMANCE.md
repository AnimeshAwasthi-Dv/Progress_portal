# Performance changes and verification

## Follow-up to the deployed Lighthouse PDF (October 13, 2026)

The supplied report audited the authenticated desktop dashboard: 96 performance, 94 accessibility, 100 best practices and 92 SEO. Its robots failure came from the SPA HTML being returned for `/robots.txt`. Read-only checks also confirmed the deployed JavaScript had no cache or compression headers.

Changes for this report:

- Added `public/robots.txt` and an exact Nginx location so crawler requests cannot fall through to HTML.
- Increased contrast for sign-out, New Assignment, sidebar headings, empty states and secondary dashboard text.
- Generate 48/96/192px WebP logo variants during build/dev startup and select them with `srcset`, with explicit image dimensions. Files are 512/1,176/2,494 bytes versus the original 11,440-byte PNG.
- Start the initial authorized data requests in parallel with downloading the workspace chunk, then reuse those promises instead of fetching twice.
- Added an HTTPS Nginx template for the actual domain with HTTP/2, static asset caching and both JavaScript compression MIME types. Apply it to the active HTTPS virtual host as described in `deploy/EC2.md`; changing the repository alone does not update the live server.
- Added an authenticated dashboard accessibility regression check and robots/image/cache response tests.

The authenticated audit fixture is available with `node scripts/performance-server.mjs --authenticated` (set `PERF_PORT` to choose a port). It uses synthetic data, does not connect to a database, and is only a local testing server. Audit it with Lighthouse's `--preset=desktop` to match the PDF's device class. Browser/database/network conditions still differ from production.

Final local authenticated desktop results: **100 performance, 100 accessibility, 100 best practices, 100 SEO**; FCP 0.4 s, LCP 0.5 s, TBT 0 ms and CLS 0. The production build and all five browser checks passed, including the authenticated axe accessibility scan. Reports: `performance-results/dashboard.report.html` and `.json`. These results do not certify the live deployment; HTTPS configuration still needs to be applied and verified there.

## Measured result (October 12, 2026)

Final local Lighthouse mobile run against the compressed, prerendered production sign-in page:

| Metric | Result |
| --- | --- |
| Performance | 98/100 |
| Accessibility | 100/100 |
| Best practices | 100/100 |
| SEO | 100/100 |
| First contentful paint | 1.5 s |
| Largest contentful paint | 1.8 s |
| Total blocking time | 120 ms |
| Cumulative layout shift | 0 |
| Speed index | 1.5 s |

`npm run build`, all four Playwright checks, and the isolated database regression test passed. These are local measurements, not an apples-to-apples comparison with the supplied deployed screenshot. A universal 100 performance score or production throughput has not been established. Full audit details are in `performance-results/lighthouse.report.html` and `.json`.

## Implementation

- Production builds prerender the sign-in screen, then React hydrates it. The development server continues to render normally. No user data is embedded in HTML.
- The shared stylesheet is inlined into production HTML to remove a render-blocking request. This adds about 10 KB compressed to each HTML navigation in exchange for an earlier first paint; fonts and JavaScript remain independently cacheable.
- The authenticated workspace is dynamically imported after session discovery or login. Anonymous visitors do not download its JavaScript.
- DM Sans is served locally. Sign-in no longer depends on Google Fonts requests.
- Workload, daily reports and legacy allotments load when their views are opened. Startup reuses the identity returned by session discovery instead of requesting it again.
- Session discovery uses a public nullable endpoint; protected endpoints still enforce authentication. API responses use private/no-store caching and compression.
- Session resolution selects the user and team in one SQL query without caching authorization. Password hashing uses asynchronous scrypt with the existing hash format and parameters.
- Task collaborators aggregate separately from the wide task rows, avoiding a GROUP BY across the full task result. Dashboard team totals use COUNT instead of loading and aggregating every team member.
- Added indexes support collaborator visibility, case-insensitive email login, date-filtered daily reports, task children and notification ordering. The existing case-insensitive username index is reused.
- The Nginx example compresses responses, caches fingerprinted assets for one year and revalidates HTML.

## Repeatable checks

```sh
npm ci
npm run build
npm run test:performance
npm run test:ui
```

Database regression tests run against isolated PGlite PostgreSQL, never the configured application database. They cover schema initialization, password verification/change, session revocation, session query count, collaborator task visibility and dashboard counts. The existing `test:authorization` suite still requires a separately configured database with its expected role fixtures.

Browser tests use installed Microsoft Edge by default. Set `BROWSER_CHANNEL=chrome` to use installed Chrome, or adjust the Playwright configuration for your CI browser. They verify pre-JavaScript mobile content, delayed session discovery, deferred workspace/data requests and login errors.

For a local production frontend audit, run `npm run perf:serve` in one terminal and `npm run perf:audit` in another. Set `CHROME_PATH` to the installed browser executable when Lighthouse cannot discover it. Reports are written to `performance-results/`.

The local fixture serves the actual production assets with compression and caching, and returns an anonymous session. It does **not** benchmark database latency or authenticated endpoints. Run Lighthouse against the deployed HTTPS URL and representative authenticated pages to validate hosting performance. Use representative data and EXPLAIN (ANALYZE, BUFFERS) to measure database query plans before assigning production latency or throughput targets.

## Deployment

Deploy the complete `dist` directory after `npm run build`; prerendering is part of that command. Apply the updated Nginx settings and reload Nginx after validating its configuration. Deploy the compiled API and production dependencies together. The new indexes are created by database initialization at API startup; on large databases, schedule deployment for a maintenance window because index creation can block writes.

Large task/directory datasets still return complete authorized lists. Server pagination and viewport virtualization should be driven by representative data and UI requirements; this change does not truncate existing results or claim production load capacity without measurement.
