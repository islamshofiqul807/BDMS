const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'bdms_secret_2024';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uefhqqtgzzbfzazjvhqj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlZmhxcXRnenpiZnphemp2aHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzUwNDAsImV4cCI6MjA5Mzc1MTA0MH0.1qOe7qVOXnpy6kD1s7h1LXAjHdFXDTqXHRrdWZbKZPU';

// Create Supabase client with full options to bypass allowlist issues
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: {
      'X-Client-Info': 'bdms-app',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  }
});

app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', supabase: SUPABASE_URL });
});

const safe = (user) => { if (!user) return null; const { password, ...rest } = user; return rest; };
const dbErr = (res, err, msg = 'Database error') => {
  console.error(msg, err);
  return res.status(500).json({ message: msg, error: err?.message });
};

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid or expired token' }); }
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};

// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, bloodGroup, phone, location } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: 'Name, email and password are required' });

    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase.from('users').insert({
      name, email, password: hashed,
      role: role || 'donor',
      blood_group: bloodGroup || null,
      phone: phone || null,
      location: location || null,
      available: true,
      donation_count: 0,
      rating: 0,
      rating_count: 0
    }).select().single();

    if (error) return dbErr(res, error, 'Registration failed');
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: safe(user) });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
    if (error) return dbErr(res, error, 'Login error');
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: safe(user) });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ message: 'Server error', error: e.message });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const { data: user, error } = await supabase.from('users').select('*').eq('id', req.user.id).single();
  if (error || !user) return res.status(404).json({ message: 'User not found' });
  res.json(safe(user));
});

// ── DONORS ────────────────────────────────────────────────────────────────────
app.get('/api/donors', async (req, res) => {
  try {
    const { bloodGroup, location } = req.query;
    let q = supabase.from('users').select('*').eq('role', 'donor');
    if (bloodGroup) q = q.eq('blood_group', bloodGroup);
    if (location) q = q.ilike('location', `%${location}%`);
    const { data, error } = await q.order('donation_count', { ascending: false });
    if (error) return dbErr(res, error);
    res.json(data.map(safe));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/donors/rare', async (req, res) => {
  try {
    const { data, error } = await supabase.from('users').select('*').eq('role', 'donor')
      .in('blood_group', ['AB-', 'B-', 'O-']).order('donation_count', { ascending: false });
    if (error) return dbErr(res, error);
    res.json(data.map(safe));
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/donors/availability', auth, async (req, res) => {
  const { data, error } = await supabase.from('users').update({ available: req.body.available })
    .eq('id', req.user.id).select().single();
  if (error) return dbErr(res, error);
  res.json(safe(data));
});

app.put('/api/users/profile', auth, async (req, res) => {
  const { name, phone, location, bloodGroup, available } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (location !== undefined) updates.location = location;
  if (bloodGroup !== undefined) updates.blood_group = bloodGroup;
  if (available !== undefined) updates.available = available;
  const { data, error } = await supabase.from('users').update(updates).eq('id', req.user.id).select().single();
  if (error) return dbErr(res, error);
  res.json(safe(data));
});

// ── BLOOD REQUESTS ────────────────────────────────────────────────────────────
app.get('/api/requests', async (req, res) => {
  try {
    const { status, bloodGroup } = req.query;
    let q = supabase.from('blood_requests').select('*');
    if (status) q = q.eq('status', status);
    if (bloodGroup) q = q.eq('blood_group', bloodGroup);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) return dbErr(res, error);
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/requests', auth, async (req, res) => {
  const { patientName, bloodGroup, location, urgency, units, contactPhone, description } = req.body;
  if (!patientName || !bloodGroup || !location)
    return res.status(400).json({ message: 'Missing required fields' });
  const { data, error } = await supabase.from('blood_requests').insert({
    patient_name: patientName, blood_group: bloodGroup, location,
    urgency: urgency || 'normal', units: units || 1,
    contact_phone: contactPhone || null, description: description || null,
    status: 'open', recipient_id: req.user.id
  }).select().single();
  if (error) return dbErr(res, error);
  res.status(201).json(data);
});

app.put('/api/requests/:id/accept', auth, async (req, res) => {
  const { data: existing } = await supabase.from('blood_requests').select('*').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ message: 'Request not found' });
  if (existing.status !== 'open') return res.status(400).json({ message: 'Request is no longer open' });
  const { data, error } = await supabase.from('blood_requests')
    .update({ status: 'accepted', donor_id: req.user.id }).eq('id', req.params.id).select().single();
  if (error) return dbErr(res, error);
  res.json(data);
});

app.put('/api/requests/:id/cancel', auth, async (req, res) => {
  const { data: existing } = await supabase.from('blood_requests').select('*').eq('id', req.params.id).single();
  if (!existing) return res.status(404).json({ message: 'Request not found' });
  if (existing.recipient_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ message: 'Not authorized' });
  const { data, error } = await supabase.from('blood_requests')
    .update({ status: 'cancelled' }).eq('id', req.params.id).select().single();
  if (error) return dbErr(res, error);
  res.json(data);
});

app.delete('/api/requests/:id', auth, adminOnly, async (req, res) => {
  const { error } = await supabase.from('blood_requests').delete().eq('id', req.params.id);
  if (error) return dbErr(res, error);
  res.json({ message: 'Deleted' });
});

// ── FEEDBACK ──────────────────────────────────────────────────────────────────
app.post('/api/feedback', auth, async (req, res) => {
  const { donorId, rating, comment } = req.body;
  if (!donorId || !rating) return res.status(400).json({ message: 'donorId and rating required' });
  const { data: donor } = await supabase.from('users').select('*').eq('id', donorId).single();
  if (!donor) return res.status(404).json({ message: 'Donor not found' });
  const { data: fb, error } = await supabase.from('feedbacks').insert({
    donor_id: donorId, recipient_id: req.user.id, rating, comment: comment || null
  }).select().single();
  if (error) return dbErr(res, error);
  const newCount = donor.rating_count + 1;
  const newRating = Math.round(((donor.rating * donor.rating_count) + rating) / newCount * 10) / 10;
  await supabase.from('users').update({ rating: newRating, rating_count: newCount }).eq('id', donorId);
  res.status(201).json(fb);
});

app.get('/api/feedback/:donorId', async (req, res) => {
  const { data, error } = await supabase.from('feedbacks').select('*')
    .eq('donor_id', req.params.donorId).order('created_at', { ascending: false });
  if (error) return dbErr(res, error);
  res.json(data);
});

// ── ORGANIZATIONS ─────────────────────────────────────────────────────────────
app.get('/api/organizations', async (req, res) => {
  try {
    const { type } = req.query;
    let q = supabase.from('organizations').select('*');
    if (type) q = q.eq('type', type);
    const { data, error } = await q.order('id');
    if (error) return dbErr(res, error);
    res.json(data);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [donors, available, openReqs, allDonors] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'donor'),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'donor').eq('available', true),
      supabase.from('blood_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase.from('users').select('donation_count').eq('role', 'donor')
    ]);
    const livesSaved = (allDonors.data || []).reduce((sum, u) => sum + (u.donation_count || 0), 0);
    res.json({ totalDonors: donors.count || 0, availableDonors: available.count || 0, openRequests: openReqs.count || 0, livesSaved });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── ADMIN ─────────────────────────────────────────────────────────────────────
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
  if (error) return dbErr(res, error);
  res.json(data.map(safe));
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ message: 'Cannot delete yourself' });
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return dbErr(res, error);
  res.json({ message: 'User deleted' });
});

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  const [total, donors, recipients, admins, open, accepted, allReqs, fbs] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'donor'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'recipient'),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
    supabase.from('blood_requests').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('blood_requests').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
    supabase.from('blood_requests').select('id', { count: 'exact', head: true }),
    supabase.from('feedbacks').select('id', { count: 'exact', head: true })
  ]);
  res.json({
    totalUsers: total.count || 0, donors: donors.count || 0,
    recipients: recipients.count || 0, admins: admins.count || 0,
    openRequests: open.count || 0, acceptedRequests: accepted.count || 0,
    totalRequests: allReqs.count || 0, totalFeedbacks: fbs.count || 0
  });
});

// ── FRONTEND ──────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

module.exports = app;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🩸 BDMS running on port ${PORT}`));
}
