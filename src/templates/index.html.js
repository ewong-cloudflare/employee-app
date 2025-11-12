// src/templates/index.html.js
/**
 * Exports the HTML template as a string.
 * The React app JS will be injected at the end of the body by importing src/static/app.js
 */

import appScript from "../static/app.js";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Employee Directory</title>

  <!-- Tailwind Play CDN for prototyping -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Simple meta and security headers -->
  <meta name="description" content="Employee directory using Cloudflare Workers + D1" />
</head>
<body class="bg-slate-50 min-h-screen">
  <div id="root" class="container mx-auto p-6"></div>

  <!-- jsPDF for client-side PDF export -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  <!-- React + ReactDOM from unpkg (UMD) -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

  <!-- App script (embedded) -->
  <script type="module">
  ${appScript}
  </script>
</body>
</html>
`;

export default HTML;
