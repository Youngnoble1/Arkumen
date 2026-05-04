import { UserProfile } from '../types';

export const RANK_LEVELS = [
  { level: 1, title: 'Initiate', minXP: 0, maxXP: 500 },
  { level: 2, title: 'Scholar', minXP: 501, maxXP: 2000 },
  { level: 3, title: 'Adept', minXP: 2001, maxXP: 5000 },
  { level: 4, title: 'Savant', minXP: 5001, maxXP: 10000, minWinRate: 65 },
  { level: 5, title: 'Luminary', minXP: 10001, maxXP: 25000, minWinRate: 75 },
  { level: 6, title: 'Arkumen', minXP: 25001 },
];

export function calculateRank(profile: UserProfile): { level: number; title: string } {
  const xp = profile.xp || 0;
  const winRate = profile.stats.totalGames > 0 
    ? (profile.stats.totalWins / profile.stats.totalGames) * 100 
    : 0;

  // Iterate backwards to find the highest rank achieved
  for (let i = RANK_LEVELS.length - 1; i >= 0; i--) {
    const rank = RANK_LEVELS[i];
    
    // Check XP requirement
    if (xp >= rank.minXP) {
      // Check Win Rate if applicable
      if (rank.minWinRate !== undefined) {
        if (winRate >= rank.minWinRate) {
          return { level: rank.level, title: rank.title };
        }
        // If win rate fails, continue to check lower ranks
        continue;
      }
      
      return { level: rank.level, title: rank.title };
    }
  }

  return { level: 1, title: 'Initiate' };
}

export function getXPProgress(xp: number, level: number) {
  const currentRank = RANK_LEVELS.find(r => r.level === level) || RANK_LEVELS[0];
  const nextRank = RANK_LEVELS.find(r => r.level === level + 1);

  if (!nextRank) return 100; // Max level

  const range = nextRank.minXP - currentRank.minXP;
  const progress = ((xp - currentRank.minXP) / range) * 100;
  return Math.min(Math.max(progress, 0), 100);
}
