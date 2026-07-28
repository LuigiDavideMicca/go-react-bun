import { serve } from "./server";

await serve({ dev: !!process.env.DEV });
