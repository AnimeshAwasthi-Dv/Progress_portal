export type UserRole = "Admin" | "Manager" | "Team Lead" | "Individual";
export type TaskPriority = "Low" | "Medium" | "High" | "Urgent";
export type TaskStatus = "Backlog" | "To Do" | "In Progress" | "In Review" | "Completed" | "Blocked";
export type ReviewDecision = "Approved" | "Changes Requested";
export type WorkStatus = "In Progress" | "Completed" | "Pending" | "On Hold";
export type TaskProgress = "Not Started" | "In Progress" | "Blocked" | "Completed";

export const taskProgressOptions: TaskProgress[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Completed",
];

export const taskStatusOptions: TaskStatus[] = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Completed",
  "Blocked",
];

export const taskPriorityOptions: TaskPriority[] = [
  "Low",
  "Medium",
  "High",
  "Urgent",
];

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

export type WorkloadMember = {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
  designation: string;
  department: string;
  teamId: number | null;
  teamName: string | null;
  totalTasks: number;
  inProgressTasks: number;
  toDoTasks: number;
  inReviewTasks: number;
  blockedTasks: number;
  completedTasks: number;
  overdueTasks: number;
  totalEstimatedHours: number;
  totalActualHours: number;
};

export type DashboardMetrics = {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  inReviewTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  totalProjects: number;
  totalUsers: number;
  totalTeams: number;
  personal: {
    myTotalTasks: number;
    myInProgress: number;
    myInReview: number;
    myBlocked: number;
    myCompleted: number;
    myDueToday: number;
    myOverdue: number;
  } | null;
  recentActivity: Array<{
    id: number;
    taskId: number;
    taskCode: string;
    taskTitle: string;
    actorName: string;
    action: string;
    fieldChanged: string | null;
    oldValue: string | null;
    newValue: string | null;
    createdAt: string;
  }>;
};

export type EmployeeRecord = {
  id: number;
  name: string;
  department: string;
  designation: string;
  currentWork: string;
  status: WorkStatus;
};

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

export type NewProjectAllotment = {
  employeeNames: string[];
  project: string;
  taskAssigned: string;
  assistanceBy: string[];
  progress: TaskProgress;
  repositoryUrl: string;
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

export type NewDailyProgressReport = Omit<DailyProgressReport, "id">;

let activeUserId: number = Number(localStorage.getItem("active_user_id") || "1");

export function getActiveUserId(): number {
  return activeUserId;
}

export function setActiveUserId(id: number) {
  activeUserId = id;
  localStorage.setItem("active_user_id", String(id));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-user-id": String(activeUserId),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as any).error === "string"
        ? (payload as any).error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// User & Auth APIs
export function getCurrentUser() {
  return request<User>("/api/auth/me");
}

export function getUsers() {
  return request<User[]>("/api/users");
}

export function createUser(userData: {
  name: string;
  email: string;
  role: UserRole;
  department: string;
  designation: string;
  teamId?: number | null;
}) {
  return request<User>("/api/users", {
    method: "POST",
    body: JSON.stringify(userData),
  });
}

export function updateUser(id: number, updates: Partial<User>) {
  return request<User>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// Teams APIs
export function getTeams() {
  return request<Team[]>("/api/teams");
}

export function createTeam(teamData: { name: string; description?: string; managerId?: number; leadId?: number }) {
  return request<Team>("/api/teams", {
    method: "POST",
    body: JSON.stringify(teamData),
  });
}

// Projects APIs
export function getProjects() {
  return request<Project[]>("/api/projects");
}

export function createProject(projectData: {
  name: string;
  code: string;
  description?: string;
  managerId?: number;
  leadId?: number;
  startDate?: string;
  targetDate?: string;
}) {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(projectData),
  });
}

// Tasks APIs
export function getTasks(filters?: {
  projectId?: number;
  assignedToUserId?: number;
  assignedByUserId?: number;
  reviewerUserId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  myTasksOnly?: boolean;
}) {
  const params = new URLSearchParams();
  if (filters?.projectId) params.append("projectId", String(filters.projectId));
  if (filters?.assignedToUserId) params.append("assignedToUserId", String(filters.assignedToUserId));
  if (filters?.assignedByUserId) params.append("assignedByUserId", String(filters.assignedByUserId));
  if (filters?.reviewerUserId) params.append("reviewerUserId", String(filters.reviewerUserId));
  if (filters?.status) params.append("status", filters.status);
  if (filters?.priority) params.append("priority", filters.priority);
  if (filters?.search) params.append("search", filters.search);
  if (filters?.myTasksOnly) params.append("myTasksOnly", "true");

  const queryString = params.toString();
  return request<Task[]>(`/api/tasks${queryString ? `?${queryString}` : ""}`);
}

export function getTaskById(id: number) {
  return request<Task>(`/api/tasks/${id}`);
}

export function createTask(taskData: {
  title: string;
  description?: string;
  projectId: number;
  parentTaskId?: number | null;
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
  return request<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(taskData),
  });
}

export function updateTask(id: number, updates: {
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
  return request<Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function acknowledgeTask(id: number) {
  return request<Task>(`/api/tasks/${id}/acknowledge`, {
    method: "POST",
  });
}

export function submitTaskReview(id: number, review: { decision: ReviewDecision; feedback: string }) {
  return request<Task>(`/api/tasks/${id}/review`, {
    method: "POST",
    body: JSON.stringify(review),
  });
}

// Task comments, subtasks & activity
export function getTaskComments(taskId: number) {
  return request<TaskComment[]>(`/api/tasks/${taskId}/comments`);
}

export function addTaskComment(taskId: number, comment: string) {
  return request<TaskComment>(`/api/tasks/${taskId}/comments`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
}

export function getTaskActivity(taskId: number) {
  return request<TaskActivity[]>(`/api/tasks/${taskId}/activity`);
}

export function getTaskReviews(taskId: number) {
  return request<TaskReview[]>(`/api/tasks/${taskId}/reviews`);
}

export function addSubtask(taskId: number, title: string) {
  return request<Subtask>(`/api/tasks/${taskId}/subtasks`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function toggleSubtask(id: number, isCompleted: boolean) {
  return request<Subtask>(`/api/subtasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isCompleted }),
  });
}

// Notifications APIs
export function getNotifications() {
  return request<Notification[]>("/api/notifications");
}

export function markNotificationRead(id: number) {
  return request<{ success: boolean }>(`/api/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return request<{ success: boolean }>("/api/notifications/read-all", {
    method: "POST",
  });
}

// Analytics APIs
export function getTeamWorkloadAnalytics() {
  return request<WorkloadMember[]>("/api/analytics/workload");
}

export function getDashboardMetrics() {
  return request<DashboardMetrics>("/api/analytics/dashboard");
}

// Legacy APIs
export function getDailyProgressReports(reportDate: string) {
  return request<DailyProgressReport[]>(
    `/api/daily-reports?date=${encodeURIComponent(reportDate)}`,
  );
}

export function saveDailyProgressReport(report: NewDailyProgressReport) {
  return request<DailyProgressReport>("/api/daily-reports", {
    method: "PUT",
    body: JSON.stringify(report),
  });
}

export function getEmployees() {
  return request<EmployeeRecord[]>("/api/employees");
}

export function getProjectAllotments() {
  return request<ProjectAllotment[]>("/api/project-allotments");
}

export function createProjectAllotment(allotment: NewProjectAllotment) {
  return request<ProjectAllotment[]>("/api/project-allotments", {
    method: "POST",
    body: JSON.stringify(allotment),
  });
}

export function updateProjectAllotmentProgress(id: number, progress: TaskProgress) {
  return request<ProjectAllotment>(`/api/project-allotments/${id}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ progress }),
  });
}

export function updateProjectAllotmentRepository(id: number, repositoryUrl: string) {
  return request<ProjectAllotment>(`/api/project-allotments/${id}/repository`, {
    method: "PATCH",
    body: JSON.stringify({ repositoryUrl }),
  });
}

export function updateProjectAllotmentAssistance(id: number, assistanceBy: string[]) {
  return request<ProjectAllotment>(`/api/project-allotments/${id}/assistance`, {
    method: "PATCH",
    body: JSON.stringify({ assistanceBy }),
  });
}

export function createEmployee(employee: Omit<EmployeeRecord, "id">) {
  return request<EmployeeRecord>("/api/employees", {
    method: "POST",
    body: JSON.stringify(employee),
  });
}

export function updateEmployee(id: number, employee: Omit<EmployeeRecord, "id">) {
  return request<EmployeeRecord>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(employee),
  });
}
