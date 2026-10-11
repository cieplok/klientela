import { useState } from "react";
import { Calendar } from "./components/Calendar";
import { Customers } from "./components/Customers";
import { Employees } from "./components/Employees";
import { Login } from "./components/Login";
import { Reminders } from "./components/Reminders";
import { Services } from "./components/Services";
import { Settings } from "./components/Settings";
import { trpc } from "./trpc";

const TABS = ["calendar", "customers", "employees", "services", "reminders", "settings"] as const;
type Tab = (typeof TABS)[number];
const LABELS: Record<Tab, string> = {
  calendar: "Calendar",
  customers: "Customers",
  employees: "Employees",
  services: "Services",
  reminders: "Reminders",
  settings: "Settings",
};

export function App() {
  const me = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => me.refetch() });
  const [tab, setTab] = useState<Tab>("calendar");

  if (me.isLoading) {
    return (
      <div className="login-wrap">
        <div className="muted">Loading…</div>
      </div>
    );
  }
  if (!me.data) return <Login onDone={() => me.refetch()} />;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Klientela</span>
        <nav>
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {LABELS[t]}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span className="muted">
          {me.data.email} · {me.data.role}
        </span>
        <button onClick={() => logout.mutate()}>Sign out</button>
      </header>
      <main className="content">
        {tab === "calendar" && <Calendar />}
        {tab === "customers" && <Customers />}
        {tab === "employees" && <Employees />}
        {tab === "services" && <Services />}
        {tab === "reminders" && <Reminders />}
        {tab === "settings" && <Settings />}
      </main>
    </div>
  );
}
