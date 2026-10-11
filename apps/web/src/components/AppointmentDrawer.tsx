import { useEffect, useMemo, useState } from "react";
import { dateInputValue, dayBounds, fmtTime, MS_PER_MIN } from "../lib/format";
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
  capacity: number;
  color?: string;
}
export interface TypeOpt {
  id: string;
  name: string;
  color: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  employeeIds: string[];
  totalMin: number;
  segments: { position: number; kind: string; durationMin: number; label?: string | undefined }[];
}
export interface CustomerOpt {
  id: string;
  name: string;
  phone: string;
}

interface Props {
  mode: "create" | "edit";
  initial: { employeeId?: string; startAt?: number; appointment?: AppointmentRow };
  employees: EmployeeOpt[];
  types: TypeOpt[];
  customers: CustomerOpt[];
  onClose: () => void;
}

interface PlanRow {
  kind: "active" | "gap";
  durationMin: number;
  label: string;
}

/** The ordered plan the engine will resolve: buffers (as active) + segments. */
function resolvedRows(type: TypeOpt): PlanRow[] {
  const rows: PlanRow[] = [];
  if (type.bufferBeforeMin > 0) rows.push({ kind: "active", durationMin: type.bufferBeforeMin, label: "buffer" });
  for (const s of [...type.segments].sort((a, b) => a.position - b.position)) {
    rows.push({ kind: s.kind as "active" | "gap", durationMin: s.durationMin, label: s.label ?? s.kind });
  }
  if (type.bufferAfterMin > 0) rows.push({ kind: "active", durationMin: type.bufferAfterMin, label: "buffer" });
  return rows;
}

export function AppointmentDrawer({ mode, initial, employees, types, customers, onClose }: Props) {
  const utils = trpc.useUtils();
  const appt = initial.appointment;
  const [typeId, setTypeId] = useState(appt?.appointmentTypeId ?? types[0]?.id ?? "");
  const [customerId, setCustomerId] = useState(appt?.customerId ?? customers[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState(appt?.employeeId ?? initial.employeeId ?? employees[0]?.id ?? "");
  const initialStart = appt?.startAt ?? initial.startAt ?? Date.now();
  const [day, setDay] = useState(dateInputValue(initialStart));
  const [startAt, setStartAt] = useState(initialStart);
  const [notes, setNotes] = useState(appt?.notes ?? "");

  const [customerQuery, setCustomerQuery] = useState("");
  const [newCustomer, setNewCustomer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const selectedType = types.find((t) => t.id === typeId);
  const capableEmployees = useMemo(
    () =>
      !selectedType || selectedType.employeeIds.length === 0
        ? employees
        : employees.filter((e) => selectedType.employeeIds.includes(e.id)),
    [selectedType, employees],
  );

  // Keep the selected employee valid when the service changes.
  useEffect(() => {
    if (capableEmployees.length > 0 && !capableEmployees.some((e) => e.id === employeeId)) {
      setEmployeeId(capableEmployees[0]!.id);
    }
  }, [capableEmployees, employeeId]);

  // The engine decides which start times are bookable for this employee/day/type.
  const [from, to] = dayBounds(day);
  const availability = trpc.availability.query.useQuery(
    {
      employeeIds: employeeId ? [employeeId] : [],
      typeId,
      from,
      to,
      slotStepMin: 15,
      ...(appt ? { excludeAppointmentId: appt.id } : {}),
    },
    { enabled: Boolean(typeId && employeeId) },
  );
  const slots = useMemo(
    () => (availability.data ?? []).filter((s) => s.employeeId === employeeId),
    [availability.data, employeeId],
  );
  const slotKey = slots.map((s) => s.start).join(",");

  // Snap the chosen start onto a slot the engine actually allows.
  useEffect(() => {
    const starts = slotKey ? slotKey.split(",").map(Number) : [];
    if (starts.length > 0 && !starts.includes(startAt)) setStartAt(starts[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKey]);

  const createCustomer = trpc.customers.create.useMutation({
    onSuccess: (created) => {
      setCustomerId(created.id);
      setCustomerQuery(created.name);
      setNewCustomer(false);
      setNewName("");
      setNewPhone("");
      void utils.customers.list.invalidate();
    },
  });

  function refresh() {
    void utils.appointments.list.invalidate();
    void utils.reminders.list.invalidate();
    void utils.availability.query.invalidate();
  }

  const create = trpc.appointments.create.useMutation({ onSuccess: () => { refresh(); onClose(); } });
  const update = trpc.appointments.update.useMutation({ onSuccess: () => { refresh(); onClose(); } });

  const selectedSlot = slots.find((s) => s.start === startAt);

  function save() {
    if (!selectedSlot) return;
    if (mode === "create") {
      create.mutate({ customerId, employeeId, appointmentTypeId: typeId, startAt: selectedSlot.start, notes: notes || undefined });
    } else if (appt) {
      update.mutate({ appointmentId: appt.id, employeeId, startAt: selectedSlot.start, notes });
    }
  }

  const error = create.error ?? update.error;
  const endAt = selectedSlot && selectedType ? selectedSlot.start + selectedType.totalMin * 60_000 : null;

  const matches = customers.filter((c) => {
    const q = customerQuery.trim().toLowerCase();
    return q === "" || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  const planRows = selectedType ? resolvedRows(selectedType) : [];
  let cursor = startAt;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{mode === "create" ? "New appointment" : `Appointment — ${appt?.customerName}`}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="field">
          <label>Service</label>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} disabled={mode === "edit"}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.totalMin} min)
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Customer</label>
          <input
            value={customerQuery}
            placeholder="Search by name or phone…"
            onChange={(e) => setCustomerQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              {matches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.phone}
                </option>
              ))}
            </select>
          )}
          {matches.length === 0 && <span className="muted">No match — create the customer below.</span>}
          {!newCustomer && (
            <button onClick={() => setNewCustomer(true)} style={{ alignSelf: "flex-start" }}>
              + New customer
            </button>
          )}
          {newCustomer && (
            <div className="panel" style={{ margin: "6px 0 0" }}>
              <div className="grid2">
                <div className="field">
                  <label>Name</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div className="field">
                  <label>Phone (E.164)</label>
                  <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+48123123123" />
                </div>
              </div>
              {createCustomer.error && <p className="error">{createCustomer.error.message}</p>}
              <div className="row">
                <button
                  className="primary"
                  disabled={!newName || !newPhone || createCustomer.isPending}
                  onClick={() => createCustomer.mutate({ name: newName, phone: newPhone, smsOptOut: false })}
                >
                  Create customer
                </button>
                <button onClick={() => setNewCustomer(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="field">
          <label>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {capableEmployees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Date</label>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>

        <div className="field">
          <label>Start time (engine-checked availability)</label>
          <select
            value={selectedSlot ? String(startAt) : ""}
            onChange={(e) => setStartAt(Number(e.target.value))}
            disabled={slots.length === 0}
          >
            {slots.length === 0 ? (
              <option value="">{availability.isLoading ? "Checking availability…" : "No availability on this day"}</option>
            ) : (
              slots.map((s) => (
                <option key={s.start} value={s.start}>
                  {fmtTime(s.start)}
                </option>
              ))
            )}
          </select>
          {endAt !== null && (
            <span className="muted">
              {fmtTime(startAt)}–{fmtTime(endAt)} · {slots.length} slot{slots.length === 1 ? "" : "s"} free
            </span>
          )}
          {availability.isError && <span className="error">{availability.error.message}</span>}
        </div>

        {selectedType && selectedSlot && (
          <div className="field">
            <label>Resolved plan (the stylist is free during gaps)</label>
            <table>
              <tbody>
                {planRows.map((r, i) => {
                  const segStart = cursor;
                  const segEnd = cursor + r.durationMin * MS_PER_MIN;
                  cursor = segEnd;
                  return (
                    <tr key={i}>
                      <td>
                        <span className={r.kind === "gap" ? "badge gap" : "badge"}>{r.kind}</span>
                      </td>
                      <td>{r.label}</td>
                      <td className="muted">
                        {fmtTime(segStart)}–{fmtTime(segEnd)} · {r.durationMin}m
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="error">{error.message}</p>}

        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="primary"
            onClick={save}
            disabled={create.isPending || update.isPending || !customerId || !selectedSlot}
          >
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
