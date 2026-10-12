// Production frontend fixture; --authenticated uses a synthetic admin account.
// Use a deployed URL to audit actual backend/network latency.
import express from "express";
import compression from "compression";
const app = express();
const authenticated = process.argv.includes("--authenticated");
const user = { id: 1, name: "Test Admin", username: "test", email: "test@example.com", role: "Admin",
  department: "Technical", designation: "Admin", isActive: true, mustChangePassword: false };
app.use(compression());
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
app.get("/api/auth/session", (_req, res) => res.json(authenticated ? user : null));
if (authenticated) {
  app.get("/api/auth/me", (_req, res) => res.json(user));
  app.get("/api/analytics/dashboard", (_req, res) => res.json({
    totalTasks: 0, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0, inReviewTasks: 0,
    blockedTasks: 0, overdueTasks: 0, totalProjects: 0, totalUsers: 1, totalTeams: 0,
    personal: null, recentActivity: [],
  }));
  app.get("/api/*", (_req, res) => res.json([]));
}
app.get("/api/auth/me", (_req, res) => res.status(401).json({ error: "Please sign in." }));
app.use("/assets", express.static("dist/assets", { maxAge: "1y", immutable: true }));
app.use(express.static("dist", { maxAge: 0 }));
app.listen(Number(process.env.PERF_PORT || 4173), "127.0.0.1");
