#!/usr/bin/env python3
"""
Extract exercises from Language Transfer transcripts using Gemini.
Parses lessons 2-4 and outputs structured JSON files.
"""

import os
import json
import re
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Use the newer google.genai package
from google import genai

# Configure client
client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

def get_extraction_prompt(lesson_number: int, transcript: str) -> str:
    return f"""
You are analyzing a transcript from the Language Transfer Spanish course.
Extract all exercises (questions asked to the student) from this transcript.

For each exercise, identify:
1. The prompt (question asked, e.g., "How would you say 'metal' in Spanish?")
2. The expected answer(s) in Spanish
3. Any hints or explanations given before/after
4. The type of exercise (word_conversion, sentence_building, comprehension)

IMPORTANT RULES:
- Only extract actual exercises where the teacher asks the student to produce Spanish
- Look for patterns like "How would you say...", "What is...", "How is..."
- The student's response usually follows the question
- Include variations if the teacher mentions them
- Ignore meta-commentary about the method itself

Return a JSON array with this structure:
[
  {{
    "id": "l{lesson_number}_e1",
    "type": "word_conversion or sentence_building or comprehension",
    "prompt": "The question in English",
    "expected_answers": ["answer1", "answer2"],
    "acceptable_variations": ["variation1"],
    "hint": "Any hint given (optional, can be null)",
    "explanation": "Brief explanation of the concept (optional, can be null)"
  }}
]

Here is the transcript for Lesson {lesson_number}:

{transcript}

Return ONLY valid JSON array, no other text or markdown formatting.
"""

def extract_exercises_from_transcript(transcript: str, lesson_number: int) -> list:
    """Use Gemini to extract exercises from a transcript."""
    prompt = get_extraction_prompt(lesson_number, transcript)

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt
    )
    text = response.text.strip()

    # Clean up response - remove markdown code blocks if present
    if text.startswith("```"):
        text = re.sub(r'^```json?\n?', '', text)
        text = re.sub(r'\n?```$', '', text)

    try:
        exercises = json.loads(text)
        return exercises
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON for lesson {lesson_number}: {e}")
        print(f"Response was: {text[:500]}...")
        return []

def create_lesson_json(lesson_number: int, title: str, description: str, exercises: list) -> dict:
    """Create the full lesson JSON structure."""
    return {
        "lesson_number": lesson_number,
        "title": title,
        "description": description,
        "exercises": exercises
    }

def main():
    script_dir = Path(__file__).parent.parent
    transcripts_dir = script_dir / "transcripts"
    output_dir = script_dir / "data" / "lessons"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Lesson metadata
    lessons = {
        2: {
            "title": "Latin Cognates - AL Endings",
            "description": "Words ending in -AL convert directly to Spanish with stress on final syllable. Introduction to 'es' (is/it is)."
        },
        3: {
            "title": "ANT/ENT Endings & Adverbs",
            "description": "Words ending in -ANT/-ENT add -E. Adverbs with -mente. J-sound becomes CH in Spanish."
        },
        4: {
            "title": "The -CIÓN Rule & Quiero",
            "description": "Words ending in -tion become -ción. Derive verbs from nouns. Introduction to 'quiero' (I want)."
        }
    }

    for lesson_num, meta in lessons.items():
        transcript_file = transcripts_dir / f"Language Transfer - Complete Spanish - Lesson {lesson_num:02d}.txt"

        if not transcript_file.exists():
            print(f"Transcript not found: {transcript_file}")
            continue

        print(f"\n{'='*60}")
        print(f"Processing Lesson {lesson_num}: {meta['title']}")
        print('='*60)

        # Read transcript
        transcript = transcript_file.read_text(encoding='utf-8')

        # Extract exercises using Gemini
        print("Extracting exercises with Gemini...")
        exercises = extract_exercises_from_transcript(transcript, lesson_num)

        if not exercises:
            print(f"No exercises extracted for lesson {lesson_num}")
            continue

        print(f"Extracted {len(exercises)} exercises")

        # Renumber exercises to ensure unique IDs
        for i, ex in enumerate(exercises, 1):
            ex['id'] = f"l{lesson_num}_e{i}"

        # Create full lesson structure
        lesson_data = create_lesson_json(
            lesson_number=lesson_num,
            title=meta['title'],
            description=meta['description'],
            exercises=exercises
        )

        # Save to JSON
        output_file = output_dir / f"lesson_{lesson_num:02d}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(lesson_data, f, indent=2, ensure_ascii=False)

        print(f"Saved to: {output_file}")

        # Print summary of exercises
        print(f"\nExercise summary:")
        for ex in exercises[:5]:  # Show first 5
            print(f"  - {ex['prompt'][:60]}...")
        if len(exercises) > 5:
            print(f"  ... and {len(exercises) - 5} more")

if __name__ == "__main__":
    main()
