export interface Question {
  text: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface UserProfile {
  uid: string;
  username: string;
  points: number;
  highestScore: number;
  favoriteCategory: string;
  arkerTitle: string;
  rank: string;
  level: number;
  createdAt: string;
  lastDailyChallengeDate?: string;
  dailyChallengeStreak?: number;
  badges?: string[];
  role?: 'user' | 'admin';
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
