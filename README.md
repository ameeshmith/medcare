# MedGrid™ — AI Healthcare Operations Multi-Agent System

A full-stack AI Healthcare Operations platform combining **n8n workflow orchestration**, **LangChain + LangGraph multi-agent coordination**, **Groq API (`llama-3.3-70b-versatile`)**, **FastAPI**, **PostgreSQL** (with automatic local SQLite fallback), **ChromaDB + Sentence Transformers**, **PyMuPDF (`fitz`)**, and a **LocalCan-inspired Forest-Green Swiss-Grid Glassmorphism React Dashboard**.

---

## Multi-Agent Architecture (LangGraph)

```text
             REACT GLASS DASHBOARD
                    |
                    v
                FASTAPI
                    |
                    v
                  n8n
                    |
             AI ORCHESTRATOR
                    |
       +------------+------------+
       |            |            |
       v            v            v
  Appointment    Patient      Operations
     Agent      Query Agent     Agent
       |
       v
  Scheduling Agent
       |
       v
   POSTGRESQL
       |
       v
  CHROMADB (RAG)
       |
       v
  RESULT / DASHBOARD
```

| Agent | Responsibilities |
| :--- | :--- |
| **Appointment Agent** | Handles booking, cancellation, and rescheduling requests; routes sensitive/critical operations to the **Human-in-the-Loop Approval Gate**. |
| **Scheduling Agent** | Verifies doctor shift hours, detects double-booking conflicts and blocked clinical windows (e.g., Tumor Board), and suggests alternative slots. |
| **Patient Query Agent** | Answers questions about departments, timings, ICU visiting hours, facilities, and insurance coverage using **ChromaDB + Sentence Transformers + PyMuPDF**. |
| **Operations Agent** | Generates daily executive reports, tracks slot utilization and cancellations, flags operational bottlenecks, and triggers n8n SMTP digests. |

---

## Quick Start

### 1. Start PostgreSQL & n8n (Optional — Automatic Local Fallback Included)
```bash
docker compose up -d
```
*(If Docker is not running, the backend automatically uses a PostgreSQL-compatible local SQLite store `backend/medgrid_hospital.db` pre-seeded with doctors, patients, slots, appointments, approvals, and PDF handbook vectors.)*

### 2. Run the FastAPI + LangGraph + ChromaDB Backend
```bash
cd backend
uv venv --python 3.11 .venv
.venv\Scripts\activate
uv pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### 3. Run the React + Tailwind CSS Glassmorphism Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`.

