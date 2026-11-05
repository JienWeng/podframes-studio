#!/usr/bin/env python3
"""Private, unencrypted local backup. Stop generation before snapshotting assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3

ROOTS = ("projects", "library", "episodes", "examples/script-library", ".automation")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def files(root):
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink not allowed: {path}")
        if path.is_file():
            yield path


def verify(root):
    manifest = json.loads((root / "manifest.json").read_text())
    actual = {str(p.relative_to(root)): digest(p) for p in files(root) if p.name != "manifest.json"}
    if actual != manifest["sha256"]:
        raise ValueError("Backup file inventory or SHA256 mismatch")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("backup", "verify", "restore"))
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", nargs="?", type=Path)
    parser.add_argument("--confirm-generation-idle", action="store_true")
    args = parser.parse_args()
    os.umask(0o077)
    source = args.source.resolve()
    if args.action == "verify":
        result = verify(source)
        print(f"Verified {len(result['sha256'])} files")
        return
    if args.destination is None:
        parser.error("destination required")
    destination = args.destination.resolve()
    if destination == source or source in destination.parents:
        parser.error("destination must be outside source")
    if destination.exists():
        parser.error("destination must not exist; restore never overwrites")
    if args.action == "backup":
        if not args.confirm_generation_idle:
            parser.error("stop generation, then pass --confirm-generation-idle")
        destination.mkdir(parents=True, mode=0o700)
        for name in ROOTS:
            base = source / name
            if not base.exists():
                continue
            for path in files(base):
                relative = path.relative_to(source)
                if name == ".automation" and path.name.startswith("state.sqlite"):
                    continue
                if path.name.startswith(".env") or path.suffix == ".lock":
                    continue
                target = destination / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        database = source / ".automation/state.sqlite"
        if database.exists():
            target = destination / ".automation/state.sqlite"
            target.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as src:
                with sqlite3.connect(target) as dst:
                    src.backup(dst)
                    if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                        raise ValueError("SQLite integrity check failed")
        manifest = {"version": 1, "secretsIncluded": False, "sha256": {
            str(p.relative_to(destination)): digest(p) for p in files(destination)
        }}
        (destination / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        verify(destination)
        print(f"Backup verified: {len(manifest['sha256'])} files; unencrypted; secrets excluded")
    else:
        manifest = verify(source)
        destination.mkdir(parents=True, mode=0o700)
        for name in manifest["sha256"]:
            relative = Path(name)
            if relative.is_absolute() or ".." in relative.parts or relative.parts[0] not in {"projects", "library", "episodes", "examples", ".automation"}:
                raise ValueError("Unexpected backup path")
            target = destination / relative
            if relative.parts[0] == ".automation":
                target = destination / ".automation.recovery" / Path(*relative.parts[1:])
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / relative, target)
            if digest(target) != manifest["sha256"][name]:
                raise ValueError("Restored file hash mismatch")
        print("Restore verified. Queue quarantined in .automation.recovery; no services started.")


if __name__ == "__main__":
    main()
