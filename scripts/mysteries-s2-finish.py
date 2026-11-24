"""Mix the S2 score and dialogue, then write the captioned episode and chapters."""
from pathlib import Path
import json
import re
import subprocess
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

work = Path(sys.argv[1]).resolve()
title = "The Star That Weighed a Black Hole"
order = [1, 2, 3, 4, 5, 6, 0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
fps = 24


def ff(*args):
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def loudness(path):
    result = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-map", "0:a",
        "-af", "ebur128=peak=true", "-f", "null", "-"], check=True, capture_output=True, text=True)
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", result.stderr)[-1])


def frames(ch):
    raw = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=nb_frames", "-of", "default=nw=1:nk=1", work/f"video-{ch:02}.mp4"])
    return int(raw.splitlines()[0])


def timestamp(t):
    ms = max(0, round(t*1000))
    return f"{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}"


def interview():
    overlay = Image.new("RGBA",(1280,720))
    draw = ImageDraw.Draw(overlay)
    for y in range(505,720):
        draw.line((0,y,1280,y),fill=(13,10,21,int(172*((y-505)/215)**.7)))
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Georgia.ttf",36)
    draw.text((60,609),"Professor Rowan Ellery",font=font,fill="#fff1ea")
    overlay.save(work/"interview-title.png")
    ff("-i",work/"rowan.mp4","-i",work/"interview-title.png","-filter_complex",
       "[0:v]fps=24,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1[c];[c][1:v]overlay",
       "-an","-c:v","libx264","-preset","fast","-crf","20","-pix_fmt","yuv420p","-video_track_timescale","24000",work/"video-00.mp4")


def main():
    interview()
    lengths={ch:frames(ch) for ch in order}
    total=sum(lengths.values())/fps
    inputs=[]; stages=[]; cues=[]; subtitles=[]; index=0
    names=re.findall(r"^## \d+ · (.+)$",Path("docs/mysteries-of-the-sky/episodes/s2/narration.md").read_text(),re.M)
    for i,ch in enumerate(order):
        dur=lengths[ch]/fps
        if ch==16:
            inputs+=["-f","lavfi","-i","anullsrc=r=48000:cl=mono"]
            gain=0
        else:
            file=work/f"{ch:02}.mp3"
            inputs+=["-i",file]
            gain=-19.9-loudness(file)
            words=[w for w in json.loads((work/f"{ch:02}.words.json").read_text())["words"] if w["type"]=="word"]
            phrase=[]
            for j,w in enumerate(words):
                phrase.append(w)
                text=" ".join(item["text"] for item in phrase)
                if j==len(words)-1 or len(text)>=57 or (len(text)>=12 and text.endswith((".","?","!"))):
                    start=index/fps+phrase[0]["start"]
                    stop=index/fps+min(dur,phrase[-1]["end"]+.10,words[j+1]["start"] if j+1<len(words) else dur)
                    subtitles.append(f"{len(subtitles)+1}\n{timestamp(start)} --> {timestamp(stop)}\n"+textwrap.fill(text,width=41))
                    phrase=[]
        stages.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=mono,volume={gain:.3f}dB,apad,atrim=end_sample={lengths[ch]*2000},asetpts=PTS-STARTPTS[a{i}]")
        end=index+lengths[ch]
        name="Rowan Ellery" if ch==0 else "Credits" if ch==16 else names[ch-1]
        cues.extend(["[CHAPTER]","TIMEBASE=1/24",f"START={index}",f"END={end}","title="+name]);index=end
    stages.append("".join(f"[a{i}]" for i in range(len(order)))+f"concat=n={len(order)}:v=0:a=1,pan=stereo|c0=c0|c1=c0[voice]")
    ff(*inputs,"-filter_complex",";".join(stages),"-map","[voice]","-c:a","flac",work/"voice.flac")
    voice_lufs=loudness(work/"voice.flac")
    score_lufs=loudness(work/"score.caf")
    target_music=voice_lufs-15.0
    music_gain=target_music-score_lufs
    mix=(f"[1:a]aresample=48000,volume={music_gain:.2f}dB,atrim=duration={total:.7f},afade=t=out:st={total-4:.6f}:d=4[m];"
         "[0:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false:latency=true[mix]")
    ff("-i",work/"voice.flac","-i",work/"score.caf","-filter_complex",mix,"-map","[mix]","-c:a","aac","-b:a","144k",work/"mix.m4a")
    (work/"mix-levels.json").write_text(json.dumps(dict(dialogue_lufs=voice_lufs,score_source_lufs=score_lufs,score_gain_db=round(music_gain,2),score_mix_lufs=target_music,master_lufs=loudness(work/"mix.m4a")),indent=2))
    (work/"episode.srt").write_text("\n\n".join(subtitles)+"\n")
    (work/"chapters.ffmeta").write_text("\n".join([";FFMETADATA1","title="+title,"artist=Mysteries of the Sky",*cues])+"\n")
    (work/"chapters.ffconcat").write_text("ffconcat version 1.0\n"+"".join(f"file 'video-{ch:02}.mp4'\n" for ch in order))
    ff("-f","concat","-safe","0","-i",work/"chapters.ffconcat","-i",work/"mix.m4a","-i",work/"episode.srt","-i",work/"chapters.ffmeta",
       "-map","0:v","-map","1:a","-map","2:s","-map_metadata","3","-map_chapters","3","-c:v","copy","-c:a","copy","-c:s","mov_text",
       "-metadata:s:s:0","language=eng","-disposition:s:0","0","-movflags","+faststart",work.parent/(title+".mp4"))
    print(total, (work/"mix-levels.json").read_text(), flush=True)


if __name__=="__main__":
    main()
