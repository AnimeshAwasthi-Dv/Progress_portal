import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Briefcase,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FolderGit2,
  Kanban,
  LayoutDashboard,
  Link,
  ListTodo,
  type LucideIcon,
  Menu,
  MessageSquare,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  UserCheck,
  UserPlus,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  acknowledgeTask,
  addSubtask,
  addTaskComment,
  createProject,
  createTask,
  createUser,
  getCurrentUser,
  getDailyProgressReports,
  getDashboardMetrics,
  getNotifications,
  getProjectAllotments,
  getProjects,
  getTaskActivity,
  getTaskById,
  getTaskComments,
  getTaskReviews,
  getTasks,
  getTeamWorkloadAnalytics,
  getTeams,
  getUsers,
  markAllNotificationsRead,
  markNotificationRead,
  saveDailyProgressReport,
  setActiveUserId,
  submitTaskReview,
  taskPriorityOptions,
  taskStatusOptions,
  toggleSubtask,
  type DailyProgressReport,
  type DashboardMetrics,
  type Notification,
  type Project,
  type ProjectAllotment,
  type ReviewDecision,
  type Task,
  type TaskActivity,
  type TaskComment,
  type TaskPriority,
  type TaskReview,
  type TaskStatus,
  type Team,
  type User as AppUser,
  type UserRole,
  type WorkloadMember,
  updateTask,
} from "./api";

const companyLogo = new URL("../images/logo.png", import.meta.url).href;

// ---------------- Helper Utilities ---------------- //

function initials(name: string = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "TM";
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const statusBadgeStyles: Record<TaskStatus, { bg: string; text: string; dot: string }> = {
  Backlog: { bg: "bg-slate-100", text: "text-slate-700", dot: "bg-slate-400" },
  "To Do": { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  "In Progress": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-600" },
  "In Review": { bg: "bg-teal-50", text: "text-teal-700", dot: "bg-teal-600" },
  Completed: { bg: "bg-emerald-100", text: "text-emerald-800 font-bold", dot: "bg-emerald-600" },
  Blocked: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-600" },
};

const priorityBadgeStyles: Record<TaskPriority, { bg: string; text: string }> = {
  Low: { bg: "bg-slate-100 text-slate-600", text: "Low" },
  Medium: { bg: "bg-emerald-50 text-emerald-700", text: "Medium" },
  High: { bg: "bg-amber-50 text-amber-800", text: "High" },
  Urgent: { bg: "bg-rose-100 text-rose-700 font-bold", text: "Urgent" },
};

const roleBadgeStyles: Record<UserRole, { bg: string; text: string; icon: LucideIcon }> = {
  Admin: { bg: "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold", text: "Admin", icon: ShieldAlert },
  Manager: { bg: "bg-teal-50 text-teal-800 border-teal-200", text: "Manager / Lead", icon: Briefcase },
  "Team Lead": { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Team Lead", icon: Users },
  Individual: { bg: "bg-slate-100 text-slate-700 border-slate-200", text: "Individual Member", icon: User },
};

type ViewMode =
  | "overview"
  | "my-tasks"
  | "all-tasks"
  | "kanban"
  | "projects"
  | "team-management"
  | "workload"
  | "daily-reports"
  | "calendar"
  | "analytics"
  | "allotments"
  | "workflows"
  | "settings";

export default function App() {
  // Application State
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [teamsList, setTeamsList] = useState<Team[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [tasksList, setTasksList] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [workloadData, setWorkloadData] = useState<WorkloadMember[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [allotments, setAllotments] = useState<ProjectAllotment[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyProgressReport[]>([]);

  // Navigation & UI controls
  const [currentView, setCurrentView] = useState<ViewMode>("overview");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterProject, setFilterProject] = useState<string>("All");
  const [filterStatus, setFilterStatus] = useState<string>("All");
  const [filterPriority, setFilterPriority] = useState<string>("All");
  const [filterAssignee, setFilterAssignee] = useState<string>("All");
  const [filterRole, setFilterRole] = useState<string>("All");
  const [reportDate, setReportDate] = useState<string>(localDateString());

  // Task Detail Modal / Side Panel
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [taskActivities, setTaskActivities] = useState<TaskActivity[]>([]);
  const [, setTaskReviews] = useState<TaskReview[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Task Creation & Edit Modal
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskFormData, setTaskFormData] = useState({
    title: "",
    description: "",
    projectId: 0,
    assignedToUserId: 0,
    reviewerUserId: 0 as number | null,
    priority: "Medium" as TaskPriority,
    status: "To Do" as TaskStatus,
    startDate: "",
    dueDate: "",
    estimatedHours: 8,
    acceptanceCriteria: "",
    repositoryUrl: "",
    pullRequestUrl: "",
    collaboratorIds: [] as number[],
  });

  // Reassignment & Review Action Modals
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignUserId, setReassignUserId] = useState<number>(0);
  const [reassignReason, setReassignReason] = useState("");

  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>("Approved");
  const [reviewFeedback, setReviewFeedback] = useState("");

  // Blocker Escalation Modal
  const [isBlockerModalOpen, setIsBlockerModalOpen] = useState(false);
  const [blockerReasonText, setBlockerReasonText] = useState("");

  // Project Creation Modal
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectFormData, setProjectFormData] = useState({
    name: "",
    code: "",
    description: "",
    managerId: 0,
    leadId: 0,
    startDate: "",
    targetDate: "",
  });

  // Daily Report Submission Modal
  const [isDailyReportModalOpen, setIsDailyReportModalOpen] = useState(false);
  const [dailyReportFormData, setDailyReportFormData] = useState({
    employeeName: "",
    completedToday: "",
    plansNext: "",
    blockers: "",
    projectId: 0,
    taskId: 0,
  });

  // User Management Modal (Admin)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userFormData, setUserFormData] = useState({
    name: "",
    email: "",
    role: "Individual" as UserRole,
    department: "Technical",
    designation: "Software Engineer",
    teamId: 0,
  });

  // Initial Data Fetch
  const refreshAllData = async () => {
    try {
      setIsLoading(true);
      const [u, users, teams, projs, tasks, metricsData, workload, notifs, legacyAllotments] =
        await Promise.all([
          getCurrentUser(),
          getUsers(),
          getTeams(),
          getProjects(),
          getTasks(),
          getDashboardMetrics(),
          getTeamWorkloadAnalytics(),
          getNotifications(),
          getProjectAllotments(),
        ]);

      setCurrentUser(u);
      setUsersList(users);
      setTeamsList(teams);
      setProjectsList(projs);
      setTasksList(tasks);
      setMetrics(metricsData);
      setWorkloadData(workload);
      setNotifications(notifs);
      setAllotments(legacyAllotments);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load application data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  // Fetch daily reports when reportDate changes
  useEffect(() => {
    getDailyProgressReports(reportDate)
      .then((reports) => setDailyReports(reports))
      .catch((e) => console.error(e));
  }, [reportDate]);

  // Load Task Details when selectedTaskId changes
  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      return;
    }
    Promise.all([
      getTaskById(selectedTaskId),
      getTaskComments(selectedTaskId),
      getTaskActivity(selectedTaskId),
      getTaskReviews(selectedTaskId),
    ])
      .then(([t, c, a, r]) => {
        setSelectedTask(t);
        setTaskComments(c);
        setTaskActivities(a);
        setTaskReviews(r);
      })
      .catch((e) => setErrorMessage(e.message));
  }, [selectedTaskId]);

  // Handle Switch User (Role Simulator)
  const handleSwitchUser = async (userId: number) => {
    setActiveUserId(userId);
    setIsLoading(true);
    try {
      await refreshAllData();
      const targetUser = usersList.find((u) => u.id === userId);
      setSuccessMessage(`Switched active profile to ${targetUser?.name || "User"}.`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (e: any) {
      setErrorMessage(e.message);
    }
  };

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasksList.filter((t) => {
      if (currentView === "my-tasks" && currentUser) {
        const isAssigned = t.assignedToUserId === currentUser.id;
        const isCollab = t.collaboratorIds?.includes(currentUser.id);
        if (!isAssigned && !isCollab) return false;
      }
      if (filterProject !== "All" && String(t.projectId) !== filterProject) return false;
      if (filterStatus !== "All" && t.status !== filterStatus) return false;
      if (filterPriority !== "All" && t.priority !== filterPriority) return false;
      if (filterAssignee !== "All" && String(t.assignedToUserId) !== filterAssignee) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          t.title.toLowerCase().includes(q) ||
          t.taskCode.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.projectName?.toLowerCase().includes(q) ||
          t.assignedToName?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [tasksList, currentView, currentUser, filterProject, filterStatus, filterPriority, filterAssignee, searchQuery]);

  // Action Handlers
  const handleOpenCreateTask = () => {
    if (!currentUser || currentUser.role === "Individual") {
      setErrorMessage("Individual contributors cannot create top-level tasks. Contact Team Lead or Manager.");
      return;
    }
    setTaskFormData({
      title: "",
      description: "",
      projectId: projectsList[0]?.id || 0,
      assignedToUserId: usersList.find((u) => u.role === "Individual")?.id || usersList[0]?.id || 0,
      reviewerUserId: currentUser.id,
      priority: "Medium",
      status: "To Do",
      startDate: localDateString(),
      dueDate: localDateString(new Date(Date.now() + 7 * 86400000)),
      estimatedHours: 8,
      acceptanceCriteria: "1. Staging deployment verification.\n2. Unit & Integration tests passing.",
      repositoryUrl: "https://github.com/org/task-repo",
      pullRequestUrl: "",
      collaboratorIds: [],
    });
    setEditingTaskId(null);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFormData.title.trim() || !taskFormData.projectId || !taskFormData.assignedToUserId) {
      setErrorMessage("Please complete all required fields (Title, Project, Assignee).");
      return;
    }

    try {
      if (editingTaskId) {
        const updated = await updateTask(editingTaskId, taskFormData);
        setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (selectedTaskId === editingTaskId) setSelectedTask(updated);
        setSuccessMessage(`Task ${updated.taskCode} updated successfully.`);
      } else {
        const created = await createTask(taskFormData);
        setTasksList((prev) => [created, ...prev]);
        setSuccessMessage(`Task ${created.taskCode} created & assigned successfully.`);
      }
      setIsTaskModalOpen(false);
      refreshAllData();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save task.");
    }
  };

  const handleAcknowledge = async (taskId: number) => {
    try {
      const updated = await acknowledgeTask(taskId);
      setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (selectedTask?.id === taskId) setSelectedTask(updated);
      setSuccessMessage("Task assignment acknowledged.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleStatusTransition = async (taskId: number, newStatus: TaskStatus) => {
    try {
      const updated = await updateTask(taskId, { status: newStatus });
      setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (selectedTask?.id === taskId) setSelectedTask(updated);
      setSuccessMessage(`Task moved to ${newStatus}.`);
      refreshAllData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId || !newComment.trim()) return;
    try {
      const comment = await addTaskComment(selectedTaskId, newComment.trim());
      setTaskComments((prev) => [...prev, comment]);
      setNewComment("");
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId || !newSubtaskTitle.trim()) return;
    try {
      const sub = await addSubtask(selectedTaskId, newSubtaskTitle.trim());
      if (selectedTask) {
        setSelectedTask({
          ...selectedTask,
          subtasks: [...(selectedTask.subtasks || []), sub],
        });
      }
      setNewSubtaskTitle("");
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleToggleSubtask = async (subtaskId: number, currentCompleted: boolean) => {
    try {
      const updated = await toggleSubtask(subtaskId, !currentCompleted);
      if (selectedTask && selectedTask.subtasks) {
        setSelectedTask({
          ...selectedTask,
          subtasks: selectedTask.subtasks.map((s) => (s.id === subtaskId ? updated : s)),
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId || !reassignUserId) return;
    try {
      const updated = await updateTask(selectedTaskId, {
        assignedToUserId: reassignUserId,
        reassignReason: reassignReason.trim() || "Workload redistribution",
      });
      setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTask(updated);
      setIsReassignModalOpen(false);
      setSuccessMessage("Task reassigned successfully.");
      refreshAllData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;
    try {
      const updated = await submitTaskReview(selectedTaskId, {
        decision: reviewDecision,
        feedback: reviewFeedback.trim(),
      });
      setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTask(updated);
      setIsReviewModalOpen(false);
      setSuccessMessage(`Review decision submitted: ${reviewDecision}.`);
      refreshAllData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleBlockerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;
    try {
      const updated = await updateTask(selectedTaskId, {
        status: "Blocked",
        blockerReason: blockerReasonText.trim() || "Technical impediment reported.",
      });
      setTasksList((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTask(updated);
      setIsBlockerModalOpen(false);
      setSuccessMessage("Task status updated to Blocked and escalations sent.");
      refreshAllData();
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectFormData.name.trim() || !projectFormData.code.trim()) return;
    try {
      const proj = await createProject({
        name: projectFormData.name.trim(),
        code: projectFormData.code.trim(),
        description: projectFormData.description.trim(),
        managerId: projectFormData.managerId || currentUser?.id,
        leadId: projectFormData.leadId || undefined,
        startDate: projectFormData.startDate || undefined,
        targetDate: projectFormData.targetDate || undefined,
      });
      setProjectsList((prev) => [...prev, proj]);
      setIsProjectModalOpen(false);
      setSuccessMessage(`Project ${proj.name} created successfully.`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name.trim() || !userFormData.email.trim()) return;
    try {
      const u = await createUser({
        name: userFormData.name.trim(),
        email: userFormData.email.trim(),
        role: userFormData.role,
        department: userFormData.department.trim(),
        designation: userFormData.designation.trim(),
        teamId: userFormData.teamId || undefined,
      });
      setUsersList((prev) => [...prev, u]);
      setIsUserModalOpen(false);
      setSuccessMessage(`User ${u.name} registered as ${u.role}.`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const openCreateProfile = () => {
    setUserFormData({
      name: "",
      email: "",
      role: "Individual",
      department: "Technical",
      designation: "Software Engineer",
      teamId: teamsList[0]?.id || 0,
    });
    setIsUserModalOpen(true);
    setIsMobileMenuOpen(false);
  };

  const handleSaveDailyReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dailyReportFormData.employeeName.trim() || !dailyReportFormData.completedToday.trim()) {
      setErrorMessage("Please complete the required report details.");
      return;
    }
    try {
      const rep = await saveDailyProgressReport({
        employeeName: dailyReportFormData.employeeName.trim(),
        reportDate,
        completedToday: dailyReportFormData.completedToday.trim(),
        plansNext: dailyReportFormData.plansNext.trim(),
        blockers: dailyReportFormData.blockers.trim(),
        projectId: dailyReportFormData.projectId || undefined,
        taskId: dailyReportFormData.taskId || undefined,
        userId: currentUser?.id,
      });
      setDailyReports((prev) => [...prev.filter((r) => r.employeeName !== rep.employeeName), rep]);
      setIsDailyReportModalOpen(false);
      setSuccessMessage("Daily progress report saved.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Determine authorized navigation items based on role
  const role = currentUser?.role || "Individual";
  const canManageProjects = role === "Admin" || role === "Manager";
  const canManageUsers = role === "Admin" || role === "Team Lead";
  const canAssignTasks = role === "Admin" || role === "Manager" || role === "Team Lead";

  // Grouped Team Hierarchy for Team Management Module
  const teamLeadsManagers = useMemo(() => {
    return usersList.filter((u) => u.role === "Manager" || u.role === "Team Lead");
  }, [usersList]);

  const individualContributors = useMemo(() => {
    return usersList.filter((u) => u.role === "Individual");
  }, [usersList]);

  const adminUsers = useMemo(() => {
    return usersList.filter((u) => u.role === "Admin");
  }, [usersList]);

  return (
    <div className="h-screen overflow-hidden bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Navigation Bar in Green & White Theme */}
      <header className="sticky top-0 z-30 bg-white border-b border-emerald-100 px-4 lg:px-8 py-3 flex items-center justify-between shadow-xs lg:ml-64">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-emerald-50 rounded-lg lg:hidden"
            aria-label="Toggle Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Active User Name / Persona Selector */}
          <div className="flex items-center bg-emerald-50/70 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs">
            <UserCheck className="w-4 h-4 text-emerald-600 mr-2 shrink-0" />
            <span className="text-emerald-900 font-bold mr-1.5 hidden sm:inline">Current User:</span>
            <select
              value={currentUser?.id || 1}
              onChange={(e) => handleSwitchUser(Number(e.target.value))}
              className="bg-transparent font-bold text-emerald-950 outline-none cursor-pointer pr-1"
            >
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.name === "Admin" ? "(Organization Admin)" : `(${u.role})`}
                </option>
              ))}
            </select>
          </div>

          {/* Notifications Trigger */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="relative p-2 text-slate-600 hover:bg-emerald-50 rounded-lg transition"
              aria-label="Notifications"
            >
              <Radio className="w-5 h-5" />
              {notifications.some((n) => !n.isRead) && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">Notifications & Alerts</span>
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                      {notifications.filter((n) => !n.isRead).length} new
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await markAllNotificationsRead();
                      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
                    }}
                    className="text-xs text-emerald-600 hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto mt-2">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No notifications.</div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          if (!n.isRead) {
                            await markNotificationRead(n.id);
                            setNotifications((prev) =>
                              prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
                            );
                          }
                          if (n.taskId) setSelectedTaskId(n.taskId);
                          setNotificationsOpen(false);
                        }}
                        className={`py-3 px-2 text-xs cursor-pointer rounded-lg transition ${
                          n.isRead ? "hover:bg-slate-50 text-slate-600" : "bg-emerald-50/50 hover:bg-emerald-50 text-slate-900 font-medium"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-800">{n.title}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-slate-600">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Add Task Action */}
          {canAssignTasks && (
            <button
              onClick={handleOpenCreateTask}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </header>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-3 mx-4 lg:mx-8 mt-4 rounded-r-lg flex items-center justify-between text-rose-800 text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="hover:text-rose-950 font-bold p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 mx-4 lg:mx-8 mt-4 rounded-r-lg flex items-center justify-between text-emerald-800 text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage("")} className="hover:text-emerald-950 font-bold p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="min-h-0 flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 min-h-0 bg-white border-r border-slate-200 flex flex-col pt-16 lg:pt-0 transition-transform lg:fixed lg:translate-x-0 ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="min-h-[72px] shrink-0 border-b border-slate-100 px-3 py-2 flex items-center gap-2.5">
            <img src={companyLogo} alt="Dectrocel logo" className="h-12 w-12 shrink-0 object-contain" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-extrabold text-slate-900">Dectrocel</p>
              <p className="text-[10px] font-bold uppercase text-emerald-700">Healthcare and Research</p>
            </div>
          </div>

          {/* User Profile Card */}
          <div className="p-4 border-b border-emerald-50 bg-emerald-50/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm ring-2 ring-emerald-200">
              {initials(currentUser?.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 truncate">
                {currentUser?.name === "Admin" ? "Administrator" : currentUser?.name}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`badge ${roleBadgeStyles[role].bg} px-2 py-0.2 border text-[11px]`}>
                  {currentUser?.role === "Admin" ? "Admin" : currentUser?.role}
                </span>
              </div>
            </div>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-1 text-xs sm:text-sm font-medium">
            <p className="px-3 pt-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Workspace Views
            </p>
            <button
              onClick={() => {
                setCurrentView("overview");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "overview"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-emerald-600" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("my-tasks");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                currentView === "my-tasks"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>My Tasks</span>
              </div>
              {metrics?.personal?.myTotalTasks !== undefined && (
                <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold">
                  {metrics.personal.myTotalTasks}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setCurrentView("all-tasks");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                currentView === "all-tasks"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <ListTodo className="w-4 h-4 text-emerald-600" />
                <span>All Tasks</span>
              </div>
              <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                {tasksList.length}
              </span>
            </button>

            <button
              onClick={() => {
                setCurrentView("kanban");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "kanban"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <Kanban className="w-4 h-4 text-emerald-600" />
              <span>Kanban Board</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("projects");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition ${
                currentView === "projects"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <div className="flex items-center gap-3">
                <FolderGit2 className="w-4 h-4 text-emerald-600" />
                <span>Projects</span>
              </div>
              <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-semibold">
                {projectsList.length}
              </span>
            </button>

            <button
              onClick={() => {
                setCurrentView("team-management");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "team-management"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <Users className="w-4 h-4 text-emerald-600" />
              <span>Team Management</span>
            </button>
            {canManageUsers && (
              <button
                onClick={openCreateProfile}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-emerald-800 hover:bg-emerald-50 transition font-bold"
              >
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <span>Create Profile</span>
              </button>
            )}

            <button
              onClick={() => {
                setCurrentView("workload");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "workload"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>Team Workload</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("daily-reports");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "daily-reports"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Daily Reports</span>
            </button>

            <p className="px-3 pt-4 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Organization Governance
            </p>

            <button
              onClick={() => {
                setCurrentView("calendar");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "calendar"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <CalendarIcon className="w-4 h-4 text-emerald-600" />
              <span>Calendar</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("analytics");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "analytics"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Analytics</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("allotments");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "allotments"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <Network className="w-4 h-4 text-emerald-600" />
              <span>Project Allotments</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("workflows");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "workflows"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <Workflow className="w-4 h-4 text-emerald-600" />
              <span>Workflows & Roles</span>
            </button>

            <button
              onClick={() => {
                setCurrentView("settings");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                currentView === "settings"
                  ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                  : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-900"
              }`}
            >
              <Settings className="w-4 h-4 text-emerald-600" />
              <span>Settings</span>
            </button>
          </nav>

          <div className="p-3 border-t border-slate-100 text-xs text-slate-500">
            <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-200/70">
              <p className="font-bold text-emerald-900">Dectrocel Healthcare and Research</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Authenticated role: <strong>{currentUser?.role === "Admin" ? "Admin" : currentUser?.role}</strong>
              </p>
            </div>
          </div>
        </aside>

        {/* Content Viewport */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8 lg:ml-64 font-sans">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
              <p className="text-sm font-medium">Synchronizing Dectrocel database...</p>
            </div>
          ) : (
            <>
              {/* ----------------- VIEW 1: ROLE-SPECIFIC OVERVIEW ----------------- */}
              {currentView === "overview" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  {/* Persona Banner in Emerald Green & Slate */}
                  <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                          {currentUser?.role === "Admin" ? "Admin Console" : `${currentUser?.name} (${currentUser?.role})`}
                        </span>
                        <span className="text-emerald-200/70 text-xs">• Connected to PostgreSQL Database</span>
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black font-display tracking-tight">
                        Task Manager Portal
                      </h1>
                      <p className="text-emerald-100 text-xs sm:text-sm mt-1 max-w-2xl">
                        {role === "Admin" && "Organization-wide governance. Manage users, projects, teams, and high-level escalations."}
                        {role === "Manager" && "Team Lead & Manager Console. Oversee projects, create tasks, assign work, monitor progress, and review deliverables."}
                        {role === "Team Lead" && "Technical Lead execution hub. Supervise team execution, assign work, and conduct technical reviews."}
                        {role === "Individual" && "Individual Contributor Hub. Track your assignments, blockers, deliverable submissions, and reports."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {canAssignTasks && (
                        <button
                          onClick={handleOpenCreateTask}
                          className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl shadow-sm transition flex items-center gap-1.5"
                        >
                          <Plus className="w-4 h-4" />
                          New Assignment
                        </button>
                      )}
                      {canManageProjects && (
                        <button
                          onClick={() => {
                            setProjectFormData({
                              name: "",
                              code: "",
                              description: "",
                              managerId: currentUser?.id || 0,
                              leadId: 0,
                              startDate: localDateString(),
                              targetDate: localDateString(new Date(Date.now() + 45 * 86400000)),
                            });
                            setIsProjectModalOpen(true);
                          }}
                          className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition flex items-center gap-1.5"
                        >
                          <FolderGit2 className="w-4 h-4" />
                          New Project
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 card-hover shadow-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Total Tasks</span>
                        <ListTodo className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black text-slate-900 font-display">
                        {metrics?.totalTasks || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Across all active projects</p>
                    </div>

                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 card-hover shadow-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">In Progress</span>
                        <Clock className="w-4 h-4 text-emerald-600" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black text-emerald-600 font-display">
                        {metrics?.inProgressTasks || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Actively being executed</p>
                    </div>

                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 card-hover shadow-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">Blocked Issues</span>
                        <AlertOctagon className="w-4 h-4 text-rose-600" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black text-rose-600 font-display">
                        {metrics?.blockedTasks || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Requires lead/mgr action</p>
                    </div>

                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 card-hover shadow-xs">
                      <div className="flex items-center justify-between text-slate-500 mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider">In Review</span>
                        <FileCheck className="w-4 h-4 text-teal-600" />
                      </div>
                      <p className="text-2xl sm:text-3xl font-black text-teal-600 font-display">
                        {metrics?.inReviewTasks || 0}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Awaiting approval</p>
                    </div>
                  </div>

                  {/* Role Specific Section Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left 2 Cols: Priority Tasks & Work Focus */}
                    <div className="lg:col-span-2 space-y-6">
                      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600" />
                            {role === "Individual" ? "My Tasks & Deliverables" : "High Priority Task Queue"}
                          </h2>
                          <button
                            onClick={() => setCurrentView(role === "Individual" ? "my-tasks" : "all-tasks")}
                            className="text-xs text-emerald-600 hover:underline font-semibold flex items-center gap-1"
                          >
                            View all <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="divide-y divide-slate-100">
                          {tasksList
                            .filter((t) => {
                              if (role === "Individual" && currentUser) {
                                return t.assignedToUserId === currentUser.id;
                              }
                              return t.priority === "Urgent" || t.priority === "High" || t.status === "Blocked";
                            })
                            .slice(0, 6)
                            .map((task) => (
                              <div
                                key={task.id}
                                onClick={() => setSelectedTaskId(task.id)}
                                className="py-3.5 hover:bg-emerald-50/40 rounded-lg px-2 transition cursor-pointer flex items-center justify-between gap-4"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono text-xs font-bold text-slate-500">{task.taskCode}</span>
                                    <span className={`badge ${statusBadgeStyles[task.status].bg} ${statusBadgeStyles[task.status].text}`}>
                                      {task.status}
                                    </span>
                                    <span className={`badge ${priorityBadgeStyles[task.priority].bg}`}>
                                      {task.priority}
                                    </span>
                                  </div>
                                  <p className="font-semibold text-sm text-slate-900 truncate">{task.title}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Project: <strong className="text-slate-700">{task.projectName}</strong> • Assigned to: <strong className="text-emerald-700 font-bold">{task.assignedToName}</strong>
                                  </p>
                                </div>

                                <div className="text-right shrink-0">
                                  <div className="text-xs font-medium text-slate-500">
                                    Due: <span className="font-bold text-slate-700">{task.dueDate || "N/A"}</span>
                                  </div>
                                  <div className="w-24 bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                                    <div
                                      className="bg-emerald-500 h-full rounded-full"
                                      style={{ width: `${task.progressPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Active Projects Pulse */}
                      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
                            <FolderGit2 className="w-4 h-4 text-emerald-600" />
                            Active Projects
                          </h2>
                          <button
                            onClick={() => setCurrentView("projects")}
                            className="text-xs text-emerald-600 hover:underline font-semibold"
                          >
                            All projects
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {projectsList.slice(0, 4).map((p) => (
                            <div key={p.id} className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50/40 transition">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-mono text-xs font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                                  {p.code}
                                </span>
                                <span className="text-xs font-semibold text-slate-500">
                                  {p.completedTaskCount || 0} / {p.taskCount || 0} tasks
                                </span>
                              </div>
                              <h3 className="font-bold text-sm text-slate-900 truncate">{p.name}</h3>
                              <p className="text-xs text-slate-500 mt-1">Lead: {p.leadName || "Unassigned"}</p>
                              <div className="mt-3">
                                <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                                  <span>Progress</span>
                                  <span>{p.progressPercent || 0}%</span>
                                </div>
                                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                    style={{ width: `${p.progressPercent || 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right Col: Live Activity Stream & Daily Report CTA */}
                    <div className="space-y-6">
                      {/* Daily Report Quick Submission */}
                      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 shadow-xs">
                        <div className="flex items-center gap-2 mb-2 text-emerald-950 font-bold text-sm">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                          Daily Progress Reporting
                        </div>
                        <p className="text-xs text-emerald-800 mb-4">
                          Submit your daily progress, next-day plans, and blockers for {reportDate}.
                        </p>
                        <button
                          onClick={() => {
                            setDailyReportFormData({
                              employeeName: currentUser?.name || "",
                              completedToday: "",
                              plansNext: "",
                              blockers: "",
                              projectId: projectsList[0]?.id || 0,
                              taskId: tasksList[0]?.id || 0,
                            });
                            setIsDailyReportModalOpen(true);
                          }}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-lg shadow-sm transition"
                        >
                          Submit Today's Report
                        </button>
                      </div>

                      {/* Live Activity Audit Feed */}
                      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                        <h2 className="font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-emerald-600" />
                          Recent Activity
                        </h2>

                        <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
                          {metrics?.recentActivity && metrics.recentActivity.length > 0 ? (
                            metrics.recentActivity.map((act) => (
                              <div key={act.id} className="text-xs flex gap-3 border-l-2 border-emerald-500 pl-3 py-1">
                                <div>
                                  <p className="text-slate-800">
                                    <strong className="text-slate-900">{act.actorName}</strong> {act.action.replace("_", " ").toLowerCase()} on{" "}
                                    <strong className="text-emerald-700">{act.taskCode}</strong>
                                  </p>
                                  {act.newValue && (
                                    <p className="text-slate-500 text-[11px] mt-0.5 font-mono">
                                      {act.fieldChanged}: {act.oldValue ? `${act.oldValue} → ` : ""}
                                      {act.newValue}
                                    </p>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    {new Date(act.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400">No recent activity recorded.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 2: ALL TASKS & MY TASKS MATRIX ----------------- */}
              {(currentView === "all-tasks" || currentView === "my-tasks") && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        {currentView === "my-tasks" ? "My Tasks" : "All Tasks"}
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        {currentView === "my-tasks"
                          ? "Tasks assigned to you with assigner details, criteria, and deadlines"
                          : "Full organizational task matrix with assignment history and review states"}
                      </p>
                    </div>

                    {canAssignTasks && (
                      <button
                        onClick={handleOpenCreateTask}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm transition self-start md:self-auto"
                      >
                        <Plus className="w-4 h-4" />
                        Create Assignment
                      </button>
                    )}
                  </div>

                  {/* Filters Bar */}
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search tasks by code, title, assignee..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                      />
                    </div>

                    <select
                      value={filterProject}
                      onChange={(e) => setFilterProject(e.target.value)}
                      className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none font-medium text-slate-700"
                    >
                      <option value="All">All Projects</option>
                      {projectsList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none font-medium text-slate-700"
                    >
                      <option value="All">All Statuses</option>
                      {taskStatusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>

                    <select
                      value={filterPriority}
                      onChange={(e) => setFilterPriority(e.target.value)}
                      className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none font-medium text-slate-700"
                    >
                      <option value="All">All Priorities</option>
                      {taskPriorityOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>

                    {currentView !== "my-tasks" && (
                      <select
                        value={filterAssignee}
                        onChange={(e) => setFilterAssignee(e.target.value)}
                        className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none font-medium text-slate-700"
                      >
                        <option value="All">All Assignees</option>
                        {usersList.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Tasks Table */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs sm:text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-4">Task ID</th>
                            <th className="py-3 px-4">Title & Description</th>
                            <th className="py-3 px-4">Project</th>
                            <th className="py-3 px-4">Assigned By</th>
                            <th className="py-3 px-4">Assigned To</th>
                            <th className="py-3 px-4">Reviewer</th>
                            <th className="py-3 px-4">Priority</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Due Date</th>
                            <th className="py-3 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {filteredTasks.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-12 text-center text-slate-400">
                                No tasks match the selected filters.
                              </td>
                            </tr>
                          ) : (
                            filteredTasks.map((t) => (
                              <tr
                                key={t.id}
                                onClick={() => setSelectedTaskId(t.id)}
                                className="hover:bg-emerald-50/30 transition cursor-pointer"
                              >
                                <td className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                                  {t.taskCode}
                                </td>
                                <td className="py-3.5 px-4 max-w-xs">
                                  <p className="font-bold text-slate-900 truncate">{t.title}</p>
                                  <p className="text-[11px] text-slate-500 truncate">{t.description}</p>
                                </td>
                                <td className="py-3.5 px-4 text-slate-700 font-semibold">{t.projectName}</td>
                                <td className="py-3.5 px-4 text-slate-600 font-semibold">{t.assignedByName}</td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] flex items-center justify-center">
                                      {initials(t.assignedToName)}
                                    </div>
                                    <span className="font-bold text-slate-900">{t.assignedToName}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 text-slate-600">{t.reviewerName || "—"}</td>
                                <td className="py-3.5 px-4">
                                  <span className={`badge ${priorityBadgeStyles[t.priority].bg}`}>
                                    {t.priority}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span
                                    className={`badge ${statusBadgeStyles[t.status].bg} ${
                                      statusBadgeStyles[t.status].text
                                    }`}
                                  >
                                    {t.status}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 text-slate-700 font-semibold">{t.dueDate || "N/A"}</td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTaskId(t.id);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 3: KANBAN BOARD ----------------- */}
              {currentView === "kanban" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Kanban Board
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Backlog → To Do → In Progress → In Review → Completed (plus Blocked)
                      </p>
                    </div>
                    {canAssignTasks && (
                      <button
                        onClick={handleOpenCreateTask}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Create Task
                      </button>
                    )}
                  </div>

                  {/* Kanban Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
                    {taskStatusOptions.map((status) => {
                      const statusTasks = filteredTasks.filter((t) => t.status === status);
                      return (
                        <div
                          key={status}
                          className="bg-slate-100/70 border border-slate-200/80 rounded-xl p-3 flex flex-col min-h-[500px]"
                        >
                          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200">
                            <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${statusBadgeStyles[status].dot}`} />
                              {status}
                            </span>
                            <span className="text-xs font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                              {statusTasks.length}
                            </span>
                          </div>

                          <div className="space-y-2.5 flex-1 overflow-y-auto">
                            {statusTasks.map((task) => (
                              <div
                                key={task.id}
                                onClick={() => setSelectedTaskId(task.id)}
                                className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs hover:border-emerald-300 transition cursor-pointer"
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="font-mono text-[10px] font-bold text-slate-500">
                                    {task.taskCode}
                                  </span>
                                  <span className={`badge ${priorityBadgeStyles[task.priority].bg} text-[10px]`}>
                                    {task.priority}
                                  </span>
                                </div>
                                <h4 className="font-bold text-xs text-slate-900 line-clamp-2">{task.title}</h4>
                                <p className="text-[11px] text-slate-500 mt-1 truncate">{task.projectName}</p>
                                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-[11px]">
                                  <span className="text-emerald-800 font-bold truncate max-w-[100px]">
                                    {task.assignedToName}
                                  </span>
                                  <span className="text-slate-400 text-[10px]">{task.dueDate || "No due date"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 4: PROJECTS VIEW ----------------- */}
              {currentView === "projects" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Projects
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Define project milestones, assign management ownership, and monitor delivery
                      </p>
                    </div>
                    {canManageProjects && (
                      <button
                        onClick={() => {
                          setProjectFormData({
                            name: "",
                            code: "",
                            description: "",
                            managerId: currentUser?.id || 0,
                            leadId: 0,
                            startDate: localDateString(),
                            targetDate: localDateString(new Date(Date.now() + 45 * 86400000)),
                          });
                          setIsProjectModalOpen(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Create Project
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projectsList.map((project) => (
                      <div
                        key={project.id}
                        className="bg-white rounded-xl border border-slate-200 p-6 card-hover shadow-xs flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-mono font-extrabold bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-md">
                              {project.code}
                            </span>
                            <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {project.status}
                            </span>
                          </div>
                          <h3 className="font-bold text-base text-slate-900 font-display">{project.name}</h3>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {project.description || "No description provided."}
                          </p>
                          <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                            <p>
                              Manager: <strong className="text-slate-800">{project.managerName || "Unassigned"}</strong>
                            </p>
                            <p>
                              Lead: <strong className="text-slate-800">{project.leadName || "Unassigned"}</strong>
                            </p>
                            <p>
                              Timeline: {project.startDate || "N/A"} → {project.targetDate || "N/A"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100">
                          <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                            <span>Progress</span>
                            <span>{project.progressPercent || 0}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-3">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                              style={{ width: `${project.progressPercent || 0}%` }}
                            />
                          </div>
                          <button
                            onClick={() => {
                              setFilterProject(String(project.id));
                              setCurrentView("all-tasks");
                            }}
                            className="w-full text-center py-2 bg-slate-50 hover:bg-emerald-50 text-emerald-800 font-bold text-xs rounded-lg transition"
                          >
                            View All Project Tasks ({project.taskCount || 0})
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 5: DEDICATED TEAM MANAGEMENT MODULE ----------------- */}
              {currentView === "team-management" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Team Management
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Structured governance for Admin, Team Leads / Managers, and Individual Contributors
                      </p>
                    </div>

                    {canManageUsers && (
                      <button
                        onClick={openCreateProfile}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm self-start sm:self-auto"
                      >
                        <UserPlus className="w-4 h-4" />
                        Create Profile
                      </button>
                    )}
                  </div>

                  {/* Role filter */}
                  <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-500 uppercase ml-1">Filter Hierarchy:</span>
                    <select
                      value={filterRole}
                      onChange={(e) => setFilterRole(e.target.value)}
                      className="text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none font-semibold text-slate-700"
                    >
                      <option value="All">All Tiers (Admin, Managers, Employees)</option>
                      <option value="Admin">Admin (Organization-wide)</option>
                      <option value="Manager">Team Leads & Managers (Shivam, Animesh)</option>
                      <option value="Individual">Employees / Individuals (Sakshi, Vaibhav, Suraj)</option>
                    </select>
                  </div>

                  {/* 1. ADMIN TIER */}
                  {(filterRole === "All" || filterRole === "Admin") && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                            <ShieldAlert className="w-4 h-4" />
                          </div>
                          <div>
                            <h2 className="font-extrabold text-base text-slate-900">Admin</h2>
                            <p className="text-xs text-slate-500">Organization-wide management and oversight (unnamed role)</p>
                          </div>
                        </div>
                        <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {adminUsers.length} Admin Account
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {adminUsers.map((admin) => (
                          <div key={admin.id} className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/20 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-200 text-emerald-900 font-bold flex items-center justify-center text-sm">
                                AD
                              </div>
                              <div>
                                <p className="font-bold text-sm text-slate-900">{admin.name}</p>
                                <p className="text-xs text-slate-500">{admin.designation} • {admin.email}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleSwitchUser(admin.id)}
                              className="text-xs text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200 font-bold px-3 py-1.5 rounded-lg transition"
                            >
                              Login as Admin
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. TEAM LEADS / MANAGERS TIER */}
                  {(filterRole === "All" || filterRole === "Manager") && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <h2 className="font-extrabold text-base text-slate-900">Team Leads / Managers</h2>
                            <p className="text-xs text-slate-500">Supervise technical execution, assign tasks, review deliverables, and report status</p>
                          </div>
                        </div>
                        <span className="badge bg-teal-50 text-teal-800 border border-teal-200">
                          {teamLeadsManagers.length} Leads & Managers
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {teamLeadsManagers.map((lead) => {
                          const leadTasks = tasksList.filter((t) => t.assignedToUserId === lead.id || t.assignedByUserId === lead.id);
                          const activeCount = leadTasks.filter((t) => t.status === "In Progress" || t.status === "To Do").length;
                          return (
                            <div key={lead.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-sm">
                                    {initials(lead.name)}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-slate-900">{lead.name}</p>
                                    <p className="text-xs text-slate-500">{lead.designation}</p>
                                  </div>
                                </div>
                                <span className="badge bg-teal-50 text-teal-800 font-bold">
                                  {lead.role}
                                </span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-white rounded-lg border border-slate-100">
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Managed Tasks</p>
                                  <p className="font-bold text-slate-800 mt-0.5">{leadTasks.length}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Active</p>
                                  <p className="font-bold text-emerald-600 mt-0.5">{activeCount}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Team</p>
                                  <p className="font-bold text-slate-700 mt-0.5">{lead.teamName || "Core Systems"}</p>
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => handleSwitchUser(lead.id)}
                                  className="text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 font-bold px-3 py-1.5 rounded-lg transition"
                                >
                                  Act as {lead.name}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 3. EMPLOYEES / INDIVIDUAL CONTRIBUTORS TIER */}
                  {(filterRole === "All" || filterRole === "Individual") && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <h2 className="font-extrabold text-base text-slate-900">Employees / Interns / Individual Contributors</h2>
                            <p className="text-xs text-slate-500">Receive assignments, update task progress, submit deliverables, and report blockers</p>
                          </div>
                        </div>
                        <span className="badge bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {individualContributors.length} Contributors
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {individualContributors.map((ic) => {
                          const icTasks = tasksList.filter((t) => t.assignedToUserId === ic.id);
                          const completed = icTasks.filter((t) => t.status === "Completed").length;
                          const active = icTasks.filter((t) => t.status === "In Progress" || t.status === "To Do").length;
                          return (
                            <div key={ic.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                                    {initials(ic.name)}
                                  </div>
                                  <div>
                                    <p className="font-bold text-sm text-slate-900">{ic.name}</p>
                                    <p className="text-[11px] text-slate-500">{ic.designation}</p>
                                  </div>
                                </div>
                                <span className="badge bg-slate-100 text-slate-700">
                                  Member
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-center text-xs py-2 bg-white rounded-lg border border-slate-100">
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Active Tasks</p>
                                  <p className="font-bold text-emerald-600 mt-0.5">{active}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase">Completed</p>
                                  <p className="font-bold text-slate-800 mt-0.5">{completed}</p>
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-1">
                                <button
                                  onClick={() => handleSwitchUser(ic.id)}
                                  className="w-full text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 font-bold py-1.5 rounded-lg transition"
                                >
                                  Switch to {ic.name}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ----------------- VIEW 6: TEAM WORKLOAD & CAPACITY ----------------- */}
              {currentView === "workload" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Team Workload
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Track estimated versus actual hours, active task distribution, and identify overloaded members
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {workloadData.map((member) => {
                      const isOverloaded = member.totalEstimatedHours > 40 || member.blockedTasks > 0;
                      return (
                        <div
                          key={member.userId}
                          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                                  {initials(member.name)}
                                </div>
                                <div>
                                  <h3 className="font-bold text-sm text-slate-900">{member.name}</h3>
                                  <p className="text-[11px] text-slate-500">{member.designation}</p>
                                </div>
                              </div>
                              <span className={`badge ${roleBadgeStyles[member.role].bg} text-[10px]`}>
                                {member.role}
                              </span>
                            </div>

                            {isOverloaded && (
                              <div className="mb-3 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center gap-2 text-amber-800 text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>High workload / active blocker detected</span>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 my-3 text-center">
                              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                <p className="text-slate-500 text-[10px] font-bold uppercase">Active Tasks</p>
                                <p className="text-lg font-black text-slate-900 font-display">
                                  {member.inProgressTasks + member.toDoTasks}
                                </p>
                              </div>
                              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                <p className="text-slate-500 text-[10px] font-bold uppercase">Estimated Hrs</p>
                                <p className="text-lg font-black text-emerald-700 font-display">
                                  {member.totalEstimatedHours}h
                                </p>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-600 mt-2">
                              <div className="flex justify-between">
                                <span>In Progress:</span>
                                <strong className="text-emerald-700">{member.inProgressTasks}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>In Review:</span>
                                <strong className="text-teal-700">{member.inReviewTasks}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>Blocked Tasks:</span>
                                <strong className="text-rose-700">{member.blockedTasks}</strong>
                              </div>
                              <div className="flex justify-between">
                                <span>Completed Tasks:</span>
                                <strong className="text-emerald-700">{member.completedTasks}</strong>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => {
                                setFilterAssignee(String(member.userId));
                                setCurrentView("all-tasks");
                              }}
                              className="w-full py-2 bg-slate-50 hover:bg-emerald-50 text-emerald-800 font-bold text-xs rounded-lg transition"
                            >
                              Inspect Member Assignments
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 7: DAILY PROGRESS REPORTS ----------------- */}
              {currentView === "daily-reports" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Daily Reports
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Daily accomplishments, plans for next day, and blockers across technical personnel
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        className="bg-white border border-slate-200 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-700 outline-none"
                      />
                      <button
                        onClick={() => {
                          setDailyReportFormData({
                            employeeName: currentUser?.name || "",
                            completedToday: "",
                            plansNext: "",
                            blockers: "",
                            projectId: projectsList[0]?.id || 0,
                            taskId: tasksList[0]?.id || 0,
                          });
                          setIsDailyReportModalOpen(true);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                        Submit Report
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {dailyReports.length === 0 ? (
                      <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                        <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="font-semibold text-sm">No daily reports recorded for {reportDate}.</p>
                        <p className="text-xs mt-1">Be the first to submit a report for today.</p>
                      </div>
                    ) : (
                      dailyReports.map((report) => (
                        <div
                          key={report.id}
                          className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-3"
                        >
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                                {initials(report.employeeName)}
                              </div>
                              <div>
                                <h3 className="font-bold text-sm text-slate-900">{report.employeeName}</h3>
                                <p className="text-[11px] text-slate-400">{report.reportDate}</p>
                              </div>
                            </div>
                            {report.projectName && (
                              <span className="badge bg-emerald-50 text-emerald-700 font-medium">
                                {report.projectName}
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 text-xs">
                            <div>
                              <p className="font-bold text-slate-700 uppercase text-[10px]">Completed Today:</p>
                              <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg mt-1 whitespace-pre-wrap">
                                {report.completedToday}
                              </p>
                            </div>

                            {report.plansNext && (
                              <div>
                                <p className="font-bold text-slate-700 uppercase text-[10px]">Plans For Next Day:</p>
                                <p className="text-slate-800 bg-slate-50 p-2.5 rounded-lg mt-1 whitespace-pre-wrap">
                                  {report.plansNext}
                                </p>
                              </div>
                            )}

                            {report.blockers && (
                              <div>
                                <p className="font-bold text-rose-700 uppercase text-[10px]">Reported Blockers:</p>
                                <p className="text-rose-900 bg-rose-50 border border-rose-100 p-2.5 rounded-lg mt-1 whitespace-pre-wrap">
                                  {report.blockers}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 8: CALENDAR ----------------- */}
              {currentView === "calendar" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div>
                    <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                      Calendar & Deadlines
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Schedule overview of upcoming deliverables and task target dates
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {tasksList
                        .filter((t) => t.dueDate)
                        .sort((a, b) => (a.dueDate! > b.dueDate! ? 1 : -1))
                        .map((task) => (
                          <div
                            key={task.id}
                            onClick={() => setSelectedTaskId(task.id)}
                            className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-emerald-50/30 transition cursor-pointer"
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono font-bold text-emerald-700">{task.taskCode}</span>
                              <span className="font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                {task.dueDate}
                              </span>
                            </div>
                            <h3 className="font-bold text-sm text-slate-900 truncate mt-1">{task.title}</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Owner: {task.assignedToName}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 9: ANALYTICS ----------------- */}
              {currentView === "analytics" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div>
                    <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                      Analytics & Telemetry
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Real-time database metrics, completion ratios, and task distribution
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase">Total Projects</p>
                      <p className="text-3xl font-black text-slate-900 mt-1 font-display">{metrics?.totalProjects}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase">Active Engineers</p>
                      <p className="text-3xl font-black text-emerald-600 mt-1 font-display">{metrics?.totalUsers}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase">Completed Work</p>
                      <p className="text-3xl font-black text-emerald-600 mt-1 font-display">{metrics?.completedTasks}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase">Overdue Tasks</p>
                      <p className="text-3xl font-black text-rose-600 mt-1 font-display">{metrics?.overdueTasks}</p>
                    </div>
                  </div>

                  {/* Status Breakdown */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200">
                    <h3 className="font-bold text-base text-slate-900 mb-4">Task Status Breakdown</h3>
                    <div className="space-y-3">
                      {taskStatusOptions.map((status) => {
                        const count = tasksList.filter((t) => t.status === status).length;
                        const percent = tasksList.length > 0 ? Math.round((count / tasksList.length) * 100) : 0;
                        return (
                          <div key={status}>
                            <div className="flex justify-between text-xs font-bold mb-1">
                              <span>{status}</span>
                              <span>
                                {count} tasks ({percent}%)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  status === "Completed"
                                    ? "bg-emerald-500"
                                    : status === "Blocked"
                                    ? "bg-rose-500"
                                    : status === "In Review"
                                    ? "bg-teal-500"
                                    : "bg-emerald-400"
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 10: PROJECT ALLOTMENTS ----------------- */}
              {currentView === "allotments" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                        Project Allotments
                      </h1>
                      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                        Technical project assignments with assistance contacts and repository linkages
                      </p>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">S.No</th>
                          <th className="py-3 px-4">Employee</th>
                          <th className="py-3 px-4">Project</th>
                          <th className="py-3 px-4">Task Assigned</th>
                          <th className="py-3 px-4">Assistance Contacts</th>
                          <th className="py-3 px-4">Progress</th>
                          <th className="py-3 px-4">Repository</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allotments.map((allotment) => (
                          <tr key={allotment.id} className="hover:bg-slate-50 transition">
                            <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                              #{allotment.serialNumber}
                            </td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{allotment.employeeName}</td>
                            <td className="py-3.5 px-4 text-slate-700 font-semibold">{allotment.project}</td>
                            <td className="py-3.5 px-4 max-w-xs">{allotment.taskAssigned}</td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap gap-1">
                                {allotment.assistanceBy.map((p, idx) => (
                                  <span key={idx} className="bg-slate-100 text-slate-700 text-[10px] px-2 py-0.5 rounded font-medium">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="badge bg-emerald-50 text-emerald-700 font-semibold">
                                {allotment.progress}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {allotment.repositoryUrl ? (
                                <a
                                  href={allotment.repositoryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-emerald-700 hover:underline flex items-center gap-1 font-bold"
                                >
                                  <Link className="w-3 h-3" /> Repo Link
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 11: SYSTEM WORKFLOWS ----------------- */}
              {currentView === "workflows" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div>
                    <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                      Dectrocel Workflows
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Visual flowcharts documenting role authorization, task lifecycles, and approval pipelines
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
                      <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                        <Workflow className="w-4 h-4 text-emerald-600" />
                        1. Task Lifecycle & Approval Workflow
                      </h3>
                      <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto">
                        <pre>{`[Backlog / Unscheduled]
         ↓
    [To Do (Ready)]
         ↓
  [In Progress (Working)] ←── Changes Requested
         ↓                           │
 [In Review (Submitted)]             │
         ↓                           │
 [Reviewer Review] ──────────────────┘
         ↓ (Approved)
   [Completed]`}</pre>
                      </div>
                      <p className="text-xs text-slate-600">
                        Individual team members submit deliverables with repository links. Assigned reviewers or managers evaluate acceptance criteria before final signoff.
                      </p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-3">
                      <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-emerald-600" />
                        2. Role Hierarchy & Assignment Matrix
                      </h3>
                      <div className="bg-slate-900 text-emerald-300 p-4 rounded-xl font-mono text-xs overflow-x-auto">
                        <pre>{`Admin (Organization-Wide)
  ├── Governance, Team Config & Permissions
  └── System-Level Oversight

Team Leads / Managers (Shivam, Animesh)
  ├── Defines Objectives, Creates & Assigns Tasks
  ├── Monitors Deadlines, Capacity & Workload
  └── Reviews Deliverables & Reports Status

Employees / Contributors (Sakshi, Vaibhav, Suraj)
  ├── Acknowledges Tasks & Starts Work
  ├── Updates Status, Records Blockers
  └── Submits Deliverables & Daily Reports`}</pre>
                      </div>
                      <p className="text-xs text-slate-600">
                        Server-side authorization enforces that only authorized personas can assign work, adjust ownership, or bypass review stages.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- VIEW 12: SETTINGS ----------------- */}
              {currentView === "settings" && (
                <div className="space-y-6 max-w-7xl mx-auto">
                  <div>
                    <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight">
                      Settings & Configuration
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      System settings, theme configuration, and portal telemetry
                    </p>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                    <h3 className="font-bold text-sm text-slate-800">Application Identity</h3>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-500">Platform Name:</span>
                        <p className="font-bold text-slate-900 mt-0.5">Dectrocel Healthcare and Research</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Visual Palette:</span>
                        <p className="font-bold text-emerald-700 mt-0.5">Emerald Green & Clean White</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Database Engine:</span>
                        <p className="font-bold text-slate-900 mt-0.5">PostgreSQL 18</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Active Persona:</span>
                        <p className="font-bold text-slate-900 mt-0.5">{currentUser?.name} ({currentUser?.role})</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ----------------- MODAL: TASK DETAIL & ACTIONS SIDE PANEL ----------------- */}
      {selectedTaskId && selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/40">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-md">
                  {selectedTask.taskCode}
                </span>
                <span className={`badge ${statusBadgeStyles[selectedTask.status].bg} ${statusBadgeStyles[selectedTask.status].text}`}>
                  {selectedTask.status}
                </span>
                <span className={`badge ${priorityBadgeStyles[selectedTask.priority].bg}`}>
                  {selectedTask.priority}
                </span>
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs sm:text-sm">
              <div>
                <h2 className="text-lg font-black text-slate-900 font-display">{selectedTask.title}</h2>
                <p className="text-slate-600 mt-2 whitespace-pre-wrap leading-relaxed">
                  {selectedTask.description || "No detailed description."}
                </p>
              </div>

              {/* Action Buttons Toolbar */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <p className="font-bold text-slate-700 text-xs uppercase">Workflow Actions</p>
                <div className="flex flex-wrap gap-2">
                  {!selectedTask.acknowledgedAt && selectedTask.assignedToUserId === currentUser?.id && (
                    <button
                      onClick={() => handleAcknowledge(selectedTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" /> Acknowledge Assignment
                    </button>
                  )}

                  {selectedTask.status === "To Do" && (
                    <button
                      onClick={() => handleStatusTransition(selectedTask.id, "In Progress")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                      Start Working (In Progress)
                    </button>
                  )}

                  {selectedTask.status === "In Progress" && (
                    <button
                      onClick={() => handleStatusTransition(selectedTask.id, "In Review")}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" /> Submit for Review
                    </button>
                  )}

                  {selectedTask.status === "In Review" && (canAssignTasks || selectedTask.reviewerUserId === currentUser?.id) && (
                    <button
                      onClick={() => setIsReviewModalOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                    >
                      <FileCheck className="w-3.5 h-3.5" /> Conduct Review (Approve/Reject)
                    </button>
                  )}

                  {selectedTask.status !== "Blocked" && (
                    <button
                      onClick={() => {
                        setBlockerReasonText("");
                        setIsBlockerModalOpen(true);
                      }}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                    >
                      <AlertOctagon className="w-3.5 h-3.5" /> Report Blocker
                    </button>
                  )}

                  {canAssignTasks && (
                    <button
                      onClick={() => {
                        setReassignUserId(usersList[0]?.id || 0);
                        setReassignReason("");
                        setIsReassignModalOpen(true);
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                      Reassign Owner
                    </button>
                  )}
                </div>
              </div>

              {/* Core Attributes Grid */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 text-xs">
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Project</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedTask.projectName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Assigned By</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedTask.assignedByName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Primary Assignee</p>
                  <p className="font-bold text-emerald-800 mt-0.5">{selectedTask.assignedToName}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Reviewer</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedTask.reviewerName || "Not assigned"}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Due Date</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedTask.dueDate || "N/A"}</p>
                </div>
                <div>
                  <p className="text-slate-400 font-semibold uppercase text-[10px]">Estimated Effort</p>
                  <p className="font-bold text-slate-800 mt-0.5">{selectedTask.estimatedHours} Hours</p>
                </div>
              </div>

              {/* Acceptance Criteria */}
              {selectedTask.acceptanceCriteria && (
                <div className="space-y-1.5">
                  <p className="font-bold text-slate-800 text-xs uppercase">Acceptance Criteria</p>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 whitespace-pre-wrap text-slate-700">
                    {selectedTask.acceptanceCriteria}
                  </div>
                </div>
              )}

              {/* Subtasks Checklist */}
              <div className="space-y-2">
                <p className="font-bold text-slate-800 text-xs uppercase">Subtasks & Milestones</p>
                <div className="space-y-1.5">
                  {selectedTask.subtasks?.map((sub) => (
                    <div
                      key={sub.id}
                      onClick={() => handleToggleSubtask(sub.id, sub.isCompleted)}
                      className="flex items-center gap-2.5 p-2 bg-slate-50 hover:bg-emerald-50/40 rounded-lg cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={sub.isCompleted}
                        onChange={() => {}}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                      />
                      <span className={`text-xs ${sub.isCompleted ? "line-through text-slate-400" : "text-slate-800 font-medium"}`}>
                        {sub.title}
                      </span>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddSubtask} className="flex gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add a new subtask..."
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg font-bold">
                    Add
                  </button>
                </form>
              </div>

              {/* Comments & Collaboration */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <p className="font-bold text-slate-800 text-xs uppercase flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Comments & Discussions
                </p>

                <div className="space-y-2.5 max-h-48 overflow-y-auto">
                  {taskComments.length === 0 ? (
                    <p className="text-xs text-slate-400">No comments yet. Start the conversation below.</p>
                  ) : (
                    taskComments.map((c) => (
                      <div key={c.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-900">{c.userName}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(c.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700">{c.comment}</p>
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type an update or comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                  />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg">
                    Post
                  </button>
                </form>
              </div>

              {/* Activity Timeline */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <p className="font-bold text-slate-800 text-xs uppercase flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" /> Activity History
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto text-xs">
                  {taskActivities.map((act) => (
                    <div key={act.id} className="text-slate-600 border-l-2 border-emerald-500 pl-2 py-0.5">
                      <p>
                        <strong className="text-slate-800">{act.actorName}</strong>: {act.action}
                        {act.reason && <span className="text-slate-500"> ({act.reason})</span>}
                      </p>
                      <span className="text-[10px] text-slate-400">{new Date(act.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: CREATE / EDIT TASK ----------------- */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-black font-display text-slate-900">
                {editingTaskId ? "Edit Task Assignment" : "Create & Assign Task"}
              </h2>
              <button onClick={() => setIsTaskModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement DICOM streaming microservice"
                  value={taskFormData.title}
                  onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Project *</label>
                  <select
                    value={taskFormData.projectId}
                    onChange={(e) => setTaskFormData({ ...taskFormData, projectId: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-white font-medium"
                  >
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Assignee (Employee) *</label>
                  <select
                    value={taskFormData.assignedToUserId}
                    onChange={(e) => setTaskFormData({ ...taskFormData, assignedToUserId: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-white font-medium"
                  >
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reviewer</label>
                  <select
                    value={taskFormData.reviewerUserId || ""}
                    onChange={(e) =>
                      setTaskFormData({
                        ...taskFormData,
                        reviewerUserId: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-white font-medium"
                  >
                    <option value="">No Reviewer Required</option>
                    {usersList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={taskFormData.priority}
                    onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value as TaskPriority })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none bg-white font-medium"
                  >
                    {taskPriorityOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Provide detailed technical instructions, deliverables, and context..."
                  value={taskFormData.description}
                  onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Acceptance Criteria</label>
                <textarea
                  rows={2}
                  placeholder="1. Code reviewed & merged\n2. Deployed to staging\n3. Acceptance test verified"
                  value={taskFormData.acceptanceCriteria}
                  onChange={(e) => setTaskFormData({ ...taskFormData, acceptanceCriteria: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={taskFormData.dueDate}
                    onChange={(e) => setTaskFormData({ ...taskFormData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Estimated Effort (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={taskFormData.estimatedHours}
                    onChange={(e) => setTaskFormData({ ...taskFormData, estimatedHours: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 font-bold rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                >
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: REASSIGN TASK ----------------- */}
      {isReassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Reassign Task Ownership</h3>
            <form onSubmit={handleReassignSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select New Owner</label>
                <select
                  value={reassignUserId}
                  onChange={(e) => setReassignUserId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Reassignment *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Workload rebalancing, domain expertise handover..."
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg">
                  Confirm Reassign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: CONDUCT REVIEW ----------------- */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Review Deliverable Submission</h3>
            <form onSubmit={handleReviewSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Decision</label>
                <select
                  value={reviewDecision}
                  onChange={(e) => setReviewDecision(e.target.value as ReviewDecision)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-bold"
                >
                  <option value="Approved">Approved (Mark as Completed)</option>
                  <option value="Changes Requested">Changes Requested (Return to In Progress)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reviewer Feedback & Notes</label>
                <textarea
                  rows={3}
                  placeholder="Detail testing results, verified acceptance criteria, or requested revisions..."
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 text-white font-bold rounded-lg ${
                    reviewDecision === "Approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                  }`}
                >
                  Submit Decision
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: REPORT BLOCKER ----------------- */}
      {isBlockerModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-rose-700 font-display flex items-center gap-2">
              <AlertOctagon className="w-5 h-5" /> Report Blocker & Escalate
            </h3>
            <form onSubmit={handleBlockerSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Blocker Description *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe dependency blocker, staging cluster failure, API access impediment..."
                  value={blockerReasonText}
                  onChange={(e) => setBlockerReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-rose-200 bg-rose-50/50 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBlockerModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg">
                  Escalate Blocker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: CREATE PROJECT ----------------- */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Create Project</h3>
            <form onSubmit={handleCreateProjectSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Common PACS Portal"
                  value={projectFormData.name}
                  onChange={(e) => setProjectFormData({ ...projectFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Project Code (Short ID) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PAC"
                  value={projectFormData.code}
                  onChange={(e) => setProjectFormData({ ...projectFormData, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Technical Lead</label>
                <select
                  value={projectFormData.leadId}
                  onChange={(e) => setProjectFormData({ ...projectFormData, leadId: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="0">Select Lead</option>
                  {usersList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Project scope and deliverables..."
                  value={projectFormData.description}
                  onChange={(e) => setProjectFormData({ ...projectFormData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsProjectModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg">
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: SUBMIT DAILY REPORT ----------------- */}
      {isDailyReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Daily Progress Report Submission</h3>
            <form onSubmit={handleSaveDailyReport} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Employee Name *</label>
                <input
                  type="text"
                  required
                  value={dailyReportFormData.employeeName}
                  onChange={(e) => setDailyReportFormData({ ...dailyReportFormData, employeeName: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Completed Today *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detail work done today, PRs merged, bugs resolved..."
                  value={dailyReportFormData.completedToday}
                  onChange={(e) => setDailyReportFormData({ ...dailyReportFormData, completedToday: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Plans For Next Working Day</label>
                <textarea
                  rows={2}
                  placeholder="Upcoming tasks and focus items..."
                  value={dailyReportFormData.plansNext}
                  onChange={(e) => setDailyReportFormData({ ...dailyReportFormData, plansNext: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Blockers (If Any)</label>
                <textarea
                  rows={2}
                  placeholder="Dependencies, awaiting review, staging issues..."
                  value={dailyReportFormData.blockers}
                  onChange={(e) => setDailyReportFormData({ ...dailyReportFormData, blockers: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDailyReportModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg">
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- MODAL: CREATE EMPLOYEE PROFILE ----------------- */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 font-display">Create Employee Profile</h3>
            <form onSubmit={handleCreateUserSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={userFormData.name}
                  onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Corporate Email *</label>
                <input
                  type="email"
                  required
                  placeholder="rahul@taskmanager.internal"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role *</label>
                  {role === "Admin" ? (
                    <select
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-bold"
                    >
                      <option value="Admin">Admin</option>
                      <option value="Manager">Manager</option>
                      <option value="Team Lead">Team Lead</option>
                      <option value="Individual">Individual Member</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value="Individual Member"
                      readOnly
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 font-bold"
                    />
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={userFormData.designation}
                    onChange={(e) => setUserFormData({ ...userFormData, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg">
                  Create Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
