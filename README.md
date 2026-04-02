# Voice AI Spanish Tutor

An interactive Spanish tutor using the Language Transfer "Thinking Method" with voice AI.

## Features

- 🎤 Voice recording for spoken Spanish answers
- 🔊 Natural text-to-speech using ElevenLabs
- 🧠 AI-powered answer evaluation using Gemini
- 📚 Lessons 2-4 from Language Transfer's Complete Spanish

## Prerequisites

- **Python 3.9+** (already installed)
- **Node.js 18+** - Install with `brew install node`
- **API Keys** (already configured in .env):
  - ElevenLabs API key
  - Google Gemini API key

## Quick Start

### Option 1: Use the startup script

```bash
chmod +x start.sh
./start.sh
```

### Option 2: Manual startup

**Terminal 1 - Backend:**
```bash
pip3 install -r requirements.txt
python3 -m uvicorn server.main:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Project Structure

```
voiceai/
├── server/              # FastAPI backend
│   ├── main.py          # App entry point
│   ├── routers/         # API endpoints
│   └── services/        # Whisper, ElevenLabs, Gemini
├── web/                 # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── hooks/       # React hooks
│       └── api/         # API client
├── data/
│   └── lessons/         # Lesson JSON files
├── transcripts/         # Original transcripts
└── scripts/             # Utility scripts
```

## How It Works

1. Select a lesson from the home screen
2. Listen to the prompt (played via ElevenLabs)
3. Click "Record" and speak your answer in Spanish
4. Your audio is transcribed by Whisper
5. Gemini evaluates if your answer is correct
6. Get feedback and move to the next exercise

## Lessons Available

- **Lesson 2**: Latin Cognates - AL Endings (17 exercises)
- **Lesson 3**: ANT/ENT Endings & Adverbs (24 exercises)
- **Lesson 4**: The -CIÓN Rule & Quiero (16 exercises)

## API Endpoints

- `GET /api/lessons` - List available lessons
- `GET /api/lessons/{id}` - Get lesson with exercises
- `POST /api/audio/transcribe` - Transcribe audio to text
- `POST /api/audio/speak` - Generate speech from text
- `POST /api/evaluate` - Evaluate user's answer

## Credits

Based on [Language Transfer](https://www.languagetransfer.org/)'s Complete Spanish course.
