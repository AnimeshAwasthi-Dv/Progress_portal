import "dotenv/config";
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
  authenticateUser,
  createAuthSession,
  getUserForSession,
  revokeAuthSession,
  changeUserPassword,
  updateUserRoleAndStatus,
  createUser,
  listTeams,
  createTeam,
  listProjects,
  createProject,
  listTasks,
  getTaskById,
  getTaskIdForSubtask,
  createTask,
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
  getTeamWorkloadAnalytics,
  getDashboardMetrics,
  listOrganizationActivity,
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
const userRoleOptions: UserRole[] = ["Admin", "Manager", "Team Lead", "Individual"];

const app = express();
const port = Number(process.env.PORT ?? 3001);
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const sessionCookieName = "task_manager_session";

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "64kb" }));

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
  return password.length >= 12 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password);
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
    if (!allowedRoles.includes(req.currentUser.role)) {
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
      res.status(400).json({ error: "Use a password of 12-128 characters with at least one letter and one number." });
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
  requireRole(["Admin", "Team Lead"]),
  asyncRoute(async (req, res) => {
    const { name, username, email, password, role, department, designation, teamId, projectIds, mustChangePassword } = req.body as Record<string, unknown>;
    if (
      typeof name !== "string" || !name.trim() || name.length > 120 ||
      typeof username !== "string" || !/^[a-zA-Z0-9._-]{3,40}$/.test(username) ||
      typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== "string" || !validPassword(password) ||
      typeof role !== "string" || !userRoleOptions.includes(role as UserRole)
    ) {
      res.status(400).json({ error: "Provide a valid name, username, email, password, and role. Passwords require 12-128 characters with a letter and number." });
      return;
    }
    if (req.currentUser?.role === "Team Lead" && role !== "Individual") {
      res.status(403).json({ error: "Team Leads can only create Individual employee profiles." });
      return;
    }
    const creator = req.currentUser!;
    if (creator.role === "Team Lead" && !Number.isSafeInteger(creator.teamId)) {
      res.status(403).json({ error: "Your account must be assigned to a team before creating employee profiles." });
      return;
    }
    const assignedTeamId = creator.role === "Team Lead" ? creator.teamId! : typeof teamId === "number" ? teamId : null;
    if (assignedTeamId !== null && !(await listTeams(creator)).some((team) => team.id === assignedTeamId)) {
      res.status(400).json({ error: "Choose a team you are authorized to manage." });
      return;
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
      department: typeof department === "string" && department.trim() ? department.trim() : "Technical",
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
    if (target?.role === "Admin" && target.isActive && body.role !== undefined && body.role !== "Admin") {
      const admins = await listUsers();
      if (admins.filter((user) => user.role === "Admin" && user.isActive).length <= 1) {
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
      if (target?.role === "Admin" && target.isActive && body.role !== undefined && body.role !== "Admin") {
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
  requireRole(["Admin", "Manager", "Team Lead"]),
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

// ----------------- Teams APIs ----------------- //

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
    const { name, description, managerId, leadId } = req.body as Record<string, unknown>;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Team name is required." });
      return;
    }
    const team = await createTeam({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      managerId: typeof managerId === "number" ? managerId : undefined,
      leadId: typeof leadId === "number" ? leadId : undefined,
    });
    res.status(201).json(team);
  }),
);

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
  requireRole(["Admin", "Manager"]),
  asyncRoute(async (req, res) => {
    const { name, code, description, managerId, leadId, startDate, targetDate } = req.body as Record<string, unknown>;
    if (!name || typeof name !== "string" || !code || typeof code !== "string") {
      res.status(400).json({ error: "Project name and code are required." });
      return;
    }
    const actor = req.currentUser!;
    const selectedLead = typeof leadId === "number" ? await getUserById(leadId) : null;
    if (typeof leadId === "number" && (!selectedLead || !selectedLead.isActive || !["Team Lead", "Manager"].includes(selectedLead.role))) {
      res.status(400).json({ error: "Choose an active Manager or Team Lead for the project." });
      return;
    }
    if (actor.role !== "Admin" && selectedLead && selectedLead.teamId !== actor.teamId) {
      res.status(403).json({ error: "Managers can assign projects only to leads in their authorized team." });
      return;
    }
    const selectedManager = actor.role === "Admin" && typeof managerId === "number" ? await getUserById(managerId) : null;
    if (typeof managerId === "number" && actor.role === "Admin" && (!selectedManager || !selectedManager.isActive || !["Admin", "Manager"].includes(selectedManager.role))) {
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

app.post(
  "/api/tasks",
  authMiddleware,
  asyncRoute(async (req, res) => {
    const user = req.currentUser!;
    // Individual users cannot assign tasks unless they are admin/manager/lead
    if (user.role === "Individual") {
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
    if (user.role === "Individual") {
      const isOwnerOrCollab = task.assignedToUserId === user.id || task.collaboratorIds?.includes(user.id);
      if (!isOwnerOrCollab) {
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
      const allowedFields = new Set(["status", "progressPercent", "actualHours", "pullRequestUrl", "blockerReason"]);
      if (Object.keys(body).some((field) => !allowedFields.has(field))) {
        res.status(403).json({ error: "Individual contributors may only update progress, status, work hours, pull request, and blocker fields." });
        return;
      }
    }

    const targetProjectId = body.projectId === undefined ? task.projectId : body.projectId;
    if (!Number.isSafeInteger(targetProjectId) || !(await canAccessProject(user, targetProjectId as number))) {
      res.status(404).json({ error: "Project not found." });
      return;
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
    const isPrivileged = ["Admin", "Manager", "Team Lead"].includes(user.role);
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

// ----------------- Notifications APIs ----------------- //

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
  requireRole(["Admin", "Manager", "Team Lead"]),
  asyncRoute(async (req, res) => {
    res.json(await listOrganizationActivity(req.currentUser!));
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
  app.listen(port, "127.0.0.1", () => {
    console.log(`API ready at http://127.0.0.1:${port}`);
  });
} catch (error) {
  console.error("Could not start the API or initialize the PostgreSQL database:", error);
  await import("./db.js").then(({ pool }) => pool.end());
  process.exitCode = 1;
}
