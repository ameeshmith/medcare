import json
import random
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from database import get_db, init_and_seed_db, ACTIVE_DB_ENGINE_LABEL
from models import (
    Patient,
    Doctor,
    DoctorSlot,
    Appointment,
    ApprovalRequest,
    N8nExecutionLog,
    DailyOperationsReport,
)
from rag_engine import rag_engine
from n8n_bridge import (
    dispatch_n8n_event,
    trigger_appointment_reminders_batch,
    get_exportable_n8n_workflows,
)
from agents.graph import run_hospital_multi_agent_workflow

app = FastAPI(
    title="MedGridOS — AI Healthcare Operations Multi-Agent Backend",
    version="2.4.0",
    description="LangGraph + Groq (Llama 3.3 70B) + FastAPI + PostgreSQL + ChromaDB + PyMuPDF + n8n Orchestration",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_and_seed_db()


@app.get("/")
def serve_dashboard_ui():
    static_index = Path(__file__).resolve().parent / "static" / "index.html"
    return FileResponse(str(static_index))


# ----------------------------- Pydantic Schemas ----------------------------- #
class AgentExecuteRequest(BaseModel):
    message: str
    session_id: Optional[str] = "dashboard-session"


class GroqKeyUpdateRequest(BaseModel):
    api_key: str
    model: Optional[str] = "llama-3.3-70b-versatile"


class BookAppointmentRequest(BaseModel):
    patient_name: str
    patient_email: str
    doctor_id: int
    appointment_date: str
    slot_time: str
    reason: str
    priority: str = "ROUTINE"  # ROUTINE, URGENT, CRITICAL


class RescheduleAppointmentRequest(BaseModel):
    new_date: str
    new_slot_time: str
    reason: Optional[str] = "Patient requested slot change"


class CancelAppointmentRequest(BaseModel):
    reason: Optional[str] = "Operational / Patient cancellation request"
    force_approval: bool = True


class ResolveApprovalRequest(BaseModel):
    decision: str  # APPROVED or REJECTED
    reviewer_note: Optional[str] = "Verified by Clinical Operations Supervisor"


class RagQueryRequest(BaseModel):
    query: str
    top_k: int = 3


# ----------------------------- API Endpoints ----------------------------- #
@app.get("/api/health")
def get_health(db: Session = Depends(get_db)):
    return {
        "status": "ONLINE",
        "database_engine": ACTIVE_DB_ENGINE_LABEL,
        "vector_store": f"ChromaDB ({rag_engine.collection.count()} embedded chunks)",
        "embedding_model": rag_engine.embedding_fn.backend_label,
        "pdf_engine": "PyMuPDF (fitz)",
        "llm_provider": f"Groq ({settings.groq_model})",
        "groq_key_configured": settings.has_groq_key,
        "n8n_workflows_ready": len(get_exportable_n8n_workflows()),
        "pending_approvals": db.query(ApprovalRequest).filter_by(status="PENDING").count(),
    }


@app.post("/api/settings/groq")
def update_groq_key(req: GroqKeyUpdateRequest):
    settings.set_groq_key(req.api_key, req.model)
    return {
        "ok": True,
        "groq_key_configured": settings.has_groq_key,
        "model": settings.groq_model,
    }


@app.get("/api/dashboard/overview")
def get_dashboard_overview(db: Session = Depends(get_db)):
    doctors = db.query(Doctor).all()
    patients = db.query(Patient).all()
    appointments = (
        db.query(Appointment).order_by(Appointment.id.desc()).all()
    )
    approvals = (
        db.query(ApprovalRequest).order_by(ApprovalRequest.id.desc()).all()
    )
    n8n_logs = (
        db.query(N8nExecutionLog)
        .order_by(N8nExecutionLog.id.desc())
        .limit(12)
        .all()
    )
    latest_report = (
        db.query(DailyOperationsReport)
        .order_by(DailyOperationsReport.id.desc())
        .first()
    )

    today_str = datetime.now().strftime("%Y-%m-%d")
    total_slots = db.query(DoctorSlot).filter_by(slot_date=today_str).count() or 1
    booked_slots = (
        db.query(DoctorSlot).filter_by(slot_date=today_str, is_booked=True).count()
    )
    utilization = round((booked_slots / total_slots) * 100, 1)

    return {
        "system": {
            "database": ACTIVE_DB_ENGINE_LABEL,
            "groq_configured": settings.has_groq_key,
            "groq_model": settings.groq_model,
            "chroma_vectors": rag_engine.collection.count(),
            "embedding_model": rag_engine.embedding_fn.backend_label,
        },
        "metrics": {
            "total_appointments": len(appointments),
            "confirmed": sum(1 for a in appointments if a.status == "CONFIRMED"),
            "pending_approval": sum(
                1 for a in appointments if a.status == "PENDING_APPROVAL"
            ),
            "cancelled": sum(1 for a in appointments if a.status == "CANCELLED"),
            "pending_human_approvals": sum(
                1 for r in approvals if r.status == "PENDING"
            ),
            "doctors_on_duty": sum(1 for d in doctors if d.status == "ON_DUTY"),
            "slot_utilization_pct": utilization,
            "n8n_executions": db.query(N8nExecutionLog).count(),
        },
        "doctors": [
            {
                "id": d.id,
                "code": d.code,
                "full_name": d.full_name,
                "department": d.department,
                "specialty": d.specialty,
                "room_number": d.room_number,
                "email": d.email,
                "shift_hours": d.shift_hours,
                "status": d.status,
                "slots": [
                    {
                        "id": s.id,
                        "date": s.slot_date,
                        "time": s.slot_time,
                        "is_booked": s.is_booked,
                        "is_blocked": s.is_blocked,
                        "block_reason": s.block_reason,
                    }
                    for s in sorted(d.slots, key=lambda x: (x.slot_date, x.slot_time))
                ],
            }
            for d in doctors
        ],
        "patients": [
            {
                "id": p.id,
                "code": p.code,
                "full_name": p.full_name,
                "email": p.email,
                "phone": p.phone,
                "age": p.age,
                "blood_group": p.blood_group,
                "insurance_provider": p.insurance_provider,
            }
            for p in patients
        ],
        "appointments": [
            {
                "id": a.id,
                "code": a.code,
                "patient_id": a.patient_id,
                "patient_name": a.patient.full_name if a.patient else "Unknown",
                "patient_email": a.patient.email if a.patient else "",
                "doctor_id": a.doctor_id,
                "doctor_name": a.doctor.full_name if a.doctor else "Unknown",
                "department": a.doctor.department if a.doctor else "General",
                "appointment_date": a.appointment_date,
                "slot_time": a.slot_time,
                "reason": a.reason,
                "status": a.status,
                "priority": a.priority,
                "reminder_sent": a.reminder_sent,
                "notes": a.notes,
            }
            for a in appointments
        ],
        "approvals": [
            {
                "id": r.id,
                "code": r.code,
                "operation_type": r.operation_type,
                "agent_name": r.agent_name,
                "target_appointment_id": r.target_appointment_id,
                "summary": r.summary,
                "payload": json.loads(r.payload_json) if r.payload_json else {},
                "risk_level": r.risk_level,
                "status": r.status,
                "reviewer_note": r.reviewer_note,
                "created_at": r.created_at.strftime("%Y-%m-%d %H:%M") if r.created_at else "",
            }
            for r in approvals
        ],
        "n8n_logs": [
            {
                "id": l.id,
                "workflow_name": l.workflow_name,
                "trigger_type": l.trigger_type,
                "status": l.status,
                "recipient_email": l.recipient_email,
                "subject": l.subject,
                "payload_preview": l.payload_preview,
                "duration_ms": l.duration_ms,
                "created_at": l.created_at.strftime("%H:%M:%S") if l.created_at else "",
            }
            for l in n8n_logs
        ],
        "latest_report": {
            "report_date": latest_report.report_date,
            "total_appointments": latest_report.total_appointments,
            "confirmed_count": latest_report.confirmed_count,
            "cancelled_count": latest_report.cancelled_count,
            "pending_approvals": latest_report.pending_approvals,
            "utilization_rate": latest_report.utilization_rate,
            "executive_summary": latest_report.executive_summary,
            "issues": json.loads(latest_report.operational_issues_json),
            "generated_by": latest_report.generated_by,
        }
        if latest_report
        else None,
    }


@app.post("/api/agents/execute")
def execute_agent_workflow(req: AgentExecuteRequest, db: Session = Depends(get_db)):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
    return run_hospital_multi_agent_workflow(db=db, message=req.message.strip())


@app.post("/api/appointments/book")
def book_appointment(req: BookAppointmentRequest, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter_by(id=req.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found.")

    # Check or create patient
    patient = (
        db.query(Patient)
        .filter(Patient.full_name.ilike(req.patient_name.strip()))
        .first()
    )
    if not patient:
        patient = Patient(
            code=f"PAT-{random.randint(8900, 9999)}",
            full_name=req.patient_name.strip(),
            email=req.patient_email.strip() or "patient@medgrid-hospital.org",
            phone="+1 (555) 400-8899",
            age=38,
            blood_group="O+",
            insurance_provider="Aetna HealthGrid",
        )
        db.add(patient)
        db.flush()

    # Scheduling Agent conflict check
    slot = (
        db.query(DoctorSlot)
        .filter_by(
            doctor_id=doctor.id,
            slot_date=req.appointment_date,
            slot_time=req.slot_time,
        )
        .first()
    )
    if slot and (slot.is_booked or slot.is_blocked):
        # Find alternative slots on the same date
        alternatives = [
            s.slot_time
            for s in db.query(DoctorSlot)
            .filter_by(
                doctor_id=doctor.id,
                slot_date=req.appointment_date,
                is_booked=False,
                is_blocked=False,
            )
            .all()
        ]
        reason_detail = (
            f"Blocked for {slot.block_reason}"
            if slot.is_blocked
            else "Already booked by another patient"
        )
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Scheduling Conflict Detected: {doctor.full_name} at {req.slot_time} is unavailable ({reason_detail}).",
                "suggested_slots": alternatives,
            },
        )

    if not slot:
        slot = DoctorSlot(
            doctor_id=doctor.id,
            slot_date=req.appointment_date,
            slot_time=req.slot_time,
            is_booked=True,
            is_blocked=False,
        )
        db.add(slot)
    else:
        slot.is_booked = True

    requires_human_approval = req.priority.upper() == "CRITICAL"
    apt_code = f"APT-{random.randint(4100, 4999)}"
    apt = Appointment(
        code=apt_code,
        patient_id=patient.id,
        doctor_id=doctor.id,
        appointment_date=req.appointment_date,
        slot_time=req.slot_time,
        reason=req.reason,
        status="PENDING_APPROVAL" if requires_human_approval else "CONFIRMED",
        priority=req.priority.upper(),
        reminder_sent=not requires_human_approval,
        notes="Booked via MedGrid Dashboard with Scheduling Agent conflict prevention.",
    )
    db.add(apt)
    db.flush()

    approval_code = None
    if requires_human_approval:
        approval_code = f"APR-{random.randint(910, 999)}"
        apr = ApprovalRequest(
            code=approval_code,
            operation_type="CRITICAL_APPOINTMENT_APPROVAL",
            agent_name="Appointment Agent",
            target_appointment_id=apt.id,
            summary=f"Critical booking {apt.code} for {patient.full_name} with {doctor.full_name} ({req.appointment_date} {req.slot_time}).",
            payload_json=json.dumps(
                {
                    "action": "CONFIRM_APPOINTMENT",
                    "appointment_code": apt.code,
                    "patient": patient.full_name,
                    "doctor": doctor.full_name,
                    "slot": f"{req.appointment_date} {req.slot_time}",
                }
            ),
            risk_level="CRITICAL",
            status="PENDING",
        )
        db.add(apr)

    db.commit()

    dispatch_n8n_event(
        db=db,
        workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
        trigger_type="WEBHOOK",
        webhook_url=settings.n8n_orchestrator_webhook,
        recipient_email=patient.email,
        subject=f"Appointment {'Queued for Approval' if requires_human_approval else 'Confirmed'}: {apt.code} with {doctor.full_name}",
        payload={
            "event": "appointment.created",
            "code": apt.code,
            "requires_approval": requires_human_approval,
            "approval_code": approval_code,
        },
    )

    return {
        "ok": True,
        "appointment_code": apt.code,
        "status": apt.status,
        "requires_approval": requires_human_approval,
        "approval_code": approval_code,
    }


@app.post("/api/appointments/{apt_id}/reschedule")
def reschedule_appointment(
    apt_id: int, req: RescheduleAppointmentRequest, db: Session = Depends(get_db)
):
    apt = db.query(Appointment).filter_by(id=apt_id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    target_slot = (
        db.query(DoctorSlot)
        .filter_by(
            doctor_id=apt.doctor_id,
            slot_date=req.new_date,
            slot_time=req.new_slot_time,
        )
        .first()
    )
    if target_slot and (target_slot.is_booked or target_slot.is_blocked):
        raise HTTPException(
            status_code=409,
            detail=f"Target slot {req.new_date} {req.new_slot_time} is already occupied or blocked.",
        )

    # Free old slot
    old_slot = (
        db.query(DoctorSlot)
        .filter_by(
            doctor_id=apt.doctor_id,
            slot_date=apt.appointment_date,
            slot_time=apt.slot_time,
        )
        .first()
    )
    if old_slot:
        old_slot.is_booked = False

    if not target_slot:
        target_slot = DoctorSlot(
            doctor_id=apt.doctor_id,
            slot_date=req.new_date,
            slot_time=req.new_slot_time,
            is_booked=True,
        )
        db.add(target_slot)
    else:
        target_slot.is_booked = True

    old_slot_str = f"{apt.appointment_date} {apt.slot_time}"
    apt.appointment_date = req.new_date
    apt.slot_time = req.new_slot_time
    apt.status = "CONFIRMED"
    apt.notes = f"Rescheduled from {old_slot_str} to {req.new_date} {req.new_slot_time}."
    db.commit()

    dispatch_n8n_event(
        db=db,
        workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
        trigger_type="WEBHOOK",
        webhook_url=settings.n8n_orchestrator_webhook,
        recipient_email=apt.patient.email if apt.patient else "patient@medgrid-hospital.org",
        subject=f"Appointment Rescheduled [{apt.code}]: New Slot {req.new_date} {req.new_slot_time}",
        payload={
            "event": "appointment.rescheduled",
            "code": apt.code,
            "from": old_slot_str,
            "to": f"{req.new_date} {req.new_slot_time}",
        },
    )
    return {"ok": True, "appointment_code": apt.code, "new_slot": f"{req.new_date} {req.new_slot_time}"}


@app.post("/api/appointments/{apt_id}/cancel")
def cancel_appointment(
    apt_id: int, req: CancelAppointmentRequest, db: Session = Depends(get_db)
):
    apt = db.query(Appointment).filter_by(id=apt_id).first()
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    # Sensitive operation check: require human approval if URGENT/CRITICAL or force_approval
    if req.force_approval or apt.priority in ("URGENT", "CRITICAL"):
        apr_code = f"APR-{random.randint(910, 999)}"
        apr = ApprovalRequest(
            code=apr_code,
            operation_type="CANCEL_APPOINTMENT",
            agent_name="Appointment Agent",
            target_appointment_id=apt.id,
            summary=f"Cancel {apt.priority} appointment {apt.code} ({apt.patient.full_name} with {apt.doctor.full_name} at {apt.slot_time}).",
            payload_json=json.dumps(
                {
                    "action": "CANCEL_APPOINTMENT",
                    "appointment_code": apt.code,
                    "patient": apt.patient.full_name,
                    "doctor": apt.doctor.full_name,
                    "slot": f"{apt.appointment_date} {apt.slot_time}",
                    "reason": req.reason,
                }
            ),
            risk_level="HIGH" if apt.priority == "ROUTINE" else "CRITICAL",
            status="PENDING",
        )
        apt.status = "PENDING_APPROVAL"
        db.add(apr)
        db.commit()

        dispatch_n8n_event(
            db=db,
            workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
            trigger_type="WEBHOOK",
            webhook_url=settings.n8n_orchestrator_webhook,
            recipient_email="ops-supervisor@medgrid-hospital.org",
            subject=f"[HUMAN APPROVAL REQUIRED] Cancel {apt.code} ({apr_code})",
            payload={"event": "approval.queued", "approval_code": apr_code, "requires_approval": True},
        )
        return {
            "ok": True,
            "queued_for_approval": True,
            "approval_code": apr_code,
            "message": f"Cancellation of {apt.code} routed to Human Approval Queue ({apr_code}).",
        }

    apt.status = "CANCELLED"
    slot = (
        db.query(DoctorSlot)
        .filter_by(
            doctor_id=apt.doctor_id,
            slot_date=apt.appointment_date,
            slot_time=apt.slot_time,
        )
        .first()
    )
    if slot:
        slot.is_booked = False
    db.commit()
    return {"ok": True, "queued_for_approval": False, "appointment_code": apt.code}


@app.post("/api/approvals/{apr_id}/resolve")
def resolve_human_approval(
    apr_id: int, req: ResolveApprovalRequest, db: Session = Depends(get_db)
):
    apr = db.query(ApprovalRequest).filter_by(id=apr_id).first()
    if not apr:
        raise HTTPException(status_code=404, detail="Approval request not found.")

    decision = req.decision.upper()
    if decision not in ("APPROVED", "REJECTED"):
        raise HTTPException(status_code=400, detail="Decision must be APPROVED or REJECTED.")

    apr.status = decision
    apr.reviewer_note = req.reviewer_note
    apr.resolved_at = datetime.utcnow()

    target_apt = (
        db.query(Appointment).filter_by(id=apr.target_appointment_id).first()
        if apr.target_appointment_id
        else None
    )

    if target_apt:
        if decision == "APPROVED":
            if "CANCEL" in apr.operation_type:
                target_apt.status = "CANCELLED"
                slot = (
                    db.query(DoctorSlot)
                    .filter_by(
                        doctor_id=target_apt.doctor_id,
                        slot_date=target_apt.appointment_date,
                        slot_time=target_apt.slot_time,
                    )
                    .first()
                )
                if slot:
                    slot.is_booked = False
            else:
                target_apt.status = "CONFIRMED"
        else:
            # Rejected: revert to CONFIRMED if it was a cancel request, or CANCELLED if it was a booking override
            if "CANCEL" in apr.operation_type:
                target_apt.status = "CONFIRMED"
            else:
                target_apt.status = "CANCELLED"

    db.commit()

    dispatch_n8n_event(
        db=db,
        workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
        trigger_type="SMTP_EMAIL",
        webhook_url=settings.n8n_orchestrator_webhook,
        recipient_email=target_apt.patient.email if (target_apt and target_apt.patient) else "ops-supervisor@medgrid-hospital.org",
        subject=f"Human Supervisor {decision}: {apr.code} ({apr.operation_type})",
        payload={
            "event": "approval.resolved",
            "approval_code": apr.code,
            "decision": decision,
            "reviewer_note": req.reviewer_note,
        },
    )

    return {
        "ok": True,
        "approval_code": apr.code,
        "decision": decision,
        "appointment_status": target_apt.status if target_apt else None,
    }


@app.get("/api/rag/summary")
def get_rag_summary():
    return rag_engine.list_documents_summary()


@app.post("/api/rag/query")
def query_rag_knowledge(req: RagQueryRequest):
    results = rag_engine.query_knowledge(req.query, top_k=req.top_k)
    return {"query": req.query, "results": results}


@app.post("/api/rag/upload-pdf")
async def upload_hospital_pdf(
    file: UploadFile = File(...),
    category: str = Form("Hospital Policy PDF"),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported for PyMuPDF extraction.")

    content = await file.read()
    save_path = rag_engine.sample_docs_dir / file.filename
    save_path.write_bytes(content)

    ingestion_stats = rag_engine.ingest_pdf_file(
        pdf_path=save_path, source_name=file.filename, category=category
    )
    return {"ok": True, "ingestion": ingestion_stats}


@app.post("/api/operations/daily-report")
def generate_daily_operations_report(db: Session = Depends(get_db)):
    today_str = datetime.now().strftime("%Y-%m-%d")
    appointments = db.query(Appointment).all()
    total = len(appointments)
    confirmed = sum(1 for a in appointments if a.status == "CONFIRMED")
    cancelled = sum(1 for a in appointments if a.status == "CANCELLED")
    pending_apr = db.query(ApprovalRequest).filter_by(status="PENDING").count()

    total_slots = db.query(DoctorSlot).filter_by(slot_date=today_str).count() or 1
    booked_slots = (
        db.query(DoctorSlot).filter_by(slot_date=today_str, is_booked=True).count()
    )
    utilization = round((booked_slots / total_slots) * 100, 1)

    issues = [
        {
            "severity": "HIGH" if pending_apr > 0 else "LOW",
            "department": "Cardiology & Critical Triage",
            "issue": f"{pending_apr} sensitive operation(s) currently awaiting human supervisor sign-off.",
            "recommendation": "Review pending items in the Human Approvals [A] queue to clear clinical bottlenecks.",
        },
        {
            "severity": "MEDIUM",
            "department": "Outpatient Scheduling",
            "issue": f"Current slot utilization is {utilization}% across 5 departments with {cancelled} cancellation(s).",
            "recommendation": "Use the Scheduling Agent to auto-fill cancelled slots from the patient waitlist.",
        },
        {
            "severity": "LOW",
            "department": "Automated Reminders (n8n)",
            "issue": f"{sum(1 for a in appointments if a.status == 'CONFIRMED' and not a.reminder_sent)} confirmed appointment(s) pending 24h SMTP reminder dispatch.",
            "recommendation": "Execute the n8n Schedule Trigger batch to send remaining patient notifications.",
        },
    ]

    summary_text = (
        f"Operations Agent Executive Report ({today_str}): Tracked {total} appointments "
        f"({confirmed} confirmed, {cancelled} cancelled) with {utilization}% clinical slot utilization. "
        f"Identified {pending_apr} pending human-in-the-loop approval(s). Automated n8n digest dispatched to Chief Medical Officer."
    )

    report = DailyOperationsReport(
        report_date=today_str,
        total_appointments=total,
        confirmed_count=confirmed,
        cancelled_count=cancelled,
        pending_approvals=pending_apr,
        utilization_rate=utilization,
        executive_summary=summary_text,
        operational_issues_json=json.dumps(issues),
        generated_by=f"Operations Agent ({'Groq Llama 3.3 70B' if settings.has_groq_key else 'LangGraph Engine'})",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    dispatch_n8n_event(
        db=db,
        workflow_name="MedGrid 03 - Daily Operations Agent Executive Digest",
        trigger_type="SCHEDULE_TRIGGER",
        webhook_url=settings.n8n_daily_report_webhook,
        recipient_email="chief-medical-officer@medgrid-hospital.org",
        subject=f"MedGrid Daily Operations Executive Digest ({today_str})",
        payload={
            "report_date": today_str,
            "metrics": {
                "total_appointments": total,
                "confirmed": confirmed,
                "cancelled": cancelled,
                "pending_approvals": pending_apr,
                "utilization_rate": utilization,
            },
        },
    )

    return {
        "ok": True,
        "report": {
            "report_date": report.report_date,
            "total_appointments": report.total_appointments,
            "confirmed_count": report.confirmed_count,
            "cancelled_count": report.cancelled_count,
            "pending_approvals": report.pending_approvals,
            "utilization_rate": report.utilization_rate,
            "executive_summary": report.executive_summary,
            "issues": issues,
            "generated_by": report.generated_by,
        },
    }


@app.get("/api/n8n/workflows")
def list_n8n_workflows():
    return {"workflows": get_exportable_n8n_workflows()}


@app.post("/api/n8n/trigger-reminders")
def run_n8n_reminders(db: Session = Depends(get_db)):
    return trigger_appointment_reminders_batch(db=db)

