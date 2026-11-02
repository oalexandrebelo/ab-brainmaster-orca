FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3
RUN apt-get update && apt-get install -y --no-install-recommends live-build debootstrap xorriso isolinux syslinux-common squashfs-tools grub-pc-bin grub-efi-amd64-bin mtools dosfstools ca-certificates python3 ripgrep libstdc++6 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
