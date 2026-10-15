import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  canAccessProject,
  deactivateUser,
  getDashboardMetrics,
  getTaskById,
  getTeamWorkloadAnalytics,
  listProjects,
  listTasks,
  listUsers,
  pool,
  type User,
} from "./db.js";

const admin = { id: 1, role: "Admin" as const, teamId: null };

async function activeUser(role: User["role"]) {
  const users = await listUsers(admin);
  const user = users.find((candidate) => candidate.role === role && candidate.isActive);
  assert.ok(user, `Expected an active ${role} account in the configured test database.`);
  return user;
}

after(async () => {
  await pool.end();
});

test("individual project, task, directory, and dashboard data is scoped", async () => {
  const employee = await activeUser("Employee");
  const [allProjects, visibleProjects, allTasks, visibleTasks, visibleUsers, metrics] = await Promise.all([
    listProjects(admin),
    listProjects(employee),
    listTasks({ viewer: admin }),
    listTasks({ viewer: employee }),
    listUsers(employee),
    getDashboardMetrics(employee),
  ]);

  assert.ok(visibleProjects.length <= allProjects.length);
  assert.ok(visibleTasks.every((task) =>
    task.assignedToUserId === employee.id || task.collaboratorIds?.includes(employee.id),
  ));
  assert.deepEqual(visibleUsers.map((user) => user.id), [employee.id]);
  assert.equal(metrics.totalTasks, visibleTasks.length);

  for (const project of visibleProjects) {
    assert.equal(await canAccessProject(employee, project.id), true);
  }

  const unrelatedTask = allTasks.find((task) =>
    task.assignedToUserId !== employee.id && !task.collaboratorIds?.includes(employee.id),
  );
  if (unrelatedTask) {
    assert.equal(await getTaskById(unrelatedTask.id, employee), null);
  }
});

test("manager analytics contain only visible team members and projects", async () => {
  const lead = await activeUser("Lead");
  const [visibleProjects, workload, metrics] = await Promise.all([
    listProjects(lead),
    getTeamWorkloadAnalytics(lead),
    getDashboardMetrics(lead),
  ]);

  assert.ok(visibleProjects.length > 0);
  assert.ok(workload.every((member) => member.teamId === lead.teamId || member.userId === lead.id));
  assert.equal(metrics.totalProjects, visibleProjects.filter((project) => project.status === "Active").length);
  for (const project of visibleProjects) {
    assert.equal(await canAccessProject(lead, project.id), true);
  }
});

test("individual contributors cannot deactivate another employee", async () => {
  const employee = await activeUser("Employee");
  const users = await listUsers(admin);
  const target = users.find((user) => user.role === "Employee" && user.isActive && user.id !== employee.id);
  if (!target) return;

  const result = await deactivateUser(employee, target.id, undefined, "authorization test");
  assert.deepEqual(result, { ok: false, code: "forbidden" });
});

test("the last active Admin cannot be deactivated", async () => {
  const users = await listUsers(admin);
  const activeAdmins = users.filter((user) => user.role === "Admin" && user.isActive);
  if (activeAdmins.length !== 1) return;

  const result = await deactivateUser(admin, activeAdmins[0].id, undefined, "authorization test");
  assert.deepEqual(result, { ok: false, code: "last_admin" });
});