#!/bin/bash
set -e
exec > /var/log/bastion-init.log 2>&1
echo "[bastion] installing postgresql15 client..."
dnf install -y postgresql15
echo "[bastion] ready" > /tmp/bastion-ready
echo "[bastion] init complete at $(date -Iseconds)"
