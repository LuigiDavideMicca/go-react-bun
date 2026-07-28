export const head = { title: "Error · borgo tasks" };

export default function ServerError() {
  return (
    <main>
      <h1>Something broke</h1>
      <p>The server hit an error while rendering this page. Try again in a moment.</p>
      <a href="/">Back home</a>
    </main>
  );
}
