"""ElevenLabs Text-to-Speech service with caching support."""

import hashlib
import threading
import os
from pathlib import Path
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor

from server.config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_SPANISH,
    ELEVENLABS_VOICE_ENGLISH,
    ELEVENLABS_MODEL,
    DATA_DIR
)

# Check if we should use mock mode (no API key or explicitly disabled)
USE_MOCK_TTS = not ELEVENLABS_API_KEY or os.getenv("MOCK_TTS", "").lower() == "true"

# Initialize client only if not in mock mode
client = None
if not USE_MOCK_TTS:
    try:
        from elevenlabs import ElevenLabs
        client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
    except Exception:
        USE_MOCK_TTS = True


def _generate_silent_mp3(duration_ms: int = 1000) -> bytes:
    """Generate a minimal valid MP3 file (silent) for mock mode."""
    # Minimal valid MP3 frame (silence) - this is a valid MP3 header + frame
    # This creates a ~0.5 second silent MP3
    mp3_header = bytes([
        0xFF, 0xFB, 0x90, 0x00,  # MP3 frame header (MPEG1 Layer3, 128kbps, 44100Hz)
    ])
    # Pad with zeros for a minimal valid frame
    frame_size = 417  # Size for 128kbps at 44100Hz
    silent_frame = mp3_header + bytes(frame_size - 4)
    # Repeat for approximate duration
    num_frames = max(1, duration_ms // 26)  # ~26ms per frame
    return silent_frame * num_frames

# Audio cache directory
AUDIO_CACHE_DIR = DATA_DIR / "audio"
AUDIO_CACHE_DIR.mkdir(exist_ok=True)

# Thread pool for prefetching
_prefetch_executor = ThreadPoolExecutor(max_workers=3)
_prefetch_lock = threading.Lock()
_prefetching: set = set()

# Nudge audio cache
_nudge_audio_cache: Optional[bytes] = None
NUDGE_TEXT = "Whenever you're ready..."


def _get_cache_path(lesson_number: int, turn_index: int) -> Path:
    """Get the cache file path for a turn."""
    lesson_dir = AUDIO_CACHE_DIR / f"lesson_{lesson_number:02d}"
    lesson_dir.mkdir(exist_ok=True)
    return lesson_dir / f"turn_{turn_index:03d}.mp3"


def _get_text_hash(text: str) -> str:
    """Get a hash of text for cache validation."""
    return hashlib.md5(text.encode()).hexdigest()[:8]


def speak_spanish(text: str) -> bytes:
    """
    Generate Spanish speech using ElevenLabs.

    Args:
        text: Spanish text to speak

    Returns:
        Audio bytes (MP3 format)
    """
    if USE_MOCK_TTS or client is None:
        # Return mock audio based on text length
        duration = max(500, len(text) * 50)  # ~50ms per character
        return _generate_silent_mp3(duration)

    audio_generator = client.text_to_speech.convert(
        voice_id=ELEVENLABS_VOICE_SPANISH,
        text=text,
        model_id=ELEVENLABS_MODEL
    )

    # Convert generator to bytes
    audio_bytes = b"".join(audio_generator)
    return audio_bytes


def speak_english(text: str) -> bytes:
    """
    Generate English speech using ElevenLabs.

    Args:
        text: English text to speak

    Returns:
        Audio bytes (MP3 format)
    """
    if USE_MOCK_TTS or client is None:
        duration = max(500, len(text) * 50)
        return _generate_silent_mp3(duration)

    audio_generator = client.text_to_speech.convert(
        voice_id=ELEVENLABS_VOICE_ENGLISH,
        text=text,
        model_id="eleven_monolingual_v1"
    )

    # Convert generator to bytes
    audio_bytes = b"".join(audio_generator)
    return audio_bytes


def speak(text: str, language: str = "en") -> bytes:
    """
    Generate speech in the specified language.

    Args:
        text: Text to speak
        language: Language code ('en' or 'es')

    Returns:
        Audio bytes (MP3 format)
    """
    if language == "es":
        return speak_spanish(text)
    else:
        return speak_english(text)


def speak_cached(lesson_number: int, turn_index: int, text: str) -> bytes:
    """
    Generate speech with caching. Uses cached audio if available.

    Args:
        lesson_number: The lesson number
        turn_index: The turn index within the lesson
        text: The text to speak

    Returns:
        Audio bytes (MP3 format)
    """
    cache_path = _get_cache_path(lesson_number, turn_index)

    # Check if cached file exists
    if cache_path.exists():
        with open(cache_path, "rb") as f:
            return f.read()

    # Use mock TTS if enabled or client unavailable
    if USE_MOCK_TTS or client is None:
        duration = max(500, len(text) * 50)
        audio_bytes = _generate_silent_mp3(duration)
        with open(cache_path, "wb") as f:
            f.write(audio_bytes)
        return audio_bytes

    # Try ElevenLabs, fall back to mock on failure
    try:
        audio_generator = client.text_to_speech.convert(
            voice_id=ELEVENLABS_VOICE_SPANISH,
            text=text,
            model_id=ELEVENLABS_MODEL
        )
        audio_bytes = b"".join(audio_generator)
    except Exception as e:
        # API error (quota, network, etc.) - use mock audio
        print(f"ElevenLabs API error, using mock audio: {e}")
        duration = max(500, len(text) * 50)
        audio_bytes = _generate_silent_mp3(duration)

    # Cache the audio
    with open(cache_path, "wb") as f:
        f.write(audio_bytes)

    return audio_bytes


def _prefetch_single(lesson_number: int, turn_index: int, text: str):
    """Prefetch a single turn's audio in the background."""
    cache_key = (lesson_number, turn_index)

    with _prefetch_lock:
        if cache_key in _prefetching:
            return  # Already being prefetched
        _prefetching.add(cache_key)

    try:
        cache_path = _get_cache_path(lesson_number, turn_index)
        if not cache_path.exists():
            if USE_MOCK_TTS or client is None:
                duration = max(500, len(text) * 50)
                audio_bytes = _generate_silent_mp3(duration)
            else:
                try:
                    audio_generator = client.text_to_speech.convert(
                        voice_id=ELEVENLABS_VOICE_SPANISH,
                        text=text,
                        model_id=ELEVENLABS_MODEL
                    )
                    audio_bytes = b"".join(audio_generator)
                except Exception:
                    duration = max(500, len(text) * 50)
                    audio_bytes = _generate_silent_mp3(duration)

            with open(cache_path, "wb") as f:
                f.write(audio_bytes)
    finally:
        with _prefetch_lock:
            _prefetching.discard(cache_key)


def prefetch_turns(lesson_number: int, turns: List[Dict]):
    """
    Prefetch audio for multiple turns in the background.

    Args:
        lesson_number: The lesson number
        turns: List of dicts with 'turn_index' and 'text' keys
    """
    for turn in turns:
        turn_index = turn.get("turn_index")
        text = turn.get("text", "")
        if turn_index is not None and text:
            cache_path = _get_cache_path(lesson_number, turn_index)
            if not cache_path.exists():
                _prefetch_executor.submit(_prefetch_single, lesson_number, turn_index, text)


def get_nudge_audio() -> bytes:
    """
    Get the gentle nudge audio for silence management.
    Cached after first generation.

    Returns:
        Audio bytes (MP3 format)
    """
    global _nudge_audio_cache

    if _nudge_audio_cache is not None:
        return _nudge_audio_cache

    # Check file cache
    nudge_path = AUDIO_CACHE_DIR / "nudge.mp3"
    if nudge_path.exists():
        with open(nudge_path, "rb") as f:
            _nudge_audio_cache = f.read()
        return _nudge_audio_cache

    # Generate nudge audio
    if USE_MOCK_TTS or client is None:
        _nudge_audio_cache = _generate_silent_mp3(1500)
    else:
        try:
            audio_generator = client.text_to_speech.convert(
                voice_id=ELEVENLABS_VOICE_SPANISH,
                text=NUDGE_TEXT,
                model_id=ELEVENLABS_MODEL
            )
            _nudge_audio_cache = b"".join(audio_generator)
        except Exception:
            _nudge_audio_cache = _generate_silent_mp3(1500)

    # Cache to file
    with open(nudge_path, "wb") as f:
        f.write(_nudge_audio_cache)

    return _nudge_audio_cache


def clear_lesson_cache(lesson_number: int):
    """Clear the audio cache for a specific lesson."""
    lesson_dir = AUDIO_CACHE_DIR / f"lesson_{lesson_number:02d}"
    if lesson_dir.exists():
        for file in lesson_dir.glob("*.mp3"):
            file.unlink()


def clear_all_cache():
    """Clear all audio cache."""
    for lesson_dir in AUDIO_CACHE_DIR.glob("lesson_*"):
        for file in lesson_dir.glob("*.mp3"):
            file.unlink()
    nudge_path = AUDIO_CACHE_DIR / "nudge.mp3"
    if nudge_path.exists():
        nudge_path.unlink()
