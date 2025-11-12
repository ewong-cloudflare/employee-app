# Employee Directory — Cloudflare Workers + D1

This repository is a Cloudflare Worker project that implements a simple employee directory using **Cloudflare D1** for storage and a React + Tailwind frontend served by the Worker.

Features:
- Add employees (NIRC, Full name, Position, Email)
- View employee list
- Export employee records to PDF (client-side using jsPDF)
- Built with Cloudflare Workers (module-style), D1, React, and Tailwind (play CDN)

## Prerequisites

- Node.js (v18 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

## Setup

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd employee-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Login to Cloudflare:
   ```bash
   wrangler login
   ```

4. Set up D1 database:
   - The project uses a D1 database named `employee_db`
   - The database configuration is already set in `wrangler.jsonc`
   - If you need to create a new database:
     ```bash
     wrangler d1 create employee_db
     ```
   - If required, create table manually:
   ```
   CREATE TABLE IF NOT EXISTS employees (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   nirc TEXT NOT NULL UNIQUE,
   full_name TEXT NOT NULL,
   position TEXT,
   email TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );  
   ```
   - Update the `database_id` in `wrangler.jsonc` with your new database ID if needed

## Development

Run the development server:
```bash
wrangler dev
```

The application will be available at `http://localhost:8787`

## Deployment

1. Deploy to Cloudflare Workers:
   ```bash
   wrangler deploy
   ```

2. Your application will be available at `https://<worker-name>.<your-subdomain>.workers.dev`



