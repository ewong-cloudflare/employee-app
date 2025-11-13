// src/employee_db.js
/**
 * D1 helper module — functions to initialize table, add employee, list employees.
 *
 * NOTE: addEmployee now protects against D1 returning undefined for lastInsertRowid
 * by falling back to selecting the inserted row by its unique `nirc`.
 */

/**
 * @typedef {Object} Employee
 * @property {number} id
 * @property {string} nirc
 * @property {string} full_name
 * @property {string} position
 * @property {string} email
 * @property {string} created_at
 */

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nirc TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  position TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Ensure the employees table exists.
 * @param {Bindings} env
 */
export async function ensureSchema(env) {
  if (!env.employee_db) {
    throw new Error("D1 binding 'employee_db' not found in environment");
  }
  await env.employee_db.prepare(CREATE_TABLE_SQL).run();
}

/**
 * Add a new employee row. Returns the inserted row (fresh from employee_db).
 * Uses a safe fallback if lastInsertRowid is not present.
 *
 * @param {Bindings} env
 * @param {{nirc:string, fullName:string, position?:string, email?:string}} data
 * @returns {Promise<Employee>}
 */
export async function addEmployee(env, data) {
  const { nirc, fullName, position = "", email = "" } = data;

  if (!env.employee_db) throw new Error("D1 binding 'employee_db' not found in environment");

  const insertSQL = `
    INSERT INTO employees (nirc, full_name, position, email)
    VALUES (?, ?, ?, ?)
  `;

  // Insert row
  let insertResult;
  try {
    insertResult = await env.employee_db.prepare(insertSQL).bind(nirc, fullName, position, email).run();
  } catch (err) {
    // Re-throw database errors to be handled by caller (caller may inspect message)
    throw err;
  }

  // Try to obtain lastInsertRowid safely
  const maybeId = insertResult?.lastInsertRowid;
  let row;

  // If ID is available and a number, use it
  if (maybeId !== undefined && maybeId !== null) {
    try {
      const selectRes = await env.employee_db.prepare("SELECT id, nirc, full_name, position, email, created_at FROM employees WHERE id = ?").bind(maybeId).all();
      row = Array.isArray(selectRes?.results) ? selectRes.results[0] : undefined;
    } catch (err) {
      // Log and continue to fallback to selecting by NIRC
      console.error("D1: selecting by id failed, falling back to nirc. error:", err?.message || err);
    }
  }

  // Fallback: select by unique nirc (safe because insert succeeded)
  if (!row) {
    try {
      const selectRes = await env.employee_db.prepare("SELECT id, nirc, full_name, position, email, created_at FROM employees WHERE nirc = ?").bind(nirc).all();
      row = Array.isArray(selectRes?.results) ? selectRes.results[0] : undefined;
    } catch (err) {
      // If even this fails, throw a clear error for the caller to handle
      console.error("D1: fallback SELECT by nirc failed:", err?.message || err);
      throw new Error("Failed to retrieve inserted employee: " + (err?.message || String(err)));
    }
  }

  if (!row) {
    throw new Error("Inserted employee could not be retrieved from database.");
  }

  return row;
}

/**
 * List all employees, ordered by created_at desc.
 * @param {Bindings} env
 * @returns {Promise<Employee[]>}
 */
export async function listEmployees(env) {
  if (!env.employee_db) throw new Error("D1 binding 'DB' not found in environment");
  const sql = `SELECT id, nirc, full_name, position, email, created_at FROM employees ORDER BY created_at DESC`;
  const res = await env.employee_db.prepare(sql).all();
  return res.results || [];
}

/**
 * Delete multiple employees by their IDs.
 * @param {Bindings} env
 * @param {number[]} employeeIds - Array of employee IDs to delete
 * @returns {Promise<{success: boolean, deletedCount: number, errors?: string[]}>}
 */
export async function deleteEmployees(env, employeeIds) {
  if (!env.employee_db) throw new Error("D1 binding 'employee_db' not found in environment");
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    throw new Error("No employee IDs provided for deletion");
  }

  const errors = [];
  let deletedCount = 0;

  // Use a transaction to ensure all deletions are atomic
  try {
    await env.employee_db.prepare('BEGIN TRANSACTION').run();

    const deleteSQL = `DELETE FROM employees WHERE id = ?`;
    const stmt = env.employee_db.prepare(deleteSQL);

    for (const id of employeeIds) {
      try {
        const result = await stmt.bind(id).run();
        if (result.changes > 0) {
          deletedCount++;
        }
      } catch (err) {
        errors.push(`Failed to delete employee ${id}: ${err.message}`);
      }
    }

    if (errors.length === 0) {
      await env.employee_db.prepare('COMMIT').run();
      return { success: true, deletedCount };
    } else {
      // If there were any errors, roll back the transaction
      await env.employee_db.prepare('ROLLBACK').run();
      return { success: false, deletedCount: 0, errors };
    }
  } catch (err) {
    // Ensure rollback on any unexpected errors
    try {
      await env.employee_db.prepare('ROLLBACK').run();
    } catch {}
    throw new Error(`Transaction failed: ${err.message}`);
  }
}
