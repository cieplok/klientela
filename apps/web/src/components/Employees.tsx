import { useEffect, useState } from "react";
import { WEEKDAY_NAMES, fmtDate, fmtTime, fromLocalInput, minutesToTimeInput, timeInputToMinutes } from "../lib/format";
import { trpc } from "../trpc";

const MON_FRI = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 }));

interface ScheduleWindow {
  weekday: number;
  startMin: number;
  endMin: number;
}

function windowSummary(schedule: ScheduleWindow[]): string {
  if (schedule.length === 0) return "—";
  return schedule
    .map((w) => `${WEEKDAY_NAMES[w.weekday]} ${minutesToTimeInput(w.startMin)}–${minutesToTimeInput(w.endMin)}`)
    .join(", ");
}

export function Employees() {
  const utils = trpc.useUtils();
  const list = trpc.employees.list.useQuery();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = trpc.employees.create.useMutation({
    onSuccess: () => {
      setName("");
      setCapacity(1);
      void utils.employees.list.invalidate();
    },
  });
  const update = trpc.employees.update.useMutation({ onSuccess: () => void utils.employees.list.invalidate() });

  return (
    <div>
      <div className="panel">
        <h2>Add employee</h2>
        <div className="grid2">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Capacity (clients at once)</label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
            />
          </div>
        </div>
        {create.error && <p className="error">{create.error.message}</p>}
        <p className="muted">New employees work Mon–Fri 09:00–17:00 by default. Open an employee to set real hours and time-off.</p>
        <button className="primary" disabled={!name || create.isPending} onClick={() => create.mutate({ name, capacity, schedule: MON_FRI })}>
          Add
        </button>
      </div>

      <div className="panel">
        <h2>Employees</h2>
        {list.isLoading && <p className="muted">Loading…</p>}
        {list.error && <p className="error">{list.error.message}</p>}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Capacity</th>
              <th>Working hours</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.capacity}</td>
                <td className="muted">{windowSummary(e.schedule)}</td>
                <td>{e.active ? "yes" : "no"}</td>
                <td>
                  <div className="row">
                    <button onClick={() => setEditingId(e.id)}>Edit</button>
                    <button onClick={() => update.mutate({ id: e.id, active: !e.active })}>
                      {e.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingId && <EmployeeEditor key={editingId} employeeId={editingId} onClose={() => setEditingId(null)} />}
    </div>
  );
}

function EmployeeEditor({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const detail = trpc.employees.get.useQuery({ id: employeeId });
  const now = Date.now();
  const timeOff = trpc.employees.listTimeOff.useQuery({
    employeeId,
    from: now - 86_400_000,
    to: now + 366 * 86_400_000,
  });

  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [color, setColor] = useState("#e0a3c0");
  const [schedule, setSchedule] = useState<ScheduleWindow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [offStart, setOffStart] = useState("");
  const [offEnd, setOffEnd] = useState("");
  const [offReason, setOffReason] = useState("");

  useEffect(() => {
    if (!detail.data || loaded) return;
    setName(detail.data.name);
    setCapacity(detail.data.capacity);
    setColor(detail.data.color);
    setSchedule(detail.data.schedule.map((s) => ({ weekday: s.weekday, startMin: s.startMin, endMin: s.endMin })));
    setLoaded(true);
  }, [detail.data, loaded]);

  const save = trpc.employees.update.useMutation({
    onSuccess: () => {
      void utils.employees.list.invalidate();
      void utils.employees.get.invalidate({ id: employeeId });
    },
  });
  const addOff = trpc.employees.addTimeOff.useMutation({
    onSuccess: () => {
      setOffStart("");
      setOffEnd("");
      setOffReason("");
      void utils.employees.listTimeOff.invalidate();
    },
  });
  const removeOff = trpc.employees.removeTimeOff.useMutation({
    onSuccess: () => void utils.employees.listTimeOff.invalidate(),
  });

  function setWindow(index: number, patch: Partial<ScheduleWindow>) {
    setSchedule((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  }

  const scheduleValid = schedule.every((w) => w.endMin > w.startMin);
  const canSave = loaded && name.trim().length > 0 && capacity >= 1 && scheduleValid;

  const offStartMs = offStart ? fromLocalInput(offStart) : null;
  const offEndMs = offEnd ? fromLocalInput(offEnd) : null;
  const canAddOff = offStartMs !== null && offEndMs !== null && offEndMs > offStartMs;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{loaded ? `Employee — ${name || "unnamed"}` : "Employee"}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {detail.isLoading && <p className="muted">Loading…</p>}
        {detail.error && <p className="error">{detail.error.message}</p>}

        {detail.data && (
          <>
            <div className="grid2">
              <div className="field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Capacity (clients at once)</label>
                <input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
            <div className="field">
              <label>Colour</label>
              <input
                type="color"
                value={color}
                style={{ width: 60, padding: 2 }}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Weekly working hours (add a window per shift; end must be after start)</label>
              {schedule.length === 0 && <p className="muted">No hours yet — this employee has no bookable time.</p>}
              {schedule.map((w, i) => (
                <div className="row" key={i} style={{ marginBottom: 6 }}>
                  <select
                    style={{ width: 100 }}
                    value={w.weekday}
                    onChange={(e) => setWindow(i, { weekday: Number(e.target.value) })}
                  >
                    {WEEKDAY_NAMES.map((day, idx) => (
                      <option key={day} value={idx}>
                        {day}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    style={{ width: 120 }}
                    value={minutesToTimeInput(w.startMin)}
                    onChange={(e) => setWindow(i, { startMin: timeInputToMinutes(e.target.value) })}
                  />
                  <input
                    type="time"
                    style={{ width: 120 }}
                    value={minutesToTimeInput(w.endMin)}
                    onChange={(e) => setWindow(i, { endMin: timeInputToMinutes(e.target.value) })}
                  />
                  <button onClick={() => setSchedule((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
              {!scheduleValid && <p className="error">Each window must end after it starts.</p>}
              <div className="row">
                <button onClick={() => setSchedule((prev) => [...prev, { weekday: 1, startMin: 9 * 60, endMin: 17 * 60 }])}>
                  + Add window
                </button>
                <button
                  onClick={() =>
                    setSchedule((prev) =>
                      [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 })).concat(prev),
                    )
                  }
                >
                  + Mon–Fri 09:00–17:00
                </button>
              </div>
            </div>

            {save.error && <p className="error">{save.error.message}</p>}
            <div className="row">
              <button
                className="primary"
                disabled={!canSave || save.isPending}
                onClick={() =>
                  save.mutate({
                    id: employeeId,
                    name: name.trim(),
                    capacity,
                    color,
                    schedule: [...schedule].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin),
                  })
                }
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
              {save.isSuccess && <span className="muted">Saved.</span>}
            </div>

            <h2 style={{ marginTop: 22 }}>Time-off</h2>
            <p className="muted">Bookings will not be offered while this employee is away.</p>
            {timeOff.isLoading && <p className="muted">Loading…</p>}
            {(timeOff.data ?? []).length === 0 && <p className="muted">No upcoming time-off.</p>}
            <table>
              <tbody>
                {(timeOff.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td className="muted">
                      {fmtDate(t.startAt)} {fmtTime(t.startAt)} – {fmtDate(t.endAt)} {fmtTime(t.endAt)}
                    </td>
                    <td>{t.reason ?? ""}</td>
                    <td>
                      <button className="danger" onClick={() => removeOff.mutate({ id: t.id })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="field">
                <label>From</label>
                <input
                  type="datetime-local"
                  value={offStart}
                  onChange={(e) => {
                    setOffStart(e.target.value);
                    if (!offEnd) setOffEnd(e.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label>To</label>
                <input type="datetime-local" value={offEnd} onChange={(e) => setOffEnd(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Reason (optional)</label>
              <input value={offReason} onChange={(e) => setOffReason(e.target.value)} placeholder="Holiday" />
            </div>
            {offStartMs !== null && offEndMs !== null && offEndMs <= offStartMs && (
              <p className="error">The end must be after the start.</p>
            )}
            {addOff.error && <p className="error">{addOff.error.message}</p>}
            <button
              disabled={!canAddOff || addOff.isPending}
              onClick={() =>
                addOff.mutate({
                  employeeId,
                  startAt: offStartMs!,
                  endAt: offEndMs!,
                  reason: offReason.trim() || undefined,
                })
              }
            >
              {addOff.isPending ? "Adding…" : "Add time-off"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
