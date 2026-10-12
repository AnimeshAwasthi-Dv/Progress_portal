import "dotenv/config";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";

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
  username: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  avatarUrl?: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
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

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string, salt = randomBytes(16)) {
  return `scrypt$${salt.toString("hex")}$${((await scryptAsync(password, salt, 64)) as Buffer).toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, saltHex, hashHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

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
        username TEXT,
        email TEXT NOT NULL UNIQUE CHECK (length(trim(email)) > 0),
        password_hash TEXT NOT NULL,
        password_reset_required BOOLEAN NOT NULL DEFAULT true,
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

    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users ALTER COLUMN password_hash DROP DEFAULT;
    `);
    await client.query(`
      UPDATE users
      SET username = COALESCE(NULLIF(lower(regexp_replace(trim(name), '[^a-zA-Z0-9._-]+', '.', 'g')), ''), 'user') || id::text
      WHERE username IS NULL OR trim(username) = ''
    `);
    await client.query("ALTER TABLE users ALTER COLUMN username SET NOT NULL");
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username))");

    await client.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry ON auth_sessions(user_id, expires_at)");

    const legacyPasswords = await client.query<{ id: number }>(
      "SELECT id FROM users WHERE password_hash = 'password123'",
    );
    for (const legacyUser of legacyPasswords.rows) {
      await client.query(
        "UPDATE users SET password_hash = $2, password_reset_required = true WHERE id = $1",
        [legacyUser.id, await hashPassword("password123")],
      );
    }


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

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_audit_history (
        id SERIAL PRIMARY KEY,
        actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        action TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS project_activity_history (
        id SERIAL PRIMARY KEY,
        actor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        action TEXT NOT NULL,
        details TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE daily_progress_reports
        ADD COLUMN IF NOT EXISTS user_id INTEGER,
        ADD COLUMN IF NOT EXISTS project_id INTEGER,
        ADD COLUMN IF NOT EXISTS task_id INTEGER
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
      CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id, project_id);
      CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id, team_id);
      CREATE INDEX IF NOT EXISTS idx_user_audit_target ON user_audit_history(target_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_daily_reports_user_date ON daily_progress_reports(user_id, report_date);
      CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id ON daily_progress_reports(project_id);
      CREATE INDEX IF NOT EXISTS idx_project_activity_project_id ON project_activity_history(project_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_users_login_email ON users(lower(email)) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_collaborators_user_task ON task_collaborators(user_id, task_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_recent ON notifications(user_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_daily_reports_date_name ON daily_progress_reports(report_date, employee_name);
      CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
      CREATE INDEX IF NOT EXISTS idx_comments_task_recent ON task_comments(task_id, id DESC);
      CREATE INDEX IF NOT EXISTS idx_reviews_task_recent ON task_reviews(task_id, id DESC);
    `);

    await client.query(`
      DELETE FROM project_members pm
      USING projects p
      WHERE p.id = pm.project_id
        AND pm.role_in_project = 'Contributor'
        AND pm.user_id <> p.manager_id
        AND pm.user_id <> p.lead_id
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.project_id = p.id
            AND t.assigned_to_user_id = pm.user_id
        )
    `);

    // Bootstrap only the administrator and a starter team on a fresh database.
    const usersCount = await client.query<{ count: string }>("SELECT COUNT(*) FROM users");
    if (Number(usersCount.rows[0].count) === 0) {
      const initialAdminPassword = process.env.INITIAL_ADMIN_PASSWORD;
      if (!initialAdminPassword || initialAdminPassword.length < 12) {
        throw new Error("Set INITIAL_ADMIN_PASSWORD (at least 12 characters) before initializing an empty database.");
      }

      const teamRes = await client.query<{ id: number; name: string }>(
        `INSERT INTO teams (name, description)
         VALUES ('Technical', 'Technical department team'), ('Sales', 'Sales department team')
         ON CONFLICT (name) DO UPDATE SET description = COALESCE(teams.description, EXCLUDED.description)
         RETURNING id, name`,
      );
      const technicalTeam = teamRes.rows.find((team) => team.name === "Technical");
      const admin = await client.query<{ id: number }>(
        `INSERT INTO users (name, username, email, password_hash, password_reset_required, role, department, designation, team_id)
         VALUES ('Admin', 'admin', 'admin@taskmanager.internal', $1, true, 'Admin', 'Executive', 'System Administrator', $2)
         RETURNING id`,
        [await hashPassword(initialAdminPassword), technicalTeam!.id],
      );
      await client.query("UPDATE teams SET manager_id = $1 WHERE id = $2", [admin.rows[0].id, technicalTeam!.id]);
      await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)", [technicalTeam!.id, admin.rows[0].id]);
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

export async function listUsers(viewer?: AccessUser) {
  const values: unknown[] = [];
  let whereClause = "";
  if (viewer && viewer.role !== "Admin") {
    if (viewer.role === "Individual") {
      whereClause = "WHERE u.id = $1";
      values.push(viewer.id);
    } else {
      // Manager / Team Lead: see themselves + all active users who share any team
      // with the viewer (teams the viewer leads, manages, or is a member of)
      whereClause = `WHERE u.id = $1 OR (u.is_active = true AND EXISTS (
        SELECT 1 FROM team_members target_tm
        WHERE target_tm.user_id = u.id
          AND target_tm.team_id IN (
            SELECT t.id FROM teams t
            LEFT JOIN team_members my_tm ON my_tm.team_id = t.id AND my_tm.user_id = $1
            WHERE t.manager_id = $1 OR t.lead_id = $1 OR my_tm.user_id IS NOT NULL
          )
      ))`;
      values.push(viewer.id);
    }
  }
  const { rows } = await pool.query<User>(`
    SELECT 
      u.id,
      u.name,
      u.username,
      u.email,
      u.role,
      u.department,
      u.designation,
      u.avatar_url AS "avatarUrl",
      u.is_active AS "isActive",
      u.password_reset_required AS "mustChangePassword",
      u.team_id AS "teamId",
      t.name AS "teamName",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    ${whereClause}
    ORDER BY u.id
  `, values);
  return rows;
}

export async function getUserById(id: number) {
  const { rows } = await pool.query<User>(`
    SELECT 
      u.id,
      u.name,
      u.username,
      u.email,
      u.role,
      u.department,
      u.designation,
      u.avatar_url AS "avatarUrl",
      u.is_active AS "isActive",
      u.password_reset_required AS "mustChangePassword",
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

export async function authenticateUser(identifier: string, password: string) {
  const { rows } = await pool.query<{ id: number; passwordHash: string }>(`
    SELECT id, password_hash AS "passwordHash"
    FROM users
    WHERE is_active = true AND (lower(username) = lower($1) OR lower(email) = lower($1))
  `, [identifier]);
  const account = rows[0];
  if (!account) return null;

  let valid = await verifyPassword(password, account.passwordHash);
  if (!valid && account.passwordHash === "password123" && password === "password123") {
    const migratedHash = await hashPassword(password);
    await pool.query(
      "UPDATE users SET password_hash = $2, password_reset_required = true WHERE id = $1",
      [account.id, migratedHash],
    );
    valid = true;
  }
  return valid ? getUserById(account.id) : null;
}

export async function createAuthSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashSessionToken(token), userId, expiresAt],
  );
  return token;
}

export async function getUserForSession(token: string) {
  const { rows } = await pool.query<User>(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.email,
      u.role,
      u.department,
      u.designation,
      u.avatar_url AS "avatarUrl",
      u.is_active AS "isActive",
      u.password_reset_required AS "mustChangePassword",
      u.team_id AS "teamId",
      t.name AS "teamName",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    JOIN auth_sessions s ON s.user_id = u.id
    WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true
  `, [hashSessionToken(token)]);
  return rows[0] ?? null;
}

export async function revokeAuthSession(token: string) {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}

export async function changeUserPassword(userId: number, currentPassword: string, newPassword: string, sessionToken: string) {
  const { rows } = await pool.query<{ passwordHash: string }>(
    "SELECT password_hash AS \"passwordHash\" FROM users WHERE id = $1 AND is_active = true",
    [userId],
  );
  const account = rows[0];
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) return null;

  await pool.query(
    "UPDATE users SET password_hash = $2, password_reset_required = false, updated_at = NOW() WHERE id = $1",
    [userId, await hashPassword(newPassword)],
  );
  await pool.query("DELETE FROM auth_sessions WHERE user_id = $1 AND token_hash <> $2", [userId, hashSessionToken(sessionToken)]);
  return getUserById(userId);
}

export async function updateUserRoleAndStatus(
  id: number,
  input: { role?: UserRole; teamId?: number | null; designation?: string; department?: string; name?: string },
  actorUserId?: number,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const currentResult = await client.query<{ role: UserRole; isActive: boolean; teamId: number | null }>(
      `SELECT role, is_active AS "isActive", team_id AS "teamId" FROM users WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return null;
    }
    if (current.role === "Admin" && current.isActive && input.role !== undefined && input.role !== "Admin") {
      const adminCount = await client.query<{ count: string }>(
        "SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = true",
      );
      if (Number(adminCount.rows[0].count) <= 1) {
        await client.query("ROLLBACK");
        return null;
      }
    }

    const fields: string[] = [];
    const values: unknown[] = [id];
    let idx = 2;
    for (const [property, column] of [
      ["name", "name"],
      ["role", "role"],
      ["teamId", "team_id"],
      ["designation", "designation"],
      ["department", "department"],
    ] as const) {
      const value = input[property];
      if (value !== undefined) {
        fields.push(`${column} = $${idx++}`);
        values.push(value);
      }
    }
    if (fields.length > 0) {
      fields.push("updated_at = NOW()");
      await client.query(`UPDATE users SET ${fields.join(", ")} WHERE id = $1`, values);
    }

    if (input.teamId !== undefined && input.teamId !== current.teamId) {
      await client.query("DELETE FROM team_members WHERE user_id = $1", [id]);
      if (input.teamId !== null) {
        await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [input.teamId, id]);
      }
    }
    if (input.role !== undefined) {
      if (!["Admin", "Manager"].includes(input.role)) {
        await client.query("UPDATE teams SET manager_id = NULL WHERE manager_id = $1", [id]);
      }
      if (input.role !== "Team Lead") {
        await client.query("UPDATE teams SET lead_id = NULL WHERE lead_id = $1", [id]);
      }
    }
    if (actorUserId !== undefined && fields.length > 0) {
      await client.query(`
        INSERT INTO user_audit_history (actor_user_id, target_user_id, action, reason)
        VALUES ($1, $2, 'USER_PROFILE_UPDATED', 'Role, profile, or team assignment updated')
      `, [actorUserId, id]);
    }
    await client.query("COMMIT");
    return getUserById(id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type DeactivateUserResult =
  | { ok: true; user: User | null; reassignedTaskCount: number }
  | { ok: false; code: "not_found" | "forbidden" | "last_admin" | "needs_reassignment" | "invalid_replacement"; activeTaskCount?: number };

export async function deactivateUser(
  actor: AccessUser,
  targetUserId: number,
  reassignToUserId?: number,
  reason = "",
): Promise<DeactivateUserResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const targetResult = await client.query<{ id: number; role: UserRole; teamId: number | null; isActive: boolean }>(`
      SELECT id, role, team_id AS "teamId", is_active AS "isActive"
      FROM users WHERE id = $1 FOR UPDATE
    `, [targetUserId]);
    const target = targetResult.rows[0];
    if (!target || !target.isActive) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }

    if (actor.role !== "Admin") {
      const managedTeam = await client.query<{ allowed: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM teams managed_team
          WHERE (managed_team.manager_id = $1 OR managed_team.lead_id = $1)
            AND EXISTS (
              SELECT 1 FROM team_members target_membership
              WHERE target_membership.team_id = managed_team.id AND target_membership.user_id = $2
            )
        ) AS allowed
      `, [actor.id, targetUserId]);
      if (
        !["Manager", "Team Lead"].includes(actor.role) ||
        target.role !== "Individual" ||
        actor.id === targetUserId ||
        !managedTeam.rows[0]?.allowed
      ) {
        await client.query("ROLLBACK");
        return { ok: false, code: "forbidden" };
      }
    }

    if (target.role === "Admin") {
      const adminCount = await client.query<{ count: string }>(
        "SELECT COUNT(*) FROM users WHERE role = 'Admin' AND is_active = true",
      );
      if (Number(adminCount.rows[0].count) <= 1) {
        await client.query("ROLLBACK");
        return { ok: false, code: "last_admin" };
      }
    }

    const activeTasks = await client.query<{ id: number; projectId: number; taskCode: string }>(`
      SELECT id, project_id AS "projectId", task_code AS "taskCode"
      FROM tasks WHERE assigned_to_user_id = $1 AND status <> 'Completed'
      FOR UPDATE
    `, [targetUserId]);
    if (activeTasks.rows.length > 0 && !reassignToUserId) {
      await client.query("ROLLBACK");
      return { ok: false, code: "needs_reassignment", activeTaskCount: activeTasks.rows.length };
    }

    if (reassignToUserId) {
      const replacement = await client.query<{ id: number }>(
        "SELECT id FROM users WHERE id = $1 AND is_active = true AND id <> $2",
        [reassignToUserId, targetUserId],
      );
      if (!replacement.rows[0]) {
        await client.query("ROLLBACK");
        return { ok: false, code: "invalid_replacement" };
      }
      if (actor.role !== "Admin") {
        const replacementInTeam = await client.query<{ allowed: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM team_members actor_membership
            JOIN team_members replacement_membership ON replacement_membership.team_id = actor_membership.team_id
            JOIN teams authorized_team ON authorized_team.id = actor_membership.team_id
            WHERE actor_membership.user_id = $1
              AND replacement_membership.user_id = $2
              AND (authorized_team.manager_id = $1 OR authorized_team.lead_id = $1)
          ) AS allowed
        `, [actor.id, reassignToUserId]);
        if (!replacementInTeam.rows[0]?.allowed) {
          await client.query("ROLLBACK");
          return { ok: false, code: "invalid_replacement" };
        }
      }
      for (const task of activeTasks.rows) {
        await client.query(
          "UPDATE tasks SET assigned_to_user_id = $2, updated_at = NOW() WHERE id = $1",
          [task.id, reassignToUserId],
        );
        await client.query(`
          INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value, reason)
          VALUES ($1, $2, 'REASSIGNED', 'assigned_to', $3, $4, $5)
        `, [task.id, actor.id, String(targetUserId), String(reassignToUserId), reason || "Employee deactivated"]);
        await client.query(`
          INSERT INTO notifications (user_id, title, message, type, task_id, project_id)
          VALUES ($1, 'Task Reassigned to You', $2, 'reassignment', $3, $4)
        `, [reassignToUserId, `Task ${task.taskCode} was reassigned after an employee was deactivated.`, task.id, task.projectId]);
        await client.query(
          "INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ($1, $2, 'Member') ON CONFLICT DO NOTHING",
          [task.projectId, reassignToUserId],
        );
      }
    }

    const reviewerTasks = await client.query<{ id: number }>(`
      UPDATE tasks SET reviewer_user_id = NULL, updated_at = NOW()
      WHERE reviewer_user_id = $1 AND status <> 'Completed' RETURNING id
    `, [targetUserId]);
    for (const task of reviewerTasks.rows) {
      await client.query(`
        INSERT INTO task_activity_history (task_id, actor_user_id, action, field_changed, old_value, new_value, reason)
        VALUES ($1, $2, 'REVIEWER_CHANGED', 'reviewer', $3, 'Unassigned', $4)
      `, [task.id, actor.id, String(targetUserId), reason || "Reviewer deactivated"]);
    }

    await client.query("DELETE FROM project_members WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM team_members WHERE user_id = $1", [targetUserId]);
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [targetUserId]);
    await client.query("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1", [targetUserId]);
    await client.query(`
      INSERT INTO user_audit_history (actor_user_id, target_user_id, action, reason)
      VALUES ($1, $2, 'EMPLOYEE_DEACTIVATED', $3)
    `, [actor.id, targetUserId, reason]);
    await client.query("COMMIT");
    return { ok: true, user: await getUserById(targetUserId), reassignedTaskCount: activeTasks.rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createUser(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
  designation: string;
  teamId?: number | null;
  createdByUserId?: number;
  projectIds?: number[];
  mustChangePassword?: boolean;
}) {
  const client = await pool.connect();
  const passwordResetRequired = input.mustChangePassword !== false;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(`
      INSERT INTO users (name, username, email, password_hash, password_reset_required, role, department, designation, team_id)
      VALUES ($1, $2, $3, $4, $9, $5, $6, $7, $8)
      RETURNING id
    `, [input.name, input.username, input.email, await hashPassword(input.password), input.role, input.department, input.designation, input.teamId || null, passwordResetRequired]);
    const userId = rows[0].id;
    if (input.teamId) {
      await client.query("INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [input.teamId, userId]);
    }
    for (const projectId of new Set(input.projectIds || [])) {
      await client.query("INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ($1, $2, 'Member') ON CONFLICT DO NOTHING", [projectId, userId]);
    }
    await client.query(`
      INSERT INTO employees (name, department, designation, current_work, status)
      VALUES ($1, $2, $3, 'Active project tasks', 'In Progress')
      ON CONFLICT DO NOTHING
    `, [input.name, input.department, input.designation]);
    if (input.createdByUserId !== undefined) {
      await client.query(`
        INSERT INTO user_audit_history (actor_user_id, target_user_id, action, reason)
        VALUES ($1, $2, 'EMPLOYEE_CREATED', 'Employee profile created')
      `, [input.createdByUserId, userId]);
    }
    await client.query("COMMIT");
    return getUserById(userId);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTeams(viewer?: AccessUser) {
  const values: unknown[] = [];
  let whereClause = "";
  if (viewer && viewer.role !== "Admin") {
    // Team Leads / Managers see teams they lead, manage, or are a member of
    whereClause = `WHERE t.manager_id = $1 OR t.lead_id = $1 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1
    )`;
    values.push(viewer.id);
  }
  const { rows } = await pool.query<Team>(`
    SELECT 
      t.id,
      t.name,
      t.description,
      t.manager_id AS "managerId",
      um.name AS "managerName",
      t.lead_id AS "leadId",
      ul.name AS "leadName",
      COUNT(DISTINCT tm.user_id) FILTER (WHERE member_user.is_active = true)::integer AS "memberCount",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM teams t
    LEFT JOIN users um ON t.manager_id = um.id
    LEFT JOIN users ul ON t.lead_id = ul.id
    LEFT JOIN team_members tm ON t.id = tm.team_id
    LEFT JOIN users member_user ON member_user.id = tm.user_id
    ${whereClause}
    GROUP BY t.id, um.name, ul.name
    ORDER BY t.id
  `, values);
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

type AccessUser = Pick<User, "id" | "role" | "teamId">;

function projectVisibilityClause(user: AccessUser, projectAlias: string, firstParameter: number) {
  const userParameter = `$${firstParameter}`;
  if (user.role === "Admin") return { sql: "TRUE", values: [] as unknown[] };
  if (user.role === "Individual") {
    return {
      sql: `(
        EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${projectAlias}.id AND pm.user_id = ${userParameter})
        OR EXISTS (
          SELECT 1 FROM tasks assigned_task
          WHERE assigned_task.project_id = ${projectAlias}.id
            AND (assigned_task.assigned_to_user_id = ${userParameter}
              OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = assigned_task.id AND tc.user_id = ${userParameter}))
        )
      )`,
      values: [user.id],
    };
  }

  return {
    sql: `(
      ${projectAlias}.manager_id = ${userParameter}
      OR ${projectAlias}.lead_id = ${userParameter}
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${projectAlias}.id AND pm.user_id = ${userParameter})
    )`,
    values: [user.id],
  };
}

function taskVisibilityClause(user: AccessUser, taskAlias: string, projectAlias: string, firstParameter: number) {
  if (user.role === "Admin") return { sql: "TRUE", values: [] as unknown[] };
  if (user.role === "Individual") {
    const userParameter = `$${firstParameter}`;
    return {
      sql: `(${taskAlias}.assigned_to_user_id = ${userParameter} OR EXISTS (
        SELECT 1 FROM task_collaborators tc WHERE tc.task_id = ${taskAlias}.id AND tc.user_id = ${userParameter}
      ))`,
      values: [user.id],
    };
  }
  return projectVisibilityClause(user, projectAlias, firstParameter);
}

export async function listProjects(viewer?: AccessUser) {
  const values: unknown[] = [];
  let whereClause = "";
  if (viewer && viewer.role !== "Admin") {
    const visibility = projectVisibilityClause(viewer, "p", 1);
    whereClause = `WHERE ${visibility.sql}`;
    values.push(...visibility.values);
  }
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
    ${whereClause}
    GROUP BY p.id, um.name, ul.name
    ORDER BY p.id
  `, values);
  return rows;
}

export async function canAccessProject(viewer: AccessUser, projectId: number) {
  const visibility = projectVisibilityClause(viewer, "p", 2);
  const { rows } = await pool.query<{ allowed: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = $1 AND ${visibility.sql}) AS allowed
  `, [projectId, ...visibility.values]);
  return rows[0]?.allowed === true;
}

export async function canAssignUserToProject(viewer: AccessUser, targetUserId: number, projectId: number) {
  if (viewer.role === "Admin") {
    const { rows } = await pool.query<{ allowed: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND is_active = true) AS allowed",
      [targetUserId],
    );
    return rows[0]?.allowed === true;
  }
  const { rows } = await pool.query<{ allowed: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM users target
      WHERE target.id = $1 AND target.is_active = true
        AND (
          target.team_id = $2
          OR EXISTS (
            SELECT 1 FROM team_members actor_membership
            JOIN team_members target_membership ON target_membership.team_id = actor_membership.team_id
            WHERE actor_membership.user_id = $3 AND target_membership.user_id = target.id
          )
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $4 AND pm.user_id = target.id)
        )
    ) AS allowed
  `, [targetUserId, viewer.teamId ?? null, viewer.id, projectId]);
  return rows[0]?.allowed === true;
}

export async function createProject(input: {
  name: string;
  code: string;
  description?: string;
  managerId?: number | null;
  leadId?: number | null;
  startDate?: string | null;
  targetDate?: string | null;
  createdByUserId?: number;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Project>(`
    INSERT INTO projects (name, code, description, manager_id, lead_id, start_date, target_date)
    VALUES ($1, $2, $3, $4, $5, $6::date, $7::date)
    RETURNING id, name, code, description, manager_id AS "managerId", lead_id AS "leadId", status,
      to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(target_date, 'YYYY-MM-DD') AS "targetDate",
      created_at AS "createdAt", updated_at AS "updatedAt"
    `, [input.name, input.code.toUpperCase(), input.description || null, input.managerId || null, input.leadId || null, input.startDate || null, input.targetDate || null]);
    for (const userId of new Set([input.managerId, input.leadId].filter((id): id is number => Boolean(id)))) {
      await client.query("INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ($1, $2, 'Manager') ON CONFLICT DO NOTHING", [rows[0].id, userId]);
    }
    if (input.createdByUserId !== undefined) {
      await client.query(`
        INSERT INTO project_activity_history (actor_user_id, project_id, action, details)
        VALUES ($1, $2, 'PROJECT_CREATED', $3)
      `, [input.createdByUserId, rows[0].id, input.name]);
    }
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listTasks(filters?: {
  projectId?: number;
  assignedToUserId?: number;
  assignedByUserId?: number;
  reviewerUserId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  viewer?: AccessUser;
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
  if (filters?.viewer && filters.viewer.role !== "Admin") {
    if (filters.viewer.role === "Individual") {
      conditions.push(`(t.assigned_to_user_id = $${idx} OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = $${idx}))`);
      values.push(filters.viewer.id);
      idx++;
    } else {
      const visibility = projectVisibilityClause(filters.viewer, "p", idx);
      conditions.push(visibility.sql);
      values.push(...visibility.values);
      idx += visibility.values.length;
    }
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
      collaborators.ids AS "collaboratorIds",
      collaborators.names AS "collaboratorNames"
    FROM tasks t
    JOIN projects p ON t.project_id = p.id
    LEFT JOIN tasks pt ON t.parent_task_id = pt.id
    JOIN users u_by ON t.assigned_by_user_id = u_by.id
    JOIN users u_to ON t.assigned_to_user_id = u_to.id
    LEFT JOIN users u_rev ON t.reviewer_user_id = u_rev.id
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(ARRAY_AGG(DISTINCT tc_u.id) FILTER (WHERE tc_u.id IS NOT NULL), '{}') AS ids,
        COALESCE(ARRAY_AGG(DISTINCT tc_u.name) FILTER (WHERE tc_u.name IS NOT NULL), '{}') AS names
      FROM task_collaborators tc
      JOIN users tc_u ON tc.user_id = tc_u.id
      WHERE tc.task_id = t.id
    ) collaborators ON true
    ${whereClause}
    ORDER BY t.id DESC
  `, values);

  return rows;
}

export async function getTaskById(id: number, viewer?: AccessUser) {
  const conditions = ["t.id = $1"];
  const values: unknown[] = [id];
  if (viewer && viewer.role !== "Admin") {
    if (viewer.role === "Individual") {
      conditions.push(`(t.assigned_to_user_id = $2 OR EXISTS (SELECT 1 FROM task_collaborators tc WHERE tc.task_id = t.id AND tc.user_id = $2))`);
      values.push(viewer.id);
    } else {
      const visibility = projectVisibilityClause(viewer, "p", 2);
      conditions.push(visibility.sql);
      values.push(...visibility.values);
    }
  }
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
    WHERE ${conditions.join(" AND ")}
    GROUP BY t.id, p.name, pt.title, u_by.name, u_to.name, u_rev.name
  `, values);

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

export async function deleteTaskForUser(id: number, viewer: AccessUser) {
  if (!Number.isSafeInteger(id) || id < 1) return false;

  if (viewer.role === "Admin") {
    const result = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
    return (result.rowCount ?? 0) > 0;
  }

  if (viewer.role === "Individual") {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND assigned_to_user_id = $2",
      [id, viewer.id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  if (viewer.role === "Team Lead") {
    const scope = projectVisibilityClause(viewer, "p", 2);
    const result = await pool.query(`
      DELETE FROM tasks t
      USING projects p
      WHERE t.id = $1 AND p.id = t.project_id AND ${scope.sql}
    `, [id, ...scope.values]);
    return (result.rowCount ?? 0) > 0;
  }

  return false;
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
    for (const userId of new Set([input.assignedToUserId, input.reviewerUserId, ...(input.collaboratorIds || [])].filter((id): id is number => Boolean(id)))) {
      await client.query("INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ($1, $2, 'Member') ON CONFLICT DO NOTHING", [input.projectId, userId]);
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

export async function getTaskIdForSubtask(subtaskId: number) {
  const { rows } = await pool.query<{ taskId: number }>(
    "SELECT task_id AS \"taskId\" FROM subtasks WHERE id = $1",
    [subtaskId],
  );
  return rows[0]?.taskId ?? null;
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

export async function getTeamWorkloadAnalytics(viewer: AccessUser) {
  const userVisibility = viewer.role === "Admin"
    ? "TRUE"
    : viewer.role === "Individual"
    ? "u.id = $1"
    : `(u.id = $1 OR EXISTS (
        SELECT 1 FROM team_members target_membership
        JOIN teams authorized_team ON authorized_team.id = target_membership.team_id
        WHERE target_membership.user_id = u.id
          AND (authorized_team.manager_id = $1 OR authorized_team.lead_id = $1)
      ))`;
  const taskVisibility = taskVisibilityClause(viewer, "visible_task", "visible_project", 2);
  const values = viewer.role === "Admin" ? taskVisibility.values : [viewer.id, ...taskVisibility.values];
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
      COUNT(visible_task.id)::integer AS "totalTasks",
      COUNT(CASE WHEN visible_task.status = 'In Progress' THEN 1 END)::integer AS "inProgressTasks",
      COUNT(CASE WHEN visible_task.status = 'To Do' THEN 1 END)::integer AS "toDoTasks",
      COUNT(CASE WHEN visible_task.status = 'In Review' THEN 1 END)::integer AS "inReviewTasks",
      COUNT(CASE WHEN visible_task.status = 'Blocked' THEN 1 END)::integer AS "blockedTasks",
      COUNT(CASE WHEN visible_task.status = 'Completed' THEN 1 END)::integer AS "completedTasks",
      COUNT(CASE WHEN visible_task.due_date < CURRENT_DATE AND visible_task.status NOT IN ('Completed') THEN 1 END)::integer AS "overdueTasks",
      COALESCE(SUM(CASE WHEN visible_task.status NOT IN ('Completed') THEN visible_task.estimated_hours END), 0)::float AS "totalEstimatedHours",
      COALESCE(SUM(visible_task.actual_hours), 0)::float AS "totalActualHours"
    FROM users u
    LEFT JOIN teams t ON u.team_id = t.id
    LEFT JOIN (
      SELECT visible_task.*
      FROM tasks visible_task
      JOIN projects visible_project ON visible_project.id = visible_task.project_id
      WHERE ${taskVisibility.sql}
    ) visible_task ON u.id = visible_task.assigned_to_user_id
    WHERE u.is_active = true AND (${userVisibility})
    GROUP BY u.id, u.name, u.email, u.role, u.designation, u.department, t.id, t.name
    ORDER BY "totalTasks" DESC, u.name ASC
  `, values);
  return rows;
}

export async function getDashboardMetrics(viewer: AccessUser) {
  const taskScope = taskVisibilityClause(viewer, "t", "p", 1);
  const taskMetricsRes = await pool.query(`
    SELECT
      COUNT(*)::integer AS "totalTasks",
      COUNT(*) FILTER (WHERE t.status = 'Completed')::integer AS "completedTasks",
      COUNT(*) FILTER (WHERE t.status = 'In Progress')::integer AS "inProgressTasks",
      COUNT(*) FILTER (WHERE t.status IN ('To Do', 'Backlog'))::integer AS "pendingTasks",
      COUNT(*) FILTER (WHERE t.status = 'In Review')::integer AS "inReviewTasks",
      COUNT(*) FILTER (WHERE t.status = 'Blocked')::integer AS "blockedTasks",
      COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'Completed')::integer AS "overdueTasks"
    FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE ${taskScope.sql}
  `, taskScope.values);
  const projectScope = projectVisibilityClause(viewer, "p", 1);
  const projectsCountRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM projects p WHERE p.status = 'Active' AND ${projectScope.sql}`,
    projectScope.values,
  );
  const userScope = viewer.role === "Admin"
    ? { sql: "TRUE", values: [] as unknown[] }
    : viewer.role === "Individual"
    ? { sql: "u.id = $1", values: [viewer.id] }
    : {
        sql: `(u.id = $1 OR EXISTS (
          SELECT 1 FROM team_members target_membership
          JOIN teams authorized_team ON authorized_team.id = target_membership.team_id
          WHERE target_membership.user_id = u.id
            AND (authorized_team.manager_id = $1 OR authorized_team.lead_id = $1)
        ))`,
        values: [viewer.id],
      };
  const usersCountRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*) FROM users u WHERE u.is_active = true AND ${userScope.sql}`,
    userScope.values,
  );
  const teamsCountRes = await pool.query<{ count: string }>(`
    SELECT COUNT(*) FROM teams t
    WHERE $1::integer IS NULL OR t.manager_id = $1 OR t.lead_id = $1 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $1
    )
  `, [viewer.role === "Admin" ? null : viewer.id]);
  const teamsCount = Number(teamsCountRes.rows[0].count);

  let personalMetrics = null;
  if (viewer.id) {
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
    `, [viewer.id]);
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
    JOIN projects p ON p.id = t.project_id
    JOIN users u ON tah.actor_user_id = u.id
    WHERE ${taskScope.sql}
    ORDER BY tah.id DESC
    LIMIT 10
  `, taskScope.values);

  const taskMetrics = taskMetricsRes.rows[0];

  return {
    totalTasks: taskMetrics.totalTasks,
    completedTasks: taskMetrics.completedTasks,
    inProgressTasks: taskMetrics.inProgressTasks,
    pendingTasks: taskMetrics.pendingTasks,
    inReviewTasks: taskMetrics.inReviewTasks,
    blockedTasks: taskMetrics.blockedTasks,
    overdueTasks: taskMetrics.overdueTasks,
    totalProjects: Number(projectsCountRes.rows[0].count),
    totalUsers: Number(usersCountRes.rows[0].count),
    totalTeams: teamsCount,
    personal: personalMetrics,
    recentActivity: recentActivityRes.rows,
  };
}

export async function listOrganizationActivity(viewer: AccessUser) {
  const taskScope = taskVisibilityClause(viewer, "t", "p", 1);
  const projectScope = projectVisibilityClause(viewer, "p", 1);
  const userScope = viewer.role === "Admin"
    ? "TRUE"
    : `(uah.actor_user_id = $1 OR EXISTS (
        SELECT 1 FROM users target_user
        JOIN teams managed_team ON managed_team.manager_id = $1 OR managed_team.lead_id = $1
        WHERE target_user.id = uah.target_user_id
          AND (target_user.team_id = managed_team.id OR EXISTS (
            SELECT 1 FROM team_members tm WHERE tm.team_id = managed_team.id AND tm.user_id = target_user.id
          ))
      ))`;
  const userValues = viewer.role === "Admin" ? [] : [viewer.id];
  const [taskEvents, projectEvents, userEvents] = await Promise.all([
    pool.query(`
      SELECT tah.id, tah.task_id AS "entityId", t.title AS "entityName", tah.action,
        COALESCE(tah.reason, NULLIF(concat_ws(': ', tah.field_changed, tah.new_value), ''), tah.action) AS details,
        tah.actor_user_id AS "actorUserId", u.name AS "actorName", tah.created_at AS "createdAt"
      FROM task_activity_history tah
      JOIN tasks t ON t.id = tah.task_id
      JOIN projects p ON p.id = t.project_id
      JOIN users u ON u.id = tah.actor_user_id
      WHERE ${taskScope.sql}
    `, taskScope.values),
    pool.query(`
      SELECT pah.id, pah.project_id AS "entityId", p.name AS "entityName", pah.action,
        pah.details, pah.actor_user_id AS "actorUserId", u.name AS "actorName", pah.created_at AS "createdAt"
      FROM project_activity_history pah
      JOIN projects p ON p.id = pah.project_id
      JOIN users u ON u.id = pah.actor_user_id
      WHERE ${projectScope.sql}
    `, projectScope.values),
    pool.query(`
      SELECT uah.id, uah.target_user_id AS "entityId", target.name AS "entityName", uah.action,
        uah.reason AS details, uah.actor_user_id AS "actorUserId", actor.name AS "actorName", uah.created_at AS "createdAt"
      FROM user_audit_history uah
      JOIN users target ON target.id = uah.target_user_id
      JOIN users actor ON actor.id = uah.actor_user_id
      WHERE ${userScope}
    `, userValues),
  ]);

  return [
    ...taskEvents.rows.map((event) => ({ ...event, eventType: "Task", id: `task-${event.id}` })),
    ...projectEvents.rows.map((event) => ({ ...event, eventType: "Project", id: `project-${event.id}` })),
    ...userEvents.rows.map((event) => ({ ...event, eventType: "Employee", id: `employee-${event.id}` })),
  ]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 100);
}

export async function deleteOrganizationActivityEvent(
  viewer: AccessUser,
  eventType: "task" | "project" | "employee",
  eventId: number,
) {
  if (!Number.isSafeInteger(eventId) || eventId < 1 || (viewer.role !== "Admin" && viewer.role !== "Team Lead")) {
    return false;
  }

  if (eventType === "task") {
    const scope = taskVisibilityClause(viewer, "t", "p", 2);
    const result = await pool.query(`
      DELETE FROM task_activity_history tah
      USING tasks t, projects p
      WHERE tah.id = $1 AND t.id = tah.task_id AND p.id = t.project_id
        AND ${scope.sql}
    `, [eventId, ...scope.values]);
    return (result.rowCount ?? 0) > 0;
  }

  if (eventType === "project") {
    const scope = projectVisibilityClause(viewer, "p", 2);
    const result = await pool.query(`
      DELETE FROM project_activity_history pah
      USING projects p
      WHERE pah.id = $1 AND p.id = pah.project_id
        AND ${scope.sql}
    `, [eventId, ...scope.values]);
    return (result.rowCount ?? 0) > 0;
  }

  const result = viewer.role === "Admin"
    ? await pool.query("DELETE FROM user_audit_history WHERE id = $1", [eventId])
    : await pool.query(`
        DELETE FROM user_audit_history uah
        USING users target_user
        WHERE uah.id = $1 AND target_user.id = uah.target_user_id
          AND (uah.actor_user_id = $2 OR EXISTS (
            SELECT 1 FROM teams managed_team
            WHERE (managed_team.manager_id = $2 OR managed_team.lead_id = $2)
              AND (target_user.team_id = managed_team.id OR EXISTS (
                SELECT 1 FROM team_members tm
                WHERE tm.team_id = managed_team.id AND tm.user_id = target_user.id
              ))
          ))
      `, [eventId, viewer.id]);
  return (result.rowCount ?? 0) > 0;
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

export async function listDailyProgressReports(reportDate: string, viewer: AccessUser) {
  const values: unknown[] = [reportDate];
  let visibility = "TRUE";
  if (viewer.role === "Individual") {
    visibility = "d.user_id = $2";
    values.push(viewer.id);
  } else if (viewer.role !== "Admin") {
    const projectScope = projectVisibilityClause(viewer, "visible_project", 3);
    visibility = `(d.user_id = $2 OR EXISTS (
      SELECT 1 FROM team_members actor_membership
      JOIN team_members report_membership ON report_membership.team_id = actor_membership.team_id
      WHERE actor_membership.user_id = $2 AND report_membership.user_id = d.user_id
    ) OR EXISTS (
      SELECT 1 FROM projects visible_project
      WHERE visible_project.id = d.project_id AND ${projectScope.sql}
    ))`;
    values.push(viewer.id, ...projectScope.values);
  }
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
     WHERE d.report_date = $1::date AND ${visibility}
     ORDER BY d.employee_name`,
    values,
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
