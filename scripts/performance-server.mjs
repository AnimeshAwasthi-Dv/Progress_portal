// Production frontend fixture; API responses are deliberately unauthenticated.
// Use a deployed URL to audit actual backend/network latency.
import express from "express";
import compression from "compression";
const app = express();
app.use(compression());
app.get("/api/auth/session", (_req, res) => res.json(null));
app.get("/api/auth/me", (_req, res) => res.status(401).json({ error: "Please sign in." }));
app.use("/assets", express.static("dist/assets", { maxAge: "1y", immutable: true }));
app.use(express.static("dist", { maxAge: 0 }));
app.listen(4173, "127.0.0.1");
