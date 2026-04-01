/* ============================================================
   QLINIC – app.js  (Supabase Backend)
   ============================================================
   Replace your old js/app.js with this file.
   Set your Supabase project URL and anon key below.
   ============================================================ */

const SUPABASE_URL = 'https://bxasvcackgszdmhurrje.supabase.co';   // ← change
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4YXN2Y2Fja2dzemRtaHVycmplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NDMxMDgsImV4cCI6MjA5MDUxOTEwOH0.RP04Cc7EbjJMqtjY1NDdK-ghLyKpyle_qMMKFkFjuJc';                       // ← change

/* ── Supabase client (loaded from CDN script tag in HTML) ── */
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ============================================================
   AUTH  –  wraps Supabase Auth + session
   ============================================================ */
const Auth = {
  async init() {
    const { data } = await _supabase.auth.getSession();
    _supabase.auth.onAuthStateChange((_event, session) => { /* track if needed */ });
  },

  get session() {
    return JSON.parse(sessionStorage.getItem('ql_session') || 'null');
  },
  set session(v) {
    sessionStorage.setItem('ql_session', JSON.stringify(v));
  },
  clear() { sessionStorage.removeItem('ql_session'); },

  requireRole(role, redirectTo) {
    const s = this.session;
    if (!s || s.role !== role) {
      window.location.href = redirectTo || 'index.html';
      return null;
    }
    return s;
  },

  async logout() {
    await _supabase.auth.signOut();
    this.clear();
    window.location.href = 'index.html';
  },

  /* Patient sign-up */
  async registerPatient({ name, email, phone, dob, gender, password }) {
    const { data: authData, error: authErr } = await _supabase.auth.signUp({ email, password });
    if (authErr) throw authErr;

    const { data: existing } = await _supabase.from('patients').select('id');
    const nums = (existing || []).map(p => parseInt(p.id.replace('P', '')) || 0);
    const newId = 'P' + String((Math.max(0, ...nums) + 1)).padStart(3, '0');

    const { error } = await _supabase.from('patients').insert({
      id: newId, name, email, phone, dob: dob || null, gender,
      auth_user_id: authData.user.id
    });
    if (error) throw error;
    return { id: newId, name, email };
  },

  /* Patient login */
  async loginPatient(email, password) {
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: patient, error: fetchErr } = await _supabase
      .from('patients').select('*').eq('email', email).single();
    if (fetchErr || !patient) throw new Error('Patient record not found.');
    this.session = { id: patient.id, name: patient.name, role: 'patient' };
    return patient;
  },

  /* Doctor login */
  async loginDoctor(email, password) {
    const { error } = await _supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: doctor, error: fetchErr } = await _supabase
      .from('doctors').select('*').eq('email', email).single();
    if (fetchErr || !doctor) throw new Error('Doctor record not found.');
    this.session = { id: doctor.id, name: doctor.name, role: 'doctor', hospitalId: doctor.hospital_id };
    return doctor;
  },

  /* Admin login (username-based) */
  async loginAdmin(username, password) {
    const { data: admin, error: adminErr } = await _supabase
      .from('hospital_admins').select('*').eq('username', username).single();
    if (adminErr || !admin) throw new Error('Admin not found.');
    const { error } = await _supabase.auth.signInWithPassword({
      email: username + '@qlinic.com', password
    });
    if (error) throw error;
    this.session = {
      id: admin.id, name: admin.name, role: 'admin',
      hospitalId: admin.hospital_id, hospitalName: admin.hospital_name
    };
    return admin;
  },

  /* Super Admin login */
  async loginSuperAdmin(username, password) {
    const { error } = await _supabase.auth.signInWithPassword({
      email: username + '@qlinic.com', password
    });
    if (error) throw error;
    const { data: sa, error: saErr } = await _supabase
      .from('super_admins').select('*').eq('username', username).single();
    if (saErr || !sa) throw new Error('Super admin record not found.');
    this.session = { id: sa.id, name: 'Super Admin', role: 'superadmin' };
    return sa;
  }
};

/* ============================================================
   DB  –  Patient / Doctor / Appointment helpers
   ============================================================ */
const DB = {
  /* Patients */
  async getPatients() {
    const { data, error } = await _supabase.from('patients').select('*');
    if (error) throw error; return data || [];
  },
  async patientById(id) {
    const { data } = await _supabase.from('patients').select('*').eq('id', id).single();
    return data;
  },
  async updatePatient(id, fields) {
    const { error } = await _supabase.from('patients').update(fields).eq('id', id);
    if (error) throw error;
  },

  /* Doctors */
  async getDoctors() {
    const { data, error } = await _supabase.from('doctors').select('*');
    if (error) throw error; return data || [];
  },
  async getDoctorsByHospital(hospitalId) {
    const { data, error } = await _supabase.from('doctors').select('*').eq('hospital_id', hospitalId);
    if (error) throw error; return data || [];
  },
  async doctorById(id) {
    const { data } = await _supabase.from('doctors').select('*').eq('id', id).single();
    return data;
  },
  async addDoctor({ hospitalId, name, email, speciality, phone }) {
    const { data: existing } = await _supabase.from('doctors').select('id');
    const nums = (existing || []).map(d => parseInt(d.id.replace('D', '')) || 0);
    const newId = 'D' + String((Math.max(0, ...nums) + 1)).padStart(3, '0');
    const { error } = await _supabase.from('doctors').insert({
      id: newId, hospital_id: hospitalId, name, email,
      speciality, phone: phone || null, available: true
    });
    if (error) throw error;
    return newId;
  },
  async toggleDoctorAvailability(id) {
    const doc = await this.doctorById(id);
    if (!doc) throw new Error('Doctor not found');
    const { error } = await _supabase.from('doctors').update({ available: !doc.available }).eq('id', id);
    if (error) throw error;
  },
  async deleteDoctor(id) {
    await _supabase.from('appointments').delete().eq('doctor_id', id);
    const { error } = await _supabase.from('doctors').delete().eq('id', id);
    if (error) throw error;
  },

  /* Appointments */
  async getAppointments() {
    const { data, error } = await _supabase.from('appointments').select('*');
    if (error) throw error; return data || [];
  },
  async getAppointmentsByHospital(hospitalId) {
    const { data, error } = await _supabase.from('appointments').select('*').eq('hospital_id', hospitalId);
    if (error) throw error; return data || [];
  },
  async getAppointmentsByPatient(patientId) {
    const { data, error } = await _supabase.from('appointments').select('*').eq('patient_id', patientId);
    if (error) throw error; return data || [];
  },
  async getAppointmentsByDoctor(doctorId) {
    const { data, error } = await _supabase.from('appointments').select('*').eq('doctor_id', doctorId);
    if (error) throw error; return data || [];
  },
  async updateAppointment(id, fields) {
    const { error } = await _supabase.from('appointments').update(fields).eq('id', id);
    if (error) throw error;
  },
  async cancelAppointment(id) { await this.updateAppointment(id, { status: 'Cancelled' }); },
  async deleteAppointment(id) {
    const { error } = await _supabase.from('appointments').delete().eq('id', id);
    if (error) throw error;
  },

  /* Book appointment */
  async bookAppointment({ patientId, doctorId, hospitalId, date, time }) {
    const token = await this.nextToken(doctorId, date);
    const { data: existing } = await _supabase.from('appointments').select('id');
    const nums = (existing || []).map(a => parseInt(a.id.replace('A', '')) || 0);
    const newId = 'A' + String((Math.max(0, ...nums) + 1)).padStart(3, '0');
    const appt = {
      id: newId, patient_id: patientId, doctor_id: doctorId,
      hospital_id: hospitalId, date, time, token, status: 'Pending', prescription: ''
    };
    const { error } = await _supabase.from('appointments').insert(appt);
    if (error) throw error;
    return appt;
  },

  /* Token counter (per doctor per day) */
  async nextToken(doctorId, date) {
    const { data, error } = await _supabase
      .from('token_counters').select('counter')
      .eq('doctor_id', doctorId).eq('date', date).single();
    const current = (!error && data) ? data.counter : 0;
    const next = current + 1;
    await _supabase.from('token_counters').upsert({ doctor_id: doctorId, date, counter: next });
    return next;
  },

  async savePrescription(appointmentId, prescription) {
    await this.updateAppointment(appointmentId, { prescription, status: 'Completed' });
  }
};

/* ============================================================
   SuperDB  –  Hospital & Admin management
   ============================================================ */
const SuperDB = {
  async getHospitals() {
    const { data, error } = await _supabase.from('hospitals').select('*');
    if (error) throw error; return data || [];
  },
  async hospitalById(id) {
    const { data } = await _supabase.from('hospitals').select('*').eq('id', id).single();
    return data;
  },
  async addHospital({ name, city, adminName, adminUsername, adminPassword }) {
    const newHId = 'H_' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const { error: hErr } = await _supabase.from('hospitals').insert({ id: newHId, name, city, status: 'active' });
    if (hErr) throw hErr;

    const adminEmail = adminUsername + '@qlinic.com';
    const { data: authData, error: authErr } = await _supabase.auth.signUp({
      email: adminEmail,
      password: adminPassword,
      options: { data: { role: 'admin' }, emailRedirectTo: null }
    });
    if (authErr) throw authErr;

    const admins = await this.getAdmins();
    const nums = admins.map(a => parseInt(a.id.replace('A_', '')) || 0);
    const newAId = 'A_' + String((Math.max(0, ...nums) + 1)).padStart(3, '0');
    const { error: aErr } = await _supabase.from('hospital_admins').insert({
      id: newAId, hospital_id: newHId, hospital_name: name,
      username: adminUsername, name: adminName,
      auth_user_id: authData?.user?.id || null
    });
    if (aErr) throw aErr;
    return { hospitalId: newHId, adminId: newAId };
  },
  async updateHospital(id, fields) {
    const { error } = await _supabase.from('hospitals').update(fields).eq('id', id);
    if (error) throw error;
  },
  async deleteHospital(id) {
    const { error } = await _supabase.from('hospitals').delete().eq('id', id);
    if (error) throw error;
  },
  async getAdmins() {
    const { data, error } = await _supabase.from('hospital_admins').select('*');
    if (error) throw error; return data || [];
  },
  async adminByUsername(username) {
    const { data } = await _supabase.from('hospital_admins').select('*').eq('username', username).single();
    return data;
  }
};

/* ============================================================
   HospitalSession  – unchanged (sessionStorage)
   ============================================================ */
const HospitalSession = {
  get() { return JSON.parse(sessionStorage.getItem('ql_selected_hospital') || 'null'); },
  set(h) { sessionStorage.setItem('ql_selected_hospital', JSON.stringify(h)); },
  clear() { sessionStorage.removeItem('ql_selected_hospital'); },
  getId() { const h = this.get(); return h ? h.id : null; },
  getName() { const h = this.get(); return h ? h.name : null; }
};

/* ============================================================
   UI Helpers  – unchanged
   ============================================================ */
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

/* ── Init ── */
Auth.init().catch(console.error);
