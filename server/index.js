import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'url';
import fs from 'fs';
import nodePath from 'path';
import { fileURLToPath } from 'url';
import { initDb, dbRun, dbGet, dbAll } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 80;
const JWT_SECRET = process.env.JWT_SECRET || 'wisperagent_default_secret_key_12345';

// Middlewares
app.use(cors());
app.use(express.json());

// Token Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Admin Guard Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Database Initialization
initDb().catch(console.error);

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await dbGet("SELECT id FROM users WHERE email = ?", [email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    const result = await dbRun(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
      [email.toLowerCase().trim(), passwordHash, name, 'user']
    );

    const token = jwt.sign(
      { id: result.lastID, email: email.toLowerCase().trim(), name, role: 'user' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: result.lastID, email, name, role: 'user' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await dbGet("SELECT * FROM users WHERE email = ?", [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get User Profile Status Check
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------
// User-Specific Documents Endpoints
// -------------------------------------------------------------

app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const documents = await dbAll(
      "SELECT id, title, raw_text as rawText, formatted_text as formattedText, timestamp FROM documents WHERE user_id = ? ORDER BY timestamp DESC",
      [req.user.id]
    );
    res.json(documents);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
  const { id, title, rawText, formattedText, timestamp } = req.body;
  if (!id || !title || !timestamp) {
    return res.status(400).json({ error: 'Missing document parameters' });
  }

  try {
    await dbRun(
      "INSERT INTO documents (id, user_id, title, raw_text, formatted_text, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
      [id, req.user.id, title, rawText || '', formattedText || '', timestamp]
    );
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/documents/:id', authenticateToken, async (req, res) => {
  const { title, rawText, formattedText, timestamp } = req.body;
  const { id } = req.params;

  try {
    const doc = await dbGet("SELECT id FROM documents WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await dbRun(
      "UPDATE documents SET title = COALESCE(?, title), raw_text = COALESCE(?, raw_text), formatted_text = COALESCE(?, formatted_text), timestamp = COALESCE(?, timestamp) WHERE id = ? AND user_id = ?",
      [title, rawText, formattedText, timestamp, id, req.user.id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/documents/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const doc = await dbGet("SELECT id FROM documents WHERE id = ? AND user_id = ?", [id, req.user.id]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await dbRun("DELETE FROM documents WHERE id = ? AND user_id = ?", [id, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// Credentials Sync Endpoints
// -------------------------------------------------------------

app.get('/api/credentials', authenticateToken, async (req, res) => {
  try {
    const creds = await dbGet(
      "SELECT provider, api_key as apiKey, custom_prompt as customPrompt, open_router_model as openRouterModel FROM credentials WHERE user_id = ?",
      [req.user.id]
    );
    res.json(creds || { provider: 'none', apiKey: '', customPrompt: '', openRouterModel: 'google/gemini-2.5-flash' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/credentials', authenticateToken, async (req, res) => {
  const { provider, apiKey, customPrompt, openRouterModel } = req.body;

  try {
    await dbRun(
      "INSERT OR REPLACE INTO credentials (user_id, provider, api_key, custom_prompt, open_router_model) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, provider, apiKey || '', customPrompt || '', openRouterModel || 'google/gemini-2.5-flash']
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// Administrator Dashboard Endpoints (Admin role only)
// -------------------------------------------------------------

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await dbAll(
      "SELECT id, email, name, role, created_at as createdAt FROM users WHERE id != ?",
      [req.user.id]
    );
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (role !== 'user' && role !== 'admin') {
    return res.status(400).json({ error: 'Invalid user role' });
  }

  try {
    await dbRun("UPDATE users SET role = ? WHERE id = ?", [role, id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await dbRun("DELETE FROM users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// Reverse Proxy Endpoints (handles API keys server-side or relays calls)
// -------------------------------------------------------------

const createProxyHandler = (targetUrlSelector) => {
  return async (req, res) => {
    try {
      const urlPath = req.url.replace(/^\/(api-openai|api-openrouter|api-gemini)/, '');
      const targetUrl = targetUrlSelector(urlPath);
      
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.origin;
      delete headers.referer;
      
      const fetchOptions = {
        method: req.method,
        headers,
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
      };

      const response = await fetch(targetUrl, fetchOptions);
      res.status(response.status);
      
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);

      if (contentType && contentType.includes('application/json')) {
        const body = await response.json();
        res.json(body);
      } else {
        const body = await response.text();
        res.send(body);
      }
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
};

app.all('/api-openai/:splat*', createProxyHandler((path) => `https://api.openai.com${path}`));
app.all('/api-openrouter/:splat*', createProxyHandler((path) => `https://openrouter.ai${path}`));
app.all('/api-gemini/:splat*', createProxyHandler((path) => `https://generativelanguage.googleapis.com${path}`));

// -------------------------------------------------------------
// Serve static built web assets
// -------------------------------------------------------------

app.use(express.static(nodePath.join(__dirname, '../dist')));

// SPA client router fallback
app.get('/:splat*', (req, res) => {
  res.sendFile(nodePath.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
