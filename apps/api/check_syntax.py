#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Dependency-free syntax gate for every Python source file in apps/api."""

from pathlib import Path


API_ROOT = Path(__file__).resolve().parent
EXCLUDED_DIRECTORIES = {".venv", "__pycache__", "node_modules", "venv"}


def python_files():
    for file_path in sorted(API_ROOT.rglob("*.py")):
        if not EXCLUDED_DIRECTORIES.intersection(file_path.parts):
            yield file_path


def main() -> int:
    failures = []
    checked_files = 0

    for file_path in python_files():
        checked_files += 1
        try:
            compile(file_path.read_bytes(), str(file_path), "exec", dont_inherit=True)
        except (SyntaxError, ValueError) as error:
            failures.append((file_path, error))

    for file_path, error in failures:
        print(f"{file_path.relative_to(API_ROOT)}: {error}")

    if failures:
        print(f"API syntax check failed: {len(failures)} of {checked_files} files could not be compiled.")
        return 1

    print(f"API syntax check passed: {checked_files} Python files compiled without writing bytecode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
