import { pool } from "./db.js";

async function migrateUsers() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Ensure unnamed Admin user exists
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'Admin'");
    if (adminCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, department, designation)
        VALUES ('Admin', 'admin@taskmanager.internal', 'password123', 'Admin', 'Executive', 'System Administrator')
      `);
    } else {
      await client.query("UPDATE users SET name = 'Admin', designation = 'System Administrator' WHERE role = 'Admin'");
    }

    // 2. Configure Team Leads / Managers: Shivam & Animesh
    await client.query(`
      UPDATE users 
      SET role = 'Manager', designation = 'Engineering Manager / Lead'
      WHERE name ILIKE 'Shivam'
    `);

    await client.query(`
      UPDATE users 
      SET role = 'Team Lead', designation = 'Technical Lead - DevOps & Platform'
      WHERE name ILIKE 'Animesh'
    `);

    // 3. Configure Employees / Individual Contributors: Sakshi, Vaibhav, Suraj
    await client.query(`
      UPDATE users 
      SET role = 'Individual', designation = 'Full Stack Engineer'
      WHERE name ILIKE 'Sakshi'
    `);

    await client.query(`
      UPDATE users 
      SET role = 'Individual', designation = 'Software & Systems Engineer'
      WHERE name ILIKE 'Vaibhav'
    `);

    await client.query(`
      UPDATE users 
      SET role = 'Individual', designation = 'AI / ML Engineer'
      WHERE name ILIKE 'Suraj'
    `);

    await client.query("COMMIT");

    const { rows } = await client.query("SELECT id, name, email, role, designation FROM users ORDER BY id");
    console.log("Updated Team Structure successfully:", rows);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrateUsers();
