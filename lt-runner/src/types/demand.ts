export type NextLessonInterest = 'yes' | 'maybe' | 'no';
export type KeepGoingReason = 'teaching_style' | 'actually_learning' | 'fun' | 'want_spanish';
export type DiscoveryChannel = 'discord' | 'reddit' | 'friend' | 'search' | 'other';

export interface DemandSubmission {
  sessionId: string;
  lessonId: string;
  completedLesson: boolean;
  completionPercent: number;
  wantsNextLesson: NextLessonInterest;
  email?: string;
  rating: number;
  feedbackText?: string;
  keepGoingReason?: KeepGoingReason;
  discoveryChannel?: DiscoveryChannel;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export interface DemandSubmissionRequest extends DemandSubmission {
  honeypot?: string;
}
