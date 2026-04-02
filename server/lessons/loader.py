"""Lesson loader - loads lesson JSON files."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, List, Dict
from server.config import LESSONS_DIR

def get_available_lessons() -> List[Dict]:
    """Get list of available lessons with basic info."""
    lessons = []
    for lesson_file in sorted(LESSONS_DIR.glob("lesson_*.json")):
        with open(lesson_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            lessons.append({
                "lesson_number": data["lesson_number"],
                "title": data["title"],
                "description": data.get("description", ""),
                "exercise_count": len(data.get("exercises", []))
            })
    return lessons

def get_lesson(lesson_number: int) -> Optional[dict]:
    """Load a specific lesson by number."""
    lesson_file = LESSONS_DIR / f"lesson_{lesson_number:02d}.json"
    if not lesson_file.exists():
        return None

    with open(lesson_file, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_exercise(lesson_number: int, exercise_index: int) -> Optional[dict]:
    """Get a specific exercise from a lesson."""
    lesson = get_lesson(lesson_number)
    if not lesson:
        return None

    exercises = lesson.get("exercises", [])
    if exercise_index < 0 or exercise_index >= len(exercises):
        return None

    return exercises[exercise_index]
