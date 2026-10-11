import { useEffect, useState } from "react";
import { trpc } from "../trpc";

interface SegmentDraft {
  kind: "active" | "gap";
  durationMin: number;
  label: string;
}

const DEFAULT_SEGMENTS: SegmentDraft[] = [{ kind: "active", durationMin: 30, label: "" }];
const DEFAULT_COLOR = "#7c9cff";

export function Services() {
  const utils = trpc.useUtils();
  const types = trpc.appointmentTypes.list.useQuery();
  const employees = trpc.employees.list.useQuery();

  const [editingId, setEditingId] = useState<string | null>(null);
  const detail = trpc.appointmentTypes.get.useQuery({ id: editingId ?? "" }, { enabled: Boolean(editingId) });

  const [name, setName] = useState("");
  const [segments, setSegments] = useState<SegmentDraft[]>(DEFAULT_SEGMENTS);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [bufferBeforeMin, setBufferBeforeMin] = useState(0);
  const [bufferAfterMin, setBufferAfterMin] = useState(0);
  const [color, setColor] = useState(DEFAULT_COLOR);

  useEffect(() => {
    if (!editingId || !detail.data) return;
    setName(detail.data.name);
    setSegments(
      detail.data.segments.map((s) => ({
        kind: s.kind as "active" | "gap",
        durationMin: s.durationMin,
        label: s.label ?? "",
      })),
    );
    setEmployeeIds(detail.data.employeeIds);
    setBufferBeforeMin(detail.data.bufferBeforeMin);
    setBufferAfterMin(detail.data.bufferAfterMin);
    setColor(detail.data.color);
  }, [editingId, detail.data]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setSegments(DEFAULT_SEGMENTS);
    setEmployeeIds([]);
    setBufferBeforeMin(0);
    setBufferAfterMin(0);
    setColor(DEFAULT_COLOR);
  }

  const create = trpc.appointmentTypes.create.useMutation({
    onSuccess: () => {
      resetForm();
      void utils.appointmentTypes.list.invalidate();
    },
  });
  const update = trpc.appointmentTypes.update.useMutation({
    onSuccess: () => {
      resetForm();
      void utils.appointmentTypes.list.invalidate();
    },
  });
  const setActive = trpc.appointmentTypes.update.useMutation({
    onSuccess: () => void utils.appointmentTypes.list.invalidate(),
  });

  function setSegment(index: number, patch: Partial<SegmentDraft>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  const segmentPayload = () =>
    segments.map((s, i) => ({
      position: i,
      kind: s.kind,
      durationMin: s.durationMin,
      label: s.label || undefined,
    }));

  function save() {
    if (editingId) {
      update.mutate({
        id: editingId,
        name: name.trim(),
        bufferBeforeMin,
        bufferAfterMin,
        color,
        employeeIds,
        segments: segmentPayload(),
      });
    } else {
      create.mutate({
        name: name.trim(),
        active: true,
        bufferBeforeMin,
        bufferAfterMin,
        color,
        employeeIds,
        segments: segmentPayload(),
      });
    }
  }

  const error = create.error ?? update.error;
  const totalMin = bufferBeforeMin + bufferAfterMin + segments.reduce((sum, s) => sum + s.durationMin, 0);
  const busy = create.isPending || update.isPending;

  return (
    <div>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{editingId ? "Edit service" : "New service"}</h2>
          {editingId && <button onClick={resetForm}>Cancel edit</button>}
        </div>
        {editingId && detail.isLoading && <p className="muted">Loading…</p>}
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Colour" />
        </div>

        <div className="grid2">
          <div className="field">
            <label>Buffer before (min, occupies the stylist)</label>
            <input
              type="number"
              min={0}
              value={bufferBeforeMin}
              onChange={(e) => setBufferBeforeMin(Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="field">
            <label>Buffer after (min)</label>
            <input
              type="number"
              min={0}
              value={bufferAfterMin}
              onChange={(e) => setBufferAfterMin(Math.max(0, Number(e.target.value)))}
            />
          </div>
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

        <div className="field">
          <label>Colour</label>
          <input type="color" value={color} style={{ width: 60, padding: 2 }} onChange={(e) => setColor(e.target.value)} />
        </div>

        {error && <p className="error">{error.message}</p>}
        <p className="muted">Total booked time: {totalMin} min (buffers + segments).</p>
        <button className="primary" disabled={!name || busy} onClick={save}>
          {busy ? "Saving…" : editingId ? "Save changes" : "Create service"}
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
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(types.data ?? []).map((t) => (
              <tr key={t.id}>
                <td>
                  <span className="swatch" style={{ background: t.color }} /> {t.name}
                </td>
                <td>
                  <div className="plan-preview">
                    {t.bufferBeforeMin > 0 && (
                      <div className="seg active" style={{ width: `${t.bufferBeforeMin * 3}px` }} title={`buffer ${t.bufferBeforeMin}m`} />
                    )}
                    {t.segments.map((s) => (
                      <div
                        key={s.position}
                        className={`seg ${s.kind}`}
                        style={{ width: `${s.durationMin * 3}px` }}
                        title={`${s.label ?? s.kind} ${s.durationMin}m`}
                      />
                    ))}
                    {t.bufferAfterMin > 0 && (
                      <div className="seg active" style={{ width: `${t.bufferAfterMin * 3}px` }} title={`buffer ${t.bufferAfterMin}m`} />
                    )}
                  </div>
                </td>
                <td>{t.totalMin} min</td>
                <td className="muted">{t.employeeIds.length === 0 ? "anyone" : `${t.employeeIds.length}`}</td>
                <td>{t.active ? "yes" : "no"}</td>
                <td>
                  <div className="row">
                    <button onClick={() => setEditingId(t.id)}>Edit</button>
                    <button onClick={() => setActive.mutate({ id: t.id, active: !t.active })}>
                      {t.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
