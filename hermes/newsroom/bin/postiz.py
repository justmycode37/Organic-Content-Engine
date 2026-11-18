#!/usr/bin/env python3
"""Postiz client for the Frontier Feed channel.

Stdlib only, so it runs with any python3 on any machine. Every command prints
JSON to stdout; diagnostics go to stderr. Every published or scheduled post is
recorded in newsroom/data/posts.jsonl, and every analytics pull is appended to
newsroom/data/metrics.jsonl, so the growth loop always has a local history.

Environment:
  POSTIZ_API_KEY       required
  POSTIZ_API_URL       default https://api.postiz.com/public/v1
  POSTIZ_INSTAGRAM_ID  Postiz integration id of the Instagram account
  POSTIZ_YOUTUBE_ID    Postiz integration id of the YouTube channel (optional;
                       detected from `integrations` when unset)

Commands:
  integrations                         list connected channels
  upload FILE [--adjust]               upload media, wait until ready
  publish --video MP4 --caption-file TXT (--at ISO | --now | --draft)
          [--cover IMG] [--trial] [--no-ai-label] [--run-dir DIR] [--topic T]
  posts [--days N]                     list posts of the last N days
  analytics-account [--days N]         account-level metrics
  analytics-post POST_ID [--days N]    metrics of one post
  collect [--days N]                   pull metrics for every ledger post
  find-slot                            next free slot suggested by Postiz
  notifications                        publish errors and notices
  delete POST_ID                       delete a post (and its group)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

NEWSROOM_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = NEWSROOM_DIR / "data"
POSTS_LEDGER = DATA_DIR / "posts.jsonl"
METRICS_LEDGER = DATA_DIR / "metrics.jsonl"


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": msg}))
    sys.exit(code)


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def config() -> tuple[str, str]:
    key = os.environ.get("POSTIZ_API_KEY", "").strip()
    if not key:
        fail("POSTIZ_API_KEY is not set")
    base = os.environ.get("POSTIZ_API_URL", "https://api.postiz.com/public/v1").rstrip("/")
    return base, key


def instagram_id(explicit: str | None = None) -> str:
    value = explicit or os.environ.get("POSTIZ_INSTAGRAM_ID", "").strip()
    if not value:
        fail("POSTIZ_INSTAGRAM_ID is not set; run `postiz.py integrations` to find it")
    return value


def youtube_id(explicit: str | None = None) -> str:
    value = explicit or os.environ.get("POSTIZ_YOUTUBE_ID", "").strip()
    if value:
        return value
    data = get_json("/integrations")
    items = data if isinstance(data, list) else data.get("integrations", [])
    found = [i for i in items if str(i.get("identifier") or i.get("providerIdentifier") or "").startswith("youtube")
             and not i.get("disabled")]
    if not found:
        fail("no YouTube channel is connected in Postiz; connect one in the Postiz UI first", code=4)
    return found[0]["id"]


def parse_when(args) -> tuple[str, str]:
    if args.now:
        return "now", now_utc()
    if args.draft:
        return "draft", args.at or now_utc()
    if not args.at:
        fail("pass --at ISO8601 (with offset), --now, or --draft")
    when = dt.datetime.fromisoformat(args.at)
    if when.tzinfo is None:
        fail("--at needs a timezone offset, e.g. 2026-11-16T14:00:00+01:00")
    if when < dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=2):
        fail("--at is in the past or less than 2 minutes away; use --now")
    return "schedule", when.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def request(method: str, path: str, *, body: bytes | None = None,
            content_type: str | None = None, retries: int = 3):
    base, key = config()
    url = f"{base}{path}"
    headers = {"Authorization": key, "Accept": "application/json"}
    if content_type:
        headers["Content-Type"] = content_type
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                raw = resp.read().decode("utf-8") or "null"
                return json.loads(raw)
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "replace")
            retriable = err.code == 429 or err.code >= 500
            if retriable and attempt < retries:
                wait = 30 * attempt
                log(f"HTTP {err.code} on {method} {path}, retrying in {wait}s")
                time.sleep(wait)
                continue
            fail(f"HTTP {err.code} on {method} {path}: {detail[:800]}")
        except urllib.error.URLError as err:
            if attempt < retries:
                log(f"network error on {method} {path}: {err.reason}, retrying")
                time.sleep(10 * attempt)
                continue
            fail(f"network error on {method} {path}: {err.reason}")


def get_json(path: str):
    return request("GET", path)


def send_json(method: str, path: str, payload) -> object:
    return request(method, path, body=json.dumps(payload).encode("utf-8"),
                   content_type="application/json")


def append_jsonl(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                log(f"skipping corrupt line in {path.name}")
    return rows


# --- media -------------------------------------------------------------------

def upload(file_path: Path, adjust: bool = False) -> dict:
    if not file_path.is_file():
        fail(f"file not found: {file_path}")
    boundary = uuid.uuid4().hex
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
        f"filename=\"{file_path.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode(),
        file_path.read_bytes(),
        b"\r\n",
    ]
    if adjust:
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; "
                     f"name=\"adjust\"\r\n\r\ntrue\r\n".encode())
    parts.append(f"--{boundary}--\r\n".encode())
    log(f"uploading {file_path.name} ({file_path.stat().st_size / 1e6:.1f} MB)")
    media = request("POST", "/upload", body=b"".join(parts),
                    content_type=f"multipart/form-data; boundary={boundary}")
    if not isinstance(media, dict) or not media.get("id"):
        fail(f"unexpected upload response: {media}")
    if adjust:
        media = wait_for_media(media)
    return media


def wait_for_media(media: dict, timeout_s: int = 900) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = get_json(f"/media/{media['id']}/status")
        state = (status or {}).get("status")
        if state == "ready":
            media["path"] = status.get("path") or media.get("path")
            return media
        if state == "failed":
            fail(f"media processing failed: {status}")
        time.sleep(5)
    fail("timed out waiting for media processing")


# --- commands ----------------------------------------------------------------

def cmd_integrations(_args) -> None:
    print(json.dumps(get_json("/integrations"), indent=2))


def cmd_upload(args) -> None:
    print(json.dumps(upload(Path(args.file), adjust=args.adjust), indent=2))


def cmd_publish(args) -> None:
    caption = Path(args.caption_file).read_text(encoding="utf-8").strip()
    if not caption:
        fail("caption is empty")
    if len(caption) > 2200:
        fail(f"caption is {len(caption)} chars; Instagram allows 2200")
    if args.now:
        post_type, date = "now", now_utc()
    elif args.draft:
        post_type, date = "draft", args.at or now_utc()
    else:
        if not args.at:
            fail("pass --at ISO8601 (with offset), --now, or --draft")
        when = dt.datetime.fromisoformat(args.at)
        if when.tzinfo is None:
            fail("--at needs a timezone offset, e.g. 2026-11-16T14:00:00+01:00")
        if when < dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=2):
            fail("--at is in the past or less than 2 minutes away; use --now")
        post_type = "schedule"
        date = when.astimezone(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    video = upload(Path(args.video), adjust=False)
    media = {"id": video["id"], "path": video["path"]}
    if args.cover:
        cover = upload(Path(args.cover))
        media["thumbnail"] = cover["path"]

    integration = instagram_id(args.integration)
    payload = {
        "type": post_type,
        "date": date,
        "shortLink": False,
        "tags": [],
        "posts": [{
            "integration": {"id": integration},
            "value": [{"content": caption, "image": [media]}],
            "settings": {
                "__type": "instagram-standalone",
                "post_type": "post",
                "is_trial_reel": bool(args.trial),
                "graduation_strategy": "MANUAL",
                "made_with_ai": not args.no_ai_label,
                "collaborators": [],
            },
        }],
    }
    result = send_json("POST", "/posts", payload)
    created = result if isinstance(result, list) else [result]
    post_ids = [p.get("postId") or p.get("id") for p in created if isinstance(p, dict)]
    record = {
        "recorded_at": now_utc(),
        "type": post_type,
        "scheduled_for": date,
        "postiz_post_ids": [p for p in post_ids if p],
        "postiz_response": result,
        "topic": args.topic,
        "run_dir": args.run_dir,
        "video": str(Path(args.video).resolve()),
        "trial": bool(args.trial),
        "caption": caption,
    }
    append_jsonl(POSTS_LEDGER, record)
    print(json.dumps({"ok": True, **record}, indent=2, ensure_ascii=False))


def date_range(days: int) -> str:
    end = dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=7)
    start = end - dt.timedelta(days=days + 7)
    fmt = "%Y-%m-%dT%H:%M:%S.000Z"
    return f"startDate={start.strftime(fmt)}&endDate={end.strftime(fmt)}"


def cmd_posts(args) -> None:
    data = get_json(f"/posts?{date_range(args.days)}")
    # The Postiz workspace holds other brands' Instagram channels too; show only
    # ours unless --all is given, so reviews never count another account's post.
    if not args.all and isinstance(data, dict) and isinstance(data.get("posts"), list):
        ours = instagram_id(args.integration)
        data = dict(data)
        data["posts"] = [p for p in data["posts"]
                         if (p.get("integration") or {}).get("id") == ours]
        data["filtered_to_integration"] = ours
    print(json.dumps(data, indent=2))


def cmd_analytics_account(args) -> None:
    data = get_json(f"/analytics/{instagram_id(args.integration)}?date={args.days}")
    append_jsonl(METRICS_LEDGER, {"recorded_at": now_utc(), "scope": "account",
                                  "days": args.days, "data": data})
    print(json.dumps(data, indent=2))


def summarize_post_metrics(data) -> dict:
    out = {}
    if isinstance(data, list):
        for series in data:
            label = str(series.get("label", "")).lower()
            points = series.get("data") or []
            if points:
                try:
                    out[label] = max(float(p.get("total") or 0) for p in points)
                except (TypeError, ValueError):
                    out[label] = points[-1].get("total")
    return out


def cmd_analytics_post(args) -> None:
    data = get_json(f"/analytics/post/{args.post_id}?date={args.days}")
    print(json.dumps({"post_id": args.post_id, "metrics": summarize_post_metrics(data),
                      "raw": data}, indent=2))


def cmd_collect(args) -> None:
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=args.days)
    rows = []
    for post in read_jsonl(POSTS_LEDGER):
        if post.get("type") == "draft":
            continue
        try:
            when = dt.datetime.fromisoformat(post["scheduled_for"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if when < cutoff or when > dt.datetime.now(dt.timezone.utc):
            continue
        for post_id in post.get("postiz_post_ids") or []:
            data = get_json(f"/analytics/post/{post_id}?date={args.days}")
            metrics = summarize_post_metrics(data)
            age_h = (dt.datetime.now(dt.timezone.utc) - when).total_seconds() / 3600
            row = {"recorded_at": now_utc(), "scope": "post", "post_id": post_id,
                   "topic": post.get("topic"), "published_at": post["scheduled_for"],
                   "age_hours": round(age_h, 1), "trial": post.get("trial", False),
                   "metrics": metrics}
            append_jsonl(METRICS_LEDGER, row)
            rows.append(row)
    rows.sort(key=lambda r: r["metrics"].get("views", 0) or 0, reverse=True)
    print(json.dumps(rows, indent=2, ensure_ascii=False))


def cmd_find_slot(args) -> None:
    print(json.dumps(get_json(f"/find-slot/{instagram_id(args.integration)}"), indent=2))


def cmd_notifications(_args) -> None:
    print(json.dumps(get_json("/notifications?page=0"), indent=2))


def cmd_delete(args) -> None:
    print(json.dumps(request("DELETE", f"/posts/{args.post_id}"), indent=2))


def cmd_publish_youtube(args) -> None:
    """Long-form video to YouTube. Description = the post content."""
    description = Path(args.description_file).read_text(encoding="utf-8").strip()
    if len(description) > 5000:
        fail(f"description is {len(description)} chars; YouTube allows 5000")
    title = args.title.strip()
    if not 2 <= len(title) <= 100:
        fail(f"title must be 2-100 characters, got {len(title)}")
    tags = [t.strip() for t in (args.tags or "").split(",") if t.strip()]
    if sum(len(t) for t in tags) > 450:
        fail("tags exceed ~450 characters; YouTube allows 500 in total")
    post_type, date = parse_when(args)
    integration = youtube_id(args.integration)

    video = upload(Path(args.video), adjust=False)
    media = {"id": video["id"], "path": video["path"]}
    settings = {
        "__type": "youtube",
        "title": title,
        "type": args.privacy,
        "selfDeclaredMadeForKids": "no",
        "tags": [{"value": t, "label": t} for t in tags],
    }
    if args.thumbnail:
        thumb = upload(Path(args.thumbnail))
        settings["thumbnail"] = {"id": thumb["id"], "path": thumb["path"]}
    payload = {
        "type": post_type,
        "date": date,
        "shortLink": False,
        "tags": [],
        "posts": [{
            "integration": {"id": integration},
            "value": [{"content": description, "image": [media]}],
            "settings": settings,
        }],
    }
    result = send_json("POST", "/posts", payload)
    created = result if isinstance(result, list) else [result]
    post_ids = [p.get("postId") or p.get("id") for p in created if isinstance(p, dict)]
    record = {
        "recorded_at": now_utc(),
        "platform": "youtube",
        "type": post_type,
        "scheduled_for": date,
        "postiz_post_ids": [p for p in post_ids if p],
        "postiz_response": result,
        "topic": args.topic,
        "run_dir": args.run_dir,
        "video": str(Path(args.video).resolve()),
        "title": title,
        "privacy": args.privacy,
    }
    append_jsonl(POSTS_LEDGER, record)
    print(json.dumps({"ok": True, **record}, indent=2, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Postiz client for Frontier Feed")
    parser.add_argument("--integration", help="override POSTIZ_INSTAGRAM_ID")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("integrations").set_defaults(func=cmd_integrations)

    p = sub.add_parser("upload")
    p.add_argument("file")
    p.add_argument("--adjust", action="store_true", help="let Postiz re-encode the video")
    p.set_defaults(func=cmd_upload)

    p = sub.add_parser("publish")
    p.add_argument("--video", required=True)
    p.add_argument("--caption-file", required=True)
    p.add_argument("--cover")
    when = p.add_mutually_exclusive_group()
    when.add_argument("--now", action="store_true")
    when.add_argument("--draft", action="store_true")
    p.add_argument("--at", help="ISO 8601 with offset, e.g. 2026-11-16T14:00:00+01:00")
    p.add_argument("--trial", action="store_true", help="publish as Instagram Trial Reel")
    p.add_argument("--no-ai-label", action="store_true", help="do not set made_with_ai")
    p.add_argument("--topic", help="short topic slug for the ledger")
    p.add_argument("--run-dir", help="run folder for the ledger")
    p.set_defaults(func=cmd_publish)

    p = sub.add_parser("publish-youtube", help="long-form video to the connected YouTube channel")
    p.add_argument("--video", required=True)
    p.add_argument("--title", required=True, help="2-100 characters")
    p.add_argument("--description-file", required=True, help="description incl. chapters and sources")
    p.add_argument("--thumbnail", help="1280x720 JPG, max 2 MB")
    p.add_argument("--tags", help="comma-separated")
    p.add_argument("--privacy", choices=["public", "unlisted", "private"], default="public")
    when = p.add_mutually_exclusive_group()
    when.add_argument("--now", action="store_true")
    when.add_argument("--draft", action="store_true")
    p.add_argument("--at", help="ISO 8601 with offset")
    p.add_argument("--topic", help="short topic slug for the ledger")
    p.add_argument("--run-dir", help="run folder for the ledger")
    p.set_defaults(func=cmd_publish_youtube)

    p = sub.add_parser("posts")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--all", action="store_true",
                   help="include posts of every integration in the Postiz workspace")
    p.set_defaults(func=cmd_posts)

    p = sub.add_parser("analytics-account")
    p.add_argument("--days", type=int, default=7)
    p.set_defaults(func=cmd_analytics_account)

    p = sub.add_parser("analytics-post")
    p.add_argument("post_id")
    p.add_argument("--days", type=int, default=7)
    p.set_defaults(func=cmd_analytics_post)

    p = sub.add_parser("collect")
    p.add_argument("--days", type=int, default=14)
    p.set_defaults(func=cmd_collect)

    sub.add_parser("find-slot").set_defaults(func=cmd_find_slot)
    sub.add_parser("notifications").set_defaults(func=cmd_notifications)

    p = sub.add_parser("delete")
    p.add_argument("post_id")
    p.set_defaults(func=cmd_delete)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
