"""Gemini-based answer evaluation service."""

import json
import re
from google import genai
from server.config import GOOGLE_API_KEY

# Initialize client
client = genai.Client(api_key=GOOGLE_API_KEY)

def get_evaluation_prompt(prompt: str, expected_answers: list, user_response: str, lesson_title: str) -> str:
    """Generate the evaluation prompt for Gemini."""
    return f"""You are evaluating a Spanish language learner's spoken response.

Context: {lesson_title}
Prompt given to student: "{prompt}"
Expected answer(s): {json.dumps(expected_answers)}
User said (transcribed by Whisper): "{user_response}"

Evaluation rules:
1. Accept minor pronunciation/transcription variations (e.g., "quiero" vs "kiero", "kyero")
2. Accept missing or incorrect accent marks
3. Word order must be substantially correct
4. Core vocabulary must match the expected answer
5. Be encouraging but accurate

Respond as JSON only (no markdown, no extra text):
{{
  "is_correct": true or false,
  "confidence": 0.0 to 1.0,
  "feedback_type": "correct" or "close" or "retry",
  "feedback_en": "Brief encouraging feedback in English (1-2 sentences)",
  "correct_spanish": "The correct answer in Spanish",
  "specific_issue": "What was wrong if anything, or null if correct"
}}"""

def evaluate_answer(
    prompt: str,
    expected_answers: list,
    user_response: str,
    lesson_title: str = ""
) -> dict:
    """
    Evaluate a user's answer using Gemini.

    Args:
        prompt: The exercise prompt
        expected_answers: List of acceptable answers
        user_response: What the user said (transcribed)
        lesson_title: Title of the current lesson for context

    Returns:
        dict with evaluation results
    """
    evaluation_prompt = get_evaluation_prompt(
        prompt, expected_answers, user_response, lesson_title
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=evaluation_prompt
    )

    text = response.text.strip()

    # Clean up response - remove markdown code blocks if present
    if text.startswith("```"):
        text = re.sub(r'^```json?\n?', '', text)
        text = re.sub(r'\n?```$', '', text)

    try:
        result = json.loads(text)
        return result
    except json.JSONDecodeError:
        # Fallback if parsing fails
        return {
            "is_correct": False,
            "confidence": 0.5,
            "feedback_type": "retry",
            "feedback_en": "I couldn't evaluate your answer. Please try again.",
            "correct_spanish": expected_answers[0] if expected_answers else "",
            "specific_issue": "Evaluation error"
        }
