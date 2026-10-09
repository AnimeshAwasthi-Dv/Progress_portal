import { pool } from "./db.js";

async function adjust() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    
    // Update user 1 email to admin@taskmanager.internal
    await client.query("UPDATE users SET name = 'Admin', email = 'admin@taskmanager.internal', designation = 'System Administrator', role = 'Admin' WHERE id = 1");

    // Add or verify Shivam as Manager
    const shivamCheck = await client.query("SELECT id FROM users WHERE name = 'Shivam'");
    if (shivamCheck.rows.length === 0) {
      await client.query("INSERT INTO users (name, email, role, department, designation) VALUES ('Shivam', 'shivam@taskmanager.internal', 'Manager', 'Technical', 'Technical Lead / Manager')");
    }

    await client.query("COMMIT");
    const { rows } = await client.query("SELECT id, name, email, role, designation FROM users ORDER BY id");
    console.log("Team members list:", rows);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
  } finally {
    client.release();
    await pool.end();
  }
}
adjust();
