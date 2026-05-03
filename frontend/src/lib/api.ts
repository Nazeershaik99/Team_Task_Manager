
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

const BASE_URL = "https://teamtaskmanager-production-272c.up.railway.app";

export function createApi(getToken: () => string | null) {
  async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers || {});

    if (!headers.has("content-type") && init.body) {
      headers.set("content-type", "application/json");
    }

    const token = getToken();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const res = await fetch(BASE_URL + path, { ...init, headers });

    const text = await res.text();
    let data: any = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new ApiError(res.status, data?.detail || "Request failed");
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

    deleteProject: (projectId: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}`, {
        method: "DELETE"
      }),

    listMembers: (projectId: string) =>
      req<{ members: Member[] }>(`/api/projects/${projectId}/members`),

    addMember: (projectId: string, email: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}/members`, {
        method: "POST",
        body: JSON.stringify({ email })
      }),

    removeMember: (projectId: string, userId: string) =>
      req<{ ok: boolean }>(`/api/projects/${projectId}/members/${userId}`, {
        method: "DELETE"
      }),

    listTasks: (projectId: string) =>
      req<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`),

    createTask: (projectId: string, payload: any) =>
      req<{ task: Task }>(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify(payload)
      }),

    patchTask: (taskId: string, payload: any) =>
      req<{ task: Task }>(`/api/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),

    deleteTask: (taskId: string) =>
      req<{ ok: boolean }>(`/api/tasks/${taskId}`, {
        method: "DELETE"
      }),

    dashboard: () => req<{ dashboard: Dashboard }>("/api/dashboard")
  };
}
```
