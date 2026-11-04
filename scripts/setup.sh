#!/usr/bin/env bash
# Run as the account that will own the app and its provider logins.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
root="$PWD"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
action="${1:-install}"
case "$action" in install|services) ;; *) echo 'Usage: bash scripts/setup.sh [install|services]' >&2; exit 1 ;; esac
[[ "$EUID" -ne 0 ]] || { echo 'Run as a regular user with sudo access, not root.' >&2; exit 1; }
# Service formats require additional escaping for other path characters.
[[ "$root" =~ ^[a-zA-Z0-9_./-]+$ && "$HOME" =~ ^[a-zA-Z0-9_./-]+$ ]] || {
  echo 'Use a home and checkout path containing only letters, digits, _, ., / and -.' >&2; exit 1;
}
platform="$(uname -s)"
case "$platform" in
  Linux)
    . /etc/os-release
    [[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 && "$(uname -m)" == x86_64 ]] || {
      echo 'Linux setup supports Ubuntu 24.04 x86_64 only.' >&2; exit 1;
    }
    ;;
  Darwin) ;;
  *) echo 'Supported platforms: Ubuntu 24.04 x86_64 and macOS.' >&2; exit 1 ;;
esac

if [[ "$action" == services ]]; then
  [[ -s .env.local && -f apps/web/.next/BUILD_ID ]] || { echo 'Run setup install and complete configuration first.' >&2; exit 1; }
  if [[ "$platform" == Linux ]]; then
    mkdir -p "$HOME/.config/systemd/user"
    for name in web worker; do
      cat > "$HOME/.config/systemd/user/podframes-$name.service" <<EOF
[Unit]
Description=Podframes $name
After=network-online.target

[Service]
WorkingDirectory=$root
ExecStart=/bin/bash $root/scripts/run-service.sh $name
Restart=on-failure
RestartSec=10
TimeoutStopSec=300
KillMode=control-group
UMask=0077

[Install]
WantedBy=default.target
EOF
    done
    sudo loginctl enable-linger "$(id -un)"
    systemctl --user daemon-reload
    systemctl --user enable --now podframes-web podframes-worker
  else
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/Podframes"
    for name in web worker; do
      plist="$HOME/Library/LaunchAgents/com.podframes.$name.plist"
      cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.podframes.$name</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$root/scripts/run-service.sh</string><string>$name</string></array>
<key>WorkingDirectory</key><string>$root</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>10</integer>
<key>ExitTimeOut</key><integer>300</integer>
<key>StandardOutPath</key><string>$HOME/Library/Logs/Podframes/$name.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/Podframes/$name.error.log</string>
</dict></plist>
EOF
      plutil -lint "$plist"
      # Do not unload an existing worker: that could interrupt a paid job.
      if ! launchctl print "gui/$(id -u)/com.podframes.$name" >/dev/null 2>&1; then
        launchctl bootstrap "gui/$(id -u)" "$plist"
      fi
    done
  fi
  echo 'Services installed. Open http://localhost:3000/studio locally or through an SSH tunnel.'
  exit 0
fi

if [[ "$platform" == Darwin ]]; then
  command -v brew >/dev/null || { echo 'Install Homebrew from https://brew.sh, then rerun.' >&2; exit 1; }
  brew install node@22 ffmpeg whisper-cpp
  mkdir -p "$HOME/.local/bin"
  for binary in node npm npx; do
    ln -sfn "$(brew --prefix node@22)/bin/$binary" "$HOME/.local/bin/$binary"
  done
else
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl git xz-utils build-essential cmake ffmpeg dbus-user-session \
    libasound2t64 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 \
    libgbm1 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxfixes3 \
    libxkbcommon0 libxrandr2 fonts-liberation fonts-noto-cjk
  mkdir -p "$HOME/.local/bin" "$HOME/.local/share/podframes"
  if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
    temp="$(mktemp -d)"
    trap 'rm -rf "$temp"' EXIT
    curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "$temp/SHASUMS256.txt"
    archive="$(awk '$2 ~ /^node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ {print $2}' "$temp/SHASUMS256.txt")"
    [[ -n "$archive" && "$archive" != *$'\n'* ]] || { echo 'Cannot resolve Node 22 archive.' >&2; exit 1; }
    curl -fsSL "https://nodejs.org/dist/latest-v22.x/$archive" -o "$temp/$archive"
    (cd "$temp"; awk -v file="$archive" '$2 == file' SHASUMS256.txt | sha256sum -c -)
    tar -xJf "$temp/$archive" -C "$HOME/.local/share/podframes"
    for binary in node npm npx; do
      ln -sfn "$HOME/.local/share/podframes/${archive%.tar.xz}/bin/$binary" "$HOME/.local/bin/$binary"
    done
  fi
  if ! command -v whisper-cli >/dev/null; then
    whisper="$HOME/.local/share/podframes/whisper.cpp"
    if [[ ! -d "$whisper" ]]; then
      git clone --depth 1 --branch v1.8.2 https://github.com/ggml-org/whisper.cpp.git "$whisper"
    fi
    cmake -S "$whisper" -B "$whisper/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF
    cmake --build "$whisper/build" --config Release -j 2 --target whisper-cli
    ln -sfn "$whisper/build/bin/whisper-cli" "$HOME/.local/bin/whisper-cli"
  fi
fi

node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13))throw Error("Node 22.13+ required")'
npm install --global --prefix "$HOME/.local" pnpm@11.1.1 @openai/codex
mkdir -p "$HOME/.cache/podframes"
model="$HOME/.cache/podframes/ggml-base.bin"
if [[ ! -s "$model" ]]; then
  curl -fL --retry 3 https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin -o "$model.part"
  mv "$model.part" "$model"
fi
if [[ ! -e .env.local ]]; then
  token="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  gpu=hardware
  [[ "$platform" != Linux ]] || gpu=software
  # noclobber also protects an env file created concurrently.
  (set -o noclobber; printf 'PODFRAMES_API_TOKEN=%s\nPRODUCER_BROWSER_GPU_MODE=%s\n' "$token" "$gpu" > .env.local)
fi
chmod 600 .env.local
pnpm install --frozen-lockfile
pnpm --filter @podframes/core exec hyperframes browser ensure
pnpm build:web
echo 'Installed. Existing .env.local was preserved. Add your video provider key there.'
echo 'Next: export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"'
echo 'Then complete docs/SETUP.md account logins, run pnpm podframes doctor, and install services.'
