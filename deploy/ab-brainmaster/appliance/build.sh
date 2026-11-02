#!/bin/bash
set -euo pipefail
release=${1:?Release directory required}
digest_file=${2:?Manifest digest file required}
output=${3:?Output directory required}
source_root=$(cd "$(dirname "$0")/../../.." && pwd)
test "$(id -u)" = 0
test ! -e /build/config
node_hash=$(cat "$release/orcad/.runtime-node")
test ${#node_hash} = 64
"$release/runtimes/node-$node_hash/bin/node" --input-type=module -e 'const {verifyRelease}=await import(process.argv[1]);const fs=await import("node:fs/promises");await verifyRelease(process.argv[2],(await fs.readFile(process.argv[3],"utf8")).trim())' "file://$source_root/config/scripts/ab-release-manifest.mjs" "$release" "$digest_file"
lb config --mode debian --distribution bookworm --architectures amd64 --linux-flavours amd64 --binary-images iso-hybrid --archive-areas main --apt-recommends false --debian-installer none --memtest none --firmware-binary false --firmware-chroot false --iso-volume AB_BRAINMASTER --bootappend-live 'boot=live persistence console=tty0 console=ttyS0,115200n8'
mkdir -p config/package-lists config/includes.chroot/opt/ab-release config/includes.chroot/opt/ab-deploy config/includes.chroot/etc/systemd/system config/includes.chroot/etc/ssh config/hooks/normal
cat > config/package-lists/ab.list.chroot <<'PACKAGES'
linux-image-amd64
live-boot
systemd-sysv
ca-certificates
git
openssh-server
sudo
libstdc++6
PACKAGES
cp -a "$release/." config/includes.chroot/opt/ab-release/
cp "$digest_file" config/includes.chroot/opt/ab-release.sha256
cp "$source_root"/config/scripts/ab-release-{manifest,store,cli}.mjs config/includes.chroot/opt/ab-deploy/
cp "$source_root"/packages/ab-control/{credentials,contract}.mjs config/includes.chroot/opt/ab-deploy/
cp "$source_root/deploy/ab-brainmaster/entrypoint.mjs" config/includes.chroot/opt/ab-deploy/
cp "$source_root/deploy/ab-brainmaster/appliance/acceptance.mjs" config/includes.chroot/opt/ab-deploy/
cp "$source_root/deploy/ab-brainmaster/appliance/ab-brainmaster.service" config/includes.chroot/etc/systemd/system/
cp "$source_root/deploy/ab-brainmaster/appliance/ab-acceptance.service" config/includes.chroot/etc/systemd/system/
cp "$source_root/deploy/ab-brainmaster/appliance/ab-admin-ssh.service" config/includes.chroot/etc/systemd/system/
cp "$source_root/deploy/ab-brainmaster/appliance/sshd_config" config/includes.chroot/etc/ssh/sshd_config_ab
cat > config/hooks/normal/0500-ab.hook.chroot <<HOOK
#!/bin/sh
set -eu
useradd --uid 1000 --create-home --shell /usr/sbin/nologin abbrainmaster
useradd --uid 1001 --create-home --shell /bin/bash abadmin
mkdir -p /var/lib/ab-brainmaster /workspaces /etc/ab-admin /home/abbrainmaster/orca
ln -s /workspaces /home/abbrainmaster/orca/workspaces
chown -R abbrainmaster:abbrainmaster /var/lib/ab-brainmaster /workspaces /home/abbrainmaster
ln -s /opt/ab-release/runtimes/node-$node_hash/bin/node /usr/local/bin/node
printf '%s\n' 'abadmin ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/abadmin
chmod 0440 /etc/sudoers.d/abadmin
rm -f /etc/ssh/ssh_host_*
systemctl mask live-config.service ssh.service ssh.socket
systemctl enable ab-brainmaster.service ab-acceptance.service ab-admin-ssh.service
HOOK
chmod +x config/hooks/normal/0500-ab.hook.chroot
lb build
cp live-image-amd64.hybrid.iso "$output/ab-brainmaster-amd64.iso"
python3 "$source_root/deploy/ab-brainmaster/appliance/ci-boot-image.py" "$output/ab-brainmaster-amd64.iso" "$output/ab-brainmaster-ci-amd64.iso"
cd "$output"
sha256sum ab-brainmaster-amd64.iso > ab-brainmaster-amd64.iso.sha256
sha256sum ab-brainmaster-ci-amd64.iso > ab-brainmaster-ci-amd64.iso.sha256
