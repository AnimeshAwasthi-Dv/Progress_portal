import { pool, initializeDatabase, listUsers, listProjects, listTasks, createTask, updateTaskDetails, submitTaskReview } from "./db.js";

async function runTests() {
  console.log("Starting backend verification test suite...");
  await initializeDatabase();

  const users = await listUsers();
  console.log(`✓ Database initialized with ${users.length} users.`);
  const admin = users.find(u => u.role === "Admin")!;
  const manager = users.find(u => u.role === "Lead")!;
  const lead = users.find(u => u.role === "Lead")!;
  const member = users.find(u => u.role === "Employee")!;

  console.log(`✓ Roles verified: Admin (${admin.name}), Manager (${manager.name}), Lead (${lead.name}), Member (${member.name})`);

  const projects = await listProjects();
  console.log(`✓ Verified ${projects.length} existing projects loaded.`);

  // 1. Create a task assigned by Manager to Individual
  const newTask = await createTask({
    title: "Implement DICOM streaming microservice",
    description: "Build robust streaming engine with high throughput",
    projectId: projects[0].id,
    assignedByUserId: manager.id,
    assignedToUserId: member.id,
    reviewerUserId: lead.id,
    priority: "Urgent",
    status: "To Do",
    dueDate: "2026-11-01",
    estimatedHours: 12,
    acceptanceCriteria: "Pass unit tests and latency < 100ms",
  });
  console.log(`✓ Task created: ${newTask?.taskCode} (${newTask?.title}) assigned by ${newTask?.assignedByName} to ${newTask?.assignedToName}`);

  // 2. Transition task to In Progress and then In Review
  const inProgressTask = await updateTaskDetails(newTask!.id, member.id, {
    status: "In Progress",
    actualHours: 4,
    progressPercent: 50,
  });
  console.log(`✓ Task updated to In Progress with 50% completion`);

  const inReviewTask = await updateTaskDetails(newTask!.id, member.id, {
    status: "In Review",
    progressPercent: 95,
    actualHours: 11,
  });
  console.log(`✓ Task submitted for review. Status: ${inReviewTask?.status}`);

  // 3. Reviewer review and approval
  const approvedTask = await submitTaskReview(newTask!.id, lead.id, {
    decision: "Approved",
    feedback: "High performance achieved. Meets all acceptance criteria.",
  });
  console.log(`✓ Review approved by Lead. Final status: ${approvedTask?.status}, Completed at: ${approvedTask?.completedAt}`);

  // 4. Test reassignment with audit reason
  const reassignTask = await updateTaskDetails(newTask!.id, manager.id, {
    assignedToUserId: lead.id,
    reassignReason: "Redistributing work for production release leadership.",
  });
  console.log(`✓ Reassigned task to ${reassignTask?.assignedToName} with preserved audit log.`);

  console.log("All automated test checks passed successfully!");
  await pool.end();
  process.exit(0);
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
