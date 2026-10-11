import { useMemo, useState } from "react";
import { MS_PER_MIN, addDays, fmtDate, fmtTime, startOfDay } from "../lib/format";
import { trpc } from "../trpc";
import { AppointmentDrawer, type AppointmentRow, type CustomerOpt, type EmployeeOpt, type TypeOpt } from "./AppointmentDrawer";

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 20;
const HOUR_MS = 60 * MS_PER_MIN;

interface DrawerState {
  mode: "create" | "edit";
  employeeId?: string;
  startAt?: number;
  appointment?: AppointmentRow;
}

function blockStyle(start: number, end: number, gridStart: number, total: number) {
  const left = ((start - gridStart) / total) * 100;
  const width = ((end - start) / total) * 100;
  return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` };
}

function gapSegments(planJson: string): { kind: string; startOffsetMs: number; endOffsetMs: number }[] {
  try {
    return JSON.parse(planJson).intervals as { kind: string; startOffsetMs: number; endOffsetMs: number }[];
  } catch {
    return [];
  }
}

export function Calendar() {
  const [date, setDate] = useState(() => startOfDay(Date.now()));
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const employees = trpc.employees.list.useQuery();
  const types = trpc.appointmentTypes.list.useQuery();
  const customers = trpc.customers.list.useQuery();
  const dayEnd = addDays(date, 1);
  const appts = trpc.appointments.list.useQuery({ from: date, to: dayEnd });

  const gridStart = date + GRID_START_HOUR * HOUR_MS;
  const gridEnd = date + GRID_END_HOUR * HOUR_MS;
  const total = gridEnd - gridStart;
  const hours = useMemo(
    () => Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i),
    [],
  );

  const rows = (employees.data ?? []).filter((e) => e.active);
  const list = (appts.data ?? []) as AppointmentRow[];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="row">
          <button onClick={() => setDate(addDays(date, -1))}>‹ Prev</button>
          <button onClick={() => setDate(startOfDay(Date.now()))}>Today</button>
          <button onClick={() => setDate(addDays(date, 1))}>Next ›</button>
        </div>
        <strong>{fmtDate(date)}</strong>
        <button
          className="primary"
          onClick={() => setDrawer({ mode: "create", employeeId: rows[0]?.id, startAt: date + 10 * HOUR_MS })}
          disabled={rows.length === 0}
        >
          + New appointment
        </button>
      </div>

      {appts.isLoading && <p className="muted">Loading…</p>}
      {appts.error && <p className="error">{appts.error.message}</p>}
      {rows.length === 0 && <p className="muted">Add an employee to start booking.</p>}

      {rows.length > 0 && (
        <div className="cal-scroll">
          <div className="cal">
            <div className="cal-head">
              <div className="name-col">Employee</div>
              <div className="hours">
                {hours.map((h) => (
                  <span key={h}>{String(h).padStart(2, "0")}:00</span>
                ))}
              </div>
            </div>
            {rows.map((emp: EmployeeOpt) => (
              <div className="cal-row" key={emp.id}>
                <div className="name-col">
                  <strong>{emp.name}</strong>
                </div>
                <div className="track">
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="cell"
                      style={{ left: `${(i / hours.length) * 100}%`, width: `${100 / hours.length}%` }}
                      onClick={() => setDrawer({ mode: "create", employeeId: emp.id, startAt: gridStart + i * HOUR_MS })}
                    />
                  ))}
                  {list
                    .filter((a) => a.employeeId === emp.id && a.status !== "cancelled")
                    .map((a) => {
                      const start = Math.max(a.startAt, gridStart);
                      const end = Math.min(a.endAt, gridEnd);
                      if (end <= gridStart || start >= gridEnd || end <= start) return null;
                      const segs = gapSegments(a.planJson).filter((s) => s.kind === "gap" && end > start);
                      const span = a.endAt - a.startAt;
                      return (
                        <div
                          key={a.id}
                          className="appt"
                          style={{ ...blockStyle(start, end, gridStart, total), background: a.typeColor }}
                          title={`${a.customerName} — ${a.typeName}`}
                          onClick={() => setDrawer({ mode: "edit", appointment: a })}
                        >
                          {segs.map((s, idx) => (
                            <div
                              key={idx}
                              className="gap-seg"
                              style={{
                                left: `${(s.startOffsetMs / span) * 100}%`,
                                width: `${((s.endOffsetMs - s.startOffsetMs) / span) * 100}%`,
                              }}
                            />
                          ))}
                          <div className="label">
                            {a.customerName}
                            {a.status === "no_show" ? " (no-show)" : ""}
                          </div>
                          <div className="sub">
                            {fmtTime(a.startAt)} · {a.typeName}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {drawer && (
        <AppointmentDrawer
          mode={drawer.mode}
          initial={{ employeeId: drawer.employeeId, startAt: drawer.startAt, appointment: drawer.appointment }}
          employees={(employees.data ?? []) as EmployeeOpt[]}
          types={(types.data ?? []) as unknown as TypeOpt[]}
          customers={(customers.data ?? []) as CustomerOpt[]}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
