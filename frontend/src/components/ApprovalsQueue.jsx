import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
} from 'lucide-react';
import { api } from '../api';

export default function ApprovalsQueue({ overview, onRefresh }) {
  const approvals = overview?.approvals || [];
  const [notesMap, setNotesMap] = useState({});
  const [resolvingId, setResolvingId] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const handleResolve = async (apr, decision) => {
    setResolvingId(apr.id);
    setFeedback(null);
    try {
      const note =
        notesMap[apr.id] ||
        (decision === 'APPROVED'
          ? 'Approved by On-Duty Clinical Supervisor'
          : 'Rejected by Supervisor: preserve existing schedule');
      const res = await api.resolveApproval(apr.id, decision, note);
      setFeedback(
        `Ticket ${res.approval_code} marked ${res.decision}. PostgreSQL appointment status updated to ${res.appointment_status || 'RESOLVED'} & n8n notification sent.`
      );
      onRefresh?.();
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  const pendingList = approvals.filter((a) => a.status === 'PENDING');
  const resolvedList = approvals.filter((a) => a.status !== 'PENDING');

  return (
    <div className="space-y-6 pb-12">
      <div className="glass-panel rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-mono-tech text-lg font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-300" />
            <span>HUMAN-IN-THE-LOOP APPROVAL GATE</span>
          </h2>
          <p className="text-xs font-mono-tech text-emerald-200/65">
            Sensitive agent operations (critical triage overrides, urgent
            cancellations) pause here until approved by a human supervisor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="glass-pill px-3 py-1.5 rounded-lg text-xs font-mono-tech text-amber-200">
            {pendingList.length} Pending Review
          </span>
          <span className="keycap-dark">A</span>
        </div>
      </div>

      {feedback && (
        <div className="glass-panel rounded-xl p-4 border border-[#74f29c]/50 text-xs sm:text-sm font-mono-tech text-[#74f29c] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Pending Approvals Grid */}
      <div className="space-y-4">
        <h3 className="font-mono-tech text-xs text-emerald-300/80 uppercase">
          Awaiting Supervisor Action ({pendingList.length})
        </h3>

        {pendingList.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center font-mono-tech text-sm text-emerald-200/70">
            All sensitive agent operations have been reviewed and cleared!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingList.map((apr) => (
              <div
                key={apr.id}
                className="glass-panel rounded-xl p-5 border border-amber-400/35 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono-tech font-bold text-sm text-amber-300">
                      {apr.code} • {apr.operation_type}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono-tech font-bold ${
                        apr.risk_level === 'CRITICAL'
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-400/40'
                          : 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                      }`}
                    >
                      RISK: {apr.risk_level}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-white leading-relaxed">
                    {apr.summary}
                  </p>

                  <div className="p-3 rounded-lg bg-black/35 border border-emerald-400/15 font-mono-tech text-[11px] text-emerald-200/80 space-y-1">
                    <div>
                      <span className="text-emerald-400/70">Origin Agent:</span>{' '}
                      {apr.agent_name}
                    </div>
                    {Object.entries(apr.payload || {}).map(([k, v]) => (
                      <div key={k} className="truncate">
                        <span className="text-emerald-400/70">{k}:</span>{' '}
                        {String(v)}
                      </div>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={notesMap[apr.id] || ''}
                    onChange={(e) =>
                      setNotesMap((prev) => ({
                        ...prev,
                        [apr.id]: e.target.value,
                      }))
                    }
                    placeholder="Optional supervisor audit note..."
                    className="w-full glass-pill px-3 py-2 rounded-lg text-xs text-white placeholder:text-emerald-200/40 focus:outline-none focus:border-[#74f29c]"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    disabled={resolvingId === apr.id}
                    onClick={() => handleResolve(apr, 'APPROVED')}
                    className="flex-1 bg-[#74f29c] hover:bg-[#8ef7b0] text-[#051109] font-mono-tech font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve & Commit</span>
                  </button>
                  <button
                    disabled={resolvingId === apr.id}
                    onClick={() => handleResolve(apr, 'REJECTED')}
                    className="flex-1 bg-rose-500/20 hover:bg-rose-500/35 text-rose-200 border border-rose-400/40 font-mono-tech font-semibold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>Reject Operation</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit History of Resolved Approvals */}
      {resolvedList.length > 0 && (
        <div className="glass-panel rounded-xl p-5 space-y-3">
          <h3 className="font-mono-tech text-xs text-emerald-300/80 uppercase">
            Resolved Approval History ({resolvedList.length})
          </h3>
          <div className="space-y-2">
            {resolvedList.map((apr) => (
              <div
                key={apr.id}
                className="glass-cell p-3 rounded-lg border border-emerald-400/15 flex flex-wrap items-center justify-between gap-2 text-xs font-mono-tech"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#74f29c]" />
                  <span className="text-white font-semibold">{apr.code}</span>
                  <span className="text-emerald-200/70">{apr.summary}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-200/60">
                    {apr.reviewer_note}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      apr.status === 'APPROVED'
                        ? 'bg-[#74f29c]/20 text-[#74f29c]'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {apr.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

