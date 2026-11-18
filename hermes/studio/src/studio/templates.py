"""Template discovery and the props contract.

A template is ``templates/<name>.html``: a Jinja2 fragment rendered into the
scene shell (``templates/_base.html``). Files starting with ``_`` are internal.

Every template starts with a metadata comment holding JSON:

    <!-- studio:meta
    {
      "description": "One line about when to use it.",
      "media": "optional" | "required" | "none",
      "formats": ["reel"] | ["longform"] | ["reel", "longform"],   (default ["reel"])
      "props": {
        "headline": {"type": "string", "required": true, "description": "..."},
        "items":    {"type": "array", "items": "string", "min": 2, "max": 4},
        "align":    {"type": "string", "enum": ["left", "center"], "default": "left"}
      }
    }
    -->

Supported prop types: string, number, integer, boolean, array, object, any.
``min``/``max`` bound string length, array length or numeric value.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from .env import TEMPLATES_DIR, StudioError

META_RE = re.compile(r"<!--\s*studio:meta\s*(\{.*?\})\s*-->", re.S)


@dataclass
class TemplateInfo:
    name: str
    description: str
    media: str  # "none" | "optional" | "required"
    props: dict[str, dict[str, Any]] = field(default_factory=dict)
    source: str = ""
    formats: tuple[str, ...] = ("reel",)

    def to_json(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "media": self.media,
                "formats": list(self.formats), "props": self.props}


def load_template(name: str) -> TemplateInfo:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", name or ""):
        raise StudioError(f"invalid template name {name!r}")
    path = TEMPLATES_DIR / f"{name}.html"
    if not path.is_file():
        raise StudioError(f"unknown template {name!r} (available: {', '.join(list_template_names())})")
    source = path.read_text(encoding="utf-8")
    m = META_RE.search(source)
    if not m:
        raise StudioError(f"template {name!r} has no <!-- studio:meta {{...}} --> header")
    try:
        meta = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        raise StudioError(f"template {name!r}: invalid meta JSON: {e}") from e
    body = source[: m.start()] + source[m.end():]
    return TemplateInfo(
        name=name,
        description=meta.get("description", ""),
        media=meta.get("media", "none"),
        props=meta.get("props", {}),
        source=body,
        formats=tuple(meta.get("formats", ["reel"])),
    )


def list_template_names() -> list[str]:
    return sorted(p.stem for p in TEMPLATES_DIR.glob("*.html") if not p.name.startswith("_"))


def list_templates() -> list[TemplateInfo]:
    return [load_template(n) for n in list_template_names()]


_TYPES = {
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "array": list,
    "object": dict,
}


def check_props(tpl: TemplateInfo, props: dict[str, Any], where: str) -> tuple[list[str], list[str], dict[str, Any]]:
    """Validate props against the template contract.

    Returns (errors, warnings, props_with_defaults).
    """
    errors: list[str] = []
    warnings: list[str] = []
    out = dict(props)
    for key, rule in tpl.props.items():
        if key not in props or props[key] is None:
            if rule.get("required"):
                errors.append(f"{where}.props.{key}: required by template {tpl.name!r} ({rule.get('description', '')})")
            elif "default" in rule:
                out[key] = rule["default"]
            continue
        if rule.get("type") == "string" and isinstance(props[key], (int, float)) and not isinstance(props[key], bool):
            out[key] = props[key] = str(props[key])  # be lenient: 5 -> "5"
        errors += _check_value(props[key], rule, f"{where}.props.{key}")
    for key in props:
        if key not in tpl.props:
            warnings.append(f"{where}.props.{key}: not part of template {tpl.name!r} contract (ignored unless the template uses it)")
    return errors, warnings, out


def _check_value(value: Any, rule: dict[str, Any], where: str) -> list[str]:
    errs: list[str] = []
    typ = rule.get("type", "any")
    if typ != "any":
        py = _TYPES.get(typ)
        if py is None:
            return [f"{where}: template declares unknown type {typ!r}"]
        if isinstance(value, bool) and typ in ("number", "integer"):
            return [f"{where}: expected {typ}, got boolean"]
        if not isinstance(value, py):
            return [f"{where}: expected {typ}, got {type(value).__name__}"]
    if "enum" in rule and value not in rule["enum"]:
        errs.append(f"{where}: must be one of {rule['enum']}, got {value!r}")
    size = len(value) if isinstance(value, (str, list)) else value if isinstance(value, (int, float)) else None
    if size is not None and not isinstance(value, bool):
        if "min" in rule and size < rule["min"]:
            errs.append(f"{where}: minimum is {rule['min']} ({'length' if isinstance(value, (str, list)) else 'value'} {size})")
        if "max" in rule and size > rule["max"]:
            errs.append(f"{where}: maximum is {rule['max']} ({'length' if isinstance(value, (str, list)) else 'value'} {size})")
    if isinstance(value, list) and "items" in rule:
        item_rule = rule["items"] if isinstance(rule["items"], dict) else {"type": rule["items"]}
        for i, v in enumerate(value):
            errs += _check_value(v, item_rule, f"{where}[{i}]")
    if isinstance(value, dict) and "properties" in rule:
        for k, sub in rule["properties"].items():
            if k in value:
                errs += _check_value(value[k], sub, f"{where}.{k}")
            elif sub.get("required"):
                errs.append(f"{where}.{k}: required")
    return errs
