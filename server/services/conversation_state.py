"""Conversation session state management."""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from datetime import datetime
import uuid
import json
from pathlib import Path

from server.config import DATA_DIR

LESSONS_V2_DIR = DATA_DIR / "lessons_v2"


@dataclass
class UserResponse:
    """A user's response to a student turn."""
    turn_index: int
    transcribed_text: str
    expected_answers: List[str]
    is_correct: bool
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class ConversationSession:
    """State for an active conversation session."""
    session_id: str
    lesson_number: int
    current_turn_index: int = 0
    responses: List[UserResponse] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "lesson_number": self.lesson_number,
            "current_turn_index": self.current_turn_index,
            "responses": [
                {
                    "turn_index": r.turn_index,
                    "transcribed_text": r.transcribed_text,
                    "expected_answers": r.expected_answers,
                    "is_correct": r.is_correct
                }
                for r in self.responses
            ]
        }


class ConversationStateManager:
    """Manages conversation sessions in memory."""

    def __init__(self):
        self._sessions: Dict[str, ConversationSession] = {}
        self._lessons_cache: Dict[int, dict] = {}

    def load_lesson(self, lesson_number: int) -> dict:
        """Load a lesson from the v2 format."""
        if lesson_number in self._lessons_cache:
            return self._lessons_cache[lesson_number]

        lesson_path = LESSONS_V2_DIR / f"lesson_{lesson_number:02d}.json"
        if not lesson_path.exists():
            raise FileNotFoundError(f"Lesson {lesson_number} not found")

        with open(lesson_path, "r") as f:
            lesson = json.load(f)

        self._lessons_cache[lesson_number] = lesson
        return lesson

    def create_session(self, lesson_number: int) -> ConversationSession:
        """Create a new conversation session."""
        # Validate lesson exists
        self.load_lesson(lesson_number)

        session_id = str(uuid.uuid4())
        session = ConversationSession(
            session_id=session_id,
            lesson_number=lesson_number
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ConversationSession]:
        """Get an existing session."""
        return self._sessions.get(session_id)

    def get_turn(self, session_id: str) -> Optional[dict]:
        """Get the current turn for a session."""
        session = self.get_session(session_id)
        if not session:
            return None

        lesson = self.load_lesson(session.lesson_number)
        turns = lesson.get("turns", [])

        if session.current_turn_index >= len(turns):
            return None  # Lesson complete

        turn = turns[session.current_turn_index]
        return {
            "turn_index": session.current_turn_index,
            "total_turns": len(turns),
            **turn
        }

    def get_next_tutor_turns(self, session_id: str, count: int = 3) -> List[dict]:
        """Get the next N tutor turns for prefetching."""
        session = self.get_session(session_id)
        if not session:
            return []

        lesson = self.load_lesson(session.lesson_number)
        turns = lesson.get("turns", [])

        result = []
        idx = session.current_turn_index

        while len(result) < count and idx < len(turns):
            turn = turns[idx]
            if turn.get("speaker") == "tutor":
                result.append({
                    "turn_index": idx,
                    "text": turn.get("text", "")
                })
            idx += 1

        return result

    def advance_turn(self, session_id: str) -> Optional[dict]:
        """Advance to the next turn and return it."""
        session = self.get_session(session_id)
        if not session:
            return None

        lesson = self.load_lesson(session.lesson_number)
        turns = lesson.get("turns", [])

        session.current_turn_index += 1

        if session.current_turn_index >= len(turns):
            return None  # Lesson complete

        return self.get_turn(session_id)

    def record_response(
        self,
        session_id: str,
        transcribed_text: str,
        is_correct: bool
    ) -> bool:
        """Record a user's response to a student turn."""
        session = self.get_session(session_id)
        if not session:
            return False

        turn = self.get_turn(session_id)
        if not turn or turn.get("speaker") != "student":
            return False

        response = UserResponse(
            turn_index=session.current_turn_index,
            transcribed_text=transcribed_text,
            expected_answers=turn.get("expected_answers", []),
            is_correct=is_correct
        )
        session.responses.append(response)
        return True

    def is_lesson_complete(self, session_id: str) -> bool:
        """Check if the lesson is complete."""
        session = self.get_session(session_id)
        if not session:
            return True

        lesson = self.load_lesson(session.lesson_number)
        turns = lesson.get("turns", [])
        return session.current_turn_index >= len(turns)

    def get_available_lessons(self) -> List[dict]:
        """Get list of available v2 lessons."""
        lessons = []
        for path in sorted(LESSONS_V2_DIR.glob("lesson_*.json")):
            try:
                with open(path, "r") as f:
                    data = json.load(f)
                lessons.append({
                    "lesson_number": data["lesson_number"],
                    "title": data.get("title", ""),
                    "description": data.get("description", ""),
                    "turn_count": len(data.get("turns", []))
                })
            except (json.JSONDecodeError, KeyError):
                continue
        return lessons


# Global instance
state_manager = ConversationStateManager()
