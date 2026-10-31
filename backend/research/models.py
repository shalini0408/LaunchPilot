from datetime import datetime
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base
from ..models import identifier, now

class ResearchRun(Base):
    __tablename__ = 'research_runs'
    __table_args__ = (Index('one_active_research_per_business', 'business_id', unique=True, sqlite_where=text("status IN ('queued', 'running')")),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'), index=True)
    profile_hash: Mapped[str] = mapped_column(String(64))
    profile: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default='queued')
    stage: Mapped[str] = mapped_column(String(40), default='queued')
    message: Mapped[str] = mapped_column(Text, default='Research queued.')
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class GovernmentSource(Base):
    __tablename__ = 'government_sources'
    __table_args__ = (UniqueConstraint('run_id', 'url'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    run_id: Mapped[str] = mapped_column(ForeignKey('research_runs.id'), index=True)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    agency: Mapped[str] = mapped_column(String(300))
    jurisdiction: Mapped[str] = mapped_column(String(300))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    published_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_date: Mapped[str | None] = mapped_column(String(100), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    links: Mapped[list] = mapped_column(JSON, default=list)

class RegulatoryRequirement(Base):
    __tablename__ = 'regulatory_requirements'
    __table_args__ = (UniqueConstraint('business_id', 'stable_key'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey('research_runs.id'))
    task_id: Mapped[str | None] = mapped_column(ForeignKey('roadmap_tasks.id'), unique=True, nullable=True)
    stable_key: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSON)
    needs_revalidation: Mapped[bool] = mapped_column(Boolean, default=False)
    last_checked: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
