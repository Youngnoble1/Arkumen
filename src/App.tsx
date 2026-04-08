/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  User as UserIcon, 
  Zap, 
  LogOut, 
  ChevronRight, 
  Loader2, 
  Shield, 
  Sparkles,
  Timer,
  CheckCircle2,
  XCircle,
  History,
  Home,
  BarChart2,
  Settings,
  Crown,
  Clock,
  Heart,
  Users,
  BookOpen,
  GraduationCap,
  Plus,
  FileText,
  Youtube,
  Video,
  X,
  Send,
  HelpCircle,
  Info,
  ArrowRight,
  Play
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { generateQuestions, generateArkerTitle, analyzePerformance, generateDailyChallenge } from './services/geminiService';
import { Question, UserProfile, GameResult, DailyChallenge } from './types';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { io, Socket } from 'socket.io-client';

type GameState = 'LANDING' | 'LOBBY' | 'LOADING' | 'GAME' | 'RESULT' | 'MULTIPLAYER_LOBBY';
type Tab = 'HOME' | 'RANKS' | 'PROFILE' | 'SETTINGS';
type GameMode = 'CLASSIC' | 'BLITZ' | 'SURVIVAL' | 'MULTIPLAYER' | 'ACADEMIC' | 'TUTORIAL';

const TUTORIAL_STEPS = [
  {
    mode: 'TUTORIAL',
    trigger: 'START',
    title: "Welcome, Arker!",
    content: "You have entered the ARKUMEN Arena. Your goal is to master the revelations of JESUS HIS PREEMINENCE."
  },
  {
    mode: 'TUTORIAL',
    trigger: 'QUESTION',
    title: "The Challenge",
    content: "Read the question carefully. Each correct answer earns you Royalty Points and increases your Rank."
  },
  {
    mode: 'TUTORIAL',
    trigger: 'STREAK',
    title: "Spiritual Momentum",
    content: "Answering correctly in a row builds a Streak. High streaks unlock special badges and titles!"
  },
  {
    mode: 'TUTORIAL',
    trigger: 'EXPLANATION',
    title: "The Revelation",
    content: "If you miss a question, don't worry. The Revelation will explain the truth. In Tutorial mode, you cannot fail."
  }
];

const TUTORIAL_CONTENT = {
  'CLASSIC': {
    title: "Classic Quiz",
    subtitle: "The Foundation of Faith",
    description: "A deep dive into the Arkers Elite revelations. Take your time to absorb the knowledge.",
    mechanics: [
      "18 questions per arena",
      "No time limit per question",
      "Focus on accuracy and understanding",
      "Earn Royalty Points for every correct answer",
      "Unlock higher ranks as you master the source"
    ],
    reward: "Standard Royalty Points + Rank Progress"
  },
  'BLITZ': {
    title: "Timed Blitz",
    subtitle: "The Speed of Spirit",
    description: "Test your intuition and rapid recall under pressure. Speed is of the essence.",
    mechanics: [
      "10 questions per arena",
      "10 seconds per question",
      "Rapid-fire revelations",
      "Bonus points for quick answers",
      "Test your spiritual reflexes"
    ],
    reward: "Bonus Royalty Points for Speed"
  },
  'SURVIVAL': {
    title: "Arker's Path",
    subtitle: "The Narrow Gate",
    description: "One wrong answer ends your journey. How many revelations can you survive?",
    mechanics: [
      "Endless questions",
      "Single life - one mistake and it's over",
      "Increasing difficulty as you progress",
      "Leaderboard focus",
      "Prove your unyielding focus"
    ],
    reward: "Survival Multiplier + Global Leaderboard"
  },
  'MULTIPLAYER': {
    title: "Multiplayer Arena",
    subtitle: "The Clash of Crowns",
    description: "Compete with other Arkers in real-time. Prove who is the most enlightened.",
    mechanics: [
      "Real-time competition",
      "Synchronized questions",
      "Highest score wins the arena",
      "Wager Royalty Points (coming soon)",
      "Global ranking impact"
    ],
    reward: "Arena Glory + Opponent's Respect"
  },
  'TUTORIAL': {
    title: "Arker's Initiation",
    subtitle: "The First Step",
    description: "Learn the mechanics of the arena. No pressure, just enlightenment.",
    mechanics: [
      "Guided walkthrough",
      "Simplified questions",
      "Interactive feature explanations",
      "No game-over on mistakes",
      "Perfect for new Arkers"
    ],
    reward: "Initiation Badge + 5,000 Royalty Points"
  }
};

const BADGE_DEFINITIONS = [
  { id: 'novice', name: 'Novice Arker', icon: '🛡️', desc: 'Complete your first ascension' },
  { id: 'veteran', name: 'Veteran Arker', icon: '⚔️', desc: 'Complete 10 ascensions' },
  { id: 'legend', name: 'Legendary Arker', icon: '🔥', desc: 'Complete 50 ascensions' },
  { id: 'high_scorer', name: 'High Scorer', icon: '💎', desc: 'Score over 15,000 in a single game' },
  { id: 'streak_master', name: 'Streak Master', icon: '⚡', desc: 'Achieve a 18-question streak' },
  { id: 'daily_devotee', name: 'Daily Devotee', icon: '📅', desc: 'Complete 3 daily challenges' },
  { id: 'category_master', name: 'Category Master', icon: '🎓', desc: 'Reach 100,000 total points' },
  { id: 'elite_scholar', name: 'Elite Scholar', icon: '📜', desc: 'Achieve Grade S in any mode' },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [gameState, setGameState] = useState<GameState>('LANDING');
  const [activeTab, setActiveTab] = useState<Tab>('HOME');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState<keyof typeof TUTORIAL_CONTENT | null>(null);
  const [sourceType, setSourceType] = useState<'NOTES' | 'YOUTUBE' | 'VIDEO'>('NOTES');
  const [sourceInput, setSourceInput] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showTutorialOverlay, setShowTutorialOverlay] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Sounds
  const correctSound = useRef<HTMLAudioElement | null>(null);
  const wrongSound = useRef<HTMLAudioElement | null>(null);
  const victorySound = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    correctSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3');
    wrongSound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3');
    victorySound.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
  }, []);

  // Multiplayer
  const [socket, setSocket] = useState<Socket | null>(null);
  const [multiplayers, setMultiplayers] = useState<any[]>([]);
  const [roomId, setRoomId] = useState("");

  useEffect(() => {
    // Only attempt socket connection if we're not on a static hosting environment that doesn't support it
    // or if we explicitly want to try. 
    try {
      const s = io({
        reconnectionAttempts: 3,
        timeout: 5000,
        transports: ['websocket', 'polling']
      });
      setSocket(s);
      s.on("connect_error", (err) => {
        console.warn("Multiplayer server connection failed. Multiplayer will be disabled.", err.message);
      });
      s.on("room-update", (players) => setMultiplayers(players));
      s.on("game-started", (qs) => {
        setQuestions(qs);
        setCurrentQuestionIndex(0);
        setScore(0);
        setStreak(0);
        setMaxStreak(0);
        setTimeLeft(30);
        setGameMode('MULTIPLAYER');
        setGameState('GAME');
      });
      return () => { s.disconnect(); };
    } catch (e) {
      console.warn("Socket.io initialization failed:", e);
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      try {
        setAuthError(null);
        setUser(u);
        if (u) {
          setLoading(true); // Re-show loading while fetching profile
          await fetchProfile(u.uid);
          fetchHistory(u.uid);
          fetchLeaderboard();
          setGameState('LOBBY');
        } else {
          setGameState('LANDING');
        }
      } catch (error) {
        console.error("Auth Listener Error:", error);
        setAuthError("Failed to synchronize with the heavens. Please try again.");
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Timer logic
  useEffect(() => {
    if (gameState === 'GAME' && !showExplanation && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'GAME' && !showExplanation) {
      if (gameMode === 'SURVIVAL') {
        endGame();
      } else {
        handleAnswer(-1); // Timeout
      }
    }
  }, [gameState, timeLeft, showExplanation, gameMode]);

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        const isArchitect = auth.currentUser?.email === "nonsookoli757@gmail.com";
        if (isArchitect && (data.rank !== 'Architect' || data.arkerTitle !== 'The Architect')) {
          data.rank = 'Architect';
          data.arkerTitle = 'The Architect';
          await updateDoc(docRef, { rank: 'Architect', arkerTitle: 'The Architect' });
        }
        setProfile(data);
      } else {
        const isArchitect = auth.currentUser?.email === "nonsookoli757@gmail.com";
        const newProfile: UserProfile = {
          uid,
          username: auth.currentUser?.displayName || 'Arker',
          points: 0,
          highestScore: 0,
          favoriteCategory: 'General',
          arkerTitle: isArchitect ? 'The Architect' : 'The Seeker',
          rank: isArchitect ? 'Architect' : 'Initiate',
          level: 1,
          createdAt: new Date().toISOString()
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
  };

  const fetchHistory = (uid: string) => {
    const q = query(
      collection(db, 'games'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    return onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => doc.data()));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'games');
    });
  };

  const fetchLeaderboard = () => {
    const q = query(
      collection(db, 'users'),
      orderBy('points', 'desc'),
      limit(20)
    );
    return onSnapshot(q, (snapshot) => {
      setLeaderboard(snapshot.docs.map(doc => doc.data() as UserProfile));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setGameState('LANDING');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const startNewGame = async (mode: GameMode, category: string = "General Knowledge") => {
    setGameMode(mode);
    setSelectedCategory(category);
    setGameState('LOADING');
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setTimeLeft(mode === 'BLITZ' ? 120 : 30);
    setTutorialStep(0);

    try {
      let q: Question[] = [];
      if (mode === 'MULTIPLAYER') {
        setGameState('MULTIPLAYER_LOBBY');
        return;
      }

      if (mode === 'TUTORIAL') {
        q = await generateQuestions("Initiation", 5, 'Easy');
        setShowTutorialOverlay(true);
      } else {
        q = await generateQuestions(category, mode === 'CLASSIC' ? 18 : 15, selectedDifficulty);
      }
      
      if (q.length === 0) throw new Error("No questions found");
      setQuestions(q);
      setGameState('GAME');
    } catch (error) {
      console.error("Game Start Error:", error);
      setGameState('LOBBY');
    }
  };

  const handleSourceGeneration = async () => {
    setGameState('LOADING');
    setShowSourceModal(false);
    try {
      let sourceContent: any = sourceInput;
      if (sourceType === 'VIDEO' && videoFile) {
        const reader = new FileReader();
        sourceContent = await new Promise((resolve) => {
          reader.onload = (e) => resolve({ data: e.target?.result?.toString().split(',')[1], mimeType: videoFile.type });
          reader.readAsDataURL(videoFile);
        });
      }

      const q = await generateQuestions("Custom Source", 15, 'Medium');
      setQuestions(q);
      setCurrentQuestionIndex(0);
      setScore(0);
      setStreak(0);
      setMaxStreak(0);
      setTimeLeft(30);
      setGameState('GAME');
    } catch (error) {
      console.error("Source Generation Error:", error);
      setGameState('LOBBY');
    }
  };

  const startMultiplayerGame = async () => {
    if (!socket || !roomId) return;
    setGameState('LOADING');
    setGameMode('MULTIPLAYER');
    try {
      const q = await generateQuestions("Multiplayer Battle", 15, 'Medium');
      socket.emit("start-game", { roomId, questions: q });
    } catch (error) {
      console.error("Multiplayer Start Error:", error);
      setGameState('MULTIPLAYER_LOBBY');
    }
  };

  const handleAnswer = (index: number) => {
    setSelectedAnswer(index);
    const correct = index === questions[currentQuestionIndex].correctAnswer;
    const pointsPerQuestion = (gameMode === 'ACADEMIC') ? 500 : 1000;
    
    if (correct) {
      correctSound.current?.play().catch(() => {});
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMaxStreak(Math.max(maxStreak, newStreak));
      
      setScore(prev => prev + pointsPerQuestion);

      if (gameMode === 'TUTORIAL' && newStreak === 1) {
        setTutorialStep(2);
        setShowTutorialOverlay(true);
      }
      
      // Auto-advance on correct answer after a short delay
      setTimeout(() => {
        nextQuestion();
      }, 800);
    } else {
      wrongSound.current?.play().catch(() => {});
      setStreak(0);
      setShowExplanation(true); // Only show explanation on wrong answer

      if (gameMode === 'TUTORIAL') {
        setTutorialStep(3);
        setShowTutorialOverlay(true);
      }

      if (gameMode === 'SURVIVAL') {
        setTimeout(() => endGame(), 1200);
        return;
      }
    }

    if (socket && gameState === 'GAME' && roomId) {
      socket.emit("submit-score", { roomId, score: score + (correct ? pointsPerQuestion : 0) });
    }
  };

  const nextQuestion = () => {
    setShowExplanation(false);
    setSelectedAnswer(null);
    if (gameMode !== 'BLITZ') setTimeLeft(30);
    
    if (currentQuestionIndex + 1 < questions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      endGame();
    }
  };

  const endGame = async () => {
    // Set result state immediately with basic info to avoid delay
    setGameResult({
      score,
      streak: maxStreak,
      category: selectedCategory,
      grade: '...',
      message: 'Analyzing your ascension...'
    });
    setGameState('RESULT');

    // Then fetch the detailed analysis
    try {
      const result = await analyzePerformance(score, maxStreak, selectedCategory, score > 0 ? 'Victory' : 'Defeat', questions.length, gameMode);
      
      const percentage = (score / (questions.length * 1000)) * 100;
      if (percentage >= 90) {
        victorySound.current?.play().catch(() => {});
      }

      setGameResult(prev => prev ? { ...prev, ...result } : null);

      if (profile) {
        let newPoints = profile.points + score;
        if (auth.currentUser?.email === "nonsookoli757@gmail.com") {
          // Remove the last 3 zeros from points (divide by 1000)
          newPoints = profile.points + Math.floor(score / 1000);
        }
        const newHighest = Math.max(profile.highestScore, score);
        let newTitle = profile.arkerTitle;
        let lastDailyDate = profile.lastDailyChallengeDate;
        let dailyStreak = profile.dailyChallengeStreak || 0;
        let badges = profile.badges || [];
        let newLevel = profile.level || 1;
        let newRank = profile.rank || 'Initiate';

        // Calculate Level and Rank based on points
        // If architect, points are scaled, so level calculation should reflect that
        const scaledPoints = (auth.currentUser?.email === "nonsookoli757@gmail.com") ? newPoints * 1000 : newPoints;
        newLevel = Math.floor(Math.sqrt(scaledPoints / 100)) + 1;
        
        const ranks = [
          'Neophyte', 'Initiate', 'Seeker', 'Proselyte', 'Disciple', 
          'Apostle', 'Evangelist', 'Prophet', 'High Priest', 'Elder', 
          'Legend', 'Eternal'
        ];
        const rankIndex = Math.min(Math.floor(newLevel / 4), ranks.length - 1);
        newRank = ranks[rankIndex];

        // Special handling for the Architect
        if (auth.currentUser?.email === "nonsookoli757@gmail.com") {
          newTitle = "The Architect";
          newRank = "Architect";
        } else if (score > profile.highestScore && score > 5000) {
          newTitle = await generateArkerTitle(profile.username, newPoints, newHighest, selectedCategory, auth.currentUser?.email || undefined);
        }

        // Check for new badges
        const newBadges = [...badges];
        
        // Game count badges (we'll estimate from history + 1)
        const totalGames = history.length + 1;
        if (totalGames >= 1 && !newBadges.includes('novice')) newBadges.push('novice');
        if (totalGames >= 10 && !newBadges.includes('veteran')) newBadges.push('veteran');
        if (totalGames >= 50 && !newBadges.includes('legend')) newBadges.push('legend');
        
        if (score >= 15000 && !newBadges.includes('high_scorer')) newBadges.push('high_scorer');
        if (maxStreak >= 18 && !newBadges.includes('streak_master')) newBadges.push('streak_master');
        if (newPoints >= 100000 && !newBadges.includes('category_master')) newBadges.push('category_master');
        if (result.grade === 'S' && !newBadges.includes('elite_scholar')) newBadges.push('elite_scholar');

        if (gameMode === 'TUTORIAL' && !newBadges.includes('novice')) {
          newBadges.push('novice');
          newPoints += 5000;
        }

        const updatedProfile = {
          ...profile,
          points: newPoints,
          highestScore: newHighest,
          arkerTitle: newTitle,
          rank: newRank,
          level: newLevel,
          lastDailyChallengeDate: lastDailyDate,
          dailyChallengeStreak: dailyStreak,
          badges: newBadges
        };

        try {
          await updateDoc(doc(db, 'users', profile.uid), updatedProfile);
          setProfile(updatedProfile);
        } catch (error) {
          console.error("User Profile Update Error:", error);
          handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}`);
        }

        try {
          await addDoc(collection(db, 'games'), {
            uid: profile.uid,
            score,
            streak: maxStreak,
            category: selectedCategory,
            grade: result.grade,
            message: result.message,
            mode: gameMode,
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          console.error("Game Record Error:", error);
          handleFirestoreError(error, OperationType.WRITE, 'games');
        }
      }
    } catch (error) {
      console.error("End Game Error:", error);
    }
  };

  const joinMultiplayer = () => {
    if (socket && roomId && profile) {
      socket.emit("join-room", { roomId, username: profile.username });
    }
  };

  if (loading || gameState === 'LOADING') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-arkumen-bg">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-arkumen-gold/20 blur-2xl rounded-full animate-pulse" />
          <Loader2 className="w-16 h-16 text-arkumen-gold animate-spin relative z-10" />
        </div>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ repeat: Infinity, duration: 2, repeatType: "reverse" }}
          className="font-display text-arkumen-gold tracking-[0.3em] text-sm uppercase"
        >
          {gameState === 'LOADING' ? 'Preparing the Arena...' : 'Summoning Revelations...'}
        </motion.p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-arkumen-bg text-slate-200 pb-24">
      <AnimatePresence mode="wait">
        {gameState === 'LANDING' && (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col items-center justify-center p-6 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-arkumen-blue/20 via-transparent to-transparent opacity-50" />
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="z-10 flex flex-col items-center"
            >
              <div className="relative mb-8 group">
                <div className="absolute inset-0 bg-arkumen-gold/20 blur-3xl rounded-full group-hover:bg-arkumen-gold/40 transition-all duration-1000" />
                <div className="relative w-48 h-48 border-2 border-arkumen-gold/30 rounded-full flex items-center justify-center p-4">
                  <div className="w-full h-full border border-arkumen-gold/50 rounded-full flex items-center justify-center">
                    <Crown size={80} className="text-arkumen-gold animate-pulse" />
                  </div>
                </div>
              </div>
              <h1 className="font-display text-5xl md:text-8xl mb-2 gold-gradient tracking-[0.1em] sm:tracking-[0.3em] px-4">ARKUMEN</h1>
              <p className="text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.5em] text-[8px] sm:text-xs mb-12 px-4 max-w-full">The Arkers Elite Quiz Game</p>
              
              {authError && (
                <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm max-w-md flex flex-col items-center gap-3">
                  <p className="text-center">{authError}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Retry Connection
                  </button>
                </div>
              )}

              <button 
                onClick={handleLogin}
                className="group relative px-8 sm:px-16 py-4 sm:py-5 bg-transparent border border-arkumen-gold/50 overflow-hidden transition-all hover:pulse-gold rounded-sm"
              >
                <div className="absolute inset-0 bg-arkumen-gold translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                <span className="relative z-10 font-display text-lg sm:text-xl tracking-[0.1em] sm:tracking-[0.3em] group-hover:text-black transition-colors">ENTER ARENA</span>
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'LOBBY' && profile && (
          <motion.div 
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl mx-auto p-6"
          >
            {activeTab === 'HOME' && (
              <div className="space-y-8">
                <header className="flex justify-between items-center py-4">
                  <div>
                    <h1 className="font-display text-3xl gold-gradient tracking-widest">ARKUMEN</h1>
                    <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em]">The Arkers Elite Quiz Game</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-arkumen-gold to-[#996515] p-0.5 shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                      <UserIcon className="text-arkumen-gold" />
                    </div>
                  </div>
                </header>

                <section>
                  <h2 className="text-arkumen-gold/60 font-display uppercase tracking-widest text-[10px] mb-4">Select Difficulty</h2>
                  <div className="flex gap-2 mb-8">
                    {(['Easy', 'Medium', 'Hard'] as const).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setSelectedDifficulty(diff)}
                        className={cn(
                          "flex-1 py-3 rounded-xl border font-bold transition-all",
                          selectedDifficulty === diff 
                            ? "bg-arkumen-gold text-black border-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]" 
                            : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-arkumen-gold/50"
                        )}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>

                  <h2 className="text-arkumen-gold/60 font-display uppercase tracking-widest text-[10px] mb-6">Active Arenas</h2>
                  <div className="space-y-4">
                    <ChallengeCard 
                      icon={<Zap className="text-arkumen-gold" />}
                      title="Arker's Initiation"
                      desc="New here? Learn the ways of the Elite."
                      badge="TUTORIAL"
                      onClick={() => startNewGame('TUTORIAL')}
                      onInfoClick={() => setShowTutorial('TUTORIAL')}
                    />
                    <ChallengeCard 
                      icon={<Crown className="text-arkumen-gold" />}
                      title="Classic Quiz"
                      desc="18 levels of Arkers Elite revelations."
                      onClick={() => startNewGame('CLASSIC')}
                      onInfoClick={() => setShowTutorial('CLASSIC')}
                    />
                    <ChallengeCard 
                      icon={<Clock className="text-arkumen-gold" />}
                      title="Timed Blitz"
                      desc="2 minutes. Prove your mastery."
                      onClick={() => startNewGame('BLITZ')}
                      onInfoClick={() => setShowTutorial('BLITZ')}
                    />
                    <ChallengeCard 
                      icon={<Heart className="text-arkumen-gold" />}
                      title="Arker's Path"
                      desc="One life. Defy the fall."
                      onClick={() => startNewGame('SURVIVAL')}
                      onInfoClick={() => setShowTutorial('SURVIVAL')}
                    />
                    <ChallengeCard 
                      icon={<Users className="text-arkumen-gold" />}
                      title="Multiplayer Arena"
                      desc="Compete with other Arkers."
                      badge="LIVE"
                      onClick={() => setGameState('MULTIPLAYER_LOBBY')}
                      onInfoClick={() => setShowTutorial('MULTIPLAYER')}
                    />
                  </div>
                </section>

                <button 
                  onClick={() => setShowSourceModal(true)}
                  className="w-full py-4 bg-slate-800 border border-dashed border-slate-700 rounded-2xl flex items-center justify-center gap-3 hover:border-arkumen-gold transition-colors"
                >
                  <Plus className="text-arkumen-gold" />
                  <span className="font-bold">Generate from Source</span>
                </button>
              </div>
            )}

            {activeTab === 'RANKS' && (
              <div className="space-y-8 py-8">
                <div className="text-center">
                  <Crown className="w-16 h-16 text-arkumen-gold mx-auto mb-4" />
                  <h2 className="text-3xl font-display gold-gradient">Hall of Legends</h2>
                  <p className="text-slate-500 text-xs uppercase tracking-widest">The Top 20 Arkers</p>
                </div>

                <div className="space-y-3">
                  {leaderboard.map((player, i) => (
                    <div key={player.uid} className={cn(
                      "premium-card p-4 flex items-center gap-4",
                      player.uid === user?.uid && "border-arkumen-gold bg-arkumen-gold/5"
                    )}>
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center font-display text-lg",
                        i === 0 ? "bg-arkumen-gold text-black" : 
                        i === 1 ? "bg-slate-300 text-black" :
                        i === 2 ? "bg-amber-700 text-white" : "bg-slate-800 text-slate-400"
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{player.username}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-500 uppercase tracking-tighter">{player.arkerTitle}</p>
                          <span className="text-[8px] px-1.5 py-0.5 bg-arkumen-gold/10 text-arkumen-gold rounded-full border border-arkumen-gold/20">
                            {player.rank || 'Initiate'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-arkumen-gold">{player.points.toLocaleString()}</p>
                        <p className="text-[8px] uppercase text-slate-600 font-bold">Points</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'PROFILE' && (
              <div className="space-y-8 py-8">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-arkumen-gold mx-auto mb-4 p-1">
                    <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                      <UserIcon className="w-12 h-12 text-arkumen-gold" />
                    </div>
                  </div>
                  <h2 className="text-3xl font-display gold-gradient">{profile.username}</h2>
                  <div className="flex flex-col items-center gap-1">
                    <p className={cn(
                      "uppercase tracking-[0.3em] text-xs",
                      profile.arkerTitle === "The Architect" 
                        ? "font-display text-arkumen-gold text-xl font-bold not-italic tracking-[0.2em] uppercase" 
                        : "text-arkumen-gold/60 italic"
                    )}>
                      {profile.arkerTitle}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-3 py-1 bg-arkumen-gold/10 border border-arkumen-gold/30 rounded-full text-[10px] font-bold text-arkumen-gold uppercase tracking-widest">
                        Rank: {profile.rank || 'Initiate'}
                      </span>
                      <span className="px-3 py-1 bg-arkumen-blue/10 border border-arkumen-blue/30 rounded-full text-[10px] font-bold text-arkumen-blue uppercase tracking-widest">
                        Level: {profile.level || 1}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Royalty Points" value={profile.points.toLocaleString()} />
                  <StatCard label="Highest Score" value={profile.highestScore.toLocaleString()} />
                  <StatCard label="Daily Streak" value={`${profile.dailyChallengeStreak || 0} Days`} />
                  <StatCard label="Badges & Achievements" value={`${profile.badges?.length || 0}`} />
                </div>

                <div className="premium-card p-6">
                  <h3 className="font-display text-xl mb-6 flex items-center gap-3">
                    <Sparkles className="text-arkumen-gold" /> Badges & Achievements
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    {BADGE_DEFINITIONS.map((badge) => {
                      const isEarned = profile.badges?.includes(badge.id);
                      return (
                        <div 
                          key={badge.id} 
                          className={cn(
                            "flex flex-col items-center gap-2 p-2 rounded-xl transition-all group relative",
                            isEarned ? "bg-arkumen-gold/10 border border-arkumen-gold/30" : "bg-slate-800/50 opacity-30 grayscale"
                          )}
                        >
                          <span className="text-2xl">{badge.icon}</span>
                          <span className="text-[8px] uppercase font-bold text-center leading-tight">{badge.name}</span>
                          
                          {/* Tooltip */}
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-32 p-2 bg-slate-900 border border-slate-700 rounded-lg text-[10px] text-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                            <p className="font-bold text-arkumen-gold mb-1">{badge.name}</p>
                            <p className="text-slate-400">{badge.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="premium-card p-6">
                  <h3 className="font-display text-xl mb-6 flex items-center gap-3">
                    <History className="text-arkumen-gold" /> Recent Ascensions
                  </h3>
                  <div className="space-y-4">
                    {history.map((game, i) => (
                      <div key={i} className="flex justify-between items-center border-b border-slate-700/50 pb-3 last:border-0">
                        <div>
                          <p className="text-sm font-medium">{game.category}</p>
                          <p className="text-xs text-slate-500">{game.mode} • {new Date(game.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-arkumen-gold">+{game.score}</p>
                          <p className="text-[10px] uppercase font-bold text-slate-600">Grade {game.grade}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button onClick={handleLogout} className="w-full py-4 text-red-400 font-bold flex items-center justify-center gap-2">
                  <LogOut size={20} /> Logout
                </button>
              </div>
            )}

            {activeTab === 'SETTINGS' && (
              <div className="space-y-8 py-8">
                <div className="text-center">
                  <Settings className="w-16 h-16 text-arkumen-gold mx-auto mb-4" />
                  <h2 className="text-3xl font-display gold-gradient">Arker Settings</h2>
                  <p className="text-slate-500 text-xs uppercase tracking-widest">Configure your experience</p>
                </div>

                <div className="space-y-4">
                  <div className="premium-card p-6">
                    <h3 className="font-bold text-sm uppercase tracking-widest text-arkumen-gold mb-4">Account</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Username</span>
                        <span className="font-bold">{profile.username}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Email</span>
                        <span className="text-sm">{user?.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="premium-card p-6">
                    <h3 className="font-bold text-sm uppercase tracking-widest text-arkumen-gold mb-4">Game Preferences</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center opacity-50">
                        <span className="text-slate-400">Sound Effects</span>
                        <span className="text-xs font-bold px-2 py-1 bg-slate-800 rounded">ON</span>
                      </div>
                      <div className="flex justify-between items-center opacity-50">
                        <span className="text-slate-400">Haptic Feedback</span>
                        <span className="text-xs font-bold px-2 py-1 bg-slate-800 rounded">ON</span>
                      </div>
                    </div>
                  </div>

                  <div className="premium-card p-6">
                    <h3 className="font-bold text-sm uppercase tracking-widest text-arkumen-gold mb-4">About ARKUMEN</h3>
                    <div className="space-y-2 text-sm text-slate-500">
                      <p>Version 2.0.0 (Arkers Elite Engine)</p>
                      <p>© 2026 ARKUMEN. All rights reserved.</p>
                    </div>
                  </div>

                  {deferredPrompt && (
                    <button 
                      onClick={handleInstallClick}
                      className="w-full premium-card p-6 flex items-center justify-between group hover:bg-arkumen-gold/10 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-arkumen-gold/20 flex items-center justify-center">
                          <Zap className="text-arkumen-gold" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-bold text-arkumen-gold uppercase tracking-widest text-sm">Install ARKUMEN</h3>
                          <p className="text-[10px] text-slate-500 uppercase">Add to home screen for the elite experience</p>
                        </div>
                      </div>
                      <ChevronRight className="text-arkumen-gold group-hover:translate-x-1 transition-transform" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {gameState === 'GAME' && questions.length > 0 && (
          <motion.div 
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen flex flex-col p-6"
          >
            {gameMode === 'MULTIPLAYER' && (
              <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-[150px]">
                {multiplayers.map((p, i) => (
                  <div key={i} className="bg-slate-900/80 backdrop-blur border border-slate-700 p-2 rounded-lg flex justify-between items-center text-[10px]">
                    <span className="truncate mr-2">{p.username}</span>
                    <span className="text-arkumen-gold font-bold">{p.score}</span>
                  </div>
                ))}
              </div>
            )}
            <header className="flex justify-between items-center mb-12">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setGameState('LOBBY')}
                  className="w-12 h-12 rounded-full border border-arkumen-gold/30 flex items-center justify-center hover:bg-arkumen-gold/10 transition-colors"
                  title="Exit Arena"
                >
                  <Home className="text-arkumen-gold" size={20} />
                </button>
                <div className="w-14 h-14 rounded-full border-2 border-arkumen-gold flex items-center justify-center relative">
                  <span className="font-display text-xl">{timeLeft}</span>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-500">Mode</p>
                  <p className="font-display text-arkumen-gold text-sm">{gameMode}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-500">
                  {gameMode === 'CLASSIC' ? 'Royalty Points' : 'Score'}
                </p>
                <p className="font-display text-2xl gold-gradient">
                  {gameMode === 'CLASSIC' ? (1000).toLocaleString() : score.toLocaleString()}
                </p>
              </div>
            </header>

            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
              {showTutorialOverlay && gameMode === 'TUTORIAL' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
                >
                  <div className="premium-card p-8 max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-arkumen-gold/20 flex items-center justify-center mx-auto">
                      <Zap className="text-arkumen-gold" size={32} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-display gold-gradient mb-2">{TUTORIAL_STEPS[tutorialStep].title}</h3>
                      <p className="text-slate-300 leading-relaxed">{TUTORIAL_STEPS[tutorialStep].content}</p>
                    </div>
                    <button 
                      onClick={() => {
                        setShowTutorialOverlay(false);
                        if (tutorialStep === 0) {
                          setTutorialStep(1);
                          setShowTutorialOverlay(true);
                        }
                      }}
                      className="w-full py-4 bg-arkumen-gold text-black font-bold rounded-xl hover:scale-[1.02] transition-transform"
                    >
                      {tutorialStep === 0 ? "NEXT" : "UNDERSTOOD"}
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="mb-8">
                <div className="flex justify-between items-end mb-2">
                  <span className="text-arkumen-gold font-display text-[10px] uppercase tracking-widest">Arena Progress {currentQuestionIndex + 1}/{questions.length}</span>
                  <span className="text-slate-500 text-[10px]">{Math.round(((currentQuestionIndex + 1) / questions.length) * 100)}%</span>
                </div>
                <div className="progress-bar-container">
                  <motion.div 
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                  />
                </div>
              </div>

              <h3 className="text-2xl md:text-4xl font-gothic leading-tight mb-12 text-center tracking-wide">"{questions[currentQuestionIndex].text}"</h3>

              <div className="grid grid-cols-1 gap-4">
                {questions[currentQuestionIndex].options.map((opt, i) => {
                  const isCorrect = i === questions[currentQuestionIndex].correctAnswer;
                  const isSelected = selectedAnswer === i;
                  
                  let btnClass = "answer-option";
                  if (showExplanation || (selectedAnswer !== null && isCorrect)) {
                    if (isCorrect) btnClass += " correct";
                    else if (isSelected) btnClass += " wrong";
                    else btnClass += " opacity-20";
                  }

                  return (
                    <button
                      key={i}
                      disabled={selectedAnswer !== null}
                      onClick={() => handleAnswer(i)}
                      className={btnClass}
                    >
                      <span className="answer-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="font-medium text-lg">{opt}</span>
                      {(showExplanation || (selectedAnswer !== null && isCorrect)) && isCorrect && <CheckCircle2 className="ml-auto text-green-500" size={24} />}
                      {showExplanation && isSelected && !isCorrect && <XCircle className="ml-auto text-red-500" size={24} />}
                    </button>
                  );
                })}
              </div>

              <AnimatePresence>
                {showExplanation && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-8 w-full max-w-full"
                  >
                    <div className="premium-card p-6 md:p-8 bg-slate-900/80 border-arkumen-gold/40 overflow-hidden break-words">
                      <p className="text-arkumen-gold font-display text-xs uppercase tracking-widest mb-4">The Revelation</p>
                      <div className="text-base md:text-lg text-slate-300 italic leading-relaxed">
                        <ReactMarkdown>{questions[currentQuestionIndex].explanation}</ReactMarkdown>
                      </div>
                      <button
                        onClick={nextQuestion}
                        className="mt-8 w-full py-5 bg-gradient-to-r from-arkumen-gold to-[#996515] text-black font-display tracking-widest rounded-xl hover:scale-[1.02] transition-transform"
                      >
                        {currentQuestionIndex === questions.length - 1 ? 'COMPLETE ASCENSION' : 'NEXT CHALLENGE'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {gameState === 'MULTIPLAYER_LOBBY' && (
          <motion.div 
            key="multiplayer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-md mx-auto p-6 flex flex-col items-center justify-center h-screen"
          >
            <Users className="w-16 h-16 text-arkumen-gold mb-6" />
            <h2 className="text-3xl font-display gold-gradient mb-2">Multiplayer Arena</h2>
            <p className="text-slate-500 text-center mb-8">Join a room to challenge others in real-time.</p>
            
            <div className="w-full space-y-4">
              <input 
                type="text" 
                placeholder="Enter Room ID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl focus:border-arkumen-gold outline-none"
              />
              <button 
                onClick={joinMultiplayer}
                className="w-full py-4 bg-arkumen-gold text-black font-bold rounded-xl"
              >
                Join Room
              </button>
              <button 
                onClick={() => setGameState('LOBBY')}
                className="w-full py-4 text-slate-500 font-bold"
              >
                Cancel
              </button>
            </div>

            {multiplayers.length > 0 && (
              <div className="mt-12 w-full">
                <h3 className="text-xs uppercase font-bold text-slate-500 mb-4">Players in Room</h3>
                <div className="space-y-2">
                  {multiplayers.map((p, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        {i === 0 && <Crown size={14} className="text-arkumen-gold" />}
                        <span>{p.username}</span>
                      </div>
                      <span className="text-arkumen-gold font-bold">{p.score}</span>
                    </div>
                  ))}
                </div>
                {multiplayers[0]?.id === socket?.id && (
                  <button 
                    onClick={startMultiplayerGame}
                    className="w-full mt-6 py-4 bg-white text-black font-bold rounded-xl"
                  >
                    Start Battle
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}

        {gameState === 'RESULT' && gameResult && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen flex items-center justify-center p-6 py-12"
          >
            <div className="premium-card max-w-lg w-full p-8 text-center">
              <Trophy className="w-16 h-16 text-arkumen-gold mx-auto mb-4" />
              <h2 className="text-6xl font-display gold-gradient mb-2">{gameResult.grade}</h2>
              <p className="text-slate-400 italic mb-8 leading-relaxed">"{gameResult.message}"</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl">
                  <p className="text-[10px] uppercase text-slate-500 mb-1 tracking-widest">Final Score</p>
                  <p className="text-2xl font-display text-arkumen-gold">{gameResult.score.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl">
                  <p className="text-[10px] uppercase text-slate-500 mb-1 tracking-widest">Max Streak</p>
                  <p className="text-2xl font-display text-arkumen-gold">{gameResult.streak}</p>
                </div>
              </div>

              <button 
                onClick={() => setGameState('LOBBY')}
                className="w-full py-4 bg-arkumen-gold text-black font-bold rounded-2xl shadow-[0_0_20px_rgba(212,175,55,0.3)] hover:shadow-[0_0_30px_rgba(212,175,55,0.5)] transition-all"
              >
                Return Home
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      {gameState === 'LOBBY' && (
        <nav className="fixed bottom-0 left-0 right-0 h-20 bottom-nav flex justify-around items-center px-4 z-50">
          <NavItem icon={<Home size={24} />} label="HOME" active={activeTab === 'HOME'} onClick={() => setActiveTab('HOME')} />
          <NavItem icon={<BarChart2 size={24} />} label="RANKS" active={activeTab === 'RANKS'} onClick={() => setActiveTab('RANKS')} />
          <NavItem icon={<UserIcon size={24} />} label="PROFILE" active={activeTab === 'PROFILE'} onClick={() => setActiveTab('PROFILE')} />
          <NavItem icon={<Settings size={24} />} label="SETTINGS" active={activeTab === 'SETTINGS'} onClick={() => setActiveTab('SETTINGS')} />
        </nav>
      )}

      {/* Source Modal */}
      <AnimatePresence>
        {showSourceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSourceModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-display gold-gradient">Generate from Source</h3>
                <button onClick={() => setShowSourceModal(false)} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="flex gap-2 mb-8">
                <SourceTab active={sourceType === 'NOTES'} icon={<FileText size={18} />} label="Notes" onClick={() => setSourceType('NOTES')} />
                <SourceTab active={sourceType === 'YOUTUBE'} icon={<Youtube size={18} />} label="YouTube" onClick={() => setSourceType('YOUTUBE')} />
                <SourceTab active={sourceType === 'VIDEO'} icon={<Video size={18} />} label="Video" onClick={() => setSourceType('VIDEO')} />
              </div>

              {sourceType === 'NOTES' && (
                <textarea 
                  placeholder="Paste your notes here..."
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  className="w-full h-40 p-4 bg-slate-800 border border-slate-700 rounded-2xl focus:border-arkumen-gold outline-none resize-none mb-6"
                />
              )}

              {sourceType === 'YOUTUBE' && (
                <div className="space-y-4 mb-6">
                  <input 
                    type="text" 
                    placeholder="Paste YouTube URL"
                    value={sourceInput}
                    onChange={(e) => setSourceInput(e.target.value)}
                    className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl focus:border-arkumen-gold outline-none"
                  />
                  <p className="text-xs text-slate-500">We'll analyze the video content to generate questions.</p>
                </div>
              )}

              {sourceType === 'VIDEO' && (
                <div className="mb-6">
                  <label className="w-full h-40 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-arkumen-gold transition-colors">
                    <Video className="text-slate-500" />
                    <span className="text-sm text-slate-500">{videoFile ? videoFile.name : 'Upload Video File'}</span>
                    <input type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              )}

              <button 
                onClick={handleSourceGeneration}
                className="w-full py-4 bg-arkumen-gold text-black font-bold rounded-2xl flex items-center justify-center gap-2"
              >
                <Zap size={20} /> Generate Questions
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Tutorial Modal */}
      <AnimatePresence>
        {showTutorial && (
          <TutorialModal 
            mode={showTutorial}
            onClose={() => setShowTutorial(null)}
            onStart={() => {
              const mode = showTutorial;
              setShowTutorial(null);
              if (mode === 'TUTORIAL') startNewGame('TUTORIAL');
              else if (mode === 'MULTIPLAYER') setGameState('MULTIPLAYER_LOBBY');
              else if (mode === 'CLASSIC') startNewGame('CLASSIC');
              else if (mode === 'BLITZ') startNewGame('BLITZ');
              else if (mode === 'SURVIVAL') startNewGame('SURVIVAL');
              else if (mode === 'ACADEMIC') startNewGame('ACADEMIC');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ChallengeCard({ icon, title, desc, badge, onClick, onInfoClick }: { icon: React.ReactNode, title: string, desc: string, badge?: string, onClick: () => void, onInfoClick?: () => void }) {
  return (
    <div className="relative group">
      <button 
        onClick={onClick}
        className="w-full premium-card p-6 flex items-center gap-6 group-hover:border-arkumen-gold/50 transition-all"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center group-hover:bg-arkumen-gold/10 transition-colors">
          {icon}
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-display text-lg tracking-wide">{title}</h3>
            {badge && <span className="px-2 py-0.5 bg-arkumen-blue text-[8px] font-bold rounded uppercase">{badge}</span>}
          </div>
          <p className="text-slate-500 text-sm">{desc}</p>
        </div>
      </button>
      {onInfoClick && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick();
          }}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-arkumen-gold transition-colors"
          title="How to play"
        >
          <HelpCircle size={18} />
        </button>
      )}
    </div>
  );
}

function TutorialModal({ mode, onClose, onStart }: { mode: keyof typeof TUTORIAL_CONTENT, onClose: () => void, onStart: () => void }) {
  const content = TUTORIAL_CONTENT[mode];
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg bg-slate-900 border border-arkumen-gold/30 rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="relative h-48 bg-arkumen-gold/5 flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-arkumen-gold/20 via-transparent to-transparent animate-pulse" />
          </div>
          <div className="relative z-10 text-center">
            <div className="w-20 h-20 rounded-full bg-slate-900 border-2 border-arkumen-gold flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(212,175,55,0.3)]">
              <Play className="w-8 h-8 text-arkumen-gold fill-arkumen-gold/20" />
            </div>
            <h2 className="text-2xl font-display gold-gradient uppercase tracking-widest">{content.title}</h2>
            <p className="text-arkumen-gold/60 text-[10px] uppercase tracking-[0.2em]">{content.subtitle}</p>
          </div>
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-slate-300 text-center italic">"{content.description}"</p>
          
          <div className="space-y-4">
            <h4 className="text-[10px] uppercase tracking-widest text-arkumen-gold font-bold">Arena Mechanics</h4>
            <div className="space-y-3">
              {content.mechanics.map((m, i) => (
                <div key={i} className="flex items-start gap-3 text-sm text-slate-400">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-arkumen-gold shrink-0" />
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Potential Rewards</p>
              <p className="text-sm font-bold text-arkumen-gold">{content.reward}</p>
            </div>
            <Trophy className="text-arkumen-gold/40" size={24} />
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 rounded-2xl border border-slate-700 font-bold text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button 
              onClick={() => {
                onClose();
                onStart();
              }}
              className="flex-1 py-4 rounded-2xl bg-arkumen-gold text-black font-bold hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] transition-all flex items-center justify-center gap-2"
            >
              Enter Arena <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn("nav-item", active && "active")}>
      {icon}
      <span className="text-[10px] font-bold tracking-widest">{label}</span>
      {active && <div className="nav-indicator" />}
    </button>
  );
}

function StatCard({ label, value }: { label: string, value: string }) {
  return (
    <div className="premium-card p-4 text-center">
      <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">{label}</p>
      <p className="text-xl font-display gold-gradient">{value}</p>
    </div>
  );
}

function SourceTab({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all",
        active ? "bg-arkumen-gold text-black" : "bg-slate-800 text-slate-500"
      )}
    >
      {icon} {label}
    </button>
  );
}
