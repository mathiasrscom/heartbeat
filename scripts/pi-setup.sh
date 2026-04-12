#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Heartbeat – Raspberry Pi 5 Kiosk Setup
# ============================================================================
# Run on a fresh Raspberry Pi OS Lite (64-bit) install:
#   chmod +x scripts/pi-setup.sh
#   sudo ./scripts/pi-setup.sh
#
# What this does:
#   1. Installs Docker + Docker Compose
#   2. Installs Ollama and pulls a small model
#   3. Installs a minimal Wayland kiosk (Cage + Chromium)
#   4. Creates systemd services for auto-start on boot
#   5. Configures dual-display kiosk pointing at the heartbeat app
# ============================================================================

APP_URL="${APP_URL:-http://localhost:3000}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
KIOSK_USER="${KIOSK_USER:-$(logname)}"

echo "╔══════════════════════════════════════════════╗"
echo "║  Heartbeat – Raspberry Pi 5 Setup            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  App URL:      $APP_URL"
echo "  Ollama model: $OLLAMA_MODEL"
echo "  Kiosk user:   $KIOSK_USER"
echo ""

# ── 1. System update ───────────────────────────────────────────────────
echo "→ Updating system packages..."
apt-get update && apt-get upgrade -y

# ── 2. Docker ──────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "$KIOSK_USER"
  systemctl enable docker
  echo "  ✓ Docker installed"
else
  echo "  ✓ Docker already installed"
fi

# ── 3. Ollama ──────────────────────────────────────────────────────────
if ! command -v ollama &>/dev/null; then
  echo "→ Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  systemctl enable ollama
  echo "  ✓ Ollama installed"
else
  echo "  ✓ Ollama already installed"
fi

echo "→ Pulling Ollama model: $OLLAMA_MODEL (this may take a few minutes)..."
ollama pull "$OLLAMA_MODEL"
echo "  ✓ Model ready"

# ── 4. Kiosk display stack ─────────────────────────────────────────────
echo "→ Installing kiosk display stack (Cage + Chromium)..."
apt-get install -y --no-install-recommends \
  cage \
  chromium-browser \
  fonts-noto \
  fonts-noto-color-emoji

# ── 5. Kiosk launch script ────────────────────────────────────────────
# This script is called by the systemd service. It launches Cage (a
# single-window Wayland compositor) with Chromium in kiosk mode.
# For dual displays, two separate services are created.

KIOSK_SCRIPT="/usr/local/bin/heartbeat-kiosk.sh"
cat > "$KIOSK_SCRIPT" << 'KIOSKEOF'
#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM="${1:-0}"
APP_URL="${APP_URL:-http://localhost:3000}"

# Select the Wayland output for this display
# Pi 5 HDMI ports are typically: HDMI-A-1 and HDMI-A-2
if [ "$DISPLAY_NUM" = "0" ]; then
  export WLR_OUTPUT="HDMI-A-1"
else
  export WLR_OUTPUT="HDMI-A-2"
fi

# Chromium flags for kiosk mode
CHROMIUM_FLAGS=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --disable-session-crashed-bubble
  --disable-component-update
  --no-first-run
  --autoplay-policy=no-user-gesture-required
  --start-fullscreen
  --ozone-platform=wayland
  "$APP_URL"
)

exec cage -- chromium-browser "${CHROMIUM_FLAGS[@]}"
KIOSKEOF
chmod +x "$KIOSK_SCRIPT"

# ── 6. Systemd service: heartbeat-kiosk (per display) ─────────────────
for DISPLAY_NUM in 0 1; do
  SERVICE_NAME="heartbeat-kiosk-${DISPLAY_NUM}"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Heartbeat Kiosk Display ${DISPLAY_NUM}
After=network-online.target docker.service
Wants=network-online.target

[Service]
User=${KIOSK_USER}
Environment=APP_URL=${APP_URL}
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u "$KIOSK_USER")
ExecStartPre=/bin/sleep 10
ExecStart=${KIOSK_SCRIPT} ${DISPLAY_NUM}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  echo "  ✓ Systemd service created: $SERVICE_NAME"
done

# ── 7. Disable screen blanking ─────────────────────────────────────────
# Prevent the displays from going to sleep
mkdir -p /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/no-idle.conf << 'EOF'
[Login]
IdleAction=ignore
EOF

# ── 8. Add swap on external storage (safety net for RAM) ───────────────
if ! swapon --show | grep -q /swapfile; then
  echo "→ Creating 2GB swap file..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  ✓ 2GB swap enabled"
else
  echo "  ✓ Swap already configured"
fi

# ── 9. Summary ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Setup complete!                              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Clone heartbeat to the Pi:"
echo "     git clone <your-repo> ~/heartbeat"
echo ""
echo "  2. Create your .env file:"
echo "     cp .env.production.example .env"
echo "     nano .env   # set your passwords"
echo ""
echo "  3. Start the app stack:"
echo "     cd ~/heartbeat"
echo "     docker compose -f docker-compose.production.yml up -d --build"
echo ""
echo "  4. Run database migrations:"
echo "     docker exec heartbeat-web npx drizzle-kit migrate"
echo ""
echo "  5. Reboot to start the kiosk displays:"
echo "     sudo reboot"
echo ""
echo "  The kiosk will auto-start on both displays after reboot."
echo "  Logs: journalctl -u heartbeat-kiosk-0 -f"
echo "        journalctl -u heartbeat-kiosk-1 -f"
echo ""
