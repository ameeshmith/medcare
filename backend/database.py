import json
from datetime import datetime, timedelta
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from config import settings
from models import (
    Base,
    Patient,
    Doctor,
    DoctorSlot,
    Appointment,
    ApprovalRequest,
    N8nExecutionLog,
    DailyOperationsReport,
)


def _create_db_engine():
    """Try PostgreSQL first; automatically fall back to local SQLite if Postgres is unreachable."""
    try:
        pg_engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 2},
        )
        with pg_engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return pg_engine, "PostgreSQL 16 (Connected)"
    except Exception:
        sqlite_engine = create_engine(
            settings.sqlite_fallback_url,
            connect_args={"check_same_thread": False},
        )
        return sqlite_engine, "PostgreSQL-Compatible Local Store (SQLite Active)"


engine, ACTIVE_DB_ENGINE_LABEL = _create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_and_seed_db():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        if db.query(Doctor).count() > 0:
            return

        today = datetime.now().strftime("%Y-%m-%d")
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        # Seed Doctors
        doctors = [
            Doctor(
                code="DOC-101",
                full_name="Dr. Elena Vance",
                department="Cardiology",
                specialty="Interventional Cardiology & Arrhythmia",
                room_number="Wing-A 302",
                email="e.vance@medgrid-hospital.org",
                shift_hours="09:00 - 17:00",
                status="ON_DUTY",
            ),
            Doctor(
                code="DOC-102",
                full_name="Dr. Marcus Chen",
                department="Neurology",
                specialty="Cerebrovascular & Neuro-Critical Care",
                room_number="Wing-B 410",
                email="m.chen@medgrid-hospital.org",
                shift_hours="09:00 - 17:00",
                status="ON_DUTY",
            ),
            Doctor(
                code="DOC-103",
                full_name="Dr. Priya Nair",
                department="Orthopedics",
                specialty="Joint Reconstruction & Sports Trauma",
                room_number="Wing-C 118",
                email="p.nair@medgrid-hospital.org",
                shift_hours="10:00 - 18:00",
                status="ON_DUTY",
            ),
            Doctor(
                code="DOC-104",
                full_name="Dr. Julian Thorne",
                department="Oncology",
                specialty="Precision Medical Oncology & Immunotherapy",
                room_number="Wing-D 205",
                email="j.thorne@medgrid-hospital.org",
                shift_hours="08:30 - 16:30",
                status="IN_SURGERY",
            ),
            Doctor(
                code="DOC-105",
                full_name="Dr. Sophia Al-Mansoor",
                department="Pediatrics",
                specialty="Pediatric Pulmonology & Neonatal Care",
                room_number="Wing-A 104",
                email="s.almansoor@medgrid-hospital.org",
                shift_hours="09:00 - 17:00",
                status="ON_DUTY",
            ),
        ]
        db.add_all(doctors)
        db.flush()

        # Seed Patients
        patients = [
            Patient(
                code="PAT-8801",
                full_name="Arthur Pendelton",
                email="arthur.p@example.com",
                phone="+1 (555) 234-8910",
                age=62,
                blood_group="A+",
                insurance_provider="BlueCross MedShield",
            ),
            Patient(
                code="PAT-8802",
                full_name="Maya Lin-Kovacs",
                email="maya.kovacs@example.com",
                phone="+1 (555) 876-5412",
                age=34,
                blood_group="O-",
                insurance_provider="Aetna HealthGrid",
            ),
            Patient(
                code="PAT-8803",
                full_name="Devon Brooks",
                email="devon.brooks@example.com",
                phone="+1 (555) 391-0028",
                age=47,
                blood_group="B+",
                insurance_provider="UnitedCare Premier",
            ),
            Patient(
                code="PAT-8804",
                full_name="Clara Sorensen",
                email="clara.sorensen@example.com",
                phone="+1 (555) 602-7731",
                age=29,
                blood_group="AB+",
                insurance_provider="Cigna ChoicePlus",
            ),
            Patient(
                code="PAT-8805",
                full_name="Rajesh Deshmukh",
                email="r.deshmukh@example.com",
                phone="+1 (555) 919-4410",
                age=55,
                blood_group="O+",
                insurance_provider="Aetna HealthGrid",
            ),
        ]
        db.add_all(patients)
        db.flush()

        # Seed Doctor Time Slots for today and tomorrow
        standard_slots = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00"]
        for doc in doctors:
            for date_str in [today, tomorrow]:
                for t in standard_slots:
                    is_blocked = doc.code == "DOC-104" and t in ["11:00", "12:00"] and date_str == today
                    db.add(
                        DoctorSlot(
                            doctor_id=doc.id,
                            slot_date=date_str,
                            slot_time=t,
                            is_booked=False,
                            is_blocked=is_blocked,
                            block_reason="Tumor Board & Inpatient Consult" if is_blocked else None,
                        )
                    )
        db.flush()

        # Helper to mark slot booked
        def mark_slot(doc_id: int, d_str: str, t_str: str):
            slot = (
                db.query(DoctorSlot)
                .filter_by(doctor_id=doc_id, slot_date=d_str, slot_time=t_str)
                .first()
            )
            if slot:
                slot.is_booked = True

        # Seed Appointments
        appts = [
            Appointment(
                code="APT-4091",
                patient_id=patients[0].id,
                doctor_id=doctors[0].id,
                appointment_date=today,
                slot_time="09:00",
                reason="Post-stent echocardiography & blood pressure titration",
                status="CONFIRMED",
                priority="URGENT",
                reminder_sent=True,
                notes="ECG baseline required 15m prior to consult.",
            ),
            Appointment(
                code="APT-4092",
                patient_id=patients[1].id,
                doctor_id=doctors[1].id,
                appointment_date=today,
                slot_time="10:00",
                reason="Recurring migraine aura & cranial MRI review",
                status="CONFIRMED",
                priority="ROUTINE",
                reminder_sent=True,
                notes="3T MRI scans uploaded to PACS.",
            ),
            Appointment(
                code="APT-4093",
                patient_id=patients[2].id,
                doctor_id=doctors[2].id,
                appointment_date=today,
                slot_time="11:00",
                reason="ACL reconstruction 6-week mobility assessment",
                status="CONFIRMED",
                priority="ROUTINE",
                reminder_sent=False,
                notes="Physical therapy clearance check.",
            ),
            Appointment(
                code="APT-4094",
                patient_id=patients[4].id,
                doctor_id=doctors[0].id,
                appointment_date=today,
                slot_time="14:00",
                reason="Acute chest tightness & Holter monitor telemetry review",
                status="PENDING_APPROVAL",
                priority="CRITICAL",
                reminder_sent=False,
                notes="Flagged by Appointment Agent for supervisor confirmation.",
            ),
            Appointment(
                code="APT-4095",
                patient_id=patients[3].id,
                doctor_id=doctors[4].id,
                appointment_date=tomorrow,
                slot_time="09:00",
                reason="Pediatric asthma nebulizer protocol follow-up",
                status="CONFIRMED",
                priority="ROUTINE",
                reminder_sent=False,
                notes="Bring peak flow meter diary.",
            ),
            Appointment(
                code="APT-4096",
                patient_id=patients[1].id,
                doctor_id=doctors[3].id,
                appointment_date=today,
                slot_time="15:00",
                reason="Biomarker panel consultation",
                status="CANCELLED",
                priority="ROUTINE",
                reminder_sent=True,
                notes="Patient requested reschedule to next week.",
            ),
        ]
        db.add_all(appts)
        db.flush()

        mark_slot(doctors[0].id, today, "09:00")
        mark_slot(doctors[1].id, today, "10:00")
        mark_slot(doctors[2].id, today, "11:00")
        mark_slot(doctors[0].id, today, "14:00")
        mark_slot(doctors[4].id, tomorrow, "09:00")

        # Seed Human-in-the-Loop Approval Requests
        approvals = [
            ApprovalRequest(
                code="APR-901",
                operation_type="CRITICAL_CARDIOLOGY_BOOKING_OVERRIDE",
                agent_name="Appointment Agent",
                target_appointment_id=appts[3].id,
                summary="Approve critical telemetry consult for Rajesh Deshmukh (APT-4094) with Dr. Elena Vance at 14:00 today.",
                payload_json=json.dumps(
                    {
                        "action": "CONFIRM_APPOINTMENT",
                        "appointment_code": "APT-4094",
                        "patient": "Rajesh Deshmukh",
                        "doctor": "Dr. Elena Vance (Cardiology)",
                        "slot": f"{today} 14:00",
                        "reason": "Acute chest tightness & Holter monitor telemetry review",
                    }
                ),
                risk_level="CRITICAL",
                status="PENDING",
            ),
            ApprovalRequest(
                code="APR-902",
                operation_type="CANCEL_URGENT_APPOINTMENT",
                agent_name="Scheduling Agent",
                target_appointment_id=appts[0].id,
                summary="Request to cancel or displace Arthur Pendelton's urgent Cardiology follow-up (APT-4091) requires supervisor sign-off.",
                payload_json=json.dumps(
                    {
                        "action": "CANCEL_APPOINTMENT",
                        "appointment_code": "APT-4091",
                        "patient": "Arthur Pendelton",
                        "doctor": "Dr. Elena Vance (Cardiology)",
                        "slot": f"{today} 09:00",
                        "reason": "Protected post-stent follow-up cannot be auto-cancelled without clinical review.",
                    }
                ),
                risk_level="HIGH",
                status="PENDING",
            ),
        ]
        db.add_all(approvals)

        # Seed n8n Execution Logs
        logs = [
            N8nExecutionLog(
                workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
                trigger_type="WEBHOOK",
                status="SUCCESS",
                recipient_email="arthur.p@example.com",
                subject="MedGrid Confirmation: APT-4091 with Dr. Elena Vance",
                payload_preview='{"event":"appointment.confirmed","code":"APT-4091","agent":"Appointment Agent"}',
                duration_ms=138,
            ),
            N8nExecutionLog(
                workflow_name="MedGrid 02 - Automated Appointment Reminders",
                trigger_type="SCHEDULE_TRIGGER",
                status="SUCCESS",
                recipient_email="maya.kovacs@example.com",
                subject="24h Appointment Reminder: Dr. Marcus Chen (Neurology) at 10:00",
                payload_preview='{"cron":"0 */6 * * *","dispatched_count":2,"channel":"SMTP"}',
                duration_ms=215,
            ),
            N8nExecutionLog(
                workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
                trigger_type="WEBHOOK",
                status="QUEUED_APPROVAL",
                recipient_email="ops-supervisor@medgrid-hospital.org",
                subject="[HUMAN APPROVAL REQUIRED] APR-901 - Critical Cardiology Slot",
                payload_preview='{"event":"approval.requested","code":"APR-901","risk":"CRITICAL"}',
                duration_ms=94,
            ),
        ]
        db.add_all(logs)

        # Seed initial Daily Operations Report
        issues = [
            {
                "severity": "HIGH",
                "department": "Cardiology",
                "issue": "Dr. Elena Vance's afternoon telemetry slots are at 85% capacity with 1 CRITICAL approval pending (APR-901).",
                "recommendation": "Approve APR-901 immediately and route routine ECG checks to Wing-A 305.",
            },
            {
                "severity": "MEDIUM",
                "department": "Oncology",
                "issue": "Dr. Julian Thorne has 2 blocked midday slots (11:00-12:00) for Tumor Board; 1 cancellation recorded (APT-4096).",
                "recommendation": "Trigger n8n waitlist backfill workflow for afternoon Oncology openings.",
            },
            {
                "severity": "LOW",
                "department": "Orthopedics",
                "issue": "1 confirmed appointment (APT-4093) awaiting automated 24h SMTP reminder dispatch.",
                "recommendation": "Run n8n Schedule Trigger reminder batch.",
            },
        ]
        report = DailyOperationsReport(
            report_date=today,
            total_appointments=6,
            confirmed_count=4,
            cancelled_count=1,
            pending_approvals=2,
            utilization_rate=68.5,
            executive_summary=(
                f"MedGrid Operations Agent Daily Synthesis for {today}: Total of 6 active appointments "
                "tracked across 5 departments. Cardiology shows high demand with 1 critical telemetry consult "
                "awaiting human supervisor approval (APR-901). Automated n8n reminder pipeline has delivered "
                "50% of today's notifications; remaining reminders are queued for immediate SMTP dispatch."
            ),
            operational_issues_json=json.dumps(issues),
            generated_by="Operations Agent (LangGraph + Llama 3.3 70B)",
        )
        db.add(report)
        db.commit()
    finally:
        db.close()

