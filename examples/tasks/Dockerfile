# build from the repo root, so the workspace borgo packages are available:
#   docker build -f examples/tasks/Dockerfile -t borgo-tasks .
# a standalone app scaffolded by create-borgo uses its own generated
# dockerfile instead, which installs borgo from npm.
FROM golang:1.25 AS build
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo

COPY . .
RUN bun install --frozen-lockfile

ENV CGO_ENABLED=0
WORKDIR /repo/examples/tasks
RUN bun run build

RUN mkdir /out \
 && cp -r package.json index.html public pages islands .borgo dist /out/ \
 && cp -rL node_modules /out/node_modules \
 && rm -rf /out/node_modules/typescript /out/node_modules/@types /out/node_modules/.bin \
           /out/node_modules/borgo/node_modules/typescript /out/node_modules/borgo/node_modules/@types

FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/tasks.db
RUN mkdir /data && chown bun:bun /data
USER bun
COPY --from=build --chown=bun:bun /out /app
EXPOSE 3000
# node_modules is a dereferenced copy of the workspace, so the cli is
# invoked directly instead of through the .bin shim
CMD ["bun", "node_modules/borgo/src/cli.ts", "start"]
