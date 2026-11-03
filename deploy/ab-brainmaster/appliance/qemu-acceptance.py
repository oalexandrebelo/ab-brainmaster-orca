import hashlib
import json
import pathlib
import re
import subprocess
import sys
import time

production_iso, ci_iso, disk, output = map(pathlib.Path, sys.argv[1:5])
output.mkdir(parents=True, exist_ok=True)
base = ['qemu-system-x86_64', '-accel', 'tcg,thread=multi', '-m', '4096', '-smp', '2', '-display', 'none', '-monitor', 'none', '-nic', 'none', '-no-reboot', '-boot', 'd', '-drive', f'file={disk.resolve()},format=raw,if=virtio']

def boot(iso, label, marker, stop_at_marker=False):
    log = output / f'qemu-{label}.log'
    started = time.monotonic()
    process = subprocess.Popen([*base, '-cdrom', str(iso), '-serial', f'file:{log}'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    found = False
    try:
        while time.monotonic() - started < 600:
            content = log.read_text(errors='replace') if log.exists() else ''
            if marker in content:
                found = True
                if stop_at_marker:
                    process.terminate()
                    break
            if 'AB_APPLIANCE_ACCEPTANCE_FAILED' in content:
                raise RuntimeError(f'{label}: guest acceptance failed')
            if process.poll() is not None:
                break
            time.sleep(1)
        if not found:
            raise RuntimeError(f'{label}: expected serial marker absent')
        if 'Initializing machine ID from D-Bus machine ID.' not in content:
            raise RuntimeError(f'{label}: systemd did not initialize the persisted machine ID')
        try:
            process.wait(timeout=60)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f'{label}: guest failed to power off after acceptance')
        if not stop_at_marker and process.returncode != 0:
            raise RuntimeError(f'{label}: QEMU exited {process.returncode}')
        return {
            'name': label,
            'marker': marker,
            'seconds': round(time.monotonic() - started, 2),
            'shutdown': 'host-terminated-after-ready' if stop_at_marker else 'guest-poweroff',
            'machineIdInitialization': 'persisted-dbus',
        }
    finally:
        if process.poll() is None:
            process.kill()
        process.wait()
        diagnostics = process.stderr.read().decode(errors='replace')
        if diagnostics:
            with log.open('a') as handle:
                handle.write('\nQEMU diagnostics:\n' + diagnostics)

receipts = []
receipts.append(boot(production_iso, 'production', 'ab_host_ready', True))
receipts.append(boot(ci_iso, 'first', 'AB_APPLIANCE_FIRST_BOOT_PASS'))
receipts.append(boot(ci_iso, 'second', 'AB_APPLIANCE_SECOND_BOOT_PASS'))
first = (output / 'qemu-first.log').read_text(errors='replace').split('AB_APPLIANCE_FIRST_BOOT_PASS ')[1].split()[0]
second = (output / 'qemu-second.log').read_text(errors='replace').split('AB_APPLIANCE_SECOND_BOOT_PASS ')[1].split()[0]
if first != second:
    raise RuntimeError('Installation identity differs across persistent boots')

def os_identity(label):
    marker = 'AB_APPLIANCE_OS_IDENTITY '
    entries = [
        json.loads(line.split(marker, 1)[1])
        for line in (output / f'qemu-{label}.log').read_text(errors='replace').splitlines()
        if marker in line
    ]
    if len(entries) != 1:
        raise RuntimeError(f'{label}: expected one operating system identity receipt')
    identity = entries[0]
    if (
        not isinstance(identity, dict)
        or identity.get('schemaVersion') != 1
        or not isinstance(identity.get('machineIdFingerprint'), str)
        or not re.fullmatch(r'[a-f0-9]{64}', identity['machineIdFingerprint'])
        or not isinstance(identity.get('bootId'), str)
        or not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', identity['bootId'])
    ):
        raise RuntimeError(f'{label}: invalid operating system identity receipt')
    return identity

first_os, second_os = os_identity('first'), os_identity('second')
if first_os['machineIdFingerprint'] != second_os['machineIdFingerprint'] or first_os['bootId'] == second_os['bootId']:
    raise RuntimeError('Operating system identity did not persist across distinct boots')
result = {
    'ok': True,
    'emulation': 'QEMU TCG',
    'network': 'none',
    'productionIsoSha256': hashlib.file_digest(production_iso.open('rb'), 'sha256').hexdigest(),
    'ciIsoSha256': hashlib.file_digest(ci_iso.open('rb'), 'sha256').hexdigest(),
    'persistentInstallationId': first,
    'osIdentity': {
        'machineIdFingerprint': first_os['machineIdFingerprint'],
        'fingerprintAlgorithm': 'HMAC-SHA-256',
        'fingerprintDomain': 'ab-brainmaster-appliance-machine-id-v1',
        'bootIds': [first_os['bootId'], second_os['bootId']],
        'initializedFromDbusEveryBoot': True,
    },
    'boots': receipts,
}
(output / 'appliance-receipt.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
