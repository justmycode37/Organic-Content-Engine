"""Generate the existing Titan and Rowan voices and aligned word cues."""
import concurrent.futures
import json
import re
import subprocess
import sys
import time
from pathlib import Path

episode = sys.argv[1]
work = Path(sys.argv[2]).resolve()
work.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1]
story = (root / "docs/mysteries-of-the-sky/episodes" / episode / "narration.md").read_text()
chapters = re.findall(r"^## (\d+) · [^\n]+\n\n(.*?)(?=\n## |\Z)", story, re.M | re.S)


def monid(*args):
    command = subprocess.run(["monid", *args, "-j"], capture_output=True, text=True, timeout=85)
    return json.loads(command.stdout)


def job(name, provider, endpoint, body):
    reservation = work / (name + ".run")
    if not reservation.exists():
        for attempt in range(4):
            run = monid("run", "-p", provider, "-e", endpoint, "-i", json.dumps(body))
            if "runId" in run:
                break
            error = run.get("error") or run.get("message") or "missing run identifier"
            if "fetch failed" not in str(error).lower() or attempt == 3:
                raise RuntimeError(f"{provider} could not start {name}: {str(error)[:350]}")
            time.sleep(2 ** attempt)
        reservation.write_text(run["runId"])
    for _ in range(20):
        run = monid("runs", "get", "-r", reservation.read_text(), "-w", "35")
        status = run.get("status")
        if status == "COMPLETED":
            print(name, "complete", flush=True)
            return run["output"]
        if status in {"FAILED", "CANCELED", "CANCELLED", "EXPIRED"}:
            raise RuntimeError(f"{provider} run for {name} ended in {status}")
        time.sleep(1)
    raise TimeoutError(f"{provider} run for {name} is still pending")


def download(url, dest):
    temporary = dest.with_suffix(dest.suffix + ".partial")
    subprocess.run(["curl", "--retry", "4", "--max-time", "65", "-fsSL", url, "-o", temporary], check=True)
    temporary.replace(dest)


def produce(tag, narration):
    narration = narration.strip()
    rowan = narration.startswith("Rowan\n\n")
    narration = narration.removeprefix("Rowan\n\n").strip()
    audio = work / f"{tag}.mp3"
    words = work / f"{tag}.words.json"
    avatar = work / f"rowan-{tag}.mp4"
    if audio.exists() and words.exists() and (not rowan or avatar.exists()):
        return
    voice = {
        "voice_id": "PerZoH0r6nxBZXCoIPpv" if rowan else "dtSEyYGNJqjrtBArPCVZ",
        "model_id": "eleven_multilingual_v2" if rowan else "eleven_flash_v2_5",
        "voice_settings": {"stability": 0.53, "similarity_boost": 0.82} if rowan else {"stability": 0.20, "similarity_boost": 0.20},
        "text": narration,
    }
    output = job(tag + "-voice", "elevenlabs", "/text-to-speech", voice)
    url = output["audio"]["download_link"]
    if not audio.exists():
        download(url, audio)
    if not words.exists():
        aligned = job(tag + "-words", "elevenlabs", "/v1/speech-to-text", {
            "audio_url": url, "language_code": "en", "timestamps_granularity": "word",
            "tag_audio_events": False, "expected_duration_minutes": 1,
        })
        assert aligned.get("words"), f"Missing word timings for {tag}"
        words.write_text(json.dumps(aligned))
    if rowan and not avatar.exists():
        profile = json.loads((root / "docs/mysteries-of-the-sky/presenter/profile.json").read_text())
        gesture = ("Beginning on 'a long column', shape a narrow tube with both hands, then turn one hand to indicate looking end-on."
                   if tag == "17" else "On 'closer to the center', move one hand slowly toward the other, then let both settle.")
        performance = job(tag + "-avatar", "heygen", "/v1/video/heygen-avatar-6-i2v", {
            "model": "heygen-avatar-6-turbo", "resolution": "1080p",
            "reference_images": [{"type": "url", "url": profile["portraitUrl"]}],
            "audio": {"type": "url", "url": url},
            "motion_prompt": "A subtle office webcam interview. Locked camera, a natural and engaged explanation. " + gesture,
            "motion_expressiveness": "default",
        })
        download(performance["video_url"], avatar)


if not chapters:
    raise ValueError("No narration chapters")
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    futures = {pool.submit(produce, *chapter): chapter[0] for chapter in chapters}
    errors = []
    for future in concurrent.futures.as_completed(futures):
        try:
            future.result()
        except Exception as error:
            errors.append(f"{futures[future]}: {error}")
    if errors:
        raise RuntimeError("\n".join(errors))
