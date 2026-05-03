export interface SpokenResponseEvaluation {
  isCorrect: boolean;
  confidence: number;
}

function normalizeForComparison(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()[\]{}"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeForComparison(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeForComparison(right).split(' ').filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

export function evaluateSpokenResponse(
  response: string,
  acceptedAnswers: string[] = []
): SpokenResponseEvaluation {
  const normalizedResponse = normalizeForComparison(response);

  if (!normalizedResponse || acceptedAnswers.length === 0) {
    return { isCorrect: Boolean(normalizedResponse), confidence: normalizedResponse ? 0.5 : 0 };
  }

  const scores = acceptedAnswers.map((answer) => {
    const normalizedAnswer = normalizeForComparison(answer);
    if (!normalizedAnswer) return 0;
    if (normalizedResponse === normalizedAnswer) return 1;
    if (normalizedResponse.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedResponse)) {
      return 0.9;
    }
    return tokenSimilarity(normalizedResponse, normalizedAnswer);
  });

  const confidence = Math.max(...scores);

  return {
    isCorrect: confidence >= 0.8,
    confidence
  };
}
