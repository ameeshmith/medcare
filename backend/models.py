from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    Float,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    full_name = Column(String(120), nullable=False, index=True)
    email = Column(String(150), nullable=False)
    phone = Column(String(40), nullable=False)
    age = Column(Integer, nullable=False, default=34)
    blood_group = Column(String(12), nullable=False, default="O+")
    insurance_provider = Column(String(100), nullable=False, default="Aetna HealthGrid")
    created_at = Column(DateTime, default=datetime.utcnow)

    appointments = relationship("Appointment", back_populates="patient")


class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    full_name = Column(String(120), nullable=False, index=True)
    department = Column(String(80), nullable=False, index=True)
    specialty = Column(String(120), nullable=False)
    room_number = Column(String(32), nullable=False)
    email = Column(String(150), nullable=False)
    shift_hours = Column(String(64), nullable=False, default="09:00 - 17:00")
    status = Column(String(32), nullable=False, default="ON_DUTY")

    slots = relationship("DoctorSlot", back_populates="doctor", cascade="all, delete-orphan")
    appointments = relationship("Appointment", back_populates="doctor")


class DoctorSlot(Base):
    __tablename__ = "doctor_slots"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False, index=True)
    slot_date = Column(String(20), nullable=False, index=True)  # YYYY-MM-DD
    slot_time = Column(String(16), nullable=False)              # HH:MM
    is_booked = Column(Boolean, default=False, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    block_reason = Column(String(160), nullable=True)

    doctor = relationship("Doctor", back_populates="slots")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False, index=True)
    appointment_date = Column(String(20), nullable=False, index=True)
    slot_time = Column(String(16), nullable=False)
    reason = Column(String(255), nullable=False)
    status = Column(
        String(32), nullable=False, default="CONFIRMED"
    )  # CONFIRMED, PENDING_APPROVAL, CANCELLED, RESCHEDULED, COMPLETED
    priority = Column(
        String(24), nullable=False, default="ROUTINE"
    )  # ROUTINE, URGENT, CRITICAL
    reminder_sent = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="appointments")
    doctor = relationship("Doctor", back_populates="appointments")


class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, index=True, nullable=False)
    operation_type = Column(
        String(64), nullable=False
    )  # CANCEL_APPOINTMENT, EMERGENCY_OVERRIDE, RESCHEDULE_CRITICAL, SCHEDULE_BLOCK
    agent_name = Column(String(64), nullable=False, default="Appointment Agent")
    target_appointment_id = Column(Integer, ForeignKey("appointments.id"), nullable=True)
    summary = Column(String(300), nullable=False)
    payload_json = Column(Text, nullable=False)
    risk_level = Column(String(24), nullable=False, default="HIGH")
    status = Column(
        String(24), nullable=False, default="PENDING"
    )  # PENDING, APPROVED, REJECTED
    reviewer_note = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


class N8nExecutionLog(Base):
    __tablename__ = "n8n_execution_logs"

    id = Column(Integer, primary_key=True, index=True)
    workflow_name = Column(String(140), nullable=False)
    trigger_type = Column(String(48), nullable=False)  # WEBHOOK, SCHEDULE_TRIGGER, SMTP_EMAIL
    status = Column(String(32), nullable=False, default="SUCCESS")
    recipient_email = Column(String(150), nullable=True)
    subject = Column(String(220), nullable=True)
    payload_preview = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=False, default=142)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyOperationsReport(Base):
    __tablename__ = "daily_operations_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_date = Column(String(20), nullable=False, index=True)
    total_appointments = Column(Integer, nullable=False, default=0)
    confirmed_count = Column(Integer, nullable=False, default=0)
    cancelled_count = Column(Integer, nullable=False, default=0)
    pending_approvals = Column(Integer, nullable=False, default=0)
    utilization_rate = Column(Float, nullable=False, default=0.0)
    executive_summary = Column(Text, nullable=False)
    operational_issues_json = Column(Text, nullable=False)
    generated_by = Column(String(80), nullable=False, default="Operations Agent (LangGraph)")
    created_at = Column(DateTime, default=datetime.utcnow)

