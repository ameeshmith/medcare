import React, { useState } from 'react';
import {
  CalendarPlus,
  Clock,
  Stethoscope,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  XCircle,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api';

export default function AppointmentsView({
  overview,
  onRefresh,
  onNavigateApprovals,
}) {
  const doctors = overview?.doctors || [];
  const appointments = overview?.appointments || [];
  const todayStr =
    doctors[0]?.slots?.[0]?.date || new Date().toISOString().slice(0, 10);

  const [selectedDoctorId, setSelectedDoctorId] = useState(
    doctors[0]?.id || 1
  );
  const [patientName, setPatientName] = useState('Maya Lin-Kovacs');
  const [patientEmail, setPatientEmail] = useState('maya.kovacs@example.com');
  const [appointmentDate, setAppointmentDate] = useState(todayStr);
  const [slotTime, setSlotTime] = useState('15:00');
  const [priority, setPriority] = useState('ROUTINE');
  const [reason, setReason] = useState(
    'Follow-up diagnostic consultation & lab review'
  );

  const [banner, setBanner] = useState(null);
  const [conflictSuggestions, setConflictSuggestions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleBook = async (e) => {
    e?.preventDefault();
    setSubmitting(true);
    setBanner(null);
    setConflictSuggestions([]);
    try {
      const res = await api.bookAppointment({
        patient_name: patientName,
        patient_email: patientEmail,
        doctor_id: Number(selectedDoctorId),
        appointment_date: appointmentDate,
        slot_time: slotTime,
        reason,
        priority,
      });
      setBanner({
        type: res.requires_approval ? 'warning' : 'success',
        text: res.requires_approval
          ? `Critical booking ${res.appointment_code} created & routed to Human Approval Queue (${res.approval_code}).`
          : `Appointment ${res.appointment_code} confirmed & n8n confirmation email dispatched!`,
      });
      onRefresh?.();
    } catch (err) {
      const suggestions = err.detail?.suggested_slots || [];
      setConflictSuggestions(suggestions);
      setBanner({
        type: 'error',
        text:
          err.detail?.message ||
          err.message ||
          'Scheduling conflict detected.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickReschedule = async (apt) => {
    const newSlot = apt.slot_time === '15:00' ? '16:00' : '15:00';
    try {
      const res = await api.rescheduleAppointment(apt.id, {
        new_date: apt.appointment_date,
        new_slot_time: newSlot,
      });
      setBanner({
        type: 'success',
        text: `Rescheduled ${res.appointment_code} to ${res.new_slot} (old slot freed in PostgreSQL).`,
      });
      onRefresh?.();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  const handleCancel = async (apt) => {
    try {
      const res = await api.cancelAppointment(apt.id, {
        reason: 'Operator requested cancellation from dashboard',
        force_approval: true,
      });
      setBanner({
        type: 'warning',
        text: res.message || `Cancellation queued (${res.approval_code}).`,
      });
      onRefresh?.();
    } catch (err) {
      setBanner({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Status / Conflict Notification Banner */}
      {banner && (
        <div
          className={`glass-panel rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3 ${
            banner.type === 'error'
              ? 'border-rose-400/50 bg-rose-950/30 text-rose-100'
              : banner.type === 'warning'
              ? 'border-amber-400/50 bg-amber-950/30 text-amber-100'
              : 'border-[#74f29c]/50 bg-emerald-950/40 text-emerald-100'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-mono-tech">
            {banner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#74f29c] shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>

          {conflictSuggestions.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono-tech text-emerald-200">
                Suggested Open Slots:
              </span>
              {conflictSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSlotTime(s);
                    setBanner(null);
                  }}
                  className="px-2.5 py-1 rounded bg-[#74f29c] text-[#051109] font-mono-tech font-bold text-xs cursor-pointer"
                >
                  Use {s}
                </button>
              ))}
            </div>
          )}

          {banner.type === 'warning' && (
            <button
              onClick={onNavigateApprovals}
              className="px-3 py-1 rounded bg-amber-300 text-[#051109] font-mono-tech font-bold text-xs cursor-pointer"
            >
              Review in Approvals [A] →
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 5 COLUMNS: Book Appointment Form (Appointment + Scheduling Agent) */}
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 space-y-4">
          <div className="border-b border-emerald-400/15 pb-3 flex items-center justify-between">
            <div>
              <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-[#74f29c]" />
                <span>BOOK APPOINTMENT</span>
              </h2>
              <p className="text-xs font-mono-tech text-emerald-200/60">
                Protected by Scheduling Agent conflict detection
              </p>
            </div>
            <span className="keycap-dark">B</span>
          </div>

          <form onSubmit={handleBook} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-mono-tech text-emerald-200/75 mb-1">
                  Patient Full Name
                </label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#74f29c]"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-emerald-200/75 mb-1">
                  Patient Email (n8n SMTP)
                </label>
                <input
                  type="email"
                  required
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#74f29c]"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono-tech text-emerald-200/75 mb-1">
                Attending Physician & Department
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => setSelectedDoctorId(Number(e.target.value))}
                className="w-full glass-pill px-3 py-2 rounded-lg text-white bg-[#071a0e] focus:outline-none focus:border-[#74f29c]"
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#071a0e]">
                    {d.full_name} — {d.department} ({d.room_number})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-mono-tech text-emerald-200/75 mb-1">
                  Date
                </label>
                <input
                  type="text"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white font-mono-tech"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-emerald-200/75 mb-1">
                  Time Slot
                </label>
                <select
                  value={slotTime}
                  onChange={(e) => setSlotTime(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white bg-[#071a0e] font-mono-tech"
                >
                  {[
                    '09:00',
                    '10:00',
                    '11:00',
                    '12:00',
                    '14:00',
                    '15:00',
                    '16:00',
                  ].map((t) => (
                    <option key={t} value={t} className="bg-[#071a0e]">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-mono-tech text-emerald-200/75 mb-1">
                  Triage Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full glass-pill px-3 py-2 rounded-lg text-white bg-[#071a0e] font-mono-tech"
                >
                  <option value="ROUTINE" className="bg-[#071a0e]">
                    ROUTINE
                  </option>
                  <option value="URGENT" className="bg-[#071a0e]">
                    URGENT
                  </option>
                  <option value="CRITICAL" className="bg-[#071a0e]">
                    CRITICAL (Approval)
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-mono-tech text-emerald-200/75 mb-1">
                Clinical Reason / Notes
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full glass-pill px-3 py-2 rounded-lg text-white focus:outline-none focus:border-[#74f29c]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-white hover:bg-emerald-50 text-[#051109] font-semibold py-2.5 rounded-lg text-xs sm:text-sm font-mono-tech shadow-[0_0_25px_rgba(255,255,255,0.2)] cursor-pointer transition-all"
            >
              {submitting
                ? 'Verifying Slot with Scheduling Agent...'
                : 'Verify Availability & Commit Booking'}
            </button>
          </form>
        </div>

        {/* RIGHT 7 COLUMNS: Doctor Availability & Double-Booking Prevention Matrix */}
        <div className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-4">
          <div className="border-b border-emerald-400/15 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-mono-tech text-base font-semibold text-white flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-[#74f29c]" />
                <span>DOCTOR AVAILABILITY MATRIX ({todayStr})</span>
              </h2>
              <p className="text-xs font-mono-tech text-emerald-200/60">
                Click any green slot to pre-fill booking; click booked/blocked
                slot to test conflict prevention
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono-tech">
              <span className="flex items-center gap-1 text-[#74f29c]">
                <span className="w-2 h-2 rounded-full bg-[#74f29c]" /> Open
              </span>
              <span className="flex items-center gap-1 text-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Booked
              </span>
              <span className="flex items-center gap-1 text-rose-300">
                <span className="w-2 h-2 rounded-full bg-rose-400" /> Blocked
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {doctors.map((doc) => {
              const todaySlots = (doc.slots || []).filter(
                (s) => s.date === todayStr
              );
              return (
                <div
                  key={doc.id}
                  className="glass-cell rounded-xl p-3.5 border border-emerald-400/20 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono-tech font-semibold text-sm text-white">
                        {doc.full_name}
                      </span>
                      <span className="ml-2 text-xs font-mono-tech text-[#74f29c]">
                        {doc.department}
                      </span>
                      <span className="ml-2 text-[11px] text-emerald-200/50">
                        • {doc.room_number}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono-tech px-2 py-0.5 rounded bg-emerald-400/10 border border-emerald-400/25 text-emerald-200">
                      {doc.shift_hours}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                    {todaySlots.map((slot) => {
                      const isSelected =
                        Number(selectedDoctorId) === doc.id &&
                        slotTime === slot.time;
                      return (
                        <button
                          key={slot.id}
                          onClick={() => {
                            setSelectedDoctorId(doc.id);
                            setAppointmentDate(slot.date);
                            setSlotTime(slot.time);
                          }}
                          className={`py-1.5 px-2 rounded-lg font-mono-tech text-xs border transition-all cursor-pointer ${
                            slot.is_blocked
                              ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                              : slot.is_booked
                              ? 'bg-amber-400/15 border-amber-400/40 text-amber-200'
                              : isSelected
                              ? 'bg-[#74f29c] text-[#051109] font-bold border-white'
                              : 'bg-emerald-500/10 border-emerald-400/30 text-[#74f29c] hover:bg-emerald-400/25'
                          }`}
                          title={
                            slot.is_blocked
                              ? slot.block_reason
                              : slot.is_booked
                              ? 'Booked (click to test conflict handler)'
                              : 'Available Slot'
                          }
                        >
                          <div>{slot.time}</div>
                          <div className="text-[9px] opacity-80">
                            {slot.is_blocked
                              ? 'BLOCKED'
                              : slot.is_booked
                              ? 'BOOKED'
                              : 'OPEN'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ACTIVE APPOINTMENTS TABLE (Reschedule & Cancel Controls) */}
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-emerald-400/15 pb-3">
          <div>
            <h3 className="font-mono-tech text-base font-semibold text-white">
              POSTGRESQL APPOINTMENTS REGISTRY ({appointments.length})
            </h3>
            <p className="text-xs font-mono-tech text-emerald-200/60">
              Live appointments with 1-click Reschedule and Human-Approved
              Cancellation
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-emerald-400/20 font-mono-tech text-emerald-300/75">
                <th className="py-2.5 px-3">CODE</th>
                <th className="py-2.5 px-3">PATIENT</th>
                <th className="py-2.5 px-3">DOCTOR / DEPT</th>
                <th className="py-2.5 px-3">SLOT</th>
                <th className="py-2.5 px-3">PRIORITY</th>
                <th className="py-2.5 px-3">STATUS</th>
                <th className="py-2.5 px-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-400/10">
              {appointments.map((apt) => (
                <tr key={apt.id} className="hover:bg-white/5 transition-colors">
                  <td className="py-3 px-3 font-mono-tech font-semibold text-[#74f29c]">
                    {apt.code}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-medium text-white">
                      {apt.patient_name}
                    </div>
                    <div className="text-[11px] text-emerald-200/50">
                      {apt.patient_email}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-white">{apt.doctor_name}</div>
                    <div className="text-[11px] font-mono-tech text-emerald-300/70">
                      {apt.department}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono-tech text-white">
                    {apt.appointment_date} • {apt.slot_time}
                  </td>
                  <td className="py-3 px-3 font-mono-tech">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        apt.priority === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                          : apt.priority === 'URGENT'
                          ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                          : 'bg-emerald-400/15 text-emerald-200'
                      }`}
                    >
                      {apt.priority}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-mono-tech">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${
                        apt.status === 'CONFIRMED'
                          ? 'bg-[#74f29c]/20 text-[#74f29c] border border-[#74f29c]/40'
                          : apt.status === 'PENDING_APPROVAL'
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                          : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {apt.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                    {apt.status !== 'CANCELLED' && (
                      <>
                        <button
                          onClick={() => handleQuickReschedule(apt)}
                          className="glass-pill px-2.5 py-1 rounded text-[11px] font-mono-tech text-emerald-200 hover:text-white cursor-pointer inline-flex items-center gap-1"
                          title="Reschedule to next open afternoon slot"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reschedule</span>
                        </button>
                        <button
                          onClick={() => handleCancel(apt)}
                          className="px-2.5 py-1 rounded text-[11px] font-mono-tech bg-rose-500/15 border border-rose-400/35 text-rose-200 hover:bg-rose-500/30 cursor-pointer inline-flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}
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

