import { pool } from "./db.js";

async function removeRameshAndPriya() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const usersRes = await client.query("SELECT id, name FROM users");
    const userMap: Record<string, number> = {};
    usersRes.rows.forEach(u => { userMap[u.name.toLowerCase()] = u.id; });

    const rameshId = userMap["ramesh"];
    const priyaId = userMap["priya"];
    const shivamId = userMap["shivam"] || 8;
    const animeshId = userMap["animesh"] || 3;

    console.log("Current user IDs:", userMap);

    if (rameshId) {
      await client.query("UPDATE projects SET manager_id = $1 WHERE manager_id = $2", [shivamId, rameshId]);
      await client.query("UPDATE projects SET lead_id = $1 WHERE lead_id = $2", [animeshId, rameshId]);
      await client.query("UPDATE teams SET manager_id = $1 WHERE manager_id = $2", [shivamId, rameshId]);
      await client.query("UPDATE teams SET lead_id = $1 WHERE lead_id = $2", [animeshId, rameshId]);
      await client.query("UPDATE tasks SET assigned_by_user_id = $1 WHERE assigned_by_user_id = $2", [shivamId, rameshId]);
      await client.query("UPDATE tasks SET assigned_to_user_id = $1 WHERE assigned_to_user_id = $2", [animeshId, rameshId]);
      await client.query("UPDATE tasks SET reviewer_user_id = $1 WHERE reviewer_user_id = $2", [shivamId, rameshId]);
      await client.query("DELETE FROM project_members WHERE user_id = $1", [rameshId]);
      await client.query("DELETE FROM team_members WHERE user_id = $1", [rameshId]);
      await client.query("DELETE FROM task_collaborators WHERE user_id = $1", [rameshId]);
      await client.query("DELETE FROM task_comments WHERE user_id = $1", [rameshId]);
      await client.query("DELETE FROM task_activity_history WHERE actor_user_id = $1", [rameshId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [rameshId]);
      await client.query("DELETE FROM daily_progress_reports WHERE employee_name ILIKE 'Ramesh'");
      await client.query("DELETE FROM employees WHERE name ILIKE 'Ramesh'");
      await client.query("DELETE FROM users WHERE id = $1", [rameshId]);
      console.log("✓ Successfully deleted Ramesh");
    }

    if (priyaId) {
      await client.query("UPDATE tasks SET assigned_to_user_id = $1 WHERE assigned_to_user_id = $2", [animeshId, priyaId]);
      await client.query("UPDATE tasks SET assigned_by_user_id = $1 WHERE assigned_by_user_id = $2", [shivamId, priyaId]);
      await client.query("UPDATE tasks SET reviewer_user_id = $1 WHERE reviewer_user_id = $2", [animeshId, priyaId]);
      await client.query("DELETE FROM project_members WHERE user_id = $1", [priyaId]);
      await client.query("DELETE FROM team_members WHERE user_id = $1", [priyaId]);
      await client.query("DELETE FROM task_collaborators WHERE user_id = $1", [priyaId]);
      await client.query("DELETE FROM task_comments WHERE user_id = $1", [priyaId]);
      await client.query("DELETE FROM task_activity_history WHERE actor_user_id = $1", [priyaId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [priyaId]);
      await client.query("DELETE FROM daily_progress_reports WHERE employee_name ILIKE 'Priya'");
      await client.query("DELETE FROM employees WHERE name ILIKE 'Priya'");
      await client.query("DELETE FROM users WHERE id = $1", [priyaId]);
      console.log("✓ Successfully deleted Priya");
    }

    await client.query("COMMIT");

    const remainingUsers = await client.query("SELECT id, name, email, role, designation FROM users ORDER BY id");
    console.log("Final active users:", remainingUsers.rows);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Removal error:", e);
  } finally {
    client.release();
    await pool.end();
  }
}

removeRameshAndPriya();
