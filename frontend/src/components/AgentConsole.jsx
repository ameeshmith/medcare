import React, { useState } from 'react';
import {
  Send,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Database,
  BookOpen,
  Workflow,
  Cpu,
  Clock,
  ArrowDown,
} from 'lucide-react';
import { api } from '../api';

const PRESET_PROMPTS = [
  {
    label: 'Book Cardiology (Conflict Resolution)',
    agent: 'Appointment + Scheduling Agent',
    prompt:
      'Book an appointment for Maya Lin-Kovacs with Dr. Elena Vance in Cardiology at 09:00 today for arrhythmia check.',
  },
  {
    label: 'Critical Triage (Human Approval Gate)',
    agent: 'Appointment Agent -> Approval Gate',
    prompt:
      'Book CRITICAL emergency chest pain telemetry consult for Arthur Pendelton with Dr. Elena Vance at 15:00 today.',
  },
  {
    label: 'Cancel Appointment (Requires Approval)',
    agent: 'Appointment Agent',
    prompt: 'Cancel appointment APT-4091 for Arthur Pendelton immediately.',
  },
  {
    label: 'Check Doctor Availability',
    agent: 'Scheduling Agent',
    prompt:
      'What are the available open slots and blocked windows for Dr. Julian Thorne in Oncology today?',
  },
  {
    label: 'Hospital Policy & ICU Hours (RAG)',
    agent: 'Patient Query Agent (ChromaDB)',
    prompt:
      'What are the ICU visiting hours, department timings for Neurology, and accepted insurance plans?',
  },
  {
    label: 'Daily Operations Executive Summary',
    agent: 'Operations Agent',
    prompt:
      'Generate today’s daily operations summary report, slot utilization, and operational bottlenecks.',
  },
];

export default function AgentConsole({ onRefreshOverview, onNavigate }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([
    {
      role: 'agent',
      active_agent: 'AI Orchestrator (LangGraph)',
      intent: 'READY',
      llm_model_used: 'LangGraph StateGraph + Groq Llama 3.3 70B',
      timestamp: 'ONLINE',
      response:
        'Welcome to the **MedGrid Multi-Agent Orchestrator**. Select a clinical scenario preset above or enter a natural-language command to route across our 4 agents (**Appointment**, **Scheduling**, **Patient Query RAG**, and **Operations**).',
      agent_chain: [
        {
          step: 'System Initialized',
          status: 'COMPLETED',
          detail:
            'Connected to FastAPI, PostgreSQL/SQLite, ChromaDB Vector Store, and n8n Webhook Dispatcher.',
        },
      ],
      rag_citations: [],
    },
  ]);

  const lastTrace = history[history.length - 1];

  const handleRunPrompt = async (messageText) => {
    const query = (messageText ?? input).trim();
    if (!query || loading) return;
    setInput('');
    setHistory((prev) => [
      ...prev,
      { role: 'user', message: query, timestamp: new Date().toLocaleTimeString() },
    ]);
    setLoading(true);
    try {
      const res = await api.executeAgent(query);
      setHistory((prev) => [
        ...prev,
        {
          role: 'agent',
          ...res,
        },
      ]);
      onRefreshOverview?.();
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        {
          role: 'agent',
          active_agent: 'Orchestrator Error Handler',
          response: `Error executing workflow: ${err.message}`,
          agent_chain: [],
          rag_citations: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const activeAgentName = lastTrace?.active_agent || '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
      {/* LEFT 7 COLUMNS: Interactive Multi-Agent Chat & Presets */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        {/* Preset Scenarios Bar */}
        <div className="glass-panel rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono-tech text-emerald-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#74f29c]" />
              <span>1-CLICK MULTI-AGENT SCENARIO TRIGGERS</span>
            </span>
            <span className="text-[11px] font-mono-tech text-emerald-200/60">
              LangGraph StateGraph
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRESET_PROMPTS.map((p) => (
              <button
                key={p.label}
                disabled={loading}
                onClick={() => handleRunPrompt(p.prompt)}
                className="glass-cell text-left p-2.5 rounded-lg border border-emerald-400/20 hover:border-[#74f29c]/60 transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between text-[11px] font-mono-tech text-[#74f29c]">
                  <span>{p.label}</span>
                  <span className="opacity-60 group-hover:opacity-100">→</span>
                </div>
                <div className="text-[11px] text-emerald-100/60 truncate mt-0.5">
                  {p.agent}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation Feed */}
        <div className="glass-panel rounded-xl p-5 flex flex-col justify-between min-h-[470px] max-h-[600px]">
          <div className="overflow-y-auto space-y-4 pr-1 flex-1">
            {history.map((item, idx) =>
              item.role === 'user' ? (
                <div key={idx} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl px-4 py-3 bg-emerald-400/20 border border-emerald-300/40 text-sm text-white shadow-lg">
                    <div className="text-[10px] font-mono-tech text-emerald-200/70 mb-1">
                      OPERATOR COMMAND • {item.timestamp}
                    </div>
                    <div>{item.message}</div>
                  </div>
                </div>
              ) : (
                <div
                  key={idx}
                  className="glass-cell rounded-xl p-4 border border-emerald-400/25 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-400/15 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono-tech bg-[#74f29c]/15 text-[#74f29c] border border-[#74f29c]/35">
                        {item.active_agent}
                      </span>
                      {item.requires_approval && (
                        <button
                          onClick={() => onNavigate('approvals')}
                          className="px-2 py-0.5 rounded text-[11px] font-mono-tech bg-amber-400/20 text-amber-200 border border-amber-400/40 flex items-center gap-1 cursor-pointer hover:bg-amber-400/30"
                        >
                          <ShieldAlert className="w-3 h-3" />
                          <span>Open Approval Queue [A]</span>
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] font-mono-tech text-emerald-200/60 flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[#eef878]" />
                      {item.llm_model_used}
                    </span>
                  </div>

                  {/* Formatted Agent Response */}
                  <div className="text-xs sm:text-sm text-emerald-50/95 whitespace-pre-line leading-relaxed font-sans">
                    {item.response}
                  </div>

                  {/* ChromaDB RAG Citations */}
                  {item.rag_citations?.length > 0 && (
                    <div className="pt-2 border-t border-emerald-400/15 space-y-1.5">
                      <div className="text-[11px] font-mono-tech text-emerald-300/80 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-[#74f29c]" />
                        <span>ChromaDB Vector Citations (PyMuPDF Extracted):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {item.rag_citations.map((cit, cIdx) => (
                          <div
                            key={cIdx}
                            className="p-2 rounded bg-black/30 border border-emerald-400/15 text-[11px]"
                          >
                            <div className="font-mono-tech text-[#74f29c] flex justify-between">
                              <span>{cit.category}</span>
                              <span>
                                p.{cit.page} • sim {cit.similarity}
                              </span>
                            </div>
                            <div className="text-emerald-100/70 line-clamp-2 mt-0.5">
                              {cit.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
            {loading && (
              <div className="glass-cell rounded-xl p-4 border border-emerald-400/30 text-xs font-mono-tech text-[#74f29c] animate-pulse">
                Executing LangGraph StateGraph: n8n Webhook → AI Orchestrator →
                Specialist Agent → PostgreSQL / ChromaDB...
              </div>
            )}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunPrompt();
            }}
            className="pt-4 mt-3 border-t border-emerald-400/20 flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask an agent to book/cancel appointments, check doctor slots, query hospital PDF policies, or run daily reports..."
              className="flex-1 glass-pill px-4 py-2.5 rounded-lg text-xs sm:text-sm text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#74f29c]"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-white hover:bg-emerald-50 text-[#051109] font-semibold px-4 py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <span>Execute</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* RIGHT 5 COLUMNS: Live Architecture Pipeline Diagram & Execution Trace */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        {/* Visual Workflow Architecture Diagram (Matches User's Exact ASCII Diagram) */}
        <div className="glass-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-400/15 pb-3">
            <div>
              <h3 className="font-mono-tech text-sm font-semibold text-white flex items-center gap-2">
                <Workflow className="w-4 h-4 text-[#74f29c]" />
                <span>LIVE WORKFLOW ARCHITECTURE</span>
              </h3>
              <p className="text-[11px] font-mono-tech text-emerald-200/60">
                Active nodes illuminate during agent execution
              </p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono-tech bg-emerald-400/15 text-[#74f29c] border border-emerald-400/30">
              STATEGRAPH TRACE
            </span>
          </div>

          {/* Pipeline Nodes */}
          <div className="flex flex-col items-center space-y-2 text-xs font-mono-tech">
            <div className="w-full max-w-xs py-2 px-3 rounded-lg text-center bg-emerald-400/15 border border-emerald-300/40 text-white">
              REACT GLASS DASHBOARD
            </div>
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400/60" />
            <div className="w-full max-w-xs py-2 px-3 rounded-lg text-center bg-emerald-400/15 border border-emerald-300/40 text-white">
              FASTAPI BACKEND + n8n WEBHOOK
            </div>
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400/60" />
            <div className="w-full max-w-xs py-2 px-3 rounded-lg text-center bg-[#eef878]/15 border border-[#eef878]/50 text-[#eef878] font-semibold">
              AI ORCHESTRATOR (LangGraph)
            </div>
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400/60" />

            {/* 3 Parallel Specialist Branches */}
            <div className="grid grid-cols-3 gap-2 w-full">
              <div
                className={`p-2.5 rounded-lg text-center border transition-all ${
                  activeAgentName.includes('Appointment') ||
                  activeAgentName.includes('Scheduling')
                    ? 'bg-[#74f29c]/25 border-[#74f29c] text-white shadow-[0_0_20px_rgba(116,242,156,0.3)]'
                    : 'glass-cell border-emerald-400/20 text-emerald-200/60'
                }`}
              >
                <div className="text-[11px] font-bold">Appointment</div>
                <div className="text-[10px] opacity-75">Agent</div>
              </div>

              <div
                className={`p-2.5 rounded-lg text-center border transition-all ${
                  activeAgentName.includes('Patient Query')
                    ? 'bg-[#74f29c]/25 border-[#74f29c] text-white shadow-[0_0_20px_rgba(116,242,156,0.3)]'
                    : 'glass-cell border-emerald-400/20 text-emerald-200/60'
                }`}
              >
                <div className="text-[11px] font-bold">Patient Query</div>
                <div className="text-[10px] opacity-75">RAG Agent</div>
              </div>

              <div
                className={`p-2.5 rounded-lg text-center border transition-all ${
                  activeAgentName.includes('Operations')
                    ? 'bg-[#74f29c]/25 border-[#74f29c] text-white shadow-[0_0_20px_rgba(116,242,156,0.3)]'
                    : 'glass-cell border-emerald-400/20 text-emerald-200/60'
                }`}
              >
                <div className="text-[11px] font-bold">Operations</div>
                <div className="text-[10px] opacity-75">Agent</div>
              </div>
            </div>

            <ArrowDown className="w-3.5 h-3.5 text-emerald-400/60" />
            <div
              className={`w-full max-w-xs py-2 px-3 rounded-lg text-center border transition-all ${
                activeAgentName.includes('Appointment') ||
                activeAgentName.includes('Scheduling')
                  ? 'bg-[#eef878]/20 border-[#eef878] text-[#eef878]'
                  : 'glass-cell border-emerald-400/20 text-emerald-200/70'
              }`}
            >
              SCHEDULING AGENT (Conflict Check)
            </div>
            <ArrowDown className="w-3.5 h-3.5 text-emerald-400/60" />
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              <div className="py-2 px-2 rounded-lg text-center glass-cell border border-emerald-400/30 text-emerald-200 text-[11px]">
                POSTGRESQL
              </div>
              <div className="py-2 px-2 rounded-lg text-center glass-cell border border-emerald-400/30 text-emerald-200 text-[11px]">
                CHROMADB (RAG)
              </div>
            </div>
          </div>
        </div>

        {/* Step-by-Step Execution Audit Log */}
        <div className="glass-panel rounded-xl p-5 space-y-3 flex-1">
          <div className="text-xs font-mono-tech text-emerald-300 flex items-center justify-between">
            <span>EXECUTION NODE TRACE</span>
            <Clock className="w-3.5 h-3.5 text-[#74f29c]" />
          </div>
          <div className="space-y-2.5">
            {(lastTrace?.agent_chain || []).map((stepObj, i) => (
              <div
                key={i}
                className="glass-cell p-3 rounded-lg border border-emerald-400/20 space-y-1"
              >
                <div className="flex items-center justify-between text-xs font-mono-tech">
                  <span className="text-white font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#74f29c]" />
                    {stepObj.step}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      stepObj.status === 'PAUSED_FOR_HUMAN'
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                        : 'bg-emerald-400/15 text-[#74f29c]'
                    }`}
                  >
                    {stepObj.status}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-100/70 pl-5">
                  {stepObj.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

