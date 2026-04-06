export type NextLessonInterest = 'yes' | 'maybe' | 'no';

export interface DemandSubmission {
  sessionId: string;
  lessonId: string;
  completedLesson: boolean;
  completionPercent: number;
  wantsNextLesson: NextLessonInterest;
  email?: string;
  rating: number;
  feedbackText?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface DemandSubmissionRequest extends DemandSubmission {
  honeypot?: string;
}
