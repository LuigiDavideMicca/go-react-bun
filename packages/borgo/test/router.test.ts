import { describe, expect, test } from "bun:test";
import { filePathToPattern, matchRoute, resolveHead } from "../src/router";

describe("filePathToPattern", () => {
  const cases: Array<[string, string]> = [
    ["index.tsx", "/"],
    ["about.tsx", "/about"],
    ["tasks/[id].tsx", "/tasks/:id"],
    ["blog/index.tsx", "/blog"],
    ["a/b/[x].tsx", "/a/b/:x"],
    ["[lang]/docs/[slug].tsx", "/:lang/docs/:slug"],
  ];
  for (const [file, pattern] of cases) {
    test(`${file} -> ${pattern}`, () => {
      expect(filePathToPattern(file)).toBe(pattern);
    });
  }
});

describe("matchRoute", () => {
  const routes = [
    { pattern: "/" },
    { pattern: "/tasks" },
    { pattern: "/tasks/new" },
    { pattern: "/tasks/:id" },
    { pattern: "/a/:x/:y" },
  ];

  test("matches exact segments", () => {
    expect(matchRoute("/tasks", routes)?.route.pattern).toBe("/tasks");
  });

  test("root", () => {
    expect(matchRoute("/", routes)?.route.pattern).toBe("/");
  });

  test("static wins over dynamic when listed first", () => {
    expect(matchRoute("/tasks/new", routes)?.route.pattern).toBe("/tasks/new");
  });

  test("extracts params", () => {
    expect(matchRoute("/tasks/42", routes)?.params).toEqual({ id: "42" });
    expect(matchRoute("/a/1/2", routes)?.params).toEqual({ x: "1", y: "2" });
  });

  test("decodes params", () => {
    expect(matchRoute("/tasks/a%20b", routes)?.params).toEqual({ id: "a b" });
  });

  test("malformed percent-encoding falls back to the raw segment, no throw", () => {
    expect(matchRoute("/tasks/100%", routes)?.params).toEqual({ id: "100%" });
    expect(matchRoute("/tasks/%zz", routes)?.params).toEqual({ id: "%zz" });
  });

  test("static unicode segments match their encoded form", () => {
    const unicodeRoutes = [{ pattern: "/città" }, { pattern: "/docs/héllo" }];
    expect(matchRoute("/citt%C3%A0", unicodeRoutes)?.route.pattern).toBe("/città");
    expect(matchRoute("/docs/h%C3%A9llo", unicodeRoutes)?.route.pattern).toBe("/docs/héllo");
    expect(matchRoute("/città", unicodeRoutes)?.route.pattern).toBe("/città");
  });

  test("ignores trailing slashes", () => {
    expect(matchRoute("/tasks/", routes)?.route.pattern).toBe("/tasks");
    expect(matchRoute("/tasks///", routes)?.route.pattern).toBe("/tasks");
  });

  test("doubled slashes are not an alias of the single-slash route", () => {
    expect(matchRoute("//tasks", routes)).toBeNull();
    expect(matchRoute("//tasks/42", routes)).toBeNull();
    expect(matchRoute("/a//2", routes)).toBeNull();
    expect(matchRoute("/tasks//42", routes)).toBeNull();
  });

  test("an empty segment never binds a param", () => {
    expect(matchRoute("/a/1//", routes)).toBeNull();
  });

  test("returns null when nothing matches", () => {
    expect(matchRoute("/nope/nope", routes)).toBeNull();
    expect(matchRoute("/tasks/1/2", routes)).toBeNull();
  });
});

describe("resolveHead", () => {
  const component = () => null;

  test("object head", () => {
    expect(resolveHead({ default: component, head: { title: "x" } }, {})).toEqual({ title: "x" });
  });

  test("function head receives props", () => {
    const module = {
      default: component,
      head: (props: Record<string, unknown>) => ({ title: `t:${props.name}` }),
    };
    expect(resolveHead(module, { name: "n" })).toEqual({ title: "t:n" });
  });

  test("absent head", () => {
    expect(resolveHead({ default: component }, {})).toEqual({});
  });
});
