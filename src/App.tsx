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
  Send
} from 'lucide-react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { generateQuestions, generateWarriorTitle, analyzePerformance, generateDailyChallenge } from './services/geminiService';
import { Question, UserProfile, GameResult, DailyChallenge } from './types';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { io, Socket } from 'socket.io-client';

type GameState = 'LANDING' | 'LOBBY' | 'LOADING' | 'GAME' | 'RESULT' | 'MULTIPLAYER_LOBBY';
type Tab = 'HOME' | 'RANKS' | 'PROFILE' | 'SETTINGS';
type GameMode = 'CLASSIC' | 'BLITZ' | 'SURVIVAL' | 'SPECIALIST' | 'MULTIPLAYER' | 'ACADEMIC' | 'DAILY';

const LADDER_VALUES = [
  100, 200, 300, 500, 1000, 
  2000, 4000, 8000, 16000, 32000, 
  64000, 125000, 250000, 500000, 1000000,
  2000000, 3000000, 5000000, 7500000, 10000000,
  15000000, 20000000, 30000000, 40000000, 50000000,
  75000000, 100000000, 150000000, 200000000, 250000000,
  300000000, 400000000, 500000000, 750000000, 1000000000, 2000000000
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
  const [timeLeft, setTimeLeft] = useState(30);
  const [showExplanation, setShowExplanation] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSpecialistModal, setShowSpecialistModal] = useState(false);
  const [sourceType, setSourceType] = useState<'NOTES' | 'YOUTUBE' | 'VIDEO'>('NOTES');
  const [sourceInput, setSourceInput] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallenge | null>(null);
  const [dailyChallengeLoading, setDailyChallengeLoading] = useState(false);

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
    const s = io();
    setSocket(s);
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
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await fetchProfile(u.uid);
        fetchHistory(u.uid);
        fetchLeaderboard();
        fetchDailyChallenge();
        setGameState('LOBBY');
      } else {
        setGameState('LANDING');
      }
      setLoading(false);
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
        setProfile(docSnap.data() as UserProfile);
      } else {
        const isArchitect = auth.currentUser?.email === "nonsookoli757@gmail.com";
        const newProfile: UserProfile = {
          uid,
          username: auth.currentUser?.displayName || 'Warrior',
          points: 0,
          highestScore: 0,
          favoriteCategory: 'General',
          warriorTitle: isArchitect ? 'The Architect' : 'The Seeker',
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
    });
  };

  const fetchDailyChallenge = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const docRef = doc(db, 'daily_challenges', today);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setDailyChallenge(docSnap.data() as DailyChallenge);
      } else {
        setDailyChallengeLoading(true);
        const newChallenge = await generateDailyChallenge(today);
        await setDoc(docRef, newChallenge);
        setDailyChallenge(newChallenge);
        setDailyChallengeLoading(false);
      }
    } catch (error) {
      console.error("Daily Challenge Error:", error);
    }
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
    try {
      let q: Question[] = [];
      if (mode === 'MULTIPLAYER') {
        setGameState('MULTIPLAYER_LOBBY');
        return;
      }

      q = await generateQuestions(category, mode === 'CLASSIC' ? 36 : 15, 'Medium');
      setQuestions(q);
      setCurrentQuestionIndex(0);
      setScore(0);
      setStreak(0);
      setMaxStreak(0);
      setTimeLeft(mode === 'BLITZ' ? 120 : 30);
      setGameState('GAME');
    } catch (error) {
      console.error("Game Start Error:", error);
      setGameState('LOBBY');
    }
  };

  const startDailyChallenge = () => {
    if (!dailyChallenge || !profile) return;
    
    const today = new Date().toISOString().split('T')[0];
    if (profile.lastDailyChallengeDate === today) {
      alert("You have already completed today's challenge, Warrior!");
      return;
    }

    setQuestions(dailyChallenge.questions);
    setCurrentQuestionIndex(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setTimeLeft(30);
    setGameMode('DAILY');
    setSelectedCategory(dailyChallenge.theme);
    setGameState('GAME');
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
    
    if (correct) {
      correctSound.current?.play().catch(() => {});
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMaxStreak(Math.max(maxStreak, newStreak));
      setScore(prev => prev + (gameMode === 'CLASSIC' ? LADDER_VALUES[currentQuestionIndex] || 1000 : 500));
      
      // Auto-advance on correct answer after a short delay
      setTimeout(() => {
        nextQuestion();
      }, 1500);
    } else {
      wrongSound.current?.play().catch(() => {});
      setStreak(0);
      setShowExplanation(true); // Only show explanation on wrong answer
      if (gameMode === 'SURVIVAL') {
        setTimeout(() => endGame(), 2000);
        return;
      }
    }

    if (socket && gameState === 'GAME' && roomId) {
      socket.emit("submit-score", { roomId, score: score + (correct ? 500 : 0) });
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
        const newHighest = Math.max(profile.highestScore, score);
        let newTitle = profile.warriorTitle;
        let lastDailyDate = profile.lastDailyChallengeDate;
        let dailyStreak = profile.dailyChallengeStreak || 0;
        let badges = profile.badges || [];

        if (gameMode === 'DAILY') {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const isConsecutive = profile.lastDailyChallengeDate === yesterday;
          dailyStreak = isConsecutive ? (profile.dailyChallengeStreak || 0) + 1 : 1;
          
          // Bonus points for daily challenge
          const bonusPoints = 5000 + (dailyStreak * 1000);
          newPoints += bonusPoints;
          lastDailyDate = today;

          // Special badges
          if (dailyStreak === 7 && !badges.includes("7-Day Streak")) {
            badges = [...badges, "7-Day Streak"];
          } else if (dailyStreak === 30 && !badges.includes("Monthly Master")) {
            badges = [...badges, "Monthly Master"];
          }
        }
        
        if (auth.currentUser?.email === "nonsookoli757@gmail.com") {
          newTitle = "The Architect";
        } else if (score > profile.highestScore && score > 5000) {
          newTitle = await generateWarriorTitle(profile.username, newPoints, newHighest, selectedCategory, auth.currentUser?.email || undefined);
        }

        const updatedProfile = {
          ...profile,
          points: newPoints,
          highestScore: newHighest,
          warriorTitle: newTitle,
          lastDailyChallengeDate: lastDailyDate,
          dailyChallengeStreak: dailyStreak,
          badges: badges
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
              <h1 className="font-display text-6xl md:text-8xl mb-2 gold-gradient tracking-[0.3em]">ARKUMEN</h1>
              <p className="text-slate-400 uppercase tracking-[0.5em] text-xs mb-12">The Divine Revelations Quiz Game</p>
              <button 
                onClick={handleLogin}
                className="group relative px-16 py-5 bg-transparent border border-arkumen-gold/50 overflow-hidden transition-all hover:pulse-gold rounded-sm"
              >
                <div className="absolute inset-0 bg-arkumen-gold translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                <span className="relative z-10 font-display text-xl tracking-[0.3em] group-hover:text-black transition-colors">ENTER ARENA</span>
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
                    <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em]">The Divine Revelations Quiz Game</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-arkumen-gold to-[#996515] p-0.5 shadow-[0_0_15px_rgba(212,175,55,0.3)]">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                      <UserIcon className="text-arkumen-gold" />
                    </div>
                  </div>
                </header>

                <section>
                  <h2 className="text-arkumen-gold/60 font-display uppercase tracking-widest text-[10px] mb-6">Active Arenas</h2>
                  <div className="space-y-4">
                    {dailyChallenge && (
                      <ChallengeCard 
                        icon={<Sparkles className="text-arkumen-gold" />}
                        title="Daily Revelation"
                        desc={dailyChallenge.theme}
                        badge={profile.lastDailyChallengeDate === dailyChallenge.date ? "COMPLETED" : "BONUS XP"}
                        onClick={startDailyChallenge}
                      />
                    )}
                    <ChallengeCard 
                      icon={<Crown className="text-arkumen-gold" />}
                      title="Classic Quiz"
                      desc="36 levels of divine revelations."
                      onClick={() => startNewGame('CLASSIC')}
                    />
                    <ChallengeCard 
                      icon={<Clock className="text-arkumen-gold" />}
                      title="Timed Blitz"
                      desc="2 minutes. Prove your mastery."
                      onClick={() => startNewGame('BLITZ')}
                    />
                    <ChallengeCard 
                      icon={<Heart className="text-arkumen-gold" />}
                      title="Warrior's Path"
                      desc="One life. Defy the fall."
                      onClick={() => startNewGame('SURVIVAL')}
                    />
                    <ChallengeCard 
                      icon={<BookOpen className="text-arkumen-gold" />}
                      title="Niche Specialist"
                      desc="Master a specific revelation."
                      onClick={() => setShowSpecialistModal(true)}
                    />
                    <ChallengeCard 
                      icon={<Users className="text-arkumen-gold" />}
                      title="Multiplayer Arena"
                      desc="Clash with other Warriors."
                      badge="LIVE"
                      onClick={() => setGameState('MULTIPLAYER_LOBBY')}
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
                  <p className="text-slate-500 text-xs uppercase tracking-widest">The Top 20 Warriors</p>
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
                        <p className="text-[10px] text-slate-500 uppercase tracking-tighter">{player.warriorTitle}</p>
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
                  <p className={cn(
                    "italic uppercase tracking-[0.3em] text-xs",
                    profile.warriorTitle === "The Architect" ? "font-display text-arkumen-gold-light text-sm" : "text-arkumen-gold/60"
                  )}>
                    {profile.warriorTitle}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Royalty Points" value={profile.points.toLocaleString()} />
                  <StatCard label="Highest Score" value={profile.highestScore.toLocaleString()} />
                  <StatCard label="Daily Streak" value={`${profile.dailyChallengeStreak || 0} Days`} />
                  <StatCard label="Badges" value={`${profile.badges?.length || 0}`} />
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
                  <h2 className="text-3xl font-display gold-gradient">Warrior Settings</h2>
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
                      <p>Version 2.0.0 (Revelations Engine)</p>
                      <p>© 2026 ARKUMEN. All rights reserved.</p>
                    </div>
                  </div>
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
                  {gameMode === 'CLASSIC' ? (LADDER_VALUES[currentQuestionIndex] || 0).toLocaleString() : score.toLocaleString()}
                </p>
              </div>
            </header>

            <div className="flex-1 flex flex-col justify-center max-w-2xl mx-auto w-full">
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
                    className="mt-8"
                  >
                    <div className="premium-card p-8 bg-slate-900/80 border-arkumen-gold/40">
                      <p className="text-arkumen-gold font-display text-xs uppercase tracking-widest mb-4">The Revelation</p>
                      <div className="text-lg text-slate-300 italic leading-relaxed">
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

      {/* Specialist Modal */}
      <AnimatePresence>
        {showSpecialistModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSpecialistModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-display gold-gradient">Specialist Niche</h3>
                <button onClick={() => setShowSpecialistModal(false)} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {['Spiritual Truths', 'Metaphysics', 'Divine Hierarchy', 'Ancient History', 'Zoe Science', 'The Three Elijahs', 'Lord Adam', 'Mother Eve'].map((niche) => (
                  <button
                    key={niche}
                    onClick={() => {
                      setShowSpecialistModal(false);
                      startNewGame('SPECIALIST', niche);
                    }}
                    className="p-4 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold hover:border-arkumen-gold transition-all"
                  >
                    {niche}
                  </button>
                ))}
              </div>
              <p className="text-center text-[10px] text-slate-500 uppercase tracking-widest">Select your area of expertise</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
    </div>
  );
}

function ChallengeCard({ icon, title, desc, badge, onClick }: { icon: React.ReactNode, title: string, desc: string, badge?: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full premium-card p-6 flex items-center gap-6 group"
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
