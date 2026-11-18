#!/usr/bin/env bash
# Run Gradle inside Docker (JDK 21), so nothing needs installing on the host.
# Testcontainers reaches the host Docker engine through the shared socket and
# connects to the containers it starts through host.docker.internal.
#
# Usage: scripts/gradle.sh test
#        scripts/gradle.sh test --tests '*RosterLinkTest'
set -euo pipefail
cd "$(dirname "$0")/.."

HOST_DIR="$(pwd -W 2>/dev/null || pwd)"   # Windows path under Git Bash, POSIX path elsewhere

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "${HOST_DIR}:/app" -w /app \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v player-tiers-gradle-cache:/home/gradle/.gradle \
  -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  -e TESTCONTAINERS_RYUK_DISABLED=true \
  gradle:8.10.2-jdk21 gradle --no-daemon --console=plain "$@"
