/* ============================================
   QLINIC - Global JavaScript Helpers
   ============================================ */

/* ── Seed demo data if not present ── */
(function seedData() {
  if (!localStorage.getItem('ql_seeded')) {
    const patients = [
      { id: 'P001', name: 'Arjun Menon',    email: 'arjun@demo.com',   password: 'demo123', phone: '9876543210', dob: '1990-05-14', gender: 'Male'   },
      { id: 'P002', name: 'Priya Nair',     email: 'priya@demo.com',   password: 'demo123', phone: '9876543211', dob: '1994-08-22', gender: 'Female' },
    ];
    const doctors = [
      { id: 'D001', name: 'Dr. Rajan Pillai',    email: 'rajan@qlinic.com',  password: 'doc123', speciality: 'General Medicine', phone: '9900000001', available: true },
      { id: 'D002', name: 'Dr. Sheeba Thomas',   email: 'sheeba@qlinic.com', password: 'doc123', speciality: 'Paediatrics',       phone: '9900000002', available: true },
      { id: 'D003', name: 'Dr. Anil Kumar',      email: 'anil@qlinic.com',   password: 'doc123', speciality: 'Orthopaedics',      phone: '9900000003', available: false },
    ];
    const appointments = [
      { id: 'A001', patientId: 'P001', doctorId: 'D001', date: '2025-12-10', time: '10:00', status: 'Confirmed', token: 3, prescription: '' },
      { id: 'A002', patientId: 'P002', doctorId: 'D002', date: '2025-12-11', time: '11:00', status: 'Pending',   token: 7, prescription: '' },
    ];
    localStorage.setItem('ql_patients',     JSON.stringify(patients));
    localStorage.setItem('ql_doctors',      JSON.stringify(doctors));
    localStorage.setItem('ql_appointments', JSON.stringify(appointments));
    localStorage.setItem('ql_token_counter', '8');
    localStorage.setItem('ql_seeded', '1');
  }
})();

/* ── Auth helpers ── */
const Auth = {
  get session()  { return JSON.parse(sessionStorage.getItem('ql_session') || 'null'); },
  set session(v) { sessionStorage.setItem('ql_session', JSON.stringify(v)); },
  clear()        { sessionStorage.removeItem('ql_session'); },

  requireRole(role, redirectTo) {
    const s = this.session;
    if (!s || s.role !== role) {
      window.location.href = redirectTo || 'index.html';
    }
    return s;
  },

  logout() {
    this.clear();
    window.location.href = 'index.html';
  }
};

/* ── Data helpers ── */
const DB = {
  getPatients()      { return JSON.parse(localStorage.getItem('ql_patients')     || '[]'); },
  getDoctors()       { return JSON.parse(localStorage.getItem('ql_doctors')      || '[]'); },
  getAppointments()  { return JSON.parse(localStorage.getItem('ql_appointments') || '[]'); },
  savePatients(d)    { localStorage.setItem('ql_patients',     JSON.stringify(d)); },
  saveDoctors(d)     { localStorage.setItem('ql_doctors',      JSON.stringify(d)); },
  saveAppointments(d){ localStorage.setItem('ql_appointments', JSON.stringify(d)); },

  patientById(id)    { return this.getPatients().find(p => p.id === id); },
  doctorById(id)     { return this.getDoctors().find(d => d.id === id); },

  nextToken() {
    let c = parseInt(localStorage.getItem('ql_token_counter') || '0') + 1;
    localStorage.setItem('ql_token_counter', c);
    return c;
  },

  nextId(prefix, list) {
    const nums = list.map(x => parseInt(x.id.replace(prefix, '')) || 0);
    const next  = (Math.max(0, ...nums) + 1).toString().padStart(3, '0');
    return prefix + next;
  }
};

/* ── UI helpers ── */
function showAlert(containerId, msg, type = 'error') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type === 'error' ? 'error' : type}">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(s) {
  const map = { Confirmed: 'badge-green', Pending: 'badge-yellow', Cancelled: 'badge-red', Completed: 'badge-blue' };
  return `<span class="badge ${map[s] || 'badge-gray'}">${s}</span>`;
}
