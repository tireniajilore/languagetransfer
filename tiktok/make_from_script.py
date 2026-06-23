#!/usr/bin/env python3
"""
Script-FIRST TikTok generator (animated edition).

Reads a purpose-written short-form script (tiktok/scripts/*.json), synthesizes
each spoken line fresh through your ElevenLabs voice config, and renders a
hook-style vertical video with:
  - a subtle drifting gradient-glow background (motion -> retention, without the
    "brainrot" gameplay vibe that undercuts an educational brand)
  - word-by-word KARAOKE captions on every spoken line (sound-off legibility +
    the single biggest retention lever for language content)
  - a SEAMLESS LOOP: the final frame matches the first (hook) frame and the
    background phase returns to its start, so the clip loops invisibly. Replays
    are TikTok's highest-weighted signal.

Rendering is per-frame (30fps) piped straight to ffmpeg, so the background and
captions can animate continuously.

  --dry-run (default): NO ElevenLabs calls. Estimated silent durations so you can
                       preview pacing/visuals and finalize the script first.
  --voice            : synthesize real audio (cached in tiktok/voice_cache/);
                       only NEW/changed lines cost credits.

Usage:
  python3 make_from_script.py --script tiktok/scripts/spanish-cognates-01.json --dry-run
  python3 make_from_script.py --script tiktok/scripts/spanish-cognates-01.json --voice
"""
import argparse, hashlib, json, math, os, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
CACHE = HERE / "voice_cache"
ENV = ROOT / "lt-runner" / ".env.local"

W, H = 1080, 1920
FPS = 30
BG=(14,17,23); MUTED=(138,143,152); WHITE=(240,240,242); YELLOW=(255,214,10); GREEN=(48,209,88)
GAP=1.5; HOLD=1.0; PAD=0.25; LOOP_BRIDGE=0.45
FONT_DIR="/System/Library/Fonts/Supplemental"

# ElevenLabs config (mirrors lt-runner/src/lib/elevenlabs-config.ts)
VOICE_ID_DEFAULT="21m00Tcm4TlvDq8ikWAM"
MODEL="eleven_multilingual_v2"
SPEED_EN=1.1; SPEED_ES=0.9

# ---------------- text helpers ----------------
_FONTS={}
def font(n,s):
    k=(n,s)
    if k not in _FONTS: _FONTS[k]=ImageFont.truetype(f"{FONT_DIR}/{n}",s)
    return _FONTS[k]
def ctext(d,t,y,f,c):
    tw=d.textlength(t,font=f); d.text(((W-tw)//2,y),t,font=f,fill=c); return tw
def mtext(d,text,y,f,c,gap=12):
    for ln in text.split("\n"):
        ctext(d,ln,y,f,c); y+=int(f.size*1.15)+gap
    return y
def dur(p):
    return float(subprocess.check_output(["ffprobe","-v","error","-show_entries",
        "format=duration","-of","default=nw=1:nk=1",str(p)]).strip())

def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))

# ---------------- karaoke caption ----------------
def _wrap(d, words, f, max_w):
    space=d.textlength(" ",font=f); lines=[]; cur=[]; curw=0; idx=0
    for w in words:
        ww=d.textlength(w,font=f)
        if cur and curw+space+ww>max_w:
            lines.append(cur); cur=[]; curw=0
        cur.append((idx,w,ww)); curw=ww if curw==0 else curw+space+ww; idx+=1
    if cur: lines.append(cur)
    return lines,space

def karaoke(d, text, y, f, t_local, total, max_w=W-150,
            idle=MUTED, done=WHITE, hot=YELLOW):
    """Highlight words progressively. Word i is 'hot' (yellow) while spoken,
    'done' (white) after, 'idle' (muted) before. Even time distribution."""
    words=text.split()
    if not words: return y
    lines,space=_wrap(d,words,f,max_w)
    prog=(t_local/total)*len(words) if total>0 else len(words)
    cur_idx=int(prog)
    lead=prog-cur_idx                      # 0..1 within current word -> fade-in
    lh=int(f.size*1.28)
    for line in lines:
        lw=sum(w for _,_,w in line)+space*(len(line)-1)
        x=(W-lw)//2
        for idx,word,ww in line:
            if idx<cur_idx:   col=done
            elif idx==cur_idx: col=lerp(idle,hot,min(1.0,0.3+lead))
            else:             col=idle
            d.text((x,y),word,font=f,fill=col); x+=ww+space
        y+=lh
    return y

# ---------------- animated background ----------------
def make_glow(size):
    g=Image.new("L",(size,size),0); px=g.load(); c=size/2
    for y in range(size):
        for x in range(size):
            dd=math.hypot(x-c,y-c)/c
            v=max(0.0,1.0-dd); px[x,y]=int(255*v*v)
    return g

_GLOW=None
# (color, center_x, center_y, ampX, ampY, harmonic)
GLOWS=[((24,72,50), 300, 720, 130,170,1),
       ((26,46,90), 820,1230, 150,120,2)]
def bg_frame(tg, T):
    """Drifting gradient glows on the dark base. Driven by tg/T so the phase
    returns to its start at the loop point -> seamless."""
    global _GLOW
    if _GLOW is None: _GLOW=make_glow(1300)
    img=Image.new("RGB",(W,H),BG)
    ph=2*math.pi*(tg/T if T>0 else 0)
    s=_GLOW.size[0]
    for col,cx,cy,ax,ay,k in GLOWS:
        x=int(cx+ax*math.sin(ph*k)-s/2)
        y=int(cy+ay*math.cos(ph*k)-s/2)
        layer=Image.new("RGB",(s,s),col)
        img.paste(layer,(x,y),_GLOW)
    return img

def header(d):
    ctext(d,"LANGUAGE TRANSFER · SPANISH",140,font("Arial Bold.ttf",32),MUTED)

def ring(d,frac):
    cx,cy,r=W//2,1300,118
    d.ellipse([cx-r,cy-r,cx+r,cy+r],outline=(40,44,52),width=18)
    d.arc([cx-r,cy-r,cx+r,cy+r],-90,-90+360*frac,fill=YELLOW,width=18)
    ctext(d,"SAY IT",cy-34,font("Arial Bold.ttf",52),YELLOW)

# ---------------- env + TTS ----------------
def load_env():
    if not ENV.exists(): return {}
    out={}
    for line in ENV.read_text().splitlines():
        line=line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k,v=line.split("=",1); out[k.strip()]=v.strip().strip("'\"")
    return out
def voice_id(env): return env.get("ELEVENLABS_VOICE_ID") or VOICE_ID_DEFAULT
def speed(lang,env):
    if lang=="es": return float(env.get("ELEVENLABS_SPEED_ES") or SPEED_ES)
    return float(env.get("ELEVENLABS_SPEED_EN") or SPEED_EN)
def body(text,lang,env):
    b={"text":text,"model_id":MODEL,
       "voice_settings":{"stability":0.5,"similarity_boost":0.75,"speed":speed(lang,env)}}
    if lang=="es": b.update({"language_code":"es","previous_text":"En español:","next_text":"Muy bien."})
    return b
def cache_path(text,lang,env):
    key=f"{voice_id(env)}|{MODEL}|{speed(lang,env)}|{lang}|{text}"
    return CACHE/(hashlib.sha256(key.encode()).hexdigest()+".mp3")
def synth(text,lang,env):
    CACHE.mkdir(exist_ok=True); cp=cache_path(text,lang,env)
    if cp.exists():
        print(f"    cache  {lang}: {text[:48]!r}"); return cp
    import urllib.request
    api=env.get("ELEVENLABS_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
    if not api: sys.exit("ELEVENLABS_API_KEY not found in lt-runner/.env.local")
    print(f"    SYNTH  {lang}: {text[:48]!r}")
    req=urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id(env)}",
        data=json.dumps(body(text,lang,env)).encode(),
        headers={"xi-api-key":api,"Content-Type":"application/json","Accept":"audio/mpeg"},
        method="POST")
    with urllib.request.urlopen(req) as r: data=r.read()
    cp.write_bytes(data); return cp
def est_dur(text,lang):
    wps=2.3 if lang=="en" else 1.9
    return max(0.8,len(text.split())/wps)
def get_audio(text,lang,env,dry,tmp,tag):
    if dry:
        d=est_dur(text,lang); seg=tmp/f"sil_{tag}.m4a"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{d:.3f}",
            "-i","anullsrc=r=44100:cl=stereo","-c:a","aac",str(seg)],check=True)
        return seg,d
    mp3=synth(text,lang,env); return mp3,dur(mp3)

# ---------------- scene renderers ----------------
def r_hook(S):
    h=S["hook"]
    def fn(d,t,tg,T,sd):
        ctext(d,h["show_top"],470,font("Arial Bold.ttf",112),WHITE)
        ctext(d,h["show_main"],612,font("Arial Bold.ttf",112),GREEN)
        ctext(d,h["show_sub"],810,font("Arial.ttf",46),MUTED)
        karaoke(d,h["say"],1120,font("Arial Bold.ttf",48),t,sd)
        ctext(d,h.get("show_cta","say it out loud"),1560,font("Arial Bold.ttf",44),YELLOW)
    return fn
def r_lead(S):
    li=S["lead_in"]
    def fn(d,t,tg,T,sd):
        y=mtext(d,li["show_main"],640,font("Arial Bold.ttf",96),WHITE)
        ctext(d,li.get("show_sub",""),y+30,font("Arial.ttf",46),MUTED)
        karaoke(d,li["say"],1240,font("Arial Bold.ttf",46),t,sd)
    return fn
def r_prompt(c):
    def fn(d,t,tg,T,sd):
        ctext(d,"How do you say…",560,font("Arial.ttf",46),MUTED)
        ctext(d,c["english"],700,font("Arial Bold.ttf",128),WHITE)
        karaoke(d,c["prompt_say"],1180,font("Arial Bold.ttf",46),t,sd)
    return fn
def r_ring(c):
    def fn(d,t,tg,T,sd):
        ctext(d,"How do you say…",560,font("Arial.ttf",44),MUTED)
        ctext(d,c["english"],700,font("Arial Bold.ttf",112),WHITE)
        ring(d,max(0.0,1-t/GAP))
    return fn
def r_reveal(c):
    def fn(d,t,tg,T,sd):
        ctext(d,c["spanish"],760,font("Arial Bold.ttf",150),GREEN)
        ctext(d,f"it's just English «{c['english']}»",980,font("Arial.ttf",50),MUTED)
        if c.get("stress_hint"): ctext(d,c["stress_hint"],1090,font("Arial.ttf",46),YELLOW)
    return fn
def r_outro(S):
    o=S["outro"]
    def fn(d,t,tg,T,sd):
        y=mtext(d,o["show_main"],600,font("Arial Bold.ttf",92),WHITE)
        karaoke(d,o["say"],y+40,font("Arial Bold.ttf",44),t,sd)
        ctext(d,o.get("show_cta","Follow for the free course"),1360,font("Arial Bold.ttf",48),GREEN)
        ctext(d,o.get("show_url","languagetransfer.org"),1450,font("Arial.ttf",42),MUTED)
    return fn

# ---------------- build ----------------
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--script",required=True)
    ap.add_argument("--dry-run",action="store_true")
    ap.add_argument("--voice",action="store_true")
    a=ap.parse_args()
    dry = not a.voice
    if a.dry_run: dry=True
    OUT.mkdir(exist_ok=True)
    env=load_env(); S=json.load(open(a.script))
    print(f"[{'DRY-RUN (no credits)' if dry else 'VOICE (ElevenLabs)'}] {S['id']}")

    tmp=Path(tempfile.mkdtemp(prefix="script_"))
    scenes=[]   # each: {dur, audio|None, render}

    hook_fn=r_hook(S)
    au,d=get_audio(S["hook"]["say"],S["hook"].get("lang","en"),env,dry,tmp,"hook")
    scenes.append({"dur":d+PAD,"audio":au,"render":hook_fn,"sd":d})

    if "lead_in" in S:
        au,d=get_audio(S["lead_in"]["say"],S["lead_in"].get("lang","en"),env,dry,tmp,"lead")
        scenes.append({"dur":d+PAD,"audio":au,"render":r_lead(S),"sd":d})

    for i,c in enumerate(S["cards"]):
        pa,pd=get_audio(c["prompt_say"],"en",env,dry,tmp,f"p{i}")
        ra,rd=get_audio(c["reveal_say"],"es",env,dry,tmp,f"r{i}")
        scenes.append({"dur":pd+PAD,"audio":pa,"render":r_prompt(c),"sd":pd})
        scenes.append({"dur":GAP,"audio":None,"render":r_ring(c),"sd":GAP})
        scenes.append({"dur":rd+HOLD,"audio":ra,"render":r_reveal(c),"sd":rd})

    au,d=get_audio(S["outro"]["say"],S["outro"].get("lang","en"),env,dry,tmp,"outro")
    scenes.append({"dur":max(d,2.0)+0.4,"audio":au,"render":r_outro(S),"sd":d})

    # seamless loop bridge: re-show the hook's first frame so last frame == first
    scenes.append({"dur":LOOP_BRIDGE,"audio":None,"sd":1.0,
                   "render":lambda d,t,tg,T,sd: hook_fn(d,0.0,tg,T,1.0)})

    T=sum(s["dur"] for s in scenes)
    # scene start times
    starts=[]; acc=0.0
    for s in scenes: starts.append(acc); acc+=s["dur"]
    print(f"    {len(scenes)} scenes, {T:.1f}s, {round(T*FPS)} frames")

    # ---- render video frames straight into ffmpeg ----
    vmp4=tmp/"v.mp4"
    proc=subprocess.Popen(["ffmpeg","-y","-loglevel","error","-f","rawvideo",
        "-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-",
        "-an","-c:v","libx264","-pix_fmt","yuv420p",str(vmp4)],stdin=subprocess.PIPE)
    total_frames=round(T*FPS); si=0
    for fr in range(total_frames):
        tg=fr/FPS
        while si+1<len(scenes) and tg>=starts[si+1]: si+=1
        s=scenes[si]; t_local=tg-starts[si]
        img=bg_frame(tg,T); d=ImageDraw.Draw(img)
        header(d); s["render"](d,t_local,tg,T,s["sd"])
        proc.stdin.write(img.tobytes())
    proc.stdin.close(); proc.wait()

    # ---- audio track (per scene, padded to scene duration) ----
    aparts=[]
    for j,s in enumerate(scenes):
        seg=tmp/f"a{j}.m4a"; dd=s["dur"]
        if s["audio"] is None:
            subprocess.run(["ffmpeg","-y","-loglevel","error","-f","lavfi","-t",f"{dd:.3f}",
                "-i","anullsrc=r=44100:cl=stereo","-c:a","aac",str(seg)],check=True)
        else:
            subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(s["audio"]),
                "-af",f"aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur={dd:.3f}",
                "-t",f"{dd:.3f}","-c:a","aac",str(seg)],check=True)
        aparts.append(seg)
    alist=tmp/"a.txt"; alist.write_text("".join(f"file '{p}'\n" for p in aparts))
    amp4=tmp/"a.m4a"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",str(alist),
        "-c","copy",str(amp4)],check=True)

    suffix="-dry" if dry else ""
    out=OUT/f"{S['id']}{suffix}.mp4"
    subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(vmp4),"-i",str(amp4),
        "-c:v","copy","-c:a","aac","-shortest",str(out)],check=True)

    tags=" ".join("#"+t for t in S.get("hashtags",[]))
    (OUT/f"{S['id']}.caption.txt").write_text(S.get("caption","").strip()+"\n\n"+tags+"\n")
    print(f"\nOK  {out}  ({dur(out):.1f}s)  [{len(S['cards'])} cards, seamless loop]")
    if dry: print("    DRY-RUN: silent preview. Re-run with --voice to synthesize audio.")

if __name__=="__main__":
    main()
