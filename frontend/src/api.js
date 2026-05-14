import { getCachedTasks, setCachedTasks, updateCachedTask, deleteCachedTask, queueMutation } from './lib/offlineStore';

const API_URL = 'http://localhost:4000/api';

function getAuthHeaders() {
  const token = localStorage.getItem('taskly_token');
  const workspaceId = localStorage.getItem('taskly_workspace_id');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(workspaceId && { 'x-workspace-id': workspaceId }),
  };
}

export async function signUp(email, password) {
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Signup failed');
  if (data.token) localStorage.setItem('taskly_token', data.token);
  return data;
}

export async function signIn(email, password) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.token) localStorage.setItem('taskly_token', data.token);
  return data;
}

export function signOut() {
  localStorage.removeItem('taskly_token');
  localStorage.removeItem('taskly_workspace_id');
}

export async function getCurrentUser() {
  const token = localStorage.getItem('taskly_token');
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, { headers: getAuthHeaders() });
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem('taskly_token');
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch (err) {
    return null;
  }
}

export async function createTask(title, priority = 'MEDIUM', due_date = null, description = '', tags = []) {
  const body = { title, priority, due_date, description, tags };

  if (!navigator.onLine) {
    // Create an optimistic local task
    const tempId = 'offline_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const localTask = {
      id: tempId, title, priority, due_date, description, tags,
      status: 'TODO', position: Date.now(), created_at: new Date().toISOString(),
      workspace_id: localStorage.getItem('taskly_workspace_id'),
      _offline: true,
    };
    await updateCachedTask(localTask);
    await queueMutation({ url: '/tasks', method: 'POST', body });
    return localTask;
  }

  const res = await fetch(`${API_URL}/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create task');
  }
  const task = await res.json();
  await updateCachedTask(task);
  return task;
}

export async function listTasks() {
  const workspaceId = localStorage.getItem('taskly_workspace_id');
  try {
    const res = await fetch(`${API_URL}/tasks`, { headers: getAuthHeaders() });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to list tasks');
    }
    const tasks = await res.json();
    // Cache for offline use
    await setCachedTasks(tasks);
    return tasks;
  } catch (err) {
    // If we're offline, return cached data
    if (!navigator.onLine) {
      const cached = await getCachedTasks(workspaceId);
      if (cached.length > 0) return cached;
    }
    throw err;
  }
}

export async function updateTaskStatus(id, status) {
  const body = { status };
  if (!navigator.onLine) {
    await queueMutation({ url: `/tasks/${id}/status`, method: 'PATCH', body });
    return { id, status };
  }
  const res = await fetch(`${API_URL}/tasks/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update status');
  }
  return res.json();
}

export async function editTask(id, title, priority, due_date, description = '', tags = []) {
  const body = { title, priority, due_date, description, tags };
  if (!navigator.onLine) {
    await queueMutation({ url: `/tasks/${id}`, method: 'PATCH', body });
    return { id, title, priority, due_date, description, tags };
  }
  const res = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to edit task');
  }
  return res.json();
}

export async function deleteTask(id) {
  if (!navigator.onLine) {
    await deleteCachedTask(id);
    await queueMutation({ url: `/tasks/${id}`, method: 'DELETE' });
    return { id };
  }
  const res = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete task');
  }
  await deleteCachedTask(id);
  return res.json();
}

export async function reorderTask(id, status, position) {
  const body = { status, position };
  if (!navigator.onLine) {
    await queueMutation({ url: `/tasks/${id}/reorder`, method: 'PUT', body });
    return { id, status, position };
  }
  const res = await fetch(`${API_URL}/tasks/${id}/reorder`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to reorder task');
  }
  return res.json();
}

export async function getTaskEvents(id) {
  const res = await fetch(`${API_URL}/tasks/${id}/events`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch events');
  }
  return res.json();
}

export async function getBoardHistory(timestamp) {
  const res = await fetch(`${API_URL}/tasks/history?timestamp=${encodeURIComponent(timestamp)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch board history');
  }
  return res.json();
}

export async function undoTaskAction(taskId) {
  const res = await fetch(`${API_URL}/tasks/${taskId}/undo`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Nothing to undo');
  }
  return res.json();
}

export async function listWorkspaces() {
  const res = await fetch(`${API_URL}/workspaces`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to list workspaces');
  }
  return res.json();
}

export async function createWorkspace(name) {
  const res = await fetch(`${API_URL}/workspaces`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create workspace');
  }
  return res.json();
}

export async function searchTasks(query) {
  const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to search tasks');
  }
  return res.json();
}

export async function semanticSearch(query) {
  const res = await fetch(`${API_URL}/search/semantic?q=${encodeURIComponent(query)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to perform semantic search');
  }
  return res.json();
}

export async function getSearchCapabilities() {
  const res = await fetch(`${API_URL}/search/capabilities`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return { fulltext: true, semantic: false };
  return res.json();
}

export async function listDependencies() {
  const res = await fetch(`${API_URL}/tasks/dependencies`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch dependencies');
  }
  return res.json();
}

export async function addDependency(taskId, dependsOnId) {
  const res = await fetch(`${API_URL}/tasks/dependencies`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ taskId, dependsOnId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to add dependency');
  }
  return res.json();
}

export async function removeDependency(taskId, dependsOnId) {
  const res = await fetch(`${API_URL}/tasks/dependencies`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    body: JSON.stringify({ taskId, dependsOnId }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to remove dependency');
  }
  return res.json();
}

export async function listWebhooks() {
  const res = await fetch(`${API_URL}/webhooks`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to list webhooks');
  }
  return res.json();
}

export async function addWebhook(url) {
  const res = await fetch(`${API_URL}/webhooks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to add webhook');
  }
  return res.json();
}

export async function deleteWebhook(id) {
  const res = await fetch(`${API_URL}/webhooks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete webhook');
  }
  return res.json();
}

export async function listAttachments(taskId) {
  const res = await fetch(`${API_URL}/attachments/${taskId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to list attachments');
  }
  return res.json();
}

export async function getUploadPresign(taskId, fileName, contentType) {
  const res = await fetch(`${API_URL}/attachments/presign`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ taskId, fileName, contentType }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }
  return res.json();
}

export async function registerAttachment(data) {
  const res = await fetch(`${API_URL}/attachments/register`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to register attachment');
  }
  return res.json();
}

export async function listMembers() {
  const res = await fetch(`${API_URL}/workspaces/members`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to list members');
  }
  return res.json();
}

export async function addMember(email, role = 'MEMBER') {
  const res = await fetch(`${API_URL}/workspaces/members`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ email, role }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to add member');
  }
  return res.json();
}

export async function removeMember(userId) {
  const res = await fetch(`${API_URL}/workspaces/members/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to remove member');
  }
  return res.json();
}

// Analytics
export async function getAnalytics() {
  const res = await fetch(`${API_URL}/analytics`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch analytics');
  }
  return res.json();
}

// Billing
export async function createRazorpayOrder(plan) {
  const res = await fetch(`${API_URL}/billing/create-order`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create payment order');
  }
  return res.json();
}

export async function verifyRazorpayPayment(paymentData) {
  const res = await fetch(`${API_URL}/billing/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(paymentData),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Payment verification failed');
  }
  return res.json();
}

// Notifications
export async function listNotifications() {
  const res = await fetch(`${API_URL}/notifications`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch notifications');
  }
  return res.json();
}

export async function markNotificationRead(id) {
  const res = await fetch(`${API_URL}/notifications/${id}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to mark notification as read');
  }
  return res.json();
}

// Comments
export async function listTaskComments(taskId) {
  const res = await fetch(`${API_URL}/tasks/${taskId}/comments`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch comments');
  }
  return res.json();
}

export async function addTaskComment(taskId, content, mentions = []) {
  const res = await fetch(`${API_URL}/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ content, mentions }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to add comment');
  }
  return res.json();
}

export { API_URL };
