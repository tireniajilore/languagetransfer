"""Whisper Speech-to-Text service."""
from __future__ import annotations

import tempfile
import whisper
from pathlib import Path
from typing import Union
from server.config import WHISPER_MODEL, TEMP_DIR

# Load model once at module level
_model = None

def get_model():
    """Get or load the Whisper model."""
    global _model
    if _model is None:
        print(f"Loading Whisper model '{WHISPER_MODEL}'...")
        _model = whisper.load_model(WHISPER_MODEL)
        print("Whisper model loaded.")
    return _model

def transcribe_audio(audio_path: Union[str, Path], language: str = "es") -> dict:
    """
    Transcribe audio file to text.

    Args:
        audio_path: Path to the audio file
        language: Language hint (default: Spanish)

    Returns:
        dict with 'text' and 'language' keys
    """
    model = get_model()

    result = model.transcribe(
        str(audio_path),
        language=language,
        verbose=False
    )

    return {
        "text": result["text"].strip(),
        "language": result.get("language", language)
    }

def transcribe_audio_bytes(audio_bytes: bytes, language: str = "es", suffix: str = ".wav") -> dict:
    """
    Transcribe audio bytes to text.

    Args:
        audio_bytes: Audio data as bytes
        language: Language hint (default: Spanish)
        suffix: File suffix for the temporary audio file

    Returns:
        dict with 'text' and 'language' keys
    """
    if not suffix.startswith("."):
        suffix = f".{suffix}"

    with tempfile.NamedTemporaryFile(dir=TEMP_DIR, suffix=suffix, delete=False) as temp_file:
        temp_file.write(audio_bytes)
        temp_path = Path(temp_file.name)

    try:
        return transcribe_audio(temp_path, language)
    finally:
        # Clean up temp file
        if temp_path.exists():
            temp_path.unlink()
