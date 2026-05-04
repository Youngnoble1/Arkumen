import React, { useEffect, useState } from 'react';
import { Trophy, Medal, Crown, Star, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { db, OperationType, handleFirestoreError } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '../types';
import { clsx } from 'clsx';
import { useFirebase } from './FirebaseProvider';

const LeaderboardItem = React.memo(({ user, index, isCurrentPlayer }: { user: UserProfile, index: number, isCurrentPlayer: boolean }) => (
  <motion.div 
    key={user.uid}
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: Math.min(index * 0.05, 0.5) }}
    className={clsx(
      "arena-card p-4 flex items-center justify-between group transition-all",
      isCurrentPlayer ? "border-arkumen-gold/30 bg-arkumen-gold/5" : "border-white/5"
    )}
  >
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-center font-display text-slate-500 text-lg group-hover:border-arkumen-gold/40 group-hover:text-arkumen-gold transition-colors">
        {index + 4}
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-3">
           <h4 className="text-sm font-display text-white tracking-widest uppercase">{user.username}</h4>
           {isCurrentPlayer && <span className="text-[6px] bg-arkumen-gold text-slate-950 px-1 py-0.5 rounded font-black tracking-widest">YOU</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-slate-500 uppercase tracking-[0.2em] font-black">{user.rank}</span>
          <div className="w-1 h-1 rounded-full bg-slate-700"></div>
          <span className="text-[8px] text-arkumen-gold/60 uppercase tracking-[0.2em] font-black">{user.arkerTitle}</span>
        </div>
      </div>
    </div>

    <div className="text-right">
      <span className="text-lg font-display text-arkumen-gold tracking-tighter leading-none">{user.points.toLocaleString()}</span>
      <p className="text-[7px] text-slate-600 font-black uppercase tracking-[0.2em] mt-0.5 text-right">POINTS</p>
    </div>
  </motion.div>
));

export const Leaderboard: React.FC = () => {
  const { profile } = useFirebase();
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      orderBy('points', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => {
        users.push(doc.data() as UserProfile);
      });
      setTopUsers(users);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-arkumen-gold border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-mono text-sm tracking-widest text-center">SEARCHING LEADERBOARD...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-arkumen-bg pb-20">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#020617]/95 backdrop-blur-3xl px-6 py-5 flex items-center justify-between border-b border-white/5">
        <div className="flex flex-col">
          <span className="text-[8px] text-slate-500 font-black uppercase tracking-[0.4em] opacity-60">ASCENSION RECORD</span>
          <h1 className="text-arkumen-gold font-display text-sm tracking-widest uppercase">Hall of Immortals</h1>
        </div>
        <div className="flex items-center gap-2">
           <Trophy size={16} className="text-arkumen-gold opacity-50" />
           <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{topUsers.length} ARKERS</span>
        </div>
      </header>

      <main className="pt-28 px-6 max-w-md mx-auto space-y-10">
        {/* Legendary Top 3 */}
        <div className="grid grid-cols-3 gap-3 items-end pt-4">
           {topUsers.slice(0, 3).map((user, idx) => {
              const heights = ['h-32', 'h-40', 'h-36']; // 2, 1, 3
              const order = [1, 0, 2]; // index in topUsers array to show in [left, middle, right]
              const u = topUsers[order[idx]];
              if(!u) return null;
              
              const isFirst = order[idx] === 0;

              return (
                 <motion.div 
                   key={u.uid}
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: idx * 0.1 }}
                   className="flex flex-col items-center group"
                 >
                    <div className="relative mb-3">
                       <div className={clsx(
                         "w-14 h-14 rounded-2xl bg-slate-900 border-2 flex items-center justify-center overflow-hidden transition-transform group-hover:scale-110",
                         isFirst ? "border-arkumen-gold shadow-[0_0_20px_rgba(212,175,55,0.3)]" : "border-white/10"
                       )}>
                          {isFirst && (
                             <motion.div 
                               animate={{ rotate: 360 }}
                               transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                               className="absolute inset-0 border border-dashed border-arkumen-gold/40 rounded-full scale-150"
                             />
                          )}
                          <span className="text-arkumen-gold font-display text-xl">{u.username.substring(0, 1).toUpperCase()}</span>
                       </div>
                       <div className={clsx(
                         "absolute -bottom-2 translate-x-1/2 right-1/2 w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ring-4 ring-slate-950",
                         isFirst ? "bg-arkumen-gold text-slate-950" : "bg-slate-800 text-slate-400"
                       )}>
                          {order[idx] + 1}
                       </div>
                    </div>
                    <div className="text-center w-full">
                       <p className="text-[10px] font-display text-white truncate px-1 uppercase tracking-wider">{u.username}</p>
                       <p className="text-arkumen-gold font-bold text-xs mt-1">{u.points.toLocaleString()}</p>
                    </div>
                    <div className={clsx(
                      "w-full bg-slate-900/50 backdrop-blur-md rounded-t-xl border-x border-t border-white/5 mt-3 transition-all",
                      heights[idx],
                      isFirst ? "bg-arkumen-gold/5 border-arkumen-gold/20" : ""
                    )}>
                      {isFirst && (
                         <div className="h-full w-full flex items-center justify-center">
                            <Crown size={20} className="text-arkumen-gold opacity-20" />
                         </div>
                      )}
                    </div>
                 </motion.div>
              );
           })}
        </div>

        {/* The Remainder Scroll */}
        <div className="space-y-4">
          {topUsers.slice(3, 20).map((user, index) => (
            <LeaderboardItem 
              key={user.uid} 
              user={user} 
              index={index} 
              isCurrentPlayer={user.uid === profile?.uid} 
            />
          ))}
        </div>
      </main>
    </div>
  );
};
