// src/static/app.js
/**
 * Exports the client-side React application as a JS string (module).
 *
 * This file uses:
 *  - React (global: React)
 *  - ReactDOM (global: ReactDOM)
 *  - jsPDF via global window.jspdf (UMD)
 *
 * We export as a string so the Worker can embed it into HTML without bundling.
 *
 * Note: For larger projects, use an actual build pipeline. This approach keeps the example simple and
 * meets the "separate files" requirement.
 */

const APP_SCRIPT = `
// Simple React + Tailwind client application

const { useState, useEffect, useRef } = React;

function validateEmail(email) {
  return /^\\S+@\\S+\\.\\S+$/.test(email);
}

function ValidateNIRC(nirc) {
  // Simple check: non-empty and alphanumeric
  return /^\\w{3,20}$/.test(nirc);
}

function App() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nirc: '', fullName: '', position: '', email: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    fetchList();
    return () => { mounted.current = false; }
  }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      if (mounted.current) setEmployees(data);
    } catch (err) {
      console.error(err);
      setError('Unable to load employees');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!ValidateNIRC(form.nirc)) {
      setError('Invalid NIRC (use 3-20 alphanumeric characters)');
      return;
    }
    if (!form.fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (form.email && !validateEmail(form.email)) {
      setError('Invalid email address');
      return;
    }
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nirc: form.nirc.trim(),
          fullName: form.fullName.trim(),
          position: form.position.trim(),
          email: form.email.trim()
        })
      });
      if (res.status === 409) {
        const { message } = await res.json();
        setError(message || 'Employee already exists');
        return;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'Failed to create employee');
      }
      const created = await res.json();
      setSuccess('Employee added');
      setForm({ nirc:'', fullName:'', position:'', email:'' });
      // refresh list
      fetchList();
      setTimeout(()=>setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Unknown error');
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) {
      setError('No employees selected');
      return;
    }

    if (!confirm('Are you sure you want to delete ' + selectedIds.length + ' employee(s)?')) {
      return;
    }

    try {
      const res = await fetch('/api/employees', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to delete employees');
      }
      if (!data.success) {
        throw new Error(data.errors ? data.errors.join(', ') : 'Failed to delete employees');
      }

      setSuccess('Successfully deleted ' + data.deletedCount + ' employee(s)');
      setSelectedIds([]);
      fetchList();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to delete employees');
    }
  }

  function toggleSelectAll(e) {
    if (e.target.checked) {
      setSelectedIds(employees.map(emp => emp.id));
    } else {
      setSelectedIds([]);
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  }

  function exportPDF() {
    // Using jsPDF (UMD)
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      doc.setFontSize(16);
      doc.text("Employee Records", 14, 20);

      doc.setFontSize(10);
      const rows = employees.map((emp, i) => [
        String(emp.id),
        emp.nirc,
        emp.full_name,
        emp.position || '',
        emp.email || ''
      ]);

      // simple table layout
      const startY = 30;
      const lineHeight = 7;
      // header
      doc.text("ID", 14, startY);
      doc.text("NIRC", 30, startY);
      doc.text("Full Name", 80, startY);
      doc.text("Position", 140, startY);
      doc.text("Email", 170, startY);

      let y = startY + lineHeight;
      rows.forEach(row => {
        doc.text(row[0], 14, y);
        doc.text(row[1], 30, y);
        doc.text(row[2], 80, y);
        doc.text(row[3], 140, y);
        doc.text(row[4], 170, y);
        y += lineHeight;
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
      });

      doc.save('employees.pdf');
    } catch (err) {
      alert('PDF export failed: ' + (err.message || err));
      console.error(err);
    }
  }

  return React.createElement('div', { className: 'max-w-4xl mx-auto' },
    React.createElement('h1', { className: 'text-2xl font-bold mb-4' }, 'Employee Directory'),
    React.createElement('div', { className: 'grid md:grid-cols-2 gap-6 mb-6' },
      React.createElement('form', { onSubmit, className: 'bg-white p-4 rounded shadow' },
        React.createElement('h2', { className: 'font-semibold mb-2' }, 'Add Employee'),
        error && React.createElement('div', { className: 'bg-red-100 text-red-800 p-2 mb-2 rounded' }, error),
        success && React.createElement('div', { className: 'bg-green-100 text-green-800 p-2 mb-2 rounded' }, success),

        React.createElement('label', { className: 'block mb-2' },
          React.createElement('span', { className: 'text-sm text-slate-700 block' }, 'NIRC (National ID)'),
          React.createElement('input', {
            value: form.nirc, onChange: e => setForm({ ...form, nirc: e.target.value }),
            className: 'mt-1 block w-full border rounded p-2', placeholder: 'e.g. A1234567'
          })
        ),

        React.createElement('label', { className: 'block mb-2' },
          React.createElement('span', { className: 'text-sm text-slate-700 block' }, 'Full Name'),
          React.createElement('input', {
            value: form.fullName, onChange: e => setForm({ ...form, fullName: e.target.value }),
            className: 'mt-1 block w-full border rounded p-2', placeholder: 'Full name'
          })
        ),

        React.createElement('label', { className: 'block mb-2' },
          React.createElement('span', { className: 'text-sm text-slate-700 block' }, 'Position'),
          React.createElement('input', {
            value: form.position, onChange: e => setForm({ ...form, position: e.target.value }),
            className: 'mt-1 block w-full border rounded p-2', placeholder: 'Position (optional)'
          })
        ),

        React.createElement('label', { className: 'block mb-4' },
          React.createElement('span', { className: 'text-sm text-slate-700 block' }, 'Email'),
          React.createElement('input', {
            value: form.email, onChange: e => setForm({ ...form, email: e.target.value }),
            className: 'mt-1 block w-full border rounded p-2', placeholder: 'Email (optional)'
          })
        ),

        React.createElement('div', { className: 'flex gap-2' },
          React.createElement('button', { type: 'submit', className: 'bg-blue-600 text-white px-4 py-2 rounded' }, 'Add'),
          React.createElement('button', { type: 'button', onClick: () => { setForm({ nirc:'', fullName:'', position:'', email:'' }); setError(''); setSuccess(''); }, className: 'bg-gray-200 px-4 py-2 rounded' }, 'Clear')
        )
      ),

      React.createElement('div', { className: 'bg-white p-4 rounded shadow' },
        React.createElement('h2', { className: 'font-semibold mb-2' }, 'Actions'),
        React.createElement('p', { className: 'text-sm text-slate-600 mb-4' }, 'You can download all records as a PDF (client-side).'),
        React.createElement('div', null,
          React.createElement('button', { onClick: exportPDF, className: 'bg-green-600 text-white px-4 py-2 rounded' }, 'Export to PDF'),
          React.createElement('button', { onClick: fetchList, className: 'ml-2 bg-gray-200 px-4 py-2 rounded' }, 'Refresh'),
          selectedIds.length > 0 && React.createElement('button', { 
            onClick: deleteSelected, 
            className: 'ml-2 bg-red-600 text-white px-4 py-2 rounded'
          }, 'Delete Selected (' + selectedIds.length + ')')
        )
      )
    ),

    React.createElement('div', { className: 'bg-white p-4 rounded shadow' },
      React.createElement('h2', { className: 'font-semibold mb-2' }, 'Employees'),
      loading ? React.createElement('div', null, 'Loading...') :
      (employees.length === 0 ? React.createElement('div', null, 'No records yet.') :
        React.createElement('table', { className: 'w-full table-auto text-sm' },
          React.createElement('thead', null,
            React.createElement('tr', { className: 'text-left border-b' },
              React.createElement('th', { className: 'p-2' }, 
                React.createElement('input', {
                  type: 'checkbox',
                  checked: selectedIds.length === employees.length,
                  onChange: toggleSelectAll,
                  className: 'rounded'
                })
              ),
              React.createElement('th', { className: 'p-2' }, 'NIRC'),
              React.createElement('th', { className: 'p-2' }, 'Full name'),
              React.createElement('th', { className: 'p-2' }, 'Position'),
              React.createElement('th', { className: 'p-2' }, 'Email'),
              React.createElement('th', { className: 'p-2' }, 'Added')
            )
          ),
          React.createElement('tbody', null,
            employees.map(emp =>
              React.createElement('tr', { 
                key: emp.id, 
                className: 'border-b hover:bg-slate-50 ' + (selectedIds.includes(emp.id) ? 'bg-blue-50' : '')
              },
                React.createElement('td', { className: 'p-2 align-top' }, 
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: selectedIds.includes(emp.id),
                    onChange: () => toggleSelect(emp.id),
                    className: 'rounded'
                  })
                ),
                React.createElement('td', { className: 'p-2 align-top' }, emp.nirc),
                React.createElement('td', { className: 'p-2 align-top' }, emp.full_name),
                React.createElement('td', { className: 'p-2 align-top' }, emp.position),
                React.createElement('td', { className: 'p-2 align-top' }, emp.email),
                React.createElement('td', { className: 'p-2 align-top' }, new Date(emp.created_at).toLocaleString())
              )
            )
          )
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(App)
);
`;

export default APP_SCRIPT;
