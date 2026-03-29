const API_BASE = '/api';

// ── Token & session helpers ────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

export function removeToken(): void {
  localStorage.removeItem('auth_token');
}

export function getCurrentUser(): { id: string; email: string } | null {
  const raw = localStorage.getItem('auth_user');
  return raw ? JSON.parse(raw) : null;
}

export function setCurrentUser(user: { id: string; email: string }): void {
  localStorage.setItem('auth_user', JSON.stringify(user));
}

export function removeCurrentUser(): void {
  localStorage.removeItem('auth_user');
}

// ── Generic fetch wrapper ──────────────────────────────────────────────────

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    let msg = `Error ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || msg;
    } catch {
      // ignore parse errors
    }
    // Token expired or invalid → clear session so the login screen shows
    if (res.status === 401) {
      removeToken();
      removeCurrentUser();
      window.location.reload();
    }
    throw new Error(msg);
  }

  return res.json() as Promise<T>;
}

// ── Auth API ───────────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string) {
    const data = await request<{ token: string; user: { id: string; email: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    setToken(data.token);
    setCurrentUser(data.user);
    return data;
  },

  async register(email: string, password: string) {
    const data = await request<{ token: string; user: { id: string; email: string } }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify({ email, password }) }
    );
    setToken(data.token);
    setCurrentUser(data.user);
    return data;
  },

  signOut() {
    removeToken();
    removeCurrentUser();
  },

  getSession(): { token: string; user: { id: string; email: string } } | null {
    const token = getToken();
    const user = getCurrentUser();
    return token && user ? { token, user } : null;
  },
};

// ── Guests API ─────────────────────────────────────────────────────────────

export interface Guest {
  id: string;
  check_in_date: string;
  check_out_date: string;
  num_guests: number;
  num_nights: number;
  phone_number: string;
  total_amount_usd: number;
  total_amount_ars: number;
  deposit_usd: number;
  deposit_ars: number;
  balance_usd: number;
  balance_ars: number;
  cabin_number: number;
  comments: string;
  created_at: string;
  updated_at: string;
}

export type GuestPayload = Omit<Guest, 'id' | 'created_at' | 'updated_at' | 'balance_usd' | 'balance_ars'>;

export const guestsApi = {
  getAll: () => request<Guest[]>('/guests'),
  create: (data: GuestPayload) =>
    request<Guest>('/guests', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<GuestPayload>) =>
    request<Guest>(`/guests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/guests/${id}`, { method: 'DELETE' }),
};

// ── Expenses API ───────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  amount_usd: number;
  amount_ars: number;
  description: string;
  created_at: string;
}

export type ExpensePayload = Omit<Expense, 'id' | 'created_at'>;

export const expensesApi = {
  getAll: () => request<Expense[]>('/expenses'),
  create: (data: ExpensePayload) =>
    request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<ExpensePayload>) =>
    request<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/expenses/${id}`, { method: 'DELETE' }),
};
