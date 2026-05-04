import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Timer, Zap, Trophy, ArrowRight, RotateCcw, Home as HomeIcon, Sparkles, Brain, CheckCircle2, XCircle, Crown } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFirebase } from './FirebaseProvider';
import { generateQuestions, generateDailyChallenge, analyzePerformance, generateArkerTitle } from '../services/geminiService';
import { Question, GameResult, UserProfile } from '../types';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { doc, updateDoc, collection, addDoc, increment } from 'firebase/firestore';
import { clsx } from 'clsx';

const QUESTION_TIME = 20;

// Pre-load sounds outside component to prevent re-creation on render
const sounds = {
  success: new Audio('https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3'),
  fail: new Audio('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3'),
  victory: new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3')
};

export const Quiz: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, profile, updateProfile } = useFirebase();
  const mode = searchParams.get('mode') || 'classic';

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME);
  const [gameState, setGameState] = useState<'loading' | 'playing' | 'answered' | 'finished'>('loading');
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const currentQuestion = questions[currentIndex];
  const answeredForCurrent = userAnswers[currentIndex] !== undefined;

  const playSound = (type: 'success' | 'fail' | 'victory') => {
    const soundEnabled = localStorage.getItem('arkumen_sound_enabled') !== 'false';
    if (!soundEnabled) return;

    console.log(`Playing sound: ${type}`);
    const audio = sounds[type];
    audio.currentTime = 0;
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play blocked or failed', e));
  };

  const fetchQuestions = useCallback(async () => {
    setGameState('loading');
    try {
      let q: Question[] = [];
      if (mode === 'daily') {
        const today = new Date().toISOString().split('T')[0];
        const challenge = await generateDailyChallenge(today);
        q = challenge.questions;
      } else {
        q = await generateQuestions('General', 10, 'Medium');
      }
      setQuestions(q);
      setUserAnswers(new Array(q.length).fill(undefined));
      setGameState('playing');
      setTimeLeft(QUESTION_TIME);
    } catch (error) {
      console.error("Failed to fetch questions", error);
    }
  }, [mode]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    if (gameState === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && gameState === 'playing') {
      handleAnswer(-1); // Timeout
    }
  }, [timeLeft, gameState]);

  const handleAnswer = (index: number) => {
    if (gameState !== 'playing' || answeredForCurrent) return;
    
    const newUserAnswers = [...userAnswers];
    newUserAnswers[currentIndex] = index;
    setUserAnswers(newUserAnswers);
    
    setSelectedAnswer(index);
    setGameState('answered');
    
    const isCorrect = index === currentQuestion.correctAnswer;
    
    if (isCorrect) {
      playSound('success');
      const timeBonus = Math.floor(timeLeft * 10);
      const questionPoints = 1000 + timeBonus;
      setScore(prev => prev + questionPoints);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > maxStreak) setMaxStreak(newStreak);
        return newStreak;
      });
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#D4AF37', '#FFFFFF']
      });
    } else {
      playSound('fail');
      setStreak(0);
    }
  };

  const nextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      const previousAnswer = userAnswers[nextIdx];
      
      if (previousAnswer !== undefined) {
        setSelectedAnswer(previousAnswer);
        setGameState('answered');
      } else {
        setSelectedAnswer(null);
        setTimeLeft(QUESTION_TIME);
        setGameState('playing');
      }
    } else {
      finishGame();
    }
  };

  const prevQuestion = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      setSelectedAnswer(userAnswers[prevIdx] ?? null);
      setGameState('answered');
    }
  };

  const finishGame = async () => {
    setGameState('finished');
    setIsAnalyzing(true);
    
    try {
      // AI Analysis
      const analysis = await analyzePerformance(
        score,
        maxStreak,
        profile?.rank || 'Neophyte',
        score > 5000 ? 'Victory' : 'Defeat',
        questions.length,
        mode
      );

      const result: GameResult = {
        score,
        streak: maxStreak,
        category: 'General',
        grade: analysis.grade,
        message: analysis.message,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        nextSteps: analysis.nextSteps
      };
      setGameResult(result);

      if (analysis.grade === 'S' || analysis.grade === 'A') {
        playSound('victory');
      }

      // Save Data
      if (profile) {
        // Save result record to Firestore only if authenticated
        if (user) {
          try {
            const resultRef = collection(db, 'results');
            await addDoc(resultRef, {
              ...result,
              uid: user.uid,
              timestamp: new Date().toISOString(),
              mode
            });
          } catch (e) {
            console.error("Failed to save result to Firestore", e);
          }
        }

        const updates: any = {
          points: (profile.points || 0) + score,
          'stats.totalGames': (profile.stats?.totalGames || 0) + 1,
        };

        if (score > (profile.highestScore || 0)) {
          updates.highestScore = score;
        }

        // Update rank based on points
        const newTotalPoints = (profile.points || 0) + score;
        let newRank = profile.rank;
        if (newTotalPoints > 1000000) newRank = 'Prophet';
        else if (newTotalPoints > 500000) newRank = 'Evangelist';
        else if (newTotalPoints > 250000) newRank = 'Apostle';
        else if (newTotalPoints > 100000) newRank = 'Disciple';
        else if (newTotalPoints > 50000) newRank = 'Proselyte';
        else if (newTotalPoints > 15000) newRank = 'Seeker';
        else if (newTotalPoints > 5000) newRank = 'Initiate';
        
        if (newRank !== profile.rank) {
          updates.rank = newRank;
          updates.level = (profile.level || 1) + 1;
          // Generate new title on rank up
          const newTitle = await generateArkerTitle(profile.username, newTotalPoints, score, newRank, user?.email || undefined);
          updates.arkerTitle = newTitle;
        }

        if (mode === 'daily') {
          const today = new Date().toISOString().split('T')[0];
          updates.lastDailyChallengeDate = today;
          updates.dailyChallengeStreak = (profile.dailyChallengeStreak || 0) + 1;
        }

        await updateProfile(updates);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'results');
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (gameState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
        <motion.div 
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="relative"
        >
          <div className="w-24 h-24 border-2 border-arkumen-gold/20 rounded-full" />
          <div className="absolute inset-0 w-24 h-24 border-t-2 border-arkumen-gold rounded-full animate-spin" />
          <Crown className="absolute inset-0 m-auto text-arkumen-gold opacity-50" size={32} />
        </motion.div>
        <div className="text-center">
          <h2 className="text-3xl metallic-gold font-gothic mb-3 tracking-[0.2em]">SUMMONING REVELATION</h2>
          <p className="text-slate-500 font-luxury italic text-lg animate-pulse">Metaphysical truths are manifesting...</p>
        </div>
      </div>
    );
  }

  if (gameState === 'finished') {
    return (
      <div className="max-w-3xl mx-auto space-y-10 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-10 md:p-14 text-center relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-arkumen-gold to-transparent"></div>
          
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12 }}
            className="mb-8"
          >
            {gameResult?.grade === 'S' || gameResult?.grade === 'A' ? (
              <div className="relative">
                <Trophy size={120} className="text-arkumen-gold mx-auto drop-shadow-[0_0_30px_rgba(212,175,55,0.6)] animate-bounce" />
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute -top-4 left-1/2 -translate-x-1/2 bg-arkumen-gold text-slate-950 px-4 py-1 rounded-full text-[10px] font-black tracking-widest"
                >
                  EXCELLENT
                </motion.div>
              </div>
            ) : (
              <Trophy size={80} className="text-arkumen-gold mx-auto drop-shadow-[0_0_20px_rgba(212,175,55,0.4)]" />
            )}
          </motion.div>
          
          <h2 className="text-5xl md:text-6xl heading-arkumen mb-4">TRIAL COMPLETE</h2>
          {(gameResult?.grade === 'S' || gameResult?.grade === 'A') && (
            <p className="text-arkumen-gold font-luxury text-2xl italic mb-6 animate-pulse">
              "Congrats Winner, fine display of revelations mastery. Keep up the streak."
            </p>
          )}
          
          <div className="grid grid-cols-2 gap-8 mb-12">
            <div className="stat-card">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest block mb-2">Final Score</span>
              <span className="text-5xl font-bold text-arkumen-gold tracking-tighter">{score.toLocaleString()}</span>
            </div>
            <div className="stat-card">
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest block mb-2">Max Streak</span>
              <span className="text-5xl font-bold text-white tracking-tighter">{maxStreak}</span>
            </div>
          </div>

          {isAnalyzing ? (
            <div className="py-20 space-y-8 flex flex-col items-center">
              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-arkumen-gold/20 rounded-full blur-2xl"
                />
                <div className="flex gap-4 relative z-10">
                  {[0, 0.2, 0.4].map((delay) => (
                    <motion.div 
                      key={delay}
                      animate={{ y: [0, -15, 0], scale: [1, 1.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity, delay, ease: "easeInOut" }}
                      className="w-1.5 h-12 bg-arkumen-gold/40 rounded-full"
                    />
                  ))}
                </div>
              </div>
              <div className="text-center space-y-2">
                <p className="text-arkumen-gold font-display tracking-[0.3em] uppercase text-xs animate-pulse">Consulting the Source</p>
                <p className="text-slate-400 font-luxury italic text-xl">The Grand Master evaluates your alignment...</p>
              </div>
            </div>
          ) : gameResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-left space-y-8"
            >
              <div className="flex items-center gap-6 p-6 bg-arkumen-gold/5 rounded-3xl border border-arkumen-gold/20 backdrop-blur-md">
                <div className="w-20 h-20 bg-arkumen-gold rounded-2xl flex items-center justify-center text-slate-950 text-4xl font-bold font-display shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                  {gameResult.grade}
                </div>
                <p className="text-slate-200 font-luxury italic text-xl leading-relaxed opacity-90">"{gameResult.message}"</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-green-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CheckCircle2 size={16} /> Strengths
                  </h4>
                  <ul className="space-y-3">
                    {gameResult.strengths?.map((s, i) => (
                      <li key={i} className="text-sm text-slate-400 bg-white/5 px-4 py-3 rounded-xl border border-white/5">{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <XCircle size={16} /> Weaknesses
                  </h4>
                  <ul className="space-y-3">
                    {gameResult.weaknesses?.map((w, i) => (
                      <li key={i} className="text-sm text-slate-400 bg-white/5 px-4 py-3 rounded-xl border border-white/5">{w}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                <h4 className="text-[10px] font-bold text-arkumen-gold uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <Brain size={16} /> Path to Enlightenment
                </h4>
                <p className="text-slate-300 font-luxury italic text-lg leading-relaxed opacity-80">{gameResult.nextSteps}</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        <div className="flex flex-col md:flex-row gap-6">
          <button
            onClick={() => {
              setCurrentIndex(0);
              setScore(0);
              setStreak(0);
              setMaxStreak(0);
              fetchQuestions();
            }}
            className="btn-secondary flex-1 py-5 text-lg"
          >
            <RotateCcw size={22} /> RETAKE TRIAL
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn-primary flex-1 py-5 text-lg"
          >
            <HomeIcon size={22} /> RETURN HOME
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-arkumen-bg text-slate-100 font-sans pb-10">
      {/* Quiz HUD */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/95 backdrop-blur-3xl px-6 py-5 flex items-center justify-between border-b border-white/5 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-6">
          <Link to="/" className="hud-circle text-slate-500 hover:text-arkumen-gold hover:border-arkumen-gold/30 transition-all active:scale-90">
            <HomeIcon size={20} />
          </Link>

          {/* Timer Orbit */}
          <div className="relative group">
            <div className="hud-circle relative z-10 border-white/5 group-hover:border-arkumen-gold/20 transition-all">
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-white/5"
                />
                <motion.circle
                  cx="24"
                  cy="24"
                  r="21"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="131.9"
                  strokeDashoffset={131.9 * (1 - timeLeft / QUESTION_TIME)}
                  className={clsx(
                    "transition-colors duration-500",
                    timeLeft < 5 ? "text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "text-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]"
                  )}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </svg>
              <span className={clsx(
                "text-lg font-display transition-colors",
                timeLeft < 5 ? "text-red-500 animate-pulse" : "text-white"
              )}>{timeLeft}</span>
            </div>
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 bg-arkumen-gold/5 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
        </div>

        <div className="flex items-center gap-12">
          <div className="hidden md:flex flex-col items-center gap-1">
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.3em] opacity-60">CHALLENGE INTENSITY</span>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="w-4 h-1 rounded-full bg-arkumen-gold/20 overflow-hidden">
                   {i < (searchParams.get('difficulty') === 'hard' ? 3 : searchParams.get('difficulty') === 'medium' ? 2 : 1) && (
                     <div className="w-full h-full bg-arkumen-gold"></div>
                   )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
               <Zap size={10} className="text-arkumen-gold" />
               <span className="hud-label">ROYALTY ACCUMULATED</span>
            </div>
            <motion.span 
              key={score}
              initial={{ scale: 1.1, color: '#D4AF37' }}
              animate={{ scale: 1, color: '#D4AF37' }}
              className="font-display text-[18px] tracking-[0.1em] leading-none"
            >
              {score.toLocaleString()}
            </motion.span>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto pt-32 px-6 space-y-12">
        {/* Arena Progress - New Visualizer */}
        <div className="space-y-4">
          <div className="flex justify-between items-baseline px-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-1">CURRENT REVELATION</span>
              <span className="font-display text-arkumen-gold text-[12px] tracking-widest">{currentIndex + 1} OF {questions.length}</span>
            </div>
            <div className="flex flex-col items-end">
               <span className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em] mb-1">STREAK</span>
               <div className="flex items-center gap-2">
                  {streak > 0 && <Sparkles size={12} className="text-arkumen-gold animate-bounce" />}
                  <span className="font-display text-white text-[14px]">{streak}</span>
               </div>
            </div>
          </div>
          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden relative">
            <motion.div 
              className="h-full bg-gradient-to-r from-arkumen-gold-dim via-arkumen-gold to-arkumen-gold-light"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
              transition={{ type: "spring", stiffness: 50, damping: 20 }}
            />
            {/* Step Markers */}
            <div className="absolute inset-0 flex justify-between px-0.5">
              {questions.map((_, i) => (
                <div key={i} className={clsx("w-[2px] h-full transition-colors", i <= currentIndex ? "bg-white/20" : "bg-white/5")} />
              ))}
            </div>
          </div>
        </div>

        {/* Question Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-12"
          >
            <div className="py-8 relative group">
              <div className="absolute -inset-4 bg-arkumen-gold/5 rounded-[2rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <motion.h2 
                className="question-text relative z-10 tracking-tight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                "{currentQuestion.text}"
              </motion.h2>
            </div>

            <div className="space-y-4">
              {currentQuestion.options.map((option, index) => {
                const label = String.fromCharCode(65 + index); // A, B, C...
                const isSelected = selectedAnswer === index;
                const isCorrect = index === currentQuestion.correctAnswer;
                const showResult = gameState === 'answered';

                return (
                  <button
                    key={index}
                    disabled={showResult}
                    onClick={() => handleAnswer(index)}
                    className={clsx(
                      "w-full option-card",
                      isSelected && !showResult && "border-arkumen-gold/40 bg-arkumen-gold/5",
                      showResult && isCorrect && "border-green-500/40 bg-green-500/5",
                      showResult && isSelected && !isCorrect && "border-red-500/40 bg-red-500/5"
                    )}
                  >
                    <div className={clsx(
                      "option-letter",
                      isSelected ? "bg-arkumen-gold/20 text-arkumen-gold border-arkumen-gold/30" : "group-hover:text-arkumen-gold group-hover:border-arkumen-gold/20"
                    )}>
                      {label}
                    </div>
                    <span className={clsx(
                      "option-text",
                      isSelected ? "text-white" : "text-slate-300 group-hover:text-white"
                    )}>
                      {option}
                    </span>
                  </button>
                );
              })}
            </div>

            {gameState === 'answered' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-4 space-y-4"
              >
                {selectedAnswer !== currentQuestion.correctAnswer && (
                  <div className="bg-slate-900/80 p-4 rounded-xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-0.5 h-full bg-arkumen-gold"></div>
                    <div className="flex items-center gap-2 text-arkumen-gold font-black text-[7px] uppercase tracking-[0.2em] mb-2">
                      <Sparkles size={10} /> THE REVELATION
                    </div>
                    <p className="text-slate-300 font-luxury italic text-sm leading-relaxed opacity-90">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                )}
                
                <div className="flex gap-3 justify-center">
                  {currentIndex > 0 && (
                    <button
                      onClick={prevQuestion}
                      className="btn-embroidery-secondary w-32"
                    >
                      PREVIOUS
                    </button>
                  )}
                  <button
                    onClick={nextQuestion}
                    className="btn-embroidery-primary w-40"
                  >
                    {currentIndex === questions.length - 1 ? 'FINALIZE TRIAL' : 'NEXT REVELATION'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
