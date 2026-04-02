"""Lessons API router."""

from fastapi import APIRouter, HTTPException
from server.lessons.loader import get_available_lessons, get_lesson, get_exercise
from server.lessons.progress import load_progress, save_progress, update_exercise_progress, mark_lesson_complete

router = APIRouter(prefix="/api/lessons", tags=["lessons"])

@router.get("")
async def list_lessons():
    """Get list of all available lessons."""
    return get_available_lessons()

@router.get("/{lesson_number}")
async def get_lesson_detail(lesson_number: int):
    """Get a specific lesson with all exercises."""
    lesson = get_lesson(lesson_number)
    if not lesson:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_number} not found")
    return lesson

@router.get("/{lesson_number}/exercises/{exercise_index}")
async def get_exercise_detail(lesson_number: int, exercise_index: int):
    """Get a specific exercise from a lesson."""
    exercise = get_exercise(lesson_number, exercise_index)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise

@router.get("/progress/{user_id}")
async def get_user_progress(user_id: str = "default"):
    """Get user's current progress."""
    return load_progress(user_id)

@router.post("/progress/{user_id}/exercise")
async def update_progress(
    user_id: str,
    lesson_number: int,
    exercise_index: int,
    is_correct: bool,
    attempts: int = 1
):
    """Update progress after completing an exercise."""
    return update_exercise_progress(user_id, lesson_number, exercise_index, is_correct, attempts)

@router.post("/progress/{user_id}/complete-lesson")
async def complete_lesson(user_id: str, lesson_number: int):
    """Mark a lesson as completed."""
    return mark_lesson_complete(user_id, lesson_number)
