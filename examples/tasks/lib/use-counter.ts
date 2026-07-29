import { useState } from "react";

export function useCounter() {
  const [count, setCount] = useState(0);
  const [flag] = useState(false);
  void flag;
  const increment = () => setCount((c) => c + 1);
  return { count, increment };
}
