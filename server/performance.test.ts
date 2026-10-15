import assert from "node:assert/strict";
import { after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { zonedWallTimeToIso } from "../src/calendarUtils.js";

// Never connect to a configured application database from this test.
process.env.DATABASE_URL = "postgresql://test:test@localhost/task";
process.env.INITIAL_ADMIN_PASSWORD = "Test1234";
const db = await import("./db.js");
const postgres = new PGlite();
let queryCount = 0;
const query = async (sql: string, values?: unknown[]) => {
  queryCount++;
  if (values?.length && !/\$\d+/.test(sql)) throw new Error(`PGlite received binds without placeholders: ${sql}`);
  const result = values?.length ? await postgres.query(sql, values) : (await postgres.exec(sql)).at(-1)!;
  return { rows: result.rows, rowCount: result.affectedRows };
};
// Adapter keeps the production SQL intact, including migrations and indexes.
db.pool.query = query as typeof db.pool.query;
db.pool.connect = (async () => ({ query, release() {} })) as unknown as typeof db.pool.connect;
after(async () => { await postgres.close(); await db.pool.end(); });

test("meeting wall times convert by IANA zone and reject daylight-saving gaps", () => {
  assert.equal(zonedWallTimeToIso("2026-07-12", "09:00", "Asia/Kolkata"), "2026-07-12T03:30:00.000Z");
  assert.throws(() => zonedWallTimeToIso("2026-03-08", "02:30", "America/New_York"), /does not exist/);
  assert.throws(() => zonedWallTimeToIso("2026-02-30", "09:00", "UTC"), /does not exist/);
});

test("optimized queries retain authentication and visibility semantics", async () => {
  await db.initializeDatabase();
  await db.initializeDatabase(); // Index/schema changes remain idempotent.
  const admin = await db.authenticateUser("ADMIN", "Test1234");
  assert.ok(admin);
  assert.equal(await db.authenticateUser("admin", "wrong-password"), null);
  const token = await db.createAuthSession(admin.id);
  queryCount = 0;
  assert.equal((await db.getUserForSession(token))?.id, admin.id);
  assert.equal(queryCount, 1, "session identity must use a single query");
  const otherToken = await db.createAuthSession(admin.id);
  assert.ok(await db.changeUserPassword(admin.id, "Test1234", "Changed1", token));
  assert.equal(await db.getUserForSession(otherToken), null);
  assert.ok(await db.authenticateUser("admin", "Changed1"));
  assert.equal(await db.authenticateUser("admin", "Test1234"), null);

  const member = await db.createUser({ name: "Member", username: "member", email: "member@example.com",
    password: "member-test-password", role: "Employee", department: "Technical", designation: "Engineer" });
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

test("client meetings stay scoped, notify changes, and send one preference-aware reminder", async () => {
  await db.initializeDatabase();
  const admin = await db.authenticateUser("admin", "Changed1");
  assert.ok(admin);
  const teamId = admin.teamId || undefined;
  const lead = await db.createUser({ name: "Meeting Lead", username: "meeting-lead", email: "meeting-lead@example.com", password: "leader123", role: "Lead", department: "Technical", designation: "Lead", teamId });
  const participant = await db.createUser({ name: "Meeting Guest", username: "meeting-guest", email: "meeting-guest@example.com", password: "guest123", role: "Employee", department: "Technical", designation: "Engineer", teamId });
  const outsider = await db.createUser({ name: "Meeting Outsider", username: "meeting-outsider", email: "meeting-outsider@example.com", password: "outsider1", role: "Employee", department: "Technical", designation: "Engineer" });
  await query("UPDATE teams SET lead_id=$1 WHERE id=$2", [lead.id, teamId]);
  const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
  const meeting = await db.createClientMeeting({ title: "Client review", clientName: "Example Co", startsAt: at(50), endsAt: at(80), timeZone: "Asia/Kolkata", meetingType: "Online", meetingLink: "https://example.test/meeting", organizerId: admin.id, participantIds: [participant.id] });
  assert.ok(meeting);
  assert.equal((await db.listClientMeetings(participant)).some((item) => item.id === meeting.id), true);
  assert.equal((await db.listClientMeetings(outsider)).some((item) => item.id === meeting.id), false);
  assert.equal((await db.listClientMeetings(lead)).some((item) => item.id === meeting.id), true);
  assert.equal((await db.listClientMeetings(admin)).some((item) => item.id === meeting.id), true);

  const moved = await db.updateClientMeeting(meeting.id, { startsAt: at(55), endsAt: at(85) });
  assert.equal(moved?.status, "Rescheduled");
  assert.equal((await db.listNotifications(participant.id)).some((item) => item.type === "client_meeting_change"), true);
  await db.updateClientMeeting(meeting.id, { status: "Cancelled" });
  assert.equal((await db.listNotifications(participant.id)).filter((item) => item.type === "client_meeting_change").length, 2);

  await db.updateClientMeetingPreferences(participant.id, true, true);
  const reminderMeeting = await db.createClientMeeting({ title: "Reminder check", clientName: "Example Co", startsAt: at(30), endsAt: at(60), timeZone: "UTC", meetingType: "In-person", location: "Office", organizerId: admin.id, participantIds: [participant.id] });
  assert.ok(reminderMeeting);
  await db.runClientMeetingReminderSweep();
  await db.runClientMeetingReminderSweep();
  assert.equal((await db.listNotifications(participant.id)).filter((item) => item.type === "client_meeting_reminder" && item.clientMeetingId === reminderMeeting.id).length, 1);
  await db.updateClientMeetingPreferences(participant.id, true, false);
  const mutedMeeting = await db.createClientMeeting({ title: "Muted reminder", clientName: "Example Co", startsAt: at(31), endsAt: at(61), timeZone: "UTC", meetingType: "Online", meetingLink: "https://example.test/meeting", organizerId: admin.id, participantIds: [participant.id] });
  assert.ok(mutedMeeting);
  await db.runClientMeetingReminderSweep();
  assert.equal((await db.listNotifications(participant.id)).some((item) => item.type === "client_meeting_reminder" && item.clientMeetingId === mutedMeeting.id), false);
});
