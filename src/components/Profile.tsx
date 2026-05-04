import React from 'react';
import { LogOut, Shield, Award, Calendar, Zap, Target, TrendingUp, User as UserIcon, Sparkles, RotateCcw, CheckCircle2, Brain, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import { useFirebase } from './FirebaseProvider';
import { auth, googleProvider } from '../firebase';
import { signOut, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

export const Profile: React.FC = () => {
  const { user, profile, loading, isAuthReady, isGuest } = useFirebase();
  const navigate = useNavigate();

  const [connected, setConnected] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkConnection = async () => {
      try {
        const { getDocFromServer, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        await getDocFromServer(doc(db, 'test', 'connection'));
        setConnected(true);
      } catch (e) {
        setConnected(false);
      }
    };
    checkConnection();
  }, []);

  const handleSignOut = async () => {
    if (isGuest) {
      if (window.confirm("This will clear your guest progress. Continue?")) {
        localStorage.removeItem('arkumen_guest_profile');
        window.location.reload();
      }
    } else {
      await signOut(auth);
      navigate('/');
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-arkumen-gold border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-mono text-sm tracking-widest">ACCESSING THE RECORDS...</p>
      </div>
    );
  }

  const stats = [
    { label: 'Royalty Points', value: profile.points.toLocaleString(), icon: Zap, color: 'text-arkumen-gold' },
    { label: 'Highest Score', value: profile.highestScore.toLocaleString(), icon: Target, color: 'text-blue-500' },
    { label: 'Daily Streak', value: profile.dailyChallengeStreak || 0, icon: TrendingUp, color: 'text-orange-500' },
    { label: 'Rank Tier', value: profile.rank, icon: Award, color: 'text-purple-500' },
  ];

  return (
    <div className="min-h-screen bg-arkumen-bg pb-20">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/95 backdrop-blur-3xl px-6 py-5 flex items-center justify-between border-b border-white/5">
        <div className="flex flex-col">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] opacity-60">PERSONAL ARCHIVE</span>
          <h1 className="text-arkumen-gold font-display text-sm tracking-widest uppercase">The Arker Profile</h1>
        </div>
        <button 
          onClick={handleSignOut}
          className="hud-circle text-slate-500 hover:text-red-500 transition-colors"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="pt-28 px-6 max-w-lg mx-auto space-y-12">
        {/* Profile Details Header */}
        <section className="flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="w-32 h-32 rounded-[2.5rem] border-2 border-arkumen-gold p-1 bg-slate-900 shadow-[0_0_50px_rgba(212,175,55,0.2)] relative overflow-hidden group">
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 className="absolute inset-0 bg-arkumen-gold/5 animate-pulse"
               />
               <img 
                 src={user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} 
                 alt="Profile" 
                 className="w-full h-full rounded-[2.1rem] object-cover relative z-10 filter grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500"
                 referrerPolicy="no-referrer"
               />
               <div className="absolute inset-0 border-[10px] border-slate-950/20 z-20 pointer-events-none"></div>
            </div>
            
            <div className="absolute -bottom-2 translate-x-1/2 right-1/2 flex items-center gap-2 bg-slate-950 px-4 py-1.5 rounded-xl border border-white/10 shadow-2xl z-30">
               <div className={clsx(
                 "w-1.5 h-1.5 rounded-full",
                 connected === true ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"
               )} />
               <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em]">
                 {connected === true ? "ARK LINKED" : "OFFLINE RECORD"}
               </span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-4xl logo-text mb-1 lowercase">{profile.username}</h2>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] opacity-40">IDENTIFIED ELITE NOBLE</p>
            </div>
            
            <div className="inline-flex flex-col items-center">
              <span className="text-[7px] text-arkumen-gold/50 font-bold uppercase tracking-[0.3em] mb-1">ASCENSION TITLE</span>
              <div className="px-6 py-2 rounded-2xl bg-arkumen-gold text-slate-950 font-display text-[10px] tracking-[0.2em] uppercase shadow-[0_0_30px_rgba(212,175,55,0.3)]">
                {profile.arkerTitle}
              </div>
            </div>
          </div>
        </section>

        {/* Tactical Metrics Grid */}
        <section className="grid grid-cols-2 gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="arena-card p-5 flex flex-col gap-4 group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-800/30 border border-white/5 flex items-center justify-center group-hover:border-arkumen-gold/20 transition-colors">
                <stat.icon size={20} className={stat.color} />
              </div>
              <div>
                <p className="text-slate-500 text-[8px] font-black uppercase tracking-[0.2em] mb-1">{stat.label}</p>
                <p className="text-2xl font-bold text-white tracking-tighter">{stat.value}</p>
              </div>
              <div className="h-0.5 w-8 bg-arkumen-gold/20 group-hover:w-full transition-all duration-500"></div>
            </motion.div>
          ))}
        </section>

        {/* Achievements Segment */}
        <section className="arena-card p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
               <Sparkles className="text-arkumen-gold" size={18} />
               <h3 className="text-sm font-display text-white tracking-widest uppercase">Honors & Seals</h3>
            </div>
            <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.2em]">SYNCHRONIZED DATA</span>
          </div>
          
          <div className="grid grid-cols-4 gap-4">
            {[
              { id: 'novice', label: 'NOVICE', icon: Shield, active: true },
              { id: 'veteran', label: 'VETERAN', icon: Shield, active: false },
              { id: 'legendary', label: 'LEGEND', icon: Zap, active: false },
              { id: 'highscorer', label: 'ELITE', icon: Target, active: true },
              { id: 'streak', label: 'STREAK', icon: Zap, active: false },
              { id: 'daily', label: 'DAILY', icon: Calendar, active: false },
              { id: 'category', label: 'MASTER', icon: Award, active: true },
              { id: 'scholar', label: 'SCHOLAR', icon: Award, active: true },
            ].map((badge, i) => (
              <div key={i} className="flex flex-col items-center gap-2 group">
                <div className={clsx(
                  "w-12 h-12 rounded-xl flex items-center justify-center border transition-all relative overflow-hidden",
                  badge.active 
                    ? "bg-slate-800/50 border-arkumen-gold/40 text-arkumen-gold shadow-[0_0_15px_rgba(212,175,55,0.1)]" 
                    : "bg-slate-900/50 border-white/5 text-slate-800 opacity-20"
                )}>
                  <badge.icon size={22} className="relative z-10" />
                  {badge.active && (
                    <motion.div 
                      animate={{ opacity: [0.1, 0.3, 0.1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 bg-arkumen-gold/20"
                    />
                  )}
                </div>
                <span className={clsx(
                  "text-[7px] font-black uppercase tracking-[0.1em] text-center leading-tight",
                  badge.active ? "text-slate-400" : "text-slate-700"
                )}>{badge.label}</span>
              </div>
            ))}
          </div>
        </section>

        {isGuest && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-8 text-center bg-white text-slate-950 rounded-3xl space-y-4 shadow-[0_0_50px_rgba(255,255,255,0.1)]"
          >
            <Shield size={32} className="mx-auto" />
            <div className="space-y-1">
              <h4 className="text-lg font-display tracking-widest uppercase">Fragmented Archive</h4>
              <p className="text-[10px] font-medium leading-relaxed opacity-70">Linking your Google account will crystallize these records permanently into the source.</p>
            </div>
            <button 
              onClick={handleLogin}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-display text-[10px] tracking-[0.3em] uppercase hover:bg-slate-800 transition-all active:scale-95"
            >
              INITIALIZE SYNC
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
};
