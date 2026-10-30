import React, { useState } from 'react';
import {
  Copy,
  Check,
  Globe,
  Laptop,
  ArrowUpDown,
  Cpu,
  CalendarCheck,
  FileSearch,
  Activity,
  ShieldCheck,
  Workflow,
  ArrowRight,
  Database,
  Sparkles,
} from 'lucide-react';

export default function LandingView({ overview, onNavigate }) {
  const [copied, setCopied] = useState(false);
  const installCmd = 'docker compose up -d && uvicorn main:app';

  const handleCopy = () => {
    navigator.clipboard?.writeText(installCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const metrics = overview?.metrics || {
    total_appointments: 6,
    confirmed: 4,
    pending_human_approvals: 2,
    doctors_on_duty: 4,
    slot_utilization_pct: 68.5,
    n8n_executions: 3,
  };

  const agents = [
    {
      name: 'Appointment Agent',
      tag: 'AGENT_01',
      role: 'Handles booking, cancellation, and rescheduling requests while routing high-risk overrides to Human Approval.',
      targetTab: 'appointments',
      shortcut: 'B',
      accent: 'text-[#74f29c]',
      icon: CalendarCheck,
    },
    {
      name: 'Scheduling Agent',
      tag: 'AGENT_02',
      role: 'Verifies doctor availability windows, detects double-booking conflicts, and suggests optimal open slots.',
      targetTab: 'appointments',
      shortcut: 'B',
      accent: 'text-[#eef878]',
      icon: ShieldCheck,
    },
    {
      name: 'Patient Query Agent',
      tag: 'AGENT_03',
      role: 'Answers hospital policy, department timing, ICU visiting, and insurance queries via ChromaDB + PyMuPDF RAG.',
      targetTab: 'rag',
      shortcut: 'R',
      accent: 'text-emerald-300',
      icon: FileSearch,
    },
    {
      name: 'Operations Agent',
      tag: 'AGENT_04',
      role: 'Generates daily executive reports, tracks slot utilization, flags bottlenecks, and triggers n8n SMTP digests.',
      targetTab: 'operations',
      shortcut: 'O',
      accent: 'text-[#f59e0b]',
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* =====================================================================
          HERO SWISS GLASS GRID (Direct LocalCan Aesthetic + Glassmorphism)
      ===================================================================== */}
      <section className="glass-panel rounded-2xl overflow-hidden border border-emerald-400/25">
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[590px]">
          {/* LEFT 6 COLUMNS: Hero Typography, Terminal Pill, & Dual Action Buttons */}
          <div className="lg:col-span-6 p-8 sm:p-12 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-emerald-400/20 relative">
            {/* Ambient subtle top-left glass glow */}
            <div className="pointer-events-none absolute -top-20 -left-20 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="space-y-7 relative z-10">
              {/* Terminal Command Pill (LocalCan `brew install localcan` style) */}
              <button
                onClick={handleCopy}
                className="glass-pill inline-flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-mono-tech text-emerald-200/90 hover:text-white hover:border-emerald-300/50 transition-all cursor-pointer group"
                title="Click to copy stack launch command"
              >
                <span className="text-[#74f29c]">$</span>
                <span>{installCmd}</span>
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-[#74f29c]" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-emerald-300/60 group-hover:text-emerald-200" />
                )}
              </button>

              {/* Monospace Display Headline */}
              <h1 className="font-mono-tech text-3xl sm:text-5xl lg:text-[52px] font-normal tracking-tight text-white leading-[1.12]">
                Autonomous AI
                <br />
                for hospitals,
                <br />
                clinicians and
                <br />
                agents.
              </h1>

              {/* Subtitle */}
              <p className="font-mono-tech text-sm sm:text-base text-emerald-100/70 leading-relaxed max-w-xl">
                Orchestrate appointments, conflict-free doctor schedules,
                PyMuPDF RAG knowledge, and human-approved clinical workflows
                with <span className="text-emerald-200">n8n</span>,{' '}
                <span className="text-emerald-200">LangGraph</span>, and{' '}
                <span className="text-emerald-200">Groq Llama 3.3 70B</span>.
              </p>
            </div>

            {/* Bottom CTA Row + Footnote */}
            <div className="pt-8 space-y-4 relative z-10">
              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  onClick={() => onNavigate('console')}
                  className="bg-white hover:bg-emerald-50 text-[#051109] font-semibold px-5 py-3 rounded-lg text-sm flex items-center gap-3 shadow-[0_0_30px_rgba(255,255,255,0.22)] transition-all cursor-pointer"
                >
                  <span>Start building</span>
                  <span className="keycap-light">S</span>
                </button>

                <button
                  onClick={() => onNavigate('operations')}
                  className="glass-pill hover:bg-emerald-400/15 text-white font-medium px-5 py-3 rounded-lg text-sm flex items-center gap-3 border border-emerald-300/30 transition-all cursor-pointer"
                >
                  <span>n8n Workflows</span>
                  <span className="keycap-dark">D</span>
                </button>
              </div>

              <p className="text-xs font-mono-tech text-emerald-200/55">
                PostgreSQL + ChromaDB active • {metrics.total_appointments} live
                appointments • {metrics.pending_human_approvals} human approvals
                queued.
              </p>
            </div>
          </div>

          {/* RIGHT 6 COLUMNS: 2x4 Exposed Swiss Glass Grid (Exact LocalCan Mosaic) */}
          <div className="lg:col-span-6 grid grid-cols-2 grid-rows-4 min-h-[540px]">
            {/* Row 1, Col 1: Frosted Glass Telemetry Tile */}
            <div
              onClick={() => onNavigate('console')}
              className="glass-cell border-b border-r border-emerald-400/20 p-5 flex flex-col justify-between cursor-pointer group"
            >
              <div className="flex items-center justify-between text-[11px] font-mono-tech text-emerald-300/60">
                <span>ORCHESTRATOR</span>
                <span className="w-2 h-2 rounded-full bg-[#74f29c]" />
              </div>
              <div className="font-mono-tech text-xs text-emerald-100/80 group-hover:text-white transition-colors">
                LangGraph 4-Agent StateGraph Ready
              </div>
            </div>

            {/* Row 1, Col 2: Orange Vertical Bidirectional Arrows (n8n <-> FastAPI Sync) */}
            <div
              onClick={() => onNavigate('operations')}
              className="glass-cell border-b border-emerald-400/20 p-6 flex flex-col items-center justify-center relative cursor-pointer group"
              title="n8n <-> FastAPI Webhook Bridge"
            >
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 group-hover:scale-110 transition-transform">
                <ArrowUpDown className="w-8 h-8 text-[#e5854b]" />
              </div>
              <span className="mt-2 text-[11px] font-mono-tech text-emerald-200/60">
                n8n ⇄ FastAPI Sync
              </span>
            </div>

            {/* Row 2, Col 1: Iconic Pixel-Overlay Clinician/Agent Portrait Tile */}
            <div
              onClick={() => onNavigate('approvals')}
              className="glass-cell border-b border-r border-emerald-400/20 relative overflow-hidden flex items-center justify-center cursor-pointer group"
              title="Human-in-the-Loop Clinical Supervision"
            >
              {/* Stylized dark olive-green portrait silhouette backdrop */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#2b3a22]/90 via-[#1a2916]/90 to-[#0d1c11]/95" />

              {/* Clinician glasses & portrait SVG art */}
              <svg
                viewBox="0 0 240 140"
                className="w-full h-full object-cover relative z-10 opacity-90"
              >
                {/* Warm skin/portrait tones */}
                <ellipse cx="120" cy="82" rx="46" ry="56" fill="#b9835a" opacity="0.85" />
                <path
                  d="M74 65 C74 30, 166 30, 166 65 L162 42 C145 24, 95 24, 78 42 Z"
                  fill="#181b18"
                />
                {/* Wireframe round glasses */}
                <circle
                  cx="101"
                  cy="74"
                  r="15"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="2"
                />
                <circle
                  cx="139"
                  cy="74"
                  r="15"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="2"
                />
                <line
                  x1="116"
                  y1="74"
                  x2="124"
                  y2="74"
                  stroke="#e2e8f0"
                  strokeWidth="2"
                />
              </svg>

              {/* Iconic LocalCan Yellow-Lime Frosted Pixel Squares Overlay */}
              <div className="absolute top-0 left-[28%] w-10 h-10 bg-[#eef878] shadow-[0_0_20px_rgba(238,248,120,0.45)] z-20 transition-transform group-hover:translate-y-1" />
              <div className="absolute top-[34%] left-[44%] w-10 h-10 bg-[#eef878] shadow-[0_0_20px_rgba(238,248,120,0.45)] z-20 transition-transform group-hover:-translate-x-1" />
              <div className="absolute bottom-0 left-[8%] w-10 h-10 bg-[#eef878] shadow-[0_0_20px_rgba(238,248,120,0.45)] z-20" />
              <div className="absolute bottom-0 left-[52%] w-10 h-10 bg-[#eef878] shadow-[0_0_20px_rgba(238,248,120,0.45)] z-20" />
              <div className="absolute top-[42%] right-0 w-6 h-10 bg-[#eef878] z-20" />

              <span className="absolute bottom-2 right-2.5 z-30 px-2 py-0.5 rounded text-[10px] font-mono-tech bg-black/65 text-[#eef878] border border-[#eef878]/40 backdrop-blur-md">
                HUMAN-IN-LOOP [A]
              </span>
            </div>

            {/* Row 2, Col 2: Mint Wireframe Globe Icon (ChromaDB + RAG Knowledge) */}
            <div
              onClick={() => onNavigate('rag')}
              className="glass-cell border-b border-emerald-400/20 p-6 flex flex-col items-center justify-center cursor-pointer group"
              title="ChromaDB Vector Knowledge Base"
            >
              <div className="p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/25 group-hover:scale-110 transition-transform">
                <Globe className="w-8 h-8 text-[#74f29c]" />
              </div>
              <span className="mt-2 text-[11px] font-mono-tech text-emerald-200/60">
                ChromaDB + PyMuPDF RAG
              </span>
            </div>

            {/* Row 3, Col 1: Frosted Glass Live Utilization Metric */}
            <div
              onClick={() => onNavigate('appointments')}
              className="glass-cell border-b border-r border-emerald-400/20 p-5 flex flex-col justify-between cursor-pointer group"
            >
              <span className="text-[11px] font-mono-tech text-emerald-300/60">
                DOCTOR SCHEDULES
              </span>
              <div className="flex items-baseline justify-between">
                <span className="font-mono-tech text-2xl font-bold text-white">
                  {metrics.slot_utilization_pct}%
                </span>
                <span className="text-[11px] font-mono-tech text-[#74f29c]">
                  0 Double-Bookings
                </span>
              </div>
            </div>

            {/* Row 3, Col 2: Frosted Glass Groq Inference Cell */}
            <div
              onClick={() => onNavigate('console')}
              className="glass-cell border-b border-emerald-400/20 p-5 flex flex-col justify-between cursor-pointer group"
            >
              <span className="text-[11px] font-mono-tech text-emerald-300/60">
                LLM INFERENCE
              </span>
              <div className="flex items-center justify-between">
                <span className="font-mono-tech text-xs sm:text-sm text-white">
                  Groq Llama 3.3 70B
                </span>
                <Cpu className="w-4 h-4 text-[#eef878]" />
              </div>
            </div>

            {/* Row 4, Col 1: Mint Laptop Icon (React Operations Dashboard) */}
            <div
              onClick={() => onNavigate('console')}
              className="glass-cell border-r border-emerald-400/20 p-6 flex flex-col items-center justify-center cursor-pointer group"
            >
              <div className="p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/25 group-hover:scale-110 transition-transform">
                <Laptop className="w-8 h-8 text-[#74f29c]" />
              </div>
              <span className="mt-2 text-[11px] font-mono-tech text-emerald-200/60">
                Operations Terminal [C]
              </span>
            </div>

            {/* Row 4, Col 2: Pending Human Approvals Quick Card */}
            <div
              onClick={() => onNavigate('approvals')}
              className="glass-cell p-5 flex flex-col justify-between cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono-tech text-amber-300/80">
                  APPROVAL GATE
                </span>
                <span className="keycap-dark">A</span>
              </div>
              <div className="font-mono-tech text-xs text-emerald-100/80 group-hover:text-white">
                {metrics.pending_human_approvals} Sensitive Ops Queued →
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          MULTI-AGENT ARCHITECTURE CARDS (4 Specialized Agents)
      ===================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-mono-tech text-lg sm:text-xl text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#74f29c]" />
              <span>Multi-Agent Architecture (LangGraph + Groq)</span>
            </h2>
            <p className="text-xs font-mono-tech text-emerald-200/60">
              Click any specialist agent below to open its interactive workspace
            </p>
          </div>
          <span className="glass-pill px-3 py-1 rounded-full text-xs font-mono-tech text-emerald-200">
            React Dashboard → FastAPI → n8n → AI Orchestrator → PostgreSQL →
            ChromaDB
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((ag) => {
            const Icon = ag.icon;
            return (
              <div
                key={ag.name}
                onClick={() => onNavigate(ag.targetTab)}
                className="glass-panel rounded-xl p-5 flex flex-col justify-between hover:border-emerald-300/45 transition-all cursor-pointer group"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono-tech px-2 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/25 text-emerald-300">
                      {ag.tag}
                    </span>
                    <span className="keycap-dark">{ag.shortcut}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-5 h-5 ${ag.accent}`} />
                    <h3 className="font-mono-tech font-semibold text-base text-white">
                      {ag.name}
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-100/70 leading-relaxed">
                    {ag.role}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-emerald-400/15 flex items-center justify-between text-xs font-mono-tech text-[#74f29c] group-hover:translate-x-0.5 transition-transform">
                  <span>Open Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

