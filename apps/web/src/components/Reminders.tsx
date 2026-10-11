import { useState } from "react";
import { fmtTime } from "../lib/format";
import { trpc } from "../trpc";

const STATUS_BADGE: Record<string, string> = {
  pending: "badge",
  claimed: "badge",
  sent: "badge",
  failed: "badge gap",
  cancelled: "badge gap",
};

const FILTERS = ["all", "pending", "claimed", "sent", "failed", "cancelled"] as const;
type Filter = (typeof FILTERS)[number];

export function Reminders() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const list = trpc.reminders.list.useQuery(filter === "all" ? {} : { status: filter });
  const devices = trpc.devices.list.useQuery();
  // Stable query bounds: recomputing Date.now() each render minted a new query key
  // and refetched the stats in an endless loop (issue #6).
  const [range] = useState(() => {
    const now = Date.now();
    return { from: now - 30 * 86_400_000, to: now + 86_400_000 };
  });
  const stats = trpc.reminders.noShowCount.useQuery(range);
  const run = trpc.reminders.runScheduler.useMutation({
    onSuccess: () => {
      void utils.reminders.list.invalidate();
      void utils.appointments.list.invalidate();
    },
  });
  const retry = trpc.reminders.retry.useMutation({ onSuccess: () => void utils.reminders.list.invalidate() });
  const cancel = trpc.reminders.cancel.useMutation({ onSuccess: () => void utils.reminders.list.invalidate() });

  const rows = list.data ?? [];

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Reminders</h2>
          <button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Running…" : "Recompute queue"}
          </button>
        </div>
        <p className="muted">
          Reminders are queued here; the dedicated phone sends them (Phase 2, deferred). No SMS leaves the server yet.
        </p>
        <p className="muted">
          Sent: {rows.filter((r) => r.status === "sent").length} · Pending:{" "}
          {rows.filter((r) => r.status === "pending").length} · No-shows (30 days):{" "}
          {stats.data ? `${stats.data.noShow}/${stats.data.total}` : "…"}
        </p>
      </div>

      <div className="panel">
        <h2>Devices</h2>
        {(devices.data ?? []).length === 0 && <p className="muted">No sender device registered yet.</p>}
        <table>
          <tbody>
            {(devices.data ?? []).map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="muted">{d.active ? "active" : "revoked"}</td>
                <td className="muted">
                  last seen {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Queue</h2>
          <div className="row">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? "filter active" : "filter"} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
        </div>
        {list.isLoading && <p className="muted">Loading…</p>}
        {list.error && <p className="error">{list.error.message}</p>}
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Customer</th>
              <th>Appointment</th>
              <th>Send at</th>
              <th>Device</th>
              <th>Message</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <span className={STATUS_BADGE[r.status] ?? "badge"}>{r.status}</span>
                </td>
                <td>{r.customerName}</td>
                <td className="muted">{new Date(r.appointmentStartAt).toLocaleString()}</td>
                <td className="muted">{fmtTime(r.scheduledFor)}</td>
                <td className="muted">{r.deviceName ?? "—"}</td>
                <td className="muted" style={{ maxWidth: 320 }}>
                  {r.body}
                </td>
                <td>
                  {r.status !== "sent" && r.status !== "cancelled" && (
                    <>
                      <button onClick={() => retry.mutate({ id: r.id })}>Retry</button>{" "}
                      <button className="danger" onClick={() => cancel.mutate({ id: r.id })}>
                        Cancel
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
  );
}
