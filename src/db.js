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
  console.log('Starting delete operation for IDs:', employeeIds);
  
  if (!env.employee_db) throw new Error("D1 binding 'employee_db' not found in environment");
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    throw new Error("No employee IDs provided for deletion");
  }

  // Validate that all IDs are numbers
  const invalidIds = employeeIds.filter(id => typeof id !== 'number' && (typeof id !== 'string' || isNaN(Number(id))));
  if (invalidIds.length > 0) {
    throw new Error(`Invalid employee IDs: ${invalidIds.join(', ')}. All IDs must be numbers.`);
  }

  // Convert all IDs to numbers
  employeeIds = employeeIds.map(id => Number(id));
  console.log('Validated IDs:', employeeIds);

  try {
    // First verify all IDs exist
    const checkSQL = `SELECT id FROM employees WHERE id IN (${employeeIds.map(() => '?').join(',')})`;
    console.log('Checking existing IDs with SQL:', checkSQL);
    
    const checkResult = await env.employee_db.prepare(checkSQL).bind(...employeeIds).all();
    console.log('Check result:', checkResult);
    
    const foundIds = new Set((checkResult?.results || []).map(row => row.id));
    const missingIds = employeeIds.filter(id => !foundIds.has(id));
    
    if (missingIds.length > 0) {
      return { success: false, deletedCount: 0, errors: [`Employees not found: ${missingIds.join(', ')}`] };
    }

    // All IDs exist, proceed with deletion
    const deleteSQL = `DELETE FROM employees WHERE id IN (${employeeIds.map(() => '?').join(',')})`;    
    console.log('Delete SQL:', deleteSQL);
    
    try {
      const result = await env.employee_db.prepare(deleteSQL).bind(...employeeIds).run();
      console.log('Delete result:', result);
      deletedCount = result.changes || 0;
      return { success: true, deletedCount };
    } catch (err) {
      console.error('Delete error:', err);
      throw new Error(`Failed to delete employees: ${err.message}`);
    }
  } catch (err) {
    console.error('Operation failed:', err);
    throw new Error(`Failed to delete employees: ${err.message}`);
  }
}
