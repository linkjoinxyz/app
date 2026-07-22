"""Candidate-selection logic for the class-schedule backfill.

The exclusion matters: LinkModal sets days to all seven for `month` and `day N`
repeats regardless of when the meeting actually happens, so adopting one of those
as a class schedule would say the class meets every day of the year and
manufacture absences accordingly.
"""
import importlib.util
import pathlib

import pytest

_spec = importlib.util.spec_from_file_location(
    "backfill_class_schedules",
    pathlib.Path(__file__).resolve().parents[2] / "scripts" / "backfill_class_schedules.py",
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


@pytest.mark.parametrize(
    "link,expected",
    [
        ({"time": "09:00", "days": ["Mon"], "repeat": "week"}, True),
        ({"time": "09:00", "days": ["Mon"], "repeat": "never"}, True),
        ({"time": "09:00", "days": ["Mon"], "repeat": "2 times"}, True),
        # all-seven-days artefacts of the monthly UI
        ({"time": "09:00", "days": list("ABCDEFG"), "repeat": "month"}, False),
        ({"time": "09:00", "days": list("ABCDEFG"), "repeat": "day 15"}, False),
        # nothing to copy
        ({"time": "", "days": ["Mon"], "repeat": "week"}, False),
        ({"time": "09:00", "days": [], "repeat": "week"}, False),
        ({"repeat": "week"}, False),
    ],
)
def test_usable(link, expected):
    assert _mod._usable(link) is expected


def test_primary_link_preferred_over_supplemental():
    primary = {"id": 50, "link_type": "primary"}
    supplemental = {"id": 10, "link_type": "supplemental"}
    assert sorted([supplemental, primary], key=_mod._rank)[0] is primary


def test_oldest_id_breaks_ties():
    a = {"id": 20, "link_type": "supplemental"}
    b = {"id": 10, "link_type": "supplemental"}
    assert sorted([a, b], key=_mod._rank)[0] is b
