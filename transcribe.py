#!/usr/bin/env python3
"""
Audio Transcription Script using OpenAI Whisper
Transcribes all audio files in the spanish/ directory
"""

import os
import sys
from pathlib import Path

def check_dependencies():
    """Check if whisper is installed, provide installation instructions if not."""
    try:
        import whisper
        return True
    except ImportError:
        print("=" * 60)
        print("Whisper is not installed. Install it with:")
        print()
        print("  pip install openai-whisper")
        print()
        print("If you have an Apple Silicon Mac, for better performance:")
        print("  pip install openai-whisper torch torchvision torchaudio")
        print()
        print("Note: First run will download the model (~1.5GB for 'base')")
        print("=" * 60)
        return False

def transcribe_audio_files(
    input_dir: str = "spanish",
    output_dir: str = "transcripts",
    model_name: str = "base",
    language: str = None  # Auto-detect (lessons mix English and Spanish)
):
    """
    Transcribe all audio files in input_dir and save transcripts to output_dir.

    Args:
        input_dir: Directory containing audio files
        output_dir: Directory to save transcripts
        model_name: Whisper model size (tiny, base, small, medium, large)
                   - tiny: fastest, least accurate
                   - base: good balance (recommended)
                   - small: better accuracy
                   - medium: high accuracy
                   - large: best accuracy, slowest
        language: Language code (es for Spanish, en for English, etc.)
    """
    import whisper

    # Setup paths
    script_dir = Path(__file__).parent
    input_path = script_dir / input_dir
    output_path = script_dir / output_dir

    # Create output directory
    output_path.mkdir(exist_ok=True)

    # Find audio files
    audio_extensions = {'.mp3', '.wav', '.m4a', '.ogg', '.flac', '.webm'}
    audio_files = sorted([
        f for f in input_path.iterdir()
        if f.suffix.lower() in audio_extensions
    ])

    if not audio_files:
        print(f"No audio files found in {input_path}")
        return

    print(f"Found {len(audio_files)} audio files to transcribe")
    print(f"Loading Whisper model '{model_name}'...")

    # Load model
    model = whisper.load_model(model_name)
    print(f"Model loaded. Starting transcription...\n")

    # Process each file
    for i, audio_file in enumerate(audio_files, 1):
        transcript_file = output_path / f"{audio_file.stem}.txt"

        # Skip if already transcribed
        if transcript_file.exists():
            print(f"[{i}/{len(audio_files)}] Skipping (already exists): {audio_file.name}")
            continue

        print(f"[{i}/{len(audio_files)}] Transcribing: {audio_file.name}")

        try:
            # Transcribe
            result = model.transcribe(
                str(audio_file),
                language=language,
                verbose=False
            )

            # Save transcript
            with open(transcript_file, 'w', encoding='utf-8') as f:
                f.write(result['text'])

            print(f"    ✓ Saved to: {transcript_file.name}")

        except Exception as e:
            print(f"    ✗ Error: {e}")
            continue

    print(f"\nTranscription complete! Transcripts saved to: {output_path}")


def transcribe_single_file(audio_path: str, model_name: str = "base"):
    """Transcribe a single audio file and print the result."""
    import whisper

    print(f"Loading model '{model_name}'...")
    model = whisper.load_model(model_name)

    print(f"Transcribing: {audio_path}")
    result = model.transcribe(audio_path, verbose=False)

    print("\n" + "=" * 60)
    print("TRANSCRIPT:")
    print("=" * 60)
    print(result['text'])
    print("=" * 60)

    return result['text']


if __name__ == "__main__":
    if not check_dependencies():
        sys.exit(1)

    import argparse

    parser = argparse.ArgumentParser(description="Transcribe audio files using Whisper")
    parser.add_argument("--single", "-s", type=str, help="Transcribe a single file")
    parser.add_argument("--model", "-m", type=str, default="base",
                       choices=["tiny", "base", "small", "medium", "large"],
                       help="Whisper model size (default: base)")
    parser.add_argument("--language", "-l", type=str, default=None,
                       help="Language code (default: auto-detect)")
    parser.add_argument("--input", "-i", type=str, default="spanish",
                       help="Input directory (default: spanish)")
    parser.add_argument("--output", "-o", type=str, default="transcripts",
                       help="Output directory (default: transcripts)")

    args = parser.parse_args()

    if args.single:
        transcribe_single_file(args.single, args.model)
    else:
        transcribe_audio_files(
            input_dir=args.input,
            output_dir=args.output,
            model_name=args.model,
            language=args.language
        )
