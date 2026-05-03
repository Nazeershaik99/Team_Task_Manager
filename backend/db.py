import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

import psycopg


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required (PostgreSQL connection string)")
    return url



@contextmanager
def db_conn() -> Iterator[psycopg.Connection[Any]]:
    with psycopg.connect(database_url(), autocommit=True) as conn:
        yield conn


def init_db() -> None:
    ddl = """
    create table if not exists users (
      id uuid primary key,
      name text not null,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null
    );

    create table if not exists projects (
      id uuid primary key,
      name text not null,
      created_by uuid not null references users(id) on delete restrict,
      created_at timestamptz not null
    );

    create table if not exists memberships (
      id uuid primary key,
      project_id uuid not null references projects(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      role text not null check (role in ('Admin','Member')),
      created_at timestamptz not null,
      unique (project_id, user_id)
    );

    create table if not exists tasks (
      id uuid primary key,
      project_id uuid not null references projects(id) on delete cascade,
      title text not null,
      description text not null default '',
      due_date timestamptz not null,
      priority text not null check (priority in ('Low','Medium','High')),
      assigned_to uuid null references users(id) on delete set null,
      status text not null check (status in ('To Do','In Progress','Done')),
      created_at timestamptz not null,
      updated_at timestamptz not null
    );

    create index if not exists idx_tasks_project on tasks(project_id);
    create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
    """
    with db_conn() as conn:
        conn.execute(ddl)


def new_id() -> uuid.UUID:
    return uuid.uuid4()