FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS builder
ENV ORCA_BACKGROUND_LAUNCH=1 ORCA_CLI_BUILD_COMPILER=tsrs CI=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY config ./config
COPY native ./native
COPY src ./src
COPY resources ./resources
COPY mobile ./mobile
COPY packages/ab-control ./packages/ab-control
COPY packages/ab-local-runtime ./packages/ab-local-runtime
COPY packages/ab-context-bridge ./packages/ab-context-bridge
COPY LICENSE ./LICENSE
COPY deploy/ab-brainmaster/licenses ./deploy/ab-brainmaster/licenses
RUN npm install --global pnpm@12.14.0 && pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm run build:packages
RUN cd mobile && pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --dir mobile run postinstall
RUN npm ci --prefix packages/ab-control --ignore-scripts --no-audit --no-fund
RUN npm ci --prefix packages/ab-context-bridge --ignore-scripts --no-audit --no-fund
RUN pnpm run build:mobile-web && pnpm run build:orcad && node packages/ab-control/build.mjs && node packages/ab-local-runtime/build.mjs
RUN node config/scripts/ab-release-package.mjs /opt/ab-release 0.1.0 > /tmp/release.json && node -e "const fs=require('node:fs');fs.writeFileSync('/opt/ab-release.sha256',JSON.parse(fs.readFileSync('/tmp/release.json')).digest+'\n')"

FROM builder AS acceptance
RUN node --test --test-isolation=none packages/ab-control/tests/*.test.mjs packages/ab-control/tests/*.integration.mjs
RUN node config/scripts/runtime-serve-terminal-smoke.mjs --target orcad

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates tini && rm -rf /var/lib/apt/lists/*
COPY --from=builder /opt/ab-release /opt/ab-release
COPY --from=builder /opt/ab-release.sha256 /opt/ab-release.sha256
COPY config/scripts/ab-release-manifest.mjs config/scripts/ab-release-store.mjs config/scripts/ab-release-cli.mjs /opt/ab-deploy/
COPY packages/ab-control/credentials.mjs packages/ab-control/contract.mjs deploy/ab-brainmaster/entrypoint.mjs /opt/ab-deploy/
RUN mkdir -p /var/lib/ab-brainmaster /workspaces /home/node/orca && ln -s /workspaces /home/node/orca/workspaces && chown -R node:node /var/lib/ab-brainmaster /workspaces /home/node
ENV ORCA_BACKGROUND_LAUNCH=1 AB_CONTROL_CONTAINER=1 AB_CONTROL_PORT=8080 AB_RUNTIME_PORT=8081
USER node
WORKDIR /workspaces
EXPOSE 8080 8081
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=3 CMD ["node", "/opt/ab-release/ab-control/cli.mjs", "status"]
ENV AB_CONTROL_URL=http://127.0.0.1:8080 AB_CONTROL_TOKEN_FILE=/var/lib/ab-brainmaster/control-token
ENTRYPOINT ["/usr/bin/tini", "--", "node", "/opt/ab-deploy/entrypoint.mjs"]
