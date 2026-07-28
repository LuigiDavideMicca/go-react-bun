import { useState } from "react";
import { redirect, type ActionContext, type LoaderContext } from "borgo";

type Task = { ID: number; title: string; body: string };

export const head = {
  title: "Tasks · borgo",
  meta: [{ name: "description", content: "tasks demo app for the borgo framework" }],
};

export async function loader({ api }: LoaderContext) {
  const res = await fetch(`${api}/tasks`);
  const { tasks } = await res.json();
  return { tasks };
}

// classic form post: works without client javascript, redirects back on success
export async function action({ request, api }: ActionContext) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "");

  if (!title) return { error: "give the task a title" };

  await fetch(`${api}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
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

  const remove = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    const res = await fetch("/api/tasks");
    setTasks((await res.json()).tasks);
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
