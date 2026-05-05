import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';
import { useFirebase } from './FirebaseProvider';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { Question } from '../types';
import { generateQuestions } from '../services/geminiService';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, Zap, Crown, Timer, Home, ArrowRight, CheckCircle2, XCircle, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import confetti from 'canvas-confetti';
import { calculateRank } from '../lib/rankings';
import { UserProfile } from '../types';

interface BattlePlayer {
  uid: string;
  username: string;
  score: number;
  currentQuestionIndex: number;
  isReady: boolean;
  photoURL?: string;
  isFinished: boolean;
}

interface BattleRoom {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  players: BattlePlayer[];
  questions: Question[];
  hostId: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionCount: number;
  timeLimit: number;
  startTime?: any;
  createdAt: any;
}

// Pre-load sounds outside component to prevent re-creation on render
const sounds = {
  success: new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'),
  fail: new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
  victory: new Audio('https://assets.mixkit.co/active_storage/sfx/467/467-preview.mp3') // More triumphant fanfare
};

export const Battle: React.FC = () => {
  const { user, profile } = useFirebase();
  const navigate = useNavigate();
  const [room, setRoom] = useState<BattleRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing' | 'results'>('lobby');

  const [scorePulse, setScorePulse] = useState<string | null>(null);
  const [wasTrailingBy50Percent, setWasTrailingBy50Percent] = useState(false);
  const [hasUpdatedProfile, setHasUpdatedProfile] = useState(false);
  const [earnedXPState, setEarnedXPState] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const playSound = (type: 'success' | 'fail' | 'victory') => {
    const soundEnabled = localStorage.getItem('arkumen_sound_enabled') !== 'false';
    if (!soundEnabled) return;

    console.log(`Playing sound: ${type}`);
    const audio = sounds[type];
    audio.currentTime = 0;
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play blocked or failed', e));
  };

  // Matchmaking
  useEffect(() => {
    if (!user || !profile) return;

    const findRoom = async () => {
      setLoading(true);
      try {
        // Look for waiting rooms
        const q = query(
          collection(db, 'rooms'), 
          where('status', '==', 'waiting')
        );
        const snapshot = await getDocs(q);
        
        let targetRoomId = '';

        if (snapshot.empty) {
          // Create new room
          const questions = await generateQuestions('General Knowledge', 10, 'Medium');
          const newRoom = {
            status: 'waiting',
            hostId: user.uid,
            difficulty: 'Medium',
            questionCount: 10,
            timeLimit: 30,
            players: [{
              uid: user.uid,
              username: profile.username,
              score: 0,
              currentQuestionIndex: 0,
              isReady: false,
              isFinished: false,
              photoURL: profile.photoURL || user.photoURL || undefined
            }],
            questions,
            createdAt: serverTimestamp()
          };
          const docRef = await addDoc(collection(db, 'rooms'), newRoom);
          targetRoomId = docRef.id;
        } else {
          // Join existing room
          const existingRoom = snapshot.docs[0];
          targetRoomId = existingRoom.id;
          
          // Check if already in room
          const data = existingRoom.data() as BattleRoom;
          if (!data.players.find(p => p.uid === user.uid)) {
            await updateDoc(doc(db, 'rooms', targetRoomId), {
              players: arrayUnion({
                uid: user.uid,
                username: profile.username,
                score: 0,
                currentQuestionIndex: 0,
                isReady: false,
                isFinished: false,
                photoURL: profile.photoURL || user.photoURL || undefined
              })
            });
          }
        }

        // Subscribe to room updates
        const unsubscribe = onSnapshot(doc(db, 'rooms', targetRoomId), (doc) => {
          if (doc.exists()) {
            const roomData = { id: doc.id, ...doc.data() } as BattleRoom;
            setRoom(roomData);
            
            if (roomData.status === 'playing') {
              setGameState('playing');
              setTimeLeft(roomData.timeLimit || 30);
            } else if (roomData.status === 'finished') {
              setGameState('results');
            }
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `rooms/${targetRoomId}`);
        });

        setLoading(false);
        return unsubscribe;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'rooms');
        setLoading(false);
      }
    };

    const unsubPromise = findRoom();
    return () => {
      unsubPromise.then(unsub => unsub && unsub());
    };
  }, [user, profile]);

  // Timer logic
  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'playing') {
      handleAnswer(-1);
    }
  }, [timeLeft, gameState]);

  const toggleReady = async () => {
    if (!room || !user) return;
    const newPlayers = room.players.map(p => 
      p.uid === user.uid ? { ...p, isReady: !p.isReady } : p
    );
    
    const allReady = newPlayers.length >= 2 && newPlayers.every(p => p.isReady);
    
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        players: newPlayers,
        status: allReady ? 'playing' : 'waiting',
        startTime: allReady ? serverTimestamp() : null
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const handleAnswer = async (index: number) => {
    if (!room || !user || gameState !== 'playing') return;
    
    const currentQuestion = room.questions[currentIndex];
    const isCorrect = index === currentQuestion.correctAnswer;
    const points = isCorrect ? (1000 + timeLeft * 10) : 0;
    
    setSelectedAnswer(index);
    
    if (isCorrect) {
      setScorePulse(user.uid);
      setTimeout(() => setScorePulse(null), 1000);
    }

    // Update score in Firestore
    const newPlayers = room.players.map(p => {
      if (p.uid === user.uid) {
        return {
          ...p,
          score: p.score + points,
          currentQuestionIndex: currentIndex + 1,
          isFinished: currentIndex === room.questions.length - 1
        };
      }
      return p;
    });

    // Check if all finished
    const allFinished = newPlayers.every(p => p.isFinished);

    // Check for trailing condition
    const me = newPlayers.find(p => p.uid === user.uid);
    const opponent = newPlayers.find(p => p.uid !== user.uid);
    if (me && opponent && opponent.score >= (me.score * 2) && opponent.score > 0) {
      setWasTrailingBy50Percent(true);
    }

    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        players: newPlayers,
        status: allFinished ? 'finished' : 'playing'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.id}`);
    }

    if (isCorrect) {
      playSound('success');
      confetti({
        particleCount: 30,
        spread: 50,
        origin: { y: 0.8 },
        colors: ['#D4AF37', '#FFFFFF']
      });
    } else {
      playSound('fail');
    }

    // Move to next question after delay
    setTimeout(() => {
      if (currentIndex < room.questions.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setSelectedAnswer(null);
        setTimeLeft(room.timeLimit || 30);
      }
    }, 1500);
  };

  // Award XP and update profile on results
  useEffect(() => {
    if (gameState === 'results' && !hasUpdatedProfile && profile && user && room) {
      const me = room.players.find(p => p.uid === user.uid);
      const opponent = room.players.find(p => p.uid !== user.uid);
      if (!me) return;

      const isWinner = !opponent || me.score > opponent.score;
      const isDraw = opponent && me.score === opponent.score;
      
      const baseXP = isWinner ? 100 : (isDraw ? 75 : 50);
      const performanceXP = Math.floor(me.score / 100);
      const earnedXP = baseXP + performanceXP;

      const currentBadges = profile.badges || [];
      let earnedResilience = false;
      if (isWinner && wasTrailingBy50Percent && !currentBadges.includes('Resilience')) {
        earnedResilience = true;
      }

      const newTotalGames = (profile.stats?.totalGames || 0) + 1;
      const newTotalWins = (profile.stats?.totalWins || 0) + (isWinner ? 1 : 0);
      const newTotalXP = (profile.xp || 0) + earnedXP;
      
      const updatedStats = {
        ...profile.stats,
        totalGames: newTotalGames,
        totalWins: newTotalWins,
      };

      const updatedBadges = earnedResilience ? [...currentBadges, 'Resilience'] : currentBadges;

      const tempProfileForRanking = {
        ...profile,
        xp: newTotalXP,
        stats: updatedStats
      } as UserProfile;

      const { level: newLevel, title: newRank } = calculateRank(tempProfileForRanking);

      const updates: any = {
        xp: newTotalXP,
        level: newLevel,
        rank: newRank,
        badges: updatedBadges,
        'stats.totalGames': newTotalGames,
        'stats.totalWins': newTotalWins,
      };

      if (me.score > (profile.highestScore || 0)) {
        updates.highestScore = me.score;
      }

          const applyUpdates = async () => {
        try {
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, updates);
          setHasUpdatedProfile(true);
          setEarnedXPState(earnedXP);
          if (isWinner) {
            playSound('victory');
            // Victory Fanfare Confetti
            const duration = 5 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function() {
              const timeLeft = animationEnd - Date.now();

              if (timeLeft <= 0) {
                return clearInterval(interval);
              }

              const particleCount = 50 * (timeLeft / duration);
              confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
              confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
            }, 250);
          }
        } catch (e) {
          console.error("Failed to update battle results to profile", e);
        }
      };

      applyUpdates();
    }
  }, [gameState, hasUpdatedProfile, profile, user, room, wasTrailingBy50Percent]);

  const updateRoomSettings = async (settings: { questionCount: number, timeLimit: number, difficulty: 'Easy' | 'Medium' | 'Hard' }) => {
    if (!room || !user || room.hostId !== user.uid) return;
    setIsUpdatingSettings(true);
    try {
      const newQuestions = await generateQuestions('General Knowledge', settings.questionCount, settings.difficulty);
      await updateDoc(doc(db, 'rooms', room.id), {
        ...settings,
        questions: newQuestions
      });
      setIsSettingsOpen(false);
    } catch (e) {
      console.error("Failed to update room settings", e);
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const SettingsModal = () => {
    const [localSettings, setLocalSettings] = useState({
      questionCount: room?.questionCount || 10,
      timeLimit: room?.timeLimit || 30,
      difficulty: room?.difficulty || 'Medium'
    });

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="arena-card w-full max-w-sm p-8 space-y-8 border-arkumen-gold/30"
        >
          <div className="text-center space-y-2">
            <h3 className="font-display text-xl text-arkumen-gold tracking-widest uppercase">Duel Parameters</h3>
            <p className="text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase">Configure the battlefield</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Question Count</label>
              <div className="flex gap-2">
                {[5, 10, 15, 20].map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setLocalSettings(s => ({ ...s, questionCount: count }))}
                    className={clsx(
                      "flex-1 py-3 rounded-xl border text-xs font-display transition-all",
                      localSettings.questionCount === count 
                        ? "bg-arkumen-gold text-slate-950 border-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]" 
                        : "bg-slate-900 border-white/5 text-slate-500 hover:border-white/20"
                    )}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Time Limit (Seconds)</label>
              <div className="flex gap-2">
                {[15, 20, 30, 45].map(time => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setLocalSettings(s => ({ ...s, timeLimit: time }))}
                    className={clsx(
                      "flex-1 py-3 rounded-xl border text-xs font-display transition-all",
                      localSettings.timeLimit === time 
                        ? "bg-arkumen-gold text-slate-950 border-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]" 
                        : "bg-slate-900 border-white/5 text-slate-500 hover:border-white/20"
                    )}
                  >
                    {time}s
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Intensity Tier</label>
              <div className="flex gap-2">
                {['Easy', 'Medium', 'Hard'].map(diff => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setLocalSettings(s => ({ ...s, difficulty: diff as any }))}
                    className={clsx(
                      "flex-1 py-3 rounded-xl border text-[10px] font-display transition-all",
                      localSettings.difficulty === diff 
                        ? "bg-arkumen-gold text-slate-950 border-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]" 
                        : "bg-slate-900 border-white/5 text-slate-500 hover:border-white/20"
                    )}
                  >
                    {diff.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest bg-slate-900 text-slate-500 rounded-2xl border border-white/5 hover:bg-slate-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => updateRoomSettings(localSettings)}
              disabled={isUpdatingSettings}
              className="flex-2 py-4 text-[10px] font-black uppercase tracking-widest bg-arkumen-gold text-slate-950 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUpdatingSettings && <div className="w-3 h-3 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>}
              Apply Revelation
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  if (loading || !room) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-arkumen-bg">
        <div className="w-16 h-16 border-4 border-arkumen-gold border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="metallic-gold font-gothic tracking-[0.3em] uppercase text-sm">Summoning revelation...</p>
      </div>
    );
  }

  const currentPlayer = room.players.find(p => p.uid === user?.uid);

  return (
    <div className="min-h-screen bg-arkumen-bg text-slate-100 font-sans pb-10">
      {/* Cinematic HUD Sync */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/95 backdrop-blur-3xl px-6 py-5 flex items-center justify-between border-b border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('/arena')} className="hud-circle text-slate-500 hover:text-arkumen-gold transition-all active:scale-90">
            <Home size={20} />
          </button>
          
          <div className="flex flex-col">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] opacity-60">GLOBAL ARENA</span>
            <div className="flex items-center gap-2">
               <Users size={12} className="text-arkumen-gold" />
               <span className="text-arkumen-gold font-display text-sm tracking-widest uppercase">
                 {gameState === 'lobby' ? 'Matchmaking' : 'Live Duel'}
               </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
            {gameState === 'playing' && room && (
              <div className="hud-circle relative group">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/5" />
                  <motion.circle
                    cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2.5"
                    strokeDasharray="131.9"
                    strokeDashoffset={131.9 * (1 - timeLeft / (room.timeLimit || 30))}
                    className="text-arkumen-gold"
                  />
                </svg>
                <span className="text-lg font-display text-white">{timeLeft}</span>
              </div>
            )}
           <div className="w-10 h-10 rounded-full bg-slate-900 border border-white/5 flex items-center justify-center relative shadow-inner">
              <Zap size={18} className="text-arkumen-gold opacity-50" />
              <div className="absolute inset-0 bg-arkumen-gold/5 animate-pulse rounded-full"></div>
           </div>
        </div>
      </header>

      <main className="pt-32 px-6 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {gameState === 'lobby' && (
            <motion.div 
              key="lobby"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-10"
            >
              <div className="text-center space-y-3">
                <motion.div
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Users size={48} className="text-arkumen-gold mx-auto mb-4 opacity-40" />
                </motion.div>
                <h2 className="text-4xl logo-text">THE CITADEL</h2>
                <div className="flex flex-col items-center gap-2">
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em] animate-pulse">Scanning for Noble Arkers...</p>
                   {room && (
                     <div className="flex items-center gap-4 mt-2">
                       <span className="text-[8px] text-arkumen-gold/60 font-black tracking-widest uppercase border border-arkumen-gold/20 px-2 py-1 rounded">
                         {room.difficulty} • {room.questionCount} Questions • {room.timeLimit}s
                       </span>
                       {room.hostId === user?.uid && (
                         <button 
                           onClick={() => setIsSettingsOpen(true)}
                           className="p-2 bg-slate-900 border border-white/5 rounded-xl hover:bg-slate-800 hover:border-arkumen-gold/30 transition-all text-slate-400 hover:text-arkumen-gold"
                         >
                           <Settings size={14} />
                         </button>
                       )}
                     </div>
                   )}
                </div>
              </div>

              {isSettingsOpen && <SettingsModal />}

              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {room.players.map((p, i) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      transition={{ 
                        type: "spring",
                        stiffness: 300,
                        damping: 25,
                        delay: i * 0.1 
                      }}
                      key={p.uid} 
                      className={clsx(
                        "arena-card p-5 border-white/5 bg-slate-900/40 backdrop-blur-sm flex items-center justify-between",
                        p.uid === user?.uid && "border-arkumen-gold/20 bg-arkumen-gold/5"
                      )}
                    >
                    <div className="flex items-center gap-5">
                      <div className="relative">
                        <div className="w-14 h-14 rounded-2xl bg-slate-800 border-2 border-white/5 flex items-center justify-center overflow-hidden group-hover:scale-105 transition-transform">
                          {p.photoURL ? (
                            <img src={p.photoURL} alt={p.username} className="w-full h-full object-cover" />
                          ) : (
                            <Users size={24} className="text-slate-600" />
                          )}
                        </div>
                        {p.isReady && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-lg flex items-center justify-center border-2 border-slate-950 shadow-xl">
                            <CheckCircle2 size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                           <p className="text-md font-display text-white tracking-widest">{p.username}</p>
                           {p.uid === user?.uid && <span className="text-[7px] bg-arkumen-gold/20 text-arkumen-gold px-1.5 py-0.5 rounded font-black tracking-widest uppercase">YOU</span>}
                        </div>
                        <p className={clsx(
                          "text-[9px] font-black uppercase tracking-[0.2em] mt-1",
                          p.isReady ? "text-green-500 animate-pulse" : "text-slate-500"
                        )}>
                          {p.isReady ? 'CRYSTALLIZED' : 'MANIFESTING...'}
                        </p>
                      </div>
                    </div>
                    {p.isReady && (
                      <motion.div 
                        animate={{ scale: [1, 1.2, 1] }} 
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" 
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
                
                {room.players.length < 2 && (
                  <div className="p-10 text-center border-2 border-dashed border-white/5 rounded-3xl group hover:border-arkumen-gold/20 transition-all">
                    <div className="w-10 h-10 border-2 border-slate-700 border-t-arkumen-gold rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 text-[9px] font-bold uppercase tracking-[0.3em]">Awaiting opponent alignment...</p>
                  </div>
                )}
              </div>

              <div className="pt-4">
                <button
                  onClick={toggleReady}
                  className={clsx(
                    "w-full py-5 rounded-2xl font-display text-[10px] tracking-[0.4em] uppercase transition-all shadow-2xl relative overflow-hidden group",
                    currentPlayer?.isReady 
                      ? "bg-slate-900 text-slate-500 border border-white/5" 
                      : "bg-arkumen-gold text-slate-950 shadow-[0_0_40px_rgba(212,175,55,0.4)] active:scale-95"
                  )}
                >
                  {currentPlayer?.isReady ? 'REVOKE READINESS' : 'INITIALIZE TRIAL'}
                  {!currentPlayer?.isReady && (
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]"></div>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'playing' && (
            <motion.div 
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              {/* Battle Progress Visualizer */}
              <div className="grid gap-6">
                {room.players.map(p => (
                  <div key={p.uid} className={clsx(
                    "p-5 rounded-3xl border backdrop-blur-xl transition-all relative overflow-hidden group",
                    p.uid === user?.uid ? "border-arkumen-gold/40 bg-arkumen-gold/5" : "border-white/5 bg-slate-900/40"
                  )}>
                    <div className="flex justify-between items-end mb-4 relative z-10">
                       <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className={clsx(
                              "w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border",
                              p.uid === user?.uid ? "border-arkumen-gold/50" : "border-white/10"
                            )}>
                              {p.photoURL ? (
                                <img src={p.photoURL} alt={p.username} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-slate-800">
                                  <Users size={16} className="text-slate-600" />
                                </div>
                              )}
                            </div>
                            {p.isFinished && (
                              <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-lg p-0.5 border-2 border-slate-950 shadow-xl">
                                <CheckCircle2 size={10} className="text-white" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[7px] text-slate-500 font-black uppercase tracking-[0.2em] mb-0.5">
                              {p.uid === user?.uid ? 'YOU' : 'OPPONENT'}
                            </span>
                            <span className="text-white font-display text-[12px] tracking-widest">{p.username}</span>
                          </div>
                       </div>
                       <div className="text-right">
                          <motion.span 
                            key={p.score}
                            initial={{ scale: 1.5, y: -5 }}
                            animate={{ scale: 1, y: 0 }}
                            className="text-arkumen-gold font-display text-xl leading-none block"
                          >
                            {p.score}
                          </motion.span>
                          <span className="text-[7px] text-slate-500 font-black tracking-widest uppercase">PTS</span>
                       </div>
                    </div>
                    
                    <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className={clsx(
                          "absolute inset-y-0 left-0 transition-all duration-1000",
                          p.uid === user?.uid ? "bg-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.5)]" : "bg-slate-600"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${(p.currentQuestionIndex / room.questions.length) * 100}%` }}
                      >
                        {p.uid === user?.uid && (
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                        )}
                      </motion.div>
                    </div>

                    <div className="flex justify-between mt-2 px-1">
                       <span className="text-[8px] text-slate-600 font-black uppercase">Progression</span>
                       <span className="text-[8px] text-slate-600 font-black italic uppercase">
                         {p.currentQuestionIndex} / {room.questions.length}
                       </span>
                    </div>

                    {p.uid === user?.uid && (
                      <div className="absolute top-0 right-0 w-32 h-32 bg-arkumen-gold/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
                    )}
                  </div>
                ))}
              </div>

              {/* Question Arena */}
              <div className="space-y-12 relative">
                <motion.h2 
                  key={currentIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="question-text"
                >
                  "{room.questions[currentIndex].text}"
                </motion.h2>
 
                <div className="grid gap-4">
                  {room.questions[currentIndex].options.map((option, idx) => {
                    const isCorrect = idx === room.questions[currentIndex].correctAnswer;
                    const isSelected = selectedAnswer === idx;
                    
                    return (
                      <motion.button
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx}
                        disabled={selectedAnswer !== null}
                        onClick={() => handleAnswer(idx)}
                        className={clsx(
                          "option-card py-5",
                          selectedAnswer !== null && isCorrect && "border-green-500/40 bg-green-500/5",
                          selectedAnswer !== null && isSelected && !isCorrect && "border-red-500/40 bg-red-500/5",
                          selectedAnswer === null && "hover:border-arkumen-gold/30"
                        )}
                      >
                        <div className="flex items-center gap-5 w-full">
                          <div className={clsx(
                            "option-letter",
                            isSelected ? "bg-arkumen-gold/20 text-arkumen-gold border-arkumen-gold/30" : "group-hover:border-arkumen-gold/20"
                          )}>
                            {String.fromCharCode(64 + idx + 1)}
                          </div>
                          <span className={clsx(
                            "option-text text-sm",
                            isSelected ? "text-white" : "text-slate-300"
                          )}>{option}</span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'results' && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10 text-center py-6"
            >
              <div className="flex justify-center relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 w-32 h-32 border border-dashed border-arkumen-gold/20 rounded-full mx-auto"
                />
                <div className="w-32 h-32 rounded-[2rem] bg-slate-900 border-2 border-arkumen-gold flex items-center justify-center shadow-[0_0_60px_rgba(212,175,55,0.2)] relative z-10">
                  <Trophy size={56} className="text-arkumen-gold drop-shadow-xl" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-4xl md:text-6xl heading-arkumen px-2 !tracking-tight">DUEL ENDED</h2>
                <div className="flex items-center justify-center gap-3">
                   <div className="h-[1px] w-8 bg-arkumen-gold/30"></div>
                   <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.5em]">TRIAL STANDINGS</p>
                   <div className="h-[1px] w-8 bg-arkumen-gold/30"></div>
                </div>
              </div>

              <div className="space-y-5">
                {[...room.players].sort((a, b) => b.score - a.score).map((p, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.2 }}
                    key={p.uid} 
                    className={clsx(
                      "arena-card p-6 flex items-center justify-between backdrop-blur-md transition-all",
                      i === 0 ? "border-arkumen-gold/50 bg-arkumen-gold/10 shadow-[0_0_30px_rgba(212,175,55,0.1)]" : "border-white/5 opacity-80"
                    )}
                  >
                    <div className="flex items-center gap-5">
                      <div className={clsx(
                        "w-12 h-12 rounded-xl flex items-center justify-center font-display text-2xl shadow-inner",
                        i === 0 ? "bg-arkumen-gold text-slate-950" : "bg-slate-800 text-slate-500"
                      )}>
                        {i + 1}
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-display text-white tracking-widest">{p.username}</p>
                        {i === 0 ? (
                           <span className="text-[10px] text-arkumen-gold font-bold uppercase tracking-widest flex items-center gap-1.5 mt-0.5">
                             <Crown size={12} /> VICTORIOUS ARKER
                           </span>
                        ) : (
                           <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em] mt-0.5">ESTEEMED RUNNER</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-arkumen-gold tracking-tighter">{p.score}</p>
                      <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">SCORE</p>
                      {p.uid === user?.uid && earnedXPState !== null && (
                        <p className="text-[8px] text-green-500 font-black uppercase tracking-widest mt-1">+{earnedXPState} XP</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Performance Stats Overlay */}
              {profile && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="grid grid-cols-2 gap-4 mt-6"
                >
                  <div className="arena-card p-4 border-white/5 bg-slate-900/40">
                    <span className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] block mb-1">TOTAL BATTLES</span>
                    <span className="text-xl font-display text-white">{profile.stats?.totalGames || 0}</span>
                  </div>
                  <div className="arena-card p-4 border-white/5 bg-slate-900/40">
                    <span className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] block mb-1">WIN RATIO</span>
                    <span className="text-xl font-display text-arkumen-gold">
                      {profile.stats?.totalGames ? Math.round(((profile.stats?.totalWins || 0) / profile.stats.totalGames) * 100) : 0}%
                    </span>
                  </div>
                </motion.div>
              )}

              <div className="pt-6">
                <button
                  onClick={() => navigate('/arena')}
                  className="w-full btn-embroidery-primary py-5 text-[11px]"
                >
                  RETURN TO THE SOURCE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};
