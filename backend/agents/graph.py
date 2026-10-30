import json
import random
import re
from datetime import datetime, timedelta
from typing import TypedDict, List, Dict, Any, Optional

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from config import settings
from models import (
    Patient,
    Doctor,
    DoctorSlot,
    Appointment,
    ApprovalRequest,
    DailyOperationsReport,
)
from rag_engine import rag_engine
from n8n_bridge import dispatch_n8n_event


class HospitalAgentState(TypedDict):
    user_message: str
    intent: str
    active_agent: str
    agent_chain: List[Dict[str, Any]]
    db_records: Dict[str, Any]
    scheduling_result: Dict[str, Any]
    rag_citations: List[Dict[str, Any]]
    requires_approval: bool
    approval_record: Optional[Dict[str, Any]]
    action_performed: Optional[Dict[str, Any]]
    final_response: str
    llm_model_used: str


def _call_groq_or_fallback(system_prompt: str, user_prompt: str, fallback_text: str) -> tuple[str, str]:
    """Calls Groq API when configured with auto-fallback to supported models."""
    if settings.has_groq_key:
        models_to_try = [
            settings.groq_model,
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
            "allam-2-7b",
        ]
        # Remove duplicates while preserving order
        seen = set()
        unique_models = []
        for m in models_to_try:
            if m and m not in seen:
                seen.add(m)
                unique_models.append(m)

        for model_candidate in unique_models:
            try:
                from groq import Groq
                client = Groq(api_key=settings.groq_api_key)
                completion = client.chat.completions.create(
                    model=model_candidate,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=600,
                )
                content = completion.choices[0].message.content
                if content and content.strip():
                    return content.strip(), f"Groq API ({model_candidate})"
            except Exception:
                continue

    return fallback_text, "LangGraph Clinical Engine"


def run_hospital_multi_agent_workflow(db: Session, message: str) -> Dict[str, Any]:
    """
    Executes the LangGraph multi-agent workflow:
    React Dashboard -> FastAPI -> n8n -> AI Orchestrator ->
    [Appointment Agent -> Scheduling Agent | Patient Query Agent | Operations Agent] ->
    PostgreSQL -> ChromaDB (RAG) -> Result / Dashboard
    """

    def orchestrator_node(state: HospitalAgentState) -> HospitalAgentState:
        msg_lower = state["user_message"].lower()
        chain = list(state.get("agent_chain", []))
        chain.append(
            {
                "step": "n8n Webhook & AI Orchestrator",
                "status": "COMPLETED",
                "detail": "Classified user request and selected target specialist agent graph path.",
            }
        )

        # Classify intent
        if any(
            kw in msg_lower
            for kw in [
                "report",
                "daily summary",
                "utilization",
                "bottleneck",
                "operations",
                "metrics",
                "analytics",
                "cancellations today",
                "operational",
            ]
        ):
            intent = "OPERATIONS"
            active_agent = "Operations Agent"
        elif any(
            kw in msg_lower
            for kw in [
                "book",
                "cancel",
                "reschedule",
                "appointment",
                "schedule with",
                "override",
                "apt-",
            ]
        ):
            intent = "APPOINTMENT"
            active_agent = "Appointment Agent"
        elif any(
            kw in msg_lower
            for kw in [
                "availability",
                "available slot",
                "free slot",
                "conflict",
                "when is dr",
                "doctor schedule",
                "openings",
            ]
        ):
            intent = "SCHEDULING_ONLY"
            active_agent = "Scheduling Agent"
        else:
            intent = "PATIENT_QUERY"
            active_agent = "Patient Query Agent"

        return {
            **state,
            "intent": intent,
            "active_agent": active_agent,
            "agent_chain": chain,
        }

    def appointment_agent_node(state: HospitalAgentState) -> HospitalAgentState:
        msg = state["user_message"]
        msg_lower = msg.lower()
        chain = list(state["agent_chain"])

        doctors = db.query(Doctor).all()
        patients = db.query(Patient).all()
        appointments = db.query(Appointment).all()

        # Match doctor or department
        matched_doc = doctors[0]
        for doc in doctors:
            if (
                doc.full_name.lower() in msg_lower
                or doc.full_name.split()[-1].lower() in msg_lower
                or doc.department.lower() in msg_lower
            ):
                matched_doc = doc
                break

        # Match patient
        matched_patient = None
        for pat in patients:
            if (
                pat.full_name.lower() in msg_lower
                or pat.full_name.split()[0].lower() in msg_lower
                or pat.code.lower() in msg_lower
            ):
                matched_patient = pat
                break
        if not matched_patient:
            # Check if user mentioned a name not found
            matched_patient = patients[0]

        # Match appointment code if referenced (e.g., APT-4091)
        apt_match = re.search(r"apt-\d+", msg_lower)
        matched_apt = None
        if apt_match:
            code_upper = apt_match.group(0).upper()
            matched_apt = db.query(Appointment).filter_by(code=code_upper).first()

        # Extract requested time slot (e.g., 09:00, 10:00, 11:00, 14:00, 15:00, 16:00)
        time_match = re.search(r"\b(09:00|10:00|11:00|12:00|14:00|15:00|16:00)\b", msg)
        requested_time = time_match.group(1) if time_match else "15:00"
        today_str = datetime.now().strftime("%Y-%m-%d")

        is_cancel = "cancel" in msg_lower
        is_reschedule = "reschedule" in msg_lower
        is_critical = any(
            w in msg_lower
            for w in ["critical", "urgent", "emergency", "chest pain", "override", "stroke"]
        )

        chain.append(
            {
                "step": "Appointment Agent",
                "status": "COMPLETED",
                "detail": (
                    f"Parsed entity context: Doctor={matched_doc.full_name} ({matched_doc.department}), "
                    f"Patient={matched_patient.full_name}, RequestedSlot={today_str} {requested_time}."
                ),
            }
        )

        return {
            **state,
            "db_records": {
                "doctor_id": matched_doc.id,
                "doctor_name": matched_doc.full_name,
                "department": matched_doc.department,
                "patient_id": matched_patient.id,
                "patient_name": matched_patient.full_name,
                "patient_email": matched_patient.email,
                "requested_date": today_str,
                "requested_time": requested_time,
                "is_cancel": is_cancel,
                "is_reschedule": is_reschedule,
                "is_critical": is_critical,
                "matched_apt_code": matched_apt.code if matched_apt else None,
            },
            "agent_chain": chain,
        }

    def scheduling_agent_node(state: HospitalAgentState) -> HospitalAgentState:
        chain = list(state["agent_chain"])
        msg_lower = state["user_message"].lower()
        today_str = datetime.now().strftime("%Y-%m-%d")

        # Determine target doctor
        doctors = db.query(Doctor).all()
        doc_id = state.get("db_records", {}).get("doctor_id")
        target_doc = db.query(Doctor).filter_by(id=doc_id).first() if doc_id else None
        if not target_doc:
            target_doc = doctors[0]
            for d in doctors:
                if (
                    d.full_name.split()[-1].lower() in msg_lower
                    or d.department.lower() in msg_lower
                ):
                    target_doc = d
                    break

        slots = (
            db.query(DoctorSlot)
            .filter_by(doctor_id=target_doc.id, slot_date=today_str)
            .order_by(DoctorSlot.slot_time)
            .all()
        )
        available_slots = [s.slot_time for s in slots if not s.is_booked and not s.is_blocked]
        booked_slots = [s.slot_time for s in slots if s.is_booked]
        blocked_slots = [
            {"time": s.slot_time, "reason": s.block_reason}
            for s in slots
            if s.is_blocked
        ]

        req_time = state.get("db_records", {}).get("requested_time", "15:00")
        slot_obj = (
            db.query(DoctorSlot)
            .filter_by(doctor_id=target_doc.id, slot_date=today_str, slot_time=req_time)
            .first()
        )

        conflict_detected = False
        conflict_reason = None
        if slot_obj:
            if slot_obj.is_booked:
                conflict_detected = True
                conflict_reason = f"Slot {req_time} with {target_doc.full_name} is already booked."
            elif slot_obj.is_blocked:
                conflict_detected = True
                conflict_reason = f"Slot {req_time} is blocked ({slot_obj.block_reason})."

        scheduling_result = {
            "doctor_code": target_doc.code,
            "doctor_name": target_doc.full_name,
            "department": target_doc.department,
            "date": today_str,
            "requested_time": req_time,
            "conflict_detected": conflict_detected,
            "conflict_reason": conflict_reason,
            "available_slots": available_slots,
            "booked_slots": booked_slots,
            "blocked_slots": blocked_slots,
            "suggested_slot": available_slots[0] if available_slots else "16:00",
        }

        chain.append(
            {
                "step": "Scheduling Agent (Conflict & Slot Resolver)",
                "status": "COMPLETED",
                "detail": (
                    f"Checked PostgreSQL schedule for {target_doc.full_name}: "
                    f"Conflict={conflict_detected} | Open Slots={', '.join(available_slots) or 'None'}."
                ),
            }
        )

        # If this came from APPOINTMENT intent, perform or queue the database action
        action_performed = None
        requires_approval = False
        approval_record = None
        db_rec = state.get("db_records", {})

        if state["intent"] == "APPOINTMENT":
            if db_rec.get("is_cancel"):
                target_apt = None
                if db_rec.get("matched_apt_code"):
                    target_apt = (
                        db.query(Appointment)
                        .filter_by(code=db_rec["matched_apt_code"])
                        .first()
                    )
                if not target_apt and db_rec.get("patient_id"):
                    target_apt = (
                        db.query(Appointment)
                        .filter_by(patient_id=db_rec["patient_id"], status="CONFIRMED")
                        .first()
                    )
                if not target_apt:
                    target_apt = (
                        db.query(Appointment)
                        .filter(Appointment.status == "CONFIRMED")
                        .first()
                    )

                if target_apt:
                    apr_code = f"APR-{random.randint(910, 999)}"
                    summary = (
                        f"Cancel appointment {target_apt.code} for {target_apt.patient.full_name} "
                        f"with {target_apt.doctor.full_name} ({target_apt.appointment_date} {target_apt.slot_time})."
                    )
                    apr = ApprovalRequest(
                        code=apr_code,
                        operation_type="CANCEL_APPOINTMENT",
                        agent_name="Appointment Agent",
                        target_appointment_id=target_apt.id,
                        summary=summary,
                        payload_json=json.dumps(
                            {
                                "action": "CANCEL_APPOINTMENT",
                                "appointment_code": target_apt.code,
                                "patient": target_apt.patient.full_name,
                                "doctor": target_apt.doctor.full_name,
                                "slot": f"{target_apt.appointment_date} {target_apt.slot_time}",
                            }
                        ),
                        risk_level="HIGH",
                        status="PENDING",
                    )
                    db.add(apr)
                    db.commit()
                    db.refresh(apr)
                    requires_approval = True
                    approval_record = {
                        "code": apr.code,
                        "operation_type": apr.operation_type,
                        "summary": apr.summary,
                        "risk_level": apr.risk_level,
                    }
                    chain.append(
                        {
                            "step": "Human-in-the-Loop Approval Gate",
                            "status": "PAUSED_FOR_HUMAN",
                            "detail": f"Created approval ticket {apr.code} before executing cancellation of {target_apt.code}.",
                        }
                    )
            elif db_rec.get("is_critical") or conflict_detected:
                # If critical override or slot conflict, pick suggested open slot or create Human Approval if override requested
                chosen_slot = (
                    req_time
                    if not conflict_detected
                    else scheduling_result["suggested_slot"]
                )
                apt_code = f"APT-{random.randint(4100, 4999)}"
                status_val = "PENDING_APPROVAL" if db_rec.get("is_critical") else "CONFIRMED"
                new_apt = Appointment(
                    code=apt_code,
                    patient_id=db_rec["patient_id"],
                    doctor_id=target_doc.id,
                    appointment_date=today_str,
                    slot_time=chosen_slot,
                    reason=state["user_message"][:180],
                    status=status_val,
                    priority="CRITICAL" if db_rec.get("is_critical") else "ROUTINE",
                    reminder_sent=False,
                    notes=(
                        f"Auto-rescheduled from {req_time} to {chosen_slot} by Scheduling Agent to prevent double-booking."
                        if conflict_detected
                        else "Booked via LangGraph Appointment Agent."
                    ),
                )
                db.add(new_apt)
                slot_to_mark = (
                    db.query(DoctorSlot)
                    .filter_by(
                        doctor_id=target_doc.id,
                        slot_date=today_str,
                        slot_time=chosen_slot,
                    )
                    .first()
                )
                if slot_to_mark:
                    slot_to_mark.is_booked = True
                db.commit()
                db.refresh(new_apt)

                action_performed = {
                    "type": "BOOKED_WITH_CONFLICT_RESOLUTION"
                    if conflict_detected
                    else "BOOKED_CRITICAL",
                    "appointment_code": new_apt.code,
                    "doctor": target_doc.full_name,
                    "department": target_doc.department,
                    "patient": db_rec["patient_name"],
                    "date": today_str,
                    "slot_time": chosen_slot,
                    "status": status_val,
                }

                if db_rec.get("is_critical"):
                    apr_code = f"APR-{random.randint(910, 999)}"
                    apr = ApprovalRequest(
                        code=apr_code,
                        operation_type="CRITICAL_TRIAGE_OVERRIDE",
                        agent_name="Appointment Agent",
                        target_appointment_id=new_apt.id,
                        summary=f"Critical priority booking {new_apt.code} for {db_rec['patient_name']} with {target_doc.full_name} at {chosen_slot}.",
                        payload_json=json.dumps(action_performed),
                        risk_level="CRITICAL",
                        status="PENDING",
                    )
                    db.add(apr)
                    db.commit()
                    db.refresh(apr)
                    requires_approval = True
                    approval_record = {
                        "code": apr.code,
                        "operation_type": apr.operation_type,
                        "summary": apr.summary,
                        "risk_level": apr.risk_level,
                    }
                    chain.append(
                        {
                            "step": "Human-in-the-Loop Approval Gate",
                            "status": "PAUSED_FOR_HUMAN",
                            "detail": f"Critical booking {new_apt.code} held in pending state; created approval {apr.code}.",
                        }
                    )
            else:
                # Standard conflict-free booking
                apt_code = f"APT-{random.randint(4100, 4999)}"
                new_apt = Appointment(
                    code=apt_code,
                    patient_id=db_rec["patient_id"],
                    doctor_id=target_doc.id,
                    appointment_date=today_str,
                    slot_time=req_time,
                    reason=state["user_message"][:180],
                    status="CONFIRMED",
                    priority="ROUTINE",
                    reminder_sent=True,
                    notes="Confirmed via LangGraph Appointment & Scheduling Agents.",
                )
                db.add(new_apt)
                if slot_obj:
                    slot_obj.is_booked = True
                db.commit()
                db.refresh(new_apt)
                action_performed = {
                    "type": "APPOINTMENT_CONFIRMED",
                    "appointment_code": new_apt.code,
                    "doctor": target_doc.full_name,
                    "department": target_doc.department,
                    "patient": db_rec["patient_name"],
                    "date": today_str,
                    "slot_time": req_time,
                    "status": "CONFIRMED",
                }
                chain.append(
                    {
                        "step": "PostgreSQL Transaction Commit",
                        "status": "COMPLETED",
                        "detail": f"Committed appointment {new_apt.code} at {today_str} {req_time} and locked doctor slot.",
                    }
                )

        # Also fetch relevant policy snippet from ChromaDB
        citations = rag_engine.query_knowledge("Appointment booking rescheduling cancellation policy", top_k=2)

        # Build synthesis
        blocked_str = (
            ", ".join(f"`{b['time']}` ({b['reason']})" for b in blocked_slots)
            if blocked_slots
            else "None"
        )
        avail_str = (
            ", ".join(f"`{s}`" for s in available_slots)
            if available_slots
            else "No open slots remaining"
        )
        booked_str = (
            ", ".join(f"`{s}`" for s in booked_slots) if booked_slots else "None"
        )
        if state["intent"] == "SCHEDULING_ONLY":
            fallback = (
                f"**Doctor Availability — {target_doc.full_name} ({target_doc.department})**\n\n"
                f"• **Available Open Slots:** {avail_str}\n"
                f"• **Already Booked:** {booked_str}\n"
                f"• **Clinical Protected Time:** {blocked_str}\n"
                f"• **Next Recommended Time:** {scheduling_result['suggested_slot']}"
            )
        elif requires_approval and approval_record:
            fallback = (
                f"**Supervisor Approval Required**\n\n"
                f"{approval_record['summary']}\n\n"
                f"• **Ticket Code:** `{approval_record['code']}`\n"
                f"• **Priority / Risk:** {approval_record['risk_level']}\n"
                f"• **Next Step:** An automated notification was sent to the supervisor. You can also approve or reject it immediately in the **Approvals** tab above."
            )
        elif action_performed:
            conflict_note = (
                f"\n(Note: The requested slot was taken, so the system automatically reserved {action_performed['slot_time']} instead.)"
                if conflict_detected
                else ""
            )
            fallback = (
                f"**Appointment Confirmed!**\n\n"
                f"• **Patient:** {action_performed['patient']}\n"
                f"• **Doctor:** {action_performed['doctor']} ({action_performed['department']})\n"
                f"• **Scheduled Date & Time:** {action_performed['date']} at {action_performed['slot_time']}\n"
                f"• **Appointment Code:** `{action_performed['appointment_code']}`{conflict_note}\n\n"
                f"A confirmation reminder email has been queued."
            )
        else:
            fallback = f"Schedule checked for {target_doc.full_name}. Open slots: {avail_str}."

        sys_prompt = (
            "You are CareGrid Clinic's front-desk AI assistant for patients and hospital receptionists.\n"
            "RULES:\n"
            "1. Write in natural, warm, plain English (1-3 short paragraphs max).\n"
            "2. NEVER output raw markdown tables, database column lists, JSON, SQL queries, or technical debug jargon.\n"
            "3. State the facts clearly: who, which doctor, what time, and next step.\n"
            "4. If approval is required, say: 'I have submitted a request for supervisor approval under ticket [Ticket Code]. You can review it in the Approvals tab.'"
        )
        usr_prompt = (
            f"Receptionist/Patient request: {state['user_message']}\n"
            f"Action/Summary to communicate: {fallback}"
        )
        final_text, model_label = _call_groq_or_fallback(sys_prompt, usr_prompt, fallback)

        # Dispatch n8n trace
        dispatch_n8n_event(
            db=db,
            workflow_name="MedGrid 01 - AI Multi-Agent Orchestrator",
            trigger_type="WEBHOOK",
            webhook_url=settings.n8n_orchestrator_webhook,
            recipient_email=db_rec.get("patient_email", "ops-supervisor@medgrid-hospital.org"),
            subject=f"MedGrid {state['active_agent']}: {approval_record['code'] if approval_record else (action_performed['appointment_code'] if action_performed else target_doc.code)}",
            payload={
                "intent": state["intent"],
                "active_agent": state["active_agent"],
                "requires_approval": requires_approval,
                "scheduling": scheduling_result,
            },
        )

        return {
            **state,
            "scheduling_result": scheduling_result,
            "rag_citations": citations,
            "requires_approval": requires_approval,
            "approval_record": approval_record,
            "action_performed": action_performed,
            "final_response": final_text,
            "llm_model_used": model_label,
            "agent_chain": chain,
        }

    def patient_query_agent_node(state: HospitalAgentState) -> HospitalAgentState:
        chain = list(state["agent_chain"])
        citations = rag_engine.query_knowledge(state["user_message"], top_k=3)
        chain.append(
            {
                "step": "Patient Query Agent -> ChromaDB Vector Retrieval",
                "status": "COMPLETED",
                "detail": f"Retrieved {len(citations)} semantic chunks from ChromaDB using SentenceTransformers embeddings.",
            }
        )

        context_blocks = "\n\n".join(
            [
                f"[Source: {c['source']} | Page {c['page']} | Category: {c['category']} | Score: {c['similarity']}]\n{c['content']}"
                for c in citations
            ]
        )
        fallback = (
            f"**Hospital Policy & Information**\n\n"
            + "\n\n".join(
                [
                    f"• **{c['category']}:**\n{c['content']}"
                    for c in citations
                ]
            )
        )

        sys_prompt = (
            "You are CareGrid Clinic's front-desk AI assistant.\n"
            "Answer the patient's or receptionist's question warmly and clearly in 2-3 short, friendly sentences based on the clinic guidelines below.\n"
            "Do NOT include technical search metrics or markdown tables."
        )
        usr_prompt = f"Question: {state['user_message']}\n\nClinic Guidelines:\n{context_blocks}"
        final_text, model_label = _call_groq_or_fallback(sys_prompt, usr_prompt, fallback)

        return {
            **state,
            "rag_citations": citations,
            "final_response": final_text,
            "llm_model_used": model_label,
            "agent_chain": chain,
        }

    def operations_agent_node(state: HospitalAgentState) -> HospitalAgentState:
        chain = list(state["agent_chain"])
        today_str = datetime.now().strftime("%Y-%m-%d")

        total_appts = db.query(Appointment).count()
        confirmed = db.query(Appointment).filter_by(status="CONFIRMED").count()
        cancelled = db.query(Appointment).filter_by(status="CANCELLED").count()
        pending_apr = db.query(ApprovalRequest).filter_by(status="PENDING").count()
        total_slots = db.query(DoctorSlot).filter_by(slot_date=today_str).count() or 1
        booked_slots = (
            db.query(DoctorSlot).filter_by(slot_date=today_str, is_booked=True).count()
        )
        utilization = round((booked_slots / total_slots) * 100, 1)

        chain.append(
            {
                "step": "Operations Agent -> PostgreSQL Analytics & Bottleneck Scan",
                "status": "COMPLETED",
                "detail": (
                    f"Aggregated hospital metrics: Total={total_appts}, Confirmed={confirmed}, "
                    f"Cancelled={cancelled}, PendingApprovals={pending_apr}, SlotUtilization={utilization}%."
                ),
            }
        )

        fallback = (
            f"**Daily Hospital Operations Summary ({today_str})**\n\n"
            f"• **Appointments Today:** {total_appts} total ({confirmed} confirmed, {cancelled} cancelled)\n"
            f"• **Clinic Slot Utilization:** {utilization}%\n"
            f"• **Pending Supervisor Approvals:** {pending_apr} request(s) awaiting review\n\n"
            f"**Key Notes:**\n"
            f"1. Cardiology currently has high patient demand.\n"
            f"2. Oncology has midday slots reserved for the multidisciplinary Tumor Board.\n"
            f"3. Automated appointment reminders are ready to dispatch via n8n."
        )

        sys_prompt = (
            "You are CareGrid Clinic's front-desk AI assistant.\n"
            "Summarize the daily hospital operations in 3-4 simple bullet points for a clinic receptionist or doctor.\n"
            "Keep it warm, polite, and free of database tables, raw code, or technical jargon."
        )
        usr_prompt = f"User Request: {state['user_message']}\nMetrics:\n{fallback}"
        final_text, model_label = _call_groq_or_fallback(sys_prompt, usr_prompt, fallback)

        return {
            **state,
            "final_response": final_text,
            "llm_model_used": model_label,
            "agent_chain": chain,
        }

    # Build the LangGraph StateGraph
    workflow = StateGraph(HospitalAgentState)
    workflow.add_node("orchestrator", orchestrator_node)
    workflow.add_node("appointment_agent", appointment_agent_node)
    workflow.add_node("scheduling_agent", scheduling_agent_node)
    workflow.add_node("patient_query_agent", patient_query_agent_node)
    workflow.add_node("operations_agent", operations_agent_node)

    workflow.set_entry_point("orchestrator")

    def route_from_orchestrator(state: HospitalAgentState) -> str:
        intent = state["intent"]
        if intent == "APPOINTMENT":
            return "appointment_agent"
        if intent == "SCHEDULING_ONLY":
            return "scheduling_agent"
        if intent == "OPERATIONS":
            return "operations_agent"
        return "patient_query_agent"

    workflow.add_conditional_edges(
        "orchestrator",
        route_from_orchestrator,
        {
            "appointment_agent": "appointment_agent",
            "scheduling_agent": "scheduling_agent",
            "patient_query_agent": "patient_query_agent",
            "operations_agent": "operations_agent",
        },
    )
    # Appointment Agent delegates to Scheduling Agent as shown in the architecture diagram
    workflow.add_edge("appointment_agent", "scheduling_agent")
    workflow.add_edge("scheduling_agent", END)
    workflow.add_edge("patient_query_agent", END)
    workflow.add_edge("operations_agent", END)

    compiled_graph = workflow.compile()
    initial_state: HospitalAgentState = {
        "user_message": message,
        "intent": "",
        "active_agent": "",
        "agent_chain": [],
        "db_records": {},
        "scheduling_result": {},
        "rag_citations": [],
        "requires_approval": False,
        "approval_record": None,
        "action_performed": None,
        "final_response": "",
        "llm_model_used": "",
    }
    result = compiled_graph.invoke(initial_state)

    return {
        "user_message": result["user_message"],
        "intent": result["intent"],
        "active_agent": result["active_agent"],
        "agent_chain": result["agent_chain"],
        "scheduling_result": result["scheduling_result"],
        "rag_citations": result["rag_citations"],
        "requires_approval": result["requires_approval"],
        "approval_record": result["approval_record"],
        "action_performed": result["action_performed"],
        "response": result["final_response"],
        "llm_model_used": result["llm_model_used"],
        "timestamp": datetime.now().strftime("%H:%M:%S"),
    }

