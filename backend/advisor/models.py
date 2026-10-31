from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base
from ..models import identifier, now

class DiscoveryConversation(Base):
    __tablename__ = 'discovery_conversations'
    __table_args__ = (UniqueConstraint('business_id','scope'),)
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'),index=True)
    scope: Mapped[str] = mapped_column(String(150))
    messages: Mapped[list] = mapped_column(JSON,default=list)
    summary: Mapped[str] = mapped_column(Text,default='')
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now,onupdate=now)

class FounderDecision(Base):
    __tablename__ = 'founder_decisions'
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'),index=True)
    origin: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20),default='pending')
    before_hash: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now)

class BusinessModelComparison(Base):
    __tablename__ = 'business_model_comparisons'
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'),index=True)
    profile_hash: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(30))
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now)

class SavedRecommendation(Base):
    __tablename__ = 'saved_recommendations'
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=identifier)
    business_id: Mapped[str] = mapped_column(ForeignKey('businesses.id'),index=True)
    profile_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20),default='new')
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now)

class RecommendationFeedback(Base):
    __tablename__ = 'recommendation_feedback'
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=identifier)
    recommendation_id: Mapped[str] = mapped_column(ForeignKey('saved_recommendations.id'),index=True)
    action: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now)
