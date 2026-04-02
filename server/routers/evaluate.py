"""Evaluation API router."""
from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from server.services.gemini_evaluator import evaluate_answer

router = APIRouter(prefix="/api/evaluate", tags=["evaluate"])

class EvaluateRequest(BaseModel):
    prompt: str
    expected_answers: List[str]
    user_response: str
    lesson_title: str = ""

@router.post("")
async def evaluate_user_answer(request: EvaluateRequest):
    """
    Evaluate a user's answer using Gemini.

    Returns evaluation with feedback.
    """
    try:
        result = evaluate_answer(
            prompt=request.prompt,
            expected_answers=request.expected_answers,
            user_response=request.user_response,
            lesson_title=request.lesson_title
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")
