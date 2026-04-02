/**
 * API client for the Voice AI Tutor backend
 */

const API_BASE = '/api';

/**
 * Fetch all available lessons
 */
export async function getLessons() {
  const response = await fetch(`${API_BASE}/lessons`);
  if (!response.ok) throw new Error('Failed to fetch lessons');
  return response.json();
}

/**
 * Fetch a specific lesson with all exercises
 */
export async function getLesson(lessonNumber) {
  const response = await fetch(`${API_BASE}/lessons/${lessonNumber}`);
  if (!response.ok) throw new Error(`Failed to fetch lesson ${lessonNumber}`);
  return response.json();
}

/**
 * Fetch user progress
 */
export async function getProgress(userId = 'default') {
  const response = await fetch(`${API_BASE}/lessons/progress/${userId}`);
  if (!response.ok) throw new Error('Failed to fetch progress');
  return response.json();
}

/**
 * Update progress after exercise
 */
export async function updateProgress(userId, lessonNumber, exerciseIndex, isCorrect, attempts) {
  const params = new URLSearchParams({
    lesson_number: lessonNumber,
    exercise_index: exerciseIndex,
    is_correct: isCorrect,
    attempts: attempts
  });
  const response = await fetch(`${API_BASE}/lessons/progress/${userId}/exercise?${params}`, {
    method: 'POST'
  });
  if (!response.ok) throw new Error('Failed to update progress');
  return response.json();
}

/**
 * Transcribe audio to Spanish text
 */
export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');

  const response = await fetch(`${API_BASE}/audio/transcribe`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error('Failed to transcribe audio');
  return response.json();
}

/**
 * Get speech audio for text
 */
export async function speakText(text, language = 'en') {
  const response = await fetch(`${API_BASE}/audio/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language })
  });

  if (!response.ok) throw new Error('Failed to generate speech');
  return response.blob();
}

/**
 * Evaluate user's answer
 */
export async function evaluateAnswer(prompt, expectedAnswers, userResponse, lessonTitle = '') {
  const response = await fetch(`${API_BASE}/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      expected_answers: expectedAnswers,
      user_response: userResponse,
      lesson_title: lessonTitle
    })
  });

  if (!response.ok) throw new Error('Failed to evaluate answer');
  return response.json();
}

// ============================================
// Conversation API (v2 - scripted conversation)
// ============================================

/**
 * Get available v2 lessons
 */
export async function getConversationLessons() {
  const response = await fetch(`${API_BASE}/conversation/lessons`);
  if (!response.ok) throw new Error('Failed to fetch conversation lessons');
  return response.json();
}

/**
 * Start a new conversation session
 */
export async function startConversation(lessonNumber) {
  const response = await fetch(`${API_BASE}/conversation/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lesson_number: lessonNumber })
  });

  if (!response.ok) throw new Error('Failed to start conversation');
  return response.json();
}

/**
 * Get current turn for a session
 */
export async function getCurrentTurn(sessionId) {
  const response = await fetch(`${API_BASE}/conversation/${sessionId}/turn`);
  if (!response.ok) throw new Error('Failed to get current turn');
  return response.json();
}

/**
 * Get audio for current tutor turn
 */
export async function getTurnAudio(sessionId) {
  const response = await fetch(`${API_BASE}/conversation/${sessionId}/turn/audio`);
  if (!response.ok) throw new Error('Failed to get turn audio');
  return response.blob();
}

/**
 * Get nudge audio for silence
 */
export async function getNudgeAudio(sessionId) {
  const response = await fetch(`${API_BASE}/conversation/${sessionId}/nudge`);
  if (!response.ok) throw new Error('Failed to get nudge audio');
  return response.blob();
}

/**
 * Submit user response audio
 */
export async function submitResponse(sessionId, audioBlob, fileName = 'recording.webm') {
  const formData = new FormData();
  formData.append('file', audioBlob, fileName);

  const response = await fetch(`${API_BASE}/conversation/${sessionId}/respond`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) throw new Error('Failed to submit response');
  return response.json();
}

/**
 * Advance to next turn
 */
export async function advanceTurn(sessionId) {
  const response = await fetch(`${API_BASE}/conversation/${sessionId}/advance`, {
    method: 'POST'
  });

  if (!response.ok) throw new Error('Failed to advance turn');
  return response.json();
}

/**
 * Get session status
 */
export async function getSessionStatus(sessionId) {
  const response = await fetch(`${API_BASE}/conversation/${sessionId}/status`);
  if (!response.ok) throw new Error('Failed to get session status');
  return response.json();
}
