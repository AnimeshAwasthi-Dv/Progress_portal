import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("mobile sign-in content is present before JavaScript executes", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Username or email")).toBeVisible();
  await context.close();
});

test("sign-in paints while session lookup is still pending and does not load the workspace", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.route("**/api/auth/session", async (route) => {
    await pending;
    await route.fulfill({ json: null });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  expect(requests.some((url) => /\/assets\/App-/.test(url))).toBe(false);
  expect(requests.some((url) => url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com"))).toBe(false);
  release();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("login errors remain visible and allow retry", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401, json: { error: "Invalid credentials." } }));
  await page.goto("/");
  await page.getByLabel("Username or email").fill("test");
  await page.getByLabel("Password", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid credentials.");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("authenticated startup defers unrelated data and avoids another identity request", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 1000 });
  const paths: string[] = [];
  let releaseWorkspace!: () => void;
  const workspaceReady = new Promise<void>((resolve) => { releaseWorkspace = resolve; });
  let workspaceRequested = false;
  await page.route("**/assets/App-*.js", async (route) => {
    workspaceRequested = true;
    await workspaceReady;
    await route.continue();
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    paths.push(path);
    const json = path === "/api/auth/session" ? {
      id: 1, name: "Test Admin", username: "test", email: "test@example.com", role: "Admin",
      department: "Technical", designation: "Admin", isActive: true, mustChangePassword: false,
    } : path === "/api/analytics/dashboard" ? {
      totalTasks: 0, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0, inReviewTasks: 0,
      blockedTasks: 0, overdueTasks: 0, totalProjects: 0, totalUsers: 1, totalTeams: 0,
      personal: null, recentActivity: [],
    } : [];
    return route.fulfill({ json });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => workspaceRequested).toBe(true);
  // Six early API fetches must not occupy all HTTP/1.1 connections while
  // the JavaScript required to display the authenticated page is waiting.
  expect(paths).toEqual(["/api/auth/session"]);
  releaseWorkspace();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
  await expect.poll(() => paths.includes("/api/tasks")).toBe(true);
  expect(paths.filter((path) => path === "/api/auth/session")).toHaveLength(1);
  expect(paths).not.toContain("/api/analytics/workload");
  expect(paths).not.toContain("/api/project-allotments");
  expect(paths.some((path) => path.startsWith("/api/daily-reports"))).toBe(false);
  expect(errors).toEqual([]);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  for (const path of ["/api/users", "/api/teams", "/api/projects", "/api/tasks", "/api/analytics/dashboard", "/api/notifications"]) {
    expect(paths.filter((requested) => requested === path)).toHaveLength(1);
  }
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  const card = page.locator("button.card-hover").first();
  if (await card.count()) {
    expect(await card.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe("transform");
  }
});

test("crawler and asset responses have correct content types and cache headers", async ({ request, page }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("User-agent: *");
  expect(await robots.text()).not.toContain("<!doctype");
  await page.goto("/");
  const logo = page.locator('img[alt="Dectrocel logo"]:visible').first();
  const source = await logo.evaluate((image: HTMLImageElement) => image.currentSrc);
  expect(source).toMatch(/logo-(48|96|192)-.*\.webp$/);
  const image = await request.get(source);
  expect(image.headers()["cache-control"]).toContain("immutable");
  expect((await image.body()).byteLength).toBeLessThan(6000);
  expect((await request.get("/assets/missing.js")).status()).toBe(404);
});
