#!/bin/bash
set -euo pipefail
destination=${1:?New disk image path required}
shift
test ! -e "$destination"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/var/lib/ab-brainmaster" "$stage/workspaces" "$stage/etc/ab-admin"
printf '%s\n' '/var/lib/ab-brainmaster' '/workspaces' '/etc/ab-admin' > "$stage/persistence.conf"
printf '%s\n' '1' > "$stage/var/lib/ab-brainmaster/.ab-persistence-enabled"
while test "$#" -gt 0; do
  case "$1" in
    --acceptance) printf '%s\n' '1' > "$stage/var/lib/ab-brainmaster/.ab-acceptance-enabled"; shift ;;
    --admin-key)
      test "$#" -ge 2
      ssh-keygen -l -f "$2" >/dev/null
      test "$(wc -l < "$2")" -le 1
      cp "$2" "$stage/etc/ab-admin/authorized_keys"
      chmod 0644 "$stage/etc/ab-admin/authorized_keys"
      shift 2 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
  esac
done
truncate -s 1G "$destination"
mkfs.ext4 -q -F -L persistence -d "$stage" "$destination"
for directory in /var/lib/ab-brainmaster /workspaces; do
  debugfs -w -R "set_inode_field $directory uid 1000" "$destination" >/dev/null 2>&1
  debugfs -w -R "set_inode_field $directory gid 1000" "$destination" >/dev/null 2>&1
done
for directory in / /etc /etc/ab-admin; do
  debugfs -w -R "set_inode_field $directory uid 0" "$destination" >/dev/null 2>&1
  debugfs -w -R "set_inode_field $directory gid 0" "$destination" >/dev/null 2>&1
done
if test -f "$stage/etc/ab-admin/authorized_keys"; then
  debugfs -w -R 'set_inode_field /etc/ab-admin/authorized_keys uid 0' "$destination" >/dev/null 2>&1
  debugfs -w -R 'set_inode_field /etc/ab-admin/authorized_keys gid 0' "$destination" >/dev/null 2>&1
fi
