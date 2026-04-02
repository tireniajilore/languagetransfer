"""Audio API router - STT and TTS endpoints."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from server.services.whisper_stt import transcribe_audio_bytes
from server.services.elevenlabs_tts import speak

router = APIRouter(prefix="/api/audio", tags=["audio"])

class SpeakRequest(BaseModel):
    text: str
    language: str = "en"

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe uploaded audio to Spanish text.

    Accepts audio files (WAV, MP3, etc.)
    Returns transcribed text.
    """
    try:
        audio_bytes = await file.read()
        result = transcribe_audio_bytes(audio_bytes, language="es")
        return {
            "text": result["text"],
            "language": result["language"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@router.post("/speak")
async def text_to_speech(request: SpeakRequest):
    """
    Convert text to speech using ElevenLabs.

    Args:
        text: Text to speak
        language: 'en' for English, 'es' for Spanish

    Returns:
        Audio file (MP3)
    """
    try:
        audio_bytes = speak(request.text, request.language)
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=speech.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")
