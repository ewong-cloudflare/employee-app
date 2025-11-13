// src/index.js
/**
 * Main Cloudflare Worker entrypoint (ES modules)
 *
 * - Serves frontend at GET /
 * - API:
 *    POST /api/employees  => create employee (expects JSON)
 *    GET  /api/employees  => list employees (JSON)
 *
 * Exports a default object with fetch method (module-style)
 */

import HTML from "./templates/index.html.js";
import * as db from "./db.js";

/**
 * Build standard response with CORS & security headers
 * @param {Response} res
 */
function withStandardHeaders(res) {
  const headers = new Headers(res.headers);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self' https://unpkg.com https://cdn.tailwindcss.com https://cdnjs.cloudflare.com; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com https://cdn.tailwindcss.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "connect-src 'self'; " +
    "img-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self';"
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  // CORS (adjust origin in production)
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, headers });
}

/**
 * Validate input payload
 * @param {{nirc:string, fullName:string, position?:string, email?:string}} payload
 */
function validatePayload(payload) {
  const errors = [];
  if (!payload) {
    errors.push("Missing body");
    return errors;
  }
  const nirc = String(payload.nirc || "").trim();
  const fullName = String(payload.fullName || "").trim();
  const email = payload.email ? String(payload.email).trim() : "";

  if (!/^\w{3,20}$/.test(nirc)) errors.push("Invalid NIRC (3-20 alphanumeric characters)");
  if (!fullName) errors.push("Full name is required");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) errors.push("Invalid email address");
  return errors;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle preflight CORS
    if (request.method === "OPTIONS") {
      return withStandardHeaders(new Response(null, { status: 204 }));
    }

    // Ensure DB table exists lazily
    try {
      await db.ensureSchema(env);
    } catch (err) {
      // If DB isn't configured, return an informative error
      return withStandardHeaders(new Response(JSON.stringify({ error: "D1 database error: " + err.message }), { status: 500, headers: { "Content-Type": "application/json" } }));
    }

    try {
      if (pathname === "/" && request.method === "GET") {
        return withStandardHeaders(new Response(HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }));
      }

      // API: list employees
      if (pathname === "/api/employees" && request.method === "GET") {
        const rows = await db.listEmployees(env);
        return withStandardHeaders(new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } }));
      }

      // API: add employee
      if (pathname === "/api/employees" && request.method === "POST") {
        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.includes("application/json")) {
          return withStandardHeaders(new Response(JSON.stringify({ error: "Content-Type must be application/json" }), { status: 415, headers: { "Content-Type": "application/json" } }));
        }
        const payload = await request.json();
        const errors = validatePayload(payload);
        if (errors.length) {
          return withStandardHeaders(new Response(JSON.stringify({ errors }), { status: 400, headers: { "Content-Type": "application/json" } }));
        }

        // Insert into D1
        try {
          const created = await db.addEmployee(env, {
            nirc: payload.nirc.trim(),
            fullName: payload.fullName.trim(),
            position: payload.position ? payload.position.trim() : "",
            email: payload.email ? payload.email.trim() : ""
          });
          return withStandardHeaders(new Response(JSON.stringify(created), { status: 201, headers: { "Content-Type": "application/json" } }));
        } catch (err) {
          // Handle unique constraint explicitly
          const msg = String(err?.message || err);
          if (/unique/i.test(msg) || /UNIQUE constraint failed/i.test(msg)) {
            return withStandardHeaders(new Response(JSON.stringify({ message: "Employee with that NIRC already exists" }), { status: 409, headers: { "Content-Type": "application/json" } }));
          }
          console.error("DB insert / retrieval error:", msg);
          // Return sanitized error to client
          return withStandardHeaders(new Response(JSON.stringify({ error: "Database insert failed", details: msg }), { status: 500, headers: { "Content-Type": "application/json" } }));
        }
      }

      // API: delete employees
      if (pathname === "/api/employees" && request.method === "DELETE") {
        const contentType = request.headers.get("Content-Type") || "";
        if (!contentType.includes("application/json")) {
          return withStandardHeaders(new Response(JSON.stringify({ error: "Content-Type must be application/json" }), { status: 415, headers: { "Content-Type": "application/json" } }));
        }

        const payload = await request.json();
        if (!Array.isArray(payload.ids) || payload.ids.length === 0) {
          return withStandardHeaders(new Response(JSON.stringify({ error: "ids must be a non-empty array of employee IDs" }), { status: 400, headers: { "Content-Type": "application/json" } }));
        }

        try {
          const result = await db.deleteEmployees(env, payload.ids);
          return withStandardHeaders(new Response(JSON.stringify(result), { status: result.success ? 200 : 400, headers: { "Content-Type": "application/json" } }));
        } catch (err) {
          console.error("DB delete error:", err?.message || err);
          return withStandardHeaders(new Response(JSON.stringify({ error: "Database delete failed", details: String(err?.message || err) }), { status: 500, headers: { "Content-Type": "application/json" } }));
        }
      }

      // Not found
      return withStandardHeaders(new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));

    } catch (err) {
      console.error("Unhandled error:", err);
      return withStandardHeaders(new Response(JSON.stringify({ error: "Internal Server Error", details: String(err?.message || err) }), { status: 500, headers: { "Content-Type": "application/json" } }));
    }
  }
};
