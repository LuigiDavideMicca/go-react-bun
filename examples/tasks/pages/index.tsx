import { useEffect, useState } from "react";
import { redirect, type ActionContext, type LoaderContext } from "borgo";
import type { Task } from "../.borgo/api-types";

export const head = {
  title: "Tasks · borgo",
  meta: [{ name: "description", content: "tasks demo app for the borgo framework" }],
};

// the sentinel header proves in ci that loader code never reaches the client bundle
export async function loader({ api }: LoaderContext) {
  const { tasks } = await api("GET /api/tasks", {
    headers: { "x-borgo-sentinel": "borgo-server-only-sentinel" },
  });
  return { tasks };
}

// classic form post: works without client javascript, redirects back on success
export async function action({ request, api }: ActionContext) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "");

  if (!title) return { error: "give the task a title" };

  await api("POST /api/tasks", { body: { title, body } });
  return redirect("/");
}

export default function Home({
  tasks: initialTasks,
  actionData,
}: {
  tasks: Task[];
  actionData?: { error?: string };
}) {
  const [tasks, setTasks] = useState(initialTasks);

  const refresh = async () => {
    const res = await fetch("/api/tasks");
    setTasks((await res.json()).tasks);
  };

  // live updates: a task created or deleted in another tab appears here
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("task-created", refresh);
    source.addEventListener("task-deleted", refresh);
    return () => source.close();
  }, []);

  const remove = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await refresh();
  };

  return (
    <main>
      <h1>Tasks</h1>
      <p>Server-rendered by Bun, data from the Go API, mutations through a borgo action.</p>
      <form method="post">
        <input name="title" placeholder="Title" />
        <input name="body" placeholder="Details (optional)" />
        <button>Add</button>
      </form>
      {actionData?.error && <p className="error">{actionData.error}</p>}
      <ul>
        {tasks.map((t) => (
          <li key={t.ID}>
            <a href={`/tasks/${t.ID}`}>{t.title}</a>
            <button onClick={() => remove(t.ID)}>✕</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
