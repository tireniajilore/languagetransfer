"""Conversation API router for scripted conversation flow."""

import mimetypes
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from server.services.conversation_state import state_manager
from server.services.elevenlabs_tts import speak_cached, prefetch_turns, get_nudge_audio
from server.services.whisper_stt import transcribe_audio_bytes
from server.services.gemini_evaluator import evaluate_answer

router = APIRouter(prefix="/api/conversation", tags=["conversation"])


class StartRequest(BaseModel):
    lesson_number: int


class StartResponse(BaseModel):
    session_id: str
    lesson_number: int
    title: str
    total_turns: int


class TurnResponse(BaseModel):
    turn_index: int
    total_turns: int
    speaker: str
    text: Optional[str] = None
    is_prompt: Optional[bool] = None
    is_feedback: Optional[bool] = None
    expected_answers: Optional[List[str]] = None
    is_complete: bool = False


class RespondResult(BaseModel):
    transcribed_text: str
    is_correct: bool
    feedback_type: str
    feedback_en: str
    correct_spanish: str
    specific_issue: Optional[str] = None


class AdvanceResult(BaseModel):
    success: bool
    is_complete: bool


@router.get("/lessons")
async def list_lessons():
    """List available v2 lessons."""
    return state_manager.get_available_lessons()


@router.post("/start", response_model=StartResponse)
async def start_conversation(request: StartRequest):
    """Start a new conversation session for a lesson."""
    try:
        session = state_manager.create_session(request.lesson_number)
        lesson = state_manager.load_lesson(request.lesson_number)

        # Prefetch first few tutor turns
        tutor_turns = state_manager.get_next_tutor_turns(session.session_id, count=5)
        if tutor_turns:
            prefetch_turns(request.lesson_number, tutor_turns)

        return StartResponse(
            session_id=session.session_id,
            lesson_number=request.lesson_number,
            title=lesson.get("title", ""),
            total_turns=len(lesson.get("turns", []))
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Lesson {request.lesson_number} not found")


@router.get("/{session_id}/turn", response_model=TurnResponse)
async def get_current_turn(session_id: str):
    """Get the current turn for a session."""
    turn = state_manager.get_turn(session_id)

    if turn is None:
        session = state_manager.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
        # Lesson complete
        return TurnResponse(
            turn_index=session.current_turn_index,
            total_turns=session.current_turn_index,
            speaker="system",
            is_complete=True
        )

    return TurnResponse(
        turn_index=turn["turn_index"],
        total_turns=turn["total_turns"],
        speaker=turn["speaker"],
        text=turn.get("text"),
        is_prompt=turn.get("is_prompt"),
        is_feedback=turn.get("is_feedback"),
        expected_answers=turn.get("expected_answers"),
        is_complete=False
    )


@router.get("/{session_id}/turn/audio")
async def get_turn_audio(session_id: str):
    """Get audio for the current tutor turn."""
    session = state_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    turn = state_manager.get_turn(session_id)
    if not turn:
        raise HTTPException(status_code=404, detail="No current turn")

    if turn.get("speaker") != "tutor":
        raise HTTPException(status_code=400, detail="Current turn is not a tutor turn")

    text = turn.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Turn has no text")

    try:
        audio_bytes = speak_cached(session.lesson_number, turn["turn_index"], text)

        # Prefetch next tutor turns while delivering this one
        next_turns = state_manager.get_next_tutor_turns(session_id, count=3)
        if next_turns:
            prefetch_turns(session.lesson_number, next_turns)

        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"inline; filename=turn_{turn['turn_index']}.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio generation failed: {str(e)}")


@router.get("/{session_id}/nudge")
async def get_nudge_audio_endpoint(session_id: str):
    """Get a gentle audio nudge for silence management."""
    session = state_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        audio_bytes = get_nudge_audio()
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=nudge.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nudge audio failed: {str(e)}")


@router.post("/{session_id}/respond", response_model=RespondResult)
async def submit_response(session_id: str, file: UploadFile = File(...)):
    """Submit user audio response for evaluation."""
    session = state_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    turn = state_manager.get_turn(session_id)
    if not turn:
        raise HTTPException(status_code=400, detail="No current turn")

    if turn.get("speaker") != "student":
        raise HTTPException(status_code=400, detail="Current turn is not a student turn")

    expected_answers = turn.get("expected_answers", [])
    if not expected_answers:
        raise HTTPException(status_code=400, detail="Turn has no expected answers")

    try:
        # Transcribe audio
        audio_bytes = await file.read()
        suffix = Path(file.filename or "").suffix
        if not suffix and file.content_type:
            suffix = mimetypes.guess_extension(file.content_type.split(";")[0].strip()) or ".wav"

        transcription = transcribe_audio_bytes(audio_bytes, language="es", suffix=suffix or ".wav")
        transcribed_text = transcription.get("text", "").strip()

        # Evaluate answer
        lesson = state_manager.load_lesson(session.lesson_number)
        evaluation = evaluate_answer(
            prompt="Student response",
            expected_answers=expected_answers,
            user_response=transcribed_text,
            lesson_title=lesson.get("title", "")
        )

        is_correct = evaluation.get("is_correct", False)

        # Record the response
        state_manager.record_response(session_id, transcribed_text, is_correct)

        return RespondResult(
            transcribed_text=transcribed_text,
            is_correct=is_correct,
            feedback_type=evaluation.get("feedback_type", "retry"),
            feedback_en=evaluation.get("feedback_en", ""),
            correct_spanish=evaluation.get("correct_spanish", expected_answers[0] if expected_answers else ""),
            specific_issue=evaluation.get("specific_issue")
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Response evaluation failed: {str(e)}")


@router.post("/{session_id}/advance", response_model=AdvanceResult)
async def advance_turn(session_id: str):
    """Advance to the next turn (after respond or skip)."""
    session = state_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    next_turn = state_manager.advance_turn(session_id)
    is_complete = next_turn is None

    return AdvanceResult(
        success=True,
        is_complete=is_complete
    )


@router.get("/{session_id}/status")
async def get_session_status(session_id: str):
    """Get the current session status."""
    session = state_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    lesson = state_manager.load_lesson(session.lesson_number)

    return {
        **session.to_dict(),
        "title": lesson.get("title", ""),
        "total_turns": len(lesson.get("turns", [])),
        "is_complete": state_manager.is_lesson_complete(session_id)
    }
