import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trophy, Sparkles, Zap, BookOpen, Crown, HelpCircle, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFirebase } from './FirebaseProvider';
import { clsx } from 'clsx';

export const Home: React.FC = () => {
  const { profile, loading } = useFirebase();
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Easy');

  const arenas = [
    { id: 'initiation', title: "ARKUMEN TUTORIAL", description: "New here? Learn the ways of the Elite.", icon: Zap, tag: 'TUTORIAL', color: 'text-arkumen-gold' },
    { id: 'classic', title: "CLASSIC QUIZ", description: "18 levels of Arkers Elite revelations.", icon: Crown, color: 'text-arkumen-gold' },
    { id: 'blitz', title: "TIMED BLITZ", description: "2 minutes. Prove your mastery.", icon: Play, color: 'text-arkumen-gold' },
    { id: 'path', title: "ARKER'S PATH", description: "One life. Defy the fall.", icon: Sparkles, color: 'text-arkumen-gold' },
    { id: 'multiplayer', title: "BATTLE", description: "Compete with other Arkers.", icon: Trophy, tag: 'LIVE', color: 'text-arkumen-gold' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-16 h-16 border-4 border-arkumen-gold border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="metallic-gold font-gothic animate-pulse tracking-[0.3em] uppercase text-[12px] font-bold">Summoning revelation...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-10 pb-12">
      {/* Cinematic Logo Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-left space-y-1.5 pt-6"
      >
        <h1 className="text-4xl md:text-5xl logo-text block leading-none pt-2">ARKUMEN</h1>
        <div className="flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-gradient-to-r from-arkumen-gold/40 to-transparent"></div>
          <p className="subtitle-text">ARKERS ELITE QUIZ GAME</p>
        </div>
      </motion.div>

      {/* Difficulty Selector - Armed Status */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between px-1">
          <span className="section-heading">SELECT YOUR INTENSITY</span>
          <div className="flex gap-1">
            {[1, 2, 3].map((dot, i) => (
              <div key={i} className={clsx("w-1 h-1 rounded-full", i < (difficulty === 'Easy' ? 1 : difficulty === 'Medium' ? 2 : 3) ? "bg-arkumen-gold" : "bg-white/10")} />
            ))}
          </div>
        </div>
        <div className="flex justify-center gap-2 max-w-[280px] mx-auto">
          {(['Easy', 'Medium', 'Hard'] as const).map((level) => (
            <button
              key={level}
              onClick={() => {
                setDifficulty(level);
                // Subtle haptic-like scale effect
              }}
              className={clsx(
                "difficulty-btn flex-1 py-3 text-[10px] uppercase tracking-widest transition-all",
                difficulty === level
                  ? "bg-arkumen-gold text-slate-950 border-arkumen-gold/50 shadow-[0_0_30px_rgba(212,175,55,0.3)] scale-[1.02]" 
                  : "bg-slate-900/50 text-slate-500 border-white/5 hover:border-white/10"
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Active Arenas */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="section-heading">THE ACTIVE ARENAS</h3>
          <Sparkles size={14} className="text-arkumen-gold animate-pulse" />
        </div>

        <div className="space-y-4">
          {arenas.map((arena, i) => (
            <motion.div
              key={arena.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + (i * 0.1) }}
            >
              <Link 
                to={arena.id === 'multiplayer' ? '/battle' : `/quiz?mode=${arena.id}&difficulty=${difficulty.toLowerCase()}`}
                className="group block"
              >
                <div className="arena-card flex items-center p-6 border-white/5 bg-slate-900/40 backdrop-blur-sm overflow-hidden relative">
                  {/* Decorative background glow */}
                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-arkumen-gold/5 rounded-full blur-3xl group-hover:bg-arkumen-gold/10 transition-all"></div>
                  
                  <div className="flex items-center gap-6 relative z-10 w-full">
                    <div className="arena-icon-container bg-slate-800/50 border-white/5 group-hover:border-arkumen-gold/30 group-hover:shadow-[0_0_20px_rgba(212,175,55,0.15)] transition-all">
                      <arena.icon size={26} className={clsx(arena.color, "transition-transform group-hover:scale-110")} />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="arena-title group-hover:text-arkumen-gold-light transition-colors">{arena.title}</h4>
                        {arena.tag && (
                          <span className={clsx("arena-tag", arena.id === 'multiplayer' ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-arkumen-gold/20 text-arkumen-gold border border-arkumen-gold/30")}>
                            {arena.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-[12px] font-luxury italic opacity-70 group-hover:opacity-100 transition-opacity">{arena.description}</p>
                    </div>
                    <ArrowRight size={18} className="text-slate-600 group-hover:text-arkumen-gold group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer Insight */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="pt-6 border-t border-white/5 text-center px-4"
      >
        <p className="text-[10px] text-slate-500 font-medium italic opacity-60 leading-relaxed uppercase tracking-widest">
          "Boost Revelations Mastery"
        </p>
      </motion.div>
    </div>
  );
};
