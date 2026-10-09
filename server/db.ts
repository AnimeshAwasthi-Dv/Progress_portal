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

export type UserRole = "Admin" | "Manager" | "Team Lead" | "Individual";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "In Review" | "Completed" | "Blocked";
export type ReviewDecision = "Approved" | "Changes Requested";

export type User = {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  avatarUrl?: string | null;
  isActive: boolean;
  teamId?: number | null;
  teamName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Team = {
  id: number;
  name: string;
  description: string | null;
  managerId: number | null;
  managerName?: string | null;
  leadId: number | null;
  leadName?: string | null;
  memberCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  managerId: number | null;
  managerName?: string | null;
  leadId: number | null;
  leadName?: string | null;
  status: "Planning" | "Active" | "On Hold" | "Completed" | "Archived";
  startDate: string | null;
  targetDate: string | null;
  progressPercent?: number;
  taskCount?: number;
  completedTaskCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Task = {
  id: number;
  taskCode: string;
  title: string;
  description: string;
  projectId: number;
  projectName?: string;
  parentTaskId: number | null;
  parentTaskTitle?: string | null;
  assignedByUserId: number;
  assignedByName?: string;
  assignedToUserId: number;
  assignedToName?: string;
  reviewerUserId: number | null;
  reviewerName?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number;
  actualHours: number;
  progressPercent: number;
  acceptanceCriteria: string;
  repositoryUrl: string | null;
  pullRequestUrl: string | null;
  acknowledgedAt: string | null;
  submittedForReviewAt: string | null;
  completedAt: string | null;
  blockerReason: string | null;
  collaboratorIds?: number[];
  collaboratorNames?: string[];
  subtasks?: Subtask[];
  dependencies?: TaskDependency[];
  createdAt: string;
  updatedAt: string;
};

export type Subtask = {
  id: number;
  taskId: number;
  title: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TaskDependency = {
  id: number;
  taskId: number;
  dependsOnTaskId: number;
  dependsOnTaskTitle?: string;
  dependsOnTaskStatus?: TaskStatus;
};

export type TaskComment = {
  id: number;
  taskId: number;
  userId: number;
  userName?: string;
  userRole?: UserRole;
  comment: string;
  createdAt: string;
};

export type TaskReview = {
  id: number;
  taskId: number;
  reviewerUserId: number;
  reviewerName?: string;
  decision: ReviewDecision;
  feedback: string;
  createdAt: string;
};

export type TaskActivity = {
  id: number;
  taskId: number;
  actorUserId: number;
  actorName?: string;
  action: string;
  fieldChanged: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
};

export type Notification = {
  id: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  taskId: number | null;
  projectId: number | null;
  isRead: boolean;
  createdAt: string;
};

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

export type TaskProgress = "Not Started" | "In Progress" | "Blocked" | "Completed";
export type ProjectAllotment = {
  id: number;
  serialNumber: number;
  employeeName: string;
  project: string;
  taskAssigned: string;
  assistanceBy: string[];
  progress: TaskProgress;
  repositoryUrl: string | null;
};

export type DailyProgressReport = {
  id: number;
  employeeName: string;
  userId?: number | null;
  reportDate: string;
  completedToday: string;
  plansNext: string;
  blockers: string;
  projectId?: number | null;
  projectName?: string | null;
  taskId?: number | null;
  taskTitle?: string | null;
  createdAt?: string;
};
export type DailyProgressReportInput = Omit<DailyProgressReport, "id">;

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(84726351)");

    // 1. Legacy tables preservation & creation
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
        assistance_by TEXT[] NOT NULL DEFAULT '{}',
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
      ALTER TABLE project_allotments
      ADD COLUMN IF NOT EXISTS repository_url TEXT
    `);
    await client.query(`
      ALTER TABLE project_allotments
      ADD COLUMN IF NOT EXISTS assistance_by TEXT[]
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_progress_reports (
        id SERIAL PRIMARY KEY,
        employee_name TEXT NOT NULL CHECK (length(trim(employee_name)) > 0),
        report_date DATE NOT NULL,
        completed_today TEXT NOT NULL CHECK (length(trim(completed_today)) > 0),
        plans_next TEXT NOT NULL DEFAULT '',
        blockers TEXT NOT NULL DEFAULT '',
        user_id INTEGER,
        project_id INTEGER,
        task_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (employee_name, report_date)
      )
    `);

    // 2. Comprehensive RBAC Schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        description TEXT,
        manager_id INTEGER,
        lead_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
        password_hash TEXT NOT NULL DEFAULT 'password123',
        role TEXT NOT NULL CHECK (role IN ('Admin', 'Manager', 'Team Lead', 'Individual')),
        department TEXT NOT NULL DEFAULT 'Technical',
        designation TEXT NOT NULL DEFAULT 'Software Engineer',
        avatar_url TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Foreign keys for teams manager and lead
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'teams_manager_id_fkey'
        ) THEN
          ALTER TABLE teams ADD CONSTRAINT teams_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'teams_lead_id_fkey'
        ) THEN
          ALTER TABLE teams ADD CONSTRAINT teams_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (team_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        code TEXT NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
        description TEXT,
        manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Planning', 'Active', 'On Hold', 'Completed', 'Archived')),
        start_date DATE,
        target_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_in_project TEXT NOT NULL DEFAULT 'Member',
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        task_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT NOT NULL DEFAULT '',
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        assigned_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        assigned_to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent')),
        status TEXT NOT NULL DEFAULT 'To Do' CHECK (status IN ('Backlog', 'To Do', 'In Progress', 'In Review', 'Completed', 'Blocked')),
        start_date DATE,
        due_date DATE,
        estimated_hours NUMERIC(6, 2) NOT NULL DEFAULT 8.0,
        actual_hours NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
        progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
        acceptance_criteria TEXT NOT NULL DEFAULT '',
        repository_url TEXT,
        pull_request_url TEXT,
        acknowledged_at TIMESTAMPTZ,
        submitted_for_review_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        blocker_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_collaborators (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (task_id, depends_on_task_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        is_completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_comments (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        comment TEXT NOT NULL CHECK (length(trim(comment)) > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_reviews (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        reviewer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        decision TEXT NOT NULL CHECK (decision IN ('Approved', 'Changes Requested')),
        feedback TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS task_activity_history (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        field_changed TEXT,
        old_value TEXT,
        new_value TEXT,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system',
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes for fast querying
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_reviewer ON tasks(reviewer_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_activity_task_id ON task_activity_history(task_id);
    `);

    // Seed default teams and users if not exists
    const usersCount = await client.query<{ count: string }>("SELECT COUNT(*) FROM users");
    if (Number(usersCount.rows[0].count) === 0) {
      // Create initial teams
      const teamRes = await client.query(
        `INSERT INTO teams (name, description)
         VALUES 
          ('Engineering - Core Systems', 'Backend, Platform, DB & Cloud Infrastructure'),
          ('AI & Imaging Systems', 'DICOM, AI models, remote processing'),
          ('Product Applications', 'Web & Mobile Portals')
         RETURNING id, name`,
      );
      const coreTeamId = teamRes.rows[0].id;
      const aiTeamId = teamRes.rows[1].id;
      const appTeamId = teamRes.rows[2].id;

      // Create users: Admin (unnamed role), Technical Lead (Animesh), Technical Interns (Vaibhav, Sakshi, Suraj), Sales Team (Rohit, Neha)
      const seedUsers = [
        { name: "Admin", email: "admin@taskmanager.internal", role: "Admin", dept: "Executive", desig: "System Administrator", teamId: coreTeamId },
        { name: "Animesh", email: "animesh@taskmanager.internal", role: "Team Lead", dept: "Technical", desig: "Technical Lead", teamId: coreTeamId },
        { name: "Vaibhav", email: "vaibhav@taskmanager.internal", role: "Individual", dept: "Technical", desig: "Technical Intern", teamId: aiTeamId },
        { name: "Sakshi", email: "sakshi@taskmanager.internal", role: "Individual", dept: "Technical", desig: "Technical Intern", teamId: aiTeamId },
        { name: "Suraj", email: "suraj@taskmanager.internal", role: "Individual", dept: "Technical", desig: "Technical Intern", teamId: aiTeamId },
        { name: "Rohit", email: "rohit@taskmanager.internal", role: "Team Lead", dept: "Sales", desig: "Sales Lead", teamId: appTeamId },
        { name: "Neha", email: "neha@taskmanager.internal", role: "Individual", dept: "Sales", desig: "Sales Executive", teamId: appTeamId },
      ];

      const insertedUsers: Record<string, number> = {};
      for (const u of seedUsers) {
        const uRes = await client.query<{ id: number }>(
          `INSERT INTO users (name, email, password_hash, role, department, designation, team_id)
           VALUES ($1, $2, 'password123', $3, $4, $5, $6)
           RETURNING id`,
          [u.name, u.email, u.role, u.dept, u.desig, u.teamId],
        );
        insertedUsers[u.name] = uRes.rows[0].id;

        // Also add to team_members
        await client.query(
          `INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [u.teamId, uRes.rows[0].id],
        );

        // Populate employees table if not present
        await client.query(
          `INSERT INTO employees (name, department, designation, current_work, status)
           VALUES ($1, $2, $3, 'Active project tasks', 'In Progress')
           ON CONFLICT DO NOTHING`,
          [u.name, u.dept, u.desig],
        );
      }

      // Update team leads and managers
      await client.query(`UPDATE teams SET manager_id = $1, lead_id = $2 WHERE id = $3`, [
        insertedUsers["Admin"],
        insertedUsers["Animesh"],
        coreTeamId,
      ]);
      await client.query(`UPDATE teams SET manager_id = $1, lead_id = $2 WHERE id = $3`, [
        insertedUsers["Admin"],
        insertedUsers["Animesh"],
        aiTeamId,
      ]);
      await client.query(`UPDATE teams SET manager_id = $1, lead_id = $2 WHERE id = $3`, [
        insertedUsers["Admin"],
        insertedUsers["Rohit"],
        appTeamId,
      ]);

      // Seed core Projects
      const seedProjects = [
        { name: "Analytics Portal [AI endpoint usage]", code: "ANA", mgr: "Admin", lead: "Animesh" },
        { name: "Data Portal / Study Portal [NCG/COPD]", code: "DAT", mgr: "Admin", lead: "Animesh" },
        { name: "Marengo portal Staging", code: "MAR", mgr: "Admin", lead: "Animesh" },
        { name: "DICOM viewer Marengo", code: "DIC", mgr: "Admin", lead: "Animesh" },
        { name: "Common PACS portal", code: "PAC", mgr: "Admin", lead: "Animesh" },
        { name: "Technical Team Infrastructure", code: "INF", mgr: "Admin", lead: "Animesh" },
        { name: "Enterprise Client Pipeline & Expansion", code: "SLS", mgr: "Admin", lead: "Rohit" },
      ];

      const insertedProjects: Record<string, number> = {};
      for (const p of seedProjects) {
        const pRes = await client.query<{ id: number }>(
          `INSERT INTO projects (name, code, description, manager_id, lead_id, status, start_date, target_date)
           VALUES ($1, $2, $3, $4, $5, 'Active', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE + INTERVAL '45 days')
           RETURNING id`,
          [
            p.name,
            p.code,
            `Core organizational project for ${p.name}`,
            insertedUsers[p.mgr] ?? insertedUsers["Admin"],
            insertedUsers[p.lead] ?? insertedUsers["Animesh"],
          ],
        );
        insertedProjects[p.name] = pRes.rows[0].id;

        // Add team members to project members
        for (const uId of Object.values(insertedUsers)) {
          await client.query(
            `INSERT INTO project_members (project_id, user_id, role_in_project)
             VALUES ($1, $2, 'Contributor')
             ON CONFLICT DO NOTHING`,
            [pRes.rows[0].id, uId],
          );
        }
      }

      // Seed existing allotments into tasks table
      let taskIndex = 1;
      for (const allotment of seedProjectAllotments) {
        const pId =
          insertedProjects[allotment.project] ||
          insertedProjects["Technical Team Infrastructure"] ||
          Object.values(insertedProjects)[0];
        const assignedToId = insertedUsers[allotment.employeeName] || insertedUsers["Animesh"];
        const assignedById = insertedUsers["Animesh"] || insertedUsers["Admin"];
        const reviewerId = allotment.employeeName === "Animesh" ? insertedUsers["Shivam"] : insertedUsers["Animesh"];
        const code = `TSK-${String(taskIndex).padStart(3, "0")}`;

        const isBlocked = taskIndex === 5;
        const isInReview = taskIndex === 3;
        const isCompleted = taskIndex === 1 || taskIndex === 8;
        const status: TaskStatus = isBlocked
          ? "Blocked"
          : isInReview
          ? "In Review"
          : isCompleted
          ? "Completed"
          : "In Progress";

        const tRes = await client.query<{ id: number }>(
          `INSERT INTO tasks (
            task_code, title, description, project_id, assigned_by_user_id, assigned_to_user_id,
            reviewer_user_id, priority, status, start_date, due_date, estimated_hours, actual_hours,
            progress_percent, acceptance_criteria, repository_url, blocker_reason, acknowledged_at,
            completed_at, submitted_for_review_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE + INTERVAL '7 days', 16, 8, $10, $11, $12, $13, NOW(), $14, $15)
           RETURNING id`,
          [
            code,
            allotment.taskAssigned.slice(0, 80),
            allotment.taskAssigned,
            pId,
            assignedById,
            assignedToId,
            reviewerId,
            taskIndex % 3 === 0 ? "High" : taskIndex % 2 === 0 ? "Urgent" : "Medium",
            status,
            isCompleted ? 100 : isInReview ? 90 : isBlocked ? 40 : 50,
            "1. Must be verified in staging.\n2. Code reviewed and merged.\n3. Documentation updated.",
            "https://github.com/org/task-repo",
            isBlocked ? "Awaiting staging cluster certificate renewal" : null,
            isCompleted ? new Date() : null,
            isInReview ? new Date() : null,
          ],
        );

        const taskId = tRes.rows[0].id;

        // Subtasks
        await client.query(
          `INSERT INTO subtasks (task_id, title, is_completed)
           VALUES 
            ($1, 'Requirements analysis & setup', true),
            ($1, 'Implementation and unit tests', $2),
            ($1, 'Staging deployment & QA verify', $3)`,
          [taskId, isCompleted || isInReview, isCompleted],
        );

        // Activity log
        await client.query(
          `INSERT INTO task_activity_history (task_id, actor_user_id, action, new_value)
           VALUES 
            ($1, $2, 'TASK_CREATED', 'Task initialized and assigned'),
            ($1, $3, 'STATUS_CHANGE', $4)`,
          [taskId, assignedById, assignedToId, status],
        );

        // Comments
        await client.query(
          `INSERT INTO task_comments (task_id, user_id, comment)
           VALUES ($1, $2, 'Initial progress made on architectural setup. Continuing with implementation.')`,
          [taskId, assignedToId],
        );

        taskIndex++;
      }

      // Add default notifications
      for (const u of Object.values(insertedUsers)) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, type, is_read)
           VALUES 
            ($1, 'Welcome to the Task & Workload Management Platform', 'Your role and workspace have been configured.', 'system', false),
            ($1, 'Task Review Assigned', 'You have project deliverables scheduled for review this week.', 'task', false)`,
          [u],
        );
      }
    }

    // Seed project_allotments if not exists
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

// ----------------- Data Access Functions ----------------- //

export async function listUsers() {
  const { rows } = await pool.query<User>(`
    SELECT 
      u.id,
      u.name,
      u.email,
      u.role,
      u.department,
      u.designation,
      u.avatar_url AS "avatarUrl",
      u.is_active AS "isActive",
      u.team_id AS "teamId",
      t.name AS "teamName",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    ORDER BY u.id
  `);
  return rows;
}

export async function getUserById(id: number) {
  const { rows } = await pool.query<User>(`
    SELECT 
      u.id,
      u.name,
      u.email,
      u.role,
      u.department,
      u.designation,
      u.avatar_url AS "avatarUrl",
      u.is_active AS "isActive",
      u.team_id AS "teamId",
      t.name AS "teamName",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    WHERE u.id = $1
  `, [id]);
  return rows[0] ?? null;
}

export async function updateUserRoleAndStatus(id: number, input: { role?: UserRole; isActive?: boolean; teamId?: number | null; designation?: string; department?: string; name?: string }) {
  const fields: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  if (input.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(input.name);
  }
  if (input.role !== undefined) {
    fields.push(`role = $${idx++}`);
    values.push(input.role);
  }
  if (input.isActive !== undefined) {
    fields.push(`is_active = $${idx++}`);
    values.push(input.isActive);
  }
  if (input.teamId !== undefined) {
    fields.push(`team_id = $${idx++}`);
    values.push(input.teamId);
  }
  if (input.designation !== undefined) {
    fields.push(`designation = $${idx++}`);
    values.push(input.designation);
  }
  if (input.department !== undefined) {
    fields.push(`department = $${idx++}`);
    values.push(input.department);
  }

  if (fields.length === 0) return getUserById(id);

  fields.push(`updated_at = NOW()`);
  await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = $1`, values);
  return getUserById(id);
}

export async function createUser(input: {
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  teamId?: number | null;
}) {
  const { rows } = await pool.query<{ id: number }>(`
    INSERT INTO users (name, email, role, department, designation, team_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [input.name, input.email, input.role, input.department, input.designation, input.teamId || null]);

  if (input.teamId) {
    await pool.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [input.teamId, rows[0].id]);
  }

  await pool.query(`
    INSERT INTO employees (name, department, designation, current_work, status)
    VALUES ($1, $2, $3, 'Active project tasks', 'In Progress')
    ON CONFLICT DO NOTHING
  `, [input.name, input.department, input.designation]);

  return getUserById(rows[0].id);
}

export async function listTeams() {
  const { rows } = await pool.query<Team>(`
    SELECT 
      t.id,
      t.name,
      t.description,
      t.manager_id AS "managerId",
      um.name AS "managerName",
      t.lead_id AS "leadId",
      ul.name AS "leadName",
      COUNT(DISTINCT tm.user_id)::integer AS "memberCount",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM teams t
    LEFT JOIN users um ON t.manager_id = um.id
    LEFT JOIN users ul ON t.lead_id = ul.id
    LEFT JOIN team_members tm ON t.id = tm.team_id
    GROUP BY t.id, um.name, ul.name
    ORDER BY t.id
  `);
  return rows;
}

export async function createTeam(input: { name: string; description?: string; managerId?: number | null; leadId?: number | null }) {
  const { rows } = await pool.query<Team>(`
    INSERT INTO teams (name, description, manager_id, lead_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name, description, manager_id AS "managerId", lead_id AS "leadId", created_at AS "createdAt", updated_at AS "updatedAt"
  `, [input.name, input.description || null, input.managerId || null, input.leadId || null]);
  return rows[0];
}

export async function listProjects() {
  const { rows } = await pool.query<Project>(`
    SELECT 
      p.id,
      p.name,
      p.code,
      p.description,
      p.manager_id AS "managerId",
      um.name AS "managerName",
      p.lead_id AS "leadId",
      ul.name AS "leadName",
      p.status,
      to_char(p.start_date, 'YYYY-MM-DD') AS "startDate",
      to_char(p.target_date, 'YYYY-MM-DD') AS "targetDate",
      COUNT(t.id)::integer AS "taskCount",
      COUNT(CASE WHEN t.status = 'Completed' THEN 1 END)::integer AS "completedTaskCount",
      COALESCE(ROUND(AVG(t.progress_percent)), 0)::integer AS "progressPercent",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt"
    FROM projects p
    LEFT JOIN users um ON p.manager_id = um.id
    LEFT JOIN users ul ON p.lead_id = ul.id
    LEFT JOIN tasks t ON p.id = t.project_id
    GROUP BY p.id, um.name, ul.name
    ORDER BY p.id
  `);
  return rows;
}

export async function createProject(input: {
  name: string;
  code: string;
  description?: string;
  managerId?: number | null;
  leadId?: number | null;
  startDate?: string | null;
  targetDate?: string | null;
}) {
  const { rows } = await pool.query<Project>(`
    INSERT INTO projects (name, code, description, manager_id, lead_id, start_date, target_date)
    VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
    RETURNING id, name, code, description, manager_id AS "managerId", lead_id AS "leadId", status,
      to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
      created_at AS "createdAt", updated_at AS "updatedAt"
  `, [input.name, input.code.toUpperCase(), input.description || null, input.managerId || null, input.leadId || null, input.startDate || null, input.targetDate || null]);
  return rows[0];
}

export async function listTasks(filters?: {
  projectId?: number;
  assignedToUserId?: number;
  assignedByUserId?: number;
  reviewerUserId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
}) {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filters?.projectId) {
    conditions.push(`t.project_id = $${idx++}`);
    values.push(filters.projectId);
  }
  if (filters?.assignedToUserId) {
    conditions.push(`(t.assigned_to_user_id = $${idx} OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = $${idx}))`);
    idx++;
    values.push(filters.assignedToUserId);
  }
  if (filters?.assignedByUserId) {
    conditions.push(`t.assigned_by_user_id = $${idx++}`);
    values.push(filters.assignedByUserId);
  }
  if (filters?.reviewerUserId) {
    conditions.push(`t.reviewer_user_id = $${idx++}`);
    values.push(filters.reviewerUserId);
  }
  if (filters?.status) {
    conditions.push(`t.status = $${idx++}`);
    values.push(filters.status);
  }
  if (filters?.priority) {
    conditions.push(`t.priority = $${idx++}`);
    values.push(filters.priority);
  }
  if (filters?.search) {
    conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx} OR t.task_code ILIKE $${idx} OR p.name ILIKE $${idx} OR u_to.name ILIKE $${idx})`);
    values.push(`%${filters.search}%`);
    idx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<Task>(`
    SELECT 
      t.id,
      t.task_code AS "taskCode",
      t.title,
      t.description,
      t.project_id AS "projectId",
      p.name AS "projectName",
      t.parent_task_id AS "parentTaskId",
      pt.title AS "parentTaskTitle",
      t.assigned_by_user_id AS "assignedByUserId",
      u_by.name AS "assignedByName",
      t.assigned_to_user_id AS "assignedToUserId",
      u_to.name AS "assignedToName",
      t.reviewer_user_id AS "reviewerUserId",
      u_rev.name AS "reviewerName",
      t.priority,
      t.status,
      to_char(t.start_date, 'YYYY-MM-DD') AS "startDate",
      to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate",
      t.estimated_hours::float AS "estimatedHours",
      t.actual_hours::float AS "actualHours",
      t.progress_percent AS "progressPercent",
      t.acceptance_criteria AS "acceptanceCriteria",
      t.repository_url AS "repositoryUrl",
      t.pull_request_url AS "pullRequestUrl",
      t.acknowledged_at AS "acknowledgedAt",
      t.submitted_for_review_at AS "submittedForReviewAt",
      t.completed_at AS "completedAt",
      t.blocker_reason AS "blockerReason",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      COALESCE(ARRAY_AGG(DISTINCT tc_u.id) FILTER (WHERE tc_u.id IS NOT NULL), '{}') AS "collaboratorIds",
      COALESCE(ARRAY_AGG(DISTINCT tc_u.name) FILTER (WHERE tc_u.name IS NOT NULL), '{}') AS "collaboratorNames"
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks pt ON t.parent_task_id = pt.id
    JOIN users u_by ON t.assigned_by_user_id = u_by.id
    JOIN users u_to ON t.assigned_to_user_id = u_to.id
    LEFT JOIN users u_rev ON t.reviewer_user_id = u_rev.id
    LEFT JOIN task_collaborators tc ON t.id = tc.task_id
    LEFT JOIN users tc_u ON tc.user_id = tc_u.id
    ${whereClause}
    GROUP BY t.id, p.name, pt.title, u_by.name, u_to.name, u_rev.name
    ORDER BY t.id DESC
  `, values);

  return rows;
}

export async function getTaskById(id: number) {
  const { rows } = await pool.query<Task>(`
    SELECT 
      t.id,
      t.task_code AS "taskCode",
      t.title,
      t.description,
      t.project_id AS "projectId",
      p.name AS "projectName",
      t.parent_task_id AS "parentTaskId",
      pt.title AS "parentTaskTitle",
      t.assigned_by_user_id AS "assignedByUserId",
      u_by.name AS "assignedByName",
      t.assigned_to_user_id AS "assignedToUserId",
      u_to.name AS "assignedToName",
      t.reviewer_user_id AS "reviewerUserId",
      u_rev.name AS "reviewerName",
      t.priority,
      t.status,
      to_char(t.start_date, 'YYYY-MM-DD') AS "startDate",
      to_char(t.due_date, 'YYYY-MM-DD') AS "dueDate",
      t.estimated_hours::float AS "estimatedHours",
      t.actual_hours::float AS "actualHours",
      t.progress_percent AS "progressPercent",
      t.acceptance_criteria AS "acceptanceCriteria",
      t.repository_url AS "repositoryUrl",
      t.pull_request_url AS "pullRequestUrl",
      t.acknowledged_at AS "acknowledgedAt",
      t.submitted_for_review_at AS "submittedForReviewAt",
      t.completed_at AS "completedAt",
      t.blocker_reason AS "blockerReason",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      COALESCE(ARRAY_AGG(DISTINCT tc_u.id) FILTER (WHERE tc_u.id IS NOT NULL), '{}') AS "collaboratorIds",
      COALESCE(ARRAY_AGG(DISTINCT tc_u.name) FILTER (WHERE tc_u.name IS NOT NULL), '{}') AS "collaboratorNames"
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks pt ON t.parent_task_id = pt.id
    JOIN users u_by ON t.assigned_by_user_id = u_by.id
    JOIN users u_to ON t.assigned_to_user_id = u_to.id
    LEFT JOIN users u_rev ON t.reviewer_user_id = u_rev.id
    LEFT JOIN task_collaborators tc ON t.id = tc.task_id
    LEFT JOIN users tc_u ON tc.user_id = tc_u.id
    WHERE t.id = $1
    GROUP BY t.id, p.name, pt.title, u_by.name, u_to.name, u_rev.name
  `, [id]);

  if (!rows[0]) return null;

  const task = rows[0];

  // Fetch subtasks
  const subtasksRes = await pool.query<Subtask>(`
    SELECT id, task_id AS "taskId", title, is_completed AS "isCompleted", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM subtasks
    WHERE task_id = $1
    ORDER BY id
  `, [id]);
  task.subtasks = subtasksRes.rows;

  // Fetch dependencies
  const depsRes = await pool.query<TaskDependency>(`
    SELECT td.id, td.task_id AS "taskId", td.depends_on_task_id AS "dependsOnTaskId",
           dt.title AS "dependsOnTaskTitle", dt.status AS "dependsOnTaskStatus"
    FROM task_dependencies td
    JOIN tasks dt ON td.depends_on_task_id = dt.id
    WHERE td.task_id = $1
    ORDER BY td.id
  `, [id]);
  task.dependencies = depsRes.rows;

  return task;
}

export async function createTask(input: {
  title: string;
  description?: string;
  projectId: number;
  parentTaskId?: number | null;
  assignedByUserId: number;
  assignedToUserId: number;
  reviewerUserId?: number | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number;
  acceptanceCriteria?: string;
  repositoryUrl?: string | null;
  pullRequestUrl?: string | null;
  collaboratorIds?: number[];
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Generate task code
    const countRes = await client.query<{ count: string }>("SELECT COUNT(*) FROM tasks");
    const nextNum = Number(countRes.rows[0].count) + 1;
    const taskCode = `TSK-${String(nextNum).padStart(3, "0")}`;

    const { rows } = await client.query<{ id: number }>(`
      INSERT INTO tasks (
        task_code, title, description, project_id, parent_task_id,
        assigned_by_user_id, assigned_to_user_id, reviewer_user_id,
        priority, status, start_date, due_date, estimated_hours,
        acceptance_criteria, repository_url, pull_request_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::date, $13, $14, $15, $16)
      RETURNING id
    `, [
      taskCode,
      input.title,
      input.description || "",
      input.projectId,
      input.parentTaskId || null,
      input.assignedByUserId,
      input.assignedToUserId,
      input.reviewerUserId || null,
      input.priority || "Medium",
      input.status || "To Do",
      input.startDate || null,
      input.dueDate || null,
      input.estimatedHours || 8,
      input.acceptanceCriteria || "",
      input.repositoryUrl || null,
      input.pullRequestUrl || null,
    ]);

    const taskId = rows[0].id;

    if (input.collaboratorIds && input.collaboratorIds.length > 0) {
      for (const colId of input.collaboratorIds) {
        await client.query(`INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [taskId, colId]);
      }
    }

    // Record activity
    await client.query(`
      INSERT INTO task_activity_history (task_id, actor_user_id, action, new_value)
      VALUES ($1, $2, 'TASK_CREATED', $3)
    `, [taskId, input.assignedByUserId, `Task created and assigned to user #${input.assignedToUserId}`]);

    // Send in-app notification to assignee
    await client.query(`
      INSERT INTO notifications (user_id, title, message, type, task_id, project_id)
      VALUES ($1, $2, $3, 'assignment', $4, $5)
    `, [
      input.assignedToUserId,
      `New Task Assigned: ${input.title}`,
      `You have been assigned task ${taskCode}. Deadline: ${input.dueDate || 'Not specified'}`,
      taskId,
      input.projectId
    ]);

    await client.query("COMMIT");
    return getTaskById(taskId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateTaskDetails(id: number, actorUserId: number, input: {
  title?: string;
  description?: string;
  projectId?: number;
  assignedToUserId?: number;
  reviewerUserId?: number | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  progressPercent?: number;
  acceptanceCriteria?: string;
  repositoryUrl?: string | null;
  pullRequestUrl?: string | null;
  blockerReason?: string | null;
  reassignReason?: string;
  collaboratorIds?: number[];
}) {
  const current = await getTaskById(id);
  if (!current) return null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const fields: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;

    if (input.title !== undefined && input.title !== current.title) {
      fields.push(`title = $${idx++}`);
      values.push(input.title);
      await client.query(`INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value) VALUES ($1, $2, 'UPDATED_FIELD', 'title', $3, $4)`, [id, actorUserId, current.title, input.title]);
    }
    if (input.description !== undefined && input.description !== current.description) {
      fields.push(`description = $${idx++}`);
      values.push(input.description);
    }
    if (input.projectId !== undefined && input.projectId !== current.projectId) {
      fields.push(`project_id = $${idx++}`);
      values.push(input.projectId);
    }
    if (input.assignedToUserId !== undefined && input.assignedToUserId !== current.assignedToUserId) {
      fields.push(`assigned_to_user_id = $${idx++}`);
      values.push(input.assignedToUserId);
      await client.query(`INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value, reason) VALUES ($1, $2, 'REASSIGNED', 'assigned_to', $3, $4, $5)`, [id, actorUserId, String(current.assignedToUserId), String(input.assignedToUserId), input.reassignReason || 'Task reassignment']);
      // Notify new owner
      await client.query(`INSERT INTO notifications (user_id, title, message, type, task_id) VALUES ($1, 'Task Reassigned to You', $2, 'reassignment', $3)`, [input.assignedToUserId, `Task ${current.taskCode} has been reassigned to you. Reason: ${input.reassignReason || 'Reassigned by lead/manager'}`, id]);
    }
    if (input.reviewerUserId !== undefined && input.reviewerUserId !== current.reviewerUserId) {
      fields.push(`reviewer_user_id = $${idx++}`);
      values.push(input.reviewerUserId);
      await client.query(`INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value) VALUES ($1, $2, 'REVIEWER_CHANGED', 'reviewer', $3, $4)`, [id, actorUserId, String(current.reviewerUserId), String(input.reviewerUserId)]);
    }
    if (input.priority !== undefined && input.priority !== current.priority) {
      fields.push(`priority = $${idx++}`);
      values.push(input.priority);
      await client.query(`INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value) VALUES ($1, $2, 'PRIORITY_CHANGED', 'priority', $3, $4)`, [id, actorUserId, current.priority, input.priority]);
    }
    if (input.status !== undefined && input.status !== current.status) {
      fields.push(`status = $${idx++}`);
      values.push(input.status);
      if (input.status === 'Completed') {
        fields.push(`completed_at = NOW()`);
        fields.push(`progress_percent = 100`);
      } else if (input.status === 'In Review') {
        fields.push(`submitted_for_review_at = NOW()`);
      }
      await client.query(`INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value) VALUES ($1, $2, 'STATUS_CHANGED', 'status', $3, $4)`, [id, actorUserId, current.status, input.status]);
      
      // If status changed to In Review, notify reviewer
      if (input.status === 'In Review' && current.reviewerUserId) {
        await client.query(`INSERT INTO notifications (user_id, title, message, type, task_id) VALUES ($1, 'Deliverable Ready for Review', $2, 'review_request', $3)`, [current.reviewerUserId, `Task ${current.taskCode} (${current.title}) submitted for review.`, id]);
      }
      // If status changed to Blocked, notify assigner and lead
      if (input.status === 'Blocked') {
        await client.query(`INSERT INTO notifications (user_id, title, message, type, task_id) VALUES ($1, 'Task Blocked Alert', $2, 'blocker', $3)`, [current.assignedByUserId, `Task ${current.taskCode} has been marked as Blocked: ${input.blockerReason || 'Technical blocker reported.'}`, id]);
      }
    }
    if (input.startDate !== undefined) {
      fields.push(`start_date = $${idx++}::date`);
      values.push(input.startDate || null);
    }
    if (input.dueDate !== undefined) {
      fields.push(`due_date = $${idx++}::date`);
      values.push(input.dueDate || null);
    }
    if (input.estimatedHours !== undefined) {
      fields.push(`estimated_hours = $${idx++}`);
      values.push(input.estimatedHours);
    }
    if (input.actualHours !== undefined) {
      fields.push(`actual_hours = $${idx++}`);
      values.push(input.actualHours);
    }
    if (input.progressPercent !== undefined) {
      fields.push(`progress_percent = $${idx++}`);
      values.push(input.progressPercent);
    }
    if (input.acceptanceCriteria !== undefined) {
      fields.push(`acceptance_criteria = $${idx++}`);
      values.push(input.acceptanceCriteria);
    }
    if (input.repositoryUrl !== undefined) {
      fields.push(`repository_url = $${idx++}`);
      values.push(input.repositoryUrl || null);
    }
    if (input.pullRequestUrl !== undefined) {
      fields.push(`pull_request_url = $${idx++}`);
      values.push(input.pullRequestUrl || null);
    }
    if (input.blockerReason !== undefined) {
      fields.push(`blocker_reason = $${idx++}`);
      values.push(input.blockerReason || null);
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      await client.query(`UPDATE tasks SET ${fields.join(", ")} WHERE id = $1`, values);
    }

    if (input.collaboratorIds !== undefined) {
      await client.query(`DELETE FROM task_collaborators WHERE task_id = $1`, [id]);
      for (const colId of input.collaboratorIds) {
        await client.query(`INSERT INTO task_collaborators (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, colId]);
      }
    }

    await client.query("COMMIT");
    return getTaskById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function acknowledgeTask(taskId: number, userId: number) {
  const { rows } = await pool.query(`
    UPDATE tasks
    SET acknowledged_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND (assigned_to_user_id = $2 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = $1 AND tc.user_id = $2))
    RETURNING id
  `, [taskId, userId]);

  if (rows.length > 0) {
    await pool.query(`
      INSERT INTO task_activity_history (task_id, actor_user_id, action, new_value)
      VALUES ($1, $2, 'TASK_ACKNOWLEDGED', 'Assignment acknowledged by team member')
    `, [taskId, userId]);
  }

  return getTaskById(taskId);
}

export async function submitTaskReview(taskId: number, reviewerUserId: number, input: { decision: ReviewDecision; feedback: string }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const task = await getTaskById(taskId);
    if (!task) throw new Error("Task not found");

    await client.query(`
      INSERT INTO task_reviews (task_id, reviewer_user_id, decision, feedback)
      VALUES ($1, $2, $3, $4)
    `, [taskId, reviewerUserId, input.decision, input.feedback]);

    if (input.decision === "Approved") {
      await client.query(`
        UPDATE tasks
        SET status = 'Completed', progress_percent = 100, completed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      await client.query(`
        INSERT INTO task_activity_history (task_id, actor_user_id, action, new_value, reason)
        VALUES ($1, $2, 'REVIEW_APPROVED', 'Completed', $3)
      `, [taskId, reviewerUserId, input.feedback]);

      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, task_id)
        VALUES ($1, 'Deliverable Approved!', $2, 'review_approval', $3)
      `, [task.assignedToUserId, `Your work for task ${task.taskCode} has been approved. Feedback: ${input.feedback}`, taskId]);
    } else {
      await client.query(`
        UPDATE tasks
        SET status = 'In Progress', updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      await client.query(`
        INSERT INTO task_activity_history (task_id, actor_user_id, action, new_value, reason)
        VALUES ($1, $2, 'CHANGES_REQUESTED', 'In Progress', $3)
      `, [taskId, reviewerUserId, input.feedback]);

      await client.query(`
        INSERT INTO notifications (user_id, title, message, type, task_id)
        VALUES ($1, 'Changes Requested on Deliverable', $2, 'changes_requested', $3)
      `, [task.assignedToUserId, `Changes requested on task ${task.taskCode}. Review feedback: ${input.feedback}`, taskId]);
    }

    await client.query("COMMIT");
    return getTaskById(taskId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listTaskComments(taskId: number) {
  const { rows } = await pool.query<TaskComment>(`
    SELECT 
      tc.id,
      tc.task_id AS "taskId",
      tc.user_id AS "userId",
      u.name AS "userName",
      u.role AS "userRole",
      tc.comment,
      tc.created_at AS "createdAt"
    FROM task_comments tc
    JOIN users u ON tc.user_id = u.id
    WHERE tc.task_id = $1
    ORDER BY tc.id ASC
  `, [taskId]);
  return rows;
}

export async function addTaskComment(taskId: number, userId: number, comment: string) {
  const { rows } = await pool.query<TaskComment>(`
    INSERT INTO task_comments (task_id, user_id, comment)
    VALUES ($1, $2, $3)
    RETURNING id, task_id AS "taskId", user_id AS "userId", comment, created_at AS "createdAt"
  `, [taskId, userId, comment]);

  const user = await getUserById(userId);
  return {
    ...rows[0],
    userName: user?.name,
    userRole: user?.role,
  };
}

export async function listTaskActivity(taskId: number) {
  const { rows } = await pool.query<TaskActivity>(`
    SELECT 
      tah.id,
      tah.task_id AS "taskId",
      tah.actor_user_id AS "actorUserId",
      u.name AS "actorName",
      tah.action,
      tah.field_changed AS "fieldChanged",
      tah.old_value AS "oldValue",
      tah.new_value AS "newValue",
      tah.reason,
      tah.created_at AS "createdAt"
    FROM task_activity_history tah
    JOIN users u ON tah.actor_user_id = u.id
    WHERE tah.task_id = $1
    ORDER BY tah.id DESC
  `, [taskId]);
  return rows;
}

export async function listTaskReviews(taskId: number) {
  const { rows } = await pool.query<TaskReview>(`
    SELECT 
      tr.id,
      tr.task_id AS "taskId",
      tr.reviewer_user_id AS "reviewerUserId",
      u.name AS "reviewerName",
      tr.decision,
      tr.feedback,
      tr.created_at AS "createdAt"
    FROM task_reviews tr
    JOIN users u ON tr.reviewer_user_id = u.id
    WHERE tr.task_id = $1
    ORDER BY tr.id DESC
  `, [taskId]);
  return rows;
}

export async function addSubtask(taskId: number, title: string) {
  const { rows } = await pool.query<Subtask>(`
    INSERT INTO subtasks (task_id, title)
    VALUES ($1, $2)
    RETURNING id, task_id AS "taskId", title, is_completed AS "isCompleted", created_at AS "createdAt", updated_at AS "updatedAt"
  `, [taskId, title]);
  return rows[0];
}

export async function toggleSubtask(id: number, isCompleted: boolean) {
  const { rows } = await pool.query<Subtask>(`
    UPDATE subtasks
    SET is_completed = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING id, task_id AS "taskId", title, is_completed AS "isCompleted", created_at AS "createdAt", updated_at AS "updatedAt"
  `, [id, isCompleted]);
  return rows[0] ?? null;
}

export async function listNotifications(userId: number) {
  const { rows } = await pool.query<Notification>(`
    SELECT id, user_id AS "userId", title, message, type, task_id AS "taskId", project_id AS "projectId", is_read AS "isRead", created_at AS "createdAt"
    FROM notifications
    WHERE user_id = $1
    ORDER BY id DESC
    LIMIT 50
  `, [userId]);
  return rows;
}

export async function markNotificationRead(id: number, userId: number) {
  await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`, [id, userId]);
  return { success: true };
}

export async function markAllNotificationsRead(userId: number) {
  await pool.query(`UPDATE notifications SET is_read = true WHERE user_id = $1`, [userId]);
  return { success: true };
}

export async function getTeamWorkloadAnalytics() {
  const { rows } = await pool.query(`
    SELECT 
      u.id AS "userId",
      u.name,
      u.email,
      u.role,
      u.designation,
      u.department,
      t.id AS "teamId",
      t.name AS "teamName",
      COUNT(tasks.id)::integer AS "totalTasks",
      COUNT(CASE WHEN tasks.status = 'In Progress' THEN 1 END)::integer AS "inProgressTasks",
      COUNT(CASE WHEN tasks.status = 'To Do' THEN 1 END)::integer AS "toDoTasks",
      COUNT(CASE WHEN tasks.status = 'In Review' THEN 1 END)::integer AS "inReviewTasks",
      COUNT(CASE WHEN tasks.status = 'Blocked' THEN 1 END)::integer AS "blockedTasks",
      COUNT(CASE WHEN tasks.status = 'Completed' THEN 1 END)::integer AS "completedTasks",
      COUNT(CASE WHEN tasks.due_date < CURRENT_DATE AND tasks.status NOT IN ('Completed') THEN 1 END)::integer AS "overdueTasks",
      COALESCE(SUM(CASE WHEN tasks.status NOT IN ('Completed') THEN tasks.estimated_hours END), 0)::float AS "totalEstimatedHours",
      COALESCE(SUM(tasks.actual_hours), 0)::float AS "totalActualHours"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    LEFT JOIN tasks ON u.id = tasks.assigned_to_user_id
    WHERE u.is_active = true
    GROUP BY u.id, u.name, u.email, u.role, u.designation, u.department, t.id, t.name
    ORDER BY "totalTasks" DESC, u.name ASC
  `);
  return rows;
}

export async function getDashboardMetrics(userId?: number, role?: UserRole) {
  const totalTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks");
  const completedTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE status = 'Completed'");
  const inProgressTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE status = 'In Progress'");
  const pendingTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE status IN ('To Do', 'Backlog')");
  const inReviewTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE status = 'In Review'");
  const blockedTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE status = 'Blocked'");
  const overdueTasksRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM tasks WHERE due_date < CURRENT_DATE AND status != 'Completed'");
  const projectsCountRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM projects");
  const usersCountRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM users WHERE is_active = true");
  const teamsCountRes = await pool.query<{ count: string }>("SELECT COUNT(*) FROM teams");

  let personalMetrics = null;
  if (userId) {
    const myTasksRes = await pool.query(`
      SELECT 
        COUNT(*)::integer AS "myTotalTasks",
        COUNT(CASE WHEN status = 'In Progress' THEN 1 END)::integer AS "myInProgress",
        COUNT(CASE WHEN status = 'In Review' THEN 1 END)::integer AS "myInReview",
        COUNT(CASE WHEN status = 'Blocked' THEN 1 END)::integer AS "myBlocked",
        COUNT(CASE WHEN status = 'Completed' THEN 1 END)::integer AS "myCompleted",
        COUNT(CASE WHEN due_date = CURRENT_DATE AND status != 'Completed' THEN 1 END)::integer AS "myDueToday",
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'Completed' THEN 1 END)::integer AS "myOverdue"
      FROM tasks
      WHERE assigned_to_user_id = $1 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = tasks.id AND tc.user_id = $1)
    `, [userId]);
    personalMetrics = myTasksRes.rows[0];
  }

  const recentActivityRes = await pool.query(`
    SELECT 
      tah.id,
      tah.task_id AS "taskId",
      t.task_code AS "taskCode",
      t.title AS "taskTitle",
      u.name AS "actorName",
      tah.action,
      tah.field_changed AS "fieldChanged",
      tah.old_value AS "oldValue",
      tah.new_value AS "newValue",
      tah.created_at AS "createdAt"
    FROM task_activity_history tah
    JOIN tasks t ON tah.task_id = t.id
    JOIN users u ON tah.actor_user_id = u.id
    ORDER BY tah.id DESC
    LIMIT 10
  `);

  return {
    totalTasks: Number(totalTasksRes.rows[0].count),
    completedTasks: Number(completedTasksRes.rows[0].count),
    inProgressTasks: Number(inProgressTasksRes.rows[0].count),
    pendingTasks: Number(pendingTasksRes.rows[0].count),
    inReviewTasks: Number(inReviewTasksRes.rows[0].count),
    blockedTasks: Number(blockedTasksRes.rows[0].count),
    overdueTasks: Number(overdueTasksRes.rows[0].count),
    totalProjects: Number(projectsCountRes.rows[0].count),
    totalUsers: Number(usersCountRes.rows[0].count),
    totalTeams: Number(teamsCountRes.rows[0].count),
    personal: personalMetrics,
    recentActivity: recentActivityRes.rows,
  };
}

// ----------------- Legacy Project Allotments & Employees Functions ----------------- //

export async function listProjectAllotments() {
  const { rows } = await pool.query<ProjectAllotment>(`
    SELECT
      id,
      serial_number AS "serialNumber",
      employee_name AS "employeeName",
      project,
      task_assigned AS "taskAssigned",
      assistance_by AS "assistanceBy",
      progress,
      repository_url AS "repositoryUrl"
    FROM project_allotments
    ORDER BY serial_number, id
  `);
  return rows;
}

export async function createProjectAllotments(input: {
  employeeNames: string[];
  project: string;
  taskAssigned: string;
  assistanceBy: string[];
  progress: TaskProgress;
  repositoryUrl: string | null;
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
           (serial_number, employee_name, project, task_assigned, assigned_by, assistance_by, progress, repository_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (serial_number, employee_name, project, task_assigned) DO NOTHING
         RETURNING
           id,
           serial_number AS "serialNumber",
           employee_name AS "employeeName",
           project,
           task_assigned AS "taskAssigned",
           assistance_by AS "assistanceBy",
           progress,
           repository_url AS "repositoryUrl"`,
        [
          serialNumber,
          employeeName,
          input.project,
          input.taskAssigned,
          input.assistanceBy.join(", "),
          input.assistanceBy,
          input.progress,
          input.repositoryUrl,
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
       assistance_by AS "assistanceBy",
       progress,
       repository_url AS "repositoryUrl"`,
    [id, progress],
  );
  return rows[0] ?? null;
}

export async function updateProjectAllotmentRepository(id: number, repositoryUrl: string | null) {
  const { rows } = await pool.query<ProjectAllotment>(
    `UPDATE project_allotments
     SET repository_url = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       serial_number AS "serialNumber",
       employee_name AS "employeeName",
       project,
       task_assigned AS "taskAssigned",
       assistance_by AS "assistanceBy",
       progress,
       repository_url AS "repositoryUrl"`,
    [id, repositoryUrl],
  );
  return rows[0] ?? null;
}

export async function updateProjectAllotmentAssistance(id: number, assistanceBy: string[]) {
  const { rows } = await pool.query<ProjectAllotment>(
    `UPDATE project_allotments
     SET assistance_by = $2,
         assigned_by = array_to_string($2::TEXT[], ', '),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id,
       serial_number AS "serialNumber",
       employee_name AS "employeeName",
       project,
       task_assigned AS "taskAssigned",
       assistance_by AS "assistanceBy",
       progress,
       repository_url AS "repositoryUrl"`,
    [id, assistanceBy],
  );
  return rows[0] ?? null;
}

export async function listDailyProgressReports(reportDate: string) {
  const { rows } = await pool.query<DailyProgressReport>(
    `SELECT
       d.id,
       d.employee_name AS "employeeName",
       d.user_id AS "userId",
       to_char(d.report_date, 'YYYY-MM-DD') AS "reportDate",
       d.completed_today AS "completedToday",
       d.plans_next AS "plansNext",
       d.blockers,
       d.project_id AS "projectId",
       p.name AS "projectName",
       d.task_id AS "taskId",
       t.title AS "taskTitle"
     FROM daily_progress_reports d
     LEFT JOIN projects p ON d.project_id = p.id
     LEFT JOIN tasks t ON d.task_id = t.id
     WHERE d.report_date = $1::date
     ORDER BY d.employee_name`,
    [reportDate],
  );
  return rows;
}

export async function saveDailyProgressReport(input: DailyProgressReportInput) {
  const { rows } = await pool.query<DailyProgressReport>(
    `INSERT INTO daily_progress_reports
       (employee_name, report_date, completed_today, plans_next, blockers, user_id, project_id, task_id)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (employee_name, report_date)
     DO UPDATE SET
       completed_today = EXCLUDED.completed_today,
       plans_next = EXCLUDED.plans_next,
       blockers = EXCLUDED.blockers,
       user_id = COALESCE(EXCLUDED.user_id, daily_progress_reports.user_id),
       project_id = COALESCE(EXCLUDED.project_id, daily_progress_reports.project_id),
       task_id = COALESCE(EXCLUDED.task_id, daily_progress_reports.task_id),
       updated_at = NOW()
     RETURNING
       id,
       employee_name AS "employeeName",
       user_id AS "userId",
       to_char(report_date, 'YYYY-MM-DD') AS "reportDate",
       completed_today AS "completedToday",
       plans_next AS "plansNext",
       blockers,
       project_id AS "projectId",
       task_id AS "taskId"`,
    [
      input.employeeName,
      input.reportDate,
      input.completedToday,
      input.plansNext,
      input.blockers,
      input.userId || null,
      input.projectId || null,
      input.taskId || null,
    ],
  );
  return rows[0];
}

const employeeColumns = `
  id,
  name,
  department,
  designation,
  current_work AS "currentWork",
  status
`;

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
