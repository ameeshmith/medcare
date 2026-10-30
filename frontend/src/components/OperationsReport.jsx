import React, { useEffect, useState } from 'react';
import {
  Activity,
  BellRing,
  Download,
  FileBarChart2,
  MailCheck,
  Play,
  Workflow,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { api } from '../api';

export default function OperationsReport({ overview, onRefresh }) {
  const [workflows, setWorkflows] = useState([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [triggeringReminders, setTriggeringReminders] = useState(false);
  const [toast, setToast] = useState(null);

  const report = overview?.latest_report;
  const n8nLogs = overview?.n8n_logs || [];
  const metrics = overview?.metrics || {};

  useEffect(() => {
    api
      .getN8nWorkflows()
      .then((res) => setWorkflows(res.workflows || []))
      .catch(console.error);
  }, []);

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setToast(null);
    try {
      await api.generateDailyReport();
      setToast(
        'Operations Agent synthesized a new Daily Executive Report & dispatched digest via n8n SMTP workflow!'
      );
      onRefresh?.();
    } catch (e) {
      setToast(`Error: ${e.message}`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleRunReminders = async () => {
    setTriggeringReminders(true);
    setToast(null);
    try {
      const res = await api.triggerN8nReminders();
      setToast(
        `n8n Schedule Trigger executed: Dispatched ${res.reminders_dispatched} automated SMTP appointment reminder(s)!`
      );
      onRefresh?.();
    } catch (e) {
      setToast(`Error: ${e.message}`);
    } finally {
      setTriggeringReminders(false);
    }
  };

  const handleDownloadWorkflow = (wf) => {
    const blob = new Blob([JSON.stringify(wf.raw_json, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = wf.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-12">
      {toast && (
        <div className="glass-panel rounded-xl p-4 border border-[#74f29c]/50 text-xs sm:text-sm font-mono-tech text-[#74f29c] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            TOTAL APPOINTMENTS
          </div>
          <div className="font-mono-tech text-2xl font-bold text-white mt-1">
            {metrics.total_appointments ?? 0}
          </div>
          <div className="text-[11px] font-mono-tech text-[#74f29c]">
            {metrics.confirmed ?? 0} Confirmed • {metrics.cancelled ?? 0}{' '}
            Cancelled
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            SLOT UTILIZATION
          </div>
          <div className="font-mono-tech text-2xl font-bold text-[#eef878] mt-1">
            {metrics.slot_utilization_pct ?? 68.5}%
          </div>
          <div className="text-[11px] font-mono-tech text-emerald-200/60">
            Across {metrics.doctors_on_duty ?? 4} On-Duty Doctors
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            PENDING APPROVALS
          </div>
          <div className="font-mono-tech text-2xl font-bold text-amber-300 mt-1">
            {metrics.pending_human_approvals ?? 0}
          </div>
          <div className="text-[11px] font-mono-tech text-emerald-200/60">
            Human-in-the-Loop Gate
          </div>
        </div>

        <div className="glass-panel rounded-xl p-4">
          <div className="text-[11px] font-mono-tech text-emerald-300/70">
            n8n + SMTP DISPATCHES
          </div>
          <div className="font-mono-tech text-2xl font-bold text-[#74f29c] mt-1">
            {metrics.n8n_executions ?? 0}
          </div>
          <div className="text-[11px] font-mono-tech text-emerald-200/60">
            Webhooks & Cron Triggers
          </div>
        </div>
      </div>

      {/* Main Split: Operations Agent Daily Report & n8n Automation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLUMNS: Operations Agent Daily Report & Bottlenecks */}
        <div className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-400/15 pb-3">
            <div>
              <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                <FileBarChart2 className="w-4 h-4 text-[#74f29c]" />
                <span>OPERATIONS AGENT — DAILY EXECUTIVE REPORT</span>
              </h2>
              <p className="text-xs font-mono-tech text-emerald-200/60">
                {report?.generated_by || 'Operations Agent (LangGraph)'} •{' '}
                {report?.report_date}
              </p>
            </div>
            <button
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="bg-white hover:bg-emerald-50 text-[#051109] font-mono-tech font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {generatingReport ? 'Synthesizing...' : 'Run Daily Report Now'}
              </span>
            </button>
          </div>

          {report && (
            <>
              <div className="glass-cell p-4 rounded-xl border border-emerald-400/25 text-xs sm:text-sm text-emerald-50/95 leading-relaxed">
                {report.executive_summary}
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-mono-tech text-emerald-300/80 uppercase">
                  Detected Operational Issues & Agent Recommendations
                </div>
                {(report.issues || []).map((iss, idx) => (
                  <div
                    key={idx}
                    className="glass-cell p-3.5 rounded-xl border border-emerald-400/20 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono-tech">
                      <span className="text-white font-semibold flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-[#eef878]" />
                        {iss.department}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          iss.severity === 'HIGH'
                            ? 'bg-rose-500/20 text-rose-300'
                            : iss.severity === 'MEDIUM'
                            ? 'bg-amber-400/20 text-amber-200'
                            : 'bg-emerald-400/15 text-[#74f29c]'
                        }`}
                      >
                        {iss.severity}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100/80">{iss.issue}</p>
                    <p className="text-[11px] font-mono-tech text-[#74f29c]">
                      → Action: {iss.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT 5 COLUMNS: n8n Workflow Orchestration & Exportable Blueprints */}
        <div className="lg:col-span-5 space-y-5">
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-400/15 pb-3">
              <div>
                <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-[#eef878]" />
                  <span>n8n AUTOMATION & SCHEDULE TRIGGERS</span>
                </h2>
                <p className="text-xs font-mono-tech text-emerald-200/60">
                  Trigger appointment reminders & download n8n JSONs
                </p>
              </div>
              <span className="keycap-dark">O</span>
            </div>

            <button
              onClick={handleRunReminders}
              disabled={triggeringReminders}
              className="w-full bg-[#74f29c] hover:bg-[#8ef7b0] text-[#051109] font-mono-tech font-bold py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <BellRing className="w-4 h-4" />
              <span>
                {triggeringReminders
                  ? 'Running n8n Schedule Trigger Batch...'
                  : 'Trigger n8n 24h Appointment Reminders (SMTP)'}
              </span>
            </button>

            <div className="space-y-2.5 pt-1">
              <div className="text-xs font-mono-tech text-emerald-300/80">
                EXPORTABLE n8n WORKFLOW BLUEPRINTS (/n8n/*.json)
              </div>
              {workflows.map((wf) => (
                <div
                  key={wf.filename}
                  className="glass-cell p-3 rounded-xl border border-emerald-400/20 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono-tech text-xs font-semibold text-white truncate">
                      {wf.name}
                    </div>
                    <button
                      onClick={() => handleDownloadWorkflow(wf)}
                      className="glass-pill px-2.5 py-1 rounded text-[11px] font-mono-tech text-[#74f29c] hover:text-white flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>JSON</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(wf.nodes || []).map((n, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 rounded bg-black/35 border border-emerald-400/15 text-[10px] font-mono-tech text-emerald-200/75"
                      >
                        {n.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* n8n + SMTP Execution Audit Log */}
      <div className="glass-panel rounded-xl p-6 space-y-3">
        <div className="flex items-center justify-between border-b border-emerald-400/15 pb-3">
          <h3 className="font-mono-tech text-sm font-semibold text-white flex items-center gap-2">
            <MailCheck className="w-4 h-4 text-[#74f29c]" />
            <span>n8n WEBHOOK, SCHEDULE & SMTP NOTIFICATION LOG</span>
          </h3>
          <span className="text-xs font-mono-tech text-emerald-200/60">
            Real-time execution telemetry
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono-tech">
            <thead>
              <tr className="border-b border-emerald-400/20 text-emerald-300/75">
                <th className="py-2 px-3">TIME</th>
                <th className="py-2 px-3">WORKFLOW</th>
                <th className="py-2 px-3">TRIGGER</th>
                <th className="py-2 px-3">RECIPIENT (SMTP)</th>
                <th className="py-2 px-3">SUBJECT</th>
                <th className="py-2 px-3">LATENCY</th>
                <th className="py-2 px-3">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-400/10">
              {n8nLogs.map((log) => (
                <tr key={log.id} className="hover:bg-white/5">
                  <td className="py-2.5 px-3 text-emerald-200/60">
                    {log.created_at}
                  </td>
                  <td className="py-2.5 px-3 text-white">{log.workflow_name}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-200 text-[10px]">
                      {log.trigger_type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-emerald-200/80">
                    {log.recipient_email}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-100/90 max-w-xs truncate">
                    {log.subject}
                  </td>
                  <td className="py-2.5 px-3 text-emerald-300">
                    {log.duration_ms}ms
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.status.includes('APPROVAL')
                          ? 'bg-amber-400/20 text-amber-300'
                          : 'bg-[#74f29c]/20 text-[#74f29c]'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

