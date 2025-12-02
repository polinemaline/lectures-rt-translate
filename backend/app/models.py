from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    declarative_base,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


class Lecture(Base):
    __tablename__ = "lectures"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    language: Mapped[str] = mapped_column(String(10), default="en")

    segments: Mapped[list["Segment"]] = relationship(
        "Segment", back_populates="lecture", cascade="all, delete-orphan"
    )


class Segment(Base):
    __tablename__ = "segments"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    lecture_id: Mapped[int] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE")
    )
    start_ms: Mapped[int] = mapped_column(Integer)
    end_ms: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=True)

    lecture: Mapped["Lecture"] = relationship("Lecture", back_populates="segments")


Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())
