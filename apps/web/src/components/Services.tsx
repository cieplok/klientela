import { useState } from "react";
import { trpc } from "../trpc";

interface SegmentDraft {
  kind: "active" | "gap";
  durationMin: number;
  label: string;
}

const DEFAULT_SEGMENTS: SegmentDraft[] = [{ kind: "active", durationMin: 30, label: "" }];

export function Services() {
  const utils = trpc.useUtils();
  const types = trpc.appointmentTypes.list.useQuery();
  const employees = trpc.employees.list.useQuery();

  const [name, setName] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>(DEFAULT_SEGMENTS);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);

  const create = trpc.appointmentTypes.create.useMutation({
    onSuccess: () => {
      setName("");
      setSegments(DEFAULT_SEGMENTS);
      setEmployeeIds([]);
      void utils.appointmentTypes.list.invalidate();
    },
  });

  function setSegment(index: number, patch: Partial<SegmentDraft>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <div>
      <div className="panel">
        <h2>New service</h2>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Colour" />
        </div>

        <label className="muted">Segments (order matters; gaps let the stylist take another client)</label>
        {segments.map((s, i) => (
          <div className="row" key={i} style={{ marginBottom: 6 }}>
            <select
              value={s.kind}
              style={{ width: 130 }}
              onChange={(e) => setSegment(i, { kind: e.target.value as "active" | "gap" })}
            >
              <option value="active">active</option>
              <option value="gap">gap</option>
            </select>
            <input
              type="number"
              min={1}
              style={{ width: 90 }}
              value={s.durationMin}
              onChange={(e) => setSegment(i, { durationMin: Math.max(1, Number(e.target.value)) })}
            />
            <input
              style={{ flex: 1 }}
              value={s.label}
              placeholder="label"
              onChange={(e) => setSegment(i, { label: e.target.value })}
            />
            <button onClick={() => setSegments((prev) => prev.filter((_, idx) => idx !== i))} disabled={segments.length === 1}>
              ✕
            </button>
          </div>
        ))}
        <button onClick={() => setSegments((prev) => [...prev, { kind: "active", durationMin: 15, label: "" }])}>
          + segment
        </button>

        <div className="field" style={{ marginTop: 12 }}>
          <label>Who can perform it (none selected = anyone)</label>
          <div className="row">
            {(employees.data ?? []).map((e) => (
              <label key={e.id} className="row" style={{ gap: 4 }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={employeeIds.includes(e.id)}
                  onChange={(ev) =>
                    setEmployeeIds((prev) => (ev.target.checked ? [...prev, e.id] : prev.filter((id) => id !== e.id)))
                  }
                />
                {e.name}
              </label>
            ))}
          </div>
        </div>

        {create.error && <p className="error">{create.error.message}</p>}
        <button
          className="primary"
          disabled={!name || create.isPending}
          onClick={() =>
            create.mutate({
              name,
              active: true,
              bufferBeforeMin: 0,
              bufferAfterMin: 0,
              color: "#7c9cff",
              employeeIds,
              segments: segments.map((s, i) => ({ position: i, kind: s.kind, durationMin: s.durationMin, label: s.label || undefined })),
            })
          }
        >
          Create service
        </button>
      </div>

      <div className="panel">
        <h2>Services</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Segments</th>
              <th>Total</th>
              <th>Staff</th>
            </tr>
          </thead>
          <tbody>
            {(types.data ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  <div className="plan-preview">
                    {t.segments.map((s) => (
                      <div key={s.position} className={`seg ${s.kind}`} style={{ width: `${s.durationMin * 3}px` }} title={`${s.label ?? s.kind} ${s.durationMin}m`} />
                    ))}
                  </div>
                </td>
                <td>{t.totalMin} min</td>
                <td className="muted">{t.employeeIds.length === 0 ? "anyone" : `${t.employeeIds.length}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
