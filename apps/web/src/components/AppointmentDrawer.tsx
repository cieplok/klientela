import { useState } from "react";
import { fromLocalInput, toLocalInput } from "../lib/format";
import { trpc } from "../trpc";

export interface AppointmentRow {
  id: string;
  startAt: number;
  endAt: number;
  status: string;
  notes: string | null;
  planJson: string;
  employeeId: string;
  employeeName: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  appointmentTypeId: string;
  typeName: string;
  typeColor: string;
}

export interface EmployeeOpt {
  id: string;
  name: string;
  active: boolean;
}
export interface TypeOpt {
  id: string;
  name: string;
  color: string;
  employeeIds: string[];
  totalMin: number;
  segments: { position: number; kind: string; durationMin: number; label?: string | undefined }[];
}
export interface CustomerOpt {
  id: string;
  name: string;
}

interface Props {
  mode: "create" | "edit";
  initial: { employeeId?: string; startAt?: number; appointment?: AppointmentRow };
  employees: EmployeeOpt[];
  types: TypeOpt[];
  customers: CustomerOpt[];
  onClose: () => void;
}

export function AppointmentDrawer({ mode, initial, employees, types, customers, onClose }: Props) {
  const utils = trpc.useUtils();
  const appt = initial.appointment;
  const [typeId, setTypeId] = useState(appt?.appointmentTypeId ?? types[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(appt?.customerId ?? customers[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState(appt?.employeeId ?? initial.employeeId ?? employees[0]?.id ?? "");
  const [start, setStart] = useState(toLocalInput(appt?.startAt ?? initial.startAt ?? Date.now()));
  const [notes, setNotes] = useState(appt?.notes ?? "");

  const selectedType = types.find((t) => t.id === typeId);
  const capable = (t: TypeOpt | undefined) =>
    !t || t.employeeIds.length === 0 ? employees : employees.filter((e) => t.employeeIds.includes(e.id));

  function refresh() {
    void utils.appointments.list.invalidate();
    void utils.reminders.list.invalidate();
    void utils.availability.query.invalidate();
  }

  const create = trpc.appointments.create.useMutation({ onSuccess: () => { refresh(); onClose(); } });
  const update = trpc.appointments.update.useMutation({ onSuccess: () => { refresh(); onClose(); } });

  function save() {
    const startAt = fromLocalInput(start);
    if (mode === "create") {
      create.mutate({ customerId, employeeId, appointmentTypeId: typeId, startAt, notes: notes || undefined });
    } else if (appt) {
      update.mutate({ appointmentId: appt.id, employeeId, startAt, notes });
    }
  }

  const error = create.error ?? update.error;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{mode === "create" ? "New appointment" : `Appointment — ${appt?.customerName}`}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="field">
          <label>Service</label>
          <select value={typeId} onChange={(e) => { setTypeId(e.target.value); }} disabled={mode === "edit"}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.totalMin} min)
              </option>
            ))}
          </select>
        </div>

        {selectedType && (
          <div>
            <div className="plan-preview">
              {selectedType.segments.map((s) => (
                <div
                  key={s.position}
                  className={`seg ${s.kind}`}
                  title={`${s.label ?? s.kind} — ${s.durationMin} min`}
                  style={{ width: `${s.durationMin * 3}px` }}
                />
              ))}
            </div>
            <p className="muted">
              {selectedType.segments.filter((s) => s.kind === "gap").length > 0
                ? "Amber = processing gap, the stylist is free for another client."
                : "No processing gaps in this service."}
            </p>
          </div>
        )}

        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {capable(selectedType).map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Start</label>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="error">{error.message}</p>}

        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={save} disabled={create.isPending || update.isPending || !customerId}>
            {mode === "create" ? "Book" : "Save"}
          </button>
          {mode === "edit" && appt && (
            <>
              <button onClick={() => update.mutate({ appointmentId: appt.id, status: "completed" })}>Completed</button>
              <button onClick={() => update.mutate({ appointmentId: appt.id, status: "no_show" })}>No-show</button>
              <button className="danger" onClick={() => update.mutate({ appointmentId: appt.id, status: "cancelled" })}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
