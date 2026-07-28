import { useState, type FormEvent } from "react";
import type { LoaderContext } from "../framework/router";

type Task = { ID: number; title: string; body: string };

export async function loader({ api }: LoaderContext) {
  const res = await fetch(`${api}/tasks`);
  const { tasks } = await res.json();
  return { tasks };
}

export default function Home({ tasks: initialTasks }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/tasks");
    setTasks((await res.json()).tasks);
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    setTitle("");
    setBody("");
    refresh();
  };

  const remove = async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <main>
      <h1>Tasks</h1>
      <p>Server-rendered by Bun, data from the Go API, hydrated in the browser.</p>
      <form onSubmit={add}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details (optional)"
        />
        <button>Add</button>
      </form>
      <ul>
        {tasks.map((t) => (
          <li key={t.ID}>
            <a href={`/tasks/${t.ID}`}>{t.title}</a>
            <button onClick={() => remove(t.ID)}>✕</button>
          </li>
        ))}
      </ul>
      <a href="/about">About this project</a>
    </main>
  );
}
