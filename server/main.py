"""FastAPI main application for Voice AI Spanish Tutor."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from server.routers import lessons, audio, evaluate, conversation

# Create FastAPI app
app = FastAPI(
    title="Voice AI Spanish Tutor",
    description="Interactive Spanish tutor using the Language Transfer method",
    version="2.0.0"
)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(conversation.router)  # New conversation API (primary)
app.include_router(lessons.router)  # Legacy lessons API
app.include_router(audio.router)
app.include_router(evaluate.router)

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "voice-ai-tutor"}

@app.on_event("startup")
async def startup_event():
    """Pre-load Whisper model on startup."""
    print("Starting Voice AI Spanish Tutor server...")
    # Optionally pre-load Whisper model
    # from server.services.whisper_stt import get_model
    # get_model()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
