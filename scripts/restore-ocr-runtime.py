#!/usr/bin/env python3
"""Restore a verified OCR runtime from the previous published installer."""

import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request


INSTALLERS = {
    "linux-amd64": ("siyuan-3.8.9-linux.tar.gz", "26a2cc35a52bd7f32296a7843000cdae5089c401c95c872055eeffaea6eb658b"),
    "linux-arm64": ("siyuan-3.8.9-linux-arm64.tar.gz", "6c8ac790f836d26a4c9ef295e319d03d9ee679d70a76b96f8b11bdd924fc29de"),
    "darwin-amd64": ("siyuan-3.8.9-mac.dmg", "29a4cd1e77c64d628282bfb8c8ce4b7bb8da10c086ea874844af20848d9513a4"),
    "darwin-arm64": ("siyuan-3.8.9-mac-arm64.dmg", "b63d39d129ece59fe58f427d9cc30413d9740f04cebc9c66dca963d5fda0cea4"),
    "windows-amd64": ("siyuan-3.8.9-win.exe", "b06c86f752804eca24f4559625b1fb567abfff8698bfbb087f250ec15629271a"),
}
RELEASE = "https://github.com/appdev/unlock-1113/releases/download/v3.8.9-3/"


def extract(installer, target, output, names):
    suffix = "/stage/ocr/runtime/" + target + "/"
    if target.startswith("linux-"):
        with tarfile.open(installer, "r:gz") as archive:
            for name in names:
                matches = [member for member in archive.getmembers()
                           if member.isfile() and member.name.endswith(suffix + name)]
                if len(matches) != 1:
                    raise ValueError("Missing or ambiguous OCR runtime member: " + name)
                with archive.extractfile(matches[0]) as source, (output / name).open("wb") as destination:
                    shutil.copyfileobj(source, destination)
        return

    if target.startswith("darwin-"):
        mount = output / "mount"
        mount.mkdir()
        subprocess.run(["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", str(mount), str(installer)],
                       check=True, stdout=subprocess.DEVNULL)
        try:
            source = mount / "SiYuan.app/Contents/Resources/stage/ocr/runtime" / target
            for name in names:
                shutil.copyfile(source / name, output / name)
        finally:
            subprocess.run(["hdiutil", "detach", str(mount)], check=True, stdout=subprocess.DEVNULL)
        return

    unpacked = output / "unpacked"
    unpacked.mkdir()
    subprocess.run(["7z", "x", "-y", str(installer), "-o" + str(unpacked)], check=True, stdout=subprocess.DEVNULL)
    payloads = list(unpacked.rglob("app-64.7z"))
    if len(payloads) != 1:
        raise ValueError("Expected one Windows application payload")
    application = output / "application"
    subprocess.run(["7z", "x", "-y", str(payloads[0]), "-o" + str(application)], check=True, stdout=subprocess.DEVNULL)
    source = application / "resources/stage/ocr/runtime" / target
    for name in names:
        shutil.copyfile(source / name, output / name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", choices=INSTALLERS)
    parser.add_argument("--installer", type=Path, help="Already downloaded installer, still SHA-256 verified")
    args = parser.parse_args()
    source = args.source.resolve()
    spec = importlib.util.spec_from_file_location("prepare_ocr", source / "scripts/prepare-ocr.py")
    prepare = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(prepare)
    entry = prepare.MANIFEST["runtime"][args.target]
    destination = source / "app/stage/ocr/runtime" / args.target
    if prepare.runtime_is_verified(entry, destination):
        print("OCR runtime already verified:", args.target)
        return
    name, expected = INSTALLERS[args.target]
    with tempfile.TemporaryDirectory(prefix="qingyu-ocr-restore-") as private:
        private = Path(private)
        installer = args.installer.resolve() if args.installer else private / name
        if args.installer is None:
            request = urllib.request.Request(RELEASE + name, headers={"User-Agent": "QingYu-OCR-Restore"})
            with urllib.request.urlopen(request, timeout=120) as response, installer.open("wb") as output:
                shutil.copyfileobj(response, output)
        if prepare.digest(installer) != expected:
            raise ValueError("Previous installer checksum mismatch")
        names = {"onnxruntime-files.json", entry["library"], "LICENSE", "ThirdPartyNotices.txt"}
        if args.target.startswith("windows-"):
            names.add("onnxruntime_providers_shared.dll")
        restored = private / "runtime"
        restored.mkdir()
        extract(installer, args.target, restored, names)
        if args.target.startswith("darwin-"):
            # Electron signs the packaged dylib after the upstream archive stamp is written.
            # The installer hash above authenticates that shipped binary and its original stamp.
            stamp_path = restored / "onnxruntime-files.json"
            stamp = json.loads(stamp_path.read_text())
            if stamp["archive"] != prepare.runtime_source(entry):
                raise ValueError("Previous runtime belongs to another upstream archive")
            for name, digest in stamp["files"].items():
                if name != entry["library"] and prepare.digest(restored / name) != digest:
                    raise ValueError("Previous runtime license checksum mismatch")
            subprocess.run(["codesign", "--verify", "--strict", str(restored / entry["library"])],
                           check=True, capture_output=True)
            stamp["files"][entry["library"]] = prepare.digest(restored / entry["library"])
            stamp["restoredFrom"] = {"release": "v3.8.9-3", "installerSHA256": expected}
            stamp_path.write_text(json.dumps(stamp, indent=2) + "\n")
        if not prepare.runtime_is_verified(entry, restored):
            raise ValueError("Restored runtime fails the upstream provenance and file checks")
        destination.mkdir(parents=True, exist_ok=True)
        for name in names:
            shutil.copyfile(restored / name, destination / name)
        if not prepare.runtime_is_verified(entry, destination):
            raise ValueError("Installed OCR runtime failed verification")
    print("Restored checksum-verified OCR runtime from QingYu v3.8.9-3:", args.target)


if __name__ == "__main__":
    main()
