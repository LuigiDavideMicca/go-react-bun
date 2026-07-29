// the typed api client handed to loaders and actions. borgogen augments the
// ApiRoutes interface (declared in index.ts so `declare module "borgo-framework"`
// merges with it) with one entry per go route pattern.
import type { ApiRoutes } from "./index";

const isConnRefused = (err: unknown) => {
  const e = err as { code?: string; message?: string };
  return e?.code === "ConnectionRefused" || e?.code === "ECONNREFUSED" || /unable to connect|refused/i.test(e?.message ?? "");
};

type Registered = keyof ApiRoutes & string;
export type ApiRouteKey = [Registered] extends [never] ? string : Registered;

type Entry<K extends string> = K extends keyof ApiRoutes ? ApiRoutes[K] : unknown;
export type ApiResponse<K extends string> = Entry<K> extends { response: infer R } ? R : Entry<K>;
export type ApiRequest<K extends string> = Entry<K> extends { request: infer B } ? B : never;

type ParamNames<S extends string> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | ParamNames<Rest>
  : never;

export type ApiOptions<K extends string> = {
  query?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
} & ([ApiRequest<K>] extends [never] ? { body?: unknown } : { body: ApiRequest<K> }) &
  ([ParamNames<K>] extends [never]
    ? { params?: Record<string, string | number> }
    : { params: Record<ParamNames<K>, string | number> });

type OptsRequired<K extends string> = [ParamNames<K>] extends [never]
  ? [ApiRequest<K>] extends [never]
    ? false
    : true
  : true;

export type ApiClient = <K extends ApiRouteKey>(
  route: K,
  ...opts: OptsRequired<K> extends true ? [ApiOptions<K>] : [ApiOptions<K>?]
) => Promise<ApiResponse<K>>;

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    route: string,
  ) {
    super(`api ${route} responded ${status}`);
    this.name = "ApiError";
  }
}

export function makeApiClient(base: string, defaults: Record<string, string> = {}): ApiClient {
  return (async (route: string, opts: ApiOptions<string> = {}) => {
    const space = route.indexOf(" ");
    const method = route.slice(0, space);
    const path = route.slice(space + 1).replace(/\{(\w+)\}/g, (_, name) => {
      const value = opts.params?.[name];
      if (value === undefined) throw new Error(`api ${route}: missing param "${name}"`);
      return encodeURIComponent(String(value));
    });

    const url = new URL(base + path);
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      url.searchParams.set(key, String(value));
    }

    const init = {
      method,
      headers: {
        ...defaults,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    };
    // loaders and actions run while the go api may be mid-restart in dev; a
    // refused connection never reached it, so a short retry is always safe
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetch(url, init);
        break;
      } catch (err) {
        if (attempt >= 15 || !isConnRefused(err)) throw err;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ""), route);
    if (res.status === 204) return undefined;
    return res.json();
  }) as ApiClient;
}
