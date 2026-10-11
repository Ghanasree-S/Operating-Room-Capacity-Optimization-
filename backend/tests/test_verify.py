"""Runs the 22-check validation suite (src/verify.py) under pytest."""

import verify


def test_validation_suite_passes(capsys):
    assert verify.main() == 0, capsys.readouterr().out
