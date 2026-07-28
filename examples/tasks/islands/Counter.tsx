import { useState } from "react";

export default function Counter({ label, start = 0 }: { label: string; start?: number }) {
  const [count, setCount] = useState(start);
  return (
    <p>
      {label}: <strong data-testid="count">{count}</strong>{" "}
      <button onClick={() => setCount(count + 1)}>+1</button>
    </p>
  );
}
