#!/usr/bin/env python3
"""
Split a whole Language Transfer lesson, IN ORDER, into consecutive ~1-min videos.

Walks every turn from the start of the lesson, shows the spoken text as captions
(English white, Spanish green), plays the real ElevenLabs audio, and inserts a
"YOUR TURN" answer gap after every question turn. The continuous lesson is then
cut at turn boundaries into Part 1, Part 2, ... each ~60s. The final part ends
with the lesson's outro lines + a course card.

Usage:
  python3 make_lesson_parts.py --lesson lesson-02 --seconds 60
"""
import argparse, json, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
AUDIO_ROOT = ROOT / "lt-runner" / "public" / "audio"
OUT = Path(__file__).resolve().parent / "out"

W, H = 1080, 1920
BG = (14, 17, 23)
MUTED = (138, 143, 152)
WHITE = (240, 240, 242)
YELLOW = (255, 214, 10)
GREEN = (48, 209, 88)

THINK_GAP = 2.5
PAD = 0.35
FONT_DIR = "/System/Library/Fonts/Supplemental"
BAND_TOP, BAND_BOT = 560, 1320          # vertical band the caption lives in

def font(name, size): return ImageFont.truetype(f"{FONT_DIR}/{name}", size)
def dur(p):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration",
         "-of","default=nw=1:nk=1", str(p)]).strip())

# ---------- mixed-colour, auto-fitting caption ----------
def tokenize(segments):
    toks=[]
    for s in segments:
        color = GREEN if s["lang"]=="es" else WHITE
        for w in s["text"].split():
            toks.append((w,color))
    return toks

def layout(draw, toks, fnt):
    space=draw.textlength(" ",font=fnt); max_w=W-150
    lines=[]; cur=[]; curw=0
    for word,color in toks:
        ww=draw.textlength(word,font=fnt)
        if cur and curw+space+ww>max_w:
            lines.append((cur,curw)); cur=[(word,color,ww)]; curw=ww
        else:
            curw = ww if not cur else curw+space+ww
            cur.append((word,color,ww))
    if cur: lines.append((cur,curw))
    return lines

def fit_font(draw, toks):
    for size in (88,80,72,64,56,50,44,40):
        f=font("Arial Bold.ttf",size)
        lines=layout(draw,toks,f); lh=int(size*1.28)
        if len(lines)*lh <= (BAND_BOT-BAND_TOP):
            return f,lines,lh
    f=font("Arial Bold.ttf",36); return f,layout(draw,toks,f),int(36*1.28)

def base(part_label):
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    tw=d.textlength(part_label,font=font("Arial Bold.ttf",34))
    d.text(((W-tw)//2,140),part_label,font=font("Arial Bold.ttf",34),fill=MUTED)
    return img,d

def turn_slide(segments, part_label, show_turn):
    img,d=base(part_label)
    toks=tokenize(segments)
    f,lines,lh=fit_font(d,toks)
    space=d.textlength(" ",font=f)
    total_h=len(lines)*lh
    y=BAND_TOP+((BAND_BOT-BAND_TOP)-total_h)//2
    for line,lw in lines:
        x=(W-lw)//2
        for word,color,ww in line:
            d.text((x,y),word,font=f,fill=color); x+=ww+space
        y+=lh
    if show_turn:
        d2=d
        t="YOUR TURN"; tw=d2.textlength(t,font=font("Arial Bold.ttf",58))
        d2.text(((W-tw)//2,1470),t,font=font("Arial Bold.ttf",58),fill=YELLOW)
        s="say it out loud"; sw=d2.textlength(s,font=font("Arial.ttf",38))
        d2.text(((W-sw)//2,1556),s,font=font("Arial.ttf",38),fill=MUTED)
    return img

def course_slide(part_label):
    img,d=base(part_label)
    for ln,(txt,col,sz) in enumerate([("Full free course",WHITE,96),("in bio →",WHITE,96),
                                      ("",None,20),("languagetransfer.org",GREEN,46)]):
        if not txt: continue
        f=font("Arial Bold.ttf" if col is WHITE else "Arial.ttf",sz)
        tw=d.textlength(txt,font=f); d.text(((W-tw)//2,720+ln*120),txt,font=f,fill=col)
    return img

# ---------- build ----------
def is_question(segs):
    en=[s for s in segs if s["lang"]=="en"]
    return bool(en) and en[-1]["text"].strip().endswith("?")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--lesson",required=True)
    ap.add_argument("--seconds",type=float,default=60.0)
    a=ap.parse_args()
    OUT.mkdir(exist_ok=True)
    ld=AUDIO_ROOT/a.lesson
    manifest=json.load(open(ld/"manifest.json"))
    entries=[(k,v) for k,v in manifest["entries"].items()]

    tmp=Path(tempfile.mkdtemp(prefix="ltparts_"))
    # Build one "unit" per turn: concatenated audio + (caption slide, gap?)
    units=[]   # each: {segs, audio, adur, question}
    for i,(key,turn) in enumerate(entries):
        segs=turn["segments"]
        files=[ld/s["file"] for s in segs]
        clist=tmp/f"{key}.txt"; clist.write_text("".join(f"file '{p}'\n" for p in files))
        au=tmp/f"{key}.m4a"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
            "-i",str(clist),"-c:a","aac",str(au)],check=True)
        q=is_question(segs)
        adur=dur(au)
        unit_len=adur+PAD+(THINK_GAP if q else 0)
        units.append({"segs":segs,"audio":au,"adur":adur,"q":q,"len":unit_len,"key":key})

    # Pack units into parts by duration budget
    parts=[]; cur=[]; curlen=0
    for u in units:
        if cur and curlen+u["len"]>a.seconds:
            parts.append(cur); cur=[]; curlen=0
        cur.append(u); curlen+=u["len"]
    if cur: parts.append(cur)
    N=len(parts)
    print(f"{a.lesson}: {len(units)} turns -> {N} parts (~{a.seconds:.0f}s each)")

    for pi,part in enumerate(parts,1):
        label=f"LESSON {int(a.lesson.split('-')[1])} · PART {pi}/{N}"
        timeline=[]   # (png, dur, audio|None)
        for ui,u in enumerate(part):
            slide=tmp/f"p{pi}_{ui}.png"
            turn_slide(u["segs"],label,False).save(slide)
            timeline.append((slide,u["adur"]+PAD,u["audio"]))
            if u["q"]:
                g=tmp/f"p{pi}_{ui}_q.png"
                turn_slide(u["segs"],label,True).save(g)
                timeline.append((g,THINK_GAP,None))
        if pi==N:
            cs=tmp/f"course{pi}.png"; course_slide(label).save(cs)
            timeline.append((cs,3.0,None))

        # video
        vlist=tmp/f"v{pi}.txt"; L=["ffconcat version 1.0"]
        for png,d_,_ in timeline: L+= [f"file '{png}'",f"duration {d_:.3f}"]
        L.append(f"file '{timeline[-1][0]}'"); vlist.write_text("\n".join(L)+"\n")
        vmp4=tmp/f"v{pi}.mp4"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
            "-i",str(vlist),"-fps_mode","cfr","-r","30","-pix_fmt","yuv420p",
            "-c:v","libx264",str(vmp4)],check=True)
        # audio
        aparts=[]
        for j,(png,d_,au) in enumerate(timeline):
            seg=tmp/f"a{pi}_{j}.m4a"
            if au is None:
                subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{d_:.3f}",
                    "-i","anullsrc=r=44100:cl=stereo","-c:a","aac",str(seg)],check=True)
            else:
                subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(au),
                    "-af",f"aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur={d_:.3f}",
                    "-t",f"{d_:.3f}","-c:a","aac",str(seg)],check=True)
            aparts.append(seg)
        alist=tmp/f"a{pi}.txt"; alist.write_text("".join(f"file '{p}'\n" for p in aparts))
        amp4=tmp/f"a{pi}.m4a"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
            "-i",str(alist),"-c","copy",str(amp4)],check=True)

        out=OUT/f"lesson-{int(a.lesson.split('-')[1]):02d}-part{pi}.mp4"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(vmp4),"-i",str(amp4),
            "-c:v","copy","-c:a","aac","-shortest",str(out)],check=True)
        print(f"  Part {pi}: {len(part)} turns  ->  {out.name}  ({dur(out):.1f}s)")

if __name__=="__main__":
    main()
