"""Shared Pydantic models for project-state service."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, UUID4


class Job(BaseModel):
    id: UUID4
    project_id: Optional[UUID4] = None
    module: str
    action: str
    trigger_type: str
    trigger_payload: Optional[Any] = None
    status: str
    priority: str
    required_permissions: list[str]
    approval_required: bool
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    artifacts: list[Any]
    error_message: Optional[str] = None
    requested_by: str
    created_at: datetime
    updated_at: datetime


class Project(BaseModel):
    id: UUID4
    slug: str
    client_name: str
    client_email: Optional[str] = None
    service_type: str
    status: str
    budget_signal: Optional[str] = None
    timeline: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class WorkerNode(BaseModel):
    id: UUID4
    slug: str
    display_name: str
    platform: str
    host: Optional[str] = None
    api_base_url: Optional[str] = None
    status: str
    capabilities: list[str]
    watched_paths: dict[str, str]
    last_seen_at: datetime
    created_at: datetime
    updated_at: datetime
