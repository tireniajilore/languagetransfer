"""User progress tracking."""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional
from server.config import PROGRESS_DIR

def get_progress_file(user_id: str = "default") -> Path:
    """Get the progress file path for a user."""
    return PROGRESS_DIR / f"{user_id}_progress.json"

def get_default_progress() -> dict:
    """Get default progress structure."""
    return {
        "user_id": "default",
        "current_lesson": 2,
        "current_exercise_index": 0,
        "completed_lessons": [],
        "exercise_history": [],
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat()
    }

def load_progress(user_id: str = "default") -> dict:
    """Load user progress from file."""
    progress_file = get_progress_file(user_id)

    if not progress_file.exists():
        return get_default_progress()

    with open(progress_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_progress(progress: dict, user_id: str = "default") -> None:
    """Save user progress to file."""
    progress["updated_at"] = datetime.now().isoformat()
    progress_file = get_progress_file(user_id)

    with open(progress_file, 'w', encoding='utf-8') as f:
        json.dump(progress, f, indent=2)

def update_exercise_progress(
    user_id: str,
    lesson_number: int,
    exercise_index: int,
    is_correct: bool,
    attempts: int = 1
) -> dict:
    """Update progress after completing an exercise."""
    progress = load_progress(user_id)

    # Add to history
    progress["exercise_history"].append({
        "lesson": lesson_number,
        "exercise_index": exercise_index,
        "correct": is_correct,
        "attempts": attempts,
        "timestamp": datetime.now().isoformat()
    })

    # Update current position
    progress["current_lesson"] = lesson_number
    progress["current_exercise_index"] = exercise_index + 1

    save_progress(progress, user_id)
    return progress

def mark_lesson_complete(user_id: str, lesson_number: int) -> dict:
    """Mark a lesson as completed."""
    progress = load_progress(user_id)

    if lesson_number not in progress["completed_lessons"]:
        progress["completed_lessons"].append(lesson_number)

    # Move to next lesson
    progress["current_lesson"] = lesson_number + 1
    progress["current_exercise_index"] = 0

    save_progress(progress, user_id)
    return progress
