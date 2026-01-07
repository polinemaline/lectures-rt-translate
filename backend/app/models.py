# app/models.py
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now())


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


class UploadJob(Base):
    __tablename__ = "upload_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=False)

    status = Column(
        String(30), nullable=False, default="uploaded"
    )  # uploaded|processing|done|error
    stage = Column(
        String(30), nullable=False, default="uploaded"
    )  # extract|transcribe|translate|export|done|error
    progress = Column(Integer, nullable=False, default=0)

    src_language = Column(String(32), nullable=True)
    target_language = Column(String(32), nullable=True)

    transcript_text = Column(Text, nullable=True)
    translated_text = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="upload_jobs")


from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String(255), nullable=False, default="Конспект")
    original_language = Column(String(32), nullable=True)
    target_language = Column(String(32), nullable=True)

    original_text = Column(Text, nullable=False, default="")
    translated_text = Column(Text, nullable=False, default="")

    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", backref="notes")
