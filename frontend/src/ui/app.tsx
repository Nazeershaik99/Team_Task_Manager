import { useEffect, useMemo, useState } from "react";
import { createApi } from "../lib/api";
import type { Dashboard, Member, Project, Task, TaskPriority, TaskStatus, User } from "../lib/api";
import { formatDate, isOverdue, isoFromDateInput } from "../lib/date";

type Route =
  | { name: "login" }
  | { name: "signup" }
  | { name: "dashboard" }
  | { name: "projects" }
  | { name: "project"; projectId: string };

type Toast = { id: string; kind: "success" | "error" | "info"; message: string };

function tokenStorage() {
  const key = "ttm_token";
  return {
    get: () => localStorage.getItem(key),
    set: (v: string) => localStorage.setItem(key, v),
    clear: () => localStorage.removeItem(key)
  };
}

function randId() {
  return Math.random().toString(16).slice(2);
}

/* ─── CONFIRM MODAL ─────────────────────────────────────────────── */
function ConfirmModal(props: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modalOverlay" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalIcon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div className="modalTitle">{props.title}</div>
        <div className="modalMessage">{props.message}</div>
        <div className="modalActions">
          <button className="btn" onClick={props.onCancel}>Cancel</button>
          <button className="btn danger" onClick={props.onConfirm}>
            {props.confirmLabel || "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const storage = useMemo(() => tokenStorage(), []);
  const [token, setToken] = useState<string | null>(() => storage.get());
  const api = useMemo(() => createApi(() => token), [token]);

  const [route, setRoute] = useState<Route>(() => (token ? { name: "dashboard" } : { name: "login" }));
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(() => !!storage.get());
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Confirm modal state
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  function pushToast(kind: Toast["kind"], message: string) {
    const id = randId();
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 2600);
  }

  async function refreshAll() {
    if (!token) return;
    const me = await api.me();
    setUser(me.user);
    const p = await api.listProjects();
    setProjects(p.projects);
    const d = await api.dashboard();
    setDashboard(d.dashboard);
  }

  async function loadProject(projectId: string) {
    const [m, t] = await Promise.all([api.listMembers(projectId), api.listTasks(projectId)]);
    setMembers(m.members);
    setTasks(t.tasks);
  }

  useEffect(() => {
    if (!token) return;
    setInitialLoading(true);
    refreshAll()
      .catch((e: any) => {
        const status = typeof e?.status === "number" ? e.status : undefined;
        if (status === 401) {
          storage.clear();
          setToken(null);
          setUser(null);
          setRoute({ name: "login" });
          return;
        }
        setError(e?.message || "Failed to load data");
        pushToast("error", e?.message || "Failed to load data");
      })
      .finally(() => setInitialLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function navigate(next: Route) {
    setError("");
    if (!token && (next.name === "dashboard" || next.name === "projects" || next.name === "project")) {
      setRoute({ name: "login" });
      return;
    }
    if (next.name === "project") {
      await loadProject(next.projectId);
    }
    setRoute(next);
  }

  function logout() {
    storage.clear();
    setToken(null);
    setUser(null);
    setProjects([]);
    setMembers([]);
    setTasks([]);
    setDashboard(null);
    setRoute({ name: "login" });
    pushToast("info", "Logged out");
  }

  function askConfirm(opts: { title: string; message: string; confirmLabel?: string; onConfirm: () => void }) {
    setConfirm(opts);
  }

  const isAuthed = !!token && route.name !== "login" && route.name !== "signup";

  return (
    <div className="shell">
      {initialLoading && (
        <div className="pageLoader">
          <div className="pageLoaderRing" />
          <div className="pageLoaderText">Loading workspace…</div>
        </div>
      )}

      <Topbar
        authed={isAuthed}
        user={user}
        activeRoute={route.name}
        onNav={(n) => void navigate(n)}
        onLogout={logout}
      />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.message}
          </div>
        ))}
      </div>

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {error ? <div className="errorBanner">{error}</div> : null}

      {route.name === "login" ? (
        <AuthCard
          mode="login"
          busy={busy}
          onSubmit={async (email, password, clearInputs) => {
            setError("");
            setBusy(true);
            try {
              const r = await api.login(email, password);
              storage.set(r.token);
              setToken(r.token);
              setRoute({ name: "projects" });
              setUser(r.user);
              clearInputs();
              pushToast("success", "Logged in");
            } catch (e: any) {
              setError(e?.message || "Login failed");
              pushToast("error", e?.message || "Login failed");
            } finally {
              setBusy(false);
            }
          }}
          onSwitch={() => void navigate({ name: "signup" })}
        />
      ) : null}

      {route.name === "signup" ? (
        <AuthCard
          mode="signup"
          busy={busy}
          onSubmit={async (email, password, clearInputs, _name) => {
            setError("");
            setBusy(true);
            try {
              const r = await api.login(email, password);
              storage.set(r.token);
              setToken(r.token);
              setUser(r.user);
              clearInputs();
              pushToast("success", "Logged in");
              setRoute({ name: "projects" });
            } catch (e: any) {
              setError(e?.message || "Login failed");
              pushToast("error", e?.message || "Login failed");
            } finally {
              setBusy(false);
            }
          }}
          onSwitch={() => void navigate({ name: "login" })}
        />
      ) : null}

      {route.name === "dashboard" ? <DashboardView dashboard={dashboard} members={members} /> : null}

      {route.name === "projects" ? (
        <ProjectsView
          projects={projects}
          busy={busy}
          onCreate={async (name) => {
            setError("");
            setBusy(true);
            try {
              await api.createProject(name);
              pushToast("success", "Project created");
              await refreshAll();
              await navigate({ name: "projects" });
            } catch (e: any) {
              setError(e?.message || "Create project failed");
              pushToast("error", e?.message || "Create project failed");
            } finally {
              setBusy(false);
            }
          }}
          onDelete={(id, name) => {
            askConfirm({
              title: "Delete project",
              message: `"${name}" and all its tasks will be permanently deleted. This cannot be undone.`,
              confirmLabel: "Delete project",
              onConfirm: async () => {
                setError("");
                setBusy(true);
                try {
                  await api.deleteProject(id);
                  pushToast("success", "Project deleted");
                  await refreshAll();
                } catch (e: any) {
                  setError(e?.message || "Delete project failed");
                  pushToast("error", e?.message || "Delete project failed");
                } finally {
                  setBusy(false);
                }
              },
            });
          }}
          onOpen={(id) => void navigate({ name: "project", projectId: id })}
        />
      ) : null}

      {route.name === "project" ? (
        <ProjectView
          project={projects.find((p) => p.id === route.projectId) || null}
          me={user}
          members={members}
          tasks={tasks}
          busy={busy}
          onRefresh={async () => {
            setBusy(true);
            try {
              await refreshAll();
              await loadProject(route.projectId);
              const d = await api.dashboard();
              setDashboard(d.dashboard);
              pushToast("info", "Refreshed");
            } finally {
              setBusy(false);
            }
          }}
          onAddMember={async (email) => {
            setError("");
            setBusy(true);
            try {
              await api.addMember(route.projectId, email);
              await loadProject(route.projectId);
              await refreshAll();
              pushToast("success", "Member added");
            } catch (e: any) {
              setError(e?.message || "Add member failed");
              pushToast("error", e?.message || "Add member failed");
            } finally {
              setBusy(false);
            }
          }}
          onRemoveMember={async (memberUserId) => {
            setError("");
            setBusy(true);
            try {
              await api.removeMember(route.projectId, memberUserId);
              await loadProject(route.projectId);
              await refreshAll();
              pushToast("success", "Member removed");
            } catch (e: any) {
              setError(e?.message || "Remove member failed");
              pushToast("error", e?.message || "Remove member failed");
            } finally {
              setBusy(false);
            }
          }}
          onCreateTask={async (payload) => {
            setError("");
            setBusy(true);
            try {
              await api.createTask(route.projectId, payload as any);
              await loadProject(route.projectId);
              await refreshAll();
              pushToast("success", "Task created");
            } catch (e: any) {
              setError(e?.message || "Create task failed");
              pushToast("error", e?.message || "Create task failed");
            } finally {
              setBusy(false);
            }
          }}
          onSaveTask={async (taskId, patch) => {
            setError("");
            setBusy(true);
            try {
              await api.patchTask(taskId, patch);
              await loadProject(route.projectId);
              await refreshAll();
              pushToast("success", "Task updated");
            } catch (e: any) {
              setError(e?.message || "Update task failed");
              pushToast("error", e?.message || "Update task failed");
            } finally {
              setBusy(false);
            }
          }}
          onDeleteTask={(taskId, taskTitle) => {
            askConfirm({
              title: "Delete task",
              message: `"${taskTitle}" will be permanently deleted. This cannot be undone.`,
              confirmLabel: "Delete task",
              onConfirm: async () => {
                setError("");
                setBusy(true);
                try {
                  await api.deleteTask(taskId);
                  await loadProject(route.projectId);
                  await refreshAll();
                  pushToast("success", "Task deleted");
                } catch (e: any) {
                  setError(e?.message || "Delete task failed");
                  pushToast("error", e?.message || "Delete task failed");
                } finally {
                  setBusy(false);
                }
              },
            });
          }}
          onBack={() => void navigate({ name: "projects" })}
        />
      ) : null}
    </div>
  );
}

/* ─── TOPBAR ───────────────────────────────────────────────────── */
function Topbar(props: {
  authed: boolean;
  user: User | null;
  activeRoute: string;
  onNav: (r: Route) => void;
  onLogout: () => void;
}) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brandMark">
          <div className="brandDot" />
        </div>
        <span>TeamTask</span>
      </div>

      <div className="nav">
        {props.authed ? (
          <>
            <NavBtn
              label="Dashboard"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
              }
              active={props.activeRoute === "dashboard"}
              onClick={() => props.onNav({ name: "dashboard" })}
            />
            <NavBtn
              label="Projects"
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 7a2 2 0 0 1 2-2h4l2 3h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z"/>
                </svg>
              }
              active={props.activeRoute === "projects" || props.activeRoute === "project"}
              onClick={() => props.onNav({ name: "projects" })}
            />
            {props.user && (
              <div className="userChip">
                <div className="userAvatar">
                  {(props.user.name || props.user.email)[0].toUpperCase()}
                </div>
                <span>{props.user.name || props.user.email}</span>
              </div>
            )}
            <button className="btn danger signOutBtn" onClick={props.onLogout}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function NavBtn(props: { label: string; icon?: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`btn navBtn${props.active ? " active" : ""}`}
      onClick={props.onClick}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

/* ─── AUTH CARD ─────────────────────────────────────────────────── */
function AuthCard(props: {
  mode: "login" | "signup";
  busy: boolean;
  onSubmit: (email: string, password: string, clearInputs: () => void, name?: string) => void;
  onSwitch: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function clearInputs() {
    setName("");
    setEmail("");
    setPassword("");
  }

  const isSignup = props.mode === "signup";
  const primaryLabel = props.busy ? "Working…" : isSignup ? "Create account" : "Sign in";

  return (
    <div className="authWrap">
      <div className="panel authPanel">
        <div className="authHeader">
          <div className="authLogo">
            <div className="dot" style={{ width: 10, height: 10 }} />
          </div>
          <h1 className="authTitle">{isSignup ? "Create account" : "Welcome back"}</h1>
          <p className="authSub">
            {isSignup ? "Start managing your team tasks." : "Sign in to your workspace."}
          </p>
        </div>

        {isSignup ? (
          <div className="field">
            <label>Name</label>
            <input
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              disabled={props.busy}
            />
          </div>
        ) : null}

        <div className="field">
          <label>Email</label>
          <input
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            disabled={props.busy}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <input
            value={password}
            autoComplete={isSignup ? "new-password" : "current-password"}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="At least 8 characters"
            disabled={props.busy}
          />
        </div>

        <button
          className="btn primary authSubmit"
          disabled={props.busy}
          aria-busy={props.busy ? "true" : "false"}
          onClick={() => props.onSubmit(email, password, clearInputs, name)}
        >
          {props.busy
            ? <><span className="spinner" /> {isSignup ? "Creating account…" : "Signing in…"}</>
            : primaryLabel}
        </button>

        <div className="authSwitch">
          {isSignup ? "Already have an account?" : "No account yet?"}
          <button className="btn authSwitchBtn" disabled={props.busy} onClick={props.onSwitch}>
            {isSignup ? "Sign in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── DASHBOARD ─────────────────────────────────────────────────── */
function DashboardView(props: { dashboard: Dashboard | null; members: Member[] }) {
  const d = props.dashboard;
  return (
    <div className="pageContent">
      <div className="pageHeader">
        <h1 className="pageTitle">Dashboard</h1>
        <p className="pageSubtitle">Overview of all your workspace activity</p>
      </div>
      <div className="grid">
        <div className="panel">
          <h2>Overview</h2>
          {d ? (
            <div className="kpis">
              <Kpi label="Total tasks"  value={d.totalTasks}               color="blue"   />
              <Kpi label="To Do"        value={d.tasksByStatus["To Do"]}   color="default"/>
              <Kpi label="In Progress"  value={d.tasksByStatus["In Progress"]} color="amber" />
              <Kpi label="Overdue"      value={d.overdueTasks}             color="rose"   />
            </div>
          ) : (
            <div className="kpis">
              {[0,1,2,3].map(i => (
                <div key={i} className="skKpi">
                  <div className="skLine label" />
                  <div className="skLine val" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Tasks per user</h2>
          {d ? (
            <div className="list">
              {Object.entries(d.tasksPerUser).map(([userId, count]) => (
                <div className="item" key={userId}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="itemUserRow">
                      <div className="userAvatarSm">
                        {userId === "Unassigned" ? "—" : resolveName(props.members, userId)[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="title" style={{ fontSize: 13 }}>
                        {userId === "Unassigned" ? "Unassigned" : resolveName(props.members, userId)}
                      </div>
                    </div>
                    <span className="pill">{count} tasks</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="list">
              {[0,1,2].map(i => (
                <div key={i} className="skCard">
                  <div className="skLine title" />
                  <div className="skLine short" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    blue:    "var(--blue)",
    green:   "var(--green)",
    amber:   "var(--amber)",
    rose:    "var(--rose)",
    default: "var(--text)",
  };
  const c = colorMap[props.color || "default"];
  return (
    <div className="kpi">
      <div className="kpiLabel">{props.label}</div>
      <div className="kpiValue" style={{ color: c }}>{props.value}</div>
    </div>
  );
}

/* ─── PROJECTS ──────────────────────────────────────────────────── */
function ProjectsView(props: {
  projects: Project[];
  busy: boolean;
  onCreate: (name: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="pageContent">
      <div className="pageHeader">
        <h1 className="pageTitle">Projects</h1>
        <p className="pageSubtitle">Manage and organize your team's work</p>
      </div>
      <div className="grid">
        <div className="panel">
          <h2>New project</h2>
          <div className="field">
            <label>Project name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q3 Launch"
              disabled={props.busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  props.onCreate(name.trim());
                  setName("");
                }
              }}
            />
          </div>
          <div className="row">
            <button
              className="btn primary"
              disabled={props.busy || !name.trim()}
              onClick={() => {
                if (!name.trim()) return;
                props.onCreate(name.trim());
                setName("");
              }}
            >
              {props.busy
                ? <><span className="btnDots"><span/><span/><span/></span> Creating</>
                : <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    Create project
                  </>}
            </button>
          </div>

          <div style={{ marginTop: 28 }}>
            <h2>Your projects</h2>
            <div className="list">
              {props.busy && props.projects.length === 0 ? (
                [0,1,2].map(i => (
                  <div key={i} className="skCard">
                    <div className="skLine title" />
                    <div className="skLine short" />
                  </div>
                ))
              ) : props.projects.map((p) => (
                <div className="item projectItem" key={p.id}>
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <div className="projectItemLeft">
                      <div className="projectIcon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 7a2 2 0 0 1 2-2h4l2 3h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z"/>
                        </svg>
                      </div>
                      <div>
                        <div className="title">{p.name}</div>
                        <div className="meta" style={{ marginTop: 4 }}>
                          <span className="pill">{p.myRole}</span>
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                      <button className="btn" style={{ flexShrink: 0 }} onClick={() => props.onOpen(p.id)}>
                        Open
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                      </button>
                      {p.myRole === "Admin" && (
                        <button
                          className="btn danger iconBtn"
                          title="Delete project"
                          onClick={() => props.onDelete(p.id, p.name)}
                          disabled={props.busy}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {!props.busy && props.projects.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyIcon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 7a2 2 0 0 1 2-2h4l2 3h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7z"/>
                    </svg>
                  </div>
                  <div>No projects yet. Create one above.</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Quick help</h2>
          <div className="helpCards">
            <div className="helpCard">
              <div className="helpCardIcon blue">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div>
                <div className="helpCardTitle">Getting started</div>
                <div className="muted">Create a project, then open it to add members and manage tasks.</div>
              </div>
            </div>
            <div className="helpCard">
              <div className="helpCardIcon green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <div className="helpCardTitle">Team roles</div>
                <div className="muted">Admins can invite teammates by email and delete tasks or projects.</div>
              </div>
            </div>
            <div className="helpCard">
              <div className="helpCardIcon rose">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </div>
              <div>
                <div className="helpCardTitle">Deleting</div>
                <div className="muted">Use the trash icon to delete projects or tasks. A confirmation will appear.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PROJECT VIEW ──────────────────────────────────────────────── */
function ProjectView(props: {
  project: Project | null;
  me: User | null;
  members: Member[];
  tasks: Task[];
  busy: boolean;
  onRefresh: () => void;
  onAddMember: (email: string) => void;
  onRemoveMember: (userId: string) => void;
  onCreateTask: (payload: {
    title: string;
    description: string;
    dueDate: string;
    priority: TaskPriority;
    assignedTo?: string | null;
  }) => void;
  onSaveTask: (taskId: string, patch: Record<string, any>) => void;
  onDeleteTask: (taskId: string, title: string) => void;
  onBack: () => void;
}) {
  const p = props.project;
  if (!p) return <div className="panel" style={{ marginTop: 24 }}>Project not found.</div>;

  const isAdmin = p.myRole === "Admin";
  const [memberEmail, setMemberEmail] = useState("");

  const [title, setTitle]           = useState("");
  const [description, setDescription] = useState("");
  const [due, setDue]               = useState("");
  const [priority, setPriority]     = useState<TaskPriority>("Medium");
  const [assignedTo, setAssignedTo] = useState<string>("");

  const doneTasks   = props.tasks.filter((t) => t.status === "Done").length;
  const totalTasks  = props.tasks.length;
  const donePct     = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const overdueCnt  = props.tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;

  return (
    <div className="pageContent">
      <div className="pageHeader">
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <button className="btn backBtn" onClick={props.onBack} disabled={props.busy}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <h1 className="pageTitle" style={{ margin: 0 }}>{p.name}</h1>
          <span className="pill">{p.myRole}</span>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 16, flexWrap: "wrap" }}>
          <span className="pageStat">
            <span className="pageStatVal">{totalTasks}</span> tasks
          </span>
          <span className="pageStat">
            <span className="pageStatVal" style={{ color: "var(--green)" }}>{doneTasks}</span> done
          </span>
          {overdueCnt > 0 && (
            <span className="pageStat">
              <span className="pageStatVal" style={{ color: "var(--rose)" }}>{overdueCnt}</span> overdue
            </span>
          )}
          <button className="btn" style={{ marginLeft: "auto" }} onClick={props.onRefresh} disabled={props.busy}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {props.busy ? "…" : "Refresh"}
          </button>
        </div>
        {totalTasks > 0 && (
          <div className="progressBar" style={{ marginTop: 12 }}>
            <div className="progressFill" style={{ width: `${donePct}%` }} />
          </div>
        )}
      </div>

      <div className="grid">
        {/* Left: Members */}
        <div className="panel">
          <h2>Members</h2>

          {isAdmin ? (
            <>
              <div className="field">
                <label>Invite by email</label>
                <input
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  disabled={props.busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && memberEmail.trim()) {
                      props.onAddMember(memberEmail.trim());
                      setMemberEmail("");
                    }
                  }}
                />
              </div>
              <div className="row" style={{ marginBottom: 20 }}>
                <button
                  className="btn primary"
                  disabled={props.busy || !memberEmail.trim()}
                  onClick={() => {
                    if (!memberEmail.trim()) return;
                    props.onAddMember(memberEmail.trim());
                    setMemberEmail("");
                  }}
                >
                  {props.busy
                    ? <><span className="btnDots"><span/><span/><span/></span> Adding</>
                    : <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add member
                      </>}
                </button>
              </div>
            </>
          ) : (
            <div className="muted" style={{ marginBottom: 16 }}>
              Members can view assigned projects only.
            </div>
          )}

          <div className="list">
            {props.members.map((m) => (
              <div className="item" key={m.user.id}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <div className="itemUserRow">
                    <div className="userAvatarSm">
                      {m.user.name[0]?.toUpperCase() || "?"}
                    </div>
                    <div>
                      <div className="title" style={{ fontSize: 13 }}>{m.user.name}</div>
                      <div className="meta" style={{ marginTop: 3 }}>
                        <span className="pill">{m.role}</span>
                        <span style={{ color: "var(--text3)", fontSize: 11 }}>{m.user.email}</span>
                      </div>
                    </div>
                  </div>
                  {isAdmin && m.role !== "Admin" ? (
                    <button
                      className="btn danger iconBtn"
                      style={{ flexShrink: 0 }}
                      onClick={() => props.onRemoveMember(m.user.id)}
                      disabled={props.busy}
                      title="Remove member"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <line x1="23" y1="11" x2="17" y2="11"/>
                      </svg>
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Tasks */}
        <div className="panel">
          <h2>Tasks</h2>

          {isAdmin ? (
            <>
              <div className="taskForm">
                <div className="field">
                  <label>Title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" disabled={props.busy} />
                </div>

                <div className="field">
                  <label>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional details…"
                    disabled={props.busy}
                  />
                </div>

                <div className="row" style={{ gap: 10 }}>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <label>Due date</label>
                    <input value={due} onChange={(e) => setDue(e.target.value)} type="date" disabled={props.busy} />
                  </div>
                  <div className="field" style={{ flex: 1, margin: 0 }}>
                    <label>Priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} disabled={props.busy}>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label>Assign to</label>
                  <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={props.busy}>
                    <option value="">Unassigned</option>
                    {props.members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="row" style={{ marginBottom: 4 }}>
                  <button
                    className="btn primary"
                    disabled={props.busy}
                    onClick={() => {
                      const dueIso = isoFromDateInput(due);
                      if (!dueIso || !title.trim()) return;
                      props.onCreateTask({
                        title: title.trim(),
                        description: description.trim(),
                        dueDate: dueIso,
                        priority,
                        assignedTo: assignedTo || null,
                      });
                      setTitle(""); setDescription(""); setDue(""); setAssignedTo("");
                    }}
                  >
                    {props.busy
                      ? <><span className="btnDots"><span/><span/><span/></span> Creating</>
                      : <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                          </svg>
                          Add task
                        </>}
                  </button>
                </div>
              </div>
              <div className="divider" />
            </>
          ) : (
            <div className="muted" style={{ marginBottom: 16 }}>
              Members can update status of assigned tasks only.
            </div>
          )}

          <div className="list">
            {props.busy && props.tasks.length === 0 ? (
              [0,1,2].map(i => (
                <div key={i} className="skCard">
                  <div className="skLine title" />
                  <div className="skLine mid" />
                  <div className="skLine short" />
                </div>
              ))
            ) : props.tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                meId={props.me?.id || ""}
                isAdmin={isAdmin}
                members={props.members}
                onSave={props.onSaveTask}
                onDelete={props.onDeleteTask}
                disabled={props.busy}
              />
            ))}
            {!props.busy && props.tasks.length === 0 ? (
              <div className="emptyState">
                <div className="emptyIcon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <div>No tasks yet. Add one above.</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── TASK CARD ─────────────────────────────────────────────────── */
function TaskCard(props: {
  task: Task;
  meId: string;
  isAdmin: boolean;
  members: Member[];
  onSave: (taskId: string, patch: Record<string, any>) => void;
  onDelete: (taskId: string, title: string) => void;
  disabled: boolean;
}) {
  const t = props.task;
  const [status, setStatus]   = useState<TaskStatus>(t.status);
  const [assignee, setAssignee] = useState<string>(t.assignedTo || "");
  const [expanded, setExpanded] = useState(false);
  const canSave = (props.isAdmin || t.assignedTo === props.meId) && !props.disabled;

  const overdue = isOverdue(t.dueDate, status);
  const statusClass =
    status === "Done" ? "pill ok"
    : overdue         ? "pill bad"
    : status === "In Progress" ? "pill warn"
    : "pill";

  const priorityColor =
    t.priority === "High"   ? "var(--rose)"
    : t.priority === "Medium" ? "var(--amber)"
    : "var(--text3)";

  return (
    <div className={`item taskItem${status === "Done" ? " done" : ""}`}>
      <div className="taskItemTop">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <button
              className="expandBtn"
              onClick={() => setExpanded((x) => !x)}
              title={expanded ? "Collapse" : "Edit"}
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 160ms" }}
              >
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <div className="title" style={{ fontSize: 13 }}>{t.title}</div>
          </div>
          <div className="row" style={{ gap: 6, flexShrink: 0 }}>
            <span className={statusClass}>{status}</span>
            {props.isAdmin && (
              <button
                className="btn danger iconBtn"
                title="Delete task"
                onClick={() => props.onDelete(t.id, t.title)}
                disabled={props.disabled}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/>
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="meta">
          <span className="pill" style={{ color: priorityColor }}>{t.priority}</span>
          <span className="pill">Due {formatDate(t.dueDate)}</span>
          <span className="pill">
            {t.assignedTo ? resolveName(props.members, t.assignedTo) : "Unassigned"}
          </span>
        </div>

        {t.description && !expanded ? (
          <div className="muted" style={{ fontSize: 12, marginTop: -2 }}>{t.description}</div>
        ) : null}
      </div>

      {expanded && (
        <div className="taskItemExpanded">
          {t.description ? (
            <div className="field" style={{ margin: "0 0 10px" }}>
              <label>Description</label>
              <div className="muted" style={{ fontSize: 12, padding: "6px 0" }}>{t.description}</div>
            </div>
          ) : null}

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <div className="field" style={{ margin: 0, minWidth: 160 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={props.disabled}>
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Done">Done</option>
              </select>
            </div>

            {props.isAdmin ? (
              <div className="field" style={{ margin: 0, minWidth: 180 }}>
                <label>Assignee</label>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={props.disabled}>
                  <option value="">Unassigned</option>
                  {props.members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              className="btn primary"
              disabled={!canSave}
              style={{ alignSelf: "flex-end" }}
              onClick={() => {
                const patch: Record<string, any> = { status };
                if (props.isAdmin) patch.assignedTo = assignee;
                props.onSave(t.id, patch);
                setExpanded(false);
              }}
            >
              {props.disabled ? <><span className="spinner" /> Saving</> : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function resolveName(members: Member[], userId: string): string {
  return members.find((m) => m.user.id === userId)?.user.name || userId;
}