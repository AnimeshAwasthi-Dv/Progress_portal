import "dotenv/config";
import { Pool } from "pg";
import { seedProjectAllotments } from "./seedProjectAllotments.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and configure PostgreSQL.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
  throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
}
if (parsedDatabaseUrl.pathname.replace(/^\//, "") !== "task") {
  throw new Error("DATABASE_URL must connect to the PostgreSQL database named 'task'.");
}

export const pool = new Pool({ connectionString: databaseUrl });

export type WorkStatus = "In Progress" | "Completed" | "Pending" | "On Hold";

export type Employee = {
  id: number;
  name: string;
  department: string;
  designation: string;
  currentWork: string;
  status: WorkStatus;
};

export type EmployeeInput = Omit<Employee, "id">;

const employeeColumns = `
  id,
  name,
  department,
  designation,
  current_work AS "currentWork",
  status
`;

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(84726351)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        department TEXT NOT NULL CHECK (length(trim(department)) > 0),
        designation TEXT NOT NULL CHECK (length(trim(designation)) > 0),
        current_work TEXT NOT NULL CHECK (length(trim(current_work)) > 0),
        status TEXT NOT NULL CHECK (status IN ('In Progress', 'Completed', 'Pending', 'On Hold')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_allotments (
        id SERIAL PRIMARY KEY,
        serial_number INTEGER NOT NULL CHECK (serial_number > 0),
        employee_name TEXT NOT NULL CHECK (length(trim(employee_name)) > 0),
        project TEXT NOT NULL CHECK (length(trim(project)) > 0),
        task_assigned TEXT NOT NULL CHECK (length(trim(task_assigned)) > 0),
        progress TEXT NOT NULL DEFAULT 'Not Started'
          CONSTRAINT project_allotments_progress_check
          CHECK (progress IN ('Not Started', 'In Progress', 'Blocked', 'Completed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (serial_number, employee_name, project, task_assigned)
      )
    `);
    await client.query(`
      ALTER TABLE project_allotments
      ADD COLUMN IF NOT EXISTS assigned_by TEXT NOT NULL DEFAULT 'Not recorded'
    `);
    await client.query(`
      ALTER TABLE project_allotments
      ADD COLUMN IF NOT EXISTS progress TEXT NOT NULL DEFAULT 'Not Started'
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'project_allotments_progress_check'
            AND conrelid = 'project_allotments'::regclass
        ) THEN
          ALTER TABLE project_allotments
          ADD CONSTRAINT project_allotments_progress_check
          CHECK (progress IN ('Not Started', 'In Progress', 'Blocked', 'Completed'));
        END IF;
      END
      $$
    `);

    for (const allotment of seedProjectAllotments) {
      await client.query(
        `INSERT INTO project_allotments (serial_number, employee_name, project, task_assigned)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (serial_number, employee_name, project, task_assigned) DO NOTHING`,
        [
          allotment.serialNumber,
          allotment.employeeName,
          allotment.project,
          allotment.taskAssigned,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type ProjectAllotment = {
  id: number;
  serialNumber: number;
  employeeName: string;
  project: string;
  taskAssigned: string;
  assignedBy: string;
  progress: TaskProgress;
};

export type TaskProgress = "Not Started" | "In Progress" | "Blocked" | "Completed";

export async function listProjectAllotments() {
  const { rows } = await pool.query<ProjectAllotment>(`
    SELECT
      id,
      serial_number AS "serialNumber",
      employee_name AS "employeeName",
      project,
      task_assigned AS "taskAssigned",
      assigned_by AS "assignedBy",
      progress
    FROM project_allotments
    ORDER BY serial_number, id
  `);
  return rows;
}

export async function createProjectAllotments(input: {
  employeeNames: string[];
  project: string;
  taskAssigned: string;
  assignedBy: string;
  progress: TaskProgress;
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(84726352)");
    const created: ProjectAllotment[] = [];

    for (const employeeName of input.employeeNames) {
      const currentEmployee = await client.query<{ serialNumber: number }>(
        `SELECT serial_number AS "serialNumber"
         FROM project_allotments
         WHERE employee_name = $1
         ORDER BY id
         LIMIT 1`,
        [employeeName],
      );

      let serialNumber = currentEmployee.rows[0]?.serialNumber;
      if (serialNumber === undefined) {
        const nextSerial = await client.query<{ serialNumber: number }>(
          `SELECT COALESCE(MAX(serial_number), 0) + 1 AS "serialNumber"
           FROM project_allotments`,
        );
        serialNumber = nextSerial.rows[0].serialNumber;
      }

      const inserted = await client.query<ProjectAllotment>(
        `INSERT INTO project_allotments
           (serial_number, employee_name, project, task_assigned, assigned_by, progress)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (serial_number, employee_name, project, task_assigned) DO NOTHING
         RETURNING
           id,
           serial_number AS "serialNumber",
           employee_name AS "employeeName",
           project,
           task_assigned AS "taskAssigned",
           assigned_by AS "assignedBy",
           progress`,
        [
          serialNumber,
          employeeName,
          input.project,
          input.taskAssigned,
          input.assignedBy,
          input.progress,
        ],
      );
      created.push(...inserted.rows);
    }

    if (created.length === 0) {
      await client.query("ROLLBACK");
      return [];
    }

    await client.query("COMMIT");
    return created;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateProjectAllotmentProgress(id: number, progress: TaskProgress) {
  const { rows } = await pool.query<ProjectAllotment>(
    `UPDATE project_allotments
     SET progress = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       serial_number AS "serialNumber",
       employee_name AS "employeeName",
       project,
       task_assigned AS "taskAssigned",
       assigned_by AS "assignedBy",
       progress`,
    [id, progress],
  );
  return rows[0] ?? null;
}

export async function listEmployees() {
  const { rows } = await pool.query<Employee>(
    `SELECT ${employeeColumns} FROM employees WHERE department = $1 ORDER BY id`,
    ["Technical"],
  );
  return rows;
}

export async function createEmployee(employee: EmployeeInput) {
  if (employee.department !== "Technical") {
    throw new Error("Employees can only be added to the Technical department from this dashboard.");
  }
  const { rows } = await pool.query<Employee>(
    `INSERT INTO employees (name, department, designation, current_work, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${employeeColumns}`,
    [employee.name, employee.department, employee.designation, employee.currentWork, employee.status],
  );
  return rows[0];
}

export async function updateEmployee(id: number, employee: EmployeeInput) {
  const { rows } = await pool.query<Employee>(
    `UPDATE employees
     SET name = $2,
         department = $3,
         designation = $4,
         current_work = $5,
         status = $6,
         updated_at = NOW()
     WHERE id = $1 AND department = $7
     RETURNING ${employeeColumns}`,
    [
      id,
      employee.name,
      employee.department,
      employee.designation,
      employee.currentWork,
      employee.status,
      "Technical",
    ],
  );
  return rows[0] ?? null;
}
