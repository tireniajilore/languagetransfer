#!/usr/bin/env python3
"""
Tier-1 viral cut: a ~30s hook-first TikTok clip from a Language Transfer lesson.

Differences from the sequential-parts builder (built for cold-start virality):
  - HOOK CARD (0-2s): bold claim, no meta-narration ("YOU ALREADY SPEAK SPANISH")
  - Only single-word COGNATE cards (metal, legal, natural...) -> the "you already
    know this" payload, which is the most shareable LT content.
  - Animated COUNTDOWN RING during the answer gap (works on mute; tight 1.5s).
  - Reveal sells the aha: big Spanish word + "it's just English «word»".
  - Outro CTA card.

Usage:
  python3 make_hook_clip.py --lesson lesson-02 --seconds 30
"""
import argparse, json, math, re, subprocess, tempfile
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

GAP = 1.5          # answer countdown, tight
HOLD = 1.0
PAD = 0.25
RING_FRAMES = 15
FONT_DIR = "/System/Library/Fonts/Supplemental"

def font(name, size): return ImageFont.truetype(f"{FONT_DIR}/{name}", size)
def dur(p):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration",
         "-of","default=nw=1:nk=1", str(p)]).strip())

def ctext(d, text, y, fnt, fill):
    tw=d.textlength(text,font=fnt); d.text(((W-tw)//2,y),text,font=fnt,fill=fill); return tw

def base():
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    ctext(d,"LANGUAGE TRANSFER · SPANISH",140,font("Arial Bold.ttf",32),MUTED)
    return img,d

def hook_slide():
    img,d=base()
    ctext(d,"YOU ALREADY",560,font("Arial Bold.ttf",118),WHITE)
    ctext(d,"SPEAK SPANISH",700,font("Arial Bold.ttf",118),GREEN)
    ctext(d,"you just don't know it yet",900,font("Arial.ttf",48),MUTED)
    ctext(d,"say every word out loud",1120,font("Arial Bold.ttf",44),YELLOW)
    return img

def prompt_slide(word):
    img,d=base()
    ctext(d,"How do you say…",760,font("Arial.ttf",46),MUTED)
    ctext(d,word,880,font("Arial Bold.ttf",130),WHITE)
    return img

def ring_slide(word, frac):
    img,d=base()
    ctext(d,"How do you say…",560,font("Arial.ttf",44),MUTED)
    ctext(d,word,668,font("Arial Bold.ttf",110),WHITE)
    # countdown ring
    cx,cy,r=W//2,1240,120
    d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(40,44,52),width=18)
    end=-90+360*frac
    d.arc([cx-r,cy-r,cx+r,cy+r],-90,end,fill=YELLOW,width=18)
    ctext(d,"SAY IT",cy-34,font("Arial Bold.ttf",54),YELLOW)
    return img

def reveal_slide(english, spanish):
    img,d=base()
    ctext(d,spanish,820,font("Arial Bold.ttf",150),GREEN)
    ctext(d,f"it's just English «{english}»",1030,font("Arial.ttf",50),MUTED)
    return img

def outro_slide():
    img,d=base()
    ctext(d,"Hundreds more",640,font("Arial Bold.ttf",96),WHITE)
    ctext(d,"like this",760,font("Arial Bold.ttf",96),WHITE)
    ctext(d,"Follow for the free course",980,font("Arial Bold.ttf",48),GREEN)
    ctext(d,"languagetransfer.org",1080,font("Arial.ttf",42),MUTED)
    return img

# ---- single-word cognate card detection ----
Q_RE=re.compile(r"how would you say|how do you (?:think you would )?say", re.I)
def english_of(t): return " ".join(s["text"] for s in t["segments"] if s["lang"]=="en").strip()
def first_es(t):
    for s in t["segments"]:
        if s["lang"]=="es": return s
    return None
def target(en):
    head=en.split("?")[0]                       # text up to the question mark
    q=re.findall(r"[\"'‘’“”]([^\"'‘’“”]+)[\"'‘’“”]",head)
    if q: return max(q,key=len).strip().strip("?.")
    m=re.search(r"say (.+?)$",head.strip(),re.I)
    phrase=(m.group(1) if m else head).strip().strip("?.")
    phrase=re.sub(r"\s+in spanish$","",phrase,flags=re.I)   # drop "... in Spanish"
    return phrase.strip()

def cognate_cards(manifest):
    items=list(manifest["entries"].items()); out=[]
    for i,(k,t) in enumerate(items):
        if not k.startswith("turn-"): continue
        en=english_of(t)
        if not (Q_RE.search(en) and "?" in en): continue
        if i+1>=len(items): continue
        ans=first_es(items[i+1][1])
        if not ans: continue
        word=target(en); sp=ans["text"].strip().rstrip(".")
        # single word, prompt audio short (just the question)
        if len(word.split())!=1 or len(sp.split())!=1: continue
        out.append({"word":word,"sp":sp,
                    "p":t["segments"][-1]["file"],   # last segment = the question audio
                    "r":ans["file"]})
    return out

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--lesson",required=True)
    ap.add_argument("--seconds",type=float,default=30.0)
    a=ap.parse_args(); OUT.mkdir(exist_ok=True)
    ld=AUDIO_ROOT/a.lesson
    manifest=json.load(open(ld/"manifest.json"))
    cards=cognate_cards(manifest)
    print(f"{a.lesson}: {len(cards)} single-word cognate cards: "+", ".join(c['word'] for c in cards))

    tmp=Path(tempfile.mkdtemp(prefix="hook_"))
    timeline=[]   # (png, dur, audio|None)

    hk=tmp/"hook.png"; hook_slide().save(hk); timeline.append((hk,2.2,None))

    total=2.2; used=0
    for idx,c in enumerate(cards):
        pdur=dur(ld/c["p"]); rdur=dur(ld/c["r"])
        if pdur>4.0:      # prompt has teaching/instructions baked in — skip for tight cut
            print(f"  - skip {c['word']} (prompt audio {pdur:.1f}s)"); continue
        clen=pdur+PAD+GAP+rdur+HOLD
        if total>=a.seconds and used>0: break
        ps=tmp/f"p{idx}.png"; prompt_slide(c["word"]).save(ps)
        timeline.append((ps,pdur+PAD,ld/c["p"]))
        for fi in range(RING_FRAMES):
            frac=1-fi/RING_FRAMES
            rf=tmp/f"ring{idx}_{fi}.png"; ring_slide(c["word"],frac).save(rf)
            timeline.append((rf,GAP/RING_FRAMES,None))
        rv=tmp/f"r{idx}.png"; reveal_slide(c["word"],c["sp"]).save(rv)
        timeline.append((rv,rdur+HOLD,ld/c["r"]))
        total+=clen; used+=1
        print(f"  + {c['word']} -> {c['sp']} ({clen:.1f}s)")

    ot=tmp/"outro.png"; outro_slide().save(ot); timeline.append((ot,2.5,None)); total+=2.5

    # video
    vlist=tmp/"v.txt"; L=["ffconcat version 1.0"]
    for png,d_,_ in timeline: L+=[f"file '{png}'",f"duration {d_:.3f}"]
    L.append(f"file '{timeline[-1][0]}'"); vlist.write_text("\n".join(L)+"\n")
    vmp4=tmp/"v.mp4"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
        "-i",str(vlist),"-fps_mode","cfr","-r","30","-pix_fmt","yuv420p",
        "-c:v","libx264",str(vmp4)],check=True)
    # audio
    aparts=[]
    for j,(png,d_,au) in enumerate(timeline):
        seg=tmp/f"a{j}.m4a"
        if au is None:
            subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{d_:.3f}",
                "-i","anullsrc=r=44100:cl=stereo","-c:a","aac",str(seg)],check=True)
        else:
            subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(au),
                "-af",f"aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur={d_:.3f}",
                "-t",f"{d_:.3f}","-c:a","aac",str(seg)],check=True)
        aparts.append(seg)
    alist=tmp/"a.txt"; alist.write_text("".join(f"file '{p}'\n" for p in aparts))
    amp4=tmp/"a.m4a"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
        "-i",str(alist),"-c","copy",str(amp4)],check=True)

    out=OUT/f"hook-{a.lesson}.mp4"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(vmp4),"-i",str(amp4),
        "-c:v","copy","-c:a","aac","-shortest",str(out)],check=True)
    print(f"\nOK  {out}  ({dur(out):.1f}s, {used} cards)")

    # caption + hashtag sidecar
    side=OUT/f"hook-{a.lesson}.caption.txt"
    words=", ".join(c["sp"] for c in cards[:used])
    side.write_text(
        f"You already speak Spanish — you just don't know it yet 🤯 "
        f"Say these out loud: {words}.\n\n"
        "#languagetransfer #learnspanish #spanish #languagelearning "
        "#spanishwords #spanishtok #polyglot #studytok\n")
    print(f"    caption -> {side.name}")

if __name__=="__main__":
    main()
