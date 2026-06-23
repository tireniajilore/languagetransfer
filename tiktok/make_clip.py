#!/usr/bin/env python3
"""
Turn Language Transfer ElevenLabs audio into bite-sized vertical TikTok clips.

The LT "challenge card" unit:
  1. PROMPT  - English question shown + prompt audio plays
  2. THINK   - prompt stays up, "YOUR TURN" appears, silent gap (learner answers aloud)
  3. REVEAL  - Spanish answer shown big + reveal audio plays, short hold

Reads a lesson's manifest.json to get the prompt/reveal text + mp3 files, so
captions are always in sync with the audio that was actually generated.

Usage:
  python3 make_clip.py --lesson lesson-09 --turn 3 \
      --english "I want to know" --spanish "Saber"
"""
import argparse, json, os, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
AUDIO_ROOT = ROOT / "lt-runner" / "public" / "audio"
OUT = Path(__file__).resolve().parent / "out"
WORK = Path(__file__).resolve().parent / "work"

W, H = 1080, 1920
BG = (14, 17, 23)            # near-black
MUTED = (138, 143, 152)      # grey header
WHITE = (245, 245, 245)
YELLOW = (255, 214, 10)      # think prompt
GREEN = (48, 209, 88)        # answer reveal
THINK_GAP = 3.0              # seconds of silence for the learner to answer
HOLD = 1.2                   # seconds to hold the reveal after audio ends

FONT_DIR = "/System/Library/Fonts/Supplemental"
def font(name, size):
    return ImageFont.truetype(f"{FONT_DIR}/{name}", size)

def dur(path):
    out = subprocess.check_output(
        ["ffprobe","-v","error","-show_entries","format=duration",
         "-of","default=nw=1:nk=1", str(path)])
    return float(out.strip())

def centered(draw, lines, top, fnt, fill, line_gap=20):
    y = top
    for ln in lines:
        bb = draw.textbbox((0,0), ln, font=fnt)
        tw, th = bb[2]-bb[0], bb[3]-bb[1]
        draw.text(((W-tw)//2, y), ln, font=fnt, fill=fill)
        y += th + line_gap
    return y

def wrap(text, fnt, draw, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur+" "+w).strip()
        if draw.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def base_slide():
    img = Image.new("RGB", (W,H), BG)
    d = ImageDraw.Draw(img)
    centered(d, ["LANGUAGE TRANSFER · SPANISH"], 150, font("Arial Bold.ttf",34), MUTED)
    return img, d

def prompt_slide(english, show_turn):
    img, d = base_slide()
    f_label = font("Arial.ttf", 44)
    f_q = font("Arial Bold.ttf", 84)
    centered(d, ["How would you say…"], 640, f_label, MUTED)
    lines = wrap(f'"{english}"', f_q, d, W-160)
    centered(d, lines, 740, f_q, WHITE)
    if show_turn:
        centered(d, ["YOUR TURN"], 1180, font("Arial Bold.ttf",60), YELLOW)
        centered(d, ["say it out loud"], 1270, font("Arial.ttf",40), MUTED)
    return img

def reveal_slide(spanish):
    img, d = base_slide()
    f_a = font("Arial Bold.ttf", 150)
    lines = wrap(spanish, f_a, d, W-120)
    centered(d, lines, 820, f_a, GREEN)
    return img

def build_audio(prompt_mp3, reveal_mp3, out):
    subprocess.run([
        "ffmpeg","-y","-loglevel","error",
        "-i",str(prompt_mp3),
        "-f","lavfi","-t",str(THINK_GAP),"-i","anullsrc=r=44100:cl=stereo",
        "-i",str(reveal_mp3),
        "-f","lavfi","-t",str(HOLD),"-i","anullsrc=r=44100:cl=stereo",
        "-filter_complex",
        "[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a0];"
        "[2:a]aformat=sample_rates=44100:channel_layouts=stereo[a2];"
        "[a0][1:a][a2][3:a]concat=n=4:v=0:a=1[out]",
        "-map","[out]", str(out)], check=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lesson", required=True)
    ap.add_argument("--turn", required=True, type=int)
    ap.add_argument("--english", required=True)
    ap.add_argument("--spanish", required=True)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True); WORK.mkdir(exist_ok=True)

    ld = AUDIO_ROOT / a.lesson
    prompt_mp3 = ld / f"turn-{a.turn}-prompt-1.mp3"
    reveal_mp3 = ld / f"turn-{a.turn}-reveal-1.mp3"
    assert prompt_mp3.exists(), prompt_mp3
    assert reveal_mp3.exists(), reveal_mp3

    t_prompt = dur(prompt_mp3)
    t_reveal = dur(reveal_mp3)
    t_turn_in = t_prompt + 0.4          # "YOUR TURN" appears shortly after question
    t_reveal_start = t_prompt + THINK_GAP
    total = t_reveal_start + t_reveal + HOLD

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        prompt_slide(a.english, False).save(tmp/"s1.png")
        prompt_slide(a.english, True ).save(tmp/"s2.png")
        reveal_slide(a.spanish).save(tmp/"s3.png")

        # ffconcat timeline of still images
        concat = tmp/"slides.txt"
        concat.write_text(
            "ffconcat version 1.0\n"
            f"file '{tmp/'s1.png'}'\nduration {t_turn_in:.3f}\n"
            f"file '{tmp/'s2.png'}'\nduration {(t_reveal_start - t_turn_in):.3f}\n"
            f"file '{tmp/'s3.png'}'\nduration {(t_reveal + HOLD):.3f}\n"
            f"file '{tmp/'s3.png'}'\n")

        audio = tmp/"a.m4a"
        build_audio(prompt_mp3, reveal_mp3, audio)

        out = OUT / f"spanish-{a.lesson}-turn{a.turn}.mp4"
        subprocess.run([
            "ffmpeg","-y","-loglevel","error",
            "-f","concat","-safe","0","-i",str(concat),
            "-i",str(audio),
            "-c:v","libx264","-pix_fmt","yuv420p","-r","30",
            "-c:a","aac","-shortest", str(out)], check=True)
        print(f"OK  {out}  ({total:.1f}s)")

if __name__ == "__main__":
    main()
