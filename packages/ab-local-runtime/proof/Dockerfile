FROM ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps libstdc++6 && rm -rf /var/lib/apt/lists/*
ARG AB_PROOF_UID=10001
ARG AB_PROOF_GID=10001
RUN test "$AB_PROOF_UID" -ge 1000 && test "$AB_PROOF_GID" -gt 0 \
    && (getent group "$AB_PROOF_GID" >/dev/null || groupadd --gid "$AB_PROOF_GID" ab-proof) \
    && if getent passwd "$AB_PROOF_UID" >/dev/null; then \
      ab_proof_account="$(getent passwd "$AB_PROOF_UID" | cut -d: -f1)"; \
      usermod --gid "$AB_PROOF_GID" "$ab_proof_account"; \
    else \
      useradd --uid "$AB_PROOF_UID" --gid "$AB_PROOF_GID" --create-home --shell /bin/bash ab-proof; \
    fi \
    && ab_proof_account_home="$(getent passwd "$AB_PROOF_UID" | cut -d: -f6)" \
    && test -n "$ab_proof_account_home" && mkdir -p "$ab_proof_account_home" \
    && chown "$AB_PROOF_UID:$AB_PROOF_GID" "$ab_proof_account_home"
COPY repo /proof/repo
COPY bbrainx /proof/bbrainx
COPY ollama /proof/ollama
COPY --chown=$AB_PROOF_UID:$AB_PROOF_GID models /proof/models
RUN mkdir -p /proof/repo/node_modules/@orca && ln -s /proof/repo/src/packages/process-host /proof/repo/node_modules/@orca/process-host && ln -s "/proof/repo/out/runtimes/node-$(cat /proof/repo/out/orcad/.runtime-node)/bin/node" /usr/local/bin/node
ENV ORCA_BACKGROUND_LAUNCH=1 AB_PROOF_DIRECTORY=/evidence
ENV AB_PROOF_EXPECTED_UID=$AB_PROOF_UID AB_PROOF_EXPECTED_GID=$AB_PROOF_GID
USER $AB_PROOF_UID:$AB_PROOF_GID
WORKDIR /proof/repo
ENTRYPOINT ["node", "packages/ab-local-runtime/proof/container-entry.mjs"]
