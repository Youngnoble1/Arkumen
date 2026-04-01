export interface Question {
  text: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface UserProfile {
  uid: string;
  username: string;
  points: number;
  highestScore: number;
  favoriteCategory: string;
  warriorTitle: string;
  createdAt: string;
  lastDailyChallengeDate?: string;
  dailyChallengeStreak?: number;
  badges?: string[];
}

export interface DailyChallenge {
  date: string;
  questions: Question[];
  theme: string;
}

export interface GameResult {
  score: number;
  streak: number;
  category: string;
  grade: string;
  message: string;
  strengths?: string[];
  weaknesses?: string[];
  nextSteps?: string;
}
