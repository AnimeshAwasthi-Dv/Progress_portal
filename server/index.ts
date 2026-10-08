import "dotenv/config";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import {
  createProjectAllotments,
  createEmployee,
  initializeDatabase,
  listEmployees,
  listProjectAllotments,
  updateEmployee,
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
  assignedBy: string;
  progress: TaskProgress;
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
  const assignedBy = typeof data.assignedBy === "string" ? data.assignedBy.trim() : "";
  const progress = data.progress;

  if (
    employeeNames.length === 0 ||
    employeeNames.length > 50 ||
    employeeNames.some((name) => name.length > 120) ||
    !project ||
    !assignedBy ||
    !taskAssigned ||
    typeof progress !== "string" ||
    !taskProgressOptions.includes(progress as TaskProgress) ||
    project.length > 240 ||
    assignedBy.length > 120 ||
    taskAssigned.length > 4000
  ) {
    return null;
  }

  return { employeeNames, project, taskAssigned, assignedBy, progress: progress as TaskProgress };
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

app.post(
  "/api/project-allotments",
  asyncRoute(async (request, response) => {
    const allotment = parseProjectAllotmentInput(request.body);
    if (!allotment) {
      response.status(400).json({
        error: "Select at least one assignee and provide the assigner, project, and task within the allowed lengths.",
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
