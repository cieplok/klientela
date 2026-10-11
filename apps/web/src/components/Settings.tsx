import { useEffect, useState } from "react";
import { trpc } from "../trpc";

export function Settings() {
  const utils = trpc.useUtils();
  const me = trpc.auth.me.useQuery();
  const isAdmin = me.data?.role === "admin";

  const settings = trpc.settings.get.useQuery();
  const devices = trpc.devices.list.useQuery();
  const users = trpc.staffUsers.list.useQuery(undefined, { enabled: isAdmin });

  const [form, setForm] = useState({
    salonName: "",
    address: "",
    salonPhone: "",
    timezone: "Europe/Warsaw",
    reminderLeadMinutes: 1440,
    quietHoursStartMin: 540,
    quietHoursEndMin: 1200,
    reminderTemplate: "",
  });
  const [deviceName, setDeviceName] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "staff">("staff");
  const [pwUserId, setPwUserId] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const update = trpc.settings.update.useMutation({ onSuccess: () => void utils.settings.get.invalidate() });
  const createDevice = trpc.devices.create.useMutation({
    onSuccess: (data) => {
      setIssuedToken(data.token);
      setDeviceName("");
      void utils.devices.list.invalidate();
    },
  });
  const revokeDevice = trpc.devices.revoke.useMutation({ onSuccess: () => void utils.devices.list.invalidate() });
  const rotateDevice = trpc.devices.rotate.useMutation({
    onSuccess: (data) => {
      setIssuedToken(data.token);
      void utils.devices.list.invalidate();
    },
  });

  const createUser = trpc.staffUsers.create.useMutation({
    onSuccess: () => {
      setNewEmail("");
      setNewPassword("");
      setNewRole("staff");
      void utils.staffUsers.list.invalidate();
    },
  });
  const updateUser = trpc.staffUsers.update.useMutation({
    onSuccess: () => {
      void utils.staffUsers.list.invalidate();
      void me.refetch();
    },
  });
  const setPassword = trpc.staffUsers.setPassword.useMutation({
    onSuccess: () => {
      setPwUserId(null);
      setPwValue("");
      void utils.staffUsers.list.invalidate();
    },
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <div className="panel">
        <h2>Salon settings</h2>
        <div className="grid2">
          <div className="field">
            <label>Salon name</label>
            <input value={form.salonName} onChange={(e) => set("salonName", e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.salonPhone} onChange={(e) => set("salonPhone", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Address</label>
          <input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Time zone</label>
            <input value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
          </div>
          <div className="field">
            <label>Reminder lead (minutes before)</label>
            <input
              type="number"
              value={form.reminderLeadMinutes}
              onChange={(e) => set("reminderLeadMinutes", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Quiet hours start (min from midnight)</label>
            <input
              type="number"
              value={form.quietHoursStartMin}
              onChange={(e) => set("quietHoursStartMin", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Quiet hours end</label>
            <input
              type="number"
              value={form.quietHoursEndMin}
              onChange={(e) => set("quietHoursEndMin", Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label>Message template</label>
          <textarea
            rows={3}
            value={form.reminderTemplate}
            onChange={(e) => set("reminderTemplate", e.target.value)}
          />
          <span className="muted">
            Placeholders: {"{salonName} {serviceName} {date} {time} {salonPhone} {address}"}
          </span>
        </div>
        <button className="primary" onClick={() => update.mutate(form)} disabled={update.isPending}>
          Save settings
        </button>
        {update.error && <p className="error">{update.error.message}</p>}
      </div>

      {!isAdmin && (
        <div className="panel">
          <p className="muted">Only admins can manage sender devices and staff accounts.</p>
        </div>
      )}

      {isAdmin && (
        <div className="panel">
          <h2>Sender devices</h2>
          <p className="muted">
            Create a device and paste its token into the phone app once. The raw token is shown only here. Rotating
            issues a new token and invalidates the old one; revoking disables the device.
          </p>
          <div className="row" style={{ marginBottom: 12 }}>
            <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Salon phone" style={{ maxWidth: 260 }} />
            <button onClick={() => createDevice.mutate({ name: deviceName })} disabled={!deviceName || createDevice.isPending}>
              Add device
            </button>
          </div>
          {issuedToken && (
            <div className="field">
              <label>Device token (copy now)</label>
              <input readOnly value={issuedToken} onFocus={(e) => e.currentTarget.select()} />
            </div>
          )}
          {createDevice.error && <p className="error">{createDevice.error.message}</p>}
          <table>
            <tbody>
              {(devices.data ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="muted">{d.active ? "active" : "revoked"}</td>
                  <td>
                    {d.active && (
                      <div className="row">
                        <button onClick={() => rotateDevice.mutate({ id: d.id })} disabled={rotateDevice.isPending}>
                          Rotate token
                        </button>
                        <button className="danger" onClick={() => revokeDevice.mutate({ id: d.id })}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <div className="panel">
          <h2>Staff accounts</h2>
          <p className="muted">Admins can sign in, manage everything and add staff. Staff can use the book but not manage devices or accounts.</p>
          <div className="grid2">
            <div className="field">
              <label>Email</label>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@salon.local" />
            </div>
            <div className="field">
              <label>Password (min 8 chars)</label>
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" />
            </div>
          </div>
          <div className="field">
            <label>Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as "admin" | "staff")}>
              <option value="staff">staff</option>
              <option value="admin">admin</option>
            </select>
          </div>
          {createUser.error && <p className="error">{createUser.error.message}</p>}
          <button
            className="primary"
            disabled={!newEmail || newPassword.length < 8 || createUser.isPending}
            onClick={() => createUser.mutate({ email: newEmail, password: newPassword, role: newRole })}
          >
            Add user
          </button>

          {users.isLoading && <p className="muted">Loading…</p>}
          {users.error && <p className="error">{users.error.message}</p>}
          <table style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      style={{ maxWidth: 120 }}
                      onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value as "admin" | "staff" })}
                    >
                      <option value="staff">staff</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td>{u.active ? "yes" : "no"}</td>
                  <td>
                    <div className="row">
                      <button onClick={() => updateUser.mutate({ id: u.id, active: !u.active })}>
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          setPwUserId(pwUserId === u.id ? null : u.id);
                          setPwValue("");
                        }}
                      >
                        Set password
                      </button>
                    </div>
                    {pwUserId === u.id && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <input
                          type="password"
                          value={pwValue}
                          placeholder="New password"
                          onChange={(e) => setPwValue(e.target.value)}
                          style={{ maxWidth: 200 }}
                        />
                        <button
                          disabled={pwValue.length < 8 || setPassword.isPending}
                          onClick={() => setPassword.mutate({ id: u.id, password: pwValue })}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {updateUser.error && <p className="error">{updateUser.error.message}</p>}
          {setPassword.error && <p className="error">{setPassword.error.message}</p>}
        </div>
      )}
    </div>
  );
}
