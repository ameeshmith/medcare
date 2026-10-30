import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    def __init__(self):
        self.groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
        self.database_url: str = os.getenv(
            "DATABASE_URL",
            "postgresql://medgrid:medgrid_pass@localhost:5432/medgrid_hospital",
        )
        self.sqlite_fallback_url: str = os.getenv(
            "SQLITE_FALLBACK_URL",
            f"sqlite:///{(ROOT_DIR / 'backend' / 'medgrid_hospital.db').as_posix()}",
        )
        self.chroma_persist_dir: str = os.getenv(
            "CHROMA_PERSIST_DIR", str(ROOT_DIR / "backend" / "chroma_db")
        )
        self.embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        self.n8n_base_url: str = os.getenv("N8N_BASE_URL", "http://localhost:5678")
        self.n8n_orchestrator_webhook: str = os.getenv(
            "N8N_ORCHESTRATOR_WEBHOOK",
            "http://localhost:5678/webhook/medgrid-orchestrator",
        )
        self.n8n_reminder_webhook: str = os.getenv(
            "N8N_REMINDER_WEBHOOK",
            "http://localhost:5678/webhook/medgrid-reminders",
        )
        self.n8n_daily_report_webhook: str = os.getenv(
            "N8N_DAILY_REPORT_WEBHOOK",
            "http://localhost:5678/webhook/medgrid-daily-report",
        )
        self.smtp_from: str = os.getenv(
            "SMTP_FROM", "MedGrid Operations <notifications@medgrid-hospital.org>"
        )

    def set_groq_key(self, api_key: str, model: str | None = None):
        self.groq_api_key = api_key.strip()
        if model:
            self.groq_model = model.strip()

    @property
    def has_groq_key(self) -> bool:
        return bool(self.groq_api_key and len(self.groq_api_key) > 10)


settings = Settings()

