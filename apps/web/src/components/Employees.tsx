import { useState } from "react";
import { trpc } from "../trpc";

const MON_FRI = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 9 * 60, endMin: 17 * 60 }));

export function Employees() {
  const utils = trpc.useUtils();
  const list = trpc.employees.list.useQuery();
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);

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
        <p className="muted">New employees work Mon–Fri 09:00–17:00 by default.</p>
        <button className="primary" disabled={!name || create.isPending} onClick={() => create.mutate({ name, capacity, schedule: MON_FRI })}>
          Add
        </button>
      </div>

      <div className="panel">
        <h2>Employees</h2>
        {list.isLoading && <p className="muted">Loading…</p>}
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
                <td className="muted">
                  {e.schedule.length === 0
                    ? "—"
                    : `${e.schedule.length} window(s), e.g. ${String(Math.floor((e.schedule[0]!.startMin) / 60)).padStart(2, "0")}:00–${String(Math.floor(e.schedule[0]!.endMin / 60)).padStart(2, "0")}:00`}
                </td>
                <td>{e.active ? "yes" : "no"}</td>
                <td>
                  <button onClick={() => update.mutate({ id: e.id, active: !e.active })}>
                    {e.active ? "Deactivate" : "Activate"}
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
