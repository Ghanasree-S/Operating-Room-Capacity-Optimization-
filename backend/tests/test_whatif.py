"""Tests for the capacity and goal-weight sweeps."""

import pytest

import data_prep
from optimization import capacity_sweep, goal_tradeoff


@pytest.fixture(scope="module")
def data():
    return data_prep.load_all()


def test_capacity_sweep_is_monotone_and_saturates(data):
    sweep = capacity_sweep(data["specialty_inputs"], [110.0, 130.0, 150.0, 200.0, 320.0])
    cases = sweep["Total_Cases"].tolist()
    assert cases == sorted(cases)
    # Scarce capacity binds with a positive shadow price ...
    assert bool(sweep.loc[0, "Capacity_Binding"]) and sweep.loc[0, "Shadow_Price"] > 0
    # ... ample capacity does not, and adds nothing.
    assert not bool(sweep.iloc[-1]["Capacity_Binding"])
    assert sweep.iloc[-1]["Total_Cases"] == pytest.approx(sweep.iloc[-2]["Total_Cases"])


def test_capacity_sweep_marks_infeasible_capacity(data):
    sweep = capacity_sweep(data["specialty_inputs"], [1.0])
    assert sweep.loc[0, "Status"] == "Infeasible"


def test_goal_tradeoff_gives_up_cases_to_cut_overtime(data):
    target_ot = data_prep.weekly_historical_overtime_hours(data["cases"]) * 0.8
    tradeoff = goal_tradeoff(
        data["specialty_inputs"], 200.0, target_ot, overtime_weights=[0.0, 1e5]
    )
    low, high = tradeoff.iloc[0], tradeoff.iloc[1]
    assert high["Overtime_Hours"] <= low["Overtime_Hours"]
    assert high["Total_Cases"] <= low["Total_Cases"]
    assert high["Overtime_Overrun"] == pytest.approx(0.0, abs=1e-6)
