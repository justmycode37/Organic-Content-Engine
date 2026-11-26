"""Finish the Refsdal episode from rendered chapters and word-timed recordings."""
import json
import re
import subprocess
import sys
import textwrap
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

WORK = Path(sys.argv[1]).resolve()
OUT = WORK.parent / "The Star That Kept Its Appointment - Revised Cut.mp4"
FPS = 24
RATE = 48000
ORDER = [1, 2, 3, 4, 5, 0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
FONT = Path("/System/Library/Fonts/Supplemental")
CAMEO_IN = 0


def ff(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def video_frames(path):
    return int(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=nb_frames", "-of", "default=nk=1:nw=1", path]).splitlines()[0])


def label(draw, x, y, s, size=24, serif=False, color="#fff1ea"):
    font = ImageFont.truetype(str(FONT / ("Georgia.ttf" if serif else "Arial.ttf")), size)
    draw.text((x, y), s, fill=color, font=font)


def overlays():
    cameo = Image.new("RGBA", (1280, 720))
    d = ImageDraw.Draw(cameo)
    for y in range(475, 720):
        d.line((0, y, 1280, y), fill=(10, 8, 20, int(185*((y-475)/245)**.65)))
    label(d, 58, 607, "Professor Rowan Ellery", 38, True)
    cameo.save(WORK/"rowan-title.png")
    backdrop = Image.new("RGB", (1280, 720))
    b = ImageDraw.Draw(backdrop)
    for y in range(720):
        b.line((0, y, 1280, y), fill=(18+int(17*y/720),17+int(5*y/720),34+int(9*y/720)))
    label(b, 55, 311, "Hubble in orbit", 54, True)
    backdrop.save(WORK/"archive-title.png")


def video_edits():
    codec = ["-c:v","libx264","-threads","3","-preset","veryfast","-crf","20",
             "-pix_fmt","yuv420p","-colorspace","bt709","-color_trc","bt709",
             "-color_primaries","bt709","-video_track_timescale","24000"]
    ff("-ss", str(CAMEO_IN), "-i", WORK/"rowan.mp4", "-i", WORK/"rowan-title.png",
       "-filter_complex", "[0:v]fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[cam];[cam][1:v]overlay", "-an",
       *codec,WORK/"video-00.mp4")
    n = video_frames(WORK/"video-15.mp4")
    archive_n = 194
    graph = (f"[0:v]trim=end_frame={n-archive_n},setpts=PTS-STARTPTS,setsar=1[prev];"
             "[1:v]fps=24,crop=720:530:120:4,scale=704:518,setsar=1[orbit];"
             f"[2:v][orbit]overlay=x=514:y=100:shortest=1,fps=24,trim=end_frame={archive_n},"
             "setpts=PTS-STARTPTS,setsar=1[archive];[prev][archive]concat=n=2:v=1:a=0")
    ff("-i",WORK/"video-15.mp4","-i",WORK/"hubble-orbit.mp4","-loop","1","-framerate","24",
       "-i",WORK/"archive-title.png","-filter_complex",graph,"-an","-frames:v",str(n),*codec,WORK/"video-ending.mp4")
    if video_frames(WORK/"video-ending.mp4") != n:
        raise ValueError("Archival insert changed chapter duration")


def combine_audio(durations):
    # Synthesize the score one chunk at a time so no uncompressed master goes to disk.
    cmd=["ffmpeg","-v","error","-y","-f","f32le","-ar",str(RATE),"-ac","2","-i","pipe:0",
         "-c:a","aac","-b:a","144k",str(WORK/"mix.m4a")]
    encoder=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    cursor=0
    total=sum(durations.values())
    progression=[(146.83,220,261.63),(116.54,174.61,220),(130.81,196,246.94),(110,164.81,220)]
    for ch in ORDER:
        samples=round(durations[ch]*RATE)
        if ch==16:
            voice=np.zeros(samples,np.float32)
        else:
            name=f"{ch:02}.mp3"
            seek=["-ss",str(CAMEO_IN)] if ch==0 else []
            raw=subprocess.check_output(["ffmpeg","-v","error",*seek,"-i",WORK/name,"-vn","-ac","1",
                 "-ar",str(RATE),"-f","f32le","-"])
            v=np.frombuffer(raw,dtype="<f4")[:samples]
            voice=np.pad(v,(0,samples-len(v))) * (1.65 if ch==0 else .87)
            if ch==0:
                # Tame occasional consonant peaks after matching interview loudness.
                peak=np.abs(voice)
                voice=np.sign(voice)*(np.minimum(peak,.74)+.13*np.tanh(np.maximum(peak-.74,0)/.13))
        for start in range(0,samples,RATE):
            v=voice[start:start+RATE]
            t=(cursor+start+np.arange(len(v)))/RATE
            bed=np.zeros((len(v),2))
            # Crossfade overlapping, slowly changing chords with zero attack at each entry.
            slot=int(t[0]//16)
            for bar in range(max(0,slot-1),slot+2):
                age=t-bar*16
                envelope=np.sin(np.pi*np.clip(age/30,0,1))**2
                for j,hz in enumerate(progression[bar%4]):
                    for side in range(2):
                        tone=np.sin(2*np.pi*(hz+side*.14)*t+.4*j)
                        bed[:,side]+=(.0036 if j==0 else .0023)*tone*envelope
            if ch==16:bed*=1.65
            bed*=np.clip((total-t)/3.8,0,1)[:,None]
            encoded=(v[:,None]+bed).astype("<f4")
            encoder.stdin.write(encoded.tobytes())
        cursor+=samples
    encoder.stdin.close()
    if encoder.wait():raise RuntimeError("Audio encoder failed")


def srt_time(t):
    ms=max(0,round(t*1000))
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def captions(durations):
    entries=[]
    pos=0
    for ch in ORDER:
        if ch==16:break
        source=json.loads((WORK/f"{ch:02}.words.json").read_text())
        start_offset=CAMEO_IN if ch==0 else 0
        chunk=[]
        for w in source["words"]:
            if w["type"]!="word" or w["start"]<start_offset:continue
            chunk.append(w)
            text=" ".join(i["text"] for i in chunk)
            if len(text)>=57 or len(text)>12 and text.endswith((".","?","!")):
                entries.append((pos+chunk[0]["start"]-start_offset,pos+chunk[-1]["end"]-start_offset,text))
                chunk=[]
        if chunk:
            entries.append((pos+chunk[0]["start"]-start_offset,pos+chunk[-1]["end"]-start_offset,
                            " ".join(i["text"] for i in chunk)))
        pos+=durations[ch]
    blocks=[]
    for i,(a,b,text) in enumerate(entries):
        text=re.sub(r"\b(?:SSX|S X)\b","SX",text,flags=re.I)
        text=re.sub(r"\bRe[fv]s?d[ae]ll?\b","Refsdal",text,flags=re.I)
        next_time=entries[i+1][0] if i+1<len(entries) else b+.35
        blocks.append(f"{i+1}\n{srt_time(a)} --> {srt_time(min(b+.16,next_time-.01))}\n"+
                      "\n".join(textwrap.wrap(text,width=42,break_long_words=False)))
    (WORK/"episode.srt").write_text("\n\n".join(blocks)+"\n")


def main():
    overlays()
    video_edits()
    videos={i: WORK/("video-ending.mp4" if i==15 else f"video-{i:02}.mp4") for i in ORDER}
    durations={i:video_frames(videos[i])/FPS for i in ORDER}
    captions(durations)
    combine_audio(durations)
    (WORK/"chapters.ffconcat").write_text("ffconcat version 1.0\n"+"".join(f"file '{videos[i].name}'\n" for i in ORDER))
    titles=re.findall(r"^## \d+ · (.+)$", Path("docs/mysteries-of-the-sky/episodes/refsdal/narration.md").read_text(),re.M)
    meta=[";FFMETADATA1","title=The Star That Kept Its Appointment","artist=Mysteries of the Sky"]
    index=0
    for i in ORDER:
        end=index+round(durations[i]*FPS)
        title="Professor Rowan Ellery" if i==0 else "Credits" if i==16 else titles[i-1]
        meta+=["[CHAPTER]","TIMEBASE=1/24",f"START={index}",f"END={end}","title="+title]
        index=end
    (WORK/"chapters.ffmeta").write_text("\n".join(meta)+"\n")
    ff("-f","concat","-safe","0","-i",WORK/"chapters.ffconcat","-i",WORK/"mix.m4a","-i",WORK/"episode.srt",
       "-f","ffmetadata","-i",WORK/"chapters.ffmeta","-map","0:v:0","-map","1:a:0","-map","2:s:0",
       "-map_metadata","3","-map_chapters","3","-metadata:s:s:0","language=eng",
       "-metadata:s:s:0","handler_name=English captions","-disposition:s:0","0",
       "-c:v","copy","-c:a","copy","-c:s","mov_text","-movflags","+faststart",OUT)
    print(OUT, round(index/FPS,3), "seconds", flush=True)


if __name__=="__main__":
    main()
