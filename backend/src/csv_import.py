"""
Flexible CSV import.

A hospital's theatre export will not use our column names, so the importer
never assumes a fixed schema. It inspects whatever file is uploaded, guesses
which of its columns play which role, lets the user correct that mapping, and
only then derives planner inputs — reporting every problem it finds rather
than silently producing a confident wrong answer.

Required roles:
    service    the surgical specialty
    duration   case length in minutes, OR a start/end time pair to derive it

Optional roles:
    date       used to work out how many weeks the file covers, so weekly
               demand can be computed; without it the user states the span
    or_suite, cpt_code, cpt_description   carried through for context
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field

import pandas as pd

# Longest match wins, so put specific phrases before generic ones.
_ROLE_HINTS: dict[str, list[str]] = {
    "service": [
        "surgical service", "service line", "specialty", "speciality",
        "service", "department", "discipline", "dept",
    ],
    "duration": [
        "actual duration", "case duration", "procedure duration", "duration min",
        "duration", "case length", "proc time", "minutes", "mins",
    ],
    "start_time": [
        "procedure start", "surgery start", "incision start", "start time",
        "wheels in", "in time", "start",
    ],
    "end_time": [
        "procedure end", "surgery end", "closure end", "end time",
        "wheels out", "out time", "finish", "end",
    ],
    "date": ["surgery date", "case date", "procedure date", "date"],
    "or_suite": ["or suite", "operating room", "theatre", "theater", "room", "suite"],
    "cpt_code": ["cpt code", "procedure code", "cpt", "code"],
    "cpt_description": ["cpt description", "procedure description", "description", "procedure"],
    "booked_time": ["booked time", "scheduled duration", "booked", "planned duration"],
}

# A case longer than this is almost certainly a data error (wrong units, a
# missing date component, or an unclosed record) rather than a real operation.
_IMPLAUSIBLE_DURATION_MIN = 1440.0
_LONG_CASE_WARN_MIN = 720.0


@dataclass
class ImportIssue:
    level: str   # "error" blocks the import; "warning" is advisory
    message: str
    rows_affected: int = 0


@dataclass
class ImportResult:
    specialties: list[dict]
    issues: list[ImportIssue] = field(default_factory=list)
    rows_read: int = 0
    rows_used: int = 0
    weeks_covered: float = 1.0
    date_range: tuple[str, str] | None = None

    @property
    def has_errors(self) -> bool:
        return any(i.level == "error" for i in self.issues)


def read_csv(content: bytes) -> pd.DataFrame:
    """Decode an uploaded file, tolerating the usual encodings."""
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding)
        except UnicodeDecodeError:
            continue
        except pd.errors.EmptyDataError as exc:
            raise ValueError("The file is empty.") from exc
        except pd.errors.ParserError as exc:
            raise ValueError(f"Could not parse the file as CSV: {exc}") from exc
    raise ValueError("Could not decode the file. Save it as UTF-8 CSV and retry.")


def guess_mapping(columns: list[str]) -> dict[str, str | None]:
    """Best-effort guess of which column fills which role."""
    normalised = {col: col.strip().lower() for col in columns}
    mapping: dict[str, str | None] = {role: None for role in _ROLE_HINTS}
    taken: set[str] = set()

    for role, hints in _ROLE_HINTS.items():
        best: tuple[int, str] | None = None
        for hint in hints:
            for col, low in normalised.items():
                if col in taken:
                    continue
                if low == hint:
                    score = 1000 + len(hint)       # exact match dominates
                elif hint in low:
                    score = 100 + len(hint)        # substring match
                else:
                    continue
                if best is None or score > best[0]:
                    best = (score, col)
        if best:
            mapping[role] = best[1]
            taken.add(best[1])

    return mapping


def inspect(content: bytes, sample_rows: int = 5) -> dict:
    """Describe an uploaded file so the user can confirm the mapping."""
    df = read_csv(content)
    columns = [str(c) for c in df.columns]
    sample = df.head(sample_rows).astype(str).where(pd.notna(df.head(sample_rows)), "")

    return {
        "columns": columns,
        "row_count": int(len(df)),
        "sample": sample.to_dict(orient="records"),
        "suggested_mapping": guess_mapping(columns),
    }


def process(
    content: bytes,
    mapping: dict[str, str | None],
    weeks_covered: float | None = None,
    default_priority: float = 1.0,
) -> ImportResult:
    """Derive per-specialty planner inputs from an uploaded file."""
    df = read_csv(content)
    rows_read = len(df)
    issues: list[ImportIssue] = []

    service_col = mapping.get("service")
    if not service_col or service_col not in df.columns:
        return ImportResult(
            specialties=[],
            issues=[ImportIssue("error", "No column was mapped to 'service'.")],
            rows_read=rows_read,
        )

    # Record missing values BEFORE the string conversion: astype(str) turns NaN
    # into the literal text "nan", which would otherwise survive every
    # emptiness check and end up as a specialty named "nan".
    raw_service = df[service_col]
    service = raw_service.astype(str).str.strip()
    service = service.where(~raw_service.isna(), "")
    service = service.where(
        ~service.str.lower().isin({"nan", "none", "null", "n/a", "-"}), ""
    )
    work = pd.DataFrame({"service": service})

    blank_service = int((work["service"] == "").sum())
    if blank_service:
        issues.append(
            ImportIssue(
                "warning",
                f"{blank_service} rows have no specialty and were skipped.",
                blank_service,
            )
        )
    work = work[work["service"] != ""]

    duration, duration_issues = _derive_duration(df, mapping, work.index)
    issues.extend(duration_issues)
    if duration is None:
        return ImportResult(specialties=[], issues=issues, rows_read=rows_read)

    work["duration"] = duration

    invalid = work["duration"].isna() | (work["duration"] <= 0)
    if int(invalid.sum()):
        issues.append(
            ImportIssue(
                "warning",
                f"{int(invalid.sum())} rows had a missing, zero or negative duration "
                "and were skipped.",
                int(invalid.sum()),
            )
        )
    work = work[~invalid]

    implausible = work["duration"] > _IMPLAUSIBLE_DURATION_MIN
    if int(implausible.sum()):
        issues.append(
            ImportIssue(
                "warning",
                f"{int(implausible.sum())} rows exceed 24 hours and were skipped as "
                "probable data errors — check the duration units.",
                int(implausible.sum()),
            )
        )
        work = work[~implausible]

    long_cases = work["duration"] > _LONG_CASE_WARN_MIN
    if int(long_cases.sum()):
        issues.append(
            ImportIssue(
                "warning",
                f"{int(long_cases.sum())} cases run over 12 hours. They were kept, "
                "but worth confirming they are genuine.",
                int(long_cases.sum()),
            )
        )

    if work.empty:
        issues.append(
            ImportIssue("error", "No usable rows remained after validation.")
        )
        return ImportResult(specialties=[], issues=issues, rows_read=rows_read)

    weeks, date_range, span_issues = _derive_weeks(df, mapping, work.index, weeks_covered)
    issues.extend(span_issues)

    grouped = (
        work.groupby("service")
        .agg(cases=("duration", "size"), avg_duration=("duration", "mean"))
        .reset_index()
        .sort_values("cases", ascending=False)
    )

    specialties = [
        {
            "name": row.service,
            "demand_cases": round(row.cases / weeks, 1),
            "avg_duration_min": round(float(row.avg_duration), 1),
            "priority": default_priority,
            "min_hours": 0.0,
            "surgeon_hours": None,
            "equipment_max_cases": None,
        }
        for row in grouped.itertuples()
    ]

    return ImportResult(
        specialties=specialties,
        issues=issues,
        rows_read=rows_read,
        rows_used=int(len(work)),
        weeks_covered=round(weeks, 2),
        date_range=date_range,
    )


def _derive_duration(
    df: pd.DataFrame, mapping: dict[str, str | None], index: pd.Index
) -> tuple[pd.Series | None, list[ImportIssue]]:
    """Take durations directly, or compute them from a start/end pair."""
    issues: list[ImportIssue] = []
    duration_col = mapping.get("duration")

    if duration_col and duration_col in df.columns:
        values = pd.to_numeric(df.loc[index, duration_col], errors="coerce")
        unparsed = int(values.isna().sum())
        if unparsed and unparsed == len(values):
            issues.append(
                ImportIssue(
                    "error",
                    f"Column '{duration_col}' holds no numeric values. Map a numeric "
                    "duration column, or map start and end times instead.",
                )
            )
            return None, issues
        if unparsed:
            issues.append(
                ImportIssue(
                    "warning",
                    f"{unparsed} values in '{duration_col}' were not numeric.",
                    unparsed,
                )
            )
        return values, issues

    start_col, end_col = mapping.get("start_time"), mapping.get("end_time")
    if start_col in df.columns and end_col in df.columns:
        start = pd.to_datetime(df.loc[index, start_col], errors="coerce", format="mixed")
        end = pd.to_datetime(df.loc[index, end_col], errors="coerce", format="mixed")
        values = (end - start).dt.total_seconds() / 60

        # An end time earlier than its start usually means the case crossed
        # midnight and the times carry no date component.
        overnight = values < 0
        if int(overnight.sum()):
            values = values.where(~overnight, values + 24 * 60)
            issues.append(
                ImportIssue(
                    "warning",
                    f"{int(overnight.sum())} cases ended before they started; treated "
                    "as crossing midnight and adjusted by 24 hours.",
                    int(overnight.sum()),
                )
            )

        unparsed = int(values.isna().sum())
        if unparsed == len(values):
            issues.append(
                ImportIssue(
                    "error",
                    f"Could not read times from '{start_col}' and '{end_col}'.",
                )
            )
            return None, issues
        if unparsed:
            issues.append(
                ImportIssue(
                    "warning",
                    f"{unparsed} rows had unreadable start or end times.",
                    unparsed,
                )
            )
        return values, issues

    issues.append(
        ImportIssue(
            "error",
            "Map either a duration column, or both a start time and an end time.",
        )
    )
    return None, issues


def _derive_weeks(
    df: pd.DataFrame,
    mapping: dict[str, str | None],
    index: pd.Index,
    weeks_covered: float | None,
) -> tuple[float, tuple[str, str] | None, list[ImportIssue]]:
    """Work out how many weeks the file spans, to convert totals to weekly rates."""
    issues: list[ImportIssue] = []

    if weeks_covered is not None and weeks_covered > 0:
        return float(weeks_covered), None, issues

    date_col = mapping.get("date")
    if date_col and date_col in df.columns:
        dates = pd.to_datetime(df.loc[index, date_col], errors="coerce", format="mixed")
        valid = dates.dropna()
        if not valid.empty:
            span_days = (valid.max() - valid.min()).days + 1
            weeks = max(1.0, span_days / 7)
            unparsed = int(dates.isna().sum())
            if unparsed:
                issues.append(
                    ImportIssue(
                        "warning",
                        f"{unparsed} dates in '{date_col}' could not be read and were "
                        "excluded from the date span.",
                        unparsed,
                    )
                )
            return (
                weeks,
                (valid.min().strftime("%Y-%m-%d"), valid.max().strftime("%Y-%m-%d")),
                issues,
            )
        issues.append(
            ImportIssue(
                "warning",
                f"No readable dates in '{date_col}'. Treating the file as one week — "
                "set the period manually if that is wrong.",
            )
        )
        return 1.0, None, issues

    issues.append(
        ImportIssue(
            "warning",
            "No date column mapped, so the file is treated as covering one week. "
            "Set the period manually if that is wrong.",
        )
    )
    return 1.0, None, issues
