const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET not set — sessions will reset on restart.');
}

const db = new DatabaseSync(path.join(__dirname, 'data.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS consents (
    user_id INTEGER PRIMARY KEY,
    agreed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student TEXT NOT NULL,
    counselor_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS concerns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    date TEXT NOT NULL
  );
`);

const insertUser = db.prepare('INSERT INTO users (username, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)');
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
const getAllUsers = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY id');
const updateUserRole = db.prepare('UPDATE users SET role = ? WHERE id = ?');

const hasConsented = db.prepare('SELECT agreed_at FROM consents WHERE user_id = ?');
const recordConsent = db.prepare('INSERT OR IGNORE INTO consents (user_id, agreed_at) VALUES (?, ?)');

const insertAppointment = db.prepare('INSERT INTO appointments (student, counselor_id, date, time, purpose, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const getAppointmentsAll = db.prepare('SELECT * FROM appointments ORDER BY date, time');
const getAppointmentsByStudent = db.prepare('SELECT * FROM appointments WHERE student = ? ORDER BY date, time');
const getAppointmentById = db.prepare('SELECT * FROM appointments WHERE id = ?');
const updateAppointmentStatus = db.prepare('UPDATE appointments SET status = ? WHERE id = ?');

const insertConcern = db.prepare('INSERT INTO concerns (student, category, title, description, status, date) VALUES (?, ?, ?, ?, ?, ?)');
const getConcernsAll = db.prepare('SELECT * FROM concerns ORDER BY id DESC');
const getConcernsByStudent = db.prepare('SELECT * FROM concerns WHERE student = ? ORDER BY id DESC');
const getConcernById = db.prepare('SELECT * FROM concerns WHERE id = ?');
const updateConcernStatus = db.prepare('UPDATE concerns SET status = ? WHERE id = ?');

const today = () => new Date().toISOString().slice(0, 10);

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
  if (n > 0) return;
  const now = today();
  insertUser.run('admin', 'Alice Admin', bcrypt.hashSync('admin123', 10), 'admin', now);
  insertUser.run('user', 'Bob User', bcrypt.hashSync('user123', 10), 'user', now);
}
seedIfEmpty();

const COUNSELORS = [
  {
    id: 1,
    name: 'Ma. Clarissn H. Cardino, REC, RPm',
    title: 'Guidance Coordinator',
    cluster: 'Guidance Counselor – Allied Health and Business Clusters'
  },
  {
    id: 2,
    name: 'Anne Gelp B. Vanguardia, RC, RPm',
    title: 'Guidance Counselor',
    cluster: 'Technology and HUMSS Cluster'
  },
  {
    id: 3,
    name: 'Alodia M. Endrinal',
    title: 'Guidance Associate',
    cluster: null
  },
  {
    id: 4,
    name: 'Brian Nickie B. Guevarra, RPm',
    title: 'Psychometrician',
    cluster: null
  }
];

const counselorById = (id) => COUNSELORS.find((c) => c.id === id);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.locals.path = req.path;
  next();
});
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
  })
);

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session.user && roles.includes(req.session.user.role)) return next();
    res.status(403).render('403', { user: req.session.user });
  };
}

function requireConsent(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (hasConsented.get(req.session.user.id)) return next();
  res.redirect('/nda');
}

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect('/home');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const account = getUserByUsername.get(username);
  if (account && bcrypt.compareSync(String(req.body.password || ''), account.password_hash)) {
    req.session.user = {
      id: account.id,
      username: account.username,
      name: account.name,
      role: account.role
    };
    return res.redirect('/home');
  }
  res.status(401).render('login', { error: 'Invalid username or password' });
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');

  let error = null;
  if (!username || !name || !password) error = 'Please fill in all fields.';
  else if (!/^[a-z0-9_]{3,20}$/.test(username))
    error = 'Username must be 3–20 characters (letters, numbers, underscore).';
  else if (password.length < 6) error = 'Password must be at least 6 characters.';
  else if (password !== confirm) error = 'Passwords do not match.';
  else if (getUserByUsername.get(username)) error = 'That username is already taken.';

  if (error) return res.status(400).render('register', { error });

  const result = insertUser.run(username, name, bcrypt.hashSync(password, 10), 'user', today());
  req.session.user = {
    id: Number(result.lastInsertRowid),
    username,
    name,
    role: 'user'
  };
  res.redirect('/home');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/nda', requireAuth, (req, res) => {
  if (hasConsented.get(req.session.user.id)) return res.redirect('/home');
  res.render('nda', { user: req.session.user });
});

app.post('/nda', requireAuth, (req, res) => {
  if (req.body.agree) {
    recordConsent.run(req.session.user.id, new Date().toISOString());
  }
  res.redirect('/home');
});

app.get('/home', requireAuth, requireConsent, (req, res) => {
  res.render('home', { user: req.session.user });
});

app.get('/letter', requireAuth, requireConsent, (req, res) => {
  res.render('letter', { user: req.session.user });
});

app.get('/guidance', requireAuth, requireConsent, (req, res) => {
  res.render('guidance', { user: req.session.user, counselors: COUNSELORS });
});

app.get('/appointments', requireAuth, requireConsent, (req, res) => {
  const rows =
    req.session.user.role === 'admin'
      ? getAppointmentsAll.all()
      : getAppointmentsByStudent.all(req.session.user.username);
  res.render('appointments', {
    user: req.session.user,
    appointments: rows,
    counselors: COUNSELORS,
    counselorById,
    error: null
  });
});

app.post('/appointments', requireAuth, requireConsent, (req, res) => {
  const { counselorId, date, time, purpose } = req.body;
  const counselor = counselorById(Number(counselorId));
  const error = !counselor || !date || !time
    ? 'Please choose a counselor, a date, and a time.'
    : null;
  if (error) {
    return res.status(400).render('appointments', {
      user: req.session.user,
      appointments:
        req.session.user.role === 'admin'
          ? getAppointmentsAll.all()
          : getAppointmentsByStudent.all(req.session.user.username),
      counselors: COUNSELORS,
      counselorById,
      error
    });
  }
  insertAppointment.run(
    req.session.user.username,
    counselor.id,
    date,
    time,
    purpose || 'General consultation',
    'scheduled',
    today()
  );
  res.redirect('/appointments');
});

app.post('/appointments/:id/complete', requireAuth, requireConsent, requireRole('admin'), (req, res) => {
  const appt = getAppointmentById.get(Number(req.params.id));
  if (appt) updateAppointmentStatus.run('completed', appt.id);
  res.redirect('/appointments');
});

app.post('/appointments/:id/cancel', requireAuth, requireConsent, requireRole('admin'), (req, res) => {
  const appt = getAppointmentById.get(Number(req.params.id));
  if (appt) updateAppointmentStatus.run('cancelled', appt.id);
  res.redirect('/appointments');
});

app.get('/concerns', requireAuth, requireConsent, (req, res) => {
  res.render('concerns', {
    user: req.session.user,
    concerns:
      req.session.user.role === 'admin'
        ? getConcernsAll.all()
        : getConcernsByStudent.all(req.session.user.username),
    error: null
  });
});

app.post('/concerns', requireAuth, requireConsent, (req, res) => {
  const { category, title, description } = req.body;
  const error = !category || !title || !description
    ? 'Please fill in the category, title, and description.'
    : null;
  if (error) {
    return res.status(400).render('concerns', {
      user: req.session.user,
      concerns:
        req.session.user.role === 'admin'
          ? getConcernsAll.all()
          : getConcernsByStudent.all(req.session.user.username),
      error
    });
  }
  insertConcern.run(
    req.session.user.username,
    category,
    title,
    description,
    'open',
    today()
  );
  res.redirect('/concerns');
});

app.post('/concerns/:id/resolve', requireAuth, requireConsent, requireRole('admin'), (req, res) => {
  const c = getConcernById.get(Number(req.params.id));
  if (c) updateConcernStatus.run(c.status === 'resolved' ? 'open' : 'resolved', c.id);
  res.redirect('/concerns');
});

app.get('/profile', requireAuth, requireConsent, (req, res) => {
  res.render('profile', { user: req.session.user });
});

app.get('/admin', requireAuth, requireConsent, requireRole('admin'), (req, res) => {
  res.render('admin', { user: req.session.user, users: getAllUsers.all() });
});

app.post('/admin/users/:id/role', requireAuth, requireConsent, requireRole('admin'), (req, res) => {
  const target = getUserById.get(Number(req.params.id));
  if (target && target.id !== req.session.user.id) {
    updateUserRole.run(target.role === 'admin' ? 'user' : 'admin', target.id);
  }
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`GuideTrack site running at http://localhost:${PORT}`);
  console.log('Seed logins: admin/admin123 (admin), user/user123 (user) — or register a new account.');
});