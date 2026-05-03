from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from backend.db import db_conn, new_id, utc_now
from backend.security import hash_password, jwt_sign, jwt_verify, verify_password


api = APIRouter()


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2:
        return None
    if parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def auth_user_id(authorization: Optional[str]) -> uuid.UUID:
    token = _bearer_token(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = jwt_verify(token)
    if not payload or not isinstance(payload.get("sub"), str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        return uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


def sanitize_user(row: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": str(row["id"]), "name": row["name"], "email": row["email"], "createdAt": row["created_at"].isoformat()}


class SignupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str
    password: str


class ProjectCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class MemberAddIn(BaseModel):
    email: str


class TaskCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    description: str = Field(default="", max_length=2000)
    dueDate: str
    priority: str
    assignedTo: Optional[str] = None


class TaskPatchIn(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    dueDate: Optional[str] = None
    priority: Optional[str] = None
    assignedTo: Optional[str] = None


def _require_membership(conn, user_id: uuid.UUID, project_id: uuid.UUID) -> Optional[str]:
    row = conn.execute(
        "select role from memberships where project_id=%s and user_id=%s",
        (project_id, user_id),
    ).fetchone()
    return row[0] if row else None


@api.post("/auth/signup")
def signup(payload: SignupIn) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    pw_hash = hash_password(payload.password)
    user_id = new_id()
    now = utc_now()
    with db_conn() as conn:
        exists = conn.execute("select 1 from users where email=%s", (email,)).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Email already in use")
        conn.execute(
            "insert into users (id,name,email,password_hash,created_at) values (%s,%s,%s,%s,%s)",
            (user_id, payload.name.strip(), email, pw_hash, now),
        )
        row = conn.execute("select id,name,email,created_at from users where id=%s", (user_id,)).fetchone()
    user = {"id": row[0], "name": row[1], "email": row[2], "created_at": row[3]}
    return {"user": sanitize_user(user), "token": jwt_sign(str(user_id))}


@api.post("/auth/login")
def login(payload: LoginIn) -> Dict[str, Any]:
    email = payload.email.strip().lower()
    with db_conn() as conn:
        row = conn.execute(
            "select id,name,email,password_hash,created_at from users where email=%s",
            (email,),
        ).fetchone()
    if not row or not verify_password(payload.password, row[3]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user = {"id": row[0], "name": row[1], "email": row[2], "created_at": row[4]}
    return {"user": sanitize_user(user), "token": jwt_sign(str(row[0]))}


@api.get("/me")
def me(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    with db_conn() as conn:
        row = conn.execute("select id,name,email,created_at from users where id=%s", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = {"id": row[0], "name": row[1], "email": row[2], "created_at": row[3]}
    return {"user": sanitize_user(user)}


@api.post("/projects")
def create_project(payload: ProjectCreateIn, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    project_id = new_id()
    now = utc_now()
    with db_conn() as conn:
        conn.execute(
            "insert into projects (id,name,created_by,created_at) values (%s,%s,%s,%s)",
            (project_id, payload.name.strip(), user_id, now),
        )
        conn.execute(
            "insert into memberships (id,project_id,user_id,role,created_at) values (%s,%s,%s,'Admin',%s)",
            (new_id(), project_id, user_id, now),
        )
        row = conn.execute("select id,name,created_by,created_at from projects where id=%s", (project_id,)).fetchone()
    return {"project": {"id": str(row[0]), "name": row[1], "createdBy": str(row[2]), "createdAt": row[3].isoformat()}}


@api.get("/projects")
def list_projects(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    with db_conn() as conn:
        rows = conn.execute(
            """
            select p.id,p.name,p.created_by,p.created_at,m.role
            from memberships m
            join projects p on p.id=m.project_id
            where m.user_id=%s
            order by p.created_at desc
            """,
            (user_id,),
        ).fetchall()
    projects = [
        {
            "id": str(r[0]),
            "name": r[1],
            "createdBy": str(r[2]),
            "createdAt": r[3].isoformat(),
            "myRole": r[4],
        }
        for r in rows
    ]
    return {"projects": projects}


# ── NEW: Delete project (Admin only) ────────────────────────────────
@api.delete("/projects/{project_id}")
def delete_project(project_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role != "Admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        # Delete in dependency order: tasks → memberships → project
        conn.execute("delete from tasks where project_id=%s", (pid,))
        conn.execute("delete from memberships where project_id=%s", (pid,))
        conn.execute("delete from projects where id=%s", (pid,))
    return {"ok": True}


@api.get("/projects/{project_id}/members")
def list_members(project_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        rows = conn.execute(
            """
            select u.id,u.name,u.email,u.created_at,m.role
            from memberships m
            join users u on u.id=m.user_id
            where m.project_id=%s
            order by m.role desc, u.created_at asc
            """,
            (pid,),
        ).fetchall()
    members = [
        {"user": {"id": str(r[0]), "name": r[1], "email": r[2], "createdAt": r[3].isoformat()}, "role": r[4]}
        for r in rows
    ]
    return {"members": members}


@api.post("/projects/{project_id}/members")
def add_member(project_id: str, payload: MemberAddIn, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    email = payload.email.strip().lower()
    now = utc_now()
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role != "Admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        urow = conn.execute("select id,name,email,created_at from users where email=%s", (email,)).fetchone()
        if not urow:
            raise HTTPException(status_code=400, detail="No such user")
        target_id = urow[0]
        exists = conn.execute(
            "select 1 from memberships where project_id=%s and user_id=%s",
            (pid, target_id),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="User already in project")
        conn.execute(
            "insert into memberships (id,project_id,user_id,role,created_at) values (%s,%s,%s,'Member',%s)",
            (new_id(), pid, target_id, now),
        )
    return {"ok": True}


@api.delete("/projects/{project_id}/members/{member_user_id}")
def remove_member(project_id: str, member_user_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    mid = uuid.UUID(member_user_id)
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role != "Admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        target = conn.execute(
            "select role from memberships where project_id=%s and user_id=%s",
            (pid, mid),
        ).fetchone()
        if not target:
            raise HTTPException(status_code=400, detail="No such member")
        if target[0] == "Admin":
            raise HTTPException(status_code=400, detail="Cannot remove admin")
        conn.execute("delete from memberships where project_id=%s and user_id=%s", (pid, mid))
        conn.execute("update tasks set assigned_to=null, updated_at=%s where project_id=%s and assigned_to=%s", (utc_now(), pid, mid))
    return {"ok": True}


def _parse_due(due: str) -> datetime:
    try:
        return datetime.fromisoformat(due.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Valid dueDate is required (ISO)")


@api.post("/projects/{project_id}/tasks")
def create_task(project_id: str, payload: TaskCreateIn, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    due = _parse_due(payload.dueDate)
    priority = payload.priority.strip()
    if priority not in ("Low", "Medium", "High"):
        raise HTTPException(status_code=400, detail="Priority must be Low, Medium, or High")
    assigned_to = uuid.UUID(payload.assignedTo) if payload.assignedTo else None
    now = utc_now()
    task_id = new_id()
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role != "Admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        if assigned_to:
            ok_assignee = conn.execute(
                "select 1 from memberships where project_id=%s and user_id=%s",
                (pid, assigned_to),
            ).fetchone()
            if not ok_assignee:
                raise HTTPException(status_code=400, detail="Assignee must be a project member")
        conn.execute(
            """
            insert into tasks (id,project_id,title,description,due_date,priority,assigned_to,status,created_at,updated_at)
            values (%s,%s,%s,%s,%s,%s,%s,'To Do',%s,%s)
            """,
            (task_id, pid, payload.title.strip(), payload.description.strip(), due, priority, assigned_to, now, now),
        )
        row = conn.execute(
            """
            select id,project_id,title,description,due_date,priority,assigned_to,status,created_at,updated_at
            from tasks where id=%s
            """,
            (task_id,),
        ).fetchone()
    return {
        "task": {
            "id": str(row[0]),
            "projectId": str(row[1]),
            "title": row[2],
            "description": row[3],
            "dueDate": row[4].isoformat(),
            "priority": row[5],
            "assignedTo": str(row[6]) if row[6] else None,
            "status": row[7],
            "createdAt": row[8].isoformat(),
            "updatedAt": row[9].isoformat(),
        }
    }


@api.get("/projects/{project_id}/tasks")
def list_tasks(project_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    pid = uuid.UUID(project_id)
    with db_conn() as conn:
        role = _require_membership(conn, user_id, pid)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role == "Admin":
            rows = conn.execute(
                """
                select id,project_id,title,description,due_date,priority,assigned_to,status,created_at,updated_at
                from tasks where project_id=%s
                order by created_at desc
                """,
                (pid,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                select id,project_id,title,description,due_date,priority,assigned_to,status,created_at,updated_at
                from tasks where project_id=%s and assigned_to=%s
                order by created_at desc
                """,
                (pid, user_id),
            ).fetchall()
    tasks = [
        {
            "id": str(r[0]),
            "projectId": str(r[1]),
            "title": r[2],
            "description": r[3],
            "dueDate": r[4].isoformat(),
            "priority": r[5],
            "assignedTo": str(r[6]) if r[6] else None,
            "status": r[7],
            "createdAt": r[8].isoformat(),
            "updatedAt": r[9].isoformat(),
        }
        for r in rows
    ]
    return {"tasks": tasks}


# ── NEW: Delete task (Admin only) ────────────────────────────────────
@api.delete("/tasks/{task_id}")
def delete_task(task_id: str, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    tid = uuid.UUID(task_id)
    with db_conn() as conn:
        row = conn.execute(
            "select project_id from tasks where id=%s", (tid,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        project_id = row[0]
        role = _require_membership(conn, user_id, project_id)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        if role != "Admin":
            raise HTTPException(status_code=403, detail="Forbidden")
        conn.execute("delete from tasks where id=%s", (tid,))
    return {"ok": True}


@api.patch("/tasks/{task_id}")
def patch_task(task_id: str, payload: TaskPatchIn, authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    tid = uuid.UUID(task_id)
    with db_conn() as conn:
        trow = conn.execute(
            "select id,project_id,assigned_to,status from tasks where id=%s",
            (tid,),
        ).fetchone()
        if not trow:
            raise HTTPException(status_code=404, detail="Not found")
        project_id = trow[1]
        assigned_to = trow[2]
        role = _require_membership(conn, user_id, project_id)
        if not role:
            raise HTTPException(status_code=404, detail="Not found")
        is_admin = role == "Admin"
        is_assignee = assigned_to == user_id
        if not is_admin and not is_assignee:
            raise HTTPException(status_code=403, detail="Forbidden")

        updates: Dict[str, Any] = {}
        if payload.status is not None:
            s = payload.status.strip()
            if s not in ("To Do", "In Progress", "Done"):
                raise HTTPException(status_code=400, detail="Bad status")
            updates["status"] = s

        if not is_admin:
            if any(
                v is not None
                for v in (
                    payload.title,
                    payload.description,
                    payload.dueDate,
                    payload.priority,
                    payload.assignedTo,
                )
            ):
                raise HTTPException(status_code=403, detail="Forbidden")
        else:
            if payload.title is not None:
                t = payload.title.strip()
                if not t:
                    raise HTTPException(status_code=400, detail="Title is required")
                updates["title"] = t
            if payload.description is not None:
                updates["description"] = payload.description.strip()
            if payload.dueDate is not None:
                updates["due_date"] = _parse_due(payload.dueDate)
            if payload.priority is not None:
                p = payload.priority.strip()
                if p not in ("Low", "Medium", "High"):
                    raise HTTPException(status_code=400, detail="Bad priority")
                updates["priority"] = p
            if payload.assignedTo is not None:
                a = payload.assignedTo.strip()
                if not a:
                    updates["assigned_to"] = None
                else:
                    aid = uuid.UUID(a)
                    ok_assignee = conn.execute(
                        "select 1 from memberships where project_id=%s and user_id=%s",
                        (project_id, aid),
                    ).fetchone()
                    if not ok_assignee:
                        raise HTTPException(status_code=400, detail="Bad assignee")
                    updates["assigned_to"] = aid

        if not updates:
            raise HTTPException(status_code=400, detail="No changes")

        updates["updated_at"] = utc_now()
        sets = ", ".join([f"{k}=%s" for k in updates.keys()])
        vals = list(updates.values()) + [tid]
        conn.execute(f"update tasks set {sets} where id=%s", vals)

        row = conn.execute(
            """
            select id,project_id,title,description,due_date,priority,assigned_to,status,created_at,updated_at
            from tasks where id=%s
            """,
            (tid,),
        ).fetchone()

    return {
        "task": {
            "id": str(row[0]),
            "projectId": str(row[1]),
            "title": row[2],
            "description": row[3],
            "dueDate": row[4].isoformat(),
            "priority": row[5],
            "assignedTo": str(row[6]) if row[6] else None,
            "status": row[7],
            "createdAt": row[8].isoformat(),
            "updatedAt": row[9].isoformat(),
        }
    }


@api.get("/dashboard")
def dashboard(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    user_id = auth_user_id(authorization)
    now = utc_now()
    with db_conn() as conn:
        rows = conn.execute(
            """
            select t.status, t.assigned_to, t.due_date
            from tasks t
            join memberships m on m.project_id=t.project_id
            where m.user_id=%s
            """,
            (user_id,),
        ).fetchall()

        total = len(rows)
        by_status = {"To Do": 0, "In Progress": 0, "Done": 0}
        per_user: Dict[str, int] = {}
        overdue = 0

        for status, assigned_to, due_date in rows:
            if status in by_status:
                by_status[status] += 1
            key = str(assigned_to) if assigned_to else "Unassigned"
            per_user[key] = per_user.get(key, 0) + 1
            if due_date < now and status != "Done":
                overdue += 1

    return {
        "dashboard": {
            "totalTasks": total,
            "tasksByStatus": by_status,
            "tasksPerUser": per_user,
            "overdueTasks": overdue,
        }
    }