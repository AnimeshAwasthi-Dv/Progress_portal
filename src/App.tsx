import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Link2,
  Menu,
  Plus,
  Search,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import {
  createProjectAllotment,
  getDailyProgressReports,
  getProjectAllotments,
  saveDailyProgressReport,
  taskProgressOptions,
  type DailyProgressReport,
  type ProjectAllotment,
  type TaskProgress,
  updateProjectAllotmentProgress,
  updateProjectAllotmentRepository,
} from "./api";

const avatarColors = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
];

const progressStyles: Record<TaskProgress, string> = {
  "Not Started": "bg-slate-100 text-slate-600",
  "In Progress": "bg-blue-50 text-blue-700",
  Blocked: "bg-rose-50 text-rose-700",
  Completed: "bg-emerald-50 text-emerald-700",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-[154px] appearance-none rounded-lg border border-slate-200 bg-white pl-3.5 pr-9 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function App() {
  const [allotments, setAllotments] = useState<ProjectAllotment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [updatingProgressId, setUpdatingProgressId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("All Employees");
  const [projectFilter, setProjectFilter] = useState("All Projects");
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [reportDate, setReportDate] = useState(localDateString);
  const [dailyReports, setDailyReports] = useState<DailyProgressReport[]>([]);
  const [reportError, setReportError] = useState("");
  const [reportLoadError, setReportLoadError] = useState("");
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isReportEditorOpen, setIsReportEditorOpen] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [repositoryEditor, setRepositoryEditor] = useState<{
    allotment: ProjectAllotment;
    url: string;
  } | null>(null);
  const [repositoryError, setRepositoryError] = useState("");
  const [isSavingRepository, setIsSavingRepository] = useState(false);
  const [reportForm, setReportForm] = useState({
    employeeName: "",
    completedToday: "",
    plansNext: "",
    blockers: "",
  });
  const [newTeamMemberName, setNewTeamMemberName] = useState("");
  const [taskForm, setTaskForm] = useState({
    employeeNames: [] as string[],
    project: "",
    taskAssigned: "",
    assignedBy: "",
    progress: "Not Started" as TaskProgress,
    repositoryUrl: "",
  });

  useEffect(() => {
    let isActive = true;

    getProjectAllotments()
      .then((records) => {
        if (isActive) setAllotments(records);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load project allotments.",
          );
        }
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsLoadingReports(true);
    setDailyReports([]);
    setReportLoadError("");

    getDailyProgressReports(reportDate)
      .then((reports) => {
        if (isActive) setDailyReports(reports);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setReportLoadError(
            error instanceof Error ? error.message : "Could not load daily progress reports.",
          );
        }
      })
      .finally(() => {
        if (isActive) setIsLoadingReports(false);
      });

    return () => {
      isActive = false;
    };
  }, [reportDate]);

  const employees = useMemo(
    () => [...new Set(allotments.map((allotment) => allotment.employeeName))],
    [allotments],
  );
  const projects = useMemo(
    () => [...new Set(allotments.map((allotment) => allotment.project))].sort(),
    [allotments],
  );
  const filteredAllotments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allotments.filter((allotment) => {
      const matchesSearch =
        !query ||
        [
          allotment.employeeName,
          allotment.project,
          allotment.taskAssigned,
          allotment.assignedBy,
          allotment.progress,
          allotment.repositoryUrl ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesEmployee =
        employeeFilter === "All Employees" || allotment.employeeName === employeeFilter;
      const matchesProject =
        projectFilter === "All Projects" || allotment.project === projectFilter;
      return matchesSearch && matchesEmployee && matchesProject;
    });
  }, [allotments, employeeFilter, projectFilter, search]);

  const employeeAssignments = selectedEmployee
    ? allotments.filter((allotment) => allotment.employeeName === selectedEmployee)
    : [];

  const openAddTask = () => {
    setTaskForm({
      employeeNames: [],
      project: "",
      taskAssigned: "",
      assignedBy: "",
      progress: "Not Started",
      repositoryUrl: "",
    });
    setNewTeamMemberName("");
    setTaskError("");
    setIsAddTaskOpen(true);
  };

  const openReportEditor = (employeeName: string) => {
    const existing = dailyReports.find((report) => report.employeeName === employeeName);
    setReportForm({
      employeeName,
      completedToday: existing?.completedToday ?? "",
      plansNext: existing?.plansNext ?? "",
      blockers: existing?.blockers ?? "",
    });
    setReportError("");
    setIsReportEditorOpen(true);
  };

  const handleSaveReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReportError("");
    setIsSavingReport(true);
    try {
      const saved = await saveDailyProgressReport({
        ...reportForm,
        reportDate,
      });
      setDailyReports((current) => [
        ...current.filter((report) => report.employeeName !== saved.employeeName),
        saved,
      ].sort((left, right) => left.employeeName.localeCompare(right.employeeName)));
      setIsReportEditorOpen(false);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : "Could not save this daily report.");
    } finally {
      setIsSavingReport(false);
    }
  };

  const openRepositoryEditor = (allotment: ProjectAllotment) => {
    setRepositoryEditor({ allotment, url: allotment.repositoryUrl ?? "" });
    setRepositoryError("");
  };

  const handleSaveRepository = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repositoryEditor) return;
    setRepositoryError("");
    setIsSavingRepository(true);
    try {
      const updated = await updateProjectAllotmentRepository(
        repositoryEditor.allotment.id,
        repositoryEditor.url.trim(),
      );
      setAllotments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setRepositoryEditor(null);
    } catch (error) {
      setRepositoryError(
        error instanceof Error ? error.message : "Could not save this repository link.",
      );
    } finally {
      setIsSavingRepository(false);
    }
  };

  const toggleTaskAssignee = (employeeName: string) => {
    setTaskForm((current) => ({
      ...current,
      employeeNames: current.employeeNames.includes(employeeName)
        ? current.employeeNames.filter((name) => name !== employeeName)
        : [...current.employeeNames, employeeName],
    }));
  };

  const addTeamMemberName = () => {
    const name = newTeamMemberName.trim();
    if (!name) return;
    setTaskForm((current) => ({
      ...current,
      employeeNames: current.employeeNames.some(
        (employeeName) => employeeName.toLowerCase() === name.toLowerCase(),
      )
        ? current.employeeNames
        : [...current.employeeNames, name],
    }));
    setNewTeamMemberName("");
  };

  const handleProgressChange = async (allotment: ProjectAllotment, progress: TaskProgress) => {
    setProgressError("");
    setUpdatingProgressId(allotment.id);

    try {
      const updated = await updateProjectAllotmentProgress(allotment.id, progress);
      setAllotments((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (error) {
      setProgressError(
        error instanceof Error ? error.message : "Could not update task progress.",
      );
    } finally {
      setUpdatingProgressId(null);
    }
  };

  const handleAddTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTaskError("");
    setIsSavingTask(true);

    try {
      const created = await createProjectAllotment({
        employeeNames: taskForm.employeeNames,
        project: taskForm.project.trim(),
        taskAssigned: taskForm.taskAssigned.trim(),
        assignedBy: taskForm.assignedBy.trim(),
        progress: taskForm.progress,
        repositoryUrl: taskForm.repositoryUrl.trim(),
      });
      setAllotments((current) => [...current, ...created]);
      setIsAddTaskOpen(false);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "Could not assign this task.");
    } finally {
      setIsSavingTask(false);
    }
  };

  const stats = [
    {
      label: "Team Members",
      value: employees.length,
      note: "On the technical team",
      icon: UsersRound,
      accent: "bg-blue-50 text-blue-600",
    },
    {
      label: "Projects",
      value: projects.length,
      note: "Technical projects",
      icon: BriefcaseBusiness,
      accent: "bg-violet-50 text-violet-600",
    },
    {
      label: "Task Assignments",
      value: allotments.length,
      note: "Across the technical team",
      icon: ClipboardList,
      accent: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Completed Tasks",
      value: allotments.filter((allotment) => allotment.progress === "Completed").length,
      note: "Marked as completed",
      icon: ClipboardList,
      accent: "bg-amber-50 text-amber-600",
    },
  ];

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div id="dashboard" className="min-h-screen bg-[#f8fafc] text-slate-800">
      {isMobileMenuOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:translate-x-0 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex h-[76px] items-center gap-3 border-b border-slate-100 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <UsersRound className="h-[18px] w-[18px]" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-[13px] font-extrabold tracking-tight text-slate-900">
              WHO IS DOING WHAT
            </p>
            <p className="mt-1 text-[11px] text-slate-400">Technical team</p>
          </div>
          <button
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
            onClick={closeMobileMenu}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6" aria-label="Main navigation">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">
            Workspace
          </p>
          <button
            onClick={() => {
              closeMobileMenu();
              document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex w-full items-center gap-3 rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700"
          >
            <LayoutDashboard className="h-[18px] w-[18px]" />
            Dashboard
          </button>
          <button
            onClick={() => {
              closeMobileMenu();
              document.getElementById("team")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <UsersRound className="h-[18px] w-[18px]" />
            Team
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {isLoading ? "…" : employees.length}
            </span>
          </button>
          <button
            onClick={() => {
              closeMobileMenu();
              document.getElementById("daily-reports")?.scrollIntoView({ behavior: "smooth" });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <FileSpreadsheet className="h-[18px] w-[18px]" />
            Daily Reports
          </button>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800">
            <Settings className="h-[18px] w-[18px]" />
            Settings
          </button>
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
              TM
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-700">Technical Team</p>
              <p className="mt-0.5 text-[11px] text-slate-400">Project overview</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open navigation menu"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm text-slate-400">
              Workspace <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-700">Technical Dashboard</span>
            </div>
          </div>
          <button
            onClick={openAddTask}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 sm:px-4"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-8 sm:px-8 sm:pt-10 lg:px-10">
          {loadError && (
            <div
              role="alert"
              className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>Could not load project allotments: {loadError}</span>
              <button
                onClick={() => window.location.reload()}
                className="shrink-0 self-start font-semibold underline underline-offset-2 sm:self-auto"
              >
                Retry connection
              </button>
            </div>
          )}
          {progressError && (
            <div
              role="alert"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              <span>Could not update task progress: {progressError}</span>
              <button
                onClick={() => setProgressError("")}
                className="rounded p-1 font-semibold hover:bg-rose-100"
                aria-label="Dismiss progress update error"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <section className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                TECHNICAL TEAM
              </div>
              <h1 className="font-display text-[27px] font-bold tracking-[-0.04em] text-slate-900 sm:text-[32px]">
                Who Is Doing What?
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                See who is assigned to each technical project and task.
              </p>
            </div>
            <div className="relative w-full xl:max-w-[340px]">
              <Search className="absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                aria-label="Search employee, project, or task"
                placeholder="Search employee, project, or task..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </section>

          <section
            className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
            aria-label="Technical team statistics"
          >
            {stats.map(({ label, value, note, icon: Icon, accent }) => (
              <div
                key={label}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
                    <p className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
                      {isLoading ? "…" : value}
                    </p>
                  </div>
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                    <Icon className="h-[17px] w-[17px]" />
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-400">{note}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-lg border border-[#a8c7a0] bg-white shadow-[0_2px_8px_rgba(30,70,30,0.08)]">
            <div className="flex flex-col gap-4 border-b border-[#c5d8c1] bg-[#f5f9f4] px-5 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-[#217346]" />
                  <h2 className="font-display text-base font-bold tracking-tight text-slate-900">
                    Task worksheet
                  </h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">Technical Team · Project allotments</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-medium text-slate-500">Employee</span>
                <SelectField
                  label="Filter by employee"
                  value={employeeFilter}
                  onChange={setEmployeeFilter}
                  options={["All Employees", ...employees]}
                />
                <span className="ml-0 text-xs font-medium text-slate-500 sm:ml-2">Project</span>
                <SelectField
                  label="Filter by project"
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={["All Projects", ...projects]}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#f1f5f0] text-center text-[10px] font-semibold text-[#688064]">
                    {["A", "B", "C", "D", "E", "F", "G"].map((column) => (
                      <th key={column} className="border border-[#d7e1d4] px-2 py-1.5">
                        {column}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-slate-50/70 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                    <th className="w-24 border border-[#d7e1d4] bg-[#e9f1e7] px-6 py-3.5">Sr. No.</th>
                    <th className="w-48 border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Name</th>
                    <th className="w-[22%] border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Project</th>
                    <th className="border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Task Assigned</th>
                    <th className="border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Progress</th>
                    <th className="border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Assigned By</th>
                    <th className="border border-[#d7e1d4] bg-[#e9f1e7] px-5 py-3.5">Git Repository</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllotments.map((allotment) => (
                    <tr key={allotment.id} className="align-top transition hover:bg-[#f4f8f2]">
                      <td className="whitespace-nowrap border border-[#e0e8dd] bg-[#f6f8f5] px-6 py-4 text-sm text-slate-400">
                        {allotment.serialNumber}
                      </td>
                      <td className="whitespace-nowrap border border-[#e0e8dd] px-5 py-4">
                        <button
                          className="flex items-center gap-3 text-left"
                          onClick={() => setSelectedEmployee(allotment.employeeName)}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColors[employees.indexOf(allotment.employeeName) % avatarColors.length]}`}
                            aria-hidden="true"
                          >
                            {initials(allotment.employeeName)}
                          </span>
                          <span className="text-sm font-semibold text-slate-700 hover:text-blue-700">
                            {allotment.employeeName}
                          </span>
                        </button>
                      </td>
                      <td className="border border-[#e0e8dd] px-5 py-4 text-sm font-semibold leading-6 text-slate-700">
                        {allotment.project}
                      </td>
                      <td className="border border-[#e0e8dd] px-5 py-4 text-sm leading-6 text-slate-600">
                        {allotment.taskAssigned}
                      </td>
                      <td className="whitespace-nowrap border border-[#e0e8dd] px-5 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${progressStyles[allotment.progress]}`}
                          >
                            {allotment.progress}
                          </span>
                          <select
                            aria-label={`Update progress for ${allotment.employeeName}: ${allotment.taskAssigned}`}
                            value={allotment.progress}
                            disabled={updatingProgressId === allotment.id}
                            onChange={(event) =>
                              void handleProgressChange(
                                allotment,
                                event.target.value as TaskProgress,
                              )
                            }
                            className="max-w-[145px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
                          >
                            {taskProgressOptions.map((progress) => (
                              <option key={progress}>{progress}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="whitespace-nowrap border border-[#e0e8dd] px-5 py-4 text-sm text-slate-500">
                        {allotment.assignedBy}
                      </td>
                      <td className="border border-[#e0e8dd] px-5 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {allotment.repositoryUrl ? (
                            <a
                              href={allotment.repositoryUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-[190px] items-center gap-1.5 truncate font-medium text-[#217346] hover:underline"
                              title={allotment.repositoryUrl}
                            >
                              <Link2 className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{allotment.repositoryUrl}</span>
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                          <button
                            onClick={() => openRepositoryEditor(allotment)}
                            className="shrink-0 rounded px-1.5 py-1 text-[11px] font-semibold text-[#217346] hover:bg-[#edf5eb]"
                          >
                            {allotment.repositoryUrl ? "Edit" : "Add link"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                        Loading project allotments from PostgreSQL…
                      </td>
                    </tr>
                  )}
                  {!isLoading && filteredAllotments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        {loadError ? (
                          <p className="text-sm font-semibold text-slate-600">
                            Project allotment data is unavailable.
                          </p>
                        ) : (
                          <>
                            <Search className="mx-auto h-5 w-5 text-slate-300" />
                            <p className="mt-2 text-sm font-semibold text-slate-600">
                              No project allotments found
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              Try a different search or filter.
                            </p>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-[#d7e1d4] bg-[#f8faf7] px-5 py-3.5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <span>
                Showing{" "}
                <span className="font-semibold text-slate-600">
                  {isLoading ? "…" : filteredAllotments.length}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-600">
                  {isLoading ? "…" : allotments.length}
                </span>{" "}
                task assignments
              </span>
              <span>Department: Technical</span>
            </div>
          </section>

          <section id="daily-reports" className="scroll-mt-24 pt-9">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#217346]">
                  <FileSpreadsheet className="h-4 w-4" />
                  DAILY CHECK-IN
                </div>
                <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                  Daily progress reports
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  One update per team member for each day. Members can revise their own entry.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                Report date
                <input
                  type="date"
                  aria-label="Daily report date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-[#217346] focus:ring-4 focus:ring-emerald-100"
                />
              </label>
            </div>

            {reportLoadError && (
              <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                Could not load daily reports: {reportLoadError}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-[#a8c7a0] bg-white shadow-[0_2px_8px_rgba(30,70,30,0.06)]">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="bg-[#e9f1e7] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600">
                    <th className="border border-[#d7e1d4] px-4 py-3">Team member</th>
                    <th className="border border-[#d7e1d4] px-4 py-3">Completed today</th>
                    <th className="border border-[#d7e1d4] px-4 py-3">Next</th>
                    <th className="border border-[#d7e1d4] px-4 py-3">Blockers</th>
                    <th className="border border-[#d7e1d4] px-4 py-3">Report status</th>
                    <th className="border border-[#d7e1d4] px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => {
                    const report = dailyReports.find((item) => item.employeeName === employee);
                    return (
                      <tr key={employee} className="align-top hover:bg-[#f4f8f2]">
                        <td className="border border-[#e0e8dd] px-4 py-3 text-sm font-semibold text-slate-700">
                          {employee}
                        </td>
                        <td className="max-w-[280px] border border-[#e0e8dd] px-4 py-3 text-sm leading-5 text-slate-600">
                          {report?.completedToday ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="max-w-[220px] border border-[#e0e8dd] px-4 py-3 text-sm leading-5 text-slate-600">
                          {report?.plansNext ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="max-w-[220px] border border-[#e0e8dd] px-4 py-3 text-sm leading-5 text-slate-600">
                          {report?.blockers || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap border border-[#e0e8dd] px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            report ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {report ? "Submitted" : "Not submitted"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap border border-[#e0e8dd] px-4 py-3">
                          <button
                            onClick={() => openReportEditor(employee)}
                            disabled={isLoadingReports}
                            className="rounded-md border border-[#b5cdb0] px-3 py-1.5 text-xs font-semibold text-[#217346] transition hover:bg-[#edf5eb] disabled:cursor-wait disabled:opacity-50"
                          >
                            {report ? "Edit report" : "Add report"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!isLoading && employees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                        Add a task assignment to get team members listed here.
                      </td>
                    </tr>
                  )}
                  {isLoadingReports && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-400">
                        Loading reports…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div className="border-t border-[#d7e1d4] bg-[#f8faf7] px-4 py-2.5 text-xs text-slate-500">
                {isLoadingReports ? "Loading…" : `${dailyReports.length} of ${employees.length} reports submitted`}
              </div>
            </div>
          </section>

          <section id="team" className="scroll-mt-24 pt-9">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold tracking-tight text-slate-900">
                  Technical Team
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Select a team member to see their project assignments.
                </p>
              </div>
              <span className="text-xs font-medium text-slate-400">
                {isLoading ? "Loading…" : `${employees.length} team members`}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {employees.map((employee, employeeIndex) => {
                const assignments = allotments.filter((item) => item.employeeName === employee);
                return (
                  <button
                    key={employee}
                    onClick={() => setSelectedEmployee(employee)}
                    className="rounded-xl border border-slate-200/80 bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"
                  >
                    <div className="flex items-center gap-3.5">
                      <span
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-bold ${avatarColors[employeeIndex % avatarColors.length]}`}
                        aria-hidden="true"
                      >
                        {initials(employee)}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-800">{employee}</h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {assignments.length} assigned {assignments.length === 1 ? "task" : "tasks"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="text-[11px] font-medium text-slate-400">Current projects</p>
                      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-6 text-slate-700">
                        {[...new Set(assignments.map((item) => item.project))].join(", ")}
                      </p>
                    </div>
                  </button>
                );
              })}
              {!isLoading && employees.length === 0 && !loadError && (
                <p className="col-span-full rounded-xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400">
                  No technical team assignments are available.
                </p>
              )}
            </div>
          </section>

          <footer className="mt-10 flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Who Is Doing What? <span className="mx-1">·</span> Technical team workspace
            </span>
            <span>Made for better teamwork</span>
          </footer>
        </main>
      </div>

      {selectedEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEmployee(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            className="my-auto max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="detail-title" className="font-display text-lg font-bold text-slate-900">
                  {selectedEmployee}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Technical team project assignments</p>
              </div>
              <button
                aria-label="Close dialog"
                onClick={() => setSelectedEmployee(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {employeeAssignments.map((assignment) => (
                <article
                  key={assignment.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                >
                  <h3 className="text-sm font-semibold leading-6 text-slate-800">
                    {assignment.project}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{assignment.taskAssigned}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    Progress{" "}
                    <span
                      className={`ml-1 inline-flex rounded-full px-2.5 py-1 font-semibold ${progressStyles[assignment.progress]}`}
                    >
                      {assignment.progress}
                    </span>
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    Assigned by <span className="font-semibold text-slate-700">{assignment.assignedBy}</span>
                  </p>
                  {assignment.repositoryUrl && (
                    <a
                      href={assignment.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#217346] hover:underline"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Open Git repository
                    </a>
                  )}
                </article>
              ))}
            </div>
            <div className="flex justify-end border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => setSelectedEmployee(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isReportEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingReport) setIsReportEditorOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-report-title"
            className="my-auto w-full max-w-[560px] rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="daily-report-title" className="font-display text-lg font-bold text-slate-900">
                  Daily report · {reportForm.employeeName}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{reportDate}</p>
              </div>
              <button
                aria-label="Close report editor"
                disabled={isSavingReport}
                onClick={() => setIsReportEditorOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <form onSubmit={handleSaveReport} className="space-y-4 p-6">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  What did you complete today?
                </span>
                <textarea
                  required
                  maxLength={4000}
                  rows={4}
                  value={reportForm.completedToday}
                  onChange={(event) =>
                    setReportForm({ ...reportForm, completedToday: event.target.value })
                  }
                  placeholder="Summarize today's progress"
                  className="form-control h-auto min-h-[96px] resize-y py-2.5"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  What will you work on next?
                </span>
                <textarea
                  maxLength={4000}
                  rows={3}
                  value={reportForm.plansNext}
                  onChange={(event) =>
                    setReportForm({ ...reportForm, plansNext: event.target.value })
                  }
                  placeholder="Planned work for the next day"
                  className="form-control h-auto min-h-[76px] resize-y py-2.5"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Blockers <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <textarea
                  maxLength={4000}
                  rows={2}
                  value={reportForm.blockers}
                  onChange={(event) =>
                    setReportForm({ ...reportForm, blockers: event.target.value })
                  }
                  placeholder="Any issue stopping progress?"
                  className="form-control h-auto min-h-[64px] resize-y py-2.5"
                />
              </label>
              {reportError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Could not save report: {reportError}
                </p>
              )}
              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  disabled={isSavingReport}
                  onClick={() => setIsReportEditorOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReport}
                  className="rounded-lg bg-[#217346] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#185c37] focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingReport ? "Saving…" : "Save report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {repositoryEditor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingRepository) {
              setRepositoryEditor(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="repository-title"
            className="my-auto w-full max-w-[520px] rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="repository-title" className="font-display text-lg font-bold text-slate-900">
                  Git repository
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {repositoryEditor.allotment.project} · {repositoryEditor.allotment.employeeName}
                </p>
              </div>
              <button
                aria-label="Close repository editor"
                disabled={isSavingRepository}
                onClick={() => setRepositoryEditor(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <form onSubmit={handleSaveRepository} className="space-y-4 p-6">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Repository URL <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  type="url"
                  maxLength={2048}
                  value={repositoryEditor.url}
                  onChange={(event) =>
                    setRepositoryEditor({ ...repositoryEditor, url: event.target.value })
                  }
                  placeholder="https://github.com/organization/repository"
                  className="form-control"
                />
                <span className="mt-1 block text-[11px] text-slate-400">
                  Clear the URL and save to remove the current link.
                </span>
              </label>
              {repositoryError && (
                <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Could not save repository link: {repositoryError}
                </p>
              )}
              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  disabled={isSavingRepository}
                  onClick={() => setRepositoryEditor(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRepository}
                  className="rounded-lg bg-[#217346] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#185c37] focus:outline-none focus:ring-4 focus:ring-emerald-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingRepository ? "Saving…" : "Save link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddTaskOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingTask) setIsAddTaskOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-task-title"
            className="my-auto w-full max-w-[520px] rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10"
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="add-task-title" className="font-display text-lg font-bold text-slate-900">
                  Assign a Task
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Add a project task and assign it to a team member.
                </p>
              </div>
              <button
                aria-label="Close dialog"
                disabled={isSavingTask}
                onClick={() => setIsAddTaskOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="space-y-4 p-6">
              <fieldset className="block">
                <legend className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Assign to <span className="font-normal text-slate-400">(select one or more)</span>
                </legend>
                {employees.length > 0 && (
                  <div className="grid max-h-36 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {employees.map((employee) => {
                      const isSelected = taskForm.employeeNames.includes(employee);
                      return (
                        <label
                          key={employee}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                            isSelected
                              ? "bg-blue-50 font-semibold text-blue-700"
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTaskAssignee(employee)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          {employee}
                        </label>
                      );
                    })}
                  </div>
                )}
                {taskForm.employeeNames.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Selected: {taskForm.employeeNames.join(", ")}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    maxLength={120}
                    value={newTeamMemberName}
                    onChange={(event) => setNewTeamMemberName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addTeamMemberName();
                      }
                    }}
                    placeholder="Add another team member"
                    className="form-control"
                  />
                  <button
                    type="button"
                    onClick={addTeamMemberName}
                    disabled={!newTeamMemberName.trim()}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Add person
                  </button>
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Assigned by
                </span>
                <input
                  required
                  maxLength={120}
                  value={taskForm.assignedBy}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, assignedBy: event.target.value })
                  }
                  placeholder="Who is assigning this task?"
                  className="form-control"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Project</span>
                <input
                  required
                  list="technical-projects"
                  maxLength={240}
                  value={taskForm.project}
                  onChange={(event) => setTaskForm({ ...taskForm, project: event.target.value })}
                  placeholder="Choose or enter a project"
                  className="form-control"
                />
                <datalist id="technical-projects">
                  {projects.map((project) => (
                    <option key={project} value={project} />
                  ))}
                </datalist>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Task assigned
                </span>
                <textarea
                  required
                  maxLength={4000}
                  rows={4}
                  value={taskForm.taskAssigned}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, taskAssigned: event.target.value })
                  }
                  placeholder="Describe the task"
                  className="form-control h-auto min-h-[104px] resize-y py-2.5"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Git repository link <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  type="url"
                  maxLength={2048}
                  value={taskForm.repositoryUrl}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, repositoryUrl: event.target.value })
                  }
                  placeholder="https://github.com/organization/repository"
                  className="form-control"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Progress
                </span>
                <select
                  value={taskForm.progress}
                  onChange={(event) =>
                    setTaskForm({
                      ...taskForm,
                      progress: event.target.value as TaskProgress,
                    })
                  }
                  className="form-control"
                >
                  {taskProgressOptions.map((progress) => (
                    <option key={progress}>{progress}</option>
                  ))}
                </select>
              </label>

              {taskError && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                >
                  Could not assign task: {taskError}
                </p>
              )}

              <div className="flex justify-end gap-2.5 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  disabled={isSavingTask}
                  onClick={() => setIsAddTaskOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingTask}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {isSavingTask ? "Assigning…" : "Assign Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
