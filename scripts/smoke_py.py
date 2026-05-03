import os
import random
import string
import time
from urllib import request


BASE = os.environ.get("BASE_URL", "http://localhost:3000")


def _rand_email(prefix: str) -> str:
    s = "".join(random.choice(string.hexdigits.lower()) for _ in range(8))
    return f"{prefix}.{s}@example.com"


def _json(method: str, path: str, body: str | None = None, token: str | None = None) -> dict:
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    req = request.Request(BASE + path, data=(body.encode("utf-8") if body else None), headers=headers, method=method)
    with request.urlopen(req, timeout=10) as resp:
        return __import__("json").loads(resp.read().decode("utf-8"))


def main() -> None:
    admin_email = _rand_email("admin")
    mem_email = _rand_email("mem")

    u1 = _json("POST", "/api/auth/signup", body=f'{{"name":"Admin","email":"{admin_email}","password":"password123"}}')
    u2 = _json("POST", "/api/auth/signup", body=f'{{"name":"Member","email":"{mem_email}","password":"password123"}}')

    token = u1["token"]
    proj = _json("POST", "/api/projects", body='{"name":"Project Alpha"}', token=token)["project"]
    _json("POST", f'/api/projects/{proj["id"]}/members', body=f'{{"email":"{mem_email}"}}', token=token)

    members = _json("GET", f'/api/projects/{proj["id"]}/members', token=token)["members"]
    mem_id = [m["user"]["id"] for m in members if m["user"]["email"] == mem_email][0]

    due = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 86400))
    task = _json(
        "POST",
        f'/api/projects/{proj["id"]}/tasks',
        body=f'{{"title":"First task","description":"Do thing","dueDate":"{due}","priority":"High","assignedTo":"{mem_id}"}}',
        token=token,
    )["task"]

    _json("PATCH", f'/api/tasks/{task["id"]}', body='{"status":"In Progress"}', token=u2["token"])

    dash = _json("GET", "/api/dashboard", token=token)["dashboard"]
    print({"ok": True, "projectId": proj["id"], "taskId": task["id"], "overdue": dash["overdueTasks"]})


if __name__ == "__main__":
    main()
