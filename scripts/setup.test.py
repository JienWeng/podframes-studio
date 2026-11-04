"""Safe setup checks: mock installers/services; never install or generate media."""
import os
import plistlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class SetupTest(unittest.TestCase):
    def test_macos_install_preserves_configuration_and_writes_valid_services(self):
        self.exercise_setup("Darwin")

    def test_ubuntu_install_preserves_configuration_and_writes_user_services(self):
        self.exercise_setup("Linux")

    def exercise_setup(self, platform):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        with tempfile.TemporaryDirectory(prefix="podframes-setup-") as directory:
            base = Path(directory)
            home = base / "home"
            root = home / "podframes"
            scripts = root / "scripts"
            binary = home / ".local/bin"
            brew = base / "brew/bin"
            for path in (scripts, binary, brew):
                path.mkdir(parents=True)
            shutil.copy(Path(__file__).with_name("setup.sh"), scripts)
            (brew / "node").symlink_to(node)
            (binary / "node").symlink_to(node)
            mocks = {
                "uname": 'if [ "${1:-}" = -m ]; then echo x86_64; else echo "$MOCK_PLATFORM"; fi',
                "id": 'if [ "${1:-}" = -u ]; then echo 501; else echo testuser; fi',
                "brew": 'if [ "${1:-}" = --prefix ]; then echo "$MOCK_BREW"; fi',
                "npm": 'echo npm >> "$MOCK_CALLS"',
                "npx": "exit 0",
                "pnpm": 'echo "pnpm $*" >> "$MOCK_CALLS"; if [ "${1:-}" = build:web ]; then mkdir -p apps/web/.next; echo built > apps/web/.next/BUILD_ID; fi',
                "curl": 'while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then shift; echo model > "$1"; fi; shift; done',
                "plutil": "exit 0",
                "launchctl": 'echo "launchctl $*" >> "$MOCK_CALLS"; if [ "${1:-}" = print ]; then exit 1; fi',
                "sudo": 'echo "sudo $*" >> "$MOCK_CALLS"',
                "systemctl": 'echo "systemctl $*" >> "$MOCK_CALLS"',
                "whisper-cli": "exit 0",
            }
            for name, body in mocks.items():
                target = (brew if name in ("npm", "npx") else binary) / name
                target.write_text("#!/bin/bash\nset -eu\n" + body + "\n")
                target.chmod(0o700)
                if name in ("npm", "npx"):
                    (binary / name).symlink_to(target)
            # Supply a fixture OS release instead of reading the test host's OS.
            bash_env = base / "bash-env"
            bash_env.write_text('function .() { if [[ "$1" == /etc/os-release ]]; then ID=ubuntu; VERSION_ID=24.04; else builtin . "$@"; fi; }\n')
            env = {**os.environ, "HOME": str(home), "MOCK_BREW": str(brew.parent),
                   "MOCK_CALLS": str(base / "calls"), "MOCK_PLATFORM": platform,
                   "BASH_ENV": str(bash_env), "PATH": f"{binary}:{os.environ['PATH']}"}

            def run(*args):
                result = subprocess.run(["/bin/bash", str(scripts / "setup.sh"), *args],
                                        env=env, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)

            run()
            configuration = (root / ".env.local").read_text()
            self.assertRegex(configuration, r"PODFRAMES_API_TOKEN=[a-f0-9]{64}\n")
            self.assertIn("PRODUCER_BROWSER_GPU_MODE=" + ("software" if platform == "Linux" else "hardware"), configuration)
            self.assertEqual((root / ".env.local").stat().st_mode & 0o777, 0o600)
            (root / ".env.local").write_text(configuration + "REPLICATE_API_KEY=keep-this\n")
            run()
            self.assertEqual((root / ".env.local").read_text(), configuration + "REPLICATE_API_KEY=keep-this\n")
            run("services")
            for name in ("web", "worker"):
                if platform == "Darwin":
                    plist = home / f"Library/LaunchAgents/com.podframes.{name}.plist"
                    data = plistlib.loads(plist.read_bytes())
                    self.assertEqual(data["ProgramArguments"], ["/bin/bash", str(root / "scripts/run-service.sh"), name])
                    self.assertEqual(data["WorkingDirectory"], str(root))
                    self.assertFalse(data["KeepAlive"]["SuccessfulExit"])
                else:
                    unit = (home / f".config/systemd/user/podframes-{name}.service").read_text()
                    self.assertIn(f"ExecStart=/bin/bash {root}/scripts/run-service.sh {name}", unit)
                    self.assertIn("KillMode=control-group", unit)
            calls = (base / "calls").read_text()
            self.assertIn("pnpm install --frozen-lockfile", calls)
            self.assertNotIn("podframes generate", calls)
            self.assertNotIn("bootout", calls)
            if platform == "Linux":
                self.assertIn("sudo loginctl enable-linger testuser", calls)
                self.assertIn("systemctl --user enable --now podframes-web podframes-worker", calls)

    def test_unknown_action_fails_before_installation(self):
        result = subprocess.run(["bash", str(Path(__file__).with_name("setup.sh")), "unknown"],
                                text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Usage:", result.stderr)


if __name__ == "__main__":
    unittest.main()
