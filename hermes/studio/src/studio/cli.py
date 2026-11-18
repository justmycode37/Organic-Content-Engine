"""Command line interface. JSON results on stdout, logs on stderr.

Exit codes: 0 ok, 1 error (invalid spec, render failure, missing tool),
2 usage error, 3 QA failed.
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from typing import Any

from .env import STUDIO_DIR, StudioError, find_chromium, find_ffmpeg, find_ffprobe, log

USAGE = """\
studio validate SPEC.json                      check a spec (schema, templates, props, files)
studio render SPEC.json -o OUT.mp4 [--preview]  render the Reel (+ .cover.jpg .contact.jpg .captions.srt .report.json)
studio still SPEC.json --scene N [--t SEC] -o OUT.jpg   render a single frame of one scene
studio qa OUT.mp4                              technical checks (format, fps, loudness, silence, black)
studio templates                               list templates and their props
studio voices                                  list recommended voices
studio doctor                                  show resolved binaries and paths
"""


def emit(obj: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, indent=2, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def cmd_validate(a: argparse.Namespace) -> int:
    from .spec import load_spec

    spec, errors, warnings = load_spec(a.spec)
    out: dict[str, Any] = {"ok": not errors, "errors": errors, "warnings": warnings}
    if spec is not None and not errors:
        out["scenes"] = len(spec.scenes)
        out["estimated_duration"] = spec.estimated_duration()
        out["templates"] = [s.template for s in spec.scenes]
    emit(out)
    return 0 if not errors else 1


def cmd_render(a: argparse.Namespace) -> int:
    from .render import SpecInvalid, render

    try:
        report = render(a.spec, a.output, preview=a.preview, workers=a.workers, keep_build=a.keep_build)
    except SpecInvalid as e:
        emit({"ok": False, "error": "spec is invalid", "errors": e.errors, "warnings": e.warnings})
        return 1
    if a.qa and not a.preview:
        from .qa import qa
        report["qa"] = qa(report["outputs"]["video"])
    emit(report)
    return 0


def cmd_still(a: argparse.Namespace) -> int:
    from .render import SpecInvalid, still

    try:
        emit(still(a.spec, a.scene, a.t, a.output, preview=a.preview, hide_captions=a.no_captions))
    except SpecInvalid as e:
        emit({"ok": False, "error": "spec is invalid", "errors": e.errors, "warnings": e.warnings})
        return 1
    return 0


def cmd_qa(a: argparse.Namespace) -> int:
    from .qa import qa

    res = qa(a.video, a.format)
    emit(res)
    return 0 if res["ok"] else 3


def cmd_thumbnail(a: argparse.Namespace) -> int:
    from .thumbnail import thumbnail

    emit(thumbnail(a.output, a.text, image=a.image, highlight=a.highlight, tag=a.tag, side=a.side,
                   position=a.position, theme=a.theme, mark=not a.no_mark))
    return 0


def cmd_templates(a: argparse.Namespace) -> int:
    from .templates import list_templates

    emit({"ok": True, "templates": [t.to_json() for t in list_templates()],
          "notes": ["scene keys: template, narration, props, media, min_duration, cover, cover_time, source, lead, hold, chapter",
                    "spec key format: reel (1080x1920, default) or longform (1920x1080); each template lists its formats",
                    "media: path (relative to the spec) or URL, or {src, start, fit, position, kind}",
                    "add a template by creating templates/<name>.html with a studio:meta header (see README)"]})
    return 0


def cmd_voices(a: argparse.Namespace) -> int:
    from .tts import RATE_NOTE, RECOMMENDED_VOICES

    emit({"ok": True, "default": {"provider": "edge", "voice": "en-US-AndrewMultilingualNeural", "rate": "+10%"},
          "voices": RECOMMENDED_VOICES, "notes": [RATE_NOTE,
          "elevenlabs needs ELEVENLABS_API_KEY; 'voice' is the voice_id; optional 'model' (default eleven_multilingual_v2)",
          "all edge voices: .venv/bin/edge-tts --list-voices"]})
    return 0


def cmd_doctor(a: argparse.Namespace) -> int:
    res: dict[str, Any] = {"studio_dir": str(STUDIO_DIR)}
    ok = True
    for name, fn in (("ffmpeg", find_ffmpeg), ("ffprobe", find_ffprobe)):
        try:
            res[name] = fn()
        except StudioError as e:
            res[name] = None
            res[f"{name}_error"] = str(e)
            ok = False
    res["chromium"] = find_chromium()
    from .env import FONTS_DIR
    res["fonts"] = sorted(p.name for p in FONTS_DIR.glob("*.ttf"))
    if not res["fonts"]:
        res["fonts_warning"] = "no fonts in assets/fonts; run setup.sh"
    if a.require_chromium and not res["chromium"]:
        ok = False
    res["ok"] = ok
    emit(res)
    return 0 if ok else 1


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="studio", description="Newsroom Studio: render Instagram Reels from JSON specs.",
                                usage=USAGE, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("validate", help="validate a spec")
    s.add_argument("spec")
    s.set_defaults(fn=cmd_validate)

    s = sub.add_parser("render", help="render a spec to MP4")
    s.add_argument("spec")
    s.add_argument("-o", "--output", required=True, help="output .mp4 path")
    s.add_argument("--preview", action="store_true", help="fast 540x960 @ 15fps draft")
    s.add_argument("--workers", type=int, default=None, help="parallel browser workers (default: cpu/2, max 8; env STUDIO_WORKERS)")
    s.add_argument("--keep-build", action="store_true", help="keep OUT.build/ (scene HTML, segments) for debugging")
    s.add_argument("--qa", action="store_true", help="run `studio qa` on the result and include it in the JSON")
    s.set_defaults(fn=cmd_render)

    s = sub.add_parser("still", help="render one frame of one scene")
    s.add_argument("spec")
    s.add_argument("--scene", type=int, required=True, help="scene index (0-based)")
    s.add_argument("--t", type=float, default=None, help="seconds into the scene (default: 60%% of it)")
    s.add_argument("-o", "--output", required=True, help="output .png or .jpg")
    s.add_argument("--no-captions", action="store_true")
    s.add_argument("--preview", action="store_true")
    s.set_defaults(fn=cmd_still)

    s = sub.add_parser("qa", help="technical QA of an MP4")
    s.add_argument("video")
    s.add_argument("--format", choices=["reel", "longform"], default=None,
                   help="target format (default: detected from the resolution)")
    s.set_defaults(fn=cmd_qa)

    s = sub.add_parser("thumbnail", help="render a 1280x720 YouTube thumbnail (+ a 320x180 small preview)")
    s.add_argument("-o", "--output", required=True, help="output .jpg")
    s.add_argument("--text", required=True, help="1-6 huge words")
    s.add_argument("--image", default=None, help="background image")
    s.add_argument("--highlight", default=None, help="word(s) of --text to color in the accent")
    s.add_argument("--tag", default=None, help="optional small accent badge, e.g. 'LEAKED'")
    s.add_argument("--side", choices=["left", "right"], default="left", help="text column side")
    s.add_argument("--position", default="center", help="CSS background-position of the image")
    s.add_argument("--theme", default="default")
    s.add_argument("--no-mark", action="store_true", help="hide the brand mark")
    s.set_defaults(fn=cmd_thumbnail)

    sub.add_parser("templates", help="list templates").set_defaults(fn=cmd_templates)
    sub.add_parser("voices", help="list recommended voices").set_defaults(fn=cmd_voices)
    s = sub.add_parser("doctor", help="show resolved binaries")
    s.add_argument("--require-chromium", action="store_true")
    s.set_defaults(fn=cmd_doctor)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    try:
        a = parser.parse_args(argv)
    except SystemExit as e:
        return 2 if e.code not in (0, None) else 0
    try:
        return a.fn(a)
    except StudioError as e:
        log(f"ERROR: {e}")
        emit({"ok": False, "error": str(e)})
        return 1
    except KeyboardInterrupt:
        emit({"ok": False, "error": "interrupted"})
        return 130
    except Exception as e:  # unexpected: keep the traceback on stderr for debugging
        traceback.print_exc(file=sys.stderr)
        emit({"ok": False, "error": f"unexpected {type(e).__name__}: {e}"})
        return 1


if __name__ == "__main__":
    sys.exit(main())
