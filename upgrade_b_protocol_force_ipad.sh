#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_NAME="upgrade_b_protocol_force_ipad.sh"
SCRIPT_VERSION="2.1.0"
CONTAINER_NAME="${YJC_CONTAINER_NAME:-yangjichang-server}"
BINARY_IN_CONTAINER="/home/yangjichang/main_linux_amd64_B"
ENTRYPOINT_IN_CONTAINER="/home/yangjichang/entrypoint.sh"
EXPECTED_SIZE=35517074

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

need_command() {
    command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

hex_at() {
    local file="$1"
    local offset="$2"
    local count="$3"
    od -An -v -tx1 -j "$offset" -N "$count" "$file" | tr -d ' \n'
}

ascii_at() {
    local file="$1"
    local offset="$2"
    local count="$3"
    dd if="$file" bs=1 skip="$offset" count="$count" status=none
}

write_hex() {
    local file="$1"
    local offset="$2"
    local escaped_bytes="$3"
    printf '%b' "$escaped_bytes" | dd of="$file" bs=1 seek="$offset" conv=notrunc status=none
}

mount_info_for() {
    local destination="$1"
    docker inspect "$CONTAINER_NAME" --format \
        "{{range .Mounts}}{{if eq .Destination \"$destination\"}}{{.Type}}|{{.Source}}{{end}}{{end}}"
}

replace_file_atomically() {
    local source="$1"
    local destination="$2"
    local temporary="${destination}.force_ipad.new.$$"
    cp -a "$source" "$temporary"
    chmod 755 "$temporary"
    mv -f "$temporary" "$destination"
}

if [[ "${EUID}" -ne 0 ]]; then
    fail "run this script as root: sudo -i, then bash $SCRIPT_NAME"
fi

for command_name in docker od dd sha256sum stat grep awk cmp; do
    need_command "$command_name"
done

docker inspect "$CONTAINER_NAME" >/dev/null 2>&1 || fail "container not found: $CONTAINER_NAME"

COMPOSE_DIR="$(docker inspect "$CONTAINER_NAME" --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')"
SERVICE_NAME="$(docker inspect "$CONTAINER_NAME" --format '{{ index .Config.Labels "com.docker.compose.service" }}')"

[[ -n "$COMPOSE_DIR" && -d "$COMPOSE_DIR" ]] || fail "cannot determine the Docker Compose directory"
[[ -n "$SERVICE_NAME" ]] || fail "cannot determine the Docker Compose service name"
[[ "$SERVICE_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || fail "unsupported Compose service name: $SERVICE_NAME"
[[ -f "$COMPOSE_DIR/docker-compose.yml" || -f "$COMPOSE_DIR/compose.yml" ]] || fail "Compose file not found in $COMPOSE_DIR"

cd "$COMPOSE_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$COMPOSE_DIR/backups/b_protocol_force_ipad_$TIMESTAMP"
PATCH_DIR="$COMPOSE_DIR/patches"
SOURCE_BINARY="$BACKUP_DIR/main_linux_amd64_B.before"
PATCHED_BINARY="$PATCH_DIR/main_linux_amd64_B"
SOURCE_ENTRYPOINT="$BACKUP_DIR/entrypoint.sh.before"
PATCHED_ENTRYPOINT="$PATCH_DIR/entrypoint-bfix.sh"
OVERRIDE_FILE="$COMPOSE_DIR/docker-compose.override.yml"
OVERRIDE_BACKUP="$BACKUP_DIR/docker-compose.override.yml.before"
OVERRIDE_MARKER="# managed by upgrade_b_protocol_force_ipad.sh"
OVERRIDE_BLOCK_MARKER="# B protocol mounts managed by upgrade_b_protocol_force_ipad.sh"

mkdir -p "$BACKUP_DIR" "$PATCH_DIR"

docker cp "$CONTAINER_NAME:$BINARY_IN_CONTAINER" "$SOURCE_BINARY"
docker cp "$CONTAINER_NAME:$ENTRYPOINT_IN_CONTAINER" "$SOURCE_ENTRYPOINT"

SOURCE_SIZE="$(stat -c '%s' "$SOURCE_BINARY")"
[[ "$SOURCE_SIZE" -eq "$EXPECTED_SIZE" ]] || fail "unexpected B binary size: $SOURCE_SIZE (expected $EXPECTED_SIZE)"
[[ "$(hex_at "$SOURCE_BINARY" 0 4)" == "7f454c46" ]] || fail "B binary is not ELF"
[[ "$(hex_at "$SOURCE_BINARY" 4 1)" == "02" ]] || fail "B binary is not ELF64"
[[ "$(hex_at "$SOURCE_BINARY" 18 2)" == "3e00" ]] || fail "B binary is not x86-64"

TARGET_VERSION_HEX="224b0018"
OLD_VERSION_HEX="310f001f"
for offset in $((0x17685F8)) $((0x17685FC)) $((0x1768600)); do
    current="$(hex_at "$SOURCE_BINARY" "$offset" 4)"
    [[ "$current" == "$OLD_VERSION_HEX" || "$current" == "$TARGET_VERSION_HEX" ]] || \
        fail "unexpected version bytes at offset $(printf '0x%X' "$offset"): $current"
done

OLD_BRANCH_HEX="0f858b000000"
TARGET_BRANCH_HEX="e98c00000090"
branch="$(hex_at "$SOURCE_BINARY" $((0x87B428)) 6)"
[[ "$branch" == "$OLD_BRANCH_HEX" || "$branch" == "$TARGET_BRANCH_HEX" ]] || \
    fail "unexpected Mac/iPad branch bytes: $branch"

device_type="$(ascii_at "$SOURCE_BINARY" $((0xBCF77E)) 17)"
[[ "$device_type" == "Ipad iPadOS15.7.9" || "$device_type" == "iPad iPadOS18.8.1" ]] || \
    fail "unexpected iPad device type at offset 0xBCF77E: $device_type"

os_version="$(ascii_at "$SOURCE_BINARY" $((0xBBFD85)) 6)"
[[ "$os_version" == "15.7.9" || "$os_version" == "18.8.1" ]] || \
    fail "unexpected iPad OS version at offset 0xBBFD85: $os_version"

SOURCE_SHA256="$(sha256sum "$SOURCE_BINARY" | awk '{print $1}')"
cp -a "$SOURCE_BINARY" "$PATCHED_BINARY.new"

for offset in $((0x17685F8)) $((0x17685FC)) $((0x1768600)); do
    write_hex "$PATCHED_BINARY.new" "$offset" '\x22\x4B\x00\x18'
done
write_hex "$PATCHED_BINARY.new" $((0x87B428)) '\xE9\x8C\x00\x00\x00\x90'
write_hex "$PATCHED_BINARY.new" $((0xBCF77E)) 'iPad iPadOS18.8.1'
write_hex "$PATCHED_BINARY.new" $((0xBBFD85)) '18.8.1'
chmod 755 "$PATCHED_BINARY.new"

for offset in $((0x17685F8)) $((0x17685FC)) $((0x1768600)); do
    [[ "$(hex_at "$PATCHED_BINARY.new" "$offset" 4)" == "$TARGET_VERSION_HEX" ]] || \
        fail "version verification failed at $(printf '0x%X' "$offset")"
done
[[ "$(hex_at "$PATCHED_BINARY.new" $((0x87B428)) 6)" == "$TARGET_BRANCH_HEX" ]] || fail "branch verification failed"
[[ "$(ascii_at "$PATCHED_BINARY.new" $((0xBCF77E)) 17)" == "iPad iPadOS18.8.1" ]] || fail "device type verification failed"
[[ "$(ascii_at "$PATCHED_BINARY.new" $((0xBBFD85)) 6)" == "18.8.1" ]] || fail "OS version verification failed"
[[ "$(stat -c '%s' "$PATCHED_BINARY.new")" -eq "$EXPECTED_SIZE" ]] || fail "patched file size changed"

mv -f "$PATCHED_BINARY.new" "$PATCHED_BINARY"
PATCHED_SHA256="$(sha256sum "$PATCHED_BINARY" | awk '{print $1}')"

recursive_chmod_count="$(grep -Fxc 'chmod 755 -R "${APP_DIR}"' "$SOURCE_ENTRYPOINT" || true)"
safe_chmod_count="$(grep -Fxc 'chmod 755 "${APP_DIR}/${APP_NAME}"' "$SOURCE_ENTRYPOINT" || true)"

if [[ "$recursive_chmod_count" -eq 1 && "$safe_chmod_count" -eq 0 ]]; then
    awk '
        $0 == "chmod 755 -R \"${APP_DIR}\"" {
            print "chmod 755 \"${APP_DIR}/${APP_NAME}\""
            print "chmod 755 \"${APP_DIR}/main_linux_amd64\" 2>/dev/null || true"
            print "chmod 755 \"${APP_DIR}/main_linux_amd64_B\" 2>/dev/null || true"
            print "chmod 755 \"${APP_DIR}/main_linux_arm64\" 2>/dev/null || true"
            replaced = 1
            next
        }
        { print }
        END { if (!replaced) exit 42 }
    ' "$SOURCE_ENTRYPOINT" > "$PATCHED_ENTRYPOINT.new"
elif [[ "$recursive_chmod_count" -eq 0 && "$safe_chmod_count" -eq 1 ]]; then
    cp -a "$SOURCE_ENTRYPOINT" "$PATCHED_ENTRYPOINT.new"
else
    fail "entrypoint layout is not supported; recursive=$recursive_chmod_count safe=$safe_chmod_count"
fi
chmod 755 "$PATCHED_ENTRYPOINT.new"
mv -f "$PATCHED_ENTRYPOINT.new" "$PATCHED_ENTRYPOINT"

OVERRIDE_EXISTED=0
if [[ -e "$OVERRIDE_FILE" ]]; then
    OVERRIDE_EXISTED=1
    cp -a "$OVERRIDE_FILE" "$OVERRIDE_BACKUP"
fi

B_MOUNT_INFO="$(mount_info_for "$BINARY_IN_CONTAINER")"
B_MOUNT_TYPE=""
B_MOUNT_SOURCE=""
if [[ -n "$B_MOUNT_INFO" ]]; then
    B_MOUNT_TYPE="${B_MOUNT_INFO%%|*}"
    B_MOUNT_SOURCE="${B_MOUNT_INFO#*|}"
    [[ "$B_MOUNT_TYPE" == "bind" ]] || \
        fail "$BINARY_IN_CONTAINER is mounted as type '$B_MOUNT_TYPE'; only a host bind mount can be upgraded safely"
    [[ "$B_MOUNT_SOURCE" == /* && -f "$B_MOUNT_SOURCE" ]] || \
        fail "active B bind-mount source is not a regular absolute file: $B_MOUNT_SOURCE"
    [[ "$(sha256sum "$B_MOUNT_SOURCE" | awk '{print $1}')" == "$SOURCE_SHA256" ]] || \
        fail "active B bind-mount source changed while the upgrade was being prepared"
fi

ENTRYPOINT_MOUNT_INFO="$(mount_info_for "$ENTRYPOINT_IN_CONTAINER")"
ENTRYPOINT_MOUNT_TYPE=""
ENTRYPOINT_MOUNT_SOURCE=""
NEED_ENTRYPOINT_OVERRIDE=0
if [[ -n "$ENTRYPOINT_MOUNT_INFO" ]]; then
    ENTRYPOINT_MOUNT_TYPE="${ENTRYPOINT_MOUNT_INFO%%|*}"
    ENTRYPOINT_MOUNT_SOURCE="${ENTRYPOINT_MOUNT_INFO#*|}"
fi

if [[ -n "$B_MOUNT_SOURCE" && "$recursive_chmod_count" -eq 1 ]]; then
    if [[ -z "$ENTRYPOINT_MOUNT_INFO" ]]; then
        NEED_ENTRYPOINT_OVERRIDE=1
    else
        [[ "$ENTRYPOINT_MOUNT_TYPE" == "bind" ]] || \
            fail "$ENTRYPOINT_IN_CONTAINER is mounted as type '$ENTRYPOINT_MOUNT_TYPE'; only a host bind mount can be upgraded safely"
        [[ "$ENTRYPOINT_MOUNT_SOURCE" == /* && -f "$ENTRYPOINT_MOUNT_SOURCE" ]] || \
            fail "active entrypoint bind-mount source is not a regular absolute file: $ENTRYPOINT_MOUNT_SOURCE"
        [[ "$(sha256sum "$ENTRYPOINT_MOUNT_SOURCE" | awk '{print $1}')" == "$(sha256sum "$SOURCE_ENTRYPOINT" | awk '{print $1}')" ]] || \
            fail "active entrypoint bind-mount source changed while the upgrade was being prepared"
    fi
fi

SUCCESS=0
OVERRIDE_CHANGED=0
BIND_BINARY_CHANGED=0
BIND_ENTRYPOINT_CHANGED=0
BIND_BINARY_BACKUP="$BACKUP_DIR/main_linux_amd64_B.bind-source.before"
BIND_ENTRYPOINT_BACKUP="$BACKUP_DIR/entrypoint.bind-source.before"
DEPLOYMENT_MODE=""
ACTIVE_HOST_BINARY=""

rollback_on_failure() {
    local status=$?
    trap - EXIT
    if [[ "$SUCCESS" -ne 1 ]]; then
        set +e
        echo "Upgrade failed; restoring the previous B deployment..." >&2
        if [[ "$BIND_BINARY_CHANGED" -eq 1 ]]; then
            replace_file_atomically "$BIND_BINARY_BACKUP" "$B_MOUNT_SOURCE"
        fi
        if [[ "$BIND_ENTRYPOINT_CHANGED" -eq 1 ]]; then
            replace_file_atomically "$BIND_ENTRYPOINT_BACKUP" "$ENTRYPOINT_MOUNT_SOURCE"
        fi
        if [[ "$OVERRIDE_CHANGED" -eq 1 ]]; then
            if [[ "$OVERRIDE_EXISTED" -eq 1 ]]; then
                cp -a "$OVERRIDE_BACKUP" "$OVERRIDE_FILE"
            else
                rm -f "$OVERRIDE_FILE"
            fi
        fi
        docker compose up -d --no-deps --force-recreate --pull never "$SERVICE_NAME" >/dev/null 2>&1 || true
    fi
    exit "$status"
}
trap rollback_on_failure EXIT

if [[ -n "$B_MOUNT_SOURCE" ]]; then
    DEPLOYMENT_MODE="existing-bind-mount"
    if [[ "$NEED_ENTRYPOINT_OVERRIDE" -eq 1 ]]; then
        DEPLOYMENT_MODE="existing-bind-mount+entrypoint-override"
    fi
    ACTIVE_HOST_BINARY="$B_MOUNT_SOURCE"
    cp -a "$B_MOUNT_SOURCE" "$BIND_BINARY_BACKUP"
    replace_file_atomically "$PATCHED_BINARY" "$B_MOUNT_SOURCE"
    BIND_BINARY_CHANGED=1

    if [[ "$recursive_chmod_count" -eq 1 ]]; then
        if [[ "$NEED_ENTRYPOINT_OVERRIDE" -eq 0 ]]; then
            cp -a "$ENTRYPOINT_MOUNT_SOURCE" "$BIND_ENTRYPOINT_BACKUP"
            replace_file_atomically "$PATCHED_ENTRYPOINT" "$ENTRYPOINT_MOUNT_SOURCE"
            BIND_ENTRYPOINT_CHANGED=1
        else
            [[ -e "$OVERRIDE_FILE" ]] || \
                fail "the B bind mount needs an entrypoint companion mount, but $OVERRIDE_FILE does not exist"
            if grep -Fq ":$ENTRYPOINT_IN_CONTAINER" "$OVERRIDE_FILE"; then
                fail "$OVERRIDE_FILE already declares the entrypoint target but the running container is not using it"
            fi
            B_TARGET_DECL_COUNT="$(grep -Fc ":$BINARY_IN_CONTAINER" "$OVERRIDE_FILE" || true)"
            [[ "$B_TARGET_DECL_COUNT" -eq 1 ]] || \
                fail "$OVERRIDE_FILE must contain exactly one short-syntax B mount before the entrypoint mount can be merged"

            awk -v binary_target=":$BINARY_IN_CONTAINER" -v entrypoint="$ENTRYPOINT_IN_CONTAINER" \
                -v marker="$OVERRIDE_BLOCK_MARKER" '
                index($0, binary_target) && !inserted {
                    print
                    indent = $0
                    sub(/[^ ].*$/, "", indent)
                    print indent marker
                    print indent "- ./patches/entrypoint-bfix.sh:" entrypoint ":ro"
                    inserted = 1
                    next
                }
                { print }
                END { if (!inserted) exit 42 }
            ' "$OVERRIDE_FILE" > "$OVERRIDE_FILE.new.$$" || \
                fail "could not merge the entrypoint companion mount into $OVERRIDE_FILE"
            OVERRIDE_CHANGED=1
            mv -f "$OVERRIDE_FILE.new.$$" "$OVERRIDE_FILE"
        fi
    fi
else
    DEPLOYMENT_MODE="compose-override-mount"
    ACTIVE_HOST_BINARY="$PATCHED_BINARY"
    OVERRIDE_IS_MANAGED=0
    if [[ -e "$OVERRIDE_FILE" ]] && grep -Fq "$OVERRIDE_MARKER" "$OVERRIDE_FILE"; then
        OVERRIDE_IS_MANAGED=1
    fi

    if [[ ! -e "$OVERRIDE_FILE" || "$OVERRIDE_IS_MANAGED" -eq 1 ]]; then
        cat > "$OVERRIDE_FILE.new.$$" <<EOF
$OVERRIDE_MARKER
services:
  $SERVICE_NAME:
    volumes:
      - ./patches/main_linux_amd64_B:$BINARY_IN_CONTAINER:ro
      - ./patches/entrypoint-bfix.sh:$ENTRYPOINT_IN_CONTAINER:ro
EOF
    else
        if grep -Fq ":$BINARY_IN_CONTAINER" "$OVERRIDE_FILE"; then
            fail "$OVERRIDE_FILE already declares the B binary target but the running container is not using it"
        fi

        SERVICES_KEY_COUNT="$(grep -Ec '^services:[[:space:]]*(#.*)?$' "$OVERRIDE_FILE" || true)"
        [[ "$SERVICES_KEY_COUNT" -eq 1 ]] || \
            fail "$OVERRIDE_FILE must contain exactly one plain top-level services: key"

        SERVICE_ANY_COUNT="$(awk -v service="$SERVICE_NAME" '
            BEGIN { in_services = 0; count = 0 }
            /^services:[[:space:]]*(#.*)?$/ { in_services = 1; next }
            /^[^[:space:]#][^:]*:/ { in_services = 0 }
            in_services && index($0, "  " service ":") == 1 { count++ }
            END { print count }
        ' "$OVERRIDE_FILE")"
        SERVICE_PLAIN_COUNT="$(awk -v service="$SERVICE_NAME" '
            BEGIN { in_services = 0; count = 0 }
            /^services:[[:space:]]*(#.*)?$/ { in_services = 1; next }
            /^[^[:space:]#][^:]*:/ { in_services = 0 }
            in_services && $0 ~ ("^  " service ":[[:space:]]*(#.*)?$") { count++ }
            END { print count }
        ' "$OVERRIDE_FILE")"

        [[ "$SERVICE_ANY_COUNT" -le 1 ]] || fail "$OVERRIDE_FILE contains the service '$SERVICE_NAME' more than once"
        if [[ "$SERVICE_ANY_COUNT" -eq 1 && "$SERVICE_PLAIN_COUNT" -ne 1 ]]; then
            fail "$OVERRIDE_FILE uses an unsupported inline or anchored definition for service '$SERVICE_NAME'"
        fi

        if [[ "$SERVICE_PLAIN_COUNT" -eq 0 ]]; then
            awk -v service="$SERVICE_NAME" -v binary="$BINARY_IN_CONTAINER" -v entrypoint="$ENTRYPOINT_IN_CONTAINER" \
                -v marker="$OVERRIDE_BLOCK_MARKER" '
                /^services:[[:space:]]*(#.*)?$/ && !inserted {
                    print
                    print "  " marker
                    print "  " service ":"
                    print "    volumes:"
                    print "      - ./patches/main_linux_amd64_B:" binary ":ro"
                    print "      - ./patches/entrypoint-bfix.sh:" entrypoint ":ro"
                    inserted = 1
                    next
                }
                { print }
                END { if (!inserted) exit 42 }
            ' "$OVERRIDE_FILE" > "$OVERRIDE_FILE.new.$$" || fail "could not merge B mounts into $OVERRIDE_FILE"
        else
            VOLUMES_ANY_COUNT="$(awk -v service="$SERVICE_NAME" '
                BEGIN { in_services = 0; in_service = 0; count = 0 }
                /^services:[[:space:]]*(#.*)?$/ { in_services = 1; next }
                /^[^[:space:]#][^:]*:/ { in_services = 0; in_service = 0 }
                in_services && $0 ~ ("^  " service ":[[:space:]]*(#.*)?$") { in_service = 1; next }
                in_services && in_service && /^  [^[:space:]#][^:]*:/ { in_service = 0 }
                in_service && /^    volumes:/ { count++ }
                END { print count }
            ' "$OVERRIDE_FILE")"
            VOLUMES_PLAIN_COUNT="$(awk -v service="$SERVICE_NAME" '
                BEGIN { in_services = 0; in_service = 0; count = 0 }
                /^services:[[:space:]]*(#.*)?$/ { in_services = 1; next }
                /^[^[:space:]#][^:]*:/ { in_services = 0; in_service = 0 }
                in_services && $0 ~ ("^  " service ":[[:space:]]*(#.*)?$") { in_service = 1; next }
                in_services && in_service && /^  [^[:space:]#][^:]*:/ { in_service = 0 }
                in_service && /^    volumes:[[:space:]]*(#.*)?$/ { count++ }
                END { print count }
            ' "$OVERRIDE_FILE")"

            [[ "$VOLUMES_ANY_COUNT" -le 1 ]] || fail "service '$SERVICE_NAME' contains more than one volumes key"
            if [[ "$VOLUMES_ANY_COUNT" -eq 1 && "$VOLUMES_PLAIN_COUNT" -ne 1 ]]; then
                fail "service '$SERVICE_NAME' uses an unsupported inline volumes definition"
            fi

            if [[ "$VOLUMES_PLAIN_COUNT" -eq 0 ]]; then
                awk -v service="$SERVICE_NAME" -v binary="$BINARY_IN_CONTAINER" -v entrypoint="$ENTRYPOINT_IN_CONTAINER" \
                    -v marker="$OVERRIDE_BLOCK_MARKER" '
                    $0 ~ ("^  " service ":[[:space:]]*(#.*)?$") && !inserted {
                        print
                        print "    " marker
                        print "    volumes:"
                        print "      - ./patches/main_linux_amd64_B:" binary ":ro"
                        print "      - ./patches/entrypoint-bfix.sh:" entrypoint ":ro"
                        inserted = 1
                        next
                    }
                    { print }
                    END { if (!inserted) exit 42 }
                ' "$OVERRIDE_FILE" > "$OVERRIDE_FILE.new.$$" || fail "could not add volumes to service '$SERVICE_NAME'"
            else
                awk -v service="$SERVICE_NAME" -v binary="$BINARY_IN_CONTAINER" -v entrypoint="$ENTRYPOINT_IN_CONTAINER" \
                    -v marker="$OVERRIDE_BLOCK_MARKER" '
                    BEGIN { in_services = 0; in_service = 0 }
                    /^services:[[:space:]]*(#.*)?$/ { in_services = 1 }
                    /^[^[:space:]#][^:]*:/ && $0 !~ /^services:/ { in_services = 0; in_service = 0 }
                    in_services && $0 ~ ("^  " service ":[[:space:]]*(#.*)?$") { in_service = 1 }
                    in_services && in_service && /^  [^[:space:]#][^:]*:/ && $0 !~ ("^  " service ":") { in_service = 0 }
                    {
                        print
                        if (in_service && /^    volumes:[[:space:]]*(#.*)?$/ && !inserted) {
                            print "      " marker
                            print "      - ./patches/main_linux_amd64_B:" binary ":ro"
                            print "      - ./patches/entrypoint-bfix.sh:" entrypoint ":ro"
                            inserted = 1
                        }
                    }
                    END { if (!inserted) exit 42 }
                ' "$OVERRIDE_FILE" > "$OVERRIDE_FILE.new.$$" || fail "could not append B mounts to service '$SERVICE_NAME'"
            fi
        fi
    fi

    OVERRIDE_CHANGED=1
    mv -f "$OVERRIDE_FILE.new.$$" "$OVERRIDE_FILE"
fi

docker compose config --quiet
docker compose up -d --no-deps --force-recreate --pull never "$SERVICE_NAME"

running="false"
for _ in $(seq 1 30); do
    running="$(docker inspect "$CONTAINER_NAME" --format '{{.State.Running}}' 2>/dev/null || true)"
    [[ "$running" == "true" ]] && break
    sleep 1
done
[[ "$running" == "true" ]] || fail "container did not become running"

ACTIVE_HOST_SHA256="$(sha256sum "$ACTIVE_HOST_BINARY" | awk '{print $1}')"
[[ "$ACTIVE_HOST_SHA256" == "$PATCHED_SHA256" ]] || fail "active host B binary does not match the prepared patch"
CONTAINER_SHA256="$(docker exec "$CONTAINER_NAME" sha256sum "$BINARY_IN_CONTAINER" | awk '{print $1}')"
[[ "$CONTAINER_SHA256" == "$PATCHED_SHA256" ]] || fail "container is not using the patched B binary"

restart_count="$(docker inspect "$CONTAINER_NAME" --format '{{.RestartCount}}')"
[[ "$restart_count" -eq 0 ]] || fail "container restart count is $restart_count"

cat > "$BACKUP_DIR/UPGRADE_RESULT.txt" <<EOF
Timestamp: $TIMESTAMP
Script version: $SCRIPT_VERSION
Compose directory: $COMPOSE_DIR
Container: $CONTAINER_NAME
Service: $SERVICE_NAME
Deployment mode: $DEPLOYMENT_MODE
Active host binary: $ACTIVE_HOST_BINARY
Source SHA256: $SOURCE_SHA256
Patched SHA256: $PATCHED_SHA256
ClientVersion: 0x18004B22
QR identity: forced iPad
DeviceType: iPad iPadOS18.8.1
OS version: 18.8.1
Container SHA256: $CONTAINER_SHA256
Restart count: $restart_count
EOF

SUCCESS=1
trap - EXIT

echo
echo "B protocol upgrade completed successfully."
echo "Script version    : $SCRIPT_VERSION"
echo "Compose directory : $COMPOSE_DIR"
echo "Backup directory  : $BACKUP_DIR"
echo "Deployment mode   : $DEPLOYMENT_MODE"
echo "Active host file  : $ACTIVE_HOST_BINARY"
echo "Source SHA256     : $SOURCE_SHA256"
echo "Patched SHA256    : $PATCHED_SHA256"
echo "Container SHA256  : $CONTAINER_SHA256"
echo "Restart count     : $restart_count"
echo "Next step         : refresh the web page, generate a NEW QR code, and scan it."
