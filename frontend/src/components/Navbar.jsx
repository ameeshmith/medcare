import React from 'react';
import {
  Database,
  KeyRound,
  ShieldAlert,
  Sparkles,
  Terminal,
  Calendar,
  BookOpen,
  Activity,
} from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  overview,
  onOpenGroqModal,
}) {
  const pendingApprovals = overview?.metrics?.pending_human_approvals || 0;
  const groqConfigured = overview?.system?.groq_configured;

  const navItems = [
    { id: 'landing', label: 'Hero Grid', key: 'L' },
    { id: 'console', label: 'Agents', key: 'C', icon: Terminal },
    { id: 'appointments', label: 'Schedules', key: 'B', icon: Calendar },
    { id: 'rag', label: 'RAG Docs', key: 'R', icon: BookOpen },
    {
      id: 'approvals',
      label: 'Approvals',
      key: 'A',
      icon: ShieldAlert,
      badge: pendingApprovals,
    },
    { id: 'operations', label: 'Ops & n8n', key: 'O', icon: Activity },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#040e07]/75 backdrop-blur-2xl border-b border-emerald-400/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo (LocalCan style) */}
        <button
          onClick={() => setActiveTab('landing')}
          className="flex items-center gap-2.5 group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg glass-pill flex items-center justify-center border border-emerald-300/30 group-hover:border-[#74f29c] transition-colors">
            <Database className="w-4 h-4 text-[#74f29c]" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono-tech font-bold text-lg tracking-tight text-white">
              MedGrid
            </span>
            <span className="text-[10px] font-mono-tech text-emerald-300/70 -translate-y-2">
              TM
            </span>
          </div>
          <span className="hidden xl:inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full text-[11px] font-mono-tech bg-emerald-500/10 border border-emerald-400/25 text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-[#74f29c] animate-pulse" />
            LangGraph + n8n
          </span>
        </button>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono-tech transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-400/20 text-white border border-emerald-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
                    : 'text-emerald-100/70 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40">
                    {item.badge}
                  </span>
                )}
                <span className="keycap-dark">{item.key}</span>
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Groq Key + LocalCan White CTA Button */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenGroqModal}
            className="glass-pill px-3 py-1.5 rounded-lg text-xs font-mono-tech flex items-center gap-2 hover:border-emerald-300/50 transition-all cursor-pointer"
            title="Configure Groq API Key (Llama 3.3 70B)"
          >
            <KeyRound
              className={`w-3.5 h-3.5 ${
                groqConfigured ? 'text-[#74f29c]' : 'text-amber-300'
              }`}
            />
            <span className="hidden sm:inline text-emerald-100/90">
              {groqConfigured ? 'Llama 3.3 70B Live' : 'Groq Key'}
            </span>
          </button>

          <button
            onClick={() =>
              setActiveTab(activeTab === 'console' ? 'appointments' : 'console')
            }
            className="bg-white/95 hover:bg-white text-[#051109] font-semibold text-xs sm:text-sm px-3.5 py-1.5 rounded-lg shadow-[0_0_25px_rgba(255,255,255,0.25)] flex items-center gap-2 transition-all cursor-pointer"
          >
            <span>
              {activeTab === 'console' ? 'Open Schedules' : 'Start Building'}
            </span>
            <span className="keycap-light">S</span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center overflow-x-auto px-4 py-2 gap-1.5 border-t border-emerald-400/15 bg-[#051109]/80">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`px-2.5 py-1 rounded text-[11px] font-mono-tech whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === item.id
                ? 'bg-emerald-400/20 text-white border border-emerald-300/40'
                : 'text-emerald-200/70'
            }`}
          >
            <span>{item.label}</span>
            {item.badge > 0 && (
              <span className="px-1 rounded bg-amber-400/30 text-amber-200 text-[10px]">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </header>
  );
}

