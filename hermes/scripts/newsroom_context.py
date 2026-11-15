#!/usr/bin/env python3
"""Print the Frontier Feed channel context that cron jobs inject into the prompt.

Hermes runs this before each Frontier Feed cron job and prepends its stdout to the
job prompt, so every run starts with the current time, recent posts with their
latest metrics, and the topics already covered.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

HOME = Path(__file__).resolve().parent.parent
DATA = HOME / "newsroom" / "data"


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return rows


def main() -> None:
    berlin = dt.datetime.now(ZoneInfo("Europe/Berlin"))
    print("# Frontier Feed run context")
    print(f"Now: {berlin.isoformat(timespec='minutes')} (Europe/Berlin), "
          f"{berlin.astimezone(ZoneInfo('America/New_York')).strftime('%H:%M')} New York, "
          f"{berlin.strftime('%A')}")
    print(f"HERMES_HOME: {HOME}")

    posts = [p for p in read_jsonl(DATA / "posts.jsonl") if p.get("type") != "draft"]
    latest: dict[str, dict] = {}
    for row in read_jsonl(DATA / "metrics.jsonl"):
        if row.get("scope") == "post":
            latest[row["post_id"]] = row

    print(f"\n## Recent posts ({len(posts)} total, newest first)")
    if not posts:
        print("No posts yet. This is the cold start: favour broad-appeal topics and test hooks.")
    for post in reversed(posts[-12:]):
        ids = post.get("postiz_post_ids") or []
        metrics = next((latest[i] for i in ids if i in latest), None)
        stat = "no metrics yet"
        if metrics:
            m = metrics["metrics"]
            stat = (f"views {m.get('views', '?')}, reach {m.get('reach', '?')}, "
                    f"shares {m.get('shares', '?')}, saves {m.get('saves', '?')}, "
                    f"likes {m.get('likes', '?')}, comments {m.get('comments', '?')} "
                    f"@ {metrics.get('age_hours')}h")
        trial = " [trial]" if post.get("trial") else ""
        print(f"- {post.get('scheduled_for')} | {post.get('topic') or 'untitled'}{trial} | {stat}")

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=10)
    recent_topics = []
    for post in posts:
        try:
            when = dt.datetime.fromisoformat(post["scheduled_for"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if when >= cutoff and post.get("topic"):
            recent_topics.append(post["topic"])
    print("\n## Topics covered in the last 10 days (do not repeat without a new angle)")
    print(", ".join(recent_topics) if recent_topics else "none")

    upcoming = []
    for post in posts:
        try:
            when = dt.datetime.fromisoformat(post["scheduled_for"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if when > dt.datetime.now(dt.timezone.utc):
            upcoming.append(f"{when.astimezone(ZoneInfo('Europe/Berlin')).isoformat(timespec='minutes')} "
                            f"{post.get('topic')}")
    print("\n## Already scheduled, not yet live")
    print("\n".join(upcoming) if upcoming else "none")


if __name__ == "__main__":
    main()
