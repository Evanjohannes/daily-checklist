"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  date: string;
  title: string;
  done: boolean;
  reminder_time: string | null;
};
type Goal = { id: string; title: string; start_date: string; end_date: string };
type Check = { goal_id: string; date: string };

// Local date as YYYY-MM-DD (avoids timezone bugs)
function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string) {
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Tick() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

function Check({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`check${on ? " on" : ""}`}
    >
      <Tick />
    </button>
  );
}

function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const today = fmt(now);

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selected, setSelected] = useState(fmt(new Date()));

  const [tasks, setTasks] = useState<Task[]>([]); // visible month
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);

  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");

  const [goalTitle, setGoalTitle] = useState("");
  const [goalStart, setGoalStart] = useState(fmt(new Date()));
  const [goalEnd, setGoalEnd] = useState("");

  // Check login
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push("/login");
      else setReady(true);
    });
  }, [router]);

  // Clock: updates every 30 seconds so reminders appear while the app is open
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const loadMonth = useCallback(async () => {
    const start = fmt(month);
    const end = fmt(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("created_at");
    setTasks((data as Task[]) ?? []);
  }, [month]);

  const loadToday = useCallback(async () => {
    const t = fmt(new Date());
    const { data: td } = await supabase
      .from("tasks")
      .select("*")
      .eq("date", t)
      .order("created_at");
    setTodayTasks((td as Task[]) ?? []);
    const { data: od } = await supabase
      .from("tasks")
      .select("*")
      .lt("date", t)
      .eq("done", false)
      .order("date");
    setOverdue((od as Task[]) ?? []);
  }, []);

  const loadGoals = useCallback(async () => {
    const { data: g } = await supabase.from("goals").select("*").order("created_at");
    setGoals((g as Goal[]) ?? []);
    const { data: c } = await supabase.from("goal_checks").select("goal_id,date");
    setChecks((c as Check[]) ?? []);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadMonth(), loadToday(), loadGoals()]);
  }, [loadMonth, loadToday, loadGoals]);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  // ---- Task actions ----
  async function addTask() {
    if (!title.trim()) return;
    await supabase.from("tasks").insert({
      date: selected,
      title: title.trim(),
      reminder_time: time || null,
    });
    setTitle("");
    setTime("");
    refresh();
  }

  async function toggle(t: Task) {
    await supabase.from("tasks").update({ done: !t.done }).eq("id", t.id);
    refresh();
  }

  async function remove(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    refresh();
  }

  // ---- Goal actions ----
  const checkSet = new Set(checks.map((c) => `${c.goal_id}|${c.date}`));
  const isChecked = (goalId: string, date: string) => checkSet.has(`${goalId}|${date}`);
  const activeGoals = (date: string) =>
    goals.filter((g) => g.start_date <= date && date <= g.end_date);

  async function toggleGoal(goalId: string, date: string) {
    if (isChecked(goalId, date)) {
      await supabase.from("goal_checks").delete().eq("goal_id", goalId).eq("date", date);
    } else {
      await supabase.from("goal_checks").insert({ goal_id: goalId, date });
    }
    loadGoals();
  }

  async function addGoal() {
    if (!goalTitle.trim() || !goalStart || !goalEnd) return;
    if (goalEnd < goalStart) {
      alert("The end date must be after the start date.");
      return;
    }
    await supabase.from("goals").insert({
      title: goalTitle.trim(),
      start_date: goalStart,
      end_date: goalEnd,
    });
    setGoalTitle("");
    setGoalEnd("");
    loadGoals();
  }

  async function removeGoal(id: string) {
    if (!confirm("Delete this goal and all its checks?")) return;
    await supabase.from("goals").delete().eq("id", id);
    loadGoals();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function jumpTo(date: string) {
    const d = new Date(date + "T00:00:00");
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(date);
  }

  if (!ready) return <p style={{ padding: 24 }}>Loading...</p>;

  // ---- Calendar cells ----
  const firstWeekday = month.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // ---- Selected day ----
  const dayTasks = tasks.filter((t) => t.date === selected);
  const dayGoals = activeGoals(selected);
  const dayTotal = dayTasks.length + dayGoals.length;
  const dayDone =
    dayTasks.filter((t) => t.done).length +
    dayGoals.filter((g) => isChecked(g.id, selected)).length;

  // ---- Today panel ----
  const nowStr = hhmm(now);
  const dueNow = todayTasks.filter(
    (t) => !t.done && t.reminder_time && t.reminder_time.slice(0, 5) <= nowStr
  );
  const laterToday = todayTasks.filter(
    (t) => !t.done && t.reminder_time && t.reminder_time.slice(0, 5) > nowStr
  );
  const goalsTodo = activeGoals(today).filter((g) => !isChecked(g.id, today));
  const allClear =
    dueNow.length === 0 && laterToday.length === 0 && overdue.length === 0 && goalsTodo.length === 0;

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="app">
      {/* Header */}
      <header className="topbar">
        <div>
          <h1 className="greeting">{greeting}</h1>
          <div className="subline">
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
        </div>
        <button onClick={signOut} className="linkbtn">
          Sign out
        </button>
      </header>

      <div className="layout">
        {/* LEFT COLUMN */}
        <div className="col">
          {/* TODAY PANEL */}
          <section className="card">
            <h2 className="card-title">Today</h2>

            {dueNow.map((t) => (
              <div key={t.id} className="reminder">
                <span className="when">{t.reminder_time!.slice(0, 5)}</span>
                <span className="what">{t.title}</span>
                <button className="pill" onClick={() => toggle(t)}>
                  Mark done
                </button>
              </div>
            ))}

            {laterToday.length > 0 && (
              <>
                <div className="group-title">Coming up today</div>
                {laterToday.map((t) => (
                  <p key={t.id} className="note">
                    {t.reminder_time!.slice(0, 5)} {t.title}
                  </p>
                ))}
              </>
            )}

            {overdue.length > 0 && (
              <>
                <div className="group-title">Not finished ({overdue.length})</div>
                {overdue.slice(0, 5).map((t) => (
                  <button key={t.id} className="late" onClick={() => jumpTo(t.date)}>
                    <span className="d">{t.date}</span>
                    <span>{t.title}</span>
                  </button>
                ))}
                {overdue.length > 5 && <p className="note">and {overdue.length - 5} more</p>}
              </>
            )}

            {goalsTodo.length > 0 && (
              <>
                <div className="group-title">Goals to check today</div>
                <ul className="rows">
                  {goalsTodo.map((g) => (
                    <li key={g.id} className="row goal">
                      <Check on={false} label={`Check ${g.title}`} onClick={() => toggleGoal(g.id, today)} />
                      <div className="row-title">{g.title}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {allClear && <p className="note">All clear. Nothing is waiting for you.</p>}
          </section>

          {/* CALENDAR */}
          <section className="card">
            <div className="monthbar">
              <button
                className="nav"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                ‹
              </button>
              <div className="month">
                {month.toLocaleString("en-US", { month: "long" })}{" "}
                <span className="year">{month.getFullYear()}</span>
              </div>
              <button
                className="nav"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                ›
              </button>
            </div>

            <div className="grid7">
              {WEEKDAYS.map((w) => (
                <div key={w} className="wd">
                  {w}
                </div>
              ))}
              {cells.map((day, i) => {
                if (day === null) return <div key={`e${i}`} />;
                const dateStr = fmt(new Date(month.getFullYear(), month.getMonth(), day));
                const list = tasks.filter((t) => t.date === dateStr);
                const ag = activeGoals(dateStr);
                const total = list.length + ag.length;
                const done =
                  list.filter((t) => t.done).length +
                  ag.filter((g) => isChecked(g.id, dateStr)).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const ringClass = total === 0 ? "empty" : pct === 100 ? "full" : "";
                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelected(dateStr)}
                    aria-label={dateStr}
                    className={`day${dateStr === selected ? " sel" : ""}${dateStr === today ? " today" : ""}`}
                  >
                    <div className={`ring ${ringClass}`} style={{ "--p": pct } as CSSProperties}>
                      <span>{day}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div className="col">
          {/* SELECTED DAY */}
          <section className="card">
            <h2 className="daytitle">
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </h2>
            <div className="progress-line">
              {dayTotal > 0 ? `${dayDone} of ${dayTotal} done` : "Nothing planned yet"}
            </div>

            <div className="addbar">
              <input
                className="input grow"
                placeholder="Add a task for this day"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTask()}
              />
              <input
                type="time"
                aria-label="Reminder time"
                className="input time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
              <button onClick={addTask} className="btn">
                Add task
              </button>
            </div>

            {dayTotal === 0 && (
              <p className="note">Type a task above. Add a time if you want a reminder.</p>
            )}

            <ul className="rows">
              {dayGoals.map((g) => (
                <li key={g.id} className="row goal">
                  <Check
                    on={isChecked(g.id, selected)}
                    label={`Check ${g.title}`}
                    onClick={() => toggleGoal(g.id, selected)}
                  />
                  <div>
                    <div className={`row-title${isChecked(g.id, selected) ? " done" : ""}`}>{g.title}</div>
                    <div className="row-meta">Goal</div>
                  </div>
                </li>
              ))}
              {dayTasks.map((t) => (
                <li key={t.id} className="row">
                  <Check on={t.done} label={`Check ${t.title}`} onClick={() => toggle(t)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={`row-title${t.done ? " done" : ""}`}>{t.title}</div>
                    {t.reminder_time && (
                      <div className="row-meta">Reminder at {t.reminder_time.slice(0, 5)}</div>
                    )}
                  </div>
                  <button onClick={() => remove(t.id)} className="x">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* GOALS */}
          <section className="card">
            <h2 className="card-title">Goals</h2>

            <div className="stack">
              <input
                className="input"
                placeholder="New goal, like Gym every day"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
              />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="gs">From</label>
                  <input
                    id="gs"
                    type="date"
                    className="input"
                    value={goalStart}
                    onChange={(e) => setGoalStart(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ge">To</label>
                  <input
                    id="ge"
                    type="date"
                    className="input"
                    value={goalEnd}
                    onChange={(e) => setGoalEnd(e.target.value)}
                  />
                </div>
              </div>
              <button onClick={addGoal} className="btn block">
                Add goal
              </button>
            </div>

            <div className="divider" />

            {goals.length === 0 && (
              <p className="note">No goals yet. Pick a start and end date and the goal will show on every day in between.</p>
            )}

            {goals.map((g) => {
              const total = daysBetween(g.start_date, g.end_date);
              const done = checks.filter((c) => c.goal_id === g.id).length;
              const pct = Math.min(100, Math.round((done / total) * 100));
              return (
                <div key={g.id} className="goalcard">
                  <div className="goalhead">
                    <div>
                      <div className="goalname">{g.title}</div>
                      <div className="row-meta">
                        {g.start_date} to {g.end_date}
                      </div>
                    </div>
                    <button onClick={() => removeGoal(g.id)} className="x">
                      Delete
                    </button>
                  </div>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <div className="goalstat">
                    {done} of {total} days ({pct}%)
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      </div>
    </main>
  );

}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <p style={{ padding: 24 }}>Loading...</p>;
  return <Home />;
}