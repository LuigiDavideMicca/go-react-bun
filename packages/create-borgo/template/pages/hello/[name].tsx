import type { LoaderContext } from "borgo";

export async function loader({ params, api }: LoaderContext) {
  const res = await fetch(`${api}/hello/${params.name}`);
  return { message: (await res.json()).message as string };
}

export default function Hello({ message }: { message: string }) {
  return (
    <main>
      <h1>{message}</h1>
      <p>This page was server-rendered with data fetched from the Go API.</p>
      <a href="/">Back home</a>
    </main>
  );
}
