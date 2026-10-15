const API_BASE = process.env.API_URL || 'http://localhost:8080/api';

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = options.token;

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

module.exports = { apiRequest };
