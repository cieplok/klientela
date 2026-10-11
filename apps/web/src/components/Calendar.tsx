import { useMemo, useState } from "react";
import { MS_PER_MIN, addDays, fmtDate, fmtTime, startOfDay } from "../lib/format";
import { trpc } from "../trpc";
import { AppointmentDrawer, type AppointmentRow, type CustomerOpt, type EmployeeOpt, type TypeOpt } from "./AppointmentDrawer";

const GRID_START_HOUR = 8;
const GRID_END_HOUR = 20;
const HOUR_MS = 60 * MS_PER_MIN;
const DAY_MS = 24 * 60 * MS_PER_MIN;
const SAMPLE_MS = 15 * MS_PER_MIN;

interface DrawerState {
  mode: "create" | "edit";
  employeeId?: string;
  startAt?: number;
  appointment?: AppointmentRow;
}

interface PlanInterval {
  kind: string;
  startOffsetMs: number;
  endOffsetMs: number;
}

function parseIntervals(planJson: string): PlanInterval[] {
  try {
    return (JSON.parse(planJson).intervals ?? []) as PlanInterval[];
  } catch {
    return [];
  }
}

/** Peak number of simultaneous *active* segments for one employee across a day. */
function peakActive(list: AppointmentRow[], employeeId: string, dayStart: number): number {
  const active = list
    .filter((a) => a.employeeId === employeeId && a.status !== "cancelled")
    .flatMap((a) =>
      parseIntervals(a.planJson)
        .filter((s) => s.kind === "active")
        .map((s) => [a.startAt + s.startOffsetMs, a.startAt + s.endOffsetMs] as const),
    );
  let peak = 0;
  for (let ts = dayStart; ts < dayStart + DAY_MS; ts += SAMPLE_MS) {
    const count = active.filter(([s, e]) => ts >= s && ts < e).length;
    if (count > peak) peak = count;
  }
  return peak;
}

function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return d.getTime();
}

function blockStyle(start: number, end: number, gridStart: number, total: number) {
  const left = ((start - gridStart) / total) * 100;
  const width = ((end - start) / total) * 100;
  return { left: `${left}%`, width: `${Math.max(width, 1.5)}%` };
}

export function Calendar() {
  const [date, setDate] = useState(() => startOfDay(Date.now()));
  const [view, setView] = useState<"day" | "week">("day");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const employees = trpc.employees.list.useQuery();
  const types = trpc.appointmentTypes.list.useQuery();
  const customers = trpc.customers.list.useQuery();

  const weekStart = startOfWeek(date);
  const rangeFrom = view === "week" ? weekStart : date;
  const rangeTo = view === "week" ? addDays(weekStart, 7) : addDays(date, 1);
  const appts = trpc.appointments.list.useQuery({ from: rangeFrom, to: rangeTo });

  const gridStart = date + GRID_START_HOUR * HOUR_MS;
  const gridEnd = date + GRID_END_HOUR * HOUR_MS;
  const total = gridEnd - gridStart;
  const hours = useMemo(
    () => Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i),
    [],
  );

  const rows = (employees.data ?? []).filter((e) => e.active) as EmployeeOpt[];
  const list = (appts.data ?? []) as AppointmentRow[];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="row">
          <button onClick={() => setDate(addDays(date, view === "week" ? -7 : -1))}>‹ Prev</button>
          <button onClick={() => setDate(startOfDay(Date.now()))}>Today</button>
          <button onClick={() => setDate(addDays(date, view === "week" ? 7 : 1))}>Next ›</button>
          <button className={view === "day" ? "filter active" : "filter"} onClick={() => setView("day")}>
            Day
          </button>
          <button className={view === "week" ? "filter active" : "filter"} onClick={() => setView("week")}>
            Week
          </button>
        </div>
        <strong>{view === "week" ? `Week of ${fmtDate(weekStart)}` : fmtDate(date)}</strong>
        <button
          className="primary"
          onClick={() => setDrawer({ mode: "create", employeeId: rows[0]?.id, startAt: rangeFrom + 10 * HOUR_MS })}
          disabled={rows.length === 0}
        >
          + New appointment
        </button>
      </div>

      {appts.isLoading && <p className="muted">Loading…</p>}
      {appts.error && <p className="error">{appts.error.message}</p>}
      {rows.length === 0 && <p className="muted">Add an employee to start booking.</p>}

      {view === "week" && rows.length > 0 && (
        <div className="week-scroll">
          <table className="week">
            <thead>
              <tr>
                <th>Employee</th>
                {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
                  <th key={d}>{fmtDate(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <strong>{emp.name}</strong>
                    <div className="muted">cap {emp.capacity}</div>
                  </td>
                  {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
                    const dayAppts = list.filter(
                      (a) => a.employeeId === emp.id && a.status !== "cancelled" && a.startAt >= d && a.startAt < addDays(d, 1),
                    );
                    return (
                      <td
                        key={d}
                        className="week-cell"
                        onClick={() => setDrawer({ mode: "create", employeeId: emp.id, startAt: d + 10 * HOUR_MS })}
                      >
                        {dayAppts.map((a) => (
                          <div
                            key={a.id}
                            className="appt-chip"
                            style={{ background: a.typeColor }}
                            title={`${a.customerName} — ${a.typeName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawer({ mode: "edit", appointment: a });
                            }}
                          >
                            {fmtTime(a.startAt)} {a.customerName}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "day" && rows.length > 0 && (
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
            {rows.map((emp) => {
              const peak = peakActive(list, emp.id, date);
              const atCapacity = peak >= emp.capacity;
              return (
                <div className="cal-row" key={emp.id}>
                  <div className="name-col">
                    <strong>{emp.name}</strong>
                    <span className={atCapacity ? "badge gap" : "badge"} title="peak concurrent clients vs capacity">
                      {atCapacity ? "at capacity" : `peak ${peak}/${emp.capacity}`}
                    </span>
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
                        const segs = parseIntervals(a.planJson).filter((s) => s.kind === "gap");
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
              );
            })}
          </div>
        </div>
      )}

      {drawer && (
        <AppointmentDrawer
          key={drawer.appointment?.id ?? `${drawer.employeeId}-${drawer.startAt}`}
          mode={drawer.mode}
          initial={{ employeeId: drawer.employeeId, startAt: drawer.startAt, appointment: drawer.appointment }}
          employees={rows}
          types={(types.data ?? []) as unknown as TypeOpt[]}
          customers={(customers.data ?? []) as CustomerOpt[]}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
