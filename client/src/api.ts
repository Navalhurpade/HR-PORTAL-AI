const API_BASE = '/api';
const TOKEN_KEY = 'northstar.accessToken';

export type ApiRole = 'employee' | 'hr' | 'super_admin';
export type ApiStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApiUser {
  userId: string;
  name: string;
  email: string;
  role: ApiRole;
  department: string;
  managerId: string | null;
}

export interface ApiLeave {
  leaveRequestId: string;
  userId: string;
  employee: { name: string; email: string; department: string };
  policyId: string;
  leaveType: string;
  leaveName: string;
  startDate: string;
  endDate: string;
  requestedDays: number;
  reason: string | null;
  status: ApiStatus;
  reviewedBy: { userId: string; name: string | null } | null;
  reviewedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPolicy {
  policyId: string;
  leaveType: string;
  name: string;
  annualAllowanceDays: number | null;
  maxConsecutiveDays: number | null;
  carryoverLimitDays: number;
  isPaid: boolean;
  requiresDocumentation: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ApiCompanyDocument {
  id: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function getAccessToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function saveAccessToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Could not reach the HR service. Check that the server is running.', 0);
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 401) clearAccessToken();
    throw new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status);
  }
  return payload as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers });
  } catch {
    throw new ApiError('Could not reach the HR service. Check that the server is running.', 0);
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status === 401) clearAccessToken();
    throw new ApiError(payload.error ?? `Request failed (${response.status}).`, response.status);
  }
  return response.blob();
}

export const api = {
  async login(email: string, password: string) {
    const result = await request<{ accessToken: string; user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    saveAccessToken(result.accessToken);
    return result.user;
  },
  me: () => request<ApiUser>('/auth/me'),
  leaves: async () => (await request<{ items: ApiLeave[] }>('/leaves?limit=100')).items,
  policies: async () => (await request<{ items: ApiPolicy[] }>('/leave-policies')).items,
  people: async () => (await request<{ items: ApiUser[] }>('/users?limit=100')).items,
  companyDocuments: async () => (await request<{ items: ApiCompanyDocument[] }>('/company-documents')).items,
  uploadCompanyDocument: (file: File) => {
    const form = new FormData();
    form.append('document', file);
    return request<{ item: ApiCompanyDocument }>('/company-documents', { method: 'POST', body: form });
  },
  downloadCompanyDocument: (id: string) => requestBlob(`/company-documents/${encodeURIComponent(id)}`),
  deleteCompanyDocument: (id: string) =>
    request<void>(`/company-documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createLeave: (input: { policyId: string; startDate: string; endDate: string; reason?: string }) =>
    request<{ item: ApiLeave }>('/leaves', { method: 'POST', body: JSON.stringify(input) }),
  decideLeave: (id: string, decision: 'approve' | 'reject') =>
    request<{ item: ApiLeave }>(`/leaves/${encodeURIComponent(id)}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  chat: (input: { message: string; conversationId: string; history: ChatTurn[] }) =>
    request<{ conversationId: string; message: { role: 'assistant'; content: string; createdAt: string } }>('/chat', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
