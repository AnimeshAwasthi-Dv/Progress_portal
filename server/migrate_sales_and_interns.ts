import { pool } from "./db.js";

async function updateSalesAndRoles() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Create Sales Team if not exists
    const salesTeamRes = await client.query("SELECT id FROM teams WHERE name ILIKE 'Sales Team' OR name ILIKE 'Sales & Business Development'");
    let salesTeamId: number;
    if (salesTeamRes.rows.length === 0) {
      const inserted = await client.query(`
        INSERT INTO teams (name, description)
        VALUES ('Sales Team', 'Client outreach, demo pipelines, commercial allotments, and revenue operations')
        RETURNING id
      `);
      salesTeamId = inserted.rows[0].id;
    } else {
      salesTeamId = salesTeamRes.rows[0].id;
    }

    // 2. Add sample Sales users if none exist
    const salesUsersCheck = await client.query("SELECT id FROM users WHERE department = 'Sales'");
    if (salesUsersCheck.rows.length === 0) {
      const salesRoster = [
        { name: "Rohit", email: "rohit@taskmanager.internal", role: "Team Lead", dept: "Sales", desig: "Sales Lead" },
        { name: "Neha", email: "neha@taskmanager.internal", role: "Individual", dept: "Sales", desig: "Sales Executive" },
        { name: "Aman", email: "aman@taskmanager.internal", role: "Individual", dept: "Sales", desig: "Business Development Associate" },
      ];

      for (const su of salesRoster) {
        const uRes = await client.query<{ id: number }>(`
          INSERT INTO users (name, email, password_hash, role, department, designation, team_id)
          VALUES ($1, $2, 'password123', $3, $4, $5, $6)
          RETURNING id
        `, [su.name, su.email, su.role, su.dept, su.desig, salesTeamId]);

        await client.query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [salesTeamId, uRes.rows[0].id]);
        await client.query(`
          INSERT INTO employees (name, department, designation, current_work, status)
          VALUES ($1, $2, $3, 'Client outreach & enterprise lead pipeline', 'In Progress')
          ON CONFLICT DO NOTHING
        `, [su.name, su.dept, su.desig]);
      }
    }

    // 3. Create Sales Project if not exists
    const salesProjCheck = await client.query("SELECT id FROM projects WHERE code = 'SLS'");
    if (salesProjCheck.rows.length === 0) {
      const rohit = (await client.query("SELECT id FROM users WHERE name = 'Rohit'")).rows[0]?.id;
      const animesh = (await client.query("SELECT id FROM users WHERE name = 'Animesh'")).rows[0]?.id;
      const pRes = await client.query(`
        INSERT INTO projects (name, code, description, manager_id, lead_id, status, start_date, target_date)
        VALUES ('Enterprise Client Pipeline & Expansion', 'SLS', 'Enterprise client conversion, demos, POCs and onboarding', $1, $2, 'Active', CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE + INTERVAL '60 days')
        RETURNING id
      `, [animesh || 1, rohit || animesh || 1]);

      const pId = pRes.rows[0].id;
      const nehaId = (await client.query("SELECT id FROM users WHERE name = 'Neha'")).rows[0]?.id;
      const rohitId = rohit || animesh;

      if (nehaId && rohitId) {
        await client.query(`
          INSERT INTO tasks (
            task_code, title, description, project_id, assigned_by_user_id, assigned_to_user_id,
            reviewer_user_id, priority, status, start_date, due_date, estimated_hours, actual_hours,
            progress_percent, acceptance_criteria
          ) VALUES 
           ('SLS-001', 'Enterprise Client Outreach for Q4 Cohort', 'Reach out to 50 prospective enterprise partners with customized pitch deck', $1, $2, $3, $2, 'High', 'In Progress', CURRENT_DATE - INTERVAL '3 days', CURRENT_DATE + INTERVAL '10 days', 24, 12, 50, '1. Connect with 50 prospects\n2. Schedule 10 discovery demos'),
           ('SLS-002', 'Healthcare PACS Demo Pipeline Followup', 'Follow up with shortlisted hospital networks for PACS migration proposal', $1, $2, $3, $2, 'Urgent', 'In Progress', CURRENT_DATE - INTERVAL '2 days', CURRENT_DATE + INTERVAL '5 days', 16, 8, 60, '1. Finalize proposal quote\n2. Send revised SLA document')
        `, [pId, rohitId, nehaId]);
      }
    }

    // 4. Update Technical Team roles & designations strictly according to prompt:
    // - animesh: "technical lead"
    // - vaibhav, sakshi, suraj: "technical intern" (role: Individual)
    await client.query(`
      UPDATE users 
      SET designation = 'Technical Lead', role = 'Team Lead', department = 'Technical'
      WHERE name ILIKE 'Animesh'
    `);
    await client.query("UPDATE employees SET designation = 'Technical Lead' WHERE name ILIKE 'Animesh'");

    await client.query(`
      UPDATE users 
      SET designation = 'Technical Intern', role = 'Individual', department = 'Technical'
      WHERE name ILIKE 'Vaibhav'
    `);
    await client.query("UPDATE employees SET designation = 'Technical Intern' WHERE name ILIKE 'Vaibhav'");

    await client.query(`
      UPDATE users 
      SET designation = 'Technical Intern', role = 'Individual', department = 'Technical'
      WHERE name ILIKE 'Sakshi'
    `);
    await client.query("UPDATE employees SET designation = 'Technical Intern' WHERE name ILIKE 'Sakshi'");

    await client.query(`
      UPDATE users 
      SET designation = 'Technical Intern', role = 'Individual', department = 'Technical'
      WHERE name ILIKE 'Suraj'
    `);
    await client.query("UPDATE employees SET designation = 'Technical Intern' WHERE name ILIKE 'Suraj'");

    // 5. Remove Shivam as manager (delete or remove Shivam)
    const shivamRes = await client.query("SELECT id FROM users WHERE name ILIKE 'Shivam'");
    if (shivamRes.rows.length > 0) {
      const shivamId = shivamRes.rows[0].id;
      const animeshId = (await client.query("SELECT id FROM users WHERE name ILIKE 'Animesh'")).rows[0]?.id || 1;
      const adminId = (await client.query("SELECT id FROM users WHERE role = 'Admin'")).rows[0]?.id || 1;

      await client.query("UPDATE projects SET manager_id = $1 WHERE manager_id = $2", [adminId, shivamId]);
      await client.query("UPDATE projects SET lead_id = $1 WHERE lead_id = $2", [animeshId, shivamId]);
      await client.query("UPDATE teams SET manager_id = $1 WHERE manager_id = $2", [adminId, shivamId]);
      await client.query("UPDATE teams SET lead_id = $1 WHERE lead_id = $2", [animeshId, shivamId]);
      await client.query("UPDATE tasks SET assigned_by_user_id = $1 WHERE assigned_by_user_id = $2", [animeshId, shivamId]);
      await client.query("UPDATE tasks SET assigned_to_user_id = $1 WHERE assigned_to_user_id = $2", [animeshId, shivamId]);
      await client.query("UPDATE tasks SET reviewer_user_id = $1 WHERE reviewer_user_id = $2", [animeshId, shivamId]);
      await client.query("DELETE FROM project_members WHERE user_id = $1", [shivamId]);
      await client.query("DELETE FROM team_members WHERE user_id = $1", [shivamId]);
      await client.query("DELETE FROM task_collaborators WHERE user_id = $1", [shivamId]);
      await client.query("DELETE FROM task_comments WHERE user_id = $1", [shivamId]);
      await client.query("DELETE FROM task_activity_history WHERE actor_user_id = $1", [shivamId]);
      await client.query("DELETE FROM notifications WHERE user_id = $1", [shivamId]);
      await client.query("DELETE FROM daily_progress_reports WHERE employee_name ILIKE 'Shivam'");
      await client.query("DELETE FROM employees WHERE name ILIKE 'Shivam'");
      await client.query("DELETE FROM users WHERE id = $1", [shivamId]);
      console.log("✓ Removed Shivam as manager");
    }

    await client.query("COMMIT");

    const users = await client.query("SELECT id, name, email, role, department, designation FROM users ORDER BY id");
    console.log("Updated Users:", users.rows);
    const teams = await client.query("SELECT id, name, description FROM teams ORDER BY id");
    console.log("Updated Teams:", teams.rows);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

updateSalesAndRoles();
