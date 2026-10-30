import React, { useEffect, useState } from 'react';
import {
  FileText,
  Upload,
  Search,
  Database,
  CheckCircle2,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { api } from '../api';

export default function KnowledgeRagView({ onRefreshOverview }) {
  const [summary, setSummary] = useState(null);
  const [searchQuery, setSearchQuery] = useState(
    'What are the ICU visiting hours and emergency triage protocols?'
  );
  const [searchResults, setSearchResults] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [searching, setSearching] = useState(false);

  const loadSummary = async () => {
    try {
      const data = await api.getRagSummary();
      setSummary(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.queryRag(searchQuery, 3);
      setSearchResults(res.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadSummary();
    handleSearch();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      const res = await api.uploadPdf(file, 'Uploaded Clinical PDF');
      setUploadStatus(
        `PyMuPDF extracted ${res.ingestion.pages_extracted} page(s) from "${res.ingestion.source}" and indexed ${res.ingestion.chunks_indexed} vector chunk(s) into ChromaDB!`
      );
      await loadSummary();
      onRefreshOverview?.();
    } catch (err) {
      setUploadStatus(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top RAG Telemetry Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            VECTOR STORE
          </div>
          <div className="font-mono-tech text-sm font-bold text-white mt-1">
            {summary?.vector_db || 'ChromaDB Persistent'}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            EMBEDDINGS ENGINE
          </div>
          <div className="font-mono-tech text-xs font-bold text-[#74f29c] mt-1 truncate">
            {summary?.embedding_model || 'SentenceTransformers'}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            PDF PARSER
          </div>
          <div className="font-mono-tech text-sm font-bold text-[#eef878] mt-1">
            {summary?.pdf_processor || 'PyMuPDF (fitz)'}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            INDEXED CHUNKS
          </div>
          <div className="font-mono-tech text-xl font-bold text-white mt-0.5">
            {summary?.total_chunks ?? 5} vectors
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 5 COLUMNS: PyMuPDF PDF Uploader & Indexed Files */}
        <div className="lg:col-span-5 space-y-5">
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-400/15 pb-3">
              <div>
                <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[#74f29c]" />
                  <span>UPLOAD HOSPITAL PDF (PyMuPDF)</span>
                </h2>
                <p className="text-xs font-mono-tech text-emerald-200/60">
                  Extracts PDF text via fitz & embeds into ChromaDB
                </p>
              </div>
              <span className="keycap-dark">R</span>
            </div>

            <label className="glass-cell border-2 border-dashed border-emerald-400/35 hover:border-[#74f29c] rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all">
              <FileText className="w-8 h-8 text-[#74f29c] mb-2" />
              <span className="font-mono-tech text-xs sm:text-sm text-white font-medium">
                {uploading
                  ? 'Extracting PDF via PyMuPDF & embedding...'
                  : 'Click to upload a Hospital Policy / FAQ PDF'}
              </span>
              <span className="text-[11px] font-mono-tech text-emerald-200/55 mt-1">
                Supports multi-page clinical manuals, SOPs, and fee schedules
              </span>
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {uploadStatus && (
              <div className="p-3 rounded-lg bg-emerald-400/15 border border-[#74f29c]/40 text-xs font-mono-tech text-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#74f29c] shrink-0" />
                <span>{uploadStatus}</span>
              </div>
            )}

            {/* Indexed PDF Documents List */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-mono-tech text-emerald-300/80">
                ACTIVE DOCUMENTS IN CHROMADB
              </div>
              {(summary?.files || []).map((f, i) => (
                <div
                  key={i}
                  className="glass-cell p-3 rounded-lg border border-emerald-400/20 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <div className="font-mono-tech text-white truncate">
                      {f.source}
                    </div>
                    <div className="text-[11px] text-emerald-200/60">
                      {f.category} • {f.pages} page(s)
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono-tech text-[11px] bg-[#74f29c]/15 text-[#74f29c] shrink-0">
                    {f.chunks} chunks
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT 7 COLUMNS: Semantic Vector Retrieval Tester */}
        <div className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-4">
          <div className="border-b border-emerald-400/15 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-[#74f29c]" />
                <span>PATIENT QUERY AGENT — LIVE VECTOR SEARCH</span>
              </h2>
              <p className="text-xs font-mono-tech text-emerald-200/60">
                Test semantic retrieval across hospital FAQs, timings, and
                policies
              </p>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search hospital timings, insurance plans, ICU rules..."
              className="flex-1 glass-pill px-3.5 py-2 rounded-lg text-xs sm:text-sm text-white focus:outline-none focus:border-[#74f29c]"
            />
            <button
              type="submit"
              disabled={searching}
              className="bg-white hover:bg-emerald-50 text-[#051109] font-semibold px-4 py-2 rounded-lg text-xs font-mono-tech cursor-pointer"
            >
              {searching ? 'Searching...' : 'Query ChromaDB'}
            </button>
          </form>

          {/* Quick Topic Pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              'Department timings & Cardiology wing',
              'Accepted insurance plans & co-pay',
              'ICU visiting hours & parking',
              'Cancellation & human approval policy',
            ].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setSearchQuery(q);
                  api.queryRag(q, 3).then((r) => setSearchResults(r.results || []));
                }}
                className="glass-pill px-2.5 py-1 rounded text-[11px] font-mono-tech text-emerald-200/80 hover:text-white cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Vector Results */}
          <div className="space-y-3 pt-2">
            {searchResults.map((res, idx) => (
              <div
                key={idx}
                className="glass-cell p-4 rounded-xl border border-emerald-400/25 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tech">
                  <span className="text-[#74f29c] font-semibold">
                    #{idx + 1} • {res.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-200 text-[11px]">
                      {res.source} (Page {res.page})
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#eef878]/15 text-[#eef878] text-[11px]">
                      Score: {res.similarity}
                    </span>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-emerald-50/90 whitespace-pre-line leading-relaxed">
                  {res.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

