"""Persistent local founder, business, model selections, roadmap and progress."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
from sqlalchemy import JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

def identifier():
    return str(uuid4())

def now():
    return datetime.now(timezone.utc)

class Founder(Base):
    __tablename__ = 'founders'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    development_key: Mapped[str] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class Business(Base):
    __tablename__ = 'businesses'
    __table_args__ = (CheckConstraint('budget IS NULL OR budget >= 0', name='nonnegative_budget'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    founder_id: Mapped[str] = mapped_column(ForeignKey('founders.id', ondelete='CASCADE'), unique=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict, server_default='{}')
    company_name: Mapped[str] = mapped_column(String(300), default='')
    idea: Mapped[str] = mapped_column(Text, default='')
    industry: Mapped[str] = mapped_column(String(100), default='')
    business_model: Mapped[str] = mapped_column(String(100), default='')
    city: Mapped[str] = mapped_column(String(200), default='')
    state: Mapped[str] = mapped_column(String(200), default='')
    budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    ownership_details: Mapped[str] = mapped_column(Text, default='')
    legal_structure: Mapped[str] = mapped_column(String(80), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

class BusinessModelSelection(Base):
    __tablename__ = 'business_model_selections'
    __table_args__ = (UniqueConstraint('business_id', 'industry', 'business_model'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id', ondelete='CASCADE'), index=True)
    industry: Mapped[str] = mapped_column(String(100))
    business_model: Mapped[str] = mapped_column(String(100))
    selected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

class RoadmapTask(Base):
    __tablename__ = 'roadmap_tasks'
    __table_args__ = (UniqueConstraint('business_id', 'stable_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id', ondelete='CASCADE'), index=True)
    stable_key: Mapped[str] = mapped_column(String(300))
    title: Mapped[str] = mapped_column(String(500))
    guide: Mapped[dict] = mapped_column(JSON)
    position: Mapped[int] = mapped_column(default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

class TaskProgress(Base):
    __tablename__ = 'task_progress'
    __table_args__ = (UniqueConstraint('task_id'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    task_id: Mapped[str] = mapped_column(ForeignKey('roadmap_tasks.id', ondelete='CASCADE'), index=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
