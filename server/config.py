"""Configuration settings for the Voice AI Tutor server."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Keys
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
LESSONS_DIR = DATA_DIR / "lessons"
PROGRESS_DIR = DATA_DIR / "user_progress"
TEMP_DIR = BASE_DIR / "temp"

# Create directories if they don't exist
TEMP_DIR.mkdir(exist_ok=True)
PROGRESS_DIR.mkdir(exist_ok=True)

# Whisper settings
WHISPER_MODEL = "base"

# ElevenLabs settings
ELEVENLABS_VOICE_SPANISH = "pNInz6obpgDQGcFmaJgB"  # Adam - multilingual
ELEVENLABS_VOICE_ENGLISH = "21m00Tcm4TlvDq8ikWAM"  # Rachel - English
ELEVENLABS_MODEL = "eleven_multilingual_v2"
