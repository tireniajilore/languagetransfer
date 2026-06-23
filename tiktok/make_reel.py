#!/usr/bin/env python3
"""
Chain a Language Transfer lesson's challenge cards into one ~60s vertical reel.

A "card" in these lessons = a question turn ("How would you say X?") answered by
the FIRST Spanish segment of the next turn. We detect those pairs straight from
the lesson's manifest.json, then assemble a single video:

  [title]  ->  card 1 (prompt / YOUR TURN / reveal)  ->  card 2  -> ...  -> [outro]

Captions come from the manifest text; audio is the actual ElevenLabs mp3s.

Usage:
  python3 make_reel.py --lesson lesson-02 --title "Lesson 2 · instant Spanish" \
      --target-seconds 60
"""
import argparse, json, re, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
AUDIO_ROOT = ROOT / "lt-runner" / "public" / "audio"
OUT = Path(__file__).resolve().parent / "out"

W, H = 1080, 1920
BG = (14, 17, 23)
MUTED = (138, 143, 152)
WHITE = (245, 245, 245)
YELLOW = (255, 214, 10)
GREEN = (48, 209, 88)

THINK_GAP = 2.5     # silent seconds for the learner to answer
HOLD = 0.8          # hold the reveal after its audio ends
PAD = 0.3           # small breath after prompt audio before the gap
FONT_DIR = "/System/Library/Fonts/Supplemental"

def font(name, size): return ImageFont.truetype(f"{FONT_DIR}/{name}", size)
def dur(p):
    return float(subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration",
         "-of","default=nw=1:nk=1", str(p)]).strip())

# ---------- text layout ----------
def wrap(text, fnt, draw, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t=(cur+" "+w).strip()
        if draw.textlength(t,font=fnt)<=max_w: cur=t
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    return lines

def centered(draw, lines, top, fnt, fill, gap=22):
    y=top
    for ln in lines:
        bb=draw.textbbox((0,0),ln,font=fnt); tw,th=bb[2]-bb[0],bb[3]-bb[1]
        draw.text(((W-tw)//2,y),ln,font=fnt,fill=fill); y+=th+gap
    return y

def base():
    img=Image.new("RGB",(W,H),BG); d=ImageDraw.Draw(img)
    centered(d,["LANGUAGE TRANSFER · SPANISH"],140,font("Arial Bold.ttf",34),MUTED)
    return img,d

def vcenter_block(n_lines, line_h):
    return (H - n_lines*line_h)//2 - 40

def title_slide(title):
    img,d=base()
    centered(d,["SPANISH IN","60 SECONDS"],620,font("Arial Bold.ttf",120),WHITE,gap=10)
    centered(d,[title],960,font("Arial.ttf",46),GREEN)
    centered(d,["say each answer out loud"],1120,font("Arial.ttf",40),MUTED)
    return img

def prompt_slide(english, show_turn):
    img,d=base()
    fq=font("Arial Bold.ttf",84)
    lines=wrap(f'"{english}"',fq,d,W-150)
    top=vcenter_block(len(lines)+1,110)
    centered(d,["How would you say…"],top-110,font("Arial.ttf",44),MUTED)
    centered(d,lines,top,fq,WHITE)
    if show_turn:
        centered(d,["YOUR TURN"],1330,font("Arial Bold.ttf",60),YELLOW)
        centered(d,["say it out loud"],1420,font("Arial.ttf",38),MUTED)
    return img

def reveal_slide(spanish, gloss):
    img,d=base()
    fa=font("Arial Bold.ttf",140)
    lines=wrap(spanish,fa,d,W-120)
    top=vcenter_block(len(lines),170)
    centered(d,lines,top,fa,GREEN)
    if gloss:
        centered(d,[gloss],top+len(lines)*170+40,font("Arial.ttf",46),MUTED)
    return img

def outro_slide():
    img,d=base()
    centered(d,["Full free course","in bio →"],720,font("Arial Bold.ttf",96),WHITE,gap=10)
    centered(d,["languagetransfer.org"],1020,font("Arial.ttf",44),GREEN)
    return img

# ---------- card detection ----------
Q_RE = re.compile(r"how would you say|how do you think you would say|how do you say|what if you want to say", re.I)

def english_of(turn):
    return " ".join(s["text"] for s in turn["segments"] if s["lang"]=="en").strip()

def first_es(turn):
    for s in turn["segments"]:
        if s["lang"]=="es": return s
    return None

def target_phrase(en_text):
    # prefer quoted target, else the word(s) right before the question mark
    q=re.findall(r"[\"'‘’“”]([^\"'‘’“”]+)[\"'‘’“”]", en_text)
    if q: return max(q, key=len).strip().strip("?.")
    m=re.search(r"how (?:would|do) you (?:think you would )?say (.+?)\s*\??$", en_text.strip(), re.I)
    if m: return m.group(1).strip().strip("?.")
    return en_text.strip().strip("?")

def build_cards(manifest):
    items=list(manifest["entries"].items())  # ordered
    cards=[]
    for i,(key,turn) in enumerate(items):
        if not key.startswith("turn-"): continue
        en=english_of(turn)
        if not (Q_RE.search(en) and en.rstrip().endswith("?")): continue
        # answer = first spanish segment of the next turn
        if i+1>=len(items): continue
        nxt=items[i+1][1]
        ans=first_es(nxt)
        if not ans: continue
        cards.append({
            "prompt_text": target_phrase(en),
            "prompt_files":[s["file"] for s in turn["segments"]],
            "answer_text": ans["text"].strip().rstrip("."),
            "answer_file": ans["file"],
        })
    return cards

# ---------- assembly ----------
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--lesson",required=True)
    ap.add_argument("--title",default="instant Spanish")
    ap.add_argument("--target-seconds",type=float,default=60.0)
    a=ap.parse_args()
    OUT.mkdir(exist_ok=True)

    ld=AUDIO_ROOT/a.lesson
    manifest=json.load(open(ld/"manifest.json"))
    cards=build_cards(manifest)
    print(f"detected {len(cards)} cards in {a.lesson}")

    with tempfile.TemporaryDirectory() as tmp:
        tmp=Path(tmp)
        timeline=[]   # (png, duration, audio_path_or_None)

        # title (2.5s, silent)
        ts=tmp/"title.png"; title_slide(a.title).save(ts)
        timeline.append((ts,2.5,None))

        total=2.5; used=0
        for idx,c in enumerate(cards):
            # concat this card's prompt audio (may be several segments)
            pfiles=[ld/f for f in c["prompt_files"]]
            pconcat=tmp/f"p{idx}.txt"
            pconcat.write_text("".join(f"file '{p}'\n" for p in pfiles))
            paudio=tmp/f"p{idx}.m4a"
            subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
                "-i",str(pconcat),"-c:a","aac",str(paudio)],check=True)
            pdur=dur(paudio)
            rfile=ld/c["answer_file"]; rdur=dur(rfile)

            card_len = pdur+PAD + THINK_GAP + rdur+HOLD
            if total >= a.target_seconds and used>0:
                break

            ps1=tmp/f"ps1_{idx}.png"; prompt_slide(c["prompt_text"],False).save(ps1)
            ps2=tmp/f"ps2_{idx}.png"; prompt_slide(c["prompt_text"],True ).save(ps2)
            rs =tmp/f"rs_{idx}.png";  reveal_slide(c["answer_text"],None).save(rs)

            timeline.append((ps1, pdur+PAD, paudio))
            timeline.append((ps2, THINK_GAP, None))
            timeline.append((rs,  rdur+HOLD, rfile))
            total+=card_len; used+=1
            print(f"  + card {used}: '{c['prompt_text']}' -> '{c['answer_text']}'  ({card_len:.1f}s)")

        # outro (3s silent)
        os_=tmp/"outro.png"; outro_slide().save(os_)
        timeline.append((os_,3.0,None)); total+=3.0

        # build video (ffconcat of stills)
        vlist=tmp/"video.txt"
        lines=["ffconcat version 1.0"]
        for png,d_,_ in timeline:
            lines.append(f"file '{png}'"); lines.append(f"duration {d_:.3f}")
        lines.append(f"file '{timeline[-1][0]}'")   # last frame held
        vlist.write_text("\n".join(lines)+"\n")
        silent_video=tmp/"video.mp4"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
            "-i",str(vlist),"-fps_mode","cfr","-r","30","-pix_fmt","yuv420p",
            "-c:v","libx264",str(silent_video)],check=True)

        # build audio: per-segment, real mp3 padded to slot length, or silence
        aparts=[]
        for i,(png,d_,ap_) in enumerate(timeline):
            seg=tmp/f"a_{i}.m4a"
            if ap_ is None:
                subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{d_:.3f}",
                    "-i","anullsrc=r=44100:cl=stereo","-c:a","aac",str(seg)],check=True)
            else:
                # play audio then pad with silence to fill the slot duration
                subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(ap_),
                    "-af",f"aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur={d_:.3f}",
                    "-t",f"{d_:.3f}","-c:a","aac",str(seg)],check=True)
            aparts.append(seg)
        alist=tmp/"audio.txt"; alist.write_text("".join(f"file '{p}'\n" for p in aparts))
        full_audio=tmp/"audio.m4a"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0",
            "-i",str(alist),"-c","copy",str(full_audio)],check=True)

        out=OUT/f"reel-{a.lesson}.mp4"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(silent_video),
            "-i",str(full_audio),"-c:v","copy","-c:a","aac","-shortest",str(out)],check=True)
        print(f"\nOK  {out}  ({dur(out):.1f}s, {used} cards)")

if __name__=="__main__":
    main()
