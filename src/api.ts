export type WorkStatus = "In Progress" | "Completed" | "Pending" | "On Hold";
export type TaskProgress = "Not Started" | "In Progress" | "Blocked" | "Completed";

export const taskProgressOptions: TaskProgress[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "Completed",
];

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
  assignedBy: string;
  progress: TaskProgress;
  repositoryUrl: string | null;
};

export type NewProjectAllotment = {
  employeeNames: string[];
  project: string;
  taskAssigned: string;
  assignedBy: string;
  progress: TaskProgress;
  repositoryUrl: string;
};

export type DailyProgressReport = {
  id: number;
  employeeName: string;
  reportDate: string;
  completedToday: string;
  plansNext: string;
  blockers: string;
};

export type NewDailyProgressReport = Omit<DailyProgressReport, "id">;

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
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
