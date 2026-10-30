import React, { useEffect, useState, useCallback } from 'react';
import Navbar from './components/Navbar';
import LandingView from './components/LandingView';
import AgentConsole from './components/AgentConsole';
import AppointmentsView from './components/AppointmentsView';
import KnowledgeRagView from './components/KnowledgeRagView';
import ApprovalsQueue from './components/ApprovalsQueue';
import OperationsReport from './components/OperationsReport';
import { api } from './api';
import { KeyRound, X, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [overview, setOverview] = useState(null);
  const [showGroqModal, setShowGroqModal] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [groqModelInput, setGroqModelInput] = useState(
    'llama-3.3-70b-versatile'
  );
  const [groqSavedMsg, setGroqSavedMsg] = useState(null);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await api.getOverview();
      setOverview(data);
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Global LocalCan-style single-key shortcuts when not focused in an input
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }
      const key = e.key.toUpperCase();
      if (key === 'L') setActiveTab('landing');
      else if (key === 'S' || key === 'C') setActiveTab('console');
      else if (key === 'B') setActiveTab('appointments');
      else if (key === 'R') setActiveTab('rag');
      else if (key === 'A') setActiveTab('approvals');
      else if (key === 'O' || key === 'D') setActiveTab('operations');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSaveGroqKey = async (e) => {
    e.preventDefault();
    try {
      await api.updateGroqKey(groqKeyInput, groqModelInput);
      setGroqSavedMsg('Groq API Key updated! Live Llama 3.3 70B active.');
      fetchOverview();
      setTimeout(() => {
        setGroqSavedMsg(null);
        setShowGroqModal(false);
      }, 1200);
    } catch (err) {
      setGroqSavedMsg(`Error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen medgrid-bg flex flex-col justify-between relative">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        overview={overview}
        onOpenGroqModal={() => setShowGroqModal(true)}
      />

      <main className="max-w-[1440px] w-full mx-auto px-4 sm:px-8 pt-6 flex-1">
        {activeTab === 'landing' && (
          <LandingView overview={overview} onNavigate={setActiveTab} />
        )}
        {activeTab === 'console' && (
          <AgentConsole
            onRefreshOverview={fetchOverview}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'appointments' && (
          <AppointmentsView
            overview={overview}
            onRefresh={fetchOverview}
            onNavigateApprovals={() => setActiveTab('approvals')}
          />
        )}
        {activeTab === 'rag' && (
          <KnowledgeRagView onRefreshOverview={fetchOverview} />
        )}
        {activeTab === 'approvals' && (
          <ApprovalsQueue overview={overview} onRefresh={fetchOverview} />
        )}
        {activeTab === 'operations' && (
          <OperationsReport overview={overview} onRefresh={fetchOverview} />
        )}
      </main>

      {/* Frosted Glass Footer Telemetry Bar */}
      <footer className="sticky bottom-0 z-30 bg-[#040e07]/80 backdrop-blur-xl border-t border-emerald-400/20 py-2 px-4 sm:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-tech text-emerald-200/70">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 text-white">
              <span className="w-2 h-2 rounded-full bg-[#74f29c]" />
              {overview?.system?.database || 'PostgreSQL / SQLite Ready'}
            </span>
            <span>
              ChromaDB: {overview?.system?.chroma_vectors ?? 5} vectors
            </span>
            <span className="hidden sm:inline">
              Embeddings: {overview?.system?.embedding_model || 'MiniLM-L6-v2'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>
              Shortcuts: [L] Hero • [C] Agents • [B] Bookings • [R] RAG • [A]
              Approvals • [O] Ops
            </span>
          </div>
        </div>
      </footer>

      {/* Frosted Glass Groq API Key Modal */}
      {showGroqModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full p-6 border border-emerald-300/35 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-400/20 pb-3">
              <h3 className="font-mono-tech text-sm font-semibold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#74f29c]" />
                <span>CONFIGURE GROQ API (LLAMA 3.3 70B)</span>
              </h3>
              <button
                onClick={() => setShowGroqModal(false)}
                className="text-emerald-200/70 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroqKey} className="space-y-3 text-xs">
              <div>
                <label className="block font-mono-tech text-emerald-200/80 mb-1">
                  GROQ_API_KEY (Optional — Fallback Engine Active by Default)
                </label>
                <input
                  type="password"
                  value={groqKeyInput}
                  onChange={(e) => setGroqKeyInput(e.target.value)}
                  placeholder="gsk_..."
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white font-mono-tech focus:outline-none focus:border-[#74f29c]"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-emerald-200/80 mb-1">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={groqModelInput}
                  onChange={(e) => setGroqModelInput(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white font-mono-tech"
                />
              </div>

              {groqSavedMsg && (
                <div className="p-2.5 rounded bg-emerald-400/15 border border-[#74f29c]/40 text-[#74f29c] font-mono-tech flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{groqSavedMsg}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowGroqModal(false)}
                  className="glass-pill px-4 py-2 rounded-lg font-mono-tech text-emerald-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-white text-[#051109] font-mono-tech font-bold px-4 py-2 rounded-lg cursor-pointer"
                >
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

