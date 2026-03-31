# QLINIC – Supabase Backend Setup Guide

## What Changed

Your project used `localStorage` for all data. Every HTML page called
`DB.getPatients()`, `DB.getAppointments()` etc., which read from browser storage.

The new `js/app.js` keeps **the exact same function names** but makes them
`async` and talks to Supabase instead. This means every call site in your
HTML pages needs to be `await`-ed.

---

## Step 1 – Create a Supabase Project

1. Go to https://supabase.com → New project
2. Note your **Project URL** and **anon public key** (Settings → API)

---

## Step 2 – Run the SQL Schema

1. Supabase dashboard → SQL Editor → New query
2. Paste the contents of `supabase_schema.sql` and click **Run**

This creates: `hospitals`, `hospital_admins`, `doctors`, `patients`,
`appointments`, `token_counters`, `super_admins` — with Row Level Security.

---

## Step 3 – Update app.js

Open `js/app.js` and replace the two placeholder lines at the top:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_KEY';
```

---

## Step 4 – Add the Supabase CDN script to every HTML page

In **every** `.html` file, add this **before** the `app.js` script tag:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="js/app.js"></script>
```

---

## Step 5 – Update all async call sites in your HTML pages

Because DB methods are now `async`, every place that called them needs `await`
inside an `async` function.

### Before (old localStorage style)
```js
const patients = DB.getPatients();
renderTable(patients);
```

### After (Supabase async style)
```js
async function load() {
  const patients = await DB.getPatients();
  renderTable(patients);
}
load();
```

### Login pages – swap the login logic

**patient_login.html** – find the login button handler and replace:
```js
// OLD
const patient = DB.getPatients().find(p => p.email === email && p.password === password);
if (!patient) { showAlert('alertBox', 'Invalid credentials'); return; }
Auth.session = { id: patient.id, name: patient.name, role: 'patient' };
location.href = 'patient_dashboard.html';

// NEW
try {
  await Auth.loginPatient(email, password);
  location.href = 'patient_dashboard.html';
} catch(e) {
  showAlert('alertBox', e.message || 'Invalid credentials');
}
```

**doctor_login.html** – same pattern using `Auth.loginDoctor(email, password)`

**admin_login.html** – same pattern using `Auth.loginAdmin(username, password)`

**superadmin_login.html** – same pattern using `Auth.loginSuperAdmin(username, password)`

**patient_register.html**:
```js
// OLD
const patients = DB.getPatients();
patients.push({ id: DB.nextId('P', patients), name, email, ... });
DB.savePatients(patients);

// NEW
try {
  await Auth.registerPatient({ name, email, phone, dob, gender, password });
  location.href = 'patient_login.html';
} catch(e) {
  showAlert('alertBox', e.message);
}
```

### Dashboard pages – wrap in async init

Every dashboard page has a block like:
```js
const session = Auth.requireRole('patient', 'patient_login.html');
const appts   = DB.getAppointments();
```

Change to:
```js
async function init() {
  const session = Auth.requireRole('patient', 'patient_login.html');
  if (!session) return;
  const appts = await DB.getAppointmentsByPatient(session.id);
  renderAppointments(appts);
}
init();
```

### Booking page key change

```js
// OLD
const appointments = DB.getAppointments();
const token = DB.nextToken();
const appt  = { id: DB.nextId('A', appointments), ... };
DB.saveAppointments(appointments);
sessionStorage.setItem('ql_last_appt', JSON.stringify(appt));

// NEW
try {
  const appt = await DB.bookAppointment({ patientId, doctorId, hospitalId, date, time });
  sessionStorage.setItem('ql_last_appt', JSON.stringify(appt));
  location.href = 'patient_token.html';
} catch(e) {
  showAlert('alertBox', e.message);
}
```

### Doctor token control

```js
// OLD
const all = DB.getAppointments();
all[idx].status = 'Completed';
DB.saveAppointments(all);

// NEW
await DB.updateAppointment(appt.id, { status: 'Completed' });
```

---

## Step 6 – Create the Super Admin

In the Supabase dashboard → Authentication → Users → Add user:
- Email: `superadmin@qlinic-superadmin.local`
- Password: (choose a strong one)

Then in SQL Editor:
```sql
insert into public.super_admins (username, auth_user_id)
values ('superadmin', '<paste the user UUID from Auth → Users>');
```

---

## Step 7 – Create demo Hospital Admin

In Authentication → Users → Add user:
- Email: `admin@qlinic-admin.local`
- Password: `admin123`

Then in SQL Editor:
```sql
insert into public.hospital_admins (id, hospital_id, hospital_name, username, name, auth_user_id)
values ('A_DEMO1', 'H_DEMO1', 'QLINIC City Hospital', 'admin', 'Administrator', '<uuid>');
```

---

## Key differences from localStorage version

| Feature | localStorage | Supabase |
|---|---|---|
| Data persistence | Browser only | Cloud database |
| Multi-device | ❌ No | ✅ Yes |
| Real-time token queue | ❌ No | ✅ Yes (Realtime) |
| Authentication | Plain password in storage | Secure JWT auth |
| DB methods | Synchronous | Async / await |
| Column naming | camelCase (`patientId`) | snake_case (`patient_id`) |

> **Note on column names:** Supabase uses snake_case. The new `app.js` maps these
> transparently, but if you write raw queries in your HTML files, use
> `patient_id`, `doctor_id`, `hospital_id`, `created_at` etc.

---

## Optional: Enable Realtime for token board

In Supabase dashboard → Database → Replication → enable `appointments` table.

Then in `token_display_board.html` you can subscribe:
```js
_supabase.channel('appts')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
    loadQueue(); // re-render
  })
  .subscribe();
```

This gives you a live-updating token queue without page refresh — much better
than the old polling approach!
