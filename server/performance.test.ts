import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Never connect to a configured application database from this test.
process.env.DATABASE_URL = "postgresql://test:test@localhost/task";
process.env.INITIAL_ADMIN_PASSWORD = "isolated-test-password";
const db = await import("./db.js");
const postgres = new PGlite();
let queryCount = 0;
const query = async (sql: string, values?: unknown[]) => {
  queryCount++;
  const result = values?.length ? await postgres.query(sql, values) : (await postgres.exec(sql)).at(-1)!;
  return { rows: result.rows, rowCount: result.affectedRows };
};
// Adapter keeps the production SQL intact, including migrations and indexes.
db.pool.query = query as typeof db.pool.query;
db.pool.connect = (async () => ({ query, release() {} })) as unknown as typeof db.pool.connect;
after(async () => { await postgres.close(); await db.pool.end(); });

test("optimized queries retain authentication and visibility semantics", async () => {
  await db.initializeDatabase();
  await db.initializeDatabase(); // Index/schema changes remain idempotent.
  const admin = await db.authenticateUser("ADMIN", "isolated-test-password");
  assert.ok(admin);
  assert.equal(await db.authenticateUser("admin", "wrong-password"), null);
  const token = await db.createAuthSession(admin.id);
  queryCount = 0;
  assert.deepEqual(await db.getUserForSession(token), admin);
  assert.equal(queryCount, 1, "session identity must use a single query");
  const otherToken = await db.createAuthSession(admin.id);
  assert.ok(await db.changeUserPassword(admin.id, "isolated-test-password", "changed-test-password", token));
  assert.equal(await db.getUserForSession(otherToken), null);
  assert.ok(await db.authenticateUser("admin", "changed-test-password"));
  assert.equal(await db.authenticateUser("admin", "isolated-test-password"), null);

  const member = await db.createUser({ name: "Member", username: "member", email: "member@example.com",
    password: "member-test-password", role: "Individual", department: "Technical", designation: "Engineer" });
  const project = await db.createProject({ name: "Test Project", code: "TEST", managerId: admin.id });
  await query(`INSERT INTO tasks (task_code, title, project_id, assigned_by_user_id, assigned_to_user_id)
    VALUES ('T1', 'Visible', $1, $2, $2), ('T2', 'Private', $1, $2, $2)`, [project.id, admin.id]);
  const taskRows = await query("SELECT id FROM tasks ORDER BY id");
  await query("INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2)", [(taskRows.rows[0] as { id: number }).id, member.id]);
  const tasks = await db.listTasks({ viewer: member });
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].title, "Visible");
  assert.deepEqual(tasks[0].collaboratorIds, [member.id]);
  const all = await db.listTasks({ viewer: admin });
  assert.equal(all.length, 2);
  assert.deepEqual(all.find((task) => task.title === "Private")?.collaboratorIds, []);
  for (const viewer of [admin, member]) {
    const metrics = await db.getDashboardMetrics(viewer);
    assert.equal(metrics.totalTeams, (await db.listTeams(viewer)).length);
    assert.equal(metrics.totalTasks, (await db.listTasks({ viewer })).length);
  }
  await db.revokeAuthSession(token);
  assert.equal(await db.getUserForSession(token), null);
});
