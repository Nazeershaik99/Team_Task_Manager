export type User = { id: string; name: string; email: string; createdAt: string };
export type Project = { id: string; name: string; createdAt: string; createdBy: string; myRole: "Admin" | "Member" };
export type Member = { user: User; role: "Admin" | "Member" };
export type TaskStatus = "To Do" | "In Progress" | "Done";
export type TaskPriority = "Low" | "Medium" | "High";
export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  dueDate: string;
  priority: TaskPriority;
  assignedTo: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type Dashboard = {
  totalTasks: number;
  tasksByStatus: Record<TaskStatus, number>;
  tasksPerUser: Record<string, number>;
  overdueTasks: number;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createApi(getToken: () => string | null) {
  async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers || {});
    if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
    const token = getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    const res = await fetch(path, { ...init, headers });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    function toMessage(payload: any): string {
      if (!payload) return "";
      const detail = payload.detail ?? payload.error;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const parts = detail
          .map((d) => {
            if (!d) return "";
            const where = Array.isArray(d.loc) ? d.loc.join(".") : "";
            const msg = typeof d.msg === "string" ? d.msg : "";
            return where && msg ? `${where}: ${msg}` : msg || where;
          })
          .filter(Boolean);
        return parts.join(" | ");
      }
      if (typeof payload.error === "string") return payload.error;
      if (typeof payload.message === "string") return payload.message;
      try { return JSON.stringify(payload); } catch { return String(payload); }
    }

    if (!res.ok) {
      const msg = toMessage(data) || `Request failed (${res.status})`;
      throw new ApiError(res.status, msg);
    }

    return data as T;
  }

  return {
    signup: (name: string, email: string, password: string) =>
      req<{ user: User; token: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      }),
    login: (email: string, password: string) =>
      req<{ user: User; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      }),
    me: () => req<{ user: User }>("/api/me"),
    listProjects: () => req<{ projects: Project[] }>("/api/projects"),
    createProject: (name: string) =>
      req<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name })
      }),
    // ── NEW ──────────────────────────────────────────────────────
    deleteProject: (projectId: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" }),
    // ─────────────────────────────────────────────────────────────
    listMembers: (projectId: string) => req<{ members: Member[] }>(`/api/projects/${projectId}/members`),
    addMember: (projectId: string, email: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email })
      }),
    removeMember: (projectId: string, memberUserId: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}/members/${memberUserId}`, { method: "DELETE" }),
    listTasks: (projectId: string) => req<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`),
    createTask: (
      projectId: string,
      payload: {
        title: string;
        description: string;
        dueDate: string;
        priority: TaskPriority;
        assignedTo?: string | null;
      }
    ) =>
      req<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        // Fix: convert empty string "" → null so FastAPI doesn't reject it
        body: JSON.stringify({
          ...payload,
          assignedTo: payload.assignedTo || null,
        })
      }),
    patchTask: (taskId: string, payload: Record<string, any>) =>
      req<{ task: Task }>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        // Fix: same empty string → null guard for assignedTo on updates
        body: JSON.stringify({
          ...payload,
          ...(payload.assignedTo !== undefined ? { assignedTo: payload.assignedTo || null } : {}),
        })
      }),
    // ── NEW ──────────────────────────────────────────────────────
    deleteTask: (taskId: string) =>
      req<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: "DELETE" }),
    // ─────────────────────────────────────────────────────────────
    dashboard: () => req<{ dashboard: Dashboard }>("/api/dashboard")
  };
}
