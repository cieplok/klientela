import { useEffect, useState } from "react";
import { fmtDate, fmtTime } from "../lib/format";
import { trpc } from "../trpc";

const STATUS_BADGE: Record<string, string> = {
  scheduled: "badge",
  completed: "badge",
  cancelled: "badge gap",
  no_show: "badge gap",
};

export function Customers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const list = trpc.customers.list.useQuery({ search: search.trim() || undefined });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const create = trpc.customers.create.useMutation({
    onSuccess: () => {
      setName("");
      setPhone("");
      setEmail("");
      void utils.customers.list.invalidate();
    },
  });

  return (
    <div>
      <div className="panel">
        <h2>Add customer</h2>
        <div className="grid2">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>Phone (E.164)</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48123123123" />
          </div>
        </div>
        <div className="field">
          <label>Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {create.error && <p className="error">{create.error.message}</p>}
        <button
          className="primary"
          disabled={!name || !phone || create.isPending}
          onClick={() => create.mutate({ name, phone, email: email || undefined, smsOptOut: false })}
        >
          Add
        </button>
      </div>

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Customers ({(list.data ?? []).length})</h2>
          <input
            style={{ maxWidth: 280 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone…"
          />
        </div>
        {list.isLoading && <p className="muted">Loading…</p>}
        {list.error && <p className="error">{list.error.message}</p>}
        {(list.data ?? []).length === 0 && !list.isLoading && <p className="muted">No customers match.</p>}
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>SMS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>
                  {c.smsOptOut ? <span className="badge gap">opted out</span> : <span className="badge">reminders on</span>}
                </td>
                <td>
                  <button onClick={() => setSelectedId(c.id)}>Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedId && <CustomerDetail key={selectedId} customerId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function CustomerDetail({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const detail = trpc.customers.get.useQuery({ id: customerId });
  const types = trpc.appointmentTypes.list.useQuery();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!detail.data || loaded) return;
    setName(detail.data.name);
    setPhone(detail.data.phone);
    setEmail(detail.data.email ?? "");
    setNotes(detail.data.notes ?? "");
    setLoaded(true);
  }, [detail.data, loaded]);

  const update = trpc.customers.update.useMutation({
    onSuccess: () => {
      void utils.customers.list.invalidate();
      void utils.customers.get.invalidate({ id: customerId });
    },
  });
  const remove = trpc.customers.remove.useMutation({
    onSuccess: () => {
      void utils.customers.list.invalidate();
      onClose();
    },
  });

  const typeName = (id: string) => types.data?.find((t) => t.id === id)?.name ?? "Service";

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{loaded ? name : "Customer"}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {detail.isLoading && <p className="muted">Loading…</p>}
        {detail.error && <p className="error">{detail.error.message}</p>}

        {detail.data && (
          <>
            <div className="field">
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid2">
              <div className="field">
                <label>Phone (E.164)</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <label className="row" style={{ gap: 6, marginBottom: 12 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={detail.data.smsOptOut}
                onChange={(e) => update.mutate({ id: customerId, smsOptOut: e.target.checked })}
              />
              <span>Reminders opted out</span>
            </label>

            {update.error && <p className="error">{update.error.message}</p>}
            <div className="row">
              <button
                className="primary"
                disabled={!name || !phone || update.isPending}
                onClick={() => update.mutate({ id: customerId, name: name.trim(), phone: phone.trim(), email, notes })}
              >
                {update.isPending ? "Saving…" : "Save"}
              </button>
              {update.isSuccess && <span className="muted">Saved.</span>}
              <span className="spacer" style={{ flex: 1 }} />
              <button className="danger" disabled={remove.isPending} onClick={() => remove.mutate({ id: customerId })}>
                Delete
              </button>
            </div>
            {remove.error && <p className="error">{remove.error.message}</p>}

            <h2 style={{ marginTop: 22 }}>Appointment history</h2>
            {detail.data.appointments.length === 0 && <p className="muted">No appointments yet.</p>}
            {detail.data.appointments.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Service</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.data.appointments.map((a) => (
                    <tr key={a.id}>
                      <td className="muted">
                        {fmtDate(a.startAt)} {fmtTime(a.startAt)}
                      </td>
                      <td>{typeName(a.appointmentTypeId)}</td>
                      <td>
                        <span className={STATUS_BADGE[a.status] ?? "badge"}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
