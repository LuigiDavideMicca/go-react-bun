import type { Head, LoaderContext } from "borgo";

type Task = { ID: number; CreatedAt: string; title: string; body: string };

export const head = (props: Record<string, unknown>): Head => {
  const task = props.task as Task | null;
  return { title: task ? `${task.title} · borgo tasks` : "Not found · borgo tasks" };
};

export async function loader({ params, api }: LoaderContext) {
  const res = await fetch(`${api}/tasks/${params.id}`);
  if (!res.ok) return { task: null };
  const { task } = await res.json();
  return { task };
}

export default function TaskDetail({ task }: { task: Task | null }) {
  if (!task) {
    return (
      <main>
        <h1>Task not found</h1>
        <a href="/">Back home</a>
      </main>
    );
  }

  return (
    <main>
      <h1>{task.title}</h1>
      <p>{task.body || "No details."}</p>
      <p>Created {task.CreatedAt.slice(0, 10)}</p>
      <a href="/">Back home</a>
    </main>
  );
}
