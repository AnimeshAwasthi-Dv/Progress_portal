import "dotenv/config";
import compression from "compression";
import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import {
  createProjectAllotments,
  createEmployee,
  initializeDatabase,
  listEmployees,
  listDailyProgressReports,
  listProjectAllotments,
  saveDailyProgressReport,
  updateEmployee,
  updateProjectAllotmentAssistance,
  updateProjectAllotmentRepository,
  type DailyProgressReportInput,
  type EmployeeInput,
  type TaskProgress,
  type WorkStatus,
  updateProjectAllotmentProgress,
  listUsers,
  getUserById,
  hideInactiveUserProfile,
  authenticateUser,
  createAuthSession,
  getUserForSession,
  revokeAuthSession,
  changeUserPassword,
  updateUserRoleAndStatus,
  createUser,
  listTeams,
  createTeam,
  setTeamActive,
  listDepartments,
  createDepartment,
  updateDepartment,
  setDepartmentActive,
  listProjects,
  createProject,
  listTasks,
  getTaskById,
  getTaskIdForSubtask,
  createTask,
  deleteTaskForUser,
  updateTaskDetails,
  acknowledgeTask,
  submitTaskReview,
  listTaskComments,
  addTaskComment,
  listTaskActivity,
  listTaskReviews,
  addSubtask,
  toggleSubtask,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  runTaskDeadlineReminderSweep,
  listClientMeetings,
  listClientMeetingParticipants,
  listClientMeetingOrganizers,
  listClientMeetingDepartments,
  getClientMeeting,
  createClientMeeting,
  updateClientMeeting,
  getClientMeetingPreferences,
  updateClientMeetingPreferences,
  runClientMeetingReminderSweep,
  getTeamWorkloadAnalytics,
  getDashboardMetrics,
  listOrganizationActivity,
  deleteOrganizationActivityEvent,
  canAccessProject,
  canAssignUserToProject,
  deactivateUser,
  type User,
  type UserRole,
  type TaskPriority,
  type TaskStatus,
  type ReviewDecision,
} from "./db.js";

const statuses: WorkStatus[] = ["In Progress", "Completed", "Pending", "On Hold"];
const taskProgressOptions: TaskProgress[] = ["Not Started", "In Progress", "Blocked", "Completed"];
const taskStatusOptions: TaskStatus[] = ["Backlog", "To Do", "In Progress", "In Review", "Completed", "Blocked"];
const taskPriorityOptions: TaskPriority[] = ["Low", "Medium", "High", "Urgent"];
const userRoleOptions: UserRole[] = ["Superadmin", "Admin", "Lead", "Employee"];

const app = express();
const port = Number(process.env.PORT ?? 3001);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const sessionCookieName = "task_manager_session";

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "64kb" }));
app.use(compression());
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  next();
});

// Session discovery is public; protected endpoints continue to require authentication.
app.get("/api/auth/session", asyncRoute(async (request, response) => {
  const token = readSessionCookie(request);
  response.json(token ? await getUserForSession(token) : null);
}));

// Express Request augmentation
declare global {
  namespace Express {
    interface Request {
      currentUser?: User;
      sessionToken?: string;
    }
  }
}

function readSessionCookie(request: Request) {
  const cookies = request.headers.cookie?.split(";") || [];
  const cookie = cookies.map((entry) => entry.trim()).find((entry) => entry.startsWith(`${sessionCookieName}=`));
  return cookie ? decodeURIComponent(cookie.slice(sessionCookieName.length + 1)) : null;
}

function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secure}`);
}

function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
}

function validPassword(password: string) {
  return password.length >= 7 && password.length <= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isOptionalDateOnly(value: unknown) {
  return value === undefined || value === null || value === "" || isDateOnly(value);
}

function isSafeHttpUrl(value: unknown) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = readSessionCookie(req);
    if (!token) {
      res.status(401).json({ error: "Please sign in to continue." });
      return;
    }
    const user = await getUserForSession(token);
    if (!user) {
      clearSessionCookie(res);
      res.status(401).json({ error: "Your session has expired. Please sign in again." });
      return;
    }
    req.currentUser = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (!allowedRoles.includes(req.currentUser.role) && !(req.currentUser.role === "Superadmin" && allowedRoles.includes("Admin"))) {
      res.status(403).json({
        error: `Forbidden: Access restricted to roles: ${allowedRoles.join(", ")}. Current role: ${req.currentUser.role}`,
      });
      return;
    }
    next();
  };
}

function requireTaskAccess(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const taskId = Number(req.params.id);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      res.status(400).json({ error: "Valid Task ID required." });
      return;
    }
    const task = await getTaskById(taskId, req.currentUser);
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    next();
  })().catch(next);
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): express.RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

app.get(
  "/api/health",
  asyncRoute(async (_request, response) => {
    response.json({ status: "ok", timestamp: new Date().toISOString() });
  }),
);

// ----------------- Auth & Current User APIs ----------------- //

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier || !password || identifier.length > 254 || password.length > 128) {
      res.status(400).json({ error: "Enter your username or email and password." });
      return;
    }
    const address = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const attempts = loginAttempts.get(address);
    if (attempts && attempts.resetAt > now && attempts.count >= 10) {
      res.status(429).json({ error: "Too many sign-in attempts. Try again in 15 minutes." });
      return;
    }
    const user = await authenticateUser(identifier, password);
    if (!user) {
      const current = attempts && attempts.resetAt > now ? attempts : { count: 0, resetAt: now + 15 * 60 * 1000 };
      current.count += 1;
      loginAttempts.set(address, current);
      res.status(401).json({ error: "Username/email or password is incorrect." });
      return;
    }
    loginAttempts.delete(address);
    const token = await createAuthSession(user.id);
    setSessionCookie(res, token);
    res.json(user);
  }),
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (req, res) => {
    const token = readSessionCookie(req);
    if (token) await revokeAuthSession(token);
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

app.post(
  "/api/auth/change-password",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!validPassword(newPassword)) {
      res.status(400).json({ error: "Use a password of 7-8 characters with at least one letter and one number." });
      return;
    }
    const updated = await changeUserPassword(req.currentUser!.id, currentPassword, newPassword, req.sessionToken!);
    if (!updated) {
      res.status(400).json({ error: "Current password is incorrect." });
      return;
    }
    res.json(updated);
  }),
);

app.get(
  "/api/auth/me",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(req.currentUser);
  }),
);

app.get(
  "/api/users",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(await listUsers(req.currentUser));
  }),
);

app.post(
  "/api/users",
  authMiddleware,
  requireRole(["Admin", "Lead"]),
  asyncRoute(async (req, res) => {
    const { name, username, email, password, role, department, designation, teamId, projectIds, mustChangePassword } = req.body as Record<string, unknown>;
    if (
      typeof name !== "string" || !name.trim() || name.length > 120 ||
      typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(username) ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== "string" || !validPassword(password) ||
      typeof role !== "string" || !userRoleOptions.includes(role as UserRole)
    ) {
      res.status(400).json({ error: "Provide a valid name, username, email, password, and role. Passwords require 7-8 characters with a letter and number." });
      return;
    }
    if (req.currentUser?.role === "Lead" && role !== "Employee") {
      res.status(403).json({ error: "Team Leads can only create Individual employee profiles." });
      return;
    }
    const creator = req.currentUser!;
    if (role === "Superadmin" && creator.role !== "Superadmin") {
      res.status(403).json({ error: "Only a Superadmin can create another Superadmin." }); return;
    }
    if (creator.role === "Lead" && !Number.isSafeInteger(creator.teamId)) {
      res.status(403).json({ error: "Your account must be assigned to a team before creating employee profiles." });
      return;
    }
    const assignedTeamId = creator.role === "Lead" ? creator.teamId! : typeof teamId === "number" ? teamId : null;
    if (assignedTeamId !== null && !(await listTeams(creator)).some((team) => team.id === assignedTeamId)) {
      res.status(400).json({ error: "Choose a team you are authorized to manage." });
      return;
    }
    const requestedDepartment = typeof department === "string" && department.trim() ? department.trim() : "Technical";
    const departmentRecord = (await listDepartments()).find((item) => item.name.toLocaleLowerCase() === requestedDepartment.toLocaleLowerCase());
    if (!departmentRecord || !departmentRecord.isActive) {
      res.status(400).json({ error: "Choose an active department from the organization." }); return;
    }
    if (assignedTeamId !== null) {
      const assignedTeam = (await listTeams(creator)).find((team) => team.id === assignedTeamId);
      if (assignedTeam?.departmentName && assignedTeam.departmentName.toLocaleLowerCase() !== requestedDepartment.toLocaleLowerCase()) {
        res.status(400).json({ error: "The selected team must belong to the selected department." }); return;
      }
    }
    if (projectIds !== undefined && (!Array.isArray(projectIds) || projectIds.some((id) => !Number.isSafeInteger(id) || Number(id) < 1))) {
      res.status(400).json({ error: "Project assignments must be valid project IDs." });
      return;
    }
    const authorizedProjectIds = Array.isArray(projectIds) ? [...new Set(projectIds as number[])] : [];
    for (const projectId of authorizedProjectIds) {
      if (!(await canAccessProject(creator, projectId))) {
        res.status(403).json({ error: "You can only assign projects you are authorized to manage." });
        return;
      }
    }
    const newUser = await createUser({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      email: email.trim().toLowerCase(),
      password,
      role: role as UserRole,
      department: requestedDepartment,
      designation: typeof designation === "string" && designation.trim() ? designation.trim() : "Software Engineer",
      teamId: assignedTeamId,
      createdByUserId: creator.id,
      projectIds: authorizedProjectIds,
      mustChangePassword: mustChangePassword === true,
    });
    res.status(201).json(newUser);
  }),
);

app.patch(
  "/api/users/:id",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid User ID required." });
      return;
    }
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({ error: "Provide valid user profile fields." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    if (body.role === "Superadmin" && req.currentUser?.role !== "Superadmin") {
      res.status(403).json({ error: "Only a Superadmin can assign the Superadmin role." }); return;
    }
    const targetUser = await getUserById(id);
    if (targetUser?.role === "Superadmin" && req.currentUser?.role !== "Superadmin") {
      res.status(403).json({ error: "Only a Superadmin can modify a Superadmin account." }); return;
    }
    const allowedFields = new Set(["name", "role", "teamId", "designation", "department"]);
    if (Object.keys(body).some((field) => !allowedFields.has(field))) {
      res.status(400).json({ error: "Account status must be changed through the safe deactivation endpoint." });
      return;
    }
    if (body.role !== undefined && (typeof body.role !== "string" || !userRoleOptions.includes(body.role as UserRole))) {
      res.status(400).json({ error: "Choose a valid user role." });
      return;
    }
    const target = await getUserById(id);
    if (target?.role === "Admin" && target.isActive && body.role !== undefined && (body.role !== "Admin" && body.role !== "Superadmin")) {
      const admins = await listUsers();
      if (admins.filter((user) => (user.role === "Admin" || user.role === "Superadmin") && user.isActive).length <= 1) {
        res.status(409).json({ error: "The last active Admin cannot be changed to another role." });
        return;
      }
    }
    const updated = await updateUserRoleAndStatus(id, {
      name: typeof body.name === "string" ? body.name.trim() : undefined,
      role: body.role as UserRole | undefined,
      teamId: typeof body.teamId === "number" || body.teamId === null ? body.teamId as number | null : undefined,
      designation: typeof body.designation === "string" ? body.designation.trim() : undefined,
      department: typeof body.department === "string" ? body.department.trim() : undefined,
    }, req.currentUser!.id);
    if (!updated) {
      if (target?.role === "Admin" && target.isActive && body.role !== undefined && (body.role !== "Admin" && body.role !== "Superadmin")) {
        res.status(409).json({ error: "The last active Admin cannot be changed to another role." });
        return;
      }
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json(updated);
  }),
);

app.patch(
  "/api/users/:id/deactivate",
  authMiddleware,
  requireRole(["Admin", "Lead", "Lead"]),
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid User ID required." });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const reassignToUserId = body.reassignToUserId;
    const reason = body.reason;
    if (reassignToUserId !== undefined && (!Number.isSafeInteger(reassignToUserId) || Number(reassignToUserId) < 1)) {
      res.status(400).json({ error: "Choose a valid replacement assignee." });
      return;
    }
    if (reason !== undefined && (typeof reason !== "string" || reason.length > 500)) {
      res.status(400).json({ error: "Reason must be 500 characters or fewer." });
      return;
    }

    const result = await deactivateUser(req.currentUser!, id, reassignToUserId as number | undefined, typeof reason === "string" ? reason.trim() : "");
    if (!result.ok) {
      const status = result.code === "forbidden" ? 403 : result.code === "not_found" ? 404 : 409;
      const message = result.code === "needs_reassignment"
        ? `Reassign the ${result.activeTaskCount} active task(s) before removing this employee.`
        : result.code === "last_admin"
        ? "The last active Admin cannot be removed."
        : result.code === "invalid_replacement"
        ? "The replacement must be an active employee in your authorized team."
        : result.code === "forbidden"
        ? "You can only remove individual contributors in your authorized team."
        : "Employee not found or already inactive.";
      res.status(status).json({ error: message, activeTaskCount: result.activeTaskCount });
      return;
    }
    res.json({ user: result.user, reassignedTaskCount: result.reassignedTaskCount });
  }),
);

app.patch(
  "/api/users/:id/hide-profile",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid User ID required." });
      return;
    }
    const hidden = await hideInactiveUserProfile(id);
    if (!hidden) {
      res.status(404).json({ error: "Only inactive individual profiles can be removed from the employee list." });
      return;
    }
    res.json({ success: true });
  }),
);

// ----------------- Teams APIs ----------------- //

app.get("/api/departments", authMiddleware, requireRole(["Admin"]), asyncRoute(async (_req, res) => {
  res.json(await listDepartments());
}));

app.post("/api/departments", authMiddleware, requireRole(["Admin"]), asyncRoute(async (req, res) => {
  const { name, description, headUserId } = req.body as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    res.status(400).json({ error: "Department name is required and must be 120 characters or fewer." }); return;
  }
  if (typeof description === "string" && description.length > 2000) {
    res.status(400).json({ error: "Department description must be 2,000 characters or fewer." }); return;
  }
  if (headUserId !== undefined && headUserId !== null && (!Number.isSafeInteger(headUserId) || (headUserId as number) < 1)) {
    res.status(400).json({ error: "Choose a valid department head." }); return;
  }
  if (typeof headUserId === "number") {
    const head = await getUserById(headUserId);
    if (!head || !head.isActive) { res.status(400).json({ error: "Department head must be an active user." }); return; }
  }
  if ((await listDepartments()).some((department) => department.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) {
    res.status(409).json({ error: "A department with that name already exists." }); return;
  }
  const department = await createDepartment({ name: name.trim(), description: typeof description === "string" ? description.trim() : undefined, headUserId: typeof headUserId === "number" ? headUserId : null });
  res.status(201).json(department);
}));

app.patch("/api/departments/:id", authMiddleware, requireRole(["Admin"]), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Valid department ID required." }); return; }
  const { name, description, headUserId, isActive } = req.body as Record<string, unknown>;
  if (typeof isActive === "boolean" && name === undefined && description === undefined && headUserId === undefined) {
    const result = await setDepartmentActive(id, isActive);
    if (!result.ok) {
      if ("members" in result) { res.status(409).json({ error: "Reassign or deactivate active department members and teams before deactivating this department.", ...result }); return; }
      res.status(404).json({ error: "Department not found." }); return;
    }
    res.json({ success: true }); return;
  }
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) { res.status(400).json({ error: "Department name is required and must be 120 characters or fewer." }); return; }
  if (typeof description === "string" && description.length > 2000) { res.status(400).json({ error: "Department description must be 2,000 characters or fewer." }); return; }
  if (headUserId !== undefined && headUserId !== null && (!Number.isSafeInteger(headUserId) || (headUserId as number) < 1)) { res.status(400).json({ error: "Choose a valid department head." }); return; }
  if (typeof headUserId === "number") {
    const head = await getUserById(headUserId);
    if (!head || !head.isActive) { res.status(400).json({ error: "Department head must be an active user." }); return; }
  }
  if ((await listDepartments()).some((department) => department.id !== id && department.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())) {
    res.status(409).json({ error: "A department with that name already exists." }); return;
  }
  const department = await updateDepartment(id, { name: name.trim(), description: typeof description === "string" ? description.trim() : undefined, headUserId: typeof headUserId === "number" ? headUserId : null });
  if (!department) { res.status(404).json({ error: "Department not found." }); return; }
  res.json(department);
}));

app.get(
  "/api/teams",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(await listTeams(req.currentUser));
  }),
);

app.post(
  "/api/teams",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (req, res) => {
    const { name, description, managerId, leadId, departmentId } = req.body as Record<string, unknown>;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Team name is required." });
      return;
    }
    if (departmentId !== undefined && (!Number.isSafeInteger(departmentId) || (departmentId as number) < 1)) {
      res.status(400).json({ error: "Choose a valid department." }); return;
    }
    if (typeof departmentId === "number") {
      const departments = await listDepartments();
      if (!departments.some((department) => department.id === departmentId && department.isActive)) {
        res.status(400).json({ error: "Choose an active department." }); return;
      }
    }
    const team = await createTeam({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      managerId: typeof managerId === "number" ? managerId : undefined,
      leadId: typeof leadId === "number" ? leadId : undefined,
      departmentId: typeof departmentId === "number" ? departmentId : undefined,
    });
    res.status(201).json(team);
  }),
);

app.patch("/api/teams/:id", authMiddleware, requireRole(["Admin"]), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || typeof req.body?.isActive !== "boolean") {
    res.status(400).json({ error: "Provide a valid team ID and active status." }); return;
  }
  const result = await setTeamActive(id, req.body.isActive);
  if (!result.ok) {
    if ("openTaskCount" in result) { res.status(409).json({ error: `Reassign or complete the ${result.openTaskCount} open task(s) before deactivating this team.`, openTaskCount: result.openTaskCount }); return; }
    res.status(404).json({ error: "Team not found." }); return;
  }
  res.json({ success: true });
}));

// ----------------- Projects APIs ----------------- //

app.get(
  "/api/projects",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(await listProjects(req.currentUser));
  }),
);

app.post(
  "/api/projects",
  authMiddleware,
  requireRole(["Admin", "Lead"]),
  asyncRoute(async (req, res) => {
    const { name, code, description, managerId, leadId, startDate, targetDate } = req.body as Record<string, unknown>;
    if (!name || typeof name !== "string" || !code || typeof code !== "string") {
      res.status(400).json({ error: "Project name and code are required." });
      return;
    }
    const actor = req.currentUser!;
    const selectedLead = typeof leadId === "number" ? await getUserById(leadId) : null;
    if (typeof leadId === "number" && (!selectedLead || !selectedLead.isActive || !["Lead", "Lead"].includes(selectedLead.role))) {
      res.status(400).json({ error: "Choose an active Manager or Team Lead for the project." });
      return;
    }
    if ((actor.role !== "Admin" && actor.role !== "Superadmin") && selectedLead && selectedLead.teamId !== actor.teamId) {
      res.status(403).json({ error: "Managers can assign projects only to leads in their authorized team." });
      return;
    }
    const selectedManager = (actor.role === "Admin" || actor.role === "Superadmin") && typeof managerId === "number" ? await getUserById(managerId) : null;
    if (typeof managerId === "number" && (actor.role === "Admin" || actor.role === "Superadmin") && (!selectedManager || !selectedManager.isActive || !["Admin", "Lead"].includes(selectedManager.role))) {
      res.status(400).json({ error: "Choose an active Admin or Manager as project owner." });
      return;
    }
    const project = await createProject({
      name: name.trim(),
      code: code.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      managerId: req.currentUser!.role === "Admin" && typeof managerId === "number" ? managerId : req.currentUser!.id,
      leadId: typeof leadId === "number" ? leadId : undefined,
      startDate: typeof startDate === "string" ? startDate : undefined,
      targetDate: typeof targetDate === "string" ? targetDate : undefined,
      createdByUserId: actor.id,
    });
    res.status(201).json(project);
  }),
);

// ----------------- Tasks APIs ----------------- //

app.get(
  "/api/tasks",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const { projectId, assignedToUserId, assignedByUserId, reviewerUserId, status, priority, search, myTasksOnly } = req.query;
    
    let filterAssignee = assignedToUserId ? Number(assignedToUserId) : undefined;
    if (myTasksOnly === "true" && req.currentUser) {
      filterAssignee = req.currentUser.id;
    }

    const tasks = await listTasks({
      projectId: projectId ? Number(projectId) : undefined,
      assignedToUserId: filterAssignee,
      assignedByUserId: assignedByUserId ? Number(assignedByUserId) : undefined,
      reviewerUserId: reviewerUserId ? Number(reviewerUserId) : undefined,
      status: typeof status === "string" && taskStatusOptions.includes(status as TaskStatus) ? status as TaskStatus : undefined,
      priority: typeof priority === "string" && taskPriorityOptions.includes(priority as TaskPriority) ? priority as TaskPriority : undefined,
      search: typeof search === "string" ? search : undefined,
      viewer: req.currentUser,
    });
    res.json(tasks);
  }),
);

app.get(
  "/api/tasks/:id",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid Task ID required." });
      return;
    }
    const task = await getTaskById(id, req.currentUser);
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }
    res.json(task);
  }),
);

app.delete(
  "/api/tasks/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid Task ID required." });
      return;
    }
    const deleted = await deleteTaskForUser(id, req.currentUser!);
    if (!deleted) {
      res.status(404).json({ error: "Task not found or you are not allowed to remove it." });
      return;
    }
    res.json({ success: true });
  }),
);

app.post(
  "/api/tasks",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const user = req.currentUser!;
    // Individual users cannot assign tasks unless they are admin/manager/lead
    if (user.role === "Employee") {
      res.status(403).json({ error: "Individual team members cannot create top-level task assignments." });
      return;
    }

    const {
      title,
      description,
      projectId,
      parentTaskId,
      assignedToUserId,
      reviewerUserId,
      priority,
      status,
      startDate,
      dueDate,
      estimatedHours,
      acceptanceCriteria,
      repositoryUrl,
      pullRequestUrl,
      collaboratorIds,
    } = req.body as Record<string, unknown>;

    if (!title || typeof title !== "string" || !projectId || typeof projectId !== "number" || !assignedToUserId || typeof assignedToUserId !== "number") {
      res.status(400).json({ error: "Task title, project ID, and primary assignee (assignedToUserId) are required." });
      return;
    }
    if (!isOptionalDateOnly(startDate) || !isOptionalDateOnly(dueDate) || (typeof startDate === "string" && startDate && typeof dueDate === "string" && dueDate && startDate > dueDate)) {
      res.status(400).json({ error: "Task dates must be valid calendar dates, and the due date cannot be before the planned start date." }); return;
    }
    if (estimatedHours !== undefined && (typeof estimatedHours !== "number" || !Number.isFinite(estimatedHours) || estimatedHours < 0 || estimatedHours > 10000)) {
      res.status(400).json({ error: "Estimated hours must be a number from 0 to 10,000." }); return;
    }
    if (!isSafeHttpUrl(repositoryUrl) || !isSafeHttpUrl(pullRequestUrl)) {
      res.status(400).json({ error: "Related task links must be valid HTTP or HTTPS URLs of 2,048 characters or fewer." }); return;
    }
    if (!(await canAccessProject(user, projectId))) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!(await canAssignUserToProject(user, assignedToUserId, projectId))) {
      res.status(403).json({ error: "The assignee must be active and belong to your authorized team or project." });
      return;
    }
    if (typeof reviewerUserId === "number" && !(await canAssignUserToProject(user, reviewerUserId, projectId))) {
      res.status(403).json({ error: "The reviewer must belong to your authorized team or project." });
      return;
    }
    const requestedCollaborators = Array.isArray(collaboratorIds)
      ? collaboratorIds.filter((id): id is number => Number.isSafeInteger(id))
      : [];
    for (const collaboratorId of requestedCollaborators) {
      if (!(await canAssignUserToProject(user, collaboratorId, projectId))) {
        res.status(403).json({ error: "All collaborators must belong to your authorized team or project." });
        return;
      }
    }
    if (typeof parentTaskId === "number") {
      const parentTask = await getTaskById(parentTaskId, user);
      if (!parentTask || parentTask.projectId !== projectId) {
        res.status(404).json({ error: "Parent task not found in this project." });
        return;
      }
    }

    const created = await createTask({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      projectId,
      parentTaskId: typeof parentTaskId === "number" ? parentTaskId : null,
      assignedByUserId: user.id, // Authenticated user is the assigner
      assignedToUserId,
      reviewerUserId: typeof reviewerUserId === "number" ? reviewerUserId : null,
      priority: typeof priority === "string" && taskPriorityOptions.includes(priority as TaskPriority) ? priority as TaskPriority : "Medium",
      status: typeof status === "string" && taskStatusOptions.includes(status as TaskStatus) ? status as TaskStatus : "To Do",
      startDate: typeof startDate === "string" ? startDate : null,
      dueDate: typeof dueDate === "string" ? dueDate : null,
      estimatedHours: typeof estimatedHours === "number" ? estimatedHours : 8,
      acceptanceCriteria: typeof acceptanceCriteria === "string" ? acceptanceCriteria.trim() : "",
      repositoryUrl: typeof repositoryUrl === "string" ? repositoryUrl.trim() : null,
      pullRequestUrl: typeof pullRequestUrl === "string" ? pullRequestUrl.trim() : null,
      collaboratorIds: requestedCollaborators,
    });

    res.status(201).json(created);
  }),
);

app.patch(
  "/api/tasks/:id",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const user = req.currentUser!;
    const task = await getTaskById(id, user);
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({ error: "Provide valid task fields." });
      return;
    }
    const body = req.body as Record<string, unknown>;

    // Individual role restrictions
    if (user.role === "Employee") {
      if (task.assignedToUserId !== user.id) {
        res.status(403).json({ error: "You are not authorized to modify this task." });
        return;
      }
      // Individuals cannot reassign task ownership or change reviewer
      if (body.assignedToUserId !== undefined && body.assignedToUserId !== task.assignedToUserId) {
        res.status(403).json({ error: "Individual team members cannot reassign task ownership." });
        return;
      }
      if (body.reviewerUserId !== undefined && body.reviewerUserId !== task.reviewerUserId) {
        res.status(403).json({ error: "Individual team members cannot change task reviewer." });
        return;
      }
      // Individuals cannot arbitrarily mark Completed if In Review is required (unless no reviewer)
      if (body.status === "Completed" && task.reviewerUserId && task.reviewerUserId !== user.id) {
        res.status(403).json({ error: "This task requires reviewer approval before being marked Completed. Please submit for review." });
        return;
      }
      const allowedFields = new Set(["title", "description", "priority", "dueDate", "acceptanceCriteria", "repositoryUrl", "pullRequestUrl", "status", "progressPercent", "actualHours", "blockerReason"]);
      if (Object.keys(body).some((field) => !allowedFields.has(field))) {
        res.status(403).json({ error: "You may edit task details and your work progress, but cannot change project, ownership, or reviewer." });
        return;
      }
    }

    const targetProjectId = body.projectId === undefined ? task.projectId : body.projectId;
    if (!Number.isSafeInteger(targetProjectId) || !(await canAccessProject(user, targetProjectId as number))) {
      res.status(404).json({ error: "Project not found." });
      return;
    }
    if (!isOptionalDateOnly(body.startDate) || !isOptionalDateOnly(body.dueDate)) {
      res.status(400).json({ error: "Task dates must be valid calendar dates." }); return;
    }
    if (!isSafeHttpUrl(body.repositoryUrl) || !isSafeHttpUrl(body.pullRequestUrl)) {
      res.status(400).json({ error: "Related task links must be valid HTTP or HTTPS URLs of 2,048 characters or fewer." }); return;
    }
    const plannedStart = body.startDate === undefined ? task.startDate : body.startDate;
    const plannedDue = body.dueDate === undefined ? task.dueDate : body.dueDate;
    if (typeof plannedStart === "string" && plannedStart && typeof plannedDue === "string" && plannedDue && plannedStart > plannedDue) {
      res.status(400).json({ error: "The due date cannot be before the planned start date." }); return;
    }
    if (body.progressPercent !== undefined && (!Number.isInteger(body.progressPercent) || (body.progressPercent as number) < 0 || (body.progressPercent as number) > 100)) {
      res.status(400).json({ error: "Progress must be a whole number from 0 to 100." }); return;
    }
    const targetAssigneeId = body.assignedToUserId === undefined ? task.assignedToUserId : body.assignedToUserId;
    if (!Number.isSafeInteger(targetAssigneeId) || !(await canAssignUserToProject(user, targetAssigneeId as number, targetProjectId as number))) {
      res.status(403).json({ error: "The assignee must be active and belong to your authorized team or project." });
      return;
    }
    const targetReviewerId = body.reviewerUserId === undefined ? task.reviewerUserId : body.reviewerUserId;
    if (targetReviewerId !== null && targetReviewerId !== undefined &&
      (!Number.isSafeInteger(targetReviewerId) || !(await canAssignUserToProject(user, targetReviewerId as number, targetProjectId as number)))
    ) {
      res.status(403).json({ error: "The reviewer must be active and belong to your authorized team or project." });
      return;
    }
    if (body.collaboratorIds !== undefined) {
      if (!Array.isArray(body.collaboratorIds) || body.collaboratorIds.some((id) => !Number.isSafeInteger(id))) {
        res.status(400).json({ error: "Collaborators must be valid user IDs." });
        return;
      }
      for (const collaboratorId of body.collaboratorIds as number[]) {
        if (!(await canAssignUserToProject(user, collaboratorId, targetProjectId as number))) {
          res.status(403).json({ error: "All collaborators must belong to your authorized team or project." });
          return;
        }
      }
    }

    const updated = await updateTaskDetails(id, user.id, body as any);
    res.json(updated);
  }),
);

app.post(
  "/api/tasks/:id/acknowledge",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const updated = await acknowledgeTask(id, req.currentUser!.id);
    res.json(updated);
  }),
);

app.post(
  "/api/tasks/:id/review",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const user = req.currentUser!;
    const task = await getTaskById(id, user);
    if (!task) {
      res.status(404).json({ error: "Task not found." });
      return;
    }

    // Must be assigned reviewer or Admin/Manager
    const isReviewer = task.reviewerUserId === user.id;
    const isPrivileged = ["Admin", "Lead", "Lead"].includes(user.role);
    if (!isReviewer && !isPrivileged) {
      res.status(403).json({ error: "Only the designated reviewer, manager, or admin can approve or request changes on this task." });
      return;
    }

    const { decision, feedback } = req.body as { decision?: ReviewDecision; feedback?: string };
    if (!decision || !["Approved", "Changes Requested"].includes(decision)) {
      res.status(400).json({ error: "Review decision must be 'Approved' or 'Changes Requested'." });
      return;
    }

    const updated = await submitTaskReview(id, user.id, {
      decision,
      feedback: feedback?.trim() || (decision === "Approved" ? "Deliverable approved." : "Changes required."),
    });
    res.json(updated);
  }),
);

// ----------------- Task Subtasks, Comments & Activity ----------------- //

app.get(
  "/api/tasks/:id/comments",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    res.json(await listTaskComments(id));
  }),
);

app.post(
  "/api/tasks/:id/comments",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const { comment } = req.body as { comment?: string };
    if (!comment || !comment.trim()) {
      res.status(400).json({ error: "Comment text is required." });
      return;
    }
    const created = await addTaskComment(id, req.currentUser!.id, comment.trim());
    res.status(201).json(created);
  }),
);

app.get(
  "/api/tasks/:id/activity",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    res.json(await listTaskActivity(id));
  }),
);

app.get(
  "/api/tasks/:id/reviews",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    res.json(await listTaskReviews(id));
  }),
);

app.post(
  "/api/tasks/:id/subtasks",
  authMiddleware,
  requireTaskAccess,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const { title } = req.body as { title?: string };
    if (!title || !title.trim()) {
      res.status(400).json({ error: "Subtask title is required." });
      return;
    }
    const created = await addSubtask(id, title.trim());
    res.status(201).json(created);
  }),
);

app.patch(
  "/api/subtasks/:id",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ error: "Valid subtask ID required." });
      return;
    }
    const taskId = await getTaskIdForSubtask(id);
    if (!taskId || !(await getTaskById(taskId, req.currentUser))) {
      res.status(404).json({ error: "Subtask not found." });
      return;
    }
    const { isCompleted } = req.body as { isCompleted?: boolean };
    if (typeof isCompleted !== "boolean") {
      res.status(400).json({ error: "Provide a valid completion status." });
      return;
    }
    const updated = await toggleSubtask(id, isCompleted);
    if (!updated) {
      res.status(404).json({ error: "Subtask not found." });
      return;
    }
    res.json(updated);
  }),
);

// ----------------- Client Meetings APIs ----------------- //
function validMeetingTimeZone(value: unknown): value is string {
  try { if (typeof value !== "string" || value.length > 100) return false; new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
const meetingStatuses = ["Scheduled", "Completed", "Cancelled", "Rescheduled"] as const;
const meetingTypes = ["Online", "In-person"] as const;
const isMeetingAdmin = (user: User) => user.role === "Admin" || user.role === "Superadmin";
async function canManageClientMeeting(meeting: NonNullable<Awaited<ReturnType<typeof getClientMeeting>>>, user: User) {
  if (isMeetingAdmin(user) || meeting.organizerId === user.id) return true;
  if (user.role !== "Lead") return false;
  if (meeting.projectId && await canAccessProject(user, meeting.projectId)) return true;
  const teamIds = new Set((await listTeams(user)).filter((team) => team.leadId === user.id || team.managerId === user.id).map((team) => team.id));
  const relatedUserIds = [meeting.organizerId, ...meeting.participants.map((participant) => participant.id)];
  if (meeting.taskId) {
    const linkedTask = await getTaskById(meeting.taskId, user);
    if (linkedTask) relatedUserIds.push(linkedTask.assignedToUserId);
  }
  for (const participantId of relatedUserIds) {
    const participant = await getUserById(participantId);
    if (participant?.teamId && teamIds.has(participant.teamId)) return true;
  }
  return false;
}

app.get("/api/client-meetings", authMiddleware, asyncRoute(async (req, res) => {
  res.json(await listClientMeetings(req.currentUser!));
}));
app.get("/api/client-meetings/participants", authMiddleware, asyncRoute(async (req, res) => {
  res.json(await listClientMeetingParticipants(req.currentUser!));
}));
app.get("/api/client-meetings/organizers", authMiddleware, asyncRoute(async (_req, res) => {
  res.json(await listClientMeetingOrganizers());
}));
app.get("/api/client-meetings/departments", authMiddleware, asyncRoute(async (_req, res) => {
  res.json(await listClientMeetingDepartments());
}));
app.post("/api/client-meetings", authMiddleware, asyncRoute(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const start = typeof body.startsAt === "string" ? Date.parse(body.startsAt) : NaN;
  const end = typeof body.endsAt === "string" ? Date.parse(body.endsAt) : NaN;
  const participants = Array.isArray(body.participantIds) && body.participantIds.every((value) => Number.isSafeInteger(value) && Number(value) > 0) ? [...new Set(body.participantIds as number[])] : [];
  if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 160 || typeof body.clientName !== "string" || !body.clientName.trim() || body.clientName.length > 160 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !validMeetingTimeZone(body.timeZone) || !meetingTypes.includes(body.meetingType as typeof meetingTypes[number]) || (body.meetingType === "Online" && (typeof body.meetingLink !== "string" || !body.meetingLink.trim())) || (body.meetingType === "In-person" && (typeof body.location !== "string" || !body.location.trim()))) { res.status(400).json({ error: "Provide required meeting details, a valid time zone and date/time, and a meeting link or location." }); return; }
  const allowed = new Set((await listClientMeetingParticipants(req.currentUser!)).filter((person) => person.isActive).map((person) => person.id));
  if (participants.some((participantId) => !allowed.has(participantId))) { res.status(403).json({ error: "One or more participants are outside your authorized portal users." }); return; }
  const organizerId = Number(body.organizerId);
  if (!Number.isSafeInteger(organizerId) || !(await listClientMeetingOrganizers()).some((person) => person.id === organizerId)) { res.status(403).json({ error: "Choose an active portal user as organizer." }); return; }
  const projectId = typeof body.projectId === "number" ? body.projectId : null;
  const taskId = typeof body.taskId === "number" ? body.taskId : null;
  if (projectId && !(await canAccessProject(req.currentUser!, projectId))) { res.status(403).json({ error: "You cannot link this meeting to that project." }); return; }
  if (taskId && !(await getTaskById(taskId, req.currentUser!))) { res.status(403).json({ error: "You cannot link this meeting to that task." }); return; }
  if (typeof body.departmentId === "number" && !(await listDepartments()).some((department) => department.id === body.departmentId && department.isActive)) { res.status(400).json({ error: "Choose an active department." }); return; }
  const meeting = await createClientMeeting({ title: body.title.trim(), clientName: body.clientName.trim(), clientContact: typeof body.clientContact === "string" ? body.clientContact.trim() : undefined, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), timeZone: body.timeZone, meetingType: body.meetingType as "Online" | "In-person", meetingLink: typeof body.meetingLink === "string" ? body.meetingLink.trim() : undefined, location: typeof body.location === "string" ? body.location.trim() : undefined, agenda: typeof body.agenda === "string" ? body.agenda : "", description: typeof body.description === "string" ? body.description : "", organizerId, departmentId: typeof body.departmentId === "number" ? body.departmentId : null, projectId, taskId, participantIds: participants });
  res.status(201).json(meeting);
}));
app.patch("/api/client-meetings/:id", authMiddleware, asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: "Valid meeting ID required." }); return; }
  const current = await getClientMeeting(id);
  if (!current) { res.status(404).json({ error: "Meeting not found." }); return; }
  const actor = req.currentUser!;
  const canManage = await canManageClientMeeting(current, actor);
  const participant = current.participants.some((person) => person.id === actor.id);
  if (!canManage && !participant) { res.status(403).json({ error: "You are not authorized to access this meeting." }); return; }
  const body = req.body as Record<string, unknown>;
  const notesOnly = !canManage;
  const notes = ["minutes", "decisions", "clientFeedback", "actionItems", "resultingTaskId", "followUpAssigneeId", "followUpDeadline", "status"];
  const editable = ["title", "clientName", "clientContact", "startsAt", "endsAt", "timeZone", "meetingType", "meetingLink", "location", "agenda", "description", "organizerId", "departmentId", "projectId", "taskId", "participantIds", ...notes];
  if (Object.keys(body).some((key) => !(notesOnly ? notes : editable).includes(key))) { res.status(403).json({ error: "You cannot edit those meeting details." }); return; }
  if (body.organizerId !== undefined) {
    const allowedOrganizerIds = new Set((await listClientMeetingOrganizers()).map((person) => person.id));
    if (!Number.isSafeInteger(body.organizerId) || !allowedOrganizerIds.has(Number(body.organizerId))) { res.status(403).json({ error: "Choose an active portal user as organizer." }); return; }
  }
  const startsAt = body.startsAt === undefined ? current.startsAt : body.startsAt;
  const endsAt = body.endsAt === undefined ? current.endsAt : body.endsAt;
  const startMs = typeof startsAt === "string" ? Date.parse(startsAt) : NaN;
  const endMs = typeof endsAt === "string" ? Date.parse(endsAt) : NaN;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || !validMeetingTimeZone(body.timeZone ?? current.timeZone) || (body.status !== undefined && !meetingStatuses.includes(body.status as typeof meetingStatuses[number]))) { res.status(400).json({ error: "Meeting date, time, time zone, or status is invalid." }); return; }
  if (body.participantIds !== undefined) {
    if (!Array.isArray(body.participantIds) || !body.participantIds.every((value) => Number.isSafeInteger(value) && Number(value) > 0)) { res.status(400).json({ error: "Choose valid internal participants." }); return; }
    const allowed = new Set((await listClientMeetingParticipants(actor)).filter((person) => person.isActive).map((person) => person.id));
    if (body.participantIds.some((participantId) => !allowed.has(participantId as number))) { res.status(403).json({ error: "One or more participants are outside your authorized portal users." }); return; }
  }
  if (typeof body.projectId === "number" && !(await canAccessProject(actor, body.projectId))) { res.status(403).json({ error: "You cannot link this meeting to that project." }); return; }
  if (typeof body.departmentId === "number" && !(await listClientMeetingDepartments()).some((department) => department.id === body.departmentId)) { res.status(400).json({ error: "Choose an active department." }); return; }
  if (typeof body.taskId === "number" && !(await getTaskById(body.taskId, actor))) { res.status(403).json({ error: "You cannot link this meeting to that task." }); return; }
  if (typeof body.resultingTaskId === "number" && !(await getTaskById(body.resultingTaskId, actor))) { res.status(403).json({ error: "You cannot link this meeting to that task." }); return; }
  if (typeof body.followUpAssigneeId === "number" && !(await listClientMeetingParticipants(actor)).some((person) => person.id === body.followUpAssigneeId && person.isActive)) { res.status(403).json({ error: "Choose an active employee in your authorized scope." }); return; }
  if (typeof body.followUpDeadline === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(body.followUpDeadline)) { res.status(400).json({ error: "Follow-up deadline must be a date." }); return; }
  const result = await updateClientMeeting(id, { ...body, startsAt: body.startsAt === undefined ? undefined : new Date(startMs).toISOString(), endsAt: body.endsAt === undefined ? undefined : new Date(endMs).toISOString() } as Parameters<typeof updateClientMeeting>[1]);
  res.json(result);
}));

// ----------------- Notifications APIs ----------------- //

app.get("/api/notifications/preferences", authMiddleware, asyncRoute(async (req, res) => {
  res.json(await getClientMeetingPreferences(req.currentUser!.id));
}));
app.patch("/api/notifications/preferences", authMiddleware, asyncRoute(async (req, res) => {
  const { clientMeetings, meetingReminders } = req.body as Record<string, unknown>;
  if (typeof clientMeetings !== "boolean" || typeof meetingReminders !== "boolean") { res.status(400).json({ error: "Choose valid meeting notification preferences." }); return; }
  res.json(await updateClientMeetingPreferences(req.currentUser!.id, clientMeetings, meetingReminders));
}));

app.get(
  "/api/notifications",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(await listNotifications(req.currentUser!.id));
  }),
);

app.patch(
  "/api/notifications/:id/read",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    res.json(await markNotificationRead(id, req.currentUser!.id));
  }),
);

app.post(
  "/api/notifications/read-all",
  authMiddleware,
  asyncRoute(async (req, res) => {
    res.json(await markAllNotificationsRead(req.currentUser!.id));
  }),
);

// ----------------- Analytics & Workload APIs ----------------- //

app.get(
  "/api/analytics/workload",
  authMiddleware,
  asyncRoute(async (_req, res) => {
    res.json(await getTeamWorkloadAnalytics(_req.currentUser!));
  }),
);

app.get(
  "/api/analytics/dashboard",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const user = req.currentUser!;
    res.json(await getDashboardMetrics(user));
  }),
);

app.get(
  "/api/activity",
  authMiddleware,
  requireRole(["Admin", "Lead", "Lead"]),
  asyncRoute(async (req, res) => {
    res.json(await listOrganizationActivity(req.currentUser!));
  }),
);

app.delete(
  "/api/activity/:id",
  authMiddleware,
  requireRole(["Admin", "Lead"]),
  asyncRoute(async (req, res) => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const match = /^(task|project|employee)-([1-9]\d*)$/.exec(rawId);
    if (!match) {
      res.status(400).json({ error: "Valid activity log ID required." });
      return;
    }
    const deleted = await deleteOrganizationActivityEvent(req.currentUser!, match[1] as "task" | "project" | "employee", Number(match[2]));
    if (!deleted) {
      res.status(404).json({ error: "Activity log entry not found in your authorized scope." });
      return;
    }
    res.json({ success: true });
  }),
);

// ----------------- Legacy Project Allotments & Reports Endpoints (Backward Compatible) ----------------- //

function parseEmployeeInput(body: unknown): EmployeeInput | null {
  if (typeof body !== "object" || body === null) return null;
  const data = body as Record<string, unknown>;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const department = typeof data.department === "string" ? data.department.trim() : "";
  const designation = typeof data.designation === "string" ? data.designation.trim() : "";
  const currentWork = typeof data.currentWork === "string" ? data.currentWork.trim() : "";
  const status = data.status;

  if (
    !name ||
    department !== "Technical" ||
    !designation ||
    !currentWork ||
    typeof status !== "string" ||
    !statuses.includes(status as WorkStatus)
  ) {
    return null;
  }

  return { name, department, designation, currentWork, status: status as WorkStatus };
}

function parseProjectAllotmentInput(
  body: unknown,
): {
  employeeNames: string[];
  project: string;
  taskAssigned: string;
  assistanceBy: string[];
  progress: TaskProgress;
  repositoryUrl: string | null;
} | null {
  if (typeof body !== "object" || body === null) return null;

  const data = body as Record<string, unknown>;
  const employeeNames = Array.isArray(data.employeeNames)
    ? [...new Set(data.employeeNames
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean))]
    : [];
  const project = typeof data.project === "string" ? data.project.trim() : "";
  const taskAssigned = typeof data.taskAssigned === "string" ? data.taskAssigned.trim() : "";
  const assistanceBy = parseAssistanceNames(data.assistanceBy);
  const progress = data.progress;
  const repositoryUrl =
    typeof data.repositoryUrl === "string" && data.repositoryUrl.trim()
      ? data.repositoryUrl.trim()
      : null;
  let isValidRepositoryUrl = repositoryUrl === null;
  if (repositoryUrl) {
    try {
      const parsedUrl = new URL(repositoryUrl);
      isValidRepositoryUrl = ["http:", "https:"].includes(parsedUrl.protocol);
    } catch {
      isValidRepositoryUrl = false;
    }
  }

  if (
    employeeNames.length === 0 ||
    employeeNames.length > 50 ||
    employeeNames.some((name) => name.length > 120) ||
    !project ||
    !assistanceBy ||
    assistanceBy.length === 0 ||
    assistanceBy.length > 50 ||
    assistanceBy.some((name) => name.length > 120) ||
    !taskAssigned ||
    typeof progress !== "string" ||
    !taskProgressOptions.includes(progress as TaskProgress) ||
    project.length > 240 ||
    taskAssigned.length > 4000 ||
    (data.repositoryUrl !== undefined &&
      data.repositoryUrl !== null &&
      typeof data.repositoryUrl !== "string") ||
    (repositoryUrl !== null && repositoryUrl.length > 2048) ||
    !isValidRepositoryUrl
  ) {
    return null;
  }

  return {
    employeeNames,
    project,
    taskAssigned,
    assistanceBy,
    progress: progress as TaskProgress,
    repositoryUrl,
  };
}

function parseAssistanceNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((name) => typeof name !== "string")) return null;
  const names = value.map((name: string) => name.trim()).filter(Boolean);
  return names.filter(
    (name, index) =>
      names.findIndex((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase()) ===
      index,
  );
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDailyProgressReportInput(body: unknown): DailyProgressReportInput | null {
  if (typeof body !== "object" || body === null) return null;
  const data = body as Record<string, unknown>;
  const employeeName = typeof data.employeeName === "string" ? data.employeeName.trim() : "";
  const reportDate = typeof data.reportDate === "string" ? data.reportDate : "";
  const completedToday =
    typeof data.completedToday === "string" ? data.completedToday.trim() : "";
  const plansNext = typeof data.plansNext === "string" ? data.plansNext.trim() : "";
  const blockers = typeof data.blockers === "string" ? data.blockers.trim() : "";
  const userId = typeof data.userId === "number" ? data.userId : undefined;
  const projectId = typeof data.projectId === "number" ? data.projectId : undefined;
  const taskId = typeof data.taskId === "number" ? data.taskId : undefined;

  if (
    !employeeName ||
    employeeName.length > 120 ||
    !isValidDate(reportDate) ||
    !completedToday ||
    completedToday.length > 4000 ||
    plansNext.length > 4000 ||
    blockers.length > 4000
  ) {
    return null;
  }

  return { employeeName, reportDate, completedToday, plansNext, blockers, userId, projectId, taskId };
}

app.get(
  "/api/project-allotments",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (_request, response) => {
    response.json(await listProjectAllotments());
  }),
);

app.get(
  "/api/daily-reports",
  authMiddleware,
  asyncRoute(async (request, response) => {
    const reportDate = request.query.date;
    if (typeof reportDate !== "string" || !isValidDate(reportDate)) {
      response.status(400).json({ error: "Provide a valid report date in YYYY-MM-DD format." });
      return;
    }
    response.json(await listDailyProgressReports(reportDate, request.currentUser!));
  }),
);

app.put(
  "/api/daily-reports",
  authMiddleware,
  asyncRoute(async (request, response) => {
    const report = parseDailyProgressReportInput(request.body);
    if (!report) {
      response.status(400).json({
        error: "Provide a team member, valid report date, and completed work within the allowed lengths.",
      });
      return;
    }
    if (request.currentUser && !report.userId) {
      report.userId = request.currentUser.id;
    }
    if (request.currentUser?.role !== "Admin") {
      report.userId = request.currentUser!.id;
      report.employeeName = request.currentUser!.name;
    }
    if (report.projectId && !(await canAccessProject(request.currentUser!, report.projectId))) {
      response.status(404).json({ error: "Project not found." });
      return;
    }
    if (report.taskId) {
      const task = await getTaskById(report.taskId, request.currentUser);
      if (!task || (report.projectId && task.projectId !== report.projectId)) {
        response.status(404).json({ error: "Task not found." });
        return;
      }
      report.projectId = task.projectId;
    }
    response.json(await saveDailyProgressReport(report));
  }),
);

app.post(
  "/api/project-allotments",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const allotment = parseProjectAllotmentInput(request.body);
    if (!allotment) {
      response.status(400).json({
        error: "Select at least one assignee, add at least one assistance contact, and provide the project and task within the allowed lengths.",
      });
      return;
    }

    const created = await createProjectAllotments(allotment);
    if (created.length === 0) {
      response.status(409).json({
        error: "This task is already assigned to every selected team member on this project.",
      });
      return;
    }
    response.status(201).json(created);
  }),
);

app.patch(
  "/api/project-allotments/:id/progress",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Task ID must be a positive integer." });
      return;
    }

    const progress = (request.body as Record<string, unknown> | null)?.progress;
    if (typeof progress !== "string" || !taskProgressOptions.includes(progress as TaskProgress)) {
      response.status(400).json({ error: "Choose a valid task progress status." });
      return;
    }

    const updated = await updateProjectAllotmentProgress(id, progress as TaskProgress);
    if (!updated) {
      response.status(404).json({ error: "Task assignment not found." });
      return;
    }
    response.json(updated);
  }),
);

app.patch(
  "/api/project-allotments/:id/assistance",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Task ID must be a positive integer." });
      return;
    }

    const assistanceBy = parseAssistanceNames(
      (request.body as Record<string, unknown> | null)?.assistanceBy,
    );
    if (
      !assistanceBy ||
      assistanceBy.length > 50 ||
      assistanceBy.some((name) => name.length > 120)
    ) {
      response.status(400).json({ error: "Provide up to 50 valid assistance names." });
      return;
    }

    const updated = await updateProjectAllotmentAssistance(id, assistanceBy);
    if (!updated) {
      response.status(404).json({ error: "Task assignment not found." });
      return;
    }
    response.json(updated);
  }),
);

app.patch(
  "/api/project-allotments/:id/repository",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Task ID must be a positive integer." });
      return;
    }

    const repositoryUrl = (request.body as Record<string, unknown> | null)?.repositoryUrl;
    if (
      repositoryUrl !== null &&
      repositoryUrl !== undefined &&
      typeof repositoryUrl !== "string"
    ) {
      response.status(400).json({ error: "Provide a valid HTTP or HTTPS repository link." });
      return;
    }
    const normalizedUrl =
      typeof repositoryUrl === "string" && repositoryUrl.trim()
        ? repositoryUrl.trim()
        : null;
    if (normalizedUrl && normalizedUrl.length > 2048) {
      response.status(400).json({ error: "Repository links must be 2048 characters or fewer." });
      return;
    }
    if (normalizedUrl) {
      try {
        const parsedUrl = new URL(normalizedUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          response.status(400).json({ error: "Repository links must use HTTP or HTTPS." });
          return;
        }
      } catch {
        response.status(400).json({ error: "Provide a valid HTTP or HTTPS repository link." });
        return;
      }
    }

    const updated = await updateProjectAllotmentRepository(id, normalizedUrl);
    if (!updated) {
      response.status(404).json({ error: "Task assignment not found." });
      return;
    }
    response.json(updated);
  }),
);

app.get(
  "/api/employees",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (_request, response) => {
    response.json(await listEmployees());
  }),
);

app.post(
  "/api/employees",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const employee = parseEmployeeInput(request.body);
    if (!employee) {
      response.status(400).json({
        error: "Provide the employee details and use the Technical department with a valid status.",
      });
      return;
    }

    response.status(201).json(await createEmployee(employee));
  }),
);

app.put(
  "/api/employees/:id",
  authMiddleware,
  requireRole(["Admin"]),
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      response.status(400).json({ error: "Employee ID must be a positive integer." });
      return;
    }

    const employee = parseEmployeeInput(request.body);
    if (!employee) {
      response.status(400).json({
        error: "Provide the employee details and use the Technical department with a valid status.",
      });
      return;
    }

    const updated = await updateEmployee(id, employee);
    if (!updated) {
      response.status(404).json({ error: "Employee not found." });
      return;
    }
    response.json(updated);
  }),
);

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  console.error("API request failed:", error);
  if (response.headersSent) return;
  response.status(500).json({ error: "The request failed. Check the server log for details." });
};
app.use(errorHandler);

try {
  await initializeDatabase();
  void runTaskDeadlineReminderSweep().catch((error) => console.error("Initial deadline reminder check failed:", error));
  void runClientMeetingReminderSweep().catch((error) => console.error("Initial client meeting reminder check failed:", error));
  setInterval(() => {
    void runTaskDeadlineReminderSweep().catch((error) => console.error("Deadline reminder check failed:", error));
    void runClientMeetingReminderSweep().catch((error) => console.error("Client meeting reminder check failed:", error));
  }, 5 * 60 * 1000);
  app.listen(port, "127.0.0.1", () => {
    console.log(`API ready at http://127.0.0.1:${port}`);
  });
} catch (error) {
  console.error("Could not start the API or initialize the PostgreSQL database:", error);
  await import("./db.js").then(({ pool }) => pool.end());
  process.exitCode = 1;
}
