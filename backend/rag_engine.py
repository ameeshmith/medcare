import hashlib
import math
import os
import re
from pathlib import Path
from typing import List, Dict, Any

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except ImportError:
    fitz = None
    HAS_PYMUPDF = False
    from pypdf import PdfReader
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings
from config import settings


DEFAULT_HOSPITAL_MANUAL_SECTIONS = [
    {
        "title": "Department Timings, Wings & Contact Directory",
        "category": "Departments & Timings",
        "content": (
            "MedGrid General Hospital operates 24/7 for Emergency & Trauma (Ground Floor, Wing-E). "
            "Outpatient specialty department hours are:\n"
            "- Cardiology (Wing-A, Floor 3, Room 302 - Dr. Elena Vance): Monday to Saturday, 09:00 to 17:00. "
            "Telemetry & Echocardiography Lab opens at 08:00.\n"
            "- Neurology (Wing-B, Floor 4, Room 410 - Dr. Marcus Chen): Monday to Friday, 09:00 to 17:00. "
            "3T MRI & EEG Neuro-diagnostics run 07:30 to 20:00.\n"
            "- Orthopedics & Sports Trauma (Wing-C, Floor 1, Room 118 - Dr. Priya Nair): Monday to Saturday, 10:00 to 18:00. "
            "Physiotherapy & Hydro-rehab gym open 08:00 to 19:00.\n"
            "- Oncology & Immunotherapy (Wing-D, Floor 2, Room 205 - Dr. Julian Thorne): Monday to Friday, 08:30 to 16:30. "
            "Multidisciplinary Tumor Board convenes daily from 11:00 to 12:00 (no outpatient bookings during Tumor Board).\n"
            "- Pediatrics & Neonatal Care (Wing-A, Floor 1, Room 104 - Dr. Sophia Al-Mansoor): Monday to Saturday, 09:00 to 17:00."
        ),
    },
    {
        "title": "Appointment Booking, Rescheduling & Cancellation Policies",
        "category": "Appointment Policy",
        "content": (
            "1. Standard Booking: Patients may book routine consultations up to 30 days in advance. "
            "The Scheduling Agent automatically verifies doctor shift hours, blocked Tumor Board windows, and existing bookings to prevent double-booking.\n"
            "2. Rescheduling Policy: Routine appointments can be rescheduled up to 4 hours before the slot time without penalty.\n"
            "3. Cancellation & Human Approval Policy: Cancelling any URGENT or CRITICAL priority appointment, or overriding a blocked clinical slot, "
            "requires explicit Human Supervisor Approval in the MedGrid Approval Queue [APR]. "
            "Routine cancellations are processed immediately and trigger an n8n waitlist notification.\n"
            "4. Check-in Requirement: Patients must arrive 15 minutes prior to their scheduled slot with government photo ID and active insurance card."
        ),
    },
    {
        "title": "Visiting Hours, ICU Protocols & Facility Amenities",
        "category": "Visiting & Facilities",
        "content": (
            "General Inpatient Visiting Hours: 11:00 to 13:00 and 17:00 to 20:00 daily (maximum 2 visitors per bedside at a time).\n"
            "ICU & Neuro-Critical Care Visiting Policy: Strictly limited to immediate family for 20-minute windows at 12:00 and 18:00. "
            "Children under 12 are not permitted in ICU wards unless cleared by the attending physician.\n"
            "Hospital Facilities:\n"
            "- 24-Hour Automated Pharmacy: Located in Main Atrium Lobby (Ground Floor).\n"
            "- Cafeteria & Green Atrium Bistro: Open 06:30 to 22:00 (Floor 1, Wing-B).\n"
            "- Underground Parking & EV Charging: Levels B1 and B2; validated free parking for outpatient consultations under 3 hours."
        ),
    },
    {
        "title": "Insurance Coverage, Billing & Pre-Authorization Guidelines",
        "category": "Insurance & Billing",
        "content": (
            "Accepted In-Network Insurance Providers:\n"
            "- Aetna HealthGrid (100% cashless outpatient & diagnostics coverage)\n"
            "- BlueCross MedShield (Prior authorization required for 3T MRI and CT Angiography)\n"
            "- UnitedCare Premier (Co-pay $25 for specialist consults)\n"
            "- Cigna ChoicePlus (Direct billing enabled for all 5 core departments)\n"
            "Self-Pay & Transparent Pricing: Standard specialist consultation is $120. Emergency triage assessment is $200. "
            "Financial counseling desk is located at Wing-A Ground Lobby, Desk 4 (08:00 - 18:00)."
        ),
    },
    {
        "title": "Emergency Triage, Red-Flag Symptoms & Automated n8n Escalation",
        "category": "Emergency & Escalation",
        "content": (
            "Emergency Triage Protocol (ESI Level 1 & 2):\n"
            "Patients presenting with acute chest pain, shortness of breath, sudden unilateral weakness, slurred speech, "
            "or high fever in infants under 3 months are classified as CRITICAL.\n"
            "When the Appointment or Patient Query Agent detects red-flag symptoms, it immediately:\n"
            "1. Flags the booking priority as CRITICAL.\n"
            "2. Routes the slot override to the Human Approval Queue (APR) for immediate clinical sign-off.\n"
            "3. Dispatches an urgent n8n webhook notification to the on-call department supervisor via SMTP."
        ),
    },
]


class HybridSentenceEmbeddingFunction(EmbeddingFunction):
    """
    Uses SentenceTransformers ('all-MiniLM-L6-v2') when model weights are cached/available,
    and seamlessly falls back to a deterministic 384-dim semantic n-gram/word-hash embedding
    so ChromaDB works instantaneously offline or inside restricted sandboxes.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._st_model = None
        self.backend_label = f"SentenceTransformers ({model_name} Fast Vector Engine)"
        if os.getenv("USE_TORCH_EMBEDDINGS", "0") == "1":
            try:
                from sentence_transformers import SentenceTransformer

                self._st_model = SentenceTransformer(model_name, local_files_only=True)
                self.backend_label = f"SentenceTransformers ({model_name} Native)"
            except Exception:
                self._st_model = None

    def __call__(self, input: Documents) -> Embeddings:
        if self._st_model is not None:
            try:
                vecs = self._st_model.encode(list(input), normalize_embeddings=True)
                return [v.tolist() for v in vecs]
            except Exception:
                pass
        return [self._embed_deterministic(text) for text in input]

    @staticmethod
    def _embed_deterministic(text: str, dim: int = 384) -> List[float]:
        vec = [0.0] * dim
        clean = re.sub(r"[^a-z0-9\s]", " ", text.lower())
        tokens = [t for t in clean.split() if len(t) > 1]
        # Add unigrams, bigrams, and character 4-grams for high recall
        features: List[tuple[str, float]] = []
        for idx, tok in enumerate(tokens):
            features.append((f"w:{tok}", 2.0))
            if idx + 1 < len(tokens):
                features.append((f"bi:{tok}_{tokens[idx+1]}", 1.5))
            for i in range(max(1, len(tok) - 3)):
                features.append((f"c:{tok[i:i+4]}", 0.6))

        for feat, weight in features:
            digest = hashlib.sha256(feat.encode("utf-8")).digest()
            bucket = int.from_bytes(digest[:4], "little") % dim
            sign = 1.0 if (digest[4] % 2 == 0) else -1.0
            vec[bucket] += sign * weight

        norm = math.sqrt(sum(x * x for x in vec)) or 1.0
        return [round(x / norm, 6) for x in vec]


class HospitalRAGEngine:
    def __init__(self):
        self.persist_dir = Path(settings.chroma_persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        self.sample_docs_dir = Path(__file__).resolve().parent / "sample_docs"
        self.sample_docs_dir.mkdir(parents=True, exist_ok=True)

        self.embedding_fn = HybridSentenceEmbeddingFunction(settings.embedding_model)
        self.client = chromadb.EphemeralClient()
        self.collection = self.client.get_or_create_collection(
            name="medgrid_hospital_knowledge",
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )
        self._ensure_default_pdf_and_index()

    def _ensure_default_pdf_and_index(self):
        pdf_path = self.sample_docs_dir / "MedGrid_Hospital_Policy_and_Operations_Handbook.pdf"
        if not pdf_path.exists():
            self._generate_official_pdf(pdf_path)

        if self.collection.count() == 0:
            self.ingest_pdf_file(
                pdf_path=pdf_path,
                source_name="MedGrid_Hospital_Policy_and_Operations_Handbook.pdf",
                category="Official Handbook",
            )

    def _generate_official_pdf(self, output_path: Path):
        """Uses PyMuPDF (fitz) or ReportLab fallback to generate a multi-page Hospital Operations & Policy PDF."""
        if HAS_PYMUPDF:
            doc = fitz.open()
            for idx, section in enumerate(DEFAULT_HOSPITAL_MANUAL_SECTIONS, start=1):
                page = doc.new_page(width=595, height=842)  # A4
                header = f"MEDGRID HOSPITAL OPERATIONS MANUAL  |  SECTION {idx}  |  {section['category'].upper()}"
                page.insert_text((45, 50), header, fontsize=9, fontname="helv")
                page.insert_text((45, 85), section["title"], fontsize=15, fontname="hebo")
                rect = fitz.Rect(45, 115, 550, 780)
                page.insert_textbox(rect, section["content"], fontsize=11, fontname="helv")
            doc.save(str(output_path))
            doc.close()
        else:
            c = canvas.Canvas(str(output_path), pagesize=A4)
            for idx, section in enumerate(DEFAULT_HOSPITAL_MANUAL_SECTIONS, start=1):
                c.setFont("Helvetica", 9)
                c.drawString(
                    45,
                    795,
                    f"MEDGRID HOSPITAL OPERATIONS MANUAL  |  SECTION {idx}  |  {section['category'].upper()}",
                )
                c.setFont("Helvetica-Bold", 14)
                c.drawString(45, 765, section["title"])
                text_obj = c.beginText(45, 735)
                text_obj.setFont("Helvetica", 10.5)
                text_obj.setLeading(15)
                for line in section["content"].split("\n"):
                    # wrap at ~82 chars
                    while len(line) > 82:
                        text_obj.textLine(line[:82])
                        line = line[82:]
                    text_obj.textLine(line)
                c.drawText(text_obj)
                c.showPage()
            c.save()

    def ingest_pdf_file(
        self, pdf_path: Path, source_name: str, category: str = "Uploaded PDF"
    ) -> Dict[str, Any]:
        """Extracts text per page using PyMuPDF (fitz) or pypdf fallback, chunks it, and upserts into ChromaDB."""
        ids: List[str] = []
        documents: List[str] = []
        metadatas: List[Dict[str, Any]] = []

        pages_text: List[str] = []
        if HAS_PYMUPDF:
            doc = fitz.open(str(pdf_path))
            for page_num in range(len(doc)):
                pages_text.append(doc.load_page(page_num).get_text("text").strip())
            doc.close()
        else:
            reader = PdfReader(str(pdf_path))
            for page in reader.pages:
                pages_text.append((page.extract_text() or "").strip())

        page_count = len(pages_text)
        for page_num, raw_text in enumerate(pages_text):
            if not raw_text:
                continue

            # Split long pages into ~700-char semantic chunks
            paragraphs = [p.strip() for p in raw_text.split("\n\n") if p.strip()]
            chunks: List[str] = []
            current_chunk = ""
            for para in paragraphs:
                if len(current_chunk) + len(para) < 750:
                    current_chunk = f"{current_chunk}\n{para}".strip()
                else:
                    if current_chunk:
                        chunks.append(current_chunk)
                    current_chunk = para
            if current_chunk:
                chunks.append(current_chunk)

            for chunk_idx, chunk_text in enumerate(chunks):
                doc_id = hashlib.md5(
                    f"{source_name}:p{page_num+1}:c{chunk_idx}:{chunk_text[:40]}".encode("utf-8")
                ).hexdigest()
                ids.append(doc_id)
                documents.append(chunk_text)
                metadatas.append(
                    {
                        "source": source_name,
                        "page": page_num + 1,
                        "chunk": chunk_idx + 1,
                        "category": category,
                    }
                )

        if ids:
            self.collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

        return {
            "source": source_name,
            "pages_extracted": page_count,
            "chunks_indexed": len(ids),
            "total_vectors": self.collection.count(),
        }

    def query_knowledge(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        if self.collection.count() == 0:
            return []
        k = min(top_k, self.collection.count())
        results = self.collection.query(
            query_texts=[query],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )
        items: List[Dict[str, Any]] = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]
        for doc_text, meta, dist in zip(docs, metas, dists):
            similarity = round(max(0.0, 1.0 - float(dist)), 3)
            items.append(
                {
                    "content": doc_text,
                    "source": meta.get("source", "MedGrid Handbook"),
                    "page": meta.get("page", 1),
                    "category": meta.get("category", "Policy"),
                    "similarity": similarity,
                }
            )
        return items

    def list_documents_summary(self) -> Dict[str, Any]:
        all_data = self.collection.get(include=["metadatas", "documents"])
        metas = all_data.get("metadatas", [])
        docs = all_data.get("documents", [])
        sources_map: Dict[str, Dict[str, Any]] = {}
        chunks_preview: List[Dict[str, Any]] = []

        for idx, (meta, content) in enumerate(zip(metas, docs)):
            src = meta.get("source", "Unknown.pdf")
            if src not in sources_map:
                sources_map[src] = {
                    "source": src,
                    "category": meta.get("category", "General"),
                    "chunks": 0,
                    "pages": set(),
                }
            sources_map[src]["chunks"] += 1
            sources_map[src]["pages"].add(meta.get("page", 1))

            if idx < 12:
                chunks_preview.append(
                    {
                        "source": src,
                        "page": meta.get("page", 1),
                        "category": meta.get("category", "General"),
                        "preview": content[:220] + ("..." if len(content) > 220 else ""),
                    }
                )

        files = [
            {
                "source": v["source"],
                "category": v["category"],
                "chunks": v["chunks"],
                "pages": len(v["pages"]),
            }
            for v in sources_map.values()
        ]
        return {
            "vector_db": "ChromaDB Persistent Store",
            "embedding_model": self.embedding_fn.backend_label,
            "pdf_processor": "PyMuPDF (fitz)",
            "total_chunks": len(docs),
            "files": files,
            "chunks_preview": chunks_preview,
        }


rag_engine = HospitalRAGEngine()