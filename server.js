const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { apiRequest } = require('./api-client');

const app = express();
const PORT = process.env.PORT || 3000;

const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET not set — sessions will reset on restart.');
}

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
  if (req.session.user.hasConsented) return next();
  res.redirect('/nda');
}

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

app.get('/', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  res.redirect('/home');
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  try {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: req.body.email, password: req.body.password }),
    });
    req.session.user = {
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      name: `${data.user.firstName} ${data.user.lastName}`,
      role: data.user.role.toLowerCase(),
      token: data.token,
      hasConsented: true,
    };
    res.redirect('/home');
  } catch {
    res.status(401).render('login', { error: 'Invalid email or password' });
  }
});

app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/home');
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  let error = null;
  const { email, password, firstName, lastName } = req.body;
  const confirm = req.body.confirm || '';

  if (!email || !firstName || !lastName || !password) error = 'Please fill in all fields.';
  else if (password.length < 6) error = 'Password must be at least 6 characters.';
  else if (password !== confirm) error = 'Passwords do not match.';

  if (error) return res.status(400).render('register', { error });

  try {
    const data = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName, role: 'STUDENT' }),
    });
    req.session.user = {
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.firstName,
      lastName: data.user.lastName,
      name: `${data.user.firstName} ${data.user.lastName}`,
      role: 'student',
      token: data.token,
      hasConsented: false,
    };
    res.redirect('/nda');
  } catch (err) {
    res.status(400).render('register', { error: err.message || 'Registration failed' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/nda', requireAuth, (req, res) => {
  if (req.session.user.hasConsented) return res.redirect('/home');
  res.render('nda', { user: req.session.user });
});

app.post('/nda', requireAuth, (req, res) => {
  if (req.body.agree) {
    req.session.user.hasConsented = true;
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

app.get('/appointments', requireAuth, requireConsent, async (req, res) => {
  try {
    const appointments = await apiRequest('/appointments', {
      token: req.session.user.token,
    });
    res.render('appointments', {
      user: req.session.user,
      appointments,
      counselors: COUNSELORS,
      counselorById,
      error: null
    });
  } catch (err) {
    res.render('appointments', {
      user: req.session.user,
      appointments: [],
      counselors: COUNSELORS,
      counselorById,
      error: err.message
    });
  }
});

app.post('/appointments', requireAuth, requireConsent, async (req, res) => {
  const { counselorId, date, time, purpose } = req.body;
  const counselor = counselorById(Number(counselorId));
  const error = !counselor || !date || !time
    ? 'Please choose a counselor, a date, and a time.'
    : null;
  if (error) {
    return res.status(400).render('appointments', {
      user: req.session.user,
      appointments: [],
      counselors: COUNSELORS,
      counselorById,
      error
    });
  }
  try {
    await apiRequest('/appointments', {
      method: 'POST',
      token: req.session.user.token,
      body: JSON.stringify({
        counselorId: counselor.id,
        scheduledAt: `${date}T${time}:00.000Z`,
        purpose: purpose || 'General consultation',
      }),
    });
    res.redirect('/appointments');
  } catch (err) {
    res.status(400).render('appointments', {
      user: req.session.user,
      appointments: [],
      counselors: COUNSELORS,
      counselorById,
      error: err.message
    });
  }
});

app.post('/appointments/:id/approve', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/appointments/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'APPROVED' }),
    });
  } catch {}
  res.redirect('/appointments');
});

app.post('/appointments/:id/reject', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/appointments/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'REJECTED' }),
    });
  } catch {}
  res.redirect('/appointments');
});

app.post('/appointments/:id/complete', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/appointments/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
  } catch {}
  res.redirect('/appointments');
});

app.post('/appointments/:id/cancel', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/appointments/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
  } catch {}
  res.redirect('/appointments');
});

app.get('/concerns', requireAuth, requireConsent, async (req, res) => {
  try {
    const concerns = await apiRequest('/concerns', {
      token: req.session.user.token,
    });
    res.render('concerns', {
      user: req.session.user,
      concerns,
      error: null
    });
  } catch (err) {
    res.render('concerns', {
      user: req.session.user,
      concerns: [],
      error: err.message
    });
  }
});

app.post('/concerns', requireAuth, requireConsent, async (req, res) => {
  const { category, title, description } = req.body;
  const error = !category || !title || !description
    ? 'Please fill in the category, title, and description.'
    : null;
  if (error) {
    return res.status(400).render('concerns', {
      user: req.session.user,
      concerns: [],
      error
    });
  }
  try {
    await apiRequest('/concerns', {
      method: 'POST',
      token: req.session.user.token,
      body: JSON.stringify({ category, title, description }),
    });
    res.redirect('/concerns');
  } catch (err) {
    res.status(400).render('concerns', {
      user: req.session.user,
      concerns: [],
      error: err.message
    });
  }
});

app.post('/concerns/:id/progress', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/concerns/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'IN_PROGRESS' }),
    });
  } catch {}
  res.redirect('/concerns');
});

app.post('/concerns/:id/resolve', requireAuth, requireConsent, requireRole('admin', 'counselor'), async (req, res) => {
  try {
    await apiRequest(`/concerns/${req.params.id}`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ status: 'RESOLVED' }),
    });
  } catch {}
  res.redirect('/concerns');
});

app.get('/profile', requireAuth, requireConsent, (req, res) => {
  res.render('profile', { user: req.session.user });
});

app.get('/admin', requireAuth, requireConsent, requireRole('admin'), async (req, res) => {
  try {
    const users = await apiRequest('/users', { token: req.session.user.token });
    res.render('admin', { user: req.session.user, users });
  } catch {
    res.render('admin', { user: req.session.user, users: [] });
  }
});

app.post('/admin/users/:id/role', requireAuth, requireConsent, requireRole('admin'), async (req, res) => {
  try {
    await apiRequest(`/users/${req.params.id}/role`, {
      method: 'PATCH',
      token: req.session.user.token,
      body: JSON.stringify({ role: req.body.role }),
    });
  } catch {}
  res.redirect('/admin');
});

app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`GuideTrack site running at http://localhost:${PORT}`);
  console.log('API backend:', process.env.API_URL || 'http://localhost:8080/api');
});
