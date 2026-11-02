FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY repo /proof/repo
COPY bbrainx /proof/bbrainx
COPY ollama /proof/ollama
COPY models /proof/models
RUN mkdir -p /proof/repo/node_modules/@orca && ln -s /proof/repo/src/packages/process-host /proof/repo/node_modules/@orca/process-host && ln -s "/proof/repo/out/runtimes/node-$(cat /proof/repo/out/orcad/.runtime-node)/bin/node" /usr/local/bin/node
ENV ORCA_BACKGROUND_LAUNCH=1 AB_PROOF_DIRECTORY=/evidence
WORKDIR /proof/repo
ENTRYPOINT ["node", "packages/ab-local-runtime/proof/container-entry.mjs"]
