import "dotenv/config";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
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
} from "./db.js";

const statuses: WorkStatus[] = ["In Progress", "Completed", "Pending", "On Hold"];
const taskProgressOptions: TaskProgress[] = ["Not Started", "In Progress", "Blocked", "Completed"];
const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: "16kb" }));

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

  return { employeeName, reportDate, completedToday, plansNext, blockers };
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
    response.json({ status: "ok" });
  }),
);

app.get(
  "/api/project-allotments",
  asyncRoute(async (_request, response) => {
    response.json(await listProjectAllotments());
  }),
);

app.get(
  "/api/daily-reports",
  asyncRoute(async (request, response) => {
    const reportDate = request.query.date;
    if (typeof reportDate !== "string" || !isValidDate(reportDate)) {
      response.status(400).json({ error: "Provide a valid report date in YYYY-MM-DD format." });
      return;
    }
    response.json(await listDailyProgressReports(reportDate));
  }),
);

app.put(
  "/api/daily-reports",
  asyncRoute(async (request, response) => {
    const report = parseDailyProgressReportInput(request.body);
    if (!report) {
      response.status(400).json({
        error: "Provide a team member, valid report date, and completed work within the allowed lengths.",
      });
      return;
    }
    response.json(await saveDailyProgressReport(report));
  }),
);

app.post(
  "/api/project-allotments",
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
  asyncRoute(async (_request, response) => {
    response.json(await listEmployees());
  }),
);

app.post(
  "/api/employees",
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
