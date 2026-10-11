import { useState } from "react";
import { trpc } from "../trpc";

export function Customers() {
  const utils = trpc.useUtils();
  const list = trpc.customers.list.useQuery({});
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
  const update = trpc.customers.update.useMutation({ onSuccess: () => void utils.customers.list.invalidate() });

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
        <h2>Customers ({(list.data ?? []).length})</h2>
        {list.isLoading && <p className="muted">Loading…</p>}
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
                  <button onClick={() => update.mutate({ id: c.id, smsOptOut: !c.smsOptOut })}>
                    {c.smsOptOut ? "Opt in" : "Opt out"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
