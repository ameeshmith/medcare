const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      typeof data.detail === 'string'
        ? data.detail
        : data.detail?.message || 'Request failed'
    );
    err.detail = data.detail;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  getOverview: () => request('/dashboard/overview'),
  getHealth: () => request('/health'),
  updateGroqKey: (api_key, model) =>
    request('/settings/groq', {
      method: 'POST',
      body: JSON.stringify({ api_key, model }),
    }),
  executeAgent: (message) =>
    request('/agents/execute', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  bookAppointment: (payload) =>
    request('/appointments/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  rescheduleAppointment: (id, payload) =>
    request(`/appointments/${id}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cancelAppointment: (id, payload) =>
    request(`/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resolveApproval: (id, decision, reviewer_note) =>
    request(`/approvals/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewer_note }),
    }),
  getRagSummary: () => request('/rag/summary'),
  queryRag: (query, top_k = 3) =>
    request('/rag/query', {
      method: 'POST',
      body: JSON.stringify({ query, top_k }),
    }),
  uploadPdf: async (file, category = 'Hospital Policy PDF') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    const res = await fetch(`${API_BASE}/rag/upload-pdf`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Upload failed');
    return data;
  },
  generateDailyReport: () =>
    request('/operations/daily-report', { method: 'POST' }),
  getN8nWorkflows: () => request('/n8n/workflows'),
  triggerN8nReminders: () =>
    request('/n8n/trigger-reminders', { method: 'POST' }),
};

