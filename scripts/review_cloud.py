"""Replay the synthetic semester audit on a hosted runner."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

folder = Path(__file__).resolve().parents[1] / "semester"
fixture = json.loads((folder / "fixture.json").read_text(encoding="utf8"))
expected = fixture["expected"]
observed = {row["id"]: row for row in fixture["observed"]}
run = os.environ["GITHUB_RUN_ID"] + "-" + os.environ["GITHUB_RUN_ATTEMPT"]
events = []
for index, role in enumerate(fixture["roles"]):
    student = expected[index % len(expected)]
    task = "enrolment/" + role["id"] + "/" + student["id"]
    events.append(dict(event_id=run + "/" + task, task_id=task, agent_id=role["id"],
                       occurred_at=datetime.now(timezone.utc).isoformat(),
                       status="completed" if observed.get(student["id"]) == student else "failed",
                       manager=role["manager"], synthetic=True, policy_version="semester-enrolment-v1",
                       evidence_refs=["github-run:" + run]))
report = dict(contract="faran-event-schema/1.0", source="github-actions-synthetic-replay", events=events)
(folder / "events.json").write_text(json.dumps(report, separators=(",", ":")), encoding="utf8")
